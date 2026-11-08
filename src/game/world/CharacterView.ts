import Phaser from 'phaser';
import type { ControlMode } from '../bridge';
import { PX_PER_METRE } from '../movement/tuning';
import { ringOnGround, type Bounds } from '../view/draw';
import type { Projection, Pt } from '../view/projection';

/**
 * PLACEHOLDER characters in the simple, readable style of RimWorld / Prison
 * Architect: a body, a head and floating hands, no limbs or animation.
 *
 An upright figure facing one of 8 screen directions (the game is drawn in
 * ¾). Hands are placed at their exact positions on the ground plane (so aim
 * and punches stay precise) and drawn in front of or behind the body
 * depending on which side of it they're on.
 *
 * Layer order is body → head → hair → face, with hands slotted before or
 * after; held items and worn equipment would hang off the same anchors
 * (`handGround` for anything held, the head/body for anything worn).
 *
 * Drawing: each body part (legs, tunic, outline, belt, head, eyes, hair) is
 * drawn ONCE per facing into shared texture sheets, in white, and each person
 * is a handful of sprites tinted with their own colours. That's how sprite
 * art behaves, and it's far cheaper than redrawing vector shapes every frame
 * (which Phaser re-triangulates on the CPU every frame). Eight facings come
 * from five drawings plus mirroring.
 */

const M = PX_PER_METRE;

export type Hand = 'left' | 'right';
export type BodyState = 'ok' | 'yielded' | 'ko';

export const PUNCH_EXTEND = 0.09; // s to full extension
export const PUNCH_RETRACT = 0.17; // s back to guard
export const PUNCH_TOTAL = PUNCH_EXTEND + PUNCH_RETRACT;

const SKIN = 0xd9ab84;
const OUTLINE = 0x231a12;
const HIGHLIGHT = 0xf3e3b5;

export interface Palette {
  tunic: number;
  hair: number;
}

export interface CharacterPose {
  mode: ControlMode;
  crouched: boolean;
  /** Distance-based stride phase, radians. */
  stridePhase: number;
  /** 0..1 how much the arms swing (scales with speed). */
  strideAmount: number;
  /** Punch timers in seconds since the punch started, or null. */
  punch: Record<Hand, number | null>;
  state: BodyState;
  /** Seconds left on the white hit flash. */
  hitFlash: number;
  highlighted: boolean;
  controlled: boolean;
  /** Raised off the ground (world px), e.g. while climbing through a window, or lying in bed. */
  lift: number;
  /** Lying down asleep (drawn like lying out cold, but in colour). */
  asleep: boolean;
}

export function createPose(): CharacterPose {
  return {
    mode: 'explore',
    crouched: false,
    stridePhase: 0,
    strideAmount: 0,
    punch: { left: null, right: null },
    state: 'ok',
    hitFlash: 0,
    highlighted: false,
    controlled: false,
    lift: 0,
    asleep: false,
  };
}

/** Local-space hand position on the ground plane (character facing +x, right hand on +y). */
export function handOffset(hand: Hand, pose: CharacterPose): { x: number; y: number } {
  const side = hand === 'right' ? 1 : -1;
  if (pose.state === 'yielded') return { x: 11, y: 6 * side }; // hands raised in front
  if (pose.mode === 'combat') {
    const guard = { x: 12, y: 11 * side };
    const t = pose.punch[hand];
    if (t === null) return guard;
    const p = t < PUNCH_EXTEND ? t / PUNCH_EXTEND : 1 - (t - PUNCH_EXTEND) / PUNCH_RETRACT;
    const e = Phaser.Math.Easing.Quadratic.Out(Phaser.Math.Clamp(p, 0, 1));
    return { x: guard.x + (28 - guard.x) * e, y: guard.y + (4 * side - guard.y) * e };
  }
  // Exploring: arms at the sides, swinging opposite to each other with the stride.
  const swing = Math.sin(pose.stridePhase) * 7 * pose.strideAmount * side;
  return { x: (pose.crouched ? 5 : 1) + swing, y: (pose.crouched ? 13 : 16) * side };
}

/** World ground position of a hand (the anchor for anything held in it). */
export function handGround(x: number, y: number, facing: number, hand: Hand, pose: CharacterPose): Pt {
  const h = handOffset(hand, pose);
  return { x: x + h.x * Math.cos(facing) - h.y * Math.sin(facing), y: y + h.x * Math.sin(facing) + h.y * Math.cos(facing) };
}

/** Height of the hands above the ground (world px), for upright figures. */
function handHeight(pose: CharacterPose): number {
  if (pose.state === 'yielded') return 1.25 * M;
  if (pose.mode === 'combat') return 1.0 * M;
  return (pose.crouched ? 0.5 : 0.7) * M;
}

export function shade(colour: number, f: number): number {
  const c = Phaser.Display.Color.IntegerToColor(colour);
  return Phaser.Display.Color.GetColor(Math.min(255, c.red * f), Math.min(255, c.green * f), Math.min(255, c.blue * f));
}

function ellipsePts(cx: number, cy: number, rx: number, ry: number, angle: number, n = 18): Pt[] {
  const out: Pt[] = [];
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  for (let i = 0; i < n; i++) {
    const t = (i / n) * Math.PI * 2;
    const ex = Math.cos(t) * rx;
    const ey = Math.sin(t) * ry;
    out.push({ x: cx + ex * c - ey * s, y: cy + ex * s + ey * c });
  }
  return out;
}

export interface ViewResult {
  /** Screen bounds of the figure (for picking in angled views). */
  bounds: Bounds;
  /** Screen point just above the head, for bubbles and bars. */
  headTop: Pt;
}

// ------------------------------------------------------------------ figure geometry (shared by baking and placing)

interface Geom {
  bodyW: number;
  headR: number;
  hx: number;
  hy: number;
  beltY: number;
  bodyTop: number;
  bodyBottom: number;
  tunicBottom: number;
  hoseTop: number;
  r: number;
}

function geom(fx: number, fy: number, up: number, across: number, lowered: number): Geom {
  const sy = (z: number) => -z * up;
  const bodyW = (0.3 + 0.22 * Math.abs(fy)) * M * across;
  return {
    bodyW,
    headR: 0.21 * M * across,
    hx: fx * 0.04 * M * across,
    hy: sy(1.36 * M * lowered),
    beltY: sy(0.6 * M * lowered),
    bodyTop: sy(1.12 * M * lowered),
    bodyBottom: sy(0.04 * M),
    tunicBottom: sy(0.3 * M * lowered),
    hoseTop: sy(0.42 * M * lowered),
    r: Math.min(bodyW / 2, 0.16 * M),
  };
}

const LAYERS = ['hose', 'tunic', 'bodyLine', 'belt', 'head', 'eyes', 'hair', 'headLine'] as const;
type Layer = (typeof LAYERS)[number];

/** Facing index k (0 = right, 2 = towards you, −2 = away; 45° steps) → the drawn facing and whether to mirror it. */
function canonical(k: number): { k: number; flip: boolean } {
  const n = ((k % 8) + 8) % 8; // 0..7
  const fx = Math.cos((n * Math.PI) / 4);
  if (fx < -0.01) {
    const m = (((4 - n) % 8) + 8) % 8;
    return { k: m > 4 ? m - 8 : m, flip: true };
  }
  return { k: n > 4 ? n - 8 : n, flip: false };
}

/** Texture resolution: texture pixels per world pixel (enough to stay sharp close up on a phone). */
const RES = 3;
const PAGE = 2048;

/**
 * The shared sheets of baked body parts, one set per projection. Everything's drawn white so it can be tinted.
 */
class FigureBank {
  private static banks = new Map<string, FigureBank>();

  static for(scene: Phaser.Scene, p: Projection): FigureBank {
    const key = `${p.mode}`;
    let b = FigureBank.banks.get(key);
    if (!b || !scene.textures.exists(b.pageKey(0))) {
      b = new FigureBank(scene, p);
      FigureBank.banks.set(key, b);
    }
    return b;
  }

  /** Slot box in local figure coordinates (feet at the origin). */
  readonly left: number;
  readonly top: number;
  readonly w: number;
  readonly h: number;
  private pages: Phaser.Textures.CanvasTexture[] = [];
  private slot = 0;
  private readonly perRow: number;
  private readonly perPage: number;
  private readonly frames = new Map<string, { page: string; frame: string }>();
  private readonly g: Phaser.GameObjects.Graphics;

  private constructor(
    private readonly scene: Phaser.Scene,
    private readonly p: Projection,
  ) {
    const pad = 8;
    this.left = -(0.45 * M * p.across + pad);
    this.top = -(1.36 * M * p.up + 0.21 * M * p.across + pad);
    this.w = Math.ceil((-this.left * 2) * RES);
    this.h = Math.ceil((-this.top + pad) * RES);
    this.perRow = Math.floor(PAGE / this.w);
    this.perPage = this.perRow * Math.floor(PAGE / this.h);
    this.g = scene.make.graphics({}, false);
    this.bake();
  }

  pageKey(i: number): string {
    return `figures-${this.p.mode}-${i}`;
  }

  /** Bake every part for every drawn facing up front, so the first frames don't stutter. */
  private bake(): void {
    for (const k of [0, 1, 2, -1, -2]) {
      for (const lowered of [false, true]) {
        for (const layer of LAYERS) {
          const variants = layer === 'bodyLine' || layer === 'headLine' ? [false, true] : layer === 'eyes' ? [false, true] : [false];
          for (const v of variants) this.make(layer, k, lowered, v);
        }
      }
    }
    for (const page of this.pages) page.refresh();
  }

  private name(layer: Layer, k: number, lowered: boolean, variant: boolean): string {
    return `${layer}:${k}:${lowered ? 1 : 0}:${variant ? 1 : 0}`;
  }

  /** Where a part lives: texture key and frame. `variant` = thick outline (outlines) or eyes shut (eyes). */
  frame(layer: Layer, k: number, lowered: boolean, variant = false): { page: string; frame: string } {
    return this.frames.get(this.name(layer, k, lowered, variant))!;
  }

  private make(layer: Layer, k: number, lowered: boolean, variant: boolean): void {
    const i = this.slot++;
    const pi = Math.floor(i / this.perPage);
    if (!this.pages[pi]) this.pages[pi] = this.scene.textures.createCanvas(this.pageKey(pi), PAGE, PAGE)!;
    const page = this.pages[pi];
    const j = i % this.perPage;
    const sx = (j % this.perRow) * this.w;
    const sy = Math.floor(j / this.perRow) * this.h;
    const g = this.g;
    g.clear();
    g.save();
    g.translateCanvas(sx - this.left * RES, sy - this.top * RES);
    g.scaleCanvas(RES, RES);
    drawPart(g, layer, k, lowered ? 0.74 : 1, variant, this.p);
    g.restore();
    g.generateTexture(page.getSourceImage() as HTMLCanvasElement);
    const name = this.name(layer, k, lowered, variant);
    page.add(name, 0, sx, sy, this.w, this.h);
    this.frames.set(name, { page: this.pageKey(pi), frame: name });
  }
}

/** Draw one part, in white, in local figure coordinates (feet at the origin, up = −y). */
function drawPart(g: Phaser.GameObjects.Graphics, layer: Layer, k: number, lowered: number, variant: boolean, p: Projection): void {
  const fx = Math.cos((k * Math.PI) / 4);
  const fy = Math.sin((k * Math.PI) / 4);
  const o = geom(fx, fy, p.up, p.across, lowered);
  const W = 0xffffff;
  const seenFace = fy > -0.4;
  switch (layer) {
    case 'hose':
      g.fillStyle(W, 1);
      g.fillRoundedRect(-o.bodyW * 0.38, o.hoseTop, o.bodyW * 0.76, o.bodyBottom - o.hoseTop, 4);
      break;
    case 'tunic':
      g.fillStyle(W, 1);
      g.fillRoundedRect(-o.bodyW / 2, o.bodyTop, o.bodyW, o.tunicBottom - o.bodyTop, o.r);
      break;
    case 'bodyLine':
      g.lineStyle(variant ? 3 : 1.5, W, 1);
      g.strokeRoundedRect(-o.bodyW / 2, o.bodyTop, o.bodyW, o.tunicBottom - o.bodyTop, o.r);
      break;
    case 'belt':
      g.lineStyle(2, W, 1);
      g.lineBetween(-o.bodyW / 2 + 2, o.beltY, o.bodyW / 2 - 2, o.beltY);
      break;
    case 'head':
      // Skin from the front, hair from behind: the same disc, tinted.
      g.fillStyle(W, 1);
      g.fillCircle(o.hx, o.hy, o.headR);
      break;
    case 'eyes': {
      if (!seenFace) break;
      const spread = o.headR * 0.32 * Math.max(0, fy);
      const ex = o.hx + fx * o.headR * 0.45;
      const ey = o.hy + o.headR * 0.12;
      if (variant) {
        g.lineStyle(1.4, W, 1);
        for (const dx of spread > 1.2 ? [-spread, spread] : [fx * o.headR * 0.15]) g.lineBetween(ex + dx - 2, ey, ex + dx + 2, ey);
      } else {
        g.fillStyle(W, 1);
        if (spread > 1.2) {
          g.fillCircle(ex - spread, ey, 1.6);
          g.fillCircle(ex + spread, ey, 1.6);
        } else g.fillCircle(ex + fx * o.headR * 0.15, ey, 1.6);
      }
      break;
    }
    case 'hair': {
      if (!seenFace) break;
      // Arc from low on the back of the head, over the top, to the hairline above the brow
      // (canvas angles: 0 = right, 90° = down); then straight back across the brow to just
      // behind the ear and down to the nape.
      const side = Math.abs(fx);
      const back = (Math.PI / 180) * (190 - 60 * side);
      const front = (Math.PI / 180) * (350 - 30 * side);
      const mirror = fx < 0 ? -1 : 1;
      const pts: Pt[] = [];
      const n = 24;
      for (let i = 0; i <= n; i++) {
        const a = back + ((front - back) * i) / n;
        pts.push({ x: o.hx + Math.cos(a) * o.headR * mirror, y: o.hy + Math.sin(a) * o.headR });
      }
      const browY = pts[pts.length - 1].y;
      const earX = o.hx - 0.15 * o.headR * side * mirror;
      pts.push({ x: earX, y: browY }, { x: earX, y: pts[0].y });
      g.fillStyle(W, 1);
      g.fillPoints(pts as Phaser.Math.Vector2[], true);
      break;
    }
    case 'headLine':
      g.lineStyle(variant ? 3 : 1.5, W, 1);
      g.strokeCircle(o.hx, o.hy, o.headR);
      break;
  }
}

/** Small shared textures: a hand (skin with an outline) and the soft contact shadow, per projection. */
function smallTextures(scene: Phaser.Scene, p: Projection): { hand: string; shadow: string } {
  const hand = `fig-hand-${p.mode}`;
  const shadow = `fig-shadow-${p.mode}`;
  if (!scene.textures.exists(hand)) {
    const g = scene.make.graphics({}, false);
    const r = 0.075 * M * p.across;
    const size = Math.ceil((r + 2) * 2 * RES);
    g.save();
    g.translateCanvas(size / 2, size / 2);
    g.scaleCanvas(RES, RES);
    g.fillStyle(SKIN, 1);
    g.lineStyle(1.2, OUTLINE, 1);
    g.fillCircle(0, 0, r);
    g.strokeCircle(0, 0, r);
    g.restore();
    g.generateTexture(hand, size, size);
    g.clear();
    // Shadow: three soft rings on the ground, projected.
    const o = p.toScreen(0, 0);
    const R = 0.24 * M;
    const sw = Math.ceil((R * 2 * p.across + 4) * RES);
    const shh = Math.ceil((Math.abs(p.toScreen(0, R).y - p.toScreen(0, -R).y) + 4) * RES);
    g.save();
    g.translateCanvas(sw / 2, shh / 2);
    g.scaleCanvas(RES, RES);
    for (const [rr, alpha] of [[0.24, 0.06], [0.2, 0.07], [0.15, 0.08]] as const) {
      const pts = ellipsePts(0, 0, rr * M, rr * M, 0, 48).map((q) => {
        const s = p.toScreen(q.x, q.y);
        return { x: s.x - o.x, y: s.y - o.y };
      });
      g.fillStyle(0x000000, alpha);
      g.fillPoints(pts as Phaser.Math.Vector2[], true);
    }
    g.restore();
    g.generateTexture(shadow, sw, shh);
    g.destroy();
  }
  return { hand, shadow };
}

export class CharacterView {
  /** Draw at this depth instead of by ground position (e.g. lying on top of a bed). */
  depthOverride: number | null = null;
  /** Ground ring under the character you control. */
  private readonly ring: Phaser.GameObjects.Graphics;
  private ringShown = false;
  private readonly root: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly parts: Record<Layer, Phaser.GameObjects.Image>;
  /** Hands drawn behind the body / in front of it (only one of each pair is visible). */
  private readonly handsBack: Phaser.GameObjects.Image[];
  private readonly handsFront: Phaser.GameObjects.Image[];
  private bank: FigureBank | null = null;
  private bankFor: Projection | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    _x: number,
    _y: number,
    private readonly palette: Palette,
  ) {
    this.ring = scene.add.graphics().setDepth(3);
    const img = () => new Phaser.GameObjects.Image(scene, 0, 0, '__WHITE');
    this.shadow = img();
    this.parts = Object.fromEntries(LAYERS.map((l) => [l, img()])) as Record<Layer, Phaser.GameObjects.Image>;
    this.handsBack = [img(), img()];
    this.handsFront = [img(), img()];
    this.root = scene.add.container(0, 0, [this.shadow, ...this.handsBack, ...LAYERS.map((l) => this.parts[l]), ...this.handsFront]).setDepth(20);
  }

  private setup(p: Projection): FigureBank {
    if (this.bank && this.bankFor === p) return this.bank;
    this.bank = FigureBank.for(this.scene, p);
    this.bankFor = p;
    const small = smallTextures(this.scene, p);
    this.shadow.setTexture(small.shadow);
    for (const h of [...this.handsBack, ...this.handsFront]) h.setTexture(small.hand);
    const b = this.bank;
    // Every part's frame shares the same box, with the feet at local (0, 0).
    for (const l of LAYERS) this.parts[l].setOrigin((-b.left * RES) / b.w, (-b.top * RES) / b.h).setScale(1 / RES);
    for (const h of [...this.handsBack, ...this.handsFront]) h.setScale(1 / RES);
    this.shadow.setScale(1 / RES);
    return b;
  }

  update(x: number, y: number, facing: number, pose: CharacterPose, p: Projection): ViewResult {
    if (pose.controlled || this.ringShown) {
      this.ring.clear();
      if (pose.controlled) {
        this.ring.lineStyle(2, 0xffffff, 0.55);
        ringOnGround(this.ring, p, x, y, 25);
      }
      this.ringShown = pose.controlled;
    }
    const bank = this.setup(p);
    this.root.setVisible(true);
    this.root.setDepth(this.depthOverride ?? 10 + p.depth(x, y) / 1000 + 0.0005);

    const flash = pose.hitFlash > 0;
    const lying = pose.state === 'ko' || pose.asleep;
    const tunic = flash ? 0xffffff : pose.state === 'yielded' ? shade(this.palette.tunic, 0.82) : this.palette.tunic;
    const line = pose.highlighted ? HIGHLIGHT : OUTLINE;
    const thick = pose.highlighted;

    // Which way they face on screen, in 45° steps.
    const base = p.toScreen(x, y, lying ? 0 : pose.lift);
    const ahead = p.toScreen(x + Math.cos(facing) * 10, y + Math.sin(facing) * 10);
    const kRaw = lying ? 2 : Math.round(Math.atan2(ahead.y - base.y, ahead.x - base.x) / (Math.PI / 4));
    const { k, flip } = canonical(kRaw);
    const fx = Math.cos((k * Math.PI) / 4);
    const fy = Math.sin((k * Math.PI) / 4);
    const loweredFlag = !lying && (pose.crouched || pose.state === 'yielded');
    const o = geom(fx, fy, p.up, p.across, loweredFlag ? 0.74 : 1);
    const backView = fy <= -0.4;

    const set = (l: Layer, variant: boolean, tint: number, visible = true) => {
      const im = this.parts[l];
      im.setVisible(visible);
      if (!visible) return;
      const fr = bank.frame(l, k, loweredFlag, variant);
      im.setTexture(fr.page, fr.frame);
      im.setTint(tint);
    };
    set('hose', false, flash ? 0xffffff : shade(this.palette.tunic, 0.55));
    set('tunic', false, tunic);
    set('bodyLine', thick, line);
    set('belt', false, shade(this.palette.tunic, 0.5));
    set('head', false, flash ? 0xffffff : backView ? this.palette.hair : SKIN);
    set('eyes', lying, 0x2a1d14, !backView);
    set('hair', false, this.palette.hair, !backView);
    set('headLine', thick, line);
    const handMode = flash ? Phaser.TintModes.FILL : Phaser.TintModes.MULTIPLY;
    for (const h of [...this.handsBack, ...this.handsFront]) h.setTint(0xffffff).setTintMode(handMode);

    if (lying) return this.placeLying(x, y, facing, pose, p, o);

    // Upright: the figure stands at its feet; mirrored for the left-facing directions.
    this.root.setPosition(base.x, base.y).setRotation(0).setScale(flip ? -1 : 1, 1);
    const ground = p.toScreen(x, y);
    this.shadow.setVisible(true).setPosition(0, ground.y - base.y).setScale(1 / RES);

    // Hands: exact positions on the ground plane, behind or in front of the body.
    const hz = handHeight(pose);
    (['left', 'right'] as const).forEach((hand, i) => {
      const gp = handGround(x, y, facing, hand, pose);
      const s = p.toScreen(gp.x, gp.y, hz);
      const behind = p.depth(gp.x, gp.y) < p.depth(x, y) - 1;
      const lx = (s.x - base.x) * (flip ? -1 : 1);
      const ly = s.y - base.y;
      this.handsBack[i].setVisible(behind).setPosition(lx, ly);
      this.handsFront[i].setVisible(!behind).setPosition(lx, ly);
    });

    const sx = flip ? -1 : 1;
    const hx = base.x + o.hx * sx;
    const hy = base.y + o.hy;
    const half = Math.max(o.bodyW / 2, 0.35 * M * p.across);
    return {
      bounds: { x0: base.x - half, x1: base.x + half, y0: hy - o.headR - 4, y1: base.y + 6 },
      headTop: { x: hx, y: hy - o.headR + 6 },
    };
  }

  /**
   * Lying flat on their back along their facing (head that way): the standing
   * figure, rotated to lie on the floor (or a bed, via `lift`) and
   * foreshortened by the view.
   */
  private placeLying(x: number, y: number, facing: number, pose: CharacterPose, p: Projection, o: Geom): ViewResult {
    const c = Math.cos(facing);
    const s = Math.sin(facing);
    const length = 1.57 * M; // feet to the top of the head
    const z = pose.lift + 0.1 * M; // the body has some thickness
    const feet = { x: x - c * length * 0.5, y: y - s * length * 0.5 };
    const fs = p.toScreen(feet.x, feet.y, z);
    const hs = p.toScreen(feet.x + c * length, feet.y + s * length, z);
    const vx = hs.x - fs.x;
    const vy = hs.y - fs.y;
    const along = Math.hypot(vx, vy);
    const up = p.up || 1;
    this.root.setPosition(fs.x, fs.y).setRotation(Math.atan2(vy, vx) + Math.PI / 2).setScale(1, Math.max(0.05, along / (length * up)));

    // Shadow (not in bed): stretched along the body, under its middle.
    this.shadow.setVisible(!pose.asleep).setPosition(0, -(length * up) / 2).setScale((1 / RES) * 1.1, ((1 / RES) * (length * up)) / (0.48 * M * up));

    // Arms by their sides when asleep, flung out when knocked out.
    const out = pose.asleep ? 0.62 : 1.05;
    [-1, 1].forEach((side, i) => {
      this.handsBack[i].setVisible(false);
      this.handsFront[i].setVisible(true).setPosition(side * o.bodyW * out, o.beltY);
    });

    const pad = 0.4 * M;
    return {
      bounds: { x0: Math.min(fs.x, hs.x) - pad, y0: Math.min(fs.y, hs.y) - pad, x1: Math.max(fs.x, hs.x) + pad, y1: Math.max(fs.y, hs.y) + pad },
      headTop: { x: hs.x, y: Math.min(fs.y, hs.y) - 0.3 * M },
    };
  }

  /** Not drawn at all (e.g. off screen, in the reduced level of detail). */
  hide(): void {
    this.root.setVisible(false);
    if (this.ringShown) {
      this.ring.clear();
      this.ringShown = false;
    }
  }

  destroy(): void {
    this.root.destroy();
    this.ring.destroy();
  }
}
