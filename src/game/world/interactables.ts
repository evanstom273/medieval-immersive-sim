import Phaser from 'phaser';
import { PX_PER_METRE } from '../movement/tuning';
import { circlePts, emptyBounds, flat, HIGHLIGHT, OUTLINE, prism, rectPts, slabPts, type Bounds } from '../view/draw';
import type { Projection, Pt } from '../view/projection';
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
  /** What can be done with it right now. */
  options(): MenuOption[];
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
