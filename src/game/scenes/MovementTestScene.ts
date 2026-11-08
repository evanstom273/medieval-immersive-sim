import Phaser from 'phaser';
import { hudChannel, messageChannel, type ControlMode } from '../bridge';
import { createMotorState, speedOf, stepMotor, toggleCrouch, type MotorInput, type MotorState } from '../movement/motor';
import { PX_PER_METRE, tuning } from '../movement/tuning';
import { NavGrid, type Obstacle, type Point } from '../navigation/NavGrid';
import { CharacterView, handOffset, PUNCH_EXTEND, PUNCH_TOTAL, type CharacterPose, type Hand } from '../world/CharacterView';
import { Chest, Door, Sign, type InteractContext, type Interactable } from '../world/interactables';

/**
 * PLACEHOLDER test scene for direct control: an open field, a small house
 * with a door, a chest, a sign, crates, a well, a narrow gap, and a dummy.
 */

const WORLD_W = 2560;
const WORLD_H = 1792;
const BODY_RADIUS = 16; // ≈ 0.25 m
/** How far from the body's centre the character can reach to use something. */
const REACH = 0.95 * PX_PER_METRE;

const KEY = Phaser.Input.Keyboard.KeyCodes;

interface Dummy {
  x: number;
  y: number;
  radius: number;
  view: Phaser.GameObjects.Graphics;
  hits: number;
}

export class MovementTestScene extends Phaser.Scene {
  private playerBody!: Phaser.Physics.Arcade.Body;
  private view!: CharacterView;
  private motor: MotorState = createMotorState(0);
  private mode: ControlMode = 'explore';
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'sprint' | 'crouch' | 'combat' | 'debug', Phaser.Input.Keyboard.Key>;

  private interactables: Interactable[] = [];
  private hovered: Interactable | null = null;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  private nav = new NavGrid(WORLD_W, WORLD_H, 8);
  /** Click-to-use target we're walking toward, and the route there. */
  private walkTarget: Interactable | null = null;
  private walkPath: Point[] = [];
  private walkProgress = { best: Infinity, stuckFor: 0 };
  /** Briefly turn to face something after using it. */
  private look: { angle: number; until: number } | null = null;

  private dummy!: Dummy;
  private pose: CharacterPose = {
    mode: 'explore',
    crouched: false,
    stridePhase: 0,
    strideAmount: 0,
    punch: { left: null, right: null },
  };
  private hudTimer = 0;
  private removeKeyGuard?: () => void;

  constructor() {
    super('movement-test');
  }

  create(): void {
    this.physics.world.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBounds(0, 0, WORLD_W, WORLD_H);
    this.cameras.main.setBackgroundColor('#5d6b45');

    this.drawGround();
    const solids = this.physics.add.staticGroup();
    this.solids = solids;
    this.buildWorld(solids);

    // Player body: a circle collider; the view is drawn separately on top.
    const start = { x: 760, y: 900 };
    const bodyObj = this.add.circle(start.x, start.y, BODY_RADIUS).setVisible(false);
    this.physics.add.existing(bodyObj);
    this.playerBody = bodyObj.body as Phaser.Physics.Arcade.Body;
    this.playerBody.setCircle(BODY_RADIUS);
    this.playerBody.setCollideWorldBounds(true);
    this.physics.add.collider(bodyObj, solids);
    this.view = new CharacterView(this, start.x, start.y).setDepth(20);

    this.cameras.main.startFollow(bodyObj, true, 0.14, 0.14);

    this.setupInput();
    this.say('Click things to use them. R readies for combat. F3 shows collision.');
  }

  // ---------------------------------------------------------------- world

  private drawGround(): void {
    const g = this.add.graphics().setDepth(0);
    // 1 m grid, heavier every 5 m — a speed and scale reference while tuning.
    for (let x = 0; x <= WORLD_W; x += PX_PER_METRE) {
      const major = (x / PX_PER_METRE) % 5 === 0;
      g.lineStyle(1, 0x000000, major ? 0.16 : 0.06);
      g.lineBetween(x, 0, x, WORLD_H);
    }
    for (let y = 0; y <= WORLD_H; y += PX_PER_METRE) {
      const major = (y / PX_PER_METRE) % 5 === 0;
      g.lineStyle(1, 0x000000, major ? 0.16 : 0.06);
      g.lineBetween(0, y, WORLD_W, y);
    }
  }

  private wall(solids: Phaser.Physics.Arcade.StaticGroup, x: number, y: number, w: number, h: number, colour = 0x8c8475): void {
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
    const floor = this.add.rectangle(hx + hw / 2, hy + hh / 2, hw, hh, 0x8a7356).setDepth(1);
    floor.setStrokeStyle(0);
    this.wall(solids, hx, hy, hw, t); // north
    this.wall(solids, hx, hy, t, hh); // west
    this.wall(solids, hx + hw - t, hy, t, hh); // east
    this.wall(solids, hx, hy + hh - t, doorX - hx, t); // south, left of door
    this.wall(solids, doorX + doorW, hy + hh - t, hx + hw - (doorX + doorW), t); // south, right of door

    const door = new Door(this, solids, doorX, hy + hh - t / 2, doorW, 10, -Math.PI / 2);
    const chest = new Chest(this, solids, hx + hw - 90, hy + 70, 56, 36);
    const sign = new Sign(this, solids, 920, 760, 'Movement test. Mind the dummy.');
    this.interactables.push(door, chest, sign);

    // Crates: something to slide along and get caught on.
    for (const [cx, cy] of [
      [640, 512],
      [688, 512],
      [640, 560],
    ]) {
      this.wall(solids, cx, cy, 46, 46, 0x9b7a4c);
    }

    // Well: a round obstacle.
    const well = this.add.circle(512, 1280, 44, 0x7f7a70).setStrokeStyle(3, 0x2c2822).setDepth(10);
    this.physics.add.existing(well, true);
    (well.body as Phaser.Physics.Arcade.StaticBody).setCircle(44);
    solids.add(well);
    this.add.circle(512, 1280, 28, 0x1f2a33).setDepth(11);

    // Narrow gap: 0.75 m — wide enough to pass, tight enough to test sliding.
    this.wall(solids, 1408, 1344, 320, 24, 0x6f6a5f);
    this.wall(solids, 1408 + 320 + 48, 1344, 320, 24, 0x6f6a5f);

    // Training dummy.
    const dx = 1024;
    const dy = 1216;
    const dummyBody = this.add.circle(dx, dy, 14).setVisible(false);
    this.physics.add.existing(dummyBody, true);
    (dummyBody.body as Phaser.Physics.Arcade.StaticBody).setCircle(14);
    solids.add(dummyBody);
    const view = this.add.graphics({ x: dx, y: dy }).setDepth(15);
    this.dummy = { x: dx, y: dy, radius: 14, view, hits: 0 };
    this.drawDummy(false);
  }

  private drawDummy(flash: boolean): void {
    const g = this.dummy.view;
    g.clear();
    g.fillStyle(0x000000, 0.2);
    g.fillEllipse(2, 2, 26, 50);
    g.lineStyle(2, 0x231a12, 1);
    g.fillStyle(flash ? 0xf0dca0 : 0xc9a65f, 1);
    g.fillRect(-4, -24, 8, 48); // crossbar arms
    g.strokeRect(-4, -24, 8, 48);
    g.fillCircle(0, 0, 14);
    g.strokeCircle(0, 0, 14);
    g.fillStyle(0x6b4a2b, 1);
    g.fillCircle(0, 0, 4);
  }

  // ---------------------------------------------------------------- input

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
        debug: KEY.F3,
      },
      true,
    ) as typeof this.keys;

    // Stop the browser acting on Ctrl+<movement key> combos (bookmark, save, reload, etc.).
    // Registered in the bubble phase AFTER Phaser's listener: Phaser ignores events that are
    // already defaultPrevented, so blocking them any earlier would swallow the key.
    const guard = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['w', 'a', 's', 'd', 'r'].includes(e.key.toLowerCase())) e.preventDefault();
      if (e.key === 'F3') e.preventDefault();
    };
    window.addEventListener('keydown', guard);
    this.removeKeyGuard = () => window.removeEventListener('keydown', guard);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.removeKeyGuard?.());

    // Losing focus (alt-tab) shouldn't leave keys stuck down.
    this.game.events.on(Phaser.Core.Events.BLUR, () => kb.resetKeys());

    this.input.mouse?.disableContextMenu();
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.onPointerDown(p));
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (this.mode === 'combat') {
      if (p.leftButtonDown()) this.punch('right');
      else if (p.rightButtonDown()) this.punch('left');
      return;
    }
    if (!p.leftButtonDown()) return;
    const world = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const target = this.interactableAt(world.x, world.y);
    if (!target) return;
    if (this.inReach(target)) this.use(target);
    else this.planWalk(target);
  }

  /** Current solid obstacles, from the enabled static bodies (so open doors don't count). */
  private obstacles(): Obstacle[] {
    const out: Obstacle[] = [];
    for (const child of this.solids.getChildren()) {
      const b = (child as Phaser.GameObjects.GameObject).body as Phaser.Physics.Arcade.StaticBody | null;
      if (!b || !b.enable) continue;
      if (b.isCircle) out.push({ kind: 'circle', x: b.center.x, y: b.center.y, r: b.halfWidth });
      else out.push({ kind: 'rect', x: b.x, y: b.y, w: b.width, h: b.height });
    }
    return out;
  }

  private planWalk(target: Interactable): void {
    // Rebuilt per request: cheap at this size, and always reflects doors as they are now.
    this.nav.build(this.obstacles(), BODY_RADIUS + 2);
    const start = { x: this.playerBody.center.x, y: this.playerBody.center.y };
    const aim = target.closestPoint(start.x, start.y);
    const path = this.nav.findPath(
      start,
      (p) => {
        const q = target.closestPoint(p.x, p.y);
        return Math.hypot(q.x - p.x, q.y - p.y) <= REACH * 0.85;
      },
      { x: aim.x, y: aim.y },
    );
    if (!path) {
      this.walkTarget = null;
      this.say("You can't find a way to reach that.");
      return;
    }
    this.walkTarget = target;
    this.walkPath = path;
    this.walkProgress = { best: Infinity, stuckFor: 0 };
  }

  private interactableAt(x: number, y: number): Interactable | null {
    for (let i = this.interactables.length - 1; i >= 0; i--) {
      if (this.interactables[i].hitTest(x, y)) return this.interactables[i];
    }
    return null;
  }

  private distanceTo(target: Interactable): number {
    const p = target.closestPoint(this.playerBody.center.x, this.playerBody.center.y);
    return Phaser.Math.Distance.Between(this.playerBody.center.x, this.playerBody.center.y, p.x, p.y);
  }

  private inReach(target: Interactable): boolean {
    return this.distanceTo(target) <= REACH;
  }

  private use(target: Interactable): void {
    this.walkTarget = null;
    const p = target.closestPoint(this.playerBody.center.x, this.playerBody.center.y);
    this.look = {
      angle: Math.atan2(p.y - this.playerBody.center.y, p.x - this.playerBody.center.x),
      until: this.time.now + 500,
    };
    const ctx: InteractContext = {
      say: (m) => this.say(m),
      playerBlocks: (rect) =>
        Phaser.Geom.Intersects.CircleToRectangle(new Phaser.Geom.Circle(this.playerBody.center.x, this.playerBody.center.y, BODY_RADIUS), rect),
    };
    target.interact(ctx);
  }

  private punch(hand: Hand): void {
    if (this.pose.punch[hand] !== null) return;
    this.pose.punch[hand] = 0;
  }

  private say(message: string): void {
    messageChannel.emit(message);
  }

  // ---------------------------------------------------------------- update

  update(time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    const k = this.keys;

    if (Phaser.Input.Keyboard.JustDown(k.combat)) {
      this.mode = this.mode === 'explore' ? 'combat' : 'explore';
      this.walkTarget = null;
      this.pose.punch = { left: null, right: null };
    }
    if (Phaser.Input.Keyboard.JustDown(k.crouch)) this.motor = toggleCrouch(this.motor);
    if (Phaser.Input.Keyboard.JustDown(k.debug)) this.toggleDebug();

    const pointer = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const cx = this.playerBody.center.x;
    const cy = this.playerBody.center.y;

    // Keyboard movement; any key press cancels click-to-walk.
    let move = { x: (k.right.isDown ? 1 : 0) - (k.left.isDown ? 1 : 0), y: (k.down.isDown ? 1 : 0) - (k.up.isDown ? 1 : 0) };
    if (move.x !== 0 || move.y !== 0) this.walkTarget = null;
    if (this.walkTarget) move = this.stepWalkTarget(dt);

    const input: MotorInput = {
      move,
      sprint: k.sprint.isDown,
      aimAngle: this.mode === 'combat' ? Math.atan2(pointer.y - cy, pointer.x - cx) : null,
      lookAngle: this.look && time < this.look.until ? this.look.angle : null,
    };

    // Start from the physics body's real velocity so walls bleed momentum instead of it building up.
    this.motor = stepMotor({ ...this.motor, vx: this.playerBody.velocity.x, vy: this.playerBody.velocity.y }, input, tuning, dt);
    this.playerBody.setVelocity(this.motor.vx, this.motor.vy);

    this.updatePose(dt);
    this.updateHover(pointer.x, pointer.y);
    this.view.update(cx, cy, this.motor.facing, this.pose);

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      hudChannel.emit({
        mode: this.mode,
        gait: this.motor.gait,
        crouched: this.motor.crouched,
        speed: speedOf(this.motor) / PX_PER_METRE,
      });
    }
  }

  /** Follow the planned route to the click target; give up if something stops us making progress. */
  private stepWalkTarget(dt: number): { x: number; y: number } {
    const target = this.walkTarget!;
    if (this.inReach(target)) {
      this.use(target);
      return { x: 0, y: 0 };
    }
    const cx = this.playerBody.center.x;
    const cy = this.playerBody.center.y;
    while (this.walkPath.length > 1 && Math.hypot(this.walkPath[0].x - cx, this.walkPath[0].y - cy) < 6) {
      this.walkPath.shift();
      this.walkProgress = { best: Infinity, stuckFor: 0 };
    }
    // Final leg: head for the object itself.
    const wp = this.walkPath[0] ?? target.closestPoint(cx, cy);
    const dx = wp.x - cx;
    const dy = wp.y - cy;
    const d = Math.hypot(dx, dy);
    if (d < this.walkProgress.best - 1) {
      this.walkProgress = { best: d, stuckFor: 0 };
    } else {
      this.walkProgress.stuckFor += dt;
      if (this.walkProgress.stuckFor > 0.8) {
        this.walkTarget = null;
        this.say('Something is in the way.');
        return { x: 0, y: 0 };
      }
    }
    if (d < 1) return { x: 0, y: 0 };
    return { x: dx / d, y: dy / d };
  }

  private updatePose(dt: number): void {
    const pose = this.pose;
    pose.mode = this.mode;
    pose.crouched = this.motor.crouched;
    const speed = speedOf(this.motor);
    // Arms swing once per ~1.4 m of travel, more at higher speed.
    pose.stridePhase += (speed * dt * Math.PI * 2) / (1.4 * PX_PER_METRE);
    pose.strideAmount = Phaser.Math.Clamp(speed / (tuning.sprintSpeed * PX_PER_METRE), 0, 1) * 0.6 + (speed > 1 ? 0.4 : 0);

    for (const hand of ['left', 'right'] as const) {
      const t = pose.punch[hand];
      if (t === null) continue;
      const next = t + dt;
      if (t < PUNCH_EXTEND && next >= PUNCH_EXTEND) this.resolvePunch(hand);
      pose.punch[hand] = next >= PUNCH_TOTAL ? null : next;
    }
  }

  private resolvePunch(hand: Hand): void {
    // Hand position at full extension, in world space.
    const local = handOffset(hand, { ...this.pose, punch: { ...this.pose.punch, [hand]: PUNCH_EXTEND } });
    const a = this.motor.facing;
    const wx = this.playerBody.center.x + local.x * Math.cos(a) - local.y * Math.sin(a);
    const wy = this.playerBody.center.y + local.x * Math.sin(a) + local.y * Math.cos(a);
    const d = this.dummy;
    if (Phaser.Math.Distance.Between(wx, wy, d.x, d.y) <= d.radius + 6) {
      d.hits++;
      this.say(`Your ${hand} hand hits the dummy. (${d.hits})`);
      this.drawDummy(true);
      this.time.delayedCall(90, () => this.drawDummy(false));
      const away = Math.atan2(d.y - this.playerBody.center.y, d.x - this.playerBody.center.x);
      this.tweens.add({
        targets: d.view,
        x: d.x + Math.cos(away) * 4,
        y: d.y + Math.sin(away) * 4,
        duration: 60,
        yoyo: true,
        ease: 'Quad.easeOut',
      });
    }
  }

  private updateHover(px: number, py: number): void {
    const next = this.mode === 'explore' ? this.interactableAt(px, py) : null;
    if (next !== this.hovered) {
      this.hovered?.setHighlight(false);
      next?.setHighlight(true);
      this.hovered = next;
    }
    this.game.canvas.style.cursor = this.mode === 'combat' ? 'crosshair' : next ? 'pointer' : 'default';
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
