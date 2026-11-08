import Phaser from 'phaser';
import {
  hudChannel,
  menuChannel,
  messageChannel,
  rosterChannel,
  uiCommands,
  type MenuState,
  type RosterMember,
  type UiCommand,
} from '../bridge';
import { CameraRig } from '../camera/CameraRig';
import type { World } from '../characters/Brain';
import { BODY_RADIUS, Character, type CharacterDef, type Targetable } from '../characters/Character';
import { HIT_OPINION, MAX_HEALTH, PUNCH_DAMAGE, TEMPERAMENTS } from '../combat/combat';
import { inputSourceChannel, touchCommands, touchStick, type InputSource, type TouchCommand } from '../input/touchInput';
import { speedOf, stepMotor, toggleCrouch, type MotorInput } from '../movement/motor';
import { PX_PER_METRE, tuning } from '../movement/tuning';
import { MoveOrder } from '../navigation/MoveOrder';
import { describeMemory, type MemoryKind } from '../perception/memory';
import { SCENT, smellStrength, type SmellSource } from '../perception/scents';
import { footstepLoudness, LOUDNESS, SIGHT, type NoiseKind } from '../perception/senseRules';
import { Senses, type Perception, type SensesHost } from '../perception/Senses';
import { NavGrid, type Obstacle, type Point } from '../navigation/NavGrid';
import { Relationships, opinionWord } from '../social/relationships';
import { REACTION_ICON, SOCIAL_ACTIONS, describeSocial, resolveSocial, socialAction, type SocialActionId } from '../social/socialActions';
import { between, createRng, type Rng } from '../util/rng';
import { handOffset, PUNCH_EXTEND, PUNCH_TOTAL, type Hand } from '../world/CharacterView';
import { Chest, Door, Sign, type InteractContext, type Interactable, type MenuOption } from '../world/interactables';

/**
 * PLACEHOLDER sandbox: a field, a small house with a door, a chest, a sign,
 * obstacles, a training dummy, and four people who live their own (very
 * simple) lives until you take control of one of them.
 */

const WORLD_W = 2560;
const WORLD_H = 1792;
const M = PX_PER_METRE;
/** How far from the body's centre a character can reach to use something. */
const REACH = 0.95 * M;
const LOCK_RANGE = 6 * M;
const LOCK_BREAK = 10 * M;
const HOLD_TO_FOLLOW_MS = 180;
const FOLLOW_REPLAN_MS = 100;
const CAMERA_FOLLOW = 10;
/** Conversations happen at about arm's length. */
const SOCIAL_REACH = 1.15 * M;
const SOCIAL_RESOLVE_MS = 900;
const SOCIAL_END_MS = 2600;
const YIELD_MS = 25000;
const KO_MS = 15000;

const KEY = Phaser.Input.Keyboard.KeyCodes;

const CAST: CharacterDef[] = [
  { id: 'edric', name: 'Edric', temperament: 'bold', palette: { tunic: 0x8a3b2e, hair: 0x3b2416 }, x: 760, y: 900 },
  { id: 'agnes', name: 'Agnes', temperament: 'meek', palette: { tunic: 0x3e5f8a, hair: 0x8a5a2b }, x: 880, y: 1000 },
  { id: 'maud', name: 'Maud', temperament: 'wary', palette: { tunic: 0x4f7a3a, hair: 0x1f1a17 }, x: 680, y: 1060 },
  { id: 'wat', name: 'Wat', temperament: 'bold', palette: { tunic: 0xb08a3a, hair: 0xb5a07a }, x: 980, y: 860 },
];

interface Dummy extends Targetable {
  view: Phaser.GameObjects.Graphics;
  hits: number;
}

type OpenMenu = { kind: 'character'; target: Character } | { kind: 'object'; target: Interactable } | { kind: 'self' };

export class SandboxScene extends Phaser.Scene implements World, SensesHost {
  readonly characters: Character[] = [];
  readonly interactables: Interactable[] = [];
  readonly relationships = new Relationships();
  readonly rng: Rng = createRng(1347);
  readonly rig = new CameraRig();
  private active!: Character;

  private keys!: Record<
    'up' | 'down' | 'left' | 'right' | 'sprint' | 'crouch' | 'combat' | 'lock' | 'talk' | 'debug' | 'senses' | 'esc' | 'one' | 'two' | 'three' | 'four',
    Phaser.Input.Keyboard.Key
  >;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private nav = new NavGrid(WORLD_W, WORLD_H, 8);
  private navDirty = true;
  private doors: Door[] = [];
  private dummy!: Dummy;
  private inputSource: InputSource = 'mouse';
  private hovered: Interactable | null = null;
  private hoveredChar: Character | null = null;
  private menu: OpenMenu | null = null;
  /** Mouse button / finger held on the ground (hold-to-follow). */
  private press: { since: number; lastPlan: number; point: Point; touch: boolean } | null = null;
  private routeGfx!: Phaser.GameObjects.Graphics;
  private lockRing!: Phaser.GameObjects.Graphics;
  private markerFade: { x: number; y: number; t: number } | null = null;
  private cameraFocus: { x: number; y: number } | null = null;
  private lockedNoticeAt = -Infinity;
  senses!: Senses;
  /** Walls etc. that block sight and muffle sound (not inflated, unlike the nav grid). */
  private sightBlockers: Obstacle[] = [];
  private sightGrid = new NavGrid(WORLD_W, WORLD_H, 8);
  private footstepTimer = new Map<string, number>();
  private sensesOverlay = false;
  private overlayGfx!: Phaser.GameObjects.Graphics;
  private pendingSmells: SmellSource[] = [];
  private fire!: { x: number; y: number; flames: Phaser.GameObjects.Graphics; smokeTimer: number };
  private midden!: { x: number; y: number; flies: Phaser.GameObjects.Graphics };
  private hitNoticeAt = -Infinity;
  private hudTimer = 0;
  private rosterTimer = 0;

  constructor() {
    super('sandbox');
  }

  get now(): number {
    return this.time.now;
  }

  // ================================================================ setup

  create(): void {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBackgroundColor('#5d6b45');

    this.drawGround();
    this.solids = this.physics.add.staticGroup();
    this.buildWorld(this.solids);

    for (const def of CAST) this.characters.push(new Character(this, def));
    const objs = this.characters.map((c) => c.obj);
    this.physics.add.collider(objs, this.solids);
    this.physics.add.collider(objs, objs);

    // Everyone starts with mild, varied opinions of everyone else.
    for (const a of this.characters) {
      for (const b of this.characters) {
        if (a !== b) this.relationships.set(a.id, b.id, Math.round(between(this.rng, -10, 35)));
      }
    }

    this.active = this.characters[0];
    this.active.controlled = true;
    for (const c of this.characters) c.brain.reset(this.now + this.rng() * 1500);

    this.sightGrid.build(this.sightBlockers, 0);
    this.senses = new Senses(this);
    this.senses.smells.push(...this.pendingSmells);
    this.overlayGfx = this.add.graphics().setDepth(90);

    this.lockRing = this.add.graphics().setDepth(16);
    this.routeGfx = this.add.graphics().setDepth(5);

    // Draw everyone and move the camera AFTER physics has moved bodies this frame.
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.lateUpdate, this);
    this.setupInput();
    this.say(this.inputSource === 'touch' ? 'Tap someone to interact. Tap a portrait to switch.' : 'Click someone to interact. 1–4 switches who you control.');
  }

  private drawGround(): void {
    const g = this.add.graphics().setDepth(0);
    for (let x = 0; x <= WORLD_W; x += M) {
      g.lineStyle(1, 0x000000, (x / M) % 5 === 0 ? 0.16 : 0.06);
      g.lineBetween(x, 0, x, WORLD_H);
    }
    for (let y = 0; y <= WORLD_H; y += M) {
      g.lineStyle(1, 0x000000, (y / M) % 5 === 0 ? 0.16 : 0.06);
      g.lineBetween(0, y, WORLD_W, y);
    }
  }

  private wall(solids: Phaser.Physics.Arcade.StaticGroup, x: number, y: number, w: number, h: number, colour = 0x8c8475): void {
    this.sightBlockers.push({ kind: 'rect', x, y, w, h });
    const r = this.add.rectangle(x + w / 2, y + h / 2, w, h, colour).setStrokeStyle(2, 0x2c2822).setDepth(10);
    this.physics.add.existing(r, true);
    solids.add(r);
  }

  private buildWorld(solids: Phaser.Physics.Arcade.StaticGroup): void {
    // House: 8 m × 6 m, 0.3 m walls, 1 m doorway in the south wall.
    const hx = 1152;
    const hy = 576;
    const hw = 512;
    const hh = 384;
    const t = 20;
    const doorX = hx + 224;
    const doorW = 64;
    this.add.rectangle(hx + hw / 2, hy + hh / 2, hw, hh, 0x8a7356).setDepth(1);
    this.wall(solids, hx, hy, hw, t);
    this.wall(solids, hx, hy, t, hh);
    this.wall(solids, hx + hw - t, hy, t, hh);
    this.wall(solids, hx, hy + hh - t, doorX - hx, t);
    this.wall(solids, doorX + doorW, hy + hh - t, hx + hw - (doorX + doorW), t);

    const door = new Door(this, doorX, hy + hh - t / 2, doorW, 10);
    this.doors.push(door);
    const chest = new Chest(this, solids, hx + hw - 90, hy + 70, 56, 36);
    const sign = new Sign(this, solids, 920, 760, 'Movement test. Mind the dummy.');
    this.interactables.push(door, chest, sign);

    for (const [cx, cy] of [
      [640, 512],
      [688, 512],
      [640, 560],
    ]) {
      this.wall(solids, cx, cy, 46, 46, 0x9b7a4c);
    }

    const well = this.add.circle(512, 1280, 44, 0x7f7a70).setStrokeStyle(3, 0x2c2822).setDepth(10);
    this.physics.add.existing(well, true);
    (well.body as Phaser.Physics.Arcade.StaticBody).setCircle(44);
    solids.add(well);
    this.add.circle(512, 1280, 28, 0x1f2a33).setDepth(11);

    // Cooking fire: people catch the smell of smoke and drift over to warm themselves.
    const fx = 760;
    const fy = 1400;
    const fireBody = this.add.circle(fx, fy, 24).setVisible(false);
    this.physics.add.existing(fireBody, true);
    (fireBody.body as Phaser.Physics.Arcade.StaticBody).setCircle(24);
    solids.add(fireBody);
    const ring = this.add.graphics({ x: fx, y: fy }).setDepth(10);
    ring.fillStyle(0x000000, 0.2);
    ring.fillCircle(2, 2, 28);
    ring.fillStyle(0x2a2420, 1);
    ring.fillCircle(0, 0, 20);
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      ring.fillStyle(i % 2 ? 0x8a857c : 0x77726a, 1);
      ring.lineStyle(1.5, 0x2c2822, 1);
      ring.fillCircle(Math.cos(a) * 22, Math.sin(a) * 22, 6);
      ring.strokeCircle(Math.cos(a) * 22, Math.sin(a) * 22, 6);
    }
    ring.fillStyle(0x5a3a22, 1);
    ring.fillRect(-14, -3, 28, 6);
    ring.fillRect(-3, -14, 6, 28);
    this.fire = { x: fx, y: fy, flames: this.add.graphics({ x: fx, y: fy }).setDepth(12), smokeTimer: 0 };
    this.pendingSmells.push({ id: 'fire', kind: 'smoke', x: fx, y: fy, radius: 10 * M, pleasant: true });

    // Midden: a dung heap. People wrinkle their noses and don't hang about.
    const mx = 1980;
    const my = 1180;
    const heap = this.add.graphics({ x: mx, y: my }).setDepth(2);
    heap.fillStyle(0x000000, 0.15);
    heap.fillEllipse(3, 4, 120, 80);
    heap.fillStyle(0x4a3a24, 1);
    heap.fillEllipse(0, 0, 112, 72);
    heap.fillStyle(0x5c4a2c, 1);
    heap.fillEllipse(-14, -8, 64, 40);
    heap.fillStyle(0x3a2c1a, 1);
    heap.fillEllipse(18, 10, 44, 26);
    heap.lineStyle(1.5, 0xb59a5a, 0.8);
    for (let i = 0; i < 10; i++) {
      const a = i * 2.4;
      heap.lineBetween(Math.cos(a) * 30, Math.sin(a) * 18, Math.cos(a) * 30 + 8, Math.sin(a) * 18 - 3);
    }
    this.midden = { x: mx, y: my, flies: this.add.graphics({ x: mx, y: my }).setDepth(30) };
    this.pendingSmells.push({ id: 'midden', kind: 'dung', x: mx, y: my, radius: 5 * M, pleasant: false });

    this.wall(solids, 1408, 1344, 320, 24, 0x6f6a5f);
    this.wall(solids, 1408 + 320 + 48, 1344, 320, 24, 0x6f6a5f);

    const dx = 1024;
    const dy = 1216;
    const dummyBody = this.add.circle(dx, dy, 14).setVisible(false);
    this.physics.add.existing(dummyBody, true);
    (dummyBody.body as Phaser.Physics.Arcade.StaticBody).setCircle(14);
    solids.add(dummyBody);
    const view = this.add.graphics({ x: dx, y: dy }).setDepth(15);
    this.dummy = { name: 'the training dummy', x: dx, y: dy, radius: 14, view, hits: 0, isTargetable: () => true };
    this.drawDummy(false);
  }

  private drawDummy(flash: boolean): void {
    const g = this.dummy.view;
    g.clear();
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(2, 2, 26, 50);
    g.lineStyle(2, 0x231a12, 1);
    g.fillStyle(flash ? 0xf0dca0 : 0xc9a65f, 1);
    g.fillRect(-4, -24, 8, 48);
    g.strokeRect(-4, -24, 8, 48);
    g.fillCircle(0, 0, 14);
    g.strokeCircle(0, 0, 14);
    g.fillStyle(0x6b4a2b, 1);
    g.fillCircle(0, 0, 4);
  }

  private setupInput(): void {
    const kb = this.input.keyboard!;
    this.keys = kb.addKeys(
      {
        up: KEY.W,
        down: KEY.S,
        left: KEY.A,
        right: KEY.D,
        sprint: KEY.CTRL,
        crouch: KEY.SHIFT,
        combat: KEY.R,
        lock: KEY.F,
        talk: KEY.E,
        debug: KEY.F3,
        senses: KEY.F4,
        esc: KEY.ESC,
        one: KEY.ONE,
        two: KEY.TWO,
        three: KEY.THREE,
        four: KEY.FOUR,
      },
      true,
    ) as typeof this.keys;

    // Registered after Phaser's own listener (Phaser ignores already-prevented events).
    const guard = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['w', 'a', 's', 'd', 'r', 'f', 'e', '1', '2', '3', '4'].includes(e.key.toLowerCase())) e.preventDefault();
      if (e.key === 'F3' || e.key === 'F4') e.preventDefault();
    };
    window.addEventListener('keydown', guard);
    this.game.events.on(Phaser.Core.Events.BLUR, () => kb.resetKeys());
    this.input.mouse?.disableContextMenu();
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.onPointerDown(p));

    const canvas = this.game.canvas;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      this.rig.zoomBy(Math.exp(Phaser.Math.Clamp(px, -200, 200) * 0.0015));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    this.inputSource = inputSourceChannel.last ?? 'mouse';
    const offs = [
      touchCommands.on((c) => this.onTouchCommand(c)),
      uiCommands.on((c) => this.onUiCommand(c)),
      inputSourceChannel.on((src) => {
        this.inputSource = src;
        if (src === 'touch') this.clearHover();
      }),
    ];
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      window.removeEventListener('keydown', guard);
      canvas.removeEventListener('wheel', onWheel);
      offs.forEach((off) => off());
    });
  }

  // ================================================================ input → active character

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (p.wasTouch) return; // touch goes through the touch layer
    if (this.inputSource !== 'mouse') inputSourceChannel.emit('mouse');
    if (p.middleButtonDown()) {
      this.toggleLock();
      return;
    }
    if (this.active.status === 'ko') return;
    if (this.active.mode === 'combat') {
      if (p.leftButtonDown()) this.punch(this.active, 'right');
      else if (p.rightButtonDown()) this.punch(this.active, 'left');
      return;
    }
    if (!p.leftButtonDown()) return;
    const world = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    this.pressAt(world.x, world.y, true, false);
  }

  private onTouchCommand(c: TouchCommand): void {
    const a = this.active;
    switch (c.kind) {
      case 'zoom':
        this.rig.zoomBy(c.factor);
        break;
      case 'toggleCrouch':
        a.motor = toggleCrouch(a.motor);
        break;
      case 'toggleCombat':
        this.toggleCombat();
        break;
      case 'toggleLock':
        this.toggleLock();
        break;
      case 'talk':
        this.talk();
        break;
      case 'punch':
        this.punch(a, c.hand);
        break;
      case 'tap':
      case 'press': {
        if (a.mode === 'combat' || a.status === 'ko') return;
        const w = this.cssToWorld(c.x, c.y);
        this.pressAt(w.x, w.y, c.kind === 'press', true);
        break;
      }
      case 'hold':
        if (this.press?.touch) this.press.point = this.cssToWorld(c.x, c.y);
        break;
      case 'release':
        if (this.press?.touch) this.press = null;
        break;
    }
  }

  private onUiCommand(c: UiCommand): void {
    switch (c.kind) {
      case 'switchTo':
        this.switchTo(c.id);
        break;
      case 'menuClose':
        this.closeMenu();
        break;
      case 'toggleSenses':
        this.sensesOverlay = !this.sensesOverlay;
        break;
      case 'menuChoice':
        this.chooseMenu(c.optionId);
        break;
    }
  }

  private dpr(): number {
    return this.scale.width / Math.max(1, this.game.canvas.clientWidth);
  }

  private cssToWorld(x: number, y: number): Point {
    const w = this.cameras.main.getWorldPoint(x * this.dpr(), y * this.dpr());
    return { x: w.x, y: w.y };
  }

  private worldToCss(p: Point): Point {
    const cam = this.cameras.main;
    const d = this.dpr();
    return { x: ((p.x - cam.worldView.x) * cam.zoom) / d, y: ((p.y - cam.worldView.y) * cam.zoom) / d };
  }

  /** Click/tap at a world point: a person or object opens its menu; the ground walks there. */
  private pressAt(x: number, y: number, hold: boolean, touch: boolean): void {
    const a = this.active;
    const who = this.characterAt(x, y);
    if (who) {
      if (who === a) this.openSelfMenu();
      else this.openCharacterMenu(who);
      return;
    }
    const obj = this.interactableAt(x, y);
    if (obj) {
      this.openMenu({ kind: 'object', target: obj }, obj.closestPoint(x, y), obj.name[0].toUpperCase() + obj.name.slice(1), undefined, obj.options());
      return;
    }
    if (a.status === 'yielded') this.standUp(a);
    a.social = null;
    if (this.orderToPoint(a, { x, y })) this.markerFade = null;
    if (hold) this.press = { since: this.now, lastPlan: this.now, point: { x, y }, touch };
  }

  private characterAt(x: number, y: number): Character | null {
    let best: Character | null = null;
    let bestD = Infinity;
    for (const c of this.characters) {
      const r = c.status === 'ko' ? 34 : BODY_RADIUS + 8;
      const d = Math.hypot(c.x - x, c.y - y);
      if (d <= r && d < bestD) {
        best = c;
        bestD = d;
      }
    }
    return best;
  }

  private interactableAt(x: number, y: number): Interactable | null {
    for (let i = this.interactables.length - 1; i >= 0; i--) {
      if (this.interactables[i].hitTest(x, y)) return this.interactables[i];
    }
    return null;
  }

  private toggleCombat(): void {
    const a = this.active;
    if (a.status !== 'ok') return;
    a.mode = a.mode === 'explore' ? 'combat' : 'explore';
    a.cancelOrder();
    a.social = null;
    this.press = null;
    a.pose.punch = { left: null, right: null };
    // Locks on people carry across; the dummy is only a combat target.
    if (a.mode === 'explore' && a.lockTarget === this.dummy) a.lockTarget = null;
    this.closeMenu();
  }

  /**
   * Lock onto the best target nearby, preferring what's in front. Again to release.
   * Works in and out of combat: out of combat it's people only, and you keep facing them.
   */
  private toggleLock(): void {
    const a = this.active;
    if (a.status !== 'ok') return;
    if (a.lockTarget) {
      a.lockTarget = null;
      return;
    }
    const people = this.characters.filter((c) => c !== a && c.isTargetable());
    a.lockTarget = this.bestTarget(a, a.mode === 'combat' ? [this.dummy, ...people] : people);
    if (!a.lockTarget) this.say(a.mode === 'combat' ? 'Nothing to lock on to.' : 'No one nearby to lock on to.');
  }

  /** Talk: open the menu for whoever you're locked on to, or the nearest person in front of you. */
  private talk(): void {
    const a = this.active;
    if (a.status === 'ko') return;
    const locked = a.lockTarget instanceof Character ? a.lockTarget : null;
    const target = locked ?? (this.bestTarget(a, this.characters.filter((c) => c !== a)) as Character | null);
    if (!target) {
      this.say('No one nearby to talk to.');
      return;
    }
    this.openCharacterMenu(target);
  }

  /** Closest target within range, weighted toward what's in front. */
  private bestTarget(a: Character, candidates: Targetable[]): Targetable | null {
    let best: Targetable | null = null;
    let bestScore = Infinity;
    for (const t of candidates) {
      const d = Math.hypot(t.x - a.x, t.y - a.y);
      if (d > LOCK_RANGE) continue;
      const off = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(t.y - a.y, t.x - a.x) - a.motor.facing));
      const score = d * (1 + off / Math.PI);
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    return best;
  }

  private switchTo(id: string): void {
    const next = this.characters.find((c) => c.id === id);
    if (!next || next === this.active) return;
    this.closeMenu();
    const prev = this.active;
    prev.controlled = false;
    prev.cancelOrder();
    prev.social = null;
    prev.mode = 'explore';
    prev.lockTarget = null;
    prev.brain.reset(this.now);
    this.press = null;

    next.controlled = true;
    next.cancelOrder();
    next.social = null;
    next.heldUntil = 0;
    next.mode = 'explore';
    next.lockTarget = null;
    next.brain.reset(this.now);
    this.active = next;
    this.markerFade = null;
    this.say(next.status === 'ko' ? `You are now ${next.name}, who is out cold.` : `You are now ${next.name}.`);
  }

  // ================================================================ menus

  private openMenu(menu: OpenMenu, at: Point, title: string, subtitle: string | undefined, options: MenuOption[]): void {
    this.closeMenu();
    if (!options.length) return;
    this.menu = menu;
    // Hold the person still while you decide what to do with them.
    if (menu.kind === 'character' && !menu.target.controlled) {
      menu.target.heldUntil = Infinity;
      menu.target.cancelOrder();
      menu.target.look = { angle: menu.target.angleTo(this.active), until: Infinity };
    }
    const css = this.worldToCss(at);
    const state: MenuState = { x: css.x, y: css.y, title, subtitle, options };
    menuChannel.emit(state);
  }

  private closeMenu(): void {
    const m = this.menu;
    if (!m) return;
    this.menu = null;
    if (m.kind === 'character' && m.target.heldUntil === Infinity) {
      m.target.heldUntil = 0;
      m.target.look = null;
    }
    menuChannel.emit(null);
  }

  private openCharacterMenu(target: Character): void {
    const a = this.active;
    const selfBad = a.status !== 'ok' ? "You're in no state" : null;
    const unavailable =
      target.status === 'ko'
        ? 'Out cold'
        : target.status === 'yielded'
          ? 'Cowering'
          : target.brain.state.kind === 'fight' || target.brain.state.kind === 'flee'
            ? 'Not now'
            : null;
    const options: MenuOption[] = [
      ...SOCIAL_ACTIONS.map((s) => ({ id: s.id, label: s.label, icon: s.icon, disabled: selfBad ?? unavailable ?? undefined })),
      { id: 'fight', label: 'Fight', icon: '👊', disabled: selfBad ?? (target.status === 'ko' ? 'Out cold' : undefined) },
      { id: 'control', label: 'Take control', icon: '👤' },
    ];
    const feels = opinionWord(this.relationships.opinion(target.id, a.id));
    const subtitle = `${TEMPERAMENTS[target.temperament].label} · ${feels} towards ${a.name}`;
    this.openMenu({ kind: 'character', target }, { x: target.x, y: target.y }, target.name, subtitle, options);
  }

  private openSelfMenu(): void {
    const a = this.active;
    if (a.status === 'ko') return;
    const options: MenuOption[] =
      a.status === 'yielded'
        ? [{ id: 'stand', label: 'Stand up', icon: '🧍' }]
        : [
            { id: 'yield', label: 'Yield', icon: '🏳️' },
            { id: 'sneak', label: a.motor.crouched ? 'Stop sneaking' : 'Sneak', icon: '🤫' },
          ];
    this.openMenu({ kind: 'self' }, { x: a.x, y: a.y }, a.name, 'You', options);
  }

  private chooseMenu(optionId: string): void {
    const m = this.menu;
    if (!m) return;
    this.closeMenu();
    const a = this.active;
    switch (m.kind) {
      case 'character':
        if (optionId === 'control') this.switchTo(m.target.id);
        else if (optionId === 'fight') {
          a.cancelOrder();
          a.social = null;
          a.mode = 'combat';
          a.lockTarget = m.target;
        } else this.startSocial(a, m.target, optionId as SocialActionId);
        break;
      case 'object':
        this.useObject(a, m.target, optionId);
        break;
      case 'self':
        if (optionId === 'yield') this.yieldTo(a, null);
        else if (optionId === 'stand') this.standUp(a);
        else if (optionId === 'sneak') a.motor = toggleCrouch(a.motor);
        break;
    }
  }

  // ================================================================ World: shared actions (player and AI)

  private ensureNav(): NavGrid {
    if (this.navDirty) {
      const obstacles: Obstacle[] = [];
      for (const child of this.solids.getChildren()) {
        const b = (child as Phaser.GameObjects.GameObject).body as Phaser.Physics.Arcade.StaticBody | null;
        if (!b || !b.enable) continue;
        if (b.isCircle) obstacles.push({ kind: 'circle', x: b.center.x, y: b.center.y, r: b.halfWidth });
        else obstacles.push({ kind: 'rect', x: b.x, y: b.y, w: b.width, h: b.height });
      }
      for (const door of this.doors) {
        const o = door.navObstacle();
        if (o) obstacles.push(o);
      }
      this.nav.build(obstacles, BODY_RADIUS + 2);
      this.navDirty = false;
    }
    return this.nav;
  }

  // ---------------------------------------------------------------- senses (SensesHost)

  get smells(): readonly SmellSource[] {
    return this.senses.smells;
  }

  sightClear(a: Point, b: Point): boolean {
    return this.sightGrid.lineClear(a, b) && !this.doors.some((d) => crosses(a, b, d.hingePoint(), d.latchPoint()));
  }

  wallsBetween(a: Point, b: Point): number {
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    const steps = Math.max(1, Math.ceil(len / 4));
    let walls = 0;
    let inside = false;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const blocked = this.sightGrid.isBlockedAt(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
      if (blocked && !inside) walls++;
      inside = blocked;
    }
    return walls + this.doors.filter((d) => crosses(a, b, d.hingePoint(), d.latchPoint())).length;
  }

  perceive(c: Character, p: Perception): void {
    if (!c.controlled) {
      c.brain.onPerceive(c, p, this);
      return;
    }
    // The character you control perceives (and remembers) too; they just don't act on their own.
    if (p.kind === 'stench') c.overhead.emote('🤢', this.now, 1400);
    if (p.kind === 'smelledBlood') c.overhead.emote('🩸', this.now, 1200);
  }

  noise(kind: NoiseKind, x: number, y: number, source?: Character, loudness?: number): void {
    this.senses.noise(kind, x, y, source, loudness);
  }

  witness(kind: MemoryKind, x: number, y: number, actor?: Character, target?: Character): void {
    this.senses.witness(kind, x, y, actor, target);
  }

  private bleed(c: Character, amount: number): void {
    for (let i = 0; i < amount; i++) {
      const a = this.rng() * Math.PI * 2;
      const r = this.rng() * 10;
      this.senses.scents.add({ kind: 'blood', x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r, strength: 1, fade: SCENT.bloodFade, owner: c.id });
    }
  }

  orderToPoint(c: Character, p: Point): boolean {
    const order = MoveOrder.plan(this.ensureNav(), c.pos(), { kind: 'point', x: p.x, y: p.y });
    if (!order) return false;
    c.order = order;
    c.onArrive = null;
    return true;
  }

  orderToCharacter(c: Character, target: Character, reach: number): boolean {
    return this.orderToReach(c, () => target.pos(), reach, null);
  }

  private orderToReach(c: Character, closest: (from: Point) => Point, reach: number, onArrive: (() => void) | null): boolean {
    const order = MoveOrder.plan(this.ensureNav(), c.pos(), { kind: 'reach', closest, reach });
    if (!order) return false;
    c.order = order;
    c.onArrive = onArrive;
    return true;
  }

  wanderPoint(c: Character, radius: number): Point | null {
    const nav = this.ensureNav();
    for (let i = 0; i < 6; i++) {
      const a = this.rng() * Math.PI * 2;
      const d = between(this.rng, 2 * M, radius);
      const p = nav.nearestFree({ x: c.x + Math.cos(a) * d, y: c.y + Math.sin(a) * d }, M);
      // Nobody chooses to stroll over to the dung heap.
      if (p && !this.senses.smells.some((s) => !s.pleasant && smellStrength(s, p.x, p.y) > 0)) return p;
    }
    return null;
  }

  useObject(c: Character, obj: Interactable, optionId: string): void {
    const doIt = () => {
      const p = obj.closestPoint(c.x, c.y);
      c.look = { angle: c.angleTo(p), until: this.now + 500 };
      const ctx: InteractContext = { say: (msg) => c.controlled && this.say(msg) };
      obj.perform(optionId, ctx);
      this.navDirty = true; // e.g. a door got locked
    };
    const p = obj.closestPoint(c.x, c.y);
    if (c.distanceTo(p) <= REACH) {
      doIt();
      return;
    }
    if (!this.orderToReach(c, (from) => obj.closestPoint(from.x, from.y), REACH, doIt) && c.controlled) {
      this.say("You can't find a way to reach that.");
    }
  }

  startSocial(c: Character, target: Character, action: SocialActionId): boolean {
    if (target === c || c.status !== 'ok') return false;
    if (target.status !== 'ok' || target.brain.state.kind === 'fight' || target.brain.state.kind === 'flee') {
      if (c.controlled) this.say(`${target.name} is in no state to talk.`);
      return false;
    }
    if (!target.controlled && target.heldUntil > this.now && target.heldUntil !== Infinity) {
      if (c.controlled) this.say(`${target.name} is busy.`);
      return false;
    }
    c.cancelOrder();
    c.mode = 'explore';
    c.lockTarget = null;
    c.social = { target, action, phase: 'approach', phaseAt: this.now, resolved: false, lastPlan: 0, giveUpAt: this.now + 10000 };
    return true;
  }

  punch(c: Character, hand: Hand): void {
    if (c.status !== 'ok' || c.mode !== 'combat') return;
    if (c.pose.punch[hand] !== null) return;
    c.pose.punch[hand] = 0;
  }

  yieldTo(c: Character, attacker: Character | null): void {
    if (c.status === 'ko') return;
    c.status = 'yielded';
    c.statusUntil = this.now + YIELD_MS;
    c.mode = 'explore';
    c.lockTarget = null;
    c.cancelOrder();
    c.social = null;
    c.overhead.setPersistent('🏳️');
    this.announce(`${c.name} yields${attacker ? ` to ${attacker.name}` : ''}.`, [c], true);
    this.witness('saw_yield', c.x, c.y, c, attacker ?? undefined);
  }

  private standUp(c: Character): void {
    const wasKo = c.status === 'ko';
    c.status = 'ok';
    c.overhead.setPersistent(null);
    if (wasKo) {
      c.body.checkCollision.none = false;
      c.health = Math.max(c.health, 20);
      this.announce(`${c.name} comes round.`, [c], true);
    }
    if (!c.controlled) c.brain.reset(this.now);
  }

  private knockOut(c: Character, by: Character | null): void {
    c.status = 'ko';
    c.statusUntil = this.now + KO_MS;
    c.health = 0;
    c.mode = 'explore';
    c.lockTarget = null;
    c.cancelOrder();
    c.social = null;
    c.body.setVelocity(0, 0);
    c.body.checkCollision.none = true;
    // Fall backwards, away from whoever hit them (the knocked-out pose lies head-first along facing).
    if (by) c.motor = { ...c.motor, facing: by.angleTo(c) };
    c.overhead.setPersistent('💫');
    this.announce(`${c.name} is knocked out${by ? ` by ${by.name}` : ''}.`, [c], true);
    this.witness('saw_ko', c.x, c.y, by ?? undefined, c);
    this.noise('thud', c.x, c.y, c);
    this.bleed(c, 3);
    if (c.controlled) this.say('You are out cold. Switch to someone else with 1–4 or the portraits.');
  }

  announce(message: string, involves: Character[], always = false): void {
    if (always || involves.includes(this.active)) this.say(message);
  }

  private say(message: string): void {
    messageChannel.emit(message);
  }

  // ================================================================ update

  update(time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    const k = this.keys;
    const a = this.active;

    if (Phaser.Input.Keyboard.JustDown(k.combat)) this.toggleCombat();
    if (Phaser.Input.Keyboard.JustDown(k.lock)) this.toggleLock();
    if (Phaser.Input.Keyboard.JustDown(k.talk)) this.talk();
    if (Phaser.Input.Keyboard.JustDown(k.crouch) && a.status === 'ok') a.motor = toggleCrouch(a.motor);
    if (Phaser.Input.Keyboard.JustDown(k.debug)) this.toggleDebug();
    if (Phaser.Input.Keyboard.JustDown(k.senses)) this.sensesOverlay = !this.sensesOverlay;
    if (Phaser.Input.Keyboard.JustDown(k.esc)) this.closeMenu();
    (['one', 'two', 'three', 'four'] as const).forEach((key, i) => {
      if (Phaser.Input.Keyboard.JustDown(k[key]) && this.characters[i]) this.switchTo(this.characters[i].id);
    });

    const pointer = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;

    // ---- the active character's input
    let manual = { x: (k.right.isDown ? 1 : 0) - (k.left.isDown ? 1 : 0), y: (k.down.isDown ? 1 : 0) - (k.up.isDown ? 1 : 0) };
    if (manual.x === 0 && manual.y === 0) manual = { ...touchStick.move };
    const hasManual = manual.x !== 0 || manual.y !== 0;
    if (hasManual && a.status !== 'ko') {
      a.cancelOrder();
      a.social = null;
      this.press = null;
      this.closeMenu();
      if (a.status === 'yielded') this.standUp(a);
    }
    if (this.press) {
      if (!this.press.touch) {
        if (!this.input.activePointer.leftButtonDown()) this.press = null;
        else this.press.point = { x: pointer.x, y: pointer.y };
      }
      if (this.press && time - this.press.since >= HOLD_TO_FOLLOW_MS) this.follow(time);
    }

    // ---- doors swing under their own weight, once per frame
    for (const door of this.doors) {
      const thud = door.update(dt);
      if (thud > 0) {
        this.doorThud(door, thud);
        const p = door.latchPoint();
        this.noise('door', p.x, p.y, undefined, LOUDNESS.door * Math.min(1, 0.4 + thud / 4));
      }
    }

    // ---- everyone
    for (const c of this.characters) {
      this.updateStatus(c, dt);
      if (c.status === 'ko') {
        c.body.setVelocity(0, 0);
        c.appliedKnock = { x: 0, y: 0 };
        this.updatePose(c, dt);
        continue;
      }
      this.pushDoors(c, dt, time);

      if (!c.controlled) c.brain.update(c, this);
      this.updateSocial(c);

      let move = { x: 0, y: 0 };
      let run = false;
      if (c.controlled && hasManual) move = manual;
      else {
        const o = this.stepOrder(c, dt);
        move = o.move;
        run = o.run;
      }
      const held = !c.controlled && c.heldUntil > time;
      if (held || c.status === 'yielded') move = { x: 0, y: 0 };

      if (c.lockTarget && (!c.lockTarget.isTargetable() || Math.hypot(c.lockTarget.x - c.x, c.lockTarget.y - c.y) > LOCK_BREAK)) {
        c.lockTarget = null;
      }
      let aimAngle: number | null = null;
      // Locked on (in or out of combat): keep facing them. Combat without a lock: face the mouse.
      if (c.lockTarget) aimAngle = c.angleTo(c.lockTarget);
      else if (c.mode === 'combat' && c.controlled && this.inputSource === 'mouse') aimAngle = c.angleTo(pointer);
      const sprintKey = c.controlled && (k.sprint.isDown || (touchStick.sprint && !c.motor.crouched));
      const input: MotorInput = {
        move,
        // Long point-and-click trips run too, unless sneaking. Only the sprint key breaks a sneak.
        sprint: sprintKey || (run && !c.motor.crouched),
        aimAngle,
        lookAngle: c.look && time < c.look.until ? c.look.angle : null,
      };
      // The body's velocity includes last frame's knockback; take that out before the motor uses it.
      const vx = c.body.velocity.x - c.appliedKnock.x;
      const vy = c.body.velocity.y - c.appliedKnock.y;
      c.motor = stepMotor({ ...c.motor, vx, vy }, input, tuning, dt);
      c.body.setVelocity(c.motor.vx + c.knock.x, c.motor.vy + c.knock.y);
      c.appliedKnock = { x: c.knock.x, y: c.knock.y };
      const decay = Math.exp(-12 * dt);
      c.knock.x *= decay;
      c.knock.y *= decay;

      this.updatePose(c, dt);
    }

    this.updateFootsteps(dt);
    this.senses.update(dt);
    this.updateHover(pointer.x, pointer.y);
    this.emitUi(dt);
  }

  private updateStatus(c: Character, dt: number): void {
    const now = this.now;
    if (c.status !== 'ok' && now >= c.statusUntil) this.standUp(c);
    if (c.status === 'ok' && c.health < MAX_HEALTH && now - c.lastHitAt > 8000) {
      c.health = Math.min(MAX_HEALTH, c.health + 2 * dt);
    }
    c.pose.hitFlash = Math.max(0, c.pose.hitFlash - dt);
  }

  private pushDoors(c: Character, dt: number, time: number): void {
    for (const door of this.doors) {
      const res = door.pushBy({ x: c.body.center.x, y: c.body.center.y, r: BODY_RADIUS }, dt, c.motor.crouched);
      const len = Math.hypot(res.pushX, res.pushY);
      if (len > 0) {
        c.obj.x += res.pushX;
        c.obj.y += res.pushY;
        const nx = res.pushX / len;
        const ny = res.pushY / len;
        const into = c.body.velocity.x * nx + c.body.velocity.y * ny;
        if (into < 0) c.body.velocity.set(c.body.velocity.x - nx * into, c.body.velocity.y - ny * into);
      }
      if (c.controlled && res.touched && door.isLocked && time - this.lockedNoticeAt > 2500) {
        this.lockedNoticeAt = time;
        this.say('The door is locked.');
      }
    }
  }

  /** Hold-to-follow: keep steering the active character's order toward the held point. */
  private follow(time: number): void {
    const press = this.press!;
    const a = this.active;
    if (time - press.lastPlan < FOLLOW_REPLAN_MS) return;
    press.lastPlan = time;
    if (a.order && a.order.goal.kind === 'point') a.order.retarget(this.ensureNav(), a.pos(), press.point);
    else this.orderToPoint(a, press.point);
    if (a.order) a.order.following = true;
  }

  private stepOrder(c: Character, dt: number): { move: Point; run: boolean } {
    const none = { move: { x: 0, y: 0 }, run: false };
    if (!c.order) return none;
    const st = c.order.step(c.pos(), dt);
    if (st.arrived) {
      if (c.controlled && c.order.goal.kind === 'point') this.markerFade = { ...c.order.destination, t: 0 };
      const cb = c.onArrive;
      c.cancelOrder();
      cb?.();
      return none;
    }
    if (st.stuck) {
      if (c.controlled && !c.order.following && !c.social) this.say('Something is in the way.');
      c.cancelOrder();
      return none;
    }
    return { move: st.move, run: st.run };
  }

  /** Conversations: walk up to them, then act and react. Same for the player and NPCs. */
  private updateSocial(c: Character): void {
    const s = c.social;
    if (!s) return;
    const t = s.target;
    const now = this.now;
    if (t.status !== 'ok' || c.status !== 'ok' || (s.phase === 'approach' && now > s.giveUpAt)) {
      if (c.controlled && s.phase === 'approach') this.say(`You couldn't get to ${t.name}.`);
      c.social = null;
      return;
    }
    if (s.phase === 'approach') {
      if (c.distanceTo(t) <= SOCIAL_REACH) {
        s.phase = 'perform';
        s.phaseAt = now;
        c.cancelOrder();
        if (!t.controlled) {
          t.cancelOrder();
          t.social = null;
          if (t.heldUntil !== Infinity) t.heldUntil = now + SOCIAL_END_MS;
        }
        c.overhead.emote(socialAction(s.action).icon, now, 1500);
      } else if (!c.order || now - s.lastPlan > 400) {
        s.lastPlan = now;
        this.orderToReach(c, () => t.pos(), SOCIAL_REACH * 0.9, null);
      }
      return;
    }
    // Performing: face each other.
    c.look = { angle: c.angleTo(t), until: now + 200 };
    if (!t.controlled) t.look = { angle: t.angleTo(c), until: now + 200 };
    if (!s.resolved && now - s.phaseAt >= SOCIAL_RESOLVE_MS) {
      s.resolved = true;
      const outcome = resolveSocial(s.action, this.relationships.opinion(t.id, c.id), t.temperament, this.rng);
      this.relationships.adjust(t.id, c.id, outcome.targetDelta);
      this.relationships.adjust(c.id, t.id, outcome.actorDelta);
      t.overhead.emote(REACTION_ICON[outcome.reaction], now, 1500);
      this.noise(socialAction(s.action).hostile ? 'quarrel' : 'talk', c.x, c.y, c);
      this.announce(describeSocial(s.action, c.name, t.name, outcome), [c, t]);
    }
    if (now - s.phaseAt >= SOCIAL_END_MS) c.social = null;
  }

  private updatePose(c: Character, dt: number): void {
    const pose = c.pose;
    pose.mode = c.mode;
    pose.crouched = c.motor.crouched;
    pose.state = c.status;
    pose.controlled = c.controlled;
    pose.highlighted = c === this.hoveredChar;
    const speed = speedOf(c.motor);
    pose.stridePhase += (speed * dt * Math.PI * 2) / (1.4 * M);
    pose.strideAmount = Phaser.Math.Clamp(speed / (tuning.sprintSpeed * M), 0, 1) * 0.6 + (speed > 1 ? 0.4 : 0);
    for (const hand of ['left', 'right'] as const) {
      const t = pose.punch[hand];
      if (t === null) continue;
      const next = t + dt;
      if (t < PUNCH_EXTEND && next >= PUNCH_EXTEND) this.resolvePunch(c, hand);
      pose.punch[hand] = next >= PUNCH_TOTAL ? null : next;
    }
  }

  private resolvePunch(c: Character, hand: Hand): void {
    const local = handOffset(hand, { ...c.pose, punch: { ...c.pose.punch, [hand]: PUNCH_EXTEND } });
    const f = c.motor.facing;
    const wx = c.x + local.x * Math.cos(f) - local.y * Math.sin(f);
    const wy = c.y + local.x * Math.sin(f) + local.y * Math.cos(f);
    for (const other of this.characters) {
      if (other === c || other.status === 'ko') continue;
      if (Math.hypot(wx - other.x, wy - other.y) <= BODY_RADIUS + 5) {
        this.hitCharacter(c, other, hand);
        return;
      }
    }
    const d = this.dummy;
    if (Math.hypot(wx - d.x, wy - d.y) <= d.radius + 6) {
      this.noise('thud', d.x, d.y, c, 4);
      d.hits++;
      if (c.controlled) this.say(`Your ${hand} hand hits the dummy. (${d.hits})`);
      this.drawDummy(true);
      this.time.delayedCall(90, () => this.drawDummy(false));
      const away = Math.atan2(d.y - c.y, d.x - c.x);
      this.tweens.add({ targets: d.view, x: d.x + Math.cos(away) * 4, y: d.y + Math.sin(away) * 4, duration: 60, yoyo: true });
    }
  }

  private hitCharacter(attacker: Character, victim: Character, hand: Hand): void {
    victim.health = Math.max(0, victim.health - PUNCH_DAMAGE[hand]);
    victim.lastHitAt = this.now;
    victim.pose.hitFlash = 0.12;
    const away = attacker.angleTo(victim);
    victim.knock = { x: Math.cos(away) * 160, y: Math.sin(away) * 160 };
    victim.social = null;
    if (victim.heldUntil !== Infinity) victim.heldUntil = 0;
    this.relationships.adjust(victim.id, attacker.id, HIT_OPINION);
    // Seen by anyone looking; heard by anyone else in earshot; a little blood is left behind.
    this.senses.attack(attacker, victim);
    this.noise('punch', victim.x, victim.y, attacker);
    if (this.rng() < 0.5) this.bleed(victim, 1);
    if (victim.health <= 0) {
      this.knockOut(victim, attacker);
      return;
    }
    if (victim.status === 'yielded') return; // they just take it
    if (!victim.controlled) victim.brain.onAttacked(victim, attacker, this);
    else if (this.now - this.hitNoticeAt > 4000) {
      this.hitNoticeAt = this.now;
      this.say(`${attacker.name} is hitting you!`);
    }
  }

  private updateHover(px: number, py: number): void {
    const canHover = this.inputSource === 'mouse' && this.active.mode === 'explore' && !this.menu;
    const char = canHover ? this.characterAt(px, py) : null;
    this.hoveredChar = char && char !== this.active ? char : null;
    const obj = canHover && !char ? this.interactableAt(px, py) : null;
    if (obj !== this.hovered) {
      this.hovered?.setHighlight(false);
      obj?.setHighlight(true);
      this.hovered = obj;
    }
    this.game.canvas.style.cursor = this.active.mode === 'combat' ? 'crosshair' : char || obj ? 'pointer' : 'default';
  }

  private clearHover(): void {
    this.hovered?.setHighlight(false);
    this.hovered = null;
    this.hoveredChar = null;
  }

  // ================================================================ UI feed

  private activityOf(c: Character): string {
    if (c.status === 'ko') return 'Out cold';
    if (c.status === 'yielded') return 'Yielding';
    if (c.social) {
      const verb = socialAction(c.social.action).label.toLowerCase();
      return c.social.phase === 'approach' ? `Going to ${verb} with ${c.social.target.name}` : `${socialAction(c.social.action).label} · ${c.social.target.name}`;
    }
    if (!c.controlled && c.heldUntil > this.now) return 'Talking';
    const b = c.brain.activity;
    if (!c.controlled && b) return b;
    if (c.mode === 'combat') return c.lockTarget ? `Squaring up to ${c.lockTarget.name}` : 'Ready to fight';
    if (c.order) return c.order.run ? 'Running' : 'Walking';
    return c.controlled ? 'Standing' : 'Idling';
  }

  /** Moving makes noise: louder running, none when sneaking. */
  private updateFootsteps(dt: number): void {
    for (const c of this.characters) {
      const loud = c.status === 'ok' ? footstepLoudness(c.motor.gait) : 0;
      if (loud <= 0) continue;
      const t = (this.footstepTimer.get(c.id) ?? 0) + dt;
      if (t >= 0.45) {
        this.footstepTimer.set(c.id, 0);
        this.noise('footsteps', c.x, c.y, c, loud);
      } else this.footstepTimer.set(c.id, t);
    }
  }

  /**
   * ? / ! over people who are noticing / have just noticed the character you
   * control. Only shown when being noticed matters: while sneaking or in a fight stance.
   */
  private awarenessIndicator(c: Character): '?' | '!' | null {
    const a = this.active;
    if (c === a || c.status === 'ko' || !(a.motor.crouched || a.mode === 'combat')) return null;
    if (this.senses.justNoticed(c, a)) return '!';
    const level = this.senses.awarenessOf(c, a);
    return level > 0.15 && level < 1 ? '?' : null;
  }

  private emitUi(dt: number): void {
    const a = this.active;
    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      hudChannel.emit({
        mode: a.mode,
        gait: a.motor.gait,
        crouched: a.motor.crouched,
        speed: speedOf(a.motor) / M,
        span: this.rig.span,
        locked: a.lockTarget !== null,
      });
    }
    this.rosterTimer -= dt;
    if (this.rosterTimer <= 0) {
      this.rosterTimer = 0.2;
      const members: RosterMember[] = this.characters.map((c) => ({
        id: c.id,
        name: c.name,
        colour: `#${c.palette.tunic.toString(16).padStart(6, '0')}`,
        health: Math.round(c.health),
        maxHealth: MAX_HEALTH,
        status: c.status,
        mode: c.mode,
        controlled: c.controlled,
        temperament: TEMPERAMENTS[c.temperament].label,
        temperamentNote: TEMPERAMENTS[c.temperament].description,
        activity: this.activityOf(c),
      }));
      rosterChannel.emit({
        members,
        activeId: a.id,
        memories: this.senses
          .memoriesOf(a)
          .recent(this.now, 5)
          .map(({ memory, confidence }) => ({
            text: describeMemory(memory, (id) => (id === a.id ? 'me' : (this.characters.find((c) => c.id === id)?.name ?? 'someone'))),
            sense: memory.sense,
            confidence,
            agoS: Math.round((this.now - memory.lastAt) / 1000),
          })),
        relationships: this.characters
          .filter((c) => c !== a)
          .map((c) => ({ id: c.id, name: c.name, mine: this.relationships.opinion(a.id, c.id), theirs: this.relationships.opinion(c.id, a.id) })),
      });
    }
  }

  // ================================================================ late update: drawing & camera

  private lateUpdate(time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    const cam = this.cameras.main;
    this.rig.update(dt);
    cam.setZoom(this.rig.rendererZoom(this.scale.width, this.scale.height, M));
    const screenScale = this.dpr() / cam.zoom;

    for (const c of this.characters) {
      c.view.update(c.x, c.y, c.motor.facing, c.pose);
      const showBar = c.health < MAX_HEALTH - 0.5 || c.mode === 'combat';
      c.overhead.setIndicator(this.awarenessIndicator(c));
      c.overhead.update(c.x, c.y, screenScale, time, c.health, MAX_HEALTH, showBar);
    }
    const a = this.active;
    this.drawLockRing(time);
    this.drawRoute(a, time, dt);
    this.drawFireAndFlies(time, dt);
    this.drawSensesOverlay(time);

    if (!this.cameraFocus) this.cameraFocus = { x: a.x, y: a.y };
    const k = 1 - Math.exp(-CAMERA_FOLLOW * dt);
    this.cameraFocus.x += (a.x - this.cameraFocus.x) * k;
    this.cameraFocus.y += (a.y - this.cameraFocus.y) * k;
    cam.centerOn(this.cameraFocus.x, this.cameraFocus.y);
  }

  private drawFireAndFlies(time: number, dt: number): void {
    const g = this.fire.flames;
    g.clear();
    for (let i = 0; i < 5; i++) {
      const f = Math.sin(time / (90 + i * 23) + i) * 0.5 + 0.5;
      const a = i * 1.3 + time / 700;
      g.fillStyle(i % 2 ? 0xf2a33a : 0xe0612c, 0.85);
      g.fillEllipse(Math.cos(a) * 5, Math.sin(a) * 5, 9 + f * 6, 9 + f * 6);
    }
    g.fillStyle(0xffe08a, 0.9);
    g.fillCircle(0, 0, 4 + Math.sin(time / 70) * 1.5);
    this.fire.smokeTimer += dt;
    if (this.fire.smokeTimer > 0.35) {
      this.fire.smokeTimer = 0;
      const puff = this.add.circle(this.fire.x + (this.rng() - 0.5) * 10, this.fire.y, 6, 0xbfb8ad, 0.35).setDepth(35);
      this.tweens.add({ targets: puff, x: puff.x + 30 + this.rng() * 20, y: puff.y - 40 - this.rng() * 20, scale: 3, alpha: 0, duration: 2200, onComplete: () => puff.destroy() });
    }
    const flies = this.midden.flies;
    flies.clear();
    flies.fillStyle(0x111111, 0.9);
    for (let i = 0; i < 6; i++) {
      const t = time / (300 + i * 37) + i * 2;
      flies.fillCircle(Math.cos(t) * (20 + i * 4), Math.sin(t * 1.3) * (12 + i * 3) - 10, 1.6);
    }
  }

  /** Debug overlay (F4 or the Tuning panel): vision cones, noises, scents, smells. */
  private drawSensesOverlay(time: number): void {
    const g = this.overlayGfx;
    g.clear();
    if (!this.sensesOverlay) return;
    const a = this.active;
    // Smell sources.
    for (const s of this.senses.smells) {
      g.lineStyle(2, s.pleasant ? 0xf2a33a : 0x7a8a3a, 0.5);
      g.strokeCircle(s.x, s.y, s.radius);
      g.fillStyle(s.pleasant ? 0xf2a33a : 0x7a8a3a, 0.06);
      g.fillCircle(s.x, s.y, s.radius);
    }
    // Scents: trails in the owner's colour, blood in red.
    for (const m of this.senses.scents.marks) {
      if (m.kind === 'blood') {
        g.fillStyle(0xb3121e, Math.min(0.9, m.strength));
        g.fillCircle(m.x, m.y, 4);
      } else {
        const owner = this.characters.find((c) => c.id === m.owner);
        g.fillStyle(owner?.palette.tunic ?? 0xffffff, m.strength * 0.6);
        g.fillCircle(m.x, m.y, 2.5);
      }
    }
    // Vision cones, clipped by walls, tinted by how aware they are of you.
    const rays = 28;
    for (const c of this.characters) {
      if (c.status === 'ko') continue;
      const aw = c === a ? 0 : this.senses.awarenessOf(c, a);
      const colour = c === a ? 0xffffff : aw >= 1 ? 0xe0574a : aw > 0.15 ? 0xe8c25a : 0x7fd47f;
      const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(c.x, c.y)];
      for (let i = 0; i <= rays; i++) {
        const ang = c.motor.facing - SIGHT.halfAngle + (i / rays) * SIGHT.halfAngle * 2;
        let r = 0;
        while (r < SIGHT.range && !this.sightGrid.isBlockedAt(c.x + Math.cos(ang) * r, c.y + Math.sin(ang) * r)) r += 8;
        pts.push(new Phaser.Math.Vector2(c.x + Math.cos(ang) * r, c.y + Math.sin(ang) * r));
      }
      g.fillStyle(colour, c === a ? 0.05 : 0.1);
      g.fillPoints(pts, true);
      g.lineStyle(1, colour, 0.35);
      g.strokePoints(pts, true);
      g.lineStyle(1, 0xffffff, 0.25);
      g.strokeCircle(c.x, c.y, SCENT.presenceRange * M);
    }
    // Noises: expanding rings out to how far they carry.
    for (const n of this.senses.recentNoises) {
      const t = (this.now - n.at) / 700;
      const colour = n.kind === 'punch' || n.kind === 'shout' ? 0xe0574a : n.kind === 'footsteps' ? 0xffffff : 0x8ab4f8;
      g.lineStyle(2, colour, 0.6 * (1 - t));
      g.strokeCircle(n.x, n.y, n.loudness * M * Math.min(1, 0.25 + t));
    }
    void time;
  }

  private drawLockRing(time: number): void {
    const g = this.lockRing;
    g.clear();
    const t = this.active.lockTarget;
    if (!t) return;
    const r = t.radius + 14 + Math.sin(time / 160) * 2;
    // Red in combat, soft cream otherwise.
    if (this.active.mode === 'combat') g.lineStyle(3, 0xe0574a, 0.9);
    else g.lineStyle(2.5, 0xf3e3b5, 0.8);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + time / 900;
      g.beginPath();
      g.arc(t.x, t.y, r, a - 0.45, a + 0.45);
      g.strokePath();
    }
  }

  /** Point-and-click feedback for the active character: route line and destination marker. */
  private drawRoute(a: Character, time: number, dt: number): void {
    const g = this.routeGfx;
    g.clear();
    const marker = (mx: number, my: number, alpha: number) => {
      const r = 9 + Math.sin(time / 180) * 1.5;
      g.lineStyle(2.5, 0xf3e3b5, 0.85 * alpha);
      g.strokeCircle(mx, my, r);
      g.fillStyle(0xf3e3b5, 0.6 * alpha);
      g.fillCircle(mx, my, 2.5);
    };
    if (a.order && !a.social) {
      g.lineStyle(2, 0xf3e3b5, 0.35);
      g.beginPath();
      g.moveTo(a.x, a.y);
      for (const p of a.order.path) g.lineTo(p.x, p.y);
      g.strokePath();
      if (a.order.goal.kind === 'point') marker(a.order.destination.x, a.order.destination.y, 1);
    } else if (this.markerFade) {
      this.markerFade.t += dt;
      const alpha = 1 - this.markerFade.t / 0.4;
      if (alpha <= 0) this.markerFade = null;
      else marker(this.markerFade.x, this.markerFade.y, alpha);
    }
  }

  /** A door hit its frame: a puff of dust at the latch (placeholder for sound/noise). */
  private doorThud(door: Door, speed: number): void {
    const p = door.latchPoint();
    const strength = Phaser.Math.Clamp(speed / 4, 0.25, 1);
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const puff = this.add.circle(p.x, p.y, 3 + Math.random() * 3 * strength, 0xd8cbb0, 0.55 * strength).setDepth(13);
      this.tweens.add({
        targets: puff,
        x: p.x + Math.cos(a) * 14 * strength,
        y: p.y + Math.sin(a) * 14 * strength,
        scale: 1.8,
        alpha: 0,
        duration: 380,
        ease: 'Quad.easeOut',
        onComplete: () => puff.destroy(),
      });
    }
  }

  private toggleDebug(): void {
    const world = this.physics.world;
    if (!world.debugGraphic) world.createDebugGraphic();
    world.drawDebug = !world.drawDebug;
    world.debugGraphic.setVisible(world.drawDebug);
    if (!world.drawDebug) world.debugGraphic.clear();
    world.debugGraphic.setDepth(100);
  }
}

/** Do segments a–b and c–d cross? */
function crosses(a: Point, b: Point, c: Point, d: Point): boolean {
  const o = (p: Point, q: Point, r: Point) => (q.x - p.x) * (r.y - p.y) - (q.y - p.y) * (r.x - p.x);
  const d1 = o(c, d, a);
  const d2 = o(c, d, b);
  const d3 = o(a, b, c);
  const d4 = o(a, b, d);
  return d1 * d2 < 0 && d3 * d4 < 0;
}
