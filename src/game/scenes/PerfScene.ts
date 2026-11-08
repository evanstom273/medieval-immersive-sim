import Phaser from 'phaser';
import { perfCommands, perfResultChannel, perfStatsChannel, type PerfCommand } from '../bridge';
import type { CharacterDef } from '../characters/Character';
import type { Temperament } from '../combat/combat';
import { PX_PER_METRE } from '../movement/tuning';
import { profiler, SECTIONS, summarise, toCsv } from '../perf/profiler';
import { SandboxScene, WORLD_H, WORLD_W } from './SandboxScene';

const M = PX_PER_METRE;
const TEST_SECONDS = 30;
const TEMPERAMENTS: Temperament[] = ['bold', 'wary', 'meek'];
const HAIR = [0x3b2416, 0x8a5a2b, 0x1f1a17, 0xb5a07a, 0x6b3b1f, 0x2a2a2a, 0xa8742f];

/**
 * Performance test: an open field, you, and as many people as you spawn, all
 * running the full game simulation (brains, senses, physics, drawing). The
 * HUD shows live timings; a 30 s test records every frame and exports a CSV.
 */
export class PerfScene extends SandboxScene {
  private spawned = 0;
  private statsTimer = 0;
  private testEndsAt: number | null = null;
  private unsubs: (() => void)[] = [];

  constructor() {
    super('perf');
  }

  protected cast(): CharacterDef[] {
    return [{ id: 'player', name: 'You', temperament: 'bold', palette: { tunic: 0x8a3b2e, hair: 0x3b2416 }, x: WORLD_W / 2, y: WORLD_H / 2 }];
  }

  /** An open field with a few scattered crates (so routes have something to go round). */
  protected buildWorld(solids: Phaser.Physics.Arcade.StaticGroup): void {
    const rng = this.rng;
    for (let i = 0; i < 18; i++) {
      const w = (1 + Math.floor(rng() * 2)) * M;
      const h = (1 + Math.floor(rng() * 2)) * M;
      const x = Math.floor((1 + rng() * (WORLD_W / M - 4)) ) * M;
      const y = Math.floor((1 + rng() * (WORLD_H / M - 4)) ) * M;
      if (Math.hypot(x - WORLD_W / 2, y - WORLD_H / 2) < 3 * M) continue;
      this.wall(solids, x, y, w, h, 0x7a6248, 0.9 * M, false);
    }
  }

  create(): void {
    super.create();
    profiler.enabled = true;

    // Time Arcade's physics step. (Arcade registered world.update as a scene UPDATE listener
    // before create(), so swap that listener for a timed one. The small post-step sync isn't timed.)
    const world = this.physics.world;
    const timedUpdate = (t: number, d: number) => {
      profiler.begin('physics');
      world.update(t, d);
      profiler.end('physics');
    };
    this.sys.events.off(Phaser.Scenes.Events.UPDATE, world.update, world);
    this.sys.events.on(Phaser.Scenes.Events.UPDATE, timedUpdate);
    this.unsubs.push(() => this.sys.events.off(Phaser.Scenes.Events.UPDATE, timedUpdate));

    const pre = () => profiler.begin('render');
    const post = () => {
      profiler.end('render');
      this.afterFrame();
    };
    this.game.events.on(Phaser.Core.Events.PRE_RENDER, pre);
    this.game.events.on(Phaser.Core.Events.POST_RENDER, post);
    this.unsubs.push(
      () => this.game.events.off(Phaser.Core.Events.PRE_RENDER, pre),
      () => this.game.events.off(Phaser.Core.Events.POST_RENDER, post),
      perfCommands.on((c) => this.onPerfCommand(c)),
    );
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.unsubs.forEach((u) => u());
      profiler.enabled = false;
    });
  }

  private onPerfCommand(c: PerfCommand): void {
    switch (c.kind) {
      case 'spawn':
        this.spawn(c.count);
        break;
      case 'setPeople': {
        // Total headcount, you included: spawn the difference, or remove the most recently spawned.
        const total = Math.max(1, Math.floor(c.total));
        if (total > this.characters.length) this.spawn(total - this.characters.length);
        else while (this.characters.length > total) this.removePerson(this.characters[this.characters.length - 1]);
        break;
      }
      case 'startTest':
        profiler.startRecording();
        this.testEndsAt = performance.now() + TEST_SECONDS * 1000;
        break;
      case 'cancelTest':
        profiler.stopRecording();
        this.testEndsAt = null;
        break;
    }
  }

  /** Spawn `count` people at random free spots, spread over the field. */
  private spawn(count: number): void {
    const nav = this.ensureNav();
    const rng = this.rng;
    for (let i = 0; i < count; i++) {
      const n = ++this.spawned;
      let at = null;
      for (let tries = 0; tries < 10 && !at; tries++) at = nav.nearestFree({ x: (0.05 + rng() * 0.9) * WORLD_W, y: (0.05 + rng() * 0.9) * WORLD_H }, 2 * M);
      if (!at) continue;
      const tunic = Phaser.Display.Color.HSLToColor(rng(), 0.35 + rng() * 0.3, 0.3 + rng() * 0.2).color;
      this.spawnPerson({
        id: `p${n}`,
        name: `Person ${n}`,
        temperament: TEMPERAMENTS[Math.floor(rng() * TEMPERAMENTS.length)],
        palette: { tunic, hair: HAIR[Math.floor(rng() * HAIR.length)] },
        x: at.x,
        y: at.y,
        facing: rng() * Math.PI * 2,
      });
    }
  }

  private heapMb(): number | null {
    const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
    return mem ? mem.usedJSHeapSize / 1048576 : null;
  }

  private afterFrame(): void {
    const sample = profiler.endFrame(this.characters.length, this.heapMb());
    if (!sample) return;

    if (this.testEndsAt !== null && performance.now() >= this.testEndsAt) {
      this.testEndsAt = null;
      const samples = profiler.stopRecording();
      const sum = summarise(samples);
      if (sum) {
        const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
        const csv = toCsv(samples, {
          test: `${TEST_SECONDS} s performance test`,
          date: new Date().toISOString(),
          people: this.characters.length,
          renderer: this.rendererName(),
          canvas: `${this.scale.width}x${this.scale.height} (device px)`,
          devicePixelRatio: window.devicePixelRatio,
          userAgent: navigator.userAgent,
          avg_fps: sum.avgFps.toFixed(1),
          low_1pct_fps: sum.low1Fps.toFixed(1),
          p95_frame_ms: sum.p95FrameMs.toFixed(2),
          ticks_per_sec: sum.ticksPerSec.toFixed(1),
        });
        perfResultChannel.emit({ filename: `perf-${this.characters.length}people-${stamp}.csv`, csv, summary: sum });
      }
    }

    this.statsTimer -= sample.frameMs;
    if (this.statsTimer > 0) return;
    this.statsTimer = 250;
    // Live numbers: the last second of frames.
    const recent = profiler.recent;
    let acc = 0;
    let from = recent.length;
    while (from > 0 && acc < 1000) acc += recent[--from].frameMs;
    const last = recent.slice(from);
    const sum = summarise(last);
    if (!sum) return;
    perfStatsChannel.emit({
      fps: sum.avgFps,
      low1Fps: sum.low1Fps,
      frameMs: sum.avgFrameMs,
      maxFrameMs: sum.maxFrameMs,
      ticksPerSec: sum.ticksPerSec,
      people: this.characters.length,
      heapMb: sample.heapMb,
      sections: Object.fromEntries(SECTIONS.map((s) => [s, sum.avgMs[s]])),
      recentFrameMs: recent.slice(-120).map((s) => s.frameMs),
      testLeft: this.testEndsAt === null ? null : Math.max(0, (this.testEndsAt - performance.now()) / 1000),
      renderer: this.rendererName(),
    });
  }

  private rendererName(): string {
    return this.game.renderer.type === Phaser.WEBGL ? 'WebGL' : 'Canvas';
  }
}
