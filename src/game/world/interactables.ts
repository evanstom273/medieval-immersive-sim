import Phaser from 'phaser';
import { closestOnLeaf, resolveDoorContact, stepDoor, type Circle, type ContactResult, type DoorGeom, type DoorSwing } from './doorPhysics';

/**
 * PLACEHOLDER interactable objects for the movement test scene.
 * Each is its own object (not baked into the building), per the art spec.
 */

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
  /** Does the world point land on this object? */
  hitTest(x: number, y: number): boolean;
  /** Closest point on the object to a world point, for reach checks. */
  closestPoint(x: number, y: number): Phaser.Math.Vector2;
  /** What can be done with it right now. */
  options(): MenuOption[];
  perform(optionId: string, ctx: InteractContext): void;
  /** Something an idle character might wander over and do with it, or null if nothing. */
  idleUse(): string | null;
  setHighlight(on: boolean): void;
}

const OUTLINE = 0x231a12;
const HIGHLIGHT = 0xf3d27a;

function clampToRect(r: Phaser.Geom.Rectangle, x: number, y: number): Phaser.Math.Vector2 {
  return new Phaser.Math.Vector2(Phaser.Math.Clamp(x, r.left, r.right), Phaser.Math.Clamp(y, r.top, r.bottom));
}

/**
 * A hinged door you push open by walking into it. Swings either way, and is
 * weighted to swing back shut with a thud (or softly, if eased by someone sneaking). Clicking it locks/unlocks
 * (placeholder until there's an interaction menu); a locked door won't budge.
 */
export class Door implements Interactable {
  readonly name = 'door';
  private locked = false;
  private highlighted = false;
  private swing: DoorSwing = { angle: 0, angVel: 0 };
  private readonly leaf: Phaser.GameObjects.Graphics;
  readonly geom: DoorGeom;

  /**
   * @param hingeX,hingeY  hinge position
   * @param length         leaf length (the doorway width)
   * @param thickness      leaf thickness
   * @param baseAngle      leaf direction when closed (radians)
   */
  constructor(scene: Phaser.Scene, hingeX: number, hingeY: number, length: number, thickness: number, baseAngle = 0) {
    this.geom = { hingeX, hingeY, baseAngle, length, thickness, maxAngle: Math.PI / 2 };
    this.leaf = scene.add.graphics({ x: hingeX, y: hingeY }).setDepth(12);
    this.draw();
  }

  get isLocked(): boolean {
    return this.locked;
  }

  /** Swing under the door's weight. Call once per frame. Returns thud speed (rad/s) if it hit the frame, else 0. */
  update(dt: number): number {
    const res = stepDoor(this.geom, this.swing, dt);
    this.swing = res.swing;
    this.leaf.setRotation(this.geom.baseAngle + this.swing.angle);
    return res.thud;
  }

  /** World position of the latch (free) end of the leaf. */
  latchPoint(): { x: number; y: number } {
    const a = this.geom.baseAngle + this.swing.angle;
    return { x: this.geom.hingeX + Math.cos(a) * this.geom.length, y: this.geom.hingeY + Math.sin(a) * this.geom.length };
  }

  /** Let a circular body push the door (gently, if sneaking). Returns how far to move the body to clear it. */
  pushBy(body: Circle, dt: number, sneaking = false): ContactResult {
    const res = resolveDoorContact(this.geom, this.swing, body, this.locked, dt, sneaking);
    this.swing = res.swing;
    this.leaf.setRotation(this.geom.baseAngle + this.swing.angle);
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

  private draw(): void {
    const g = this.leaf;
    const { length: len, thickness: t } = this.geom;
    g.clear();
    g.fillStyle(0x6b4a2b, 1);
    g.lineStyle(this.highlighted ? 3 : 2, this.highlighted ? HIGHLIGHT : OUTLINE, 1);
    g.fillRect(0, -t / 2, len, t);
    g.strokeRect(0, -t / 2, len, t);
    // Planks.
    g.lineStyle(1, 0x4a321c, 1);
    for (let x = 16; x < len; x += 16) g.lineBetween(x, -t / 2 + 1, x, t / 2 - 1);
    // Hinge pin.
    g.fillStyle(0x3a3a3a, 1);
    g.fillCircle(0, 0, 3);
    // Iron bolt across the latch end when locked.
    if (this.locked) {
      g.fillStyle(0x2e2e2e, 1);
      g.lineStyle(1, 0x111111, 1);
      g.fillRect(len - 14, -t / 2 - 3, 10, t + 6);
      g.strokeRect(len - 14, -t / 2 - 3, 10, t + 6);
    }
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
    this.leaf.setRotation(this.geom.baseAngle + this.swing.angle);
    ctx.say(this.locked ? 'You lock the door.' : 'You unlock the door.');
    this.draw();
  }

  setHighlight(on: boolean): void {
    if (on === this.highlighted) return;
    this.highlighted = on;
    this.draw();
  }
}

/** A chest with a lid that opens. Always solid. */
export class Chest implements Interactable {
  readonly name = 'chest';
  private open = false;
  private highlighted = false;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly rect: Phaser.Geom.Rectangle;

  constructor(scene: Phaser.Scene, staticGroup: Phaser.Physics.Arcade.StaticGroup, x: number, y: number, w: number, h: number) {
    this.rect = new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h);
    const body = scene.add.rectangle(x, y, w, h).setVisible(false);
    scene.physics.add.existing(body, true);
    staticGroup.add(body);
    this.g = scene.add.graphics().setDepth(11);
    this.draw();
  }

  private draw(): void {
    const { g, rect: r } = this;
    g.clear();
    g.fillStyle(0x000000, 0.2);
    g.fillRect(r.x + 3, r.y + 3, r.width, r.height);
    if (this.open) {
      // Interior, then the lid flipped back behind the chest.
      g.fillStyle(0x2b1c10, 1);
      g.fillRect(r.x, r.y, r.width, r.height);
      g.fillStyle(0x7a5532, 1);
      g.fillRect(r.x, r.y - r.height * 0.55, r.width, r.height * 0.55);
      g.lineStyle(2, OUTLINE, 1);
      g.strokeRect(r.x, r.y - r.height * 0.55, r.width, r.height * 0.55);
      g.lineStyle(4, 0x7a5532, 1);
      g.strokeRect(r.x + 2, r.y + 2, r.width - 4, r.height - 4);
    } else {
      g.fillStyle(0x7a5532, 1);
      g.fillRect(r.x, r.y, r.width, r.height);
      g.fillStyle(0x5a5a5a, 1);
      g.fillRect(r.x + 8, r.y, 4, r.height);
      g.fillRect(r.right - 12, r.y, 4, r.height);
      g.fillStyle(0xb08d3c, 1);
      g.fillRect(r.centerX - 4, r.bottom - 8, 8, 6);
    }
    g.lineStyle(this.highlighted ? 3 : 2, this.highlighted ? HIGHLIGHT : OUTLINE, 1);
    g.strokeRect(r.x, r.y, r.width, r.height);
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
    this.draw();
  }

  setHighlight(on: boolean): void {
    if (on === this.highlighted) return;
    this.highlighted = on;
    this.draw();
  }
}

/** A signpost you can read. */
export class Sign implements Interactable {
  readonly name = 'sign';
  private highlighted = false;
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly rect: Phaser.Geom.Rectangle;

  constructor(
    scene: Phaser.Scene,
    staticGroup: Phaser.Physics.Arcade.StaticGroup,
    x: number,
    y: number,
    private readonly text: string,
  ) {
    this.rect = new Phaser.Geom.Rectangle(x - 24, y - 6, 48, 12);
    // Only the post is solid; the board overhangs.
    const post = scene.add.circle(x, y, 5).setVisible(false);
    scene.physics.add.existing(post, true);
    (post.body as Phaser.Physics.Arcade.StaticBody).setCircle(5);
    staticGroup.add(post);
    this.g = scene.add.graphics().setDepth(13);
    this.draw();
  }

  private draw(): void {
    const { g, rect: r } = this;
    g.clear();
    g.fillStyle(0x000000, 0.2);
    g.fillRect(r.x + 3, r.y + 4, r.width, r.height);
    g.fillStyle(0x9a7448, 1);
    g.fillRect(r.x, r.y, r.width, r.height);
    g.lineStyle(this.highlighted ? 3 : 2, this.highlighted ? HIGHLIGHT : OUTLINE, 1);
    g.strokeRect(r.x, r.y, r.width, r.height);
    g.fillStyle(0x5a3f24, 1);
    g.fillCircle(r.centerX, r.centerY, 4);
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
    if (on === this.highlighted) return;
    this.highlighted = on;
    this.draw();
  }
}
