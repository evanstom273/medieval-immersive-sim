import Phaser from 'phaser';
import { hudChannel, messageChannel, type ControlMode } from '../bridge';
import { createMotorState, speedOf, stepMotor, toggleCrouch, type MotorInput, type MotorState } from '../movement/motor';
import { PX_PER_METRE, tuning } from '../movement/tuning';
import { NavGrid, type Obstacle, type Point } from '../navigation/NavGrid';
import { CameraRig } from '../camera/CameraRig';
import { inputSourceChannel, touchCommands, touchStick, type InputSource, type TouchCommand } from '../input/touchInput';
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
/** Lock-on acquires targets within this range and drops them beyond LOCK_BREAK. */
const LOCK_RANGE = 6 * PX_PER_METRE;
const LOCK_BREAK = 10 * PX_PER_METRE;
/** Camera catch-up rate (per second, exponential). Frame-rate independent. */
const CAMERA_FOLLOW = 10;

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
  private keys!: Record<'up' | 'down' | 'left' | 'right' | 'sprint' | 'crouch' | 'combat' | 'lock' | 'debug', Phaser.Input.Keyboard.Key>;
  /** The player's physics game object; its position is the authoritative post-physics position. */
  private playerObj!: Phaser.GameObjects.Arc;
  private doors: Door[] = [];
  private lockedNoticeAt = -Infinity;
  private cameraFocus: { x: number; y: number } | null = null;

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

  /** Continuous zoom; future home of the direct-control ↔ overview transition. */
  readonly rig = new CameraRig();
  private inputSource: InputSource = 'mouse';
  /** Touch lock-on target (combat). */
  private lockTarget: Dummy | null = null;
  private lockRing!: Phaser.GameObjects.Graphics;

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
    this.playerObj = bodyObj;
    this.view = new CharacterView(this, start.x, start.y).setDepth(20);

    // Draw the character and move the camera AFTER physics has moved the body this frame,
    // so the two can never disagree by a frame (which reads as blur/judder when moving).
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.lateUpdate, this);

    this.lockRing = this.add.graphics().setDepth(16);

    this.setupInput();
    this.say('Click or tap things to use them.');
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

    const door = new Door(this, doorX, hy + hh - t / 2, doorW, 10);
    this.doors.push(door);
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
        lock: KEY.F,
        debug: KEY.F3,
      },
      true,
    ) as typeof this.keys;

    // Stop the browser acting on Ctrl+<movement key> combos (bookmark, save, reload, etc.).
    // Registered in the bubble phase AFTER Phaser's listener: Phaser ignores events that are
    // already defaultPrevented, so blocking them any earlier would swallow the key.
    const guard = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && ['w', 'a', 's', 'd', 'r', 'f'].includes(e.key.toLowerCase())) e.preventDefault();
      if (e.key === 'F3') e.preventDefault();
    };
    window.addEventListener('keydown', guard);
    this.removeKeyGuard = () => window.removeEventListener('keydown', guard);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.removeKeyGuard?.());

    // Losing focus (alt-tab) shouldn't leave keys stuck down.
    this.game.events.on(Phaser.Core.Events.BLUR, () => kb.resetKeys());

    this.input.mouse?.disableContextMenu();
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.onPointerDown(p));

    // Scroll wheel zoom. Lines/pages are normalised to roughly pixels.
    const canvas = this.game.canvas;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * 400 : e.deltaY;
      this.rig.zoomBy(Math.exp(Phaser.Math.Clamp(px, -200, 200) * 0.0015));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const offTouch = touchCommands.on((c) => this.onTouchCommand(c));
    this.inputSource = inputSourceChannel.last ?? 'mouse';
    const offSource = inputSourceChannel.on((src) => {
      this.inputSource = src;
      if (src === 'touch') {
        this.hovered?.setHighlight(false);
        this.hovered = null;
      }
    });
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      canvas.removeEventListener('wheel', onWheel);
      offTouch();
      offSource();
    });
  }

  private onTouchCommand(c: TouchCommand): void {
    switch (c.kind) {
      case 'zoom':
        this.rig.zoomBy(c.factor);
        break;
      case 'toggleCrouch':
        this.motor = toggleCrouch(this.motor);
        break;
      case 'toggleCombat':
        this.toggleCombat();
        break;
      case 'toggleLock':
        this.toggleLock();
        break;
      case 'punch':
        if (this.mode === 'combat') this.punch(c.hand);
        break;
      case 'tap': {
        if (this.mode === 'combat') return;
        // Container CSS px → canvas device px → world.
        const dpr = this.scale.width / Math.max(1, this.game.canvas.clientWidth);
        const world = this.cameras.main.getWorldPoint(c.x * dpr, c.y * dpr);
        this.useAt(world.x, world.y);
        break;
      }
    }
  }

  private toggleCombat(): void {
    this.mode = this.mode === 'explore' ? 'combat' : 'explore';
    this.walkTarget = null;
    this.pose.punch = { left: null, right: null };
    if (this.mode === 'explore') this.lockTarget = null;
  }

  /** Lock onto the best target nearby, preferring what's in front. Again to release. */
  private toggleLock(): void {
    if (this.mode !== 'combat') return;
    if (this.lockTarget) {
      this.lockTarget = null;
      return;
    }
    const cx = this.playerBody.center.x;
    const cy = this.playerBody.center.y;
    let best: Dummy | null = null;
    let bestScore = Infinity;
    for (const t of [this.dummy]) {
      const d = Phaser.Math.Distance.Between(cx, cy, t.x, t.y);
      if (d > LOCK_RANGE) continue;
      const off = Math.abs(Phaser.Math.Angle.Wrap(Math.atan2(t.y - cy, t.x - cx) - this.motor.facing));
      const score = d * (1 + off / Math.PI);
      if (score < bestScore) {
        bestScore = score;
        best = t;
      }
    }
    this.lockTarget = best;
    if (!best) this.say('Nothing to lock on to.');
  }

  private useAt(x: number, y: number): void {
    const target = this.interactableAt(x, y);
    if (!target) return;
    if (this.inReach(target)) this.use(target);
    else this.planWalk(target);
  }

  private onPointerDown(p: Phaser.Input.Pointer): void {
    // Touch is handled by the touch-controls layer; only the mouse comes through here.
    if (p.wasTouch) return;
    if (this.inputSource !== 'mouse') inputSourceChannel.emit('mouse');
    if (p.middleButtonDown()) {
      this.toggleLock();
      return;
    }
    if (this.mode === 'combat') {
      if (p.leftButtonDown()) this.punch('right');
      else if (p.rightButtonDown()) this.punch('left');
      return;
    }
    if (!p.leftButtonDown()) return;
    const world = p.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    this.useAt(world.x, world.y);
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
    for (const door of this.doors) {
      const o = door.navObstacle();
      if (o) out.push(o);
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
    const ctx: InteractContext = { say: (m) => this.say(m) };
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

    if (Phaser.Input.Keyboard.JustDown(k.combat)) this.toggleCombat();
    if (Phaser.Input.Keyboard.JustDown(k.lock)) this.toggleLock();
    if (Phaser.Input.Keyboard.JustDown(k.crouch)) this.motor = toggleCrouch(this.motor);
    if (Phaser.Input.Keyboard.JustDown(k.debug)) this.toggleDebug();

    const pointer = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    const cx = this.playerBody.center.x;
    const cy = this.playerBody.center.y;

    // Doors: walking into one pushes it open; a locked one stops you.
    for (const door of this.doors) {
      const thud = door.update(dt);
      if (thud > 0) this.doorThud(door, thud);
      const res = door.pushBy({ x: cx, y: cy, r: BODY_RADIUS }, dt, this.motor.crouched);
      const len = Math.hypot(res.pushX, res.pushY);
      if (len > 0) {
        this.playerObj.x += res.pushX;
        this.playerObj.y += res.pushY;
        // Kill velocity going into the door so it doesn't build up against it.
        const nx = res.pushX / len;
        const ny = res.pushY / len;
        const into = this.playerBody.velocity.x * nx + this.playerBody.velocity.y * ny;
        if (into < 0) this.playerBody.velocity.set(this.playerBody.velocity.x - nx * into, this.playerBody.velocity.y - ny * into);
      }
      if (res.touched && door.isLocked && time - this.lockedNoticeAt > 2500) {
        this.lockedNoticeAt = time;
        this.say('The door is locked.');
      }
    }

    // Keyboard, else the touch stick; either cancels click-to-walk.
    let move = { x: (k.right.isDown ? 1 : 0) - (k.left.isDown ? 1 : 0), y: (k.down.isDown ? 1 : 0) - (k.up.isDown ? 1 : 0) };
    if (move.x === 0 && move.y === 0) move = { ...touchStick.move };
    if (move.x !== 0 || move.y !== 0) this.walkTarget = null;
    if (this.walkTarget) move = this.stepWalkTarget(dt);

    // Drop a lock that's gone out of range.
    if (this.lockTarget && Phaser.Math.Distance.Between(cx, cy, this.lockTarget.x, this.lockTarget.y) > LOCK_BREAK) {
      this.lockTarget = null;
    }
    let aimAngle: number | null = null;
    if (this.mode === 'combat') {
      if (this.lockTarget) aimAngle = Math.atan2(this.lockTarget.y - cy, this.lockTarget.x - cx);
      else if (this.inputSource === 'mouse') aimAngle = Math.atan2(pointer.y - cy, pointer.x - cx);
      // Touch without a lock: facing follows movement.
    }

    const input: MotorInput = {
      move,
      // Pushing the touch stick to the rim never breaks a sneak; only the sprint key does.
      sprint: k.sprint.isDown || (touchStick.sprint && !this.motor.crouched),
      aimAngle,
      lookAngle: this.look && time < this.look.until ? this.look.angle : null,
    };

    // Start from the physics body's real velocity so walls bleed momentum instead of it building up.
    this.motor = stepMotor({ ...this.motor, vx: this.playerBody.velocity.x, vy: this.playerBody.velocity.y }, input, tuning, dt);
    this.playerBody.setVelocity(this.motor.vx, this.motor.vy);

    this.updatePose(dt);
    this.updateHover(pointer.x, pointer.y);

    this.hudTimer -= dt;
    if (this.hudTimer <= 0) {
      this.hudTimer = 0.1;
      hudChannel.emit({
        mode: this.mode,
        gait: this.motor.gait,
        crouched: this.motor.crouched,
        speed: speedOf(this.motor) / PX_PER_METRE,
        span: this.rig.span,
        locked: this.lockTarget !== null,
      });
    }
  }

  /**
   * A door hit its frame. Placeholder feedback: a puff of dust at the latch,
   * scaled by how hard it hit. (Hook for sound/noise later.)
   */
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

  /** After physics: draw the character where the body actually is, then frame it. */
  private lateUpdate(time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    const x = this.playerObj.x;
    const y = this.playerObj.y;
    this.view.update(x, y, this.motor.facing, this.pose);
    this.drawLockRing(time);

    this.rig.update(dt);
    const cam = this.cameras.main;
    cam.setZoom(this.rig.rendererZoom(this.scale.width, this.scale.height, PX_PER_METRE));
    if (!this.cameraFocus) this.cameraFocus = { x, y };
    const k = 1 - Math.exp(-CAMERA_FOLLOW * dt);
    this.cameraFocus.x += (x - this.cameraFocus.x) * k;
    this.cameraFocus.y += (y - this.cameraFocus.y) * k;
    cam.centerOn(this.cameraFocus.x, this.cameraFocus.y);
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

  private drawLockRing(time: number): void {
    const g = this.lockRing;
    g.clear();
    const t = this.lockTarget;
    if (!t) return;
    const r = t.radius + 14 + Math.sin(time / 160) * 2;
    g.lineStyle(3, 0xe0574a, 0.9);
    for (let i = 0; i < 4; i++) {
      const a = (i * Math.PI) / 2 + time / 900;
      g.beginPath();
      g.arc(t.x, t.y, r, a - 0.45, a + 0.45);
      g.strokePath();
    }
  }

  private updateHover(px: number, py: number): void {
    const next = this.mode === 'explore' && this.inputSource === 'mouse' ? this.interactableAt(px, py) : null;
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
