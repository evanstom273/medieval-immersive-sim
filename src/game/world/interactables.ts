import Phaser from 'phaser';
import { PX_PER_METRE } from '../movement/tuning';
import { circlePts, emptyBounds, flat, HIGHLIGHT, OUTLINE, prism, prismBounds, rectPts, slabPts, type Bounds } from '../view/draw';
import type { Projection, Pt } from '../view/projection';
import type { Offer, Offering } from './furniture';
import { closestOnLeaf, resolveDoorContact, stepDoor, type Circle, type ContactResult, type DoorGeom, type DoorSwing } from './doorPhysics';

/**
 * PLACEHOLDER interactable objects. Each is its own object (not baked into
 * the building), per the art spec. They keep their state and behaviour on the
 * ground plane and draw themselves through whichever view projection is active.
 */

const M = PX_PER_METRE;

export interface InteractContext {
  /** Tell the player something (only shown when the actor is the character they control). */
  say(message: string): void;
  /** Lie down in a bed (the character you control: asks how long first). */
  sleepIn?(bed: Offering): void;
  /** Start doing something an object offers (sitting, drinking, sleeping…). */
  begin?(obj: Offering, offer: Offer): void;
}

/** An entry in an interaction menu. */
export interface MenuOption {
  id: string;
  label: string;
  icon: string;
  /** If set, the option shows but can't be picked, and this says why. */
  disabled?: string;
}

export interface Interactable {
  readonly name: string;
  /** Does the ground point land on this object? (Top-down picking.) */
  hitTest(x: number, y: number): boolean;
  /** Closest point on the object to a ground point, for reach checks. */
  closestPoint(x: number, y: number): Phaser.Math.Vector2;
  /** What can be done with it right now (by someone standing at `actor`, if given). */
  options(actor?: Pt): MenuOption[];
  perform(optionId: string, ctx: InteractContext): void;
  /** Something an idle character might wander over and do with it, or null if nothing. */
  idleUse(): string | null;
  setHighlight(on: boolean): void;
  /** Draw through the current projection; returns the screen bounds drawn (for picking in angled views). */
  render(g: Phaser.GameObjects.Graphics, p: Projection): Bounds;
  /** Ground point used for draw order. */
  sortPoint(p: Projection): Pt;
}

function clampToRect(r: Phaser.Geom.Rectangle, x: number, y: number): Phaser.Math.Vector2 {
  return new Phaser.Math.Vector2(Phaser.Math.Clamp(x, r.left, r.right), Phaser.Math.Clamp(y, r.top, r.bottom));
}

/** The ground corner of a rectangle nearest the viewer (for draw order). */
function frontCorner(r: Phaser.Geom.Rectangle, p: Projection): Pt {
  return p.mode === 'isometric' ? { x: r.right, y: r.bottom } : { x: r.centerX, y: r.bottom };
}

/**
 * A hinged door you push open by walking into it. Swings either way, and is
 * weighted to swing back shut with a thud (or softly, if eased by someone sneaking).
 * A locked door won't budge.
 */
export class Door implements Interactable {
  readonly name = 'door';
  private locked = false;
  private highlighted = false;
  private swing: DoorSwing = { angle: 0, angVel: 0 };
  readonly geom: DoorGeom;
  /** Door height (px of world height). */
  readonly height = 2.0 * M;
  /** Drawn height, when its wall is cut down (cutaway / walls down); null = full height. */
  displayHeight: number | null = null;
  /** Unit ground direction into the room it closes, if it's a room's door (for "from inside" rules). */
  inward: Pt | null = null;

  /**
   * @param hingeX,hingeY  hinge position
   * @param length         leaf length (the doorway width)
   * @param thickness      leaf thickness
   * @param baseAngle      leaf direction when closed (radians)
   */
  constructor(hingeX: number, hingeY: number, length: number, thickness: number, baseAngle = 0) {
    this.geom = { hingeX, hingeY, baseAngle, length, thickness, maxAngle: Math.PI / 2 };
  }

  get isLocked(): boolean {
    return this.locked;
  }

  /** Swing under the door's weight. Call once per frame. Returns thud speed (rad/s) if it hit the frame, else 0. */
  update(dt: number): number {
    const res = stepDoor(this.geom, this.swing, dt);
    this.swing = res.swing;
    return res.thud;
  }

  hingePoint(): Pt {
    return { x: this.geom.hingeX, y: this.geom.hingeY };
  }

  /** World position of the latch (free) end of the leaf. */
  latchPoint(): Pt {
    const a = this.geom.baseAngle + this.swing.angle;
    return { x: this.geom.hingeX + Math.cos(a) * this.geom.length, y: this.geom.hingeY + Math.sin(a) * this.geom.length };
  }

  /** Let a circular body push the door (gently, if sneaking). Returns how far to move the body to clear it. */
  pushBy(body: Circle, dt: number, sneaking = false): ContactResult {
    const res = resolveDoorContact(this.geom, this.swing, body, this.locked, dt, sneaking);
    this.swing = res.swing;
    return res;
  }

  /** For pathfinding: a locked door is a wall; an unlocked one can be pushed through. */
  navObstacle(): { kind: 'rect'; x: number; y: number; w: number; h: number } | null {
    if (!this.locked) return null;
    const { hingeX, hingeY, length, thickness, baseAngle } = this.geom;
    const ex = hingeX + Math.cos(baseAngle) * length;
    const ey = hingeY + Math.sin(baseAngle) * length;
    const x = Math.min(hingeX, ex) - thickness / 2;
    const y = Math.min(hingeY, ey) - thickness / 2;
    return { kind: 'rect', x, y, w: Math.abs(ex - hingeX) + thickness, h: Math.abs(ey - hingeY) + thickness };
  }

  sortPoint(p: Projection): Pt {
    const a = this.hingePoint();
    const b = this.latchPoint();
    // The leaf's end nearest the viewer.
    return p.depth(a.x, a.y) > p.depth(b.x, b.y) ? a : b;
  }

  render(g: Phaser.GameObjects.Graphics, p: Projection): Bounds {
    const { hingeX, hingeY, baseAngle, length, thickness } = this.geom;
    const angle = baseAngle + this.swing.angle;
    const outline = this.highlighted ? HIGHLIGHT : OUTLINE;
    const leaf = slabPts(hingeX, hingeY, angle, length, thickness);
    const h = p.upright ? Math.min(this.height, this.displayHeight ?? this.height) : 0;
    const b = prism(g, p, leaf, 0, h, { colour: 0x6b4a2b, top: 0x7a5634, outline, outlineWidth: this.highlighted ? 3 : 1.5 });
    if (!p.upright) {
      // Planks, seen from above.
      g.lineStyle(1, 0x4a321c, 1);
      for (let d = 16; d < length; d += 16) {
        const ox = -Math.sin(angle) * (thickness / 2 - 1);
        const oy = Math.cos(angle) * (thickness / 2 - 1);
        const cx = hingeX + Math.cos(angle) * d;
        const cy = hingeY + Math.sin(angle) * d;
        g.lineBetween(cx + ox, cy + oy, cx - ox, cy - oy);
      }
    }
    // Hinge pin.
    const pin = p.toScreen(hingeX, hingeY, h);
    g.fillStyle(0x3a3a3a, 1);
    g.fillCircle(pin.x, pin.y, 3);
    // Iron bolt across the latch end when locked.
    if (this.locked) {
      const bolt = slabPts(hingeX + Math.cos(angle) * (length - 14), hingeY + Math.sin(angle) * (length - 14), angle, 10, thickness + 6);
      const boltZ = Math.min(0.9 * M, Math.max(0, h - 0.15 * M));
      prism(g, p, bolt, p.upright ? boltZ : 0, p.upright ? Math.min(0.15 * M, h) : 0, { colour: 0x2e2e2e, outline: 0x111111, outlineWidth: 1 }, b);
    }
    return b;
  }

  hitTest(x: number, y: number): boolean {
    const p = closestOnLeaf(this.geom, this.swing, x, y);
    return Math.hypot(x - p.x, y - p.y) <= this.geom.thickness / 2 + 6;
  }

  closestPoint(x: number, y: number): Phaser.Math.Vector2 {
    const p = closestOnLeaf(this.geom, this.swing, x, y);
    return new Phaser.Math.Vector2(p.x, p.y);
  }

  options(): MenuOption[] {
    if (this.locked) return [{ id: 'unlock', label: 'Unlock', icon: '🔓' }];
    const open = Math.abs(this.swing.angle) > 0.08;
    return [{ id: 'lock', label: 'Lock', icon: '🔒', disabled: open ? 'Shut it first' : undefined }];
  }

  idleUse(): string | null {
    return null;
  }

  perform(optionId: string, ctx: InteractContext): void {
    if ((optionId === 'lock') === this.locked) return;
    if (!this.locked && Math.abs(this.swing.angle) > 0.08) {
      ctx.say('The door needs to be shut before you can lock it.');
      return;
    }
    this.locked = !this.locked;
    if (this.locked) this.swing = { angle: 0, angVel: 0 };
    ctx.say(this.locked ? 'You lock the door.' : 'You unlock the door.');
  }

  setHighlight(on: boolean): void {
    this.highlighted = on;
  }
}

/** A chest with a lid that opens. Always solid. */
export class Chest implements Interactable {
  readonly name = 'chest';
  private open = false;
  private highlighted = false;
  private readonly rect: Phaser.Geom.Rectangle;
  private readonly height = 0.45 * M;

  constructor(scene: Phaser.Scene, staticGroup: Phaser.Physics.Arcade.StaticGroup, x: number, y: number, w: number, h: number) {
    this.rect = new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h);
    const body = scene.add.rectangle(x, y, w, h).setVisible(false);
    scene.physics.add.existing(body, true);
    staticGroup.add(body);
  }

  sortPoint(p: Projection): Pt {
    return frontCorner(this.rect, p);
  }

  render(g: Phaser.GameObjects.Graphics, p: Projection): Bounds {
    const r = this.rect;
    const outline = this.highlighted ? HIGHLIGHT : OUTLINE;
    const ow = this.highlighted ? 3 : 1.5;
    const h = p.upright ? this.height : 0;
    const b = emptyBounds();
    if (this.open) {
      // Lid flipped back behind the chest.
      const lidDepth = r.height * 0.55;
      if (p.upright) prism(g, p, rectPts(r.x, r.y - 4, r.width, 4), h, lidDepth, { colour: 0x7a5532, outline, outlineWidth: ow }, b);
      else prism(g, p, rectPts(r.x, r.y - lidDepth, r.width, lidDepth), 0, 0, { colour: 0x7a5532, outline, outlineWidth: ow }, b);
      prism(g, p, rectPts(r.x, r.y, r.width, r.height), 0, h, { colour: 0x6b4a2b, top: 0x2b1c10, outline, outlineWidth: ow }, b);
    } else {
      prism(g, p, rectPts(r.x, r.y, r.width, r.height), 0, h, { colour: 0x6b4a2b, top: 0x7a5532, outline, outlineWidth: ow }, b);
      // Iron bands and lock plate on the top.
      for (const bx of [r.x + 8, r.right - 12]) flat(g, p, rectPts(bx, r.y, 4, r.height), h, 0x5a5a5a);
      flat(g, p, rectPts(r.centerX - 4, r.bottom - 8, 8, 6), h, 0xb08d3c);
    }
    return b;
  }

  hitTest(x: number, y: number): boolean {
    const r = Phaser.Geom.Rectangle.Clone(this.rect);
    if (this.open) {
      r.y -= r.height * 0.55;
      r.height *= 1.55;
    }
    return r.contains(x, y);
  }

  closestPoint(x: number, y: number): Phaser.Math.Vector2 {
    return clampToRect(this.rect, x, y);
  }

  options(): MenuOption[] {
    return this.open ? [{ id: 'close', label: 'Close', icon: '📦' }] : [{ id: 'open', label: 'Open', icon: '📦' }];
  }

  idleUse(): string | null {
    return this.open ? 'close' : 'open';
  }

  perform(optionId: string, ctx: InteractContext): void {
    if ((optionId === 'open') === this.open) return;
    this.open = !this.open;
    ctx.say(this.open ? 'You open the chest. It is empty.' : 'You close the chest.');
  }

  setHighlight(on: boolean): void {
    this.highlighted = on;
  }
}

/**
 * PLACEHOLDER bed: a low frame with a mattress and pillow. Solid; whoever
 * sleeps in it lies on top. Pillow end is the -x end.
 */
export class Bed implements Offering {
  readonly name = 'bed';
  static readonly HEIGHT = 0.42 * M;
  static readonly SLEEP: Offer = { id: 'sleep', label: 'Sleep', icon: '🛏️', gains: { rest: 0.14, comfort: 0.1 }, posture: 'lie', hours: 9, untilFull: 'rest', moodlet: 'slept_bed', single: true };
  private highlighted = false;
  readonly rect: Phaser.Geom.Rectangle;
  readonly users = new Set<string>();
  readonly lieHeight = Bed.HEIGHT;
  /** Who's in it, if anyone. */
  get occupant(): string | null {
    for (const u of this.users) return u;
    return null;
  }
  set occupant(id: string | null) {
    this.users.clear();
    if (id) this.users.add(id);
  }

  offers(): readonly Offer[] {
    return [Bed.SLEEP];
  }

  spotFor(): { x: number; y: number; facing: number } {
    return this.sleepSpot();
  }

  constructor(scene: Phaser.Scene, staticGroup: Phaser.Physics.Arcade.StaticGroup, x: number, y: number, w: number, h: number) {
    this.rect = new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h);
    const body = scene.add.rectangle(x, y, w, h).setVisible(false);
    scene.physics.add.existing(body, true);
    staticGroup.add(body);
  }

  /** Where a sleeper lies (body centre) and which way they face (head on the pillow). */
  sleepSpot(): { x: number; y: number; facing: number } {
    return { x: this.rect.centerX + 0.05 * M, y: this.rect.centerY, facing: Math.PI };
  }

  sortPoint(p: Projection): Pt {
    return frontCorner(this.rect, p);
  }

  render(g: Phaser.GameObjects.Graphics, p: Projection): Bounds {
    const r = this.rect;
    const outline = this.highlighted ? HIGHLIGHT : OUTLINE;
    const ow = this.highlighted ? 3 : 1.5;
    const h = p.upright ? Bed.HEIGHT : 0;
    const b = emptyBounds();
    prism(g, p, rectPts(r.x, r.y, r.width, r.height), 0, h * 0.6, { colour: 0x6b4a2b, outline, outlineWidth: ow }, b);
    prism(g, p, rectPts(r.x + 3, r.y + 3, r.width - 6, r.height - 6), h * 0.6, h * 0.4, { colour: 0xcfc3a2, top: 0xd9cfb2, outline, outlineWidth: ow }, b);
    // Blanket over the foot end, pillow at the head.
    flat(g, p, rectPts(r.x + r.width * 0.38, r.y + 3, r.width * 0.62 - 3, r.height - 6), h, 0x7d5a8a, 1, outline, 1);
    flat(g, p, rectPts(r.x + 6, r.y + 8, r.width * 0.2, r.height - 16), h + 2, 0xeee6d0, 1, outline, 1);
    return b;
  }

  hitTest(x: number, y: number): boolean {
    return this.rect.contains(x, y);
  }

  closestPoint(x: number, y: number): Phaser.Math.Vector2 {
    return clampToRect(this.rect, x, y);
  }

  options(): MenuOption[] {
    return [{ id: 'sleep', label: 'Sleep', icon: '🛏️', disabled: this.occupant ? 'Someone is in it' : undefined }];
  }

  idleUse(): string | null {
    return null;
  }

  perform(optionId: string, ctx: InteractContext): void {
    if (optionId !== 'sleep' || this.occupant) return;
    // The person you're playing is asked how long; anyone else just goes to bed.
    if (ctx.sleepIn) ctx.sleepIn(this);
    else ctx.begin?.(this, Bed.SLEEP);
  }

  setHighlight(on: boolean): void {
    this.highlighted = on;
  }
}

/** A signpost you can read. */
export class Sign implements Interactable {
  readonly name = 'sign';
  private highlighted = false;
  private readonly rect: Phaser.Geom.Rectangle;

  constructor(
    scene: Phaser.Scene,
    staticGroup: Phaser.Physics.Arcade.StaticGroup,
    private readonly x: number,
    private readonly y: number,
    private readonly text: string,
  ) {
    this.rect = new Phaser.Geom.Rectangle(x - 24, y - 6, 48, 12);
    // Only the post is solid; the board overhangs.
    const post = scene.add.circle(x, y, 5).setVisible(false);
    scene.physics.add.existing(post, true);
    (post.body as Phaser.Physics.Arcade.StaticBody).setCircle(5);
    staticGroup.add(post);
  }

  sortPoint(): Pt {
    return { x: this.x, y: this.y };
  }

  render(g: Phaser.GameObjects.Graphics, p: Projection): Bounds {
    const outline = this.highlighted ? HIGHLIGHT : OUTLINE;
    const ow = this.highlighted ? 3 : 1.5;
    const b = emptyBounds();
    if (p.upright) {
      prism(g, p, circlePts(this.x, this.y, 4, 10), 0, 1.0 * M, { colour: 0x5a3f24, outline: null }, b);
      prism(g, p, rectPts(this.x - 24, this.y - 2, 48, 4), 0.95 * M, 0.35 * M, { colour: 0x9a7448, outline, outlineWidth: ow }, b);
    } else {
      prism(g, p, rectPts(this.rect.x, this.rect.y, this.rect.width, this.rect.height), 0, 0, { colour: 0x9a7448, outline, outlineWidth: ow }, b);
      const c = p.toScreen(this.x, this.y);
      g.fillStyle(0x5a3f24, 1);
      g.fillCircle(c.x, c.y, 4);
    }
    return b;
  }

  hitTest(x: number, y: number): boolean {
    const r = Phaser.Geom.Rectangle.Clone(this.rect);
    Phaser.Geom.Rectangle.Inflate(r, 4, 6);
    return r.contains(x, y);
  }

  closestPoint(x: number, y: number): Phaser.Math.Vector2 {
    return clampToRect(this.rect, x, y);
  }

  options(): MenuOption[] {
    return [{ id: 'read', label: 'Read', icon: '📜' }];
  }

  idleUse(): string | null {
    return 'read';
  }

  perform(_optionId: string, ctx: InteractContext): void {
    ctx.say(`The sign reads: "${this.text}"`);
  }

  setHighlight(on: boolean): void {
    this.highlighted = on;
  }
}

/**
 * A glazed window with shutters, set into a wall. PLACEHOLDER (the setting
 * isn't final, so it has both):
 * - the glass opens inwards and can be latched, but only from inside the room;
 * - the shutters, outside, open and close from either side;
 * - you can see through the glass, but not through closed shutters;
 * - closed glass or shutters muffle sound like the wall; fully open, sound carries;
 * - it always blocks walking, but you can climb through when glass and shutters are both open.
 */
export class Window implements Interactable {
  readonly name = 'window';
  private glassOpen = false;
  private shuttersOpen = true;
  private latched = false;
  private highlighted = false;
  readonly rect: Phaser.Geom.Rectangle;
  /** Unit ground direction pointing into the room. */
  readonly inward: Pt;
  /** Set each frame: is its wall cut down (cutaway / walls down)? Then the window isn't drawn above the sill. */
  cut = false;
  /**
   * Second layer for the shutters, which sit on the outside face of the wall.
   * The glass (drawn on the main layer) sits inside the opening, behind the wall
   * above and below it; the shutters sit in front of it. Set by the scene.
   */
  outerG: Phaser.GameObjects.Graphics | null = null;
  static readonly SILL = 0.9 * M;
  static readonly HEAD = 1.8 * M;

  constructor(scene: Phaser.Scene, staticGroup: Phaser.Physics.Arcade.StaticGroup, x: number, y: number, w: number, h: number, inward: Pt) {
    this.rect = new Phaser.Geom.Rectangle(x, y, w, h);
    this.inward = inward;
    const body = scene.add.rectangle(x + w / 2, y + h / 2, w, h).setVisible(false);
    scene.physics.add.existing(body, true);
    staticGroup.add(body);
  }

  /** Can someone climb through? */
  get passable(): boolean {
    return this.glassOpen && this.shuttersOpen;
  }

  /** Do closed shutters block the view through it? */
  get blocksSight(): boolean {
    return !this.shuttersOpen;
  }

  /** Is anything closed across it (muffling sound)? */
  get muffles(): boolean {
    return !this.passable;
  }

  get centre(): Pt {
    return { x: this.rect.centerX, y: this.rect.centerY };
  }

  /** Is this point on the room side of the window? */
  isInside(p: Pt): boolean {
    return (p.x - this.rect.centerX) * this.inward.x + (p.y - this.rect.centerY) * this.inward.y > 0;
  }

  /** The window's centre line, for sight/sound checks. */
  segment(): [Pt, Pt] {
    const r = this.rect;
    return r.width >= r.height
      ? [
          { x: r.x, y: r.centerY },
          { x: r.right, y: r.centerY },
        ]
      : [
          { x: r.centerX, y: r.y },
          { x: r.centerX, y: r.bottom },
        ];
  }

  sortPoint(p: Projection): Pt {
    return frontCorner(this.rect, p);
  }

  render(g: Phaser.GameObjects.Graphics, p: Projection): Bounds {
    const r = this.rect;
    const b = emptyBounds();
    const outline = this.highlighted ? HIGHLIGHT : OUTLINE;
    const ow = this.highlighted ? 3 : 1.5;

    const gs = this.outerG ?? g;
    this.outerG?.clear();
    if (p.upright && this.cut) {
      // Its wall is cut down below the window: nothing to draw above the sill, but keep it clickable
      // (and outlined when hovered).
      const sill = rectPts(r.x, r.y, r.width, r.height);
      if (this.highlighted) prism(g, p, sill, 0, 0.36 * M, { colour: 0, alpha: 0, outline, outlineWidth: 3 }, b);
      else prismBounds(p, sill, 0, 0.36 * M, b);
      return b;
    }

    const horizontal = r.width >= r.height;
    const span = horizontal ? r.width : r.height;
    const along = horizontal ? 0 : Math.PI / 2;
    const [a0, a1] = this.segment();
    const inAngle = Math.atan2(this.inward.y, this.inward.x);
    const z0 = p.upright ? Window.SILL : 0;
    const zh = p.upright ? Window.HEAD - Window.SILL : 0;
    const shift = (q: Pt, d: number): Pt => ({ x: q.x + this.inward.x * d, y: q.y + this.inward.y * d });

    // Draw back-to-front-ish: things on the far side from the viewer first.
    const parts: { depth: number; draw: () => void }[] = [];
    const depthOf = (q: Pt) => p.depth(q.x, q.y);

    // Glass: a pale, see-through pane in a thin frame, set slightly inside; opens inwards as two casements.
    const glass = { colour: 0xbfd8e6, top: 0xd5e6ef, alpha: 0.38, outline, outlineWidth: ow };
    if (this.glassOpen) {
      const g0 = shift(a0, 3);
      const g1 = shift(a1, 3);
      parts.push({ depth: depthOf(shift(this.centre, span / 4)), draw: () => prism(g, p, slabPts(g0.x, g0.y, inAngle, span / 2 - 2, 3), z0, zh, glass, b) });
      parts.push({ depth: depthOf(shift(this.centre, span / 4)), draw: () => prism(g, p, slabPts(g1.x, g1.y, inAngle, span / 2 - 2, 3), z0, zh, glass, b) });
    } else {
      const gp = shift(a0, 3);
      parts.push({
        depth: depthOf(shift(this.centre, 3)),
        draw: () => {
          prism(g, p, slabPts(gp.x, gp.y, along, span, 3), z0, zh, glass, b);
          // Glazing bars.
          const mid = { x: (a0.x + a1.x) / 2, y: (a0.y + a1.y) / 2 };
          const m = shift(mid, 3);
          const lo = p.toScreen(m.x, m.y, z0);
          const hi = p.toScreen(m.x, m.y, z0 + zh);
          g.lineStyle(1.5, 0x5a4a3a, 0.9);
          g.lineBetween(lo.x, lo.y, hi.x, hi.y);
          if (this.latched) {
            // The latch on the inside.
            const l = shift(mid, 6);
            prism(g, p, slabPts(l.x - 4 * Math.cos(along), l.y - 4 * Math.sin(along), along, 8, 3), p.upright ? z0 + zh * 0.45 : 0, p.upright ? 0.08 * M : 0, { colour: 0x2e2e2e, outline: 0x111111, outlineWidth: 1 }, b);
          }
        },
      });
    }

    parts.sort((x, y) => x.depth - y.depth).forEach((part) => part.draw());

    // Shutters: wooden leaves just proud of the outside face of the wall (their own layer, in front
    // of the wall). Open, they fold right back flat against it, either side of the opening.
    const wood = { colour: 0x6b4a2b, top: 0x7a5634, outline, outlineWidth: ow };
    const face = (horizontal ? r.height : r.width) / 2 + 3;
    if (this.shuttersOpen) {
      const leaf = span / 2 - 2;
      const drawLeaf = (hinge: Pt, dir: number) => {
        prism(gs, p, slabPts(hinge.x, hinge.y, dir, leaf, 4), z0, zh, wood, b);
        const m = { x: hinge.x + Math.cos(dir) * (leaf / 2) - this.inward.x * 2, y: hinge.y + Math.sin(dir) * (leaf / 2) - this.inward.y * 2 };
        const lo = p.toScreen(m.x, m.y, z0 + 2);
        const hi = p.toScreen(m.x, m.y, z0 + zh - 2);
        gs.lineStyle(1, 0x3a2716, 0.8);
        gs.lineBetween(lo.x, lo.y, hi.x, hi.y);
      };
      drawLeaf(shift(a0, -face), along + Math.PI);
      drawLeaf(shift(a1, -face), along);
    } else {
      // Closed: across the opening, flush against the outside face.
      const sp = shift(a0, -face);
      prism(gs, p, slabPts(sp.x, sp.y, along, span, 4), z0, zh, wood, b);
      const mid = shift({ x: (a0.x + a1.x) / 2, y: (a0.y + a1.y) / 2 }, -face - 2);
      const lo = p.toScreen(mid.x, mid.y, z0);
      const hi = p.toScreen(mid.x, mid.y, z0 + zh);
      gs.lineStyle(1.5, 0x3a2716, 1);
      gs.lineBetween(lo.x, lo.y, hi.x, hi.y);
    }


    if (!p.upright) {
      // Seen from above: outline the opening so it reads as a window.
      g.lineStyle(1, 0x2c2822, 0.6);
      g.strokeRect(r.x, r.y, r.width, r.height);
    }
    return b;
  }

  hitTest(x: number, y: number): boolean {
    const r = Phaser.Geom.Rectangle.Clone(this.rect);
    Phaser.Geom.Rectangle.Inflate(r, 6, 6);
    return r.contains(x, y);
  }

  closestPoint(x: number, y: number): Phaser.Math.Vector2 {
    return clampToRect(this.rect, x, y);
  }

  options(actor?: Pt): MenuOption[] {
    const inside = actor ? this.isInside(actor) : true;
    const opts: MenuOption[] = [];
    if (this.glassOpen) opts.push({ id: 'closeWindow', label: 'Close window', icon: '🪟' });
    else opts.push({ id: 'openWindow', label: 'Open window', icon: '🪟', disabled: this.latched ? 'Latched' : undefined });
    if (!this.glassOpen) {
      opts.push(
        this.latched
          ? { id: 'unlatch', label: 'Unlatch', icon: '🔓', disabled: inside ? undefined : 'Only from inside' }
          : { id: 'latch', label: 'Latch', icon: '🔒', disabled: inside ? undefined : 'Only from inside' },
      );
    }
    opts.push(this.shuttersOpen ? { id: 'closeShutters', label: 'Close shutters', icon: '🚪' } : { id: 'openShutters', label: 'Open shutters', icon: '🚪' });
    // Climbing opens it up first if needed; only a latch (seen from outside) stops you.
    opts.push({ id: 'climb', label: 'Climb through', icon: '🧗', disabled: !inside && this.latched ? 'Latched' : undefined });
    return opts;
  }

  /** Idle characters sometimes open up or shut the window (an everyday thing). */
  idleUse(): string | null {
    if (!this.shuttersOpen) return 'openShutters';
    if (!this.glassOpen) return this.latched ? 'closeShutters' : 'openWindow';
    return 'closeWindow';
  }

  get isLatched(): boolean {
    return this.latched;
  }

  /**
   * Could someone standing at `from` get through? From inside, always (they can
   * unlatch it). From outside, only if it isn't latched.
   */
  canGetThrough(from: Pt): boolean {
    return this.isInside(from) || !this.latched;
  }

  /** Open it right up to climb through. From outside a latched window this fails. */
  openUp(from: Pt): boolean {
    if (!this.canGetThrough(from)) return false;
    this.latched = false;
    this.glassOpen = true;
    this.shuttersOpen = true;
    return true;
  }

  perform(optionId: string, ctx: InteractContext): void {
    switch (optionId) {
      case 'openWindow':
        if (this.latched) return ctx.say('The window is latched.');
        this.glassOpen = true;
        return ctx.say('You open the window.');
      case 'closeWindow':
        this.glassOpen = false;
        return ctx.say('You close the window.');
      case 'latch':
        if (this.glassOpen) return;
        this.latched = true;
        return ctx.say('You latch the window.');
      case 'unlatch':
        this.latched = false;
        return ctx.say('You unlatch the window.');
      case 'openShutters':
        this.shuttersOpen = true;
        return ctx.say('You open the shutters.');
      case 'closeShutters':
        this.shuttersOpen = false;
        return ctx.say('You close the shutters.');
    }
  }

  setHighlight(on: boolean): void {
    this.highlighted = on;
  }
}
