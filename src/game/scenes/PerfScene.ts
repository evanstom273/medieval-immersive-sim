import Phaser from 'phaser';
import { perfCommands, perfResultChannel, perfStatsChannel, type PerfCommand } from '../bridge';
import type { CharacterDef } from '../characters/Character';
import type { Temperament } from '../combat/combat';
import { PX_PER_METRE } from '../movement/tuning';
import { profiler, SECTIONS, summarise, toCsv } from '../perf/profiler';
import { detailSettings } from '../sim/detail';
import { SandboxScene, type WorldSize } from './SandboxScene';

const M = PX_PER_METRE;
const TEST_SECONDS = 30;
const TEMPERAMENTS: Temperament[] = ['bold', 'wary', 'meek'];
/** The test field: village-sized, so most people can be off screen. */
const FIELD_W = 240 * M;
const FIELD_H = 160 * M;
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

  protected world(): WorldSize {
    // A coarser grid than the sandbox's: the field is 34× bigger, and it's open ground.
    return { w: FIELD_W, h: FIELD_H, cell: 16 };
  }

  protected cast(): CharacterDef[] {
    return [{ id: 'player', name: 'You', temperament: 'bold', palette: { tunic: 0x8a3b2e, hair: 0x3b2416 }, x: FIELD_W / 2, y: FIELD_H / 2 }];
  }

  /** A big open field (240 × 160 m) with scattered crates (so routes have something to go round). */
  protected buildWorld(solids: Phaser.Physics.Arcade.StaticGroup): void {
    const rng = this.rng;
    // About one crate per 150 m².
    const crates = Math.round((FIELD_W / M) * (FIELD_H / M) / 150);
    for (let i = 0; i < crates; i++) {
      const w = (1 + Math.floor(rng() * 2)) * M;
      const h = (1 + Math.floor(rng() * 2)) * M;
      const x = Math.floor(1 + rng() * (FIELD_W / M - 4)) * M;
      const y = Math.floor(1 + rng() * (FIELD_H / M - 4)) * M;
      if (Math.hypot(x - FIELD_W / 2, y - FIELD_H / 2) < 3 * M) continue;
      this.wall(solids, x, y, w, h, 0x7a6248, 0.9 * M, false);
    }
  }

  create(): void {
    super.create();
    profiler.enabled = true;

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
      case 'setLod':
        detailSettings.offscreenLod = c.on;
        break;
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
      for (let tries = 0; tries < 10 && !at; tries++) at = nav.nearestFree({ x: (0.02 + rng() * 0.96) * FIELD_W, y: (0.02 + rng() * 0.96) * FIELD_H }, 2 * M);
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
    const sample = profiler.endFrame(this.characters.length, this.heapMb(), this.fullDetailCount());
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
          offscreen_lod: detailSettings.offscreenLod ? 'on' : 'off',
          field: `${FIELD_W / M} x ${FIELD_H / M} m`,
          canvas: `${this.scale.width}x${this.scale.height} (device px)`,
          devicePixelRatio: window.devicePixelRatio,
          userAgent: navigator.userAgent,
          avg_fps: sum.avgFps.toFixed(1),
          low_1pct_fps: sum.low1Fps.toFixed(1),
          p95_frame_ms: sum.p95FrameMs.toFixed(2),
          ticks_per_sec: sum.ticksPerSec.toFixed(1),
        });
        perfResultChannel.emit({ filename: `perf-${this.characters.length}people-lod${detailSettings.offscreenLod ? 'on' : 'off'}-${stamp}.csv`, csv, summary: sum });
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
      fullDetail: sample.fullDetail,
      lod: detailSettings.offscreenLod,
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
