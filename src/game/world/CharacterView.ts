import Phaser from 'phaser';
import type { ControlMode } from '../bridge';
import { PX_PER_METRE } from '../movement/tuning';
import { ringOnGround, type Bounds } from '../view/draw';
import type { Projection, Pt } from '../view/projection';
import { bodyKey, type Body } from '../characters/body';
import { ART_BOX, buildView, drawFigure, drawGlow, VIEW_DEGREES, type FigureView } from '../characters/bodyArt';

/**
 * People, drawn in the style of the character mock-ups: an upper body (no
 * legs), a head with a face and hair, and floating hands. The figure itself
 * comes from characters/bodyArt.ts, worked out from each person's body
 * (sex, age, fat, muscle, height, frame, bust, waist, hips, skin, hair).
 *
 * An upright figure faces one of 8 screen directions (the game is drawn in
 * ¾). Hands are placed at their exact positions on the ground plane (so aim
 * and punches stay precise) and drawn in front of or behind the body
 * depending on which side of it they're on.
 *
 * Drawing: each body is drawn ONCE per angle into a texture (five angles,
 * mirrored for the other three facings; plus the highlight outline and a
 * sleeping face). People with identical bodies and clothes share it. Moving
 * someone then only moves a few sprites, which is much cheaper than redrawing
 * vector art every frame.
 */

const M = PX_PER_METRE;

export type Hand = 'left' | 'right';
export type BodyState = 'ok' | 'yielded' | 'ko';

export const PUNCH_EXTEND = 0.09; // s to full extension
export const PUNCH_RETRACT = 0.17; // s back to guard
export const PUNCH_TOTAL = PUNCH_EXTEND + PUNCH_RETRACT;

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

/** Height of the hands above the hem (mock-up art units, for an adult; scaled by the body's height). */
function handArtHeight(pose: CharacterPose): number {
  if (pose.state === 'yielded') return 74;
  if (pose.mode === 'combat') return 52;
  return pose.crouched ? 30 : 33.5;
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

// ------------------------------------------------------------------ baked figures

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

/** Drawn facing k (2 = towards you … −2 = away) → index into VIEW_DEGREES (front, ¾ front, side, ¾ back, back). */
const viewIndex = (k: number) => 2 - k;

/** Texture resolution: texture pixels per screen pixel at zoom 1 (enough to stay sharp close up on a phone). */
const RES = 3;
/** Art units → screen px: an average adult's head top (about 96 units) stands this tall in world metres. */
const ADULT_HEIGHT_M = 1.7;
const artScale = (p: Projection) => (ADULT_HEIGHT_M * M * p.up) / 96.3;

interface Baked {
  key: string;
  tex: string;
  refs: number;
  /** Frame names: 0–4 the five angles, 5–9 their highlight outlines, 10 the front with eyes shut. */
  frames: string[];
  /** Feet position inside each frame, as an origin (0–1). */
  ox: number;
  oy: number;
  views: FigureView[];
  /** Art units → screen px. */
  u: number;
}

/** Baked figures, shared between people with the same body and clothes. */
class FigureCache {
  private static all = new Map<string, Baked>();
  private static n = 0;

  static acquire(scene: Phaser.Scene, p: Projection, body: Body, clothes: number): Baked {
    const key = `${p.mode}|${bodyKey(body)}|${clothes}`;
    let b = FigureCache.all.get(key);
    if (!b || !scene.textures.exists(b.tex)) {
      b = FigureCache.bake(scene, p, body, clothes, key);
      FigureCache.all.set(key, b);
    }
    b.refs++;
    return b;
  }

  static release(scene: Phaser.Scene, b: Baked): void {
    if (--b.refs > 0) return;
    FigureCache.all.delete(b.key);
    if (scene.textures.exists(b.tex)) scene.textures.remove(b.tex);
  }

  private static bake(scene: Phaser.Scene, p: Projection, body: Body, clothes: number, key: string): Baked {
    const u = artScale(p);
    const k = u * RES;
    const fw = Math.ceil((ART_BOX.right - ART_BOX.left) * k);
    const fh = Math.ceil((ART_BOX.bottom - ART_BOX.top) * k);
    const cols = 6;
    const tex = `figure-${++FigureCache.n}`;
    const canvas = scene.textures.createCanvas(tex, fw * cols, fh * 2)!;
    const ctx = canvas.context;
    const css = '#' + clothes.toString(16).padStart(6, '0');
    const views = VIEW_DEGREES.map((d) => buildView(body, d));
    const frames: string[] = [];
    const slot = (i: number, draw: () => void) => {
      const x = (i % cols) * fw;
      const y = Math.floor(i / cols) * fh;
      ctx.save();
      ctx.beginPath();
      ctx.rect(x, y, fw, fh);
      ctx.clip();
      ctx.translate(x - ART_BOX.left * k, y - ART_BOX.top * k);
      ctx.scale(k, k);
      draw();
      ctx.restore();
      const name = String(i);
      canvas.add(name, 0, x, y, fw, fh);
      frames.push(name);
    };
    views.forEach((v) => slot(frames.length, () => drawFigure(ctx, v, { clothes: css })));
    views.forEach((v) => slot(frames.length, () => drawGlow(ctx, v, 5)));
    slot(frames.length, () => drawFigure(ctx, views[0], { clothes: css, eyesShut: true }));
    canvas.refresh();
    return { key, tex, refs: 0, frames, ox: (-ART_BOX.left * k) / fw, oy: (-ART_BOX.top * k) / fh, views, u };
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
    g.fillStyle(0xffffff, 1);
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
  /** Ground ring under the character you control (made the first time it's needed: most people never are). */
  private ring: Phaser.GameObjects.Graphics | null = null;
  private ringShown = false;
  private readonly root: Phaser.GameObjects.Container;
  private readonly shadow: Phaser.GameObjects.Image;
  private readonly glow: Phaser.GameObjects.Image;
  private readonly figure: Phaser.GameObjects.Image;
  /** Hands drawn behind the body / in front of it (only one of each pair is visible). */
  private readonly handsBack: Phaser.GameObjects.Image[];
  private readonly handsFront: Phaser.GameObjects.Image[];
  private baked: Baked | null = null;
  private bakedFor: Projection | null = null;
  private readonly skin: number;

  constructor(
    private readonly scene: Phaser.Scene,
    _x: number,
    _y: number,
    private readonly palette: Palette,
    private readonly body: Body,
  ) {
    const img = () => new Phaser.GameObjects.Image(scene, 0, 0, '__WHITE');
    this.shadow = img();
    this.glow = img();
    this.figure = img();
    this.handsBack = [img(), img()];
    this.handsFront = [img(), img()];
    this.skin = Phaser.Display.Color.HexStringToColor(body.skin).color;
    this.root = scene.add.container(0, 0, [this.shadow, ...this.handsBack, this.glow, this.figure, ...this.handsFront]).setDepth(20);
  }

  private setup(p: Projection): Baked {
    if (this.baked && this.bakedFor === p) return this.baked;
    if (this.baked) FigureCache.release(this.scene, this.baked);
    const b = (this.baked = FigureCache.acquire(this.scene, p, this.body, this.palette.tunic));
    this.bakedFor = p;
    const small = smallTextures(this.scene, p);
    this.shadow.setTexture(small.shadow);
    // Hands sized to the person (a child's are small), against the shared hand texture's radius.
    const handScale = (b.views[0].handR * b.u) / (0.075 * M * p.across) / RES;
    for (const h of [...this.handsBack, ...this.handsFront]) h.setTexture(small.hand).setScale(handScale);
    for (const im of [this.figure, this.glow]) im.setTexture(b.tex, b.frames[0]).setOrigin(b.ox, b.oy).setScale(1 / RES);
    this.shadow.setScale(1 / RES);
    return b;
  }

  update(x: number, y: number, facing: number, pose: CharacterPose, p: Projection): ViewResult {
    if (pose.controlled || this.ringShown) {
      const ring = (this.ring ??= this.scene.add.graphics().setDepth(3));
      ring.clear();
      if (pose.controlled) {
        ring.lineStyle(2, 0xffffff, 0.55);
        ringOnGround(ring, p, x, y, 25);
      }
      this.ringShown = pose.controlled;
    }
    const b = this.setup(p);
    this.root.setVisible(true);
    this.root.setDepth(this.depthOverride ?? 10 + p.depth(x, y) / 1000 + 0.0005);

    const flash = pose.hitFlash > 0;
    const lying = pose.state === 'ko' || pose.asleep;

    // Which way they face on screen, in 45° steps.
    const base = p.toScreen(x, y, lying ? 0 : pose.lift);
    const ahead = p.toScreen(x + Math.cos(facing) * 10, y + Math.sin(facing) * 10);
    const kRaw = lying ? 2 : Math.round(Math.atan2(ahead.y - base.y, ahead.x - base.x) / (Math.PI / 4));
    const { k, flip } = canonical(kRaw);
    const vi = viewIndex(k);
    const v = b.views[vi];
    const lowered = !lying && (pose.crouched || pose.state === 'yielded');
    const squash = lowered ? 0.82 : 1;

    // Lying (asleep or out cold): the front view with the eyes shut.
    this.figure.setFrame(b.frames[lying ? 10 : vi]);
    if (flash) this.figure.setTint(0xffffff).setTintMode(Phaser.TintModes.FILL);
    else this.figure.setTint(pose.state === 'yielded' ? 0xd2d2d2 : 0xffffff).setTintMode(Phaser.TintModes.MULTIPLY);
    this.glow.setVisible(pose.highlighted).setFrame(b.frames[5 + vi]).setTint(HIGHLIGHT);
    const handMode = flash ? Phaser.TintModes.FILL : Phaser.TintModes.MULTIPLY;
    for (const h of [...this.handsBack, ...this.handsFront]) h.setTint(flash ? 0xffffff : this.skin).setTintMode(handMode);

    if (lying) {
      this.figure.setScale(1 / RES, 1 / RES);
      this.glow.setScale(1 / RES, 1 / RES);
      return this.placeLying(x, y, facing, pose, p, b);
    }

    // Upright: the figure stands at its feet; mirrored for the left-facing directions.
    this.root.setPosition(base.x, base.y).setRotation(0).setScale(flip ? -1 : 1, 1);
    this.figure.setScale(1 / RES, squash / RES);
    this.glow.setScale(1 / RES, squash / RES);
    const ground = p.toScreen(x, y);
    this.shadow.setVisible(true).setPosition(0, ground.y - base.y).setScale(1 / RES);

    // Hands: exact positions on the ground plane, behind or in front of the body, at a height that suits the body.
    const hz = (handArtHeight(pose) * v.Y * squash * b.u) / (p.up || 1);
    // Hands hang beside the body, so broad people's hang further out (and children's closer in). Only the
    // drawing: punches and held things use the same hand positions for everyone.
    const wide = Math.max(0.45, (v.handX * b.u) / 16);
    const cf = Math.cos(facing);
    const sf = Math.sin(facing);
    (['left', 'right'] as const).forEach((hand, i) => {
      const h = handOffset(hand, pose);
      const ly0 = h.y * wide;
      const gp = { x: x + h.x * cf - ly0 * sf, y: y + h.x * sf + ly0 * cf };
      const s = p.toScreen(gp.x, gp.y, hz);
      const behind = p.depth(gp.x, gp.y) < p.depth(x, y) - 1;
      const lx = (s.x - base.x) * (flip ? -1 : 1);
      const ly = s.y - base.y;
      this.handsBack[i].setVisible(behind).setPosition(lx, ly);
      this.handsFront[i].setVisible(!behind).setPosition(lx, ly);
    });

    const top = base.y + v.headTop * b.u * squash;
    const half = Math.max(Math.max(-v.silBox.x0, v.silBox.x1) * v.X * b.u, 0.3 * M * p.across);
    return {
      bounds: { x0: base.x - half, x1: base.x + half, y0: top - 4, y1: base.y + 6 },
      headTop: { x: base.x + (flip ? -1 : 1) * v.fwd * b.u, y: top + 6 },
    };
  }

  /**
   * Lying flat on their back along their facing (head that way): the standing
   * figure, rotated to lie on the floor (or a bed, via `lift`) and
   * foreshortened by the view.
   */
  private placeLying(x: number, y: number, facing: number, pose: CharacterPose, p: Projection, b: Baked): ViewResult {
    const v = b.views[0];
    const up = p.up || 1;
    const c = Math.cos(facing);
    const s = Math.sin(facing);
    const length = (-v.headTop * b.u) / up; // hem to the top of the head, in world px
    const z = pose.lift + 0.1 * M; // the body has some thickness
    const feet = { x: x - c * length * 0.5, y: y - s * length * 0.5 };
    const fs = p.toScreen(feet.x, feet.y, z);
    const hs = p.toScreen(feet.x + c * length, feet.y + s * length, z);
    const vx = hs.x - fs.x;
    const vy = hs.y - fs.y;
    const along = Math.hypot(vx, vy);
    this.root.setPosition(fs.x, fs.y).setRotation(Math.atan2(vy, vx) + Math.PI / 2).setScale(1, Math.max(0.05, along / (length * up)));

    // Shadow (not in bed): stretched along the body, under its middle.
    this.shadow.setVisible(!pose.asleep).setPosition(0, -(length * up) / 2).setScale((1 / RES) * 1.1, ((1 / RES) * (length * up)) / (0.48 * M * up));

    // Arms by their sides when asleep, flung out when knocked out.
    const out = pose.asleep ? 1 : 1.45;
    [-1, 1].forEach((side, i) => {
      this.handsBack[i].setVisible(false);
      this.handsFront[i].setVisible(true).setPosition(side * v.handX * b.u * out, v.handY * b.u);
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
      this.ring?.clear();
      this.ringShown = false;
    }
  }

  destroy(): void {
    if (this.baked) FigureCache.release(this.scene, this.baked);
    this.baked = null;
    this.root.destroy();
    this.ring?.destroy();
  }
}
