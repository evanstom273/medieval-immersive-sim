import Phaser from 'phaser';

/**
 * PLACEHOLDER interactable objects for the movement test scene.
 * Each is its own object (not baked into the building), per the art spec.
 */

export interface InteractContext {
  say(message: string): void;
  /** Is the given circle (e.g. the player's body) overlapping this rectangle in world space? */
  playerBlocks(rect: Phaser.Geom.Rectangle): boolean;
}

export interface Interactable {
  readonly name: string;
  /** Does the world point land on this object? */
  hitTest(x: number, y: number): boolean;
  /** Closest point on the object to a world point, for reach checks. */
  closestPoint(x: number, y: number): Phaser.Math.Vector2;
  interact(ctx: InteractContext): void;
  setHighlight(on: boolean): void;
}

const OUTLINE = 0x231a12;
const HIGHLIGHT = 0xf3d27a;

function clampToRect(r: Phaser.Geom.Rectangle, x: number, y: number): Phaser.Math.Vector2 {
  return new Phaser.Math.Vector2(Phaser.Math.Clamp(x, r.left, r.right), Phaser.Math.Clamp(y, r.top, r.bottom));
}

/** A hinged door. The leaf swings 90° about the hinge; collision is removed while open. */
export class Door implements Interactable {
  readonly name = 'door';
  private open = false;
  private highlighted = false;
  private readonly leaf: Phaser.GameObjects.Graphics;
  private readonly blocker: Phaser.GameObjects.Rectangle;
  private readonly closedRect: Phaser.Geom.Rectangle;

  /**
   * @param hingeX,hingeY  hinge position (left end of the leaf when closed)
   * @param length         leaf length (the doorway width)
   * @param thickness      leaf thickness
   * @param openAngle      rotation when open (radians), e.g. -π/2 to swing "up"
   */
  constructor(
    private readonly scene: Phaser.Scene,
    staticGroup: Phaser.Physics.Arcade.StaticGroup,
    private readonly hingeX: number,
    private readonly hingeY: number,
    private readonly length: number,
    private readonly thickness: number,
    private readonly openAngle: number,
  ) {
    this.closedRect = new Phaser.Geom.Rectangle(hingeX, hingeY - thickness / 2, length, thickness);
    this.blocker = scene.add.rectangle(this.closedRect.centerX, this.closedRect.centerY, length, thickness);
    this.blocker.setVisible(false);
    scene.physics.add.existing(this.blocker, true);
    staticGroup.add(this.blocker);

    this.leaf = scene.add.graphics({ x: hingeX, y: hingeY }).setDepth(12);
    this.draw();
  }

  private draw(): void {
    const g = this.leaf;
    g.clear();
    g.fillStyle(0x6b4a2b, 1);
    g.lineStyle(this.highlighted ? 3 : 2, this.highlighted ? HIGHLIGHT : OUTLINE, 1);
    g.fillRect(0, -this.thickness / 2, this.length, this.thickness);
    g.strokeRect(0, -this.thickness / 2, this.length, this.thickness);
    // Planks.
    g.lineStyle(1, 0x4a321c, 1);
    for (let x = 16; x < this.length; x += 16) g.lineBetween(x, -this.thickness / 2 + 1, x, this.thickness / 2 - 1);
    // Hinge pin.
    g.fillStyle(0x3a3a3a, 1);
    g.fillCircle(0, 0, 3);
  }

  /** Transform a world point into the leaf's local frame. */
  private toLocal(x: number, y: number): Phaser.Math.Vector2 {
    const a = -this.leaf.rotation;
    const dx = x - this.hingeX;
    const dy = y - this.hingeY;
    return new Phaser.Math.Vector2(dx * Math.cos(a) - dy * Math.sin(a), dx * Math.sin(a) + dy * Math.cos(a));
  }

  private localRect(): Phaser.Geom.Rectangle {
    return new Phaser.Geom.Rectangle(0, -this.thickness / 2, this.length, this.thickness);
  }

  hitTest(x: number, y: number): boolean {
    const p = this.toLocal(x, y);
    const r = this.localRect();
    Phaser.Geom.Rectangle.Inflate(r, 4, 6);
    return r.contains(p.x, p.y);
  }

  closestPoint(x: number, y: number): Phaser.Math.Vector2 {
    const local = clampToRect(this.localRect(), this.toLocal(x, y).x, this.toLocal(x, y).y);
    const a = this.leaf.rotation;
    return new Phaser.Math.Vector2(
      this.hingeX + local.x * Math.cos(a) - local.y * Math.sin(a),
      this.hingeY + local.x * Math.sin(a) + local.y * Math.cos(a),
    );
  }

  interact(ctx: InteractContext): void {
    if (this.open) {
      if (ctx.playerBlocks(this.closedRect)) {
        ctx.say("You can't close the door while you're standing in the doorway.");
        return;
      }
      this.open = false;
      (this.blocker.body as Phaser.Physics.Arcade.StaticBody).enable = true;
      ctx.say('You close the door.');
    } else {
      this.open = true;
      (this.blocker.body as Phaser.Physics.Arcade.StaticBody).enable = false;
      ctx.say('You open the door.');
    }
    this.scene.tweens.add({
      targets: this.leaf,
      rotation: this.open ? this.openAngle : 0,
      duration: 260,
      ease: 'Quad.easeOut',
    });
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

  interact(ctx: InteractContext): void {
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

  interact(ctx: InteractContext): void {
    ctx.say(`The sign reads: "${this.text}"`);
  }

  setHighlight(on: boolean): void {
    if (on === this.highlighted) return;
    this.highlighted = on;
    this.draw();
  }
}
