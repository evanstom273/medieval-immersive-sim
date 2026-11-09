import Phaser from 'phaser';
import {
  hudChannel,
  menuChannel,
  pausedChannel,
  switchChannel,
  wallsChannel,
  floorChannel,
  messageChannel,
  rosterChannel,
  uiCommands,
  clockChannel,
  restDialogChannel,
  type MenuState,
  type RosterMember,
  type UiCommand,
} from '../bridge';
import { CameraRig } from '../camera/CameraRig';
import { planSwitch, sampleSwitch, switchDuration, type SwitchPlan } from '../camera/switchTransition';
import { circlePts, discOnGround, emptyBounds, flat, prism, rectPts, ringOnGround, type Bounds } from '../view/draw';
import { makeProjection, projectedBounds, screenToGroundDir, type Projection, type ViewMode } from '../view/projection';
import { Scenery, WALL_MODES, type WallMode } from '../view/Scenery';
import type { World } from '../characters/Brain';
import { BODY_RADIUS, Character, type CharacterDef, type Targetable } from '../characters/Character';
import { HIT_OPINION, MAX_HEALTH, PUNCH_DAMAGE, TEMPERAMENTS } from '../combat/combat';
import { inputSourceChannel, touchCommands, touchStick, type InputSource, type TouchCommand } from '../input/touchInput';
import { speedOf, stepMotorInto, toggleCrouch, type MotorInput } from '../movement/motor';
import { PX_PER_METRE, tuning } from '../movement/tuning';
import { MoveOrder } from '../navigation/MoveOrder';
import { resistance, separate } from '../movement/shove';
import { MOCK_PROFILES } from '../characters/mockProfiles';
import { buildOf, canFight, fightGroup, isPlayableAge, type Body } from '../characters/body';
import { PLAYER_REGISTRY_KEY, playerDef, type NewPerson } from '../characters/newPerson';
import { profiler } from '../perf/profiler';
import { detailSettings } from '../sim/detail';
import { SpatialHash } from '../perception/spatialHash';
import { describeMemory, type MemoryKind } from '../perception/memory';
import { SCENT, smellStrength, type SmellSource } from '../perception/scents';
import { footstepLoudness, LOUDNESS, SIGHT, type NoiseKind } from '../perception/senseRules';
import { Senses, type Perception, type SensesHost } from '../perception/Senses';
import { NavGrid, type NavLink, type Obstacle, type Point } from '../navigation/NavGrid';
import { Relationships, opinionWord } from '../social/relationships';
import { REACTION_ICON, SOCIAL_ACTIONS, describeSocial, resolveSocial, socialAction, type SocialActionId } from '../social/socialActions';
import { between, createRng, type Rng } from '../util/rng';
import { handOffset, PUNCH_EXTEND, PUNCH_TOTAL, type Hand, type ViewResult } from '../world/CharacterView';
import { Bed, Chest, Door, Sign, Window, type InteractContext, type Interactable, type MenuOption } from '../world/interactables';
import { formatDate, formatDuration, formatTime, GameClock, DAWN_HOUR, DAYS_PER_YEAR } from '../time/clock';
import { Furniture, type Offer, type Offering } from '../world/furniture';
import { addMoodlet, ambientWarmth, moodOf, MOODLETS, expireMoodlets, healthLossPerHour, inDanger, irritability, pressingSign, speedFactor, tickNeeds, type MoodletId, type TickInput } from '../life/needs';
import { interruptsRest, MAX_REST_HOURS, REST_SPEED, type RestKind, type RestStimulus } from '../time/rest';
import type { Plot } from '../buildings/format';
import { COTTAGE } from '../buildings/cottage';
import { TERRACE } from '../buildings/row';
import { loadScale, scaleBuilding, scalePlots } from '../buildings/scale';
import { floorAt, inRect, placeTown, stairEnds, stairProgress, type Town } from '../buildings/place';
import { townArt } from '../art/buildingArt';
import { pack, sheetSvg, type Placed } from '../art/atlas';
import { BuildingView, bandOf, type ViewLevel } from '../view/BuildingView';

/**
 * PLACEHOLDER sandbox: a field, a small house with a door, a chest, a sign,
 * obstacles, a training dummy, and four people who live their own (very
 * simple) lives until you take control of one of them.
 */

/** The sandbox's size (world px). Other scenes set their own via world(). */
const WORLD_W = 4096;
const WORLD_H = 2304;

export interface WorldSize {
  w: number;
  h: number;
  /** Navigation / line-of-sight grid cell size (world px). */
  cell: number;
}
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
/** Sleeping where you dropped (or on the bare floor). */
const FLOOR_SLEEP: Offer = { id: 'sleep', label: 'Sleep', icon: '💤', gains: { rest: 0.1 }, posture: 'lie', hours: 9, untilFull: 'rest', moodlet: 'slept_rough' };
/** Leave the person you control alone this long (real ms) and they start looking after themselves. */
const FREE_WILL_AFTER_MS = 15000;
/** How long between someone showing a pressing need over their head (sim ms, roughly). */
const SIGN_EVERY_MS = 30000;
/** Shared "not moving" values (read-only), so standing still allocates nothing. */
const ZERO: Point = Object.freeze({ x: 0, y: 0 }) as Point;
const NO_MOVE = Object.freeze({ move: ZERO, run: false }) as { move: Point; run: boolean };

function castBody(sex: Body['sex'], age: number, sliders: Partial<Body>, skin: string, hair: string): Body {
  return { sex, age, fat: 0, mus: 0, height: 0, frame: 0, bust: 0, waist: 0, hips: 0, ...sliders, skin, hair };
}

const CAST: CharacterDef[] = [
  { id: 'edric', name: 'Edric', temperament: 'bold', palette: { tunic: 0x8a3b2e, hair: 0x3b2416 }, body: castBody('m', 34, { fat: 2, mus: 3, height: 1, frame: 2 }, '#d9a77e', '#3b2416'), x: 760, y: 900 },
  { id: 'agnes', name: 'Agnes', temperament: 'meek', palette: { tunic: 0x3e5f8a, hair: 0x8a5a2b }, body: castBody('f', 27, { fat: -2, height: -3, bust: 2, waist: -2, hips: 3 }, '#f1cfb0', '#8a5a2b'), x: 880, y: 1000 },
  { id: 'maud', name: 'Maud', temperament: 'wary', palette: { tunic: 0x4f7a3a, hair: 0x1f1a17 }, body: castBody('f', 52, { fat: -3, mus: -3, height: -5, frame: -2 }, '#e8bd98', '#1f1a17'), x: 680, y: 1060 },
  { id: 'wat', name: 'Wat', temperament: 'bold', palette: { tunic: 0xb08a3a, hair: 0xb5a07a }, body: castBody('m', 19, { fat: 2, mus: 7, height: 8, frame: 6 }, '#c58c62', '#b5a07a'), x: 980, y: 860 },
];

interface Dummy extends Targetable {
  g: Phaser.GameObjects.Graphics;
  hits: number;
  flashUntil: number;
  wobble: { x: number; y: number };
}

const WALLS_STORAGE_KEY = 'mis.wallMode';
/** Where the preset buildings start (metres): the terrace's north-west corner, far enough south for its roofs. */
const TOWN_X = 36;
const townY = (k: number) => 8 + 5 * k;

/** What the floor buttons call each storey. */
function floorLabel(v: ViewLevel): string {
  if (v === 'roof') return 'Roofs';
  return ['Cellar', 'Ground floor', 'First floor', 'Second floor', 'Third floor'][v + 1] ?? `Floor ${v}`;
}
/** Movement and physics run in fixed steps of this size (60 a second). */
const MOVE_DT = 1 / 60;
/** A world tick (brains, senses, conversations, footsteps) every this many movement steps: 20 a second. */
const WORLD_EVERY = 3;
/** Fallen behind: catch up with at most this many extra steps a frame, then let time slip. */
const MAX_CATCH_UP_STEPS = 8;
/** ...and spend at most this long (real ms) on it in one frame: past that, time slips rather than the screen freezing. */
const CATCH_UP_BUDGET_MS = 40;
/** While resting, spend at most this long (real ms) per frame simulating; slow machines rest a little slower. */
const REST_FRAME_BUDGET_MS = 10;

type OpenMenu = { kind: 'character'; target: Character } | { kind: 'object'; target: Interactable } | { kind: 'self' };

export class SandboxScene extends Phaser.Scene implements World, SensesHost {
  readonly characters: Character[] = [];
  readonly interactables: Interactable[] = [];
  readonly relationships = new Relationships();
  readonly rng: Rng = createRng(1347);
  readonly rig = new CameraRig();
  protected active!: Character;

  private keys!: Record<
    'up' | 'down' | 'left' | 'right' | 'sprint' | 'crouch' | 'combat' | 'lock' | 'talk' | 'debug' | 'senses' | 'pause' | 'walls' | 'floorUp' | 'floorDown' | 'esc' | 'one' | 'two' | 'three' | 'four' | 'five' | 'six' | 'seven' | 'eight' | 'nine',
    Phaser.Input.Keyboard.Key
  >;
  private solids!: Phaser.Physics.Arcade.StaticGroup;
  /** How big this scene's world is (overridden by e.g. the performance test). */
  protected world(): WorldSize {
    // Big enough for the preset buildings at the chosen building scale.
    const k = loadScale().size;
    const w = Math.max(WORLD_W, (TOWN_X + 22 * k + 10) * M);
    const h = Math.max(WORLD_H, (townY(k) + 11 * k + 6 + 5.4 * k + 8) * M);
    return { w: Math.ceil(w / 64) * 64, h: Math.ceil(h / 64) * 64, cell: 8 };
  }
  protected readonly size: WorldSize = this.world();
  private nav = new NavGrid(this.size.w, this.size.h, this.size.cell);
  private navDirty = true;
  private doors: Door[] = [];
  private windows: Window[] = [];
  private dummy?: Dummy;
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
  private paused = false;
  /** A GTA-style switch in flight: control passes to `next` when the camera lands. */
  private switching: { plan: SwitchPlan; t: number; next: Character } | null = null;
  /** Someone picked mid-switch: switch to them as soon as this one lands. */
  private queuedSwitch: string | null = null;
  senses!: Senses;
  /** Walls etc. that block sight and muffle sound (not inflated, unlike the nav grid). */
  private sightBlockers: Obstacle[] = [];
  private sightGrid = new NavGrid(this.size.w, this.size.h, this.size.cell);
  private footstepTimer = new Map<string, number>();
  private sensesOverlay = false;
  private collisionView = false;
  private collisionGfx!: Phaser.GameObjects.Graphics;
  private overlayGfx!: Phaser.GameObjects.Graphics;
  private pendingSmells: SmellSource[] = [];
  private fire?: { x: number; y: number; g: Phaser.GameObjects.Graphics; smokeTimer: number };
  private midden?: { x: number; y: number; g: Phaser.GameObjects.Graphics };
  /** The active view projection (top-down / ¾ / isometric). The simulation itself is always on the ground plane. */
  proj: Projection = makeProjection('topdown');
  private scenery!: Scenery;
  private objectGfx = new Map<Interactable, { g: Phaser.GameObjects.Graphics; bounds: Bounds }>();
  private charScreen = new Map<Character, ViewResult>();
  private hitNoticeAt = -Infinity;
  /**
   * Physics objects that collide with walls this frame: people in full detail. (The wall collider
   * holds this array; it's refilled in place each frame. Off-screen people follow planned routes,
   * which already keep clear of walls, so they skip the collision checks.)
   */
  private peopleObjs: Phaser.GameObjects.Arc[] = [];
  private hudTimer = 0;
  private rosterTimer = 0;
  /** Ground area around the camera (what's on screen, plus a margin). Drawing always stops at it. */
  private screenBox: { x0: number; y0: number; x1: number; y1: number } | null = null;
  /** Ground area simulated in full detail this frame: the screen box, or null = everywhere (LOD off). */
  private detailBox: { x0: number; y0: number; x1: number; y1: number } | null = null;
  private bumpGrid = new SpatialHash<Character>(BODY_RADIUS * 4);
  private bumpNear: Character[] = [];
  /** Reused every frame for every person's motor input (no garbage). */
  private readonly motorInput: MotorInput = { move: { x: 0, y: 0 }, sprint: false, aimAngle: null, lookAngle: null };
  /** Scratch point for drawPos (read immediately; never kept). */
  private readonly drawAt = { x: 0, y: 0, set(x: number, y: number) { this.x = x; this.y = y; return this; } };
  /** Real time not yet spent on movement steps (seconds); also how far between steps to draw. */
  private moveAcc = 0;
  private stepCount = 0;
  /** Simulation time (ms). Runs with the simulation: stops when paused, speeds up while resting. */
  private simMs = 0;
  readonly clock = new GameClock();
  private clockTimer = 0;
  /** The active character waiting or sleeping (TES-style), time sped up until `untilS` (game seconds). */
  private rest: { kind: RestKind; untilS: number; bed: Offering | null; startS: number } | null = null;
  /** Indoors (warmer) and things that give off heat. */
  protected indoorAreas: Phaser.Geom.Rectangle[] = [];
  protected heatSources: Point[] = [];
  /** Game seconds at the last needs tick. */
  private lifeS = -1;
  /** Last time (real ms) the player touched anything. */
  private lastInputAt = performance.now();
  /** The person you control is currently looking after themselves (free will). */
  private freeWilling = false;
  private readonly scaledMove = { x: 0, y: 0 };
  /** Reused for every person's needs tick (no garbage). */
  private readonly needsTick: TickInput = { dt: 0, asleep: false, ambientWarmth: 0, gains: null };
  /** The "how long?" dialog is open (the game is paused behind it). */
  private restAsk: { kind: RestKind; bed: Offering | null; wasPaused: boolean } | null = null;
  /** How many times normal speed the last frame actually ran. */
  private speedNow = 1;
  /** The preset buildings, laid out, and their art. */
  protected town: Town | null = null;
  private buildingView: BuildingView | null = null;
  private art: { jobs: Map<string, Placed>; sheets: string[] } | null = null;
  /** Which storey each solid belongs to (missing = the ground). */
  private solidLevel = new WeakMap<object, number>();
  private personOf = new WeakMap<object, Character>();
  /** Path grids for the storeys above the ground. */
  private upperNavs = new Map<number, NavGrid>();
  private upperNavDirty = true;
  /** Doors hung in the preset buildings' doorways. */
  private townDoors = new Set<Door>();
  /** Which storey is shown, and the one the game last chose itself (entering or leaving a building, or a stair). */
  private viewLevel: ViewLevel = 'roof';
  private autoView: ViewLevel | null = null;

  constructor(key = 'sandbox') {
    super(key);
  }

  /** Who's in the world at the start (the first is the one you control). */
  protected cast(): CharacterDef[] {
    // Whoever was made in character creation comes first (so you start as them), beside the test cast.
    const made = this.registry.get(PLAYER_REGISTRY_KEY) as NewPerson | undefined;
    return made ? [playerDef(made, 820, 960), ...CAST] : CAST;
  }

  get now(): number {
    return this.simMs;
  }

  /** The preset buildings and where they stand (metres). */
  protected plots(): Plot[] {
    const s = loadScale();
    const k = s.size;
    const y0 = townY(k);
    const terrace = scalePlots(TERRACE, s).map((p) => ({ ...p, x: p.x + TOWN_X, y: p.y + y0 }));
    return [...terrace, { building: scaleBuilding(COTTAGE, s), x: TOWN_X + 5 * k, y: y0 + 11 * k + 6 }];
  }

  preload(): void {
    const plots = this.plots();
    if (!plots.length) return;
    this.town = placeTown(plots);
    // The catalogue art, baked onto a few sheets (SVG, rasterised by the browser).
    const jobs = townArt(this.town);
    const { placed, sheetCount } = pack(jobs);
    const sheets: string[] = [];
    for (let i = 0; i < sheetCount; i++) {
      const key = `buildings-${i}`;
      sheets.push(key);
      if (this.textures.exists(key)) continue;
      const url = URL.createObjectURL(new Blob([sheetSvg(jobs, placed, i)], { type: 'image/svg+xml' }));
      this.load.svg(key, url);
      this.load.once(Phaser.Loader.Events.COMPLETE, () => URL.revokeObjectURL(url));
    }
    this.art = { jobs: placed, sheets };
  }

  get hour(): number {
    return this.clock.hourOfDay;
  }

  // ================================================================ setup

  create(): void {
    this.physics.world.setBounds(0, 0, this.size.w, this.size.h);
    // Arcade rebuilds a tree of all moving bodies every frame for body-vs-body collisions; people
    // don't collide through Arcade (see separatePeople), so skip it. (Walls use the static tree.)
    this.physics.world.useTree = false;
    // We step Arcade ourselves, in fixed movement steps (see physicsStep), not once per rendered frame.
    const world = this.physics.world;
    this.sys.events.off(Phaser.Scenes.Events.UPDATE, world.update, world);
    this.sys.events.off(Phaser.Scenes.Events.POST_UPDATE, world.postUpdate, world);
    this.cameras.main.setBackgroundColor('#1c1b19');

    this.scenery = new Scenery(this, this.size.w, this.size.h);
    this.solids = this.physics.add.staticGroup();
    this.buildWorld(this.solids);
    if (this.town) this.buildTown(this.solids, this.town);
    for (const obj of this.interactables) this.objectGfx.set(obj, { g: this.add.graphics(), bounds: emptyBounds() });
    for (const w of this.windows) w.outerG = this.add.graphics();

    for (const def of this.cast()) this.characters.push(new Character(this, def));
    this.peopleObjs = this.characters.map((c) => c.obj);
    this.characters.forEach((c) => this.personOf.set(c.obj, c));
    // People only bump into the walls of the storey they're on.
    this.physics.add.collider(this.peopleObjs, this.solids, undefined, (a, b) => (this.solidLevel.get(b as object) ?? 0) === (this.personOf.get(a as object)?.level ?? 0));
    // People don't use Arcade's collider with each other (it splits overlaps 50/50 and zeroes
    // velocities); they're kept apart by separatePeople(), weighted by who they are.

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
    this.collisionGfx = this.add.graphics().setDepth(95);

    this.lockRing = this.add.graphics().setDepth(16);
    this.routeGfx = this.add.graphics().setDepth(5);

    let walls: WallMode = 'cutaway';
    try {
      const w = localStorage.getItem(WALLS_STORAGE_KEY) as WallMode | null;
      if (w && WALL_MODES.includes(w)) walls = w;
    } catch {
      /* storage unavailable */
    }
    this.setWalls(walls);
    this.setView('threequarter');
    if (this.buildingView) this.setViewLevel('roof');

    // Draw everyone and move the camera AFTER physics has moved bodies this frame.
    this.events.on(Phaser.Scenes.Events.POST_UPDATE, this.lateUpdate, this);
    this.setupInput();
    this.say(this.inputSource === 'touch' ? 'Tap someone to interact. Tap a portrait to switch.' : this.characters.length > 1 ? `Click someone to interact. 1–${Math.min(9, this.characters.length)} switches who you control.` : 'Click someone to interact.');
  }

  /**
   * A window in a wall: the window itself (solid, interactive), the low wall under
   * it, and the wall above it. It isn't a sight blocker in the grid: open shutters
   * can be seen through, closed ones are checked per frame.
   */
  private window(solids: Phaser.Physics.Arcade.StaticGroup, x: number, y: number, w: number, h: number, inward: Point): void {
    const win = new Window(this, solids, x, y, w, h, inward);
    this.windows.push(win);
    this.interactables.push(win);
    this.scenery.add({ kind: 'box', x, y, w, h, height: Window.SILL, colour: 0x8c8475, wall: true });
    this.scenery.add({ kind: 'box', x, y, w, h, z0: Window.HEAD, height: 2.4 * M - Window.HEAD, colour: 0x8c8475, wall: true });
  }

  /** A solid block: physics body, sight blocker, and scenery to draw (with height for the angled views). */
  protected wall(solids: Phaser.Physics.Arcade.StaticGroup, x: number, y: number, w: number, h: number, colour = 0x8c8475, height = 2.4 * M, fade = true): void {
    this.sightBlockers.push({ kind: 'rect', x, y, w, h });
    this.scenery.add({ kind: 'box', x, y, w, h, height, colour, wall: fade });
    const r = this.add.rectangle(x + w / 2, y + h / 2, w, h).setVisible(false);
    this.physics.add.existing(r, true);
    solids.add(r);
  }

  protected buildWorld(solids: Phaser.Physics.Arcade.StaticGroup): void {
    // House: 8 m × 6 m, 0.3 m walls, 1 m doorway in the south wall.
    const hx = 1152;
    const hy = 576;
    const hw = 512;
    const hh = 384;
    const t = 20;
    const doorX = hx + 224;
    const doorW = 64;
    const winW = 64;
    this.scenery.add({ kind: 'floor', x: hx, y: hy, w: hw, h: hh, colour: 0x8a7356 });
    // North wall, with a window.
    this.wall(solids, hx, hy, 1440 - hx, t);
    this.window(solids, 1440, hy, winW, t, { x: 0, y: 1 });
    this.wall(solids, 1440 + winW, hy, hx + hw - (1440 + winW), t);
    // West and east walls, a window in each.
    this.wall(solids, hx, hy, t, 704 - hy);
    this.window(solids, hx, 704, t, winW, { x: 1, y: 0 });
    this.wall(solids, hx, 704 + winW, t, hy + hh - (704 + winW));
    this.wall(solids, hx + hw - t, hy, t, 704 - hy);
    this.window(solids, hx + hw - t, 704, t, winW, { x: -1, y: 0 });
    this.wall(solids, hx + hw - t, 704 + winW, t, hy + hh - (704 + winW));
    // South (front) wall: a window, then the door.
    this.wall(solids, hx, hy + hh - t, 1216 - hx, t);
    this.window(solids, 1216, hy + hh - t, winW, t, { x: 0, y: -1 });
    this.wall(solids, 1216 + winW, hy + hh - t, doorX - (1216 + winW), t);
    this.wall(solids, doorX + doorW, hy + hh - t, hx + hw - (doorX + doorW), t);

    const door = new Door(doorX, hy + hh - t / 2, doorW, 10);
    door.inward = { x: 0, y: -1 };
    this.doors.push(door);
    // The door stands on a stone threshold, with wall carried on above it.
    this.scenery.add({ kind: 'paving', x: doorX, y: hy + hh - t, w: doorW, h: t, colour: 0x9a9286 });
    this.scenery.add({ kind: 'box', x: doorX, y: hy + hh - t, w: doorW, h: t, z0: door.height, height: 2.4 * M - door.height, colour: 0x8c8475, wall: true });
    const chest = new Chest(this, solids, hx + hw - 90, hy + 70, 56, 36);
    // PLACEHOLDER bed in the north-west corner, pillow against the west wall.
    const bed = new Bed(this, solids, hx + t + 2 + 64, hy + t + 4 + 32, 128, 64);
    this.interactables.push(bed);
    // Furnishing (PLACEHOLDER layout): a second bed, straw pallets, a hearth, a table with benches,
    // a larder (placeholder food until there are items), an ale barrel. Outside: a privy.
    const bed2 = new Bed(this, solids, hx + 222, hy + t + 4 + 32, 128, 64);
    this.interactables.push(bed2);
    const furnish = (kind: Furniture['kind'], x: number, y: number, w: number, h: number, solid = true) => {
      const f = new Furniture(this, solid ? solids : null, kind, x, y, w, h);
      this.interactables.push(f);
      return f;
    };
    furnish('pallet', hx + hw - 80, hy + 200, 100, 50);
    furnish('pallet', hx + hw - 80, hy + 268, 100, 50);
    furnish('hearth', hx + 150, hy + 230, 64, 64);
    this.heatSources.push({ x: hx + 150, y: hy + 230 });
    this.pendingSmells.push({ id: 'hearth', kind: 'smoke', x: hx + 150, y: hy + 230, radius: 5 * M, pleasant: true });
    furnish('table', hx + 300, hy + 214, 120, 56);
    furnish('bench', hx + 300, hy + 166, 120, 22);
    furnish('bench', hx + 300, hy + 262, 120, 22);
    furnish('larder', hx + t + 30, hy + hh - t - 60, 44, 70);
    furnish('barrel', hx + hw - t - 30, hy + hh - t - 34, 40, 40);
    furnish('privy', hx + hw + 110, hy + hh + 20, 64, 64);
    this.indoorAreas.push(new Phaser.Geom.Rectangle(hx, hy, hw, hh));
    const sign = new Sign(this, solids, 920, 760, 'Movement test. Mind the dummy.');
    this.interactables.push(door, chest, sign);

    for (const [cx, cy] of [
      [640, 512],
      [688, 512],
      [640, 560],
    ]) {
      this.wall(solids, cx, cy, 46, 46, 0x9b7a4c, 0.8 * M, false);
    }

    const well = this.add.circle(512, 1280, 44).setVisible(false);
    this.physics.add.existing(well, true);
    (well.body as Phaser.Physics.Arcade.StaticBody).setCircle(44);
    solids.add(well);
    this.scenery.add({ kind: 'well', x: 512, y: 1280, r: 44, height: 0.8 * M });
    this.interactables.push(new Furniture(this, null, 'well', 512, 1280, 88, 88));

    // Cooking fire: people catch the smell of smoke and drift over to warm themselves.
    const fx = 760;
    const fy = 1400;
    const fireBody = this.add.circle(fx, fy, 24).setVisible(false);
    this.physics.add.existing(fireBody, true);
    (fireBody.body as Phaser.Physics.Arcade.StaticBody).setCircle(24);
    solids.add(fireBody);
    this.fire = { x: fx, y: fy, g: this.add.graphics(), smokeTimer: 0 };
    this.pendingSmells.push({ id: 'fire', kind: 'smoke', x: fx, y: fy, radius: 10 * M, pleasant: true });
    this.interactables.push(new Furniture(this, null, 'fire', fx, fy, 48, 48));
    this.heatSources.push({ x: fx, y: fy });

    // Midden: a dung heap. People wrinkle their noses and don't hang about.
    const mx = 1980;
    const my = 1180;
    this.midden = { x: mx, y: my, g: this.add.graphics() };
    this.pendingSmells.push({ id: 'midden', kind: 'dung', x: mx, y: my, radius: 5 * M, pleasant: false });

    this.wall(solids, 1408, 1344, 320, 24, 0x6f6a5f, 1.0 * M);
    this.wall(solids, 1408 + 320 + 48, 1344, 320, 24, 0x6f6a5f, 1.0 * M);

    const dx = 1024;
    const dy = 1216;
    const dummyBody = this.add.circle(dx, dy, 14).setVisible(false);
    this.physics.add.existing(dummyBody, true);
    (dummyBody.body as Phaser.Physics.Arcade.StaticBody).setCircle(14);
    solids.add(dummyBody);
    this.dummy = { name: 'the training dummy', x: dx, y: dy, radius: 14, g: this.add.graphics(), hits: 0, flashUntil: 0, wobble: { x: 0, y: 0 }, isTargetable: () => true };
  }

  /**
   * The preset buildings: solid walls per storey, doors in the doorways, hearths, and the
   * view that draws them with the catalogue art.
   */
  private buildTown(solids: Phaser.Physics.Arcade.StaticGroup, town: Town): void {
    for (const b of [...town.bodies, ...town.barriers]) {
      const r = this.add.rectangle(b.x + b.w / 2, b.y + b.h / 2, b.w, b.h).setVisible(false);
      this.physics.add.existing(r, true);
      solids.add(r);
      if (b.level !== 0) this.solidLevel.set(r, b.level);
      else if (town.bodies.includes(b)) this.sightBlockers.push({ kind: 'rect', x: b.x, y: b.y, w: b.w, h: b.h });
    }
    // A pavement along the front of a row of buildings (two or more sharing a front).
    const rows = new Map<number, typeof town.buildings>();
    for (const b of town.buildings) {
      const y = Math.round(b.rect.y + b.rect.h);
      rows.set(y, [...(rows.get(y) ?? []), b]);
    }
    for (const [y, row] of rows) {
      if (row.length < 2) continue;
      const x0 = Math.min(...row.map((b) => b.rect.x));
      const x1 = Math.max(...row.map((b) => b.rect.x + b.rect.w));
      this.scenery.add({ kind: 'paving', x: x0 - 0.5 * M, y, w: x1 - x0 + M, h: 1.6 * M, colour: 0xa39b8c });
    }
    for (const b of town.buildings) this.indoorAreas.push(new Phaser.Geom.Rectangle(b.rect.x, b.rect.y, b.rect.w, b.rect.h));
    town.fixtures.forEach((fx) => {
      if (fx.fixture.kind !== 'hearth' || fx.level !== 0) return;
      const r = fx.rect;
      const f = new Furniture(this, solids, 'hearth', r.x + r.w / 2, r.y + r.h / 2, r.w, r.h);
      f.hidden = true;
      this.interactables.push(f);
      this.heatSources.push({ x: r.x + r.w / 2, y: r.y + r.h / 2 });
    });
    const view = new BuildingView(this, town, this.art!.jobs, this.art!.sheets);
    this.buildingView = view;
    town.doors.forEach((d, i) => {
      const door = new Door(d.hinge.x, d.hinge.y, d.length, 10, d.baseAngle, { height: d.height, z: d.z, level: d.level });
      door.inward = d.inward;
      this.doors.push(door);
      this.interactables.push(door);
      this.townDoors.add(door);
      view.attachDoor(door, i);
    });
  }

  // ================================================================ life: needs, doing things, free will

  /** Feel something (a moodlet). */
  feel(c: Character, id: MoodletId): void {
    addMoodlet(c.moodlets, id, this.clock.seconds);
  }

  /** Stop whatever they're doing with an object (getting up if lying or sitting). */
  stopDoing(c: Character): void {
    this.endDoing(c, false);
  }

  /** Start doing something an object offers (they're already beside it). Returns false if it's taken. */
  private beginDoing(c: Character, obj: Offering | null, offer: Offer): boolean {
    if (offer.single && obj && [...obj.users].some((u) => u !== c.id)) {
      if (c.controlled) this.say(`Someone's using the ${obj.name}.`);
      return false;
    }
    this.endDoing(c, false);
    c.cancelOrder();
    c.social = null;
    c.mode = 'explore';
    c.lockTarget = null;
    if (c.motor.crouched) c.motor = toggleCrouch(c.motor);
    const spot = obj ? obj.spotFor(offer, { x: c.x, y: c.y }) : { x: c.x, y: c.y, facing: c.motor.facing };
    if (obj && (offer.single || offer.posture !== 'stand')) obj.users.add(c.id);
    c.doing = { obj, offer, endS: this.clock.seconds + offer.hours * 3600 };
    if (offer.posture === 'lie') {
      c.asleep = true;
      c.lieHeight = obj ? obj.lieHeight : 0;
      if (obj) this.placeAt(c, spot);
      else c.motor = { ...c.motor, vx: 0, vy: 0 };
    } else if (offer.posture === 'sit') {
      c.sitting = true;
      this.placeAt(c, spot);
    } else {
      c.motor = { ...c.motor, vx: 0, vy: 0, facing: spot.facing };
    }
    return true;
  }

  /** Put someone exactly somewhere (on a bed or bench, so they don't collide with it). */
  private placeAt(c: Character, spot: { x: number; y: number; facing: number }): void {
    c.body.checkCollision.none = true;
    c.obj.setPosition(spot.x, spot.y);
    c.body.reset(spot.x, spot.y);
    c.prevX = spot.x;
    c.prevY = spot.y;
    c.motor = { ...c.motor, vx: 0, vy: 0, facing: spot.facing };
  }

  private endDoing(c: Character, completed: boolean): void {
    const d = c.doing;
    if (!d) return;
    c.doing = null;
    d.obj?.users.delete(c.id);
    const slept = d.offer.posture === 'lie' ? this.clock.seconds - (d.endS - d.offer.hours * 3600) : 0;
    if (d.offer.posture === 'lie') {
      c.asleep = false;
      c.lieHeight = 0;
      c.pose.lift = 0;
    }
    if (d.offer.posture === 'sit') c.sitting = false;
    if (d.obj && d.offer.posture !== 'stand') {
      // Get up on the open side.
      const want = { x: c.x, y: c.y + 0.9 * M };
      const p = this.ensureNav(c.level).nearestFree(want, 2.5 * M) ?? want;
      c.obj.setPosition(p.x, p.y);
      c.body.reset(p.x, p.y);
      c.prevX = p.x;
      c.prevY = p.y;
      c.body.checkCollision.none = false;
    }
    // Sleep leaves a feeling after a proper rest (3 hours or more), even if cut short.
    const felt = d.offer.posture === 'lie' ? slept >= 3 * 3600 : completed;
    if (felt && d.offer.moodlet) this.feel(c, d.offer.moodlet);
  }

  private isIndoors(x: number, y: number): boolean {
    for (const r of this.indoorAreas) if (r.contains(x, y)) return true;
    return false;
  }

  /**
   * Needs on the game clock (every world tick): drain them, apply what people are doing, finish what's
   * done, and let neglect bite: health lost to thirst, hunger and cold, collapsing from exhaustion,
   * accidents. Also the occasional sign over someone's head for a pressing need.
   */
  private lifeTick(): void {
    const nowS = this.clock.seconds;
    if (this.lifeS < 0 || nowS < this.lifeS) {
      this.lifeS = nowS;
      return;
    }
    const dt = nowS - this.lifeS;
    if (dt <= 0) return;
    this.lifeS = nowS;
    const hour = this.clock.hourOfDay;
    const dayOfYear = Math.floor(nowS / 86400) % DAYS_PER_YEAR;
    const resting = this.rest;
    for (const c of this.characters) {
      const sleepingRest = c === this.active && resting?.kind === 'sleep';
      const gains = c.doing ? c.doing.offer.gains : sleepingRest ? (sleepOffer(resting!.bed)?.gains ?? FLOOR_SLEEP.gains) : null;
      let heat = Infinity;
      for (const h of this.heatSources) heat = Math.min(heat, Math.hypot(h.x - c.x, h.y - c.y));
      const t = this.needsTick;
      t.dt = dt;
      t.asleep = c.asleep;
      t.ambientWarmth = ambientWarmth(dayOfYear, hour, this.isIndoors(c.x, c.y), heat / M);
      t.gains = gains;
      tickNeeds(c.needs, t);
      expireMoodlets(c.moodlets, nowS);

      const d = c.doing;
      if (d && (nowS >= d.endS || (d.offer.untilFull && c.needs[d.offer.untilFull] >= 0.995))) this.endDoing(c, true);

      if (c.status === 'ko') continue;
      // Neglect: thirst, hunger and cold cost health; at nothing, they collapse.
      const loss = healthLossPerHour(c.needs) * (dt / 3600);
      if (loss > 0) {
        c.health -= loss;
        if (c.health <= 0) {
          const why = c.needs.warmth <= 0.001 ? 'the cold' : c.needs.thirst <= 0.001 ? 'thirst' : 'hunger';
          if (c === this.active) this.endRest();
          this.endDoing(c, false);
          this.announce(`${c.name} collapses from ${why}.`, [c], true);
          this.knockOut(c, null);
          continue;
        }
      }
      // Exhausted: they drop where they stand.
      if (c.needs.rest <= 0 && !c.asleep && c.status === 'ok') {
        this.announce(`${c.name} collapses with exhaustion and falls asleep.`, [c], true);
        this.beginDoing(c, null, FLOOR_SLEEP);
      }
      // Held it too long.
      if (c.needs.bladder <= 0) {
        c.needs.bladder = 1;
        c.needs.hygiene = Math.max(0, c.needs.hygiene - 0.4);
        this.feel(c, 'accident');
        this.announce(c === this.active ? "You couldn't hold it any longer." : `${c.name} has had an accident.`, [c]);
      }
      // A visible sign of whatever they need most.
      if (!c.asleep && this.now >= c.signAt && this.fullDetail(c)) {
        const sign = pressingSign(c.needs);
        if (sign) c.overhead.emote(sign, this.now, 1600);
        c.signAt = this.now + SIGN_EVERY_MS * (0.6 + this.rng() * 0.8);
      }
    }
  }

  private noteInput(): void {
    this.lastInputAt = performance.now();
    if (!this.freeWilling) return;
    // Back in charge: they drop what free will had them doing.
    this.freeWilling = false;
    const a = this.active;
    a.cancelOrder();
    a.social = null;
    if (!a.asleep) this.endDoing(a, false);
    a.brain.reset(this.now);
  }

  /** Left alone long enough, the person you control looks after themselves. */
  private updateFreeWill(): void {
    if (this.freeWilling) return;
    const a = this.active;
    if (this.rest || this.switching || this.restAsk || a.status !== 'ok' || a.mode === 'combat') return;
    if (performance.now() - this.lastInputAt < FREE_WILL_AFTER_MS) return;
    if (a.order || a.social || a.climb) return;
    this.freeWilling = true;
    a.brain.reset(this.now);
  }

  // ================================================================ view

  /**
   * The game is drawn in ¾. (The projection layer can do other views, but the
   * game only uses ¾; the others were compared and dropped.)
   */
  private setView(mode: ViewMode): void {
    this.proj = makeProjection(mode);
    this.scenery.build(this.proj);
    const b = projectedBounds(this.proj, this.size.w, this.size.h, 3 * M);
    const pad = 4 * M;
    this.cameras.main.setBounds(b.x - pad, b.y - pad, b.width + pad * 2, b.height + pad * 2);
  }

  /** Sims-style walls: up, cutaway (cut down in front of rooms), or down. */
  setWalls(mode: WallMode): void {
    this.scenery.setMode(mode);
    if (this.buildingView) this.buildingView.mode = mode;
    try {
      localStorage.setItem(WALLS_STORAGE_KEY, mode);
    } catch {
      /* ignore */
    }
    wallsChannel.emit(mode);
  }

  private cycleWalls(): void {
    const i = WALL_MODES.indexOf(this.scenery.mode);
    this.setWalls(WALL_MODES[(i + 1) % WALL_MODES.length]);
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
        pause: KEY.SPACE,
        walls: KEY.V,
        floorUp: KEY.PAGE_UP,
        floorDown: KEY.PAGE_DOWN,
        esc: KEY.ESC,
        one: KEY.ONE,
        two: KEY.TWO,
        three: KEY.THREE,
        four: KEY.FOUR,
        five: KEY.FIVE,
        six: KEY.SIX,
        seven: KEY.SEVEN,
        eight: KEY.EIGHT,
        nine: KEY.NINE,
      },
      true,
    ) as typeof this.keys;

    // Registered after Phaser's own listener (Phaser ignores already-prevented events).
    const guard = (e: KeyboardEvent) => {
      if (!kb.enabled) return; // typing in a text box: leave Ctrl+A etc. alone
      if ((e.ctrlKey || e.metaKey) && ['w', 'a', 's', 'd', 'r', 'f', 'e', '1', '2', '3', '4', '5', '6', '7', '8', '9'].includes(e.key.toLowerCase())) e.preventDefault();
      if (e.key === 'F3' || e.key === 'F4') e.preventDefault();
    };
    window.addEventListener('keydown', guard);
    // Any input at all: you're back in charge (ends free will). Capture phase, so it runs before the
    // game acts on the same click or key.
    const touched = () => this.noteInput();
    window.addEventListener('keydown', touched, true);
    window.addEventListener('pointerdown', touched, true);
    window.addEventListener('wheel', touched, true);
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      window.removeEventListener('keydown', touched, true);
      window.removeEventListener('pointerdown', touched, true);
      window.removeEventListener('wheel', touched, true);
    });
    this.game.events.on(Phaser.Core.Events.BLUR, () => kb.resetKeys());

    // While typing in a text box (e.g. the perf scene's spawn count), the game lets go of the
    // keyboard: otherwise it swallows the keys it uses (1–4, WASD, Space…) and acts on them.
    const typingIn = (el: EventTarget | null) => el instanceof HTMLElement && (el instanceof HTMLTextAreaElement || el.isContentEditable || (el instanceof HTMLInputElement && !['range', 'checkbox', 'radio', 'button', 'submit'].includes(el.type)));
    const onFocusIn = (e: FocusEvent) => {
      if (!typingIn(e.target)) return;
      kb.enabled = false;
      kb.disableGlobalCapture();
      kb.resetKeys();
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!typingIn(e.target)) return;
      kb.enabled = true;
      kb.enableGlobalCapture();
    };
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    // Clicking or tapping the game takes focus off the text box (the canvas eats the click, so it wouldn't on its own).
    const onCanvasDown = () => {
      if (typingIn(document.activeElement)) (document.activeElement as HTMLElement).blur();
    };
    this.game.canvas.addEventListener('pointerdown', onCanvasDown);
    this.input.mouse?.disableContextMenu();
    this.input.on(Phaser.Input.Events.POINTER_DOWN, (p: Phaser.Input.Pointer) => this.onPointerDown(p));

    const canvas = this.game.canvas;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (this.switching) return;
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
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      this.game.canvas.removeEventListener('pointerdown', onCanvasDown);
      canvas.removeEventListener('wheel', onWheel);
      offs.forEach((off) => off());
    });
  }

  // ================================================================ input → active character

  private onPointerDown(p: Phaser.Input.Pointer): void {
    if (p.wasTouch || this.switching) return; // touch goes through the touch layer; switches can't be interrupted
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
    if (this.switching) return;
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
        if (this.press?.touch) {
          const w = this.cssToWorld(c.x, c.y);
          const g = this.groundAt(w.x, w.y);
          if (g.level === this.active.level) this.press.point = { x: g.x, y: g.y };
        }
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
      case 'setPaused':
        this.setPaused(c.paused);
        break;
      case 'cancelAction':
        this.cancelAction();
        break;
      case 'cycleWalls':
        this.cycleWalls();
        break;
      case 'floor':
        this.stepViewLevel(c.dir);
        break;
      case 'setWalls':
        this.setWalls(c.mode);
        break;
      case 'toggleSenses':
        this.sensesOverlay = !this.sensesOverlay;
        break;
      case 'menuChoice':
        this.chooseMenu(c.optionId);
        break;
      case 'rest':
        this.answerRest(c.hours);
        break;
      case 'wait':
        this.askRest('wait', null, true);
        break;
    }
  }

  private dpr(): number {
    return this.scale.width / Math.max(1, this.game.canvas.clientWidth);
  }

  /** Container CSS px → camera space (projected screen-space, not ground). */
  private cssToWorld(x: number, y: number): Point {
    const w = this.cameras.main.getWorldPoint(x * this.dpr(), y * this.dpr());
    return { x: w.x, y: w.y };
  }

  /** Ground point (optionally at a height) → container CSS px. */
  private worldToCss(p: Point, z = 0): Point {
    const cam = this.cameras.main;
    const d = this.dpr();
    const s = this.proj.toScreen(p.x, p.y, this.proj.upright ? z : 0);
    return { x: ((s.x - cam.worldView.x) * cam.zoom) / d, y: ((s.y - cam.worldView.y) * cam.zoom) / d };
  }

  /** Camera-space point → the ground point under it. */
  private ground(s: Point): Point {
    return this.proj.toGround(s.x, s.y);
  }

  /**
   * Click/tap at a camera-space point: a person or object opens its menu; the
   * ground walks there.
   */
  private pressAt(sx: number, sy: number, hold: boolean, touch: boolean): void {
    if (this.restAsk) return;
    this.endRest();
    const a = this.active;
    const { x, y, level } = this.groundAt(sx, sy);
    const who = this.characterAt(sx, sy);
    if (who) {
      if (who === a) this.openSelfMenu();
      else this.openCharacterMenu(who);
      return;
    }
    const obj = this.interactableAt(sx, sy);
    if (obj) {
      this.openMenu({ kind: 'object', target: obj }, obj.closestPoint(x, y), obj.name[0].toUpperCase() + obj.name.slice(1), undefined, obj.options(a.pos()));
      return;
    }
    if (a.status === 'yielded') this.standUp(a);
    a.social = null;
    if (this.orderTo(a, { x, y }, level)) this.markerFade = null;
    else this.say("You can't find a way there.");
    if (hold && level === a.level) this.press = { since: this.now, lastPlan: this.now, point: { x, y }, touch };
  }

  /** The floor under a camera-space point: on the storey shown, if there's floor there, else the ground. */
  private groundAt(sx: number, sy: number): { x: number; y: number; level: number } {
    const town = this.town;
    const v = this.viewLevel;
    if (town && this.buildingView && v !== 'roof') {
      for (let level = v; level > 0; level--) {
        for (const f of town.floors) {
          if (f.level !== level) continue;
          const g = this.proj.toGround(sx, sy + f.z * this.proj.up);
          if (floorAt(town, g.x, g.y, level) === f) return { x: g.x, y: g.y, level };
        }
      }
    }
    const g = this.ground({ x: sx, y: sy });
    return { x: g.x, y: g.y, level: 0 };
  }

  /** Walk somewhere, on any storey: up or down the nearest stair (in the right building) on the way. */
  orderTo(c: Character, p: Point, level: number): boolean {
    const town = this.town;
    if (level === c.level || !town) return this.orderToPoint(c, p);
    const up = level > c.level;
    const next = up ? c.level + 1 : c.level - 1;
    const plot = floorAt(town, p.x, p.y, level)?.plot ?? floorAt(town, c.x, c.y, c.level)?.plot;
    const zones = town.stairs
      .map((z, i) => ({ z, i, ends: stairEnds(z) }))
      .filter(({ z }) => (up ? z.fromLevel === c.level && z.toLevel === next : z.toLevel === c.level && z.fromLevel === next))
      .sort((a, b) => (a.z.plot === plot ? 0 : 1e9) - (b.z.plot === plot ? 0 : 1e9) + Math.hypot(a.ends.foot.x - c.x, a.ends.foot.y - c.y) - Math.hypot(b.ends.foot.x - c.x, b.ends.foot.y - c.y));
    for (const { i, ends } of zones) {
      const entry = up ? ends.foot : ends.top;
      const exit = up ? ends.top : ends.foot;
      const climb = () => {
        c.order = MoveOrder.along([entry, exit]);
        c.onArrive = () => {
          if (c.level !== next) return;
          if (next === level) this.orderToPoint(c, p);
          else this.orderTo(c, p, level);
        };
      };
      if (c.stair === i) {
        climb();
        return true;
      }
      const order = this.planOrder(c, { kind: 'point', x: entry.x, y: entry.y });
      if (!order) continue;
      c.order = order;
      c.onArrive = climb;
      return true;
    }
    return false;
  }

  /** Is this person on a storey that's shown? (Upstairs is hidden while you look at the ground floor, and from outside.) */
  private personShown(c: Character): boolean {
    if (!this.buildingView) return true;
    return this.viewLevel === 'roof' ? c.level === 0 : c.level <= this.viewLevel;
  }

  /**
   * The storey shown follows the person you control: going into a building shows their floor,
   * a stair takes the view up or down with them, and stepping outside shows the roofs again.
   * The floor buttons override it until the next of those.
   */
  private updateViewLevel(): void {
    const town = this.town;
    if (!town) return;
    const a = this.active;
    // Inside once you're in a room; and you stay inside (doorways between rooms, the threshold on the
    // way out) until you've left the building's footprint.
    const inRoom = a.stair >= 0 || !!floorAt(town, a.x, a.y, a.level);
    const inFootprint = town.buildings.some((b) => a.x > b.rect.x && a.x < b.rect.x + b.rect.w && a.y > b.rect.y && a.y < b.rect.y + b.rect.h);
    const inside = inRoom || (this.autoView !== null && this.autoView !== 'roof' && inFootprint);
    const want: ViewLevel = inside ? a.level : 'roof';
    if (want !== this.autoView) {
      this.autoView = want;
      this.setViewLevel(want);
    }
  }

  private setViewLevel(v: ViewLevel): void {
    this.viewLevel = v;
    this.buildingView?.setView(v);
    floorChannel.emit({ label: floorLabel(v), canUp: v !== 'roof', canDown: v === 'roof' || v > 0 });
  }

  /** One storey up (to the roofs at the top) or down. */
  private stepViewLevel(dir: 1 | -1): void {
    if (!this.town) return;
    const top = this.town.topLevel;
    const v = this.viewLevel;
    if (dir > 0) this.setViewLevel(v === 'roof' ? 'roof' : v >= top ? 'roof' : v + 1);
    else this.setViewLevel(v === 'roof' ? top : Math.max(0, v - 1));
  }

  /** Who's under a camera-space point? Seen from above: their footprint; upright: their drawn figure (nearest first). */
  private characterAt(sx: number, sy: number): Character | null {
    if (this.proj.upright) {
      let best: Character | null = null;
      let bestDepth = -Infinity;
      for (const c of this.characters) {
        const b = this.charScreen.get(c)?.bounds;
        if (!b || sx < b.x0 || sx > b.x1 || sy < b.y0 || sy > b.y1) continue;
        const d = this.proj.depth(c.x, c.y);
        if (d > bestDepth) {
          best = c;
          bestDepth = d;
        }
      }
      return best;
    }
    const { x, y } = this.ground({ x: sx, y: sy });
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

  private interactableAt(sx: number, sy: number): Interactable | null {
    if (this.proj.upright) {
      let best: Interactable | null = null;
      let bestDepth = -Infinity;
      for (const obj of this.interactables) {
        const b = this.objectGfx.get(obj)!.bounds;
        if (sx < b.x0 - 4 || sx > b.x1 + 4 || sy < b.y0 - 4 || sy > b.y1 + 4) continue;
        const sp = obj.sortPoint(this.proj);
        const d = this.proj.depth(sp.x, sp.y);
        if (d > bestDepth) {
          best = obj;
          bestDepth = d;
        }
      }
      return best;
    }
    const { x, y } = this.ground({ x: sx, y: sy });
    for (let i = this.interactables.length - 1; i >= 0; i--) {
      if (this.interactables[i].hitTest(x, y)) return this.interactables[i];
    }
    return null;
  }

  /** Pause the simulation (the camera, zoom and menus still work). */
  private setPaused(paused: boolean): void {
    if (paused === this.paused) return;
    this.paused = paused;
    if (paused) {
      this.physics.pause();
      this.tweens.pauseAll();
    } else {
      this.physics.resume();
      this.tweens.resumeAll();
    }
    pausedChannel.emit(paused);
  }

  /** Stop whatever the active character is doing (walking somewhere, talking, squaring up). */
  private cancelAction(): void {
    if (this.rest) {
      this.endRest(this.rest.kind === 'sleep' ? 'You get up.' : 'You stop waiting.');
      return;
    }
    if (this.active.doing) {
      this.endDoing(this.active, false);
      return;
    }
    const a = this.active;
    a.cancelOrder();
    a.social = null;
    a.lockTarget = null;
    this.press = null;
    if (a.mode === 'combat') this.toggleCombat();
  }

  private toggleCombat(): void {
    this.endRest();
    const a = this.active;
    if (a.status !== 'ok') return;
    if (a.mode === 'explore' && fightGroup(a.age) === 'child') {
      this.say("Children can't fight.");
      return;
    }
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
    this.endRest();
    const a = this.active;
    if (a.status !== 'ok') return;
    if (a.lockTarget) {
      a.lockTarget = null;
      return;
    }
    const people = this.characters.filter((c) => c !== a && c.isTargetable());
    a.lockTarget = this.bestTarget(a, a.mode === 'combat' && this.dummy ? [this.dummy, ...people] : people);
    if (!a.lockTarget) this.say(a.mode === 'combat' ? 'Nothing to lock on to.' : 'No one nearby to lock on to.');
  }

  /** Talk: open the menu for whoever you're locked on to, or the nearest person in front of you. */
  private talk(): void {
    this.endRest();
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

  /**
   * GTA-style switch: the person you leave carries on by themselves straight
   * away; the camera pulls out, pans and drops in on the new person, who keeps
   * doing their own thing until you land and take over. Can't be interrupted.
   */
  private switchTo(id: string): void {
    const next = this.characters.find((c) => c.id === id);
    if (!next) return;
    this.freeWilling = false;
    this.lastInputAt = performance.now();
    if (!isPlayableAge(next.age)) {
      this.say(`${next.name} is too young to play.`);
      return;
    }
    if (next !== this.active) this.endRest();
    if (this.switching) {
      // Can't interrupt a switch, but remember the choice rather than ignoring it.
      this.queuedSwitch = next === this.switching.next ? null : next.id;
      return;
    }
    if (next === this.active) return;
    this.closeMenu();
    const prev = this.active;
    prev.controlled = false;
    prev.cancelOrder();
    prev.social = null;
    prev.mode = 'explore';
    prev.lockTarget = null;
    prev.brain.reset(this.now);
    this.press = null;
    this.markerFade = null;
    const from = this.cameraFocus ?? { x: prev.x, y: prev.y };
    this.switching = { plan: planSwitch(from, { x: next.x, y: next.y }, this.rig.targetSpan, M), t: 0, next };
    switchChannel.emit({ phase: 'start', id: next.id, name: next.name, colour: cssColour(next), activity: this.activityOf(next) });
  }

  /** The camera has landed: hand control to the new character. */
  private landSwitch(): void {
    const next = this.switching!.next;
    this.switching = null;
    this.game.canvas.style.filter = '';
    this.cameraFocus = { x: next.x, y: next.y };
    next.controlled = true;
    next.cancelOrder();
    next.social = null;
    next.heldUntil = 0;
    next.mode = 'explore';
    next.lockTarget = null;
    next.brain.reset(this.now);
    this.active = next;
    const queued = this.queuedSwitch;
    this.queuedSwitch = null;
    if (queued) this.time.delayedCall(350, () => this.switchTo(queued));
    switchChannel.emit({ phase: 'arrive', id: next.id, name: next.name, colour: cssColour(next), activity: this.activityOf(next) });
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
    const css = this.worldToCss(at, menu.kind === 'object' ? 0.6 * M : 0.9 * M);
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
      { id: 'fight', label: 'Fight', icon: '👊', disabled: selfBad ?? (target.status === 'ko' ? 'Out cold' : undefined) ?? fightBar(a.age, target.age) ?? undefined },
      { id: 'control', label: 'Take control', icon: '👤', disabled: isPlayableAge(target.age) ? undefined : 'Too young to play' },
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
            { id: 'wait', label: 'Wait…', icon: '⏳', disabled: a.mode === 'combat' ? 'Not mid-fight' : undefined },
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
        if (optionId === 'climb' && m.target instanceof Window) this.startClimb(a, m.target);
        else this.useObject(a, m.target, optionId);
        break;
      case 'self':
        if (optionId === 'yield') this.yieldTo(a, null);
        else if (optionId === 'stand') this.standUp(a);
        else if (optionId === 'sneak') a.motor = toggleCrouch(a.motor);
        else if (optionId === 'wait') this.askRest('wait', null);
        break;
    }
  }

  // ================================================================ World: shared actions (player and AI)

  protected ensureNav(level = 0): NavGrid {
    if (level !== 0) return this.upperNav(level);
    if (this.navDirty) {
      const obstacles: Obstacle[] = [];
      for (const child of this.solids.getChildren()) {
        if (this.solidLevel.has(child)) continue;
        const b = (child as Phaser.GameObjects.GameObject).body as Phaser.Physics.Arcade.StaticBody | null;
        if (!b || !b.enable) continue;
        if (b.isCircle) obstacles.push({ kind: 'circle', x: b.center.x, y: b.center.y, r: b.halfWidth });
        else obstacles.push({ kind: 'rect', x: b.x, y: b.y, w: b.width, h: b.height });
      }
      for (const door of this.doors) {
        const o = door.level === 0 ? door.navObstacle() : null;
        if (o) obstacles.push(o);
      }
      this.nav.build(obstacles, BODY_RADIUS + 2);
      this.nav.setLinks(this.navLinks());
      this.navDirty = false;
    }
    return this.nav;
  }

  /** The path grid for a storey above the ground: its walls, and nothing off the edge of its floors. */
  private upperNav(level: number): NavGrid {
    if (this.upperNavDirty) {
      this.upperNavs.clear();
      this.upperNavDirty = false;
    }
    let nav = this.upperNavs.get(level);
    if (nav) return nav;
    const obstacles: Obstacle[] = [];
    for (const child of this.solids.getChildren()) {
      if (this.solidLevel.get(child) !== level) continue;
      const b = (child as Phaser.GameObjects.GameObject).body as Phaser.Physics.Arcade.StaticBody | null;
      if (b?.enable) obstacles.push({ kind: 'rect', x: b.x, y: b.y, w: b.width, h: b.height });
    }
    for (const door of this.doors) {
      const o = door.level === level ? door.navObstacle() : null;
      if (o) obstacles.push(o);
    }
    nav = new NavGrid(this.size.w, this.size.h, this.size.cell);
    nav.build(obstacles, BODY_RADIUS + 2);
    const town = this.town;
    nav.blockWhere((x, y) => !!town && !!floorAt(town, x, y, level));
    this.upperNavs.set(level, nav);
    return nav;
  }

  // ---------------------------------------------------------------- senses (SensesHost)

  get smells(): readonly SmellSource[] {
    return this.senses.smells;
  }

  sightClear(a: Point, b: Point): boolean {
    return (
      this.sightGrid.lineClear(a, b) &&
      !this.doors.some((d) => crosses(a, b, d.hingePoint(), d.latchPoint())) &&
      // Glass is see-through; closed shutters aren't.
      !this.windows.some((w) => w.blocksSight && crosses(a, b, ...w.segment()))
    );
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
    return (
      walls +
      this.doors.filter((d) => crosses(a, b, d.hingePoint(), d.latchPoint())).length +
      this.windows.filter((w) => w.muffles && crosses(a, b, ...w.segment())).length
    );
  }

  perceive(c: Character, p: Perception): void {
    if (c === this.active && this.rest) {
      const why = interruptsRest(this.rest.kind, toStimulus(p));
      if (why) this.endRest(why);
    }
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

  /**
   * Ways through that aren't plain walking, for NPC routes (PLACEHOLDER rules):
   * - windows: from inside, always (they'll unlatch and open it up, then climb
   *   out); from outside, if it isn't latched (they open it up and climb in).
   *   Costs ~6 m, so doors win when open.
   * - locked doors: from inside, they'll unbar it (~2 m). From outside, no (no keys yet).
   * The character you control only uses these when there's no other way (see planOrder).
   */
  private navLinks(): NavLink[] {
    const links: NavLink[] = [];
    for (const w of this.windows) {
      const n = w.inward;
      const inside = { x: w.centre.x + n.x * 0.6 * M, y: w.centre.y + n.y * 0.6 * M };
      const outside = { x: w.centre.x - n.x * 0.65 * M, y: w.centre.y - n.y * 0.65 * M };
      links.push({ from: inside, to: outside, costMetres: 6, data: { kind: 'window', window: w } });
      // From outside, only an unlatched window lets you in.
      if (!w.isLatched) links.push({ from: outside, to: inside, costMetres: 6, data: { kind: 'window', window: w } });
    }
    for (const d of this.doors) {
      if (!d.isLocked || !d.inward) continue;
      const mid = { x: (d.hingePoint().x + d.latchPoint().x) / 2, y: (d.hingePoint().y + d.latchPoint().y) / 2 };
      const inside = { x: mid.x + d.inward.x * 0.7 * M, y: mid.y + d.inward.y * 0.7 * M };
      const outside = { x: mid.x - d.inward.x * 0.7 * M, y: mid.y - d.inward.y * 0.7 * M };
      links.push({ from: inside, to: outside, costMetres: 2, data: { kind: 'door', door: d } });
    }
    return links;
  }

  /** An NPC's route reached a link: open the window and climb through, or unbar the door. */
  private handleLink(c: Character, link: NavLink): void {
    if (c.linkBusy || c.climb) return;
    const data = link.data as { kind: 'window'; window: Window } | { kind: 'door'; door: Door };
    if (data.kind === 'door') {
      const d = data.door;
      if (d.isLocked) {
        if (!d.inward || (c.x - d.hingePoint().x) * d.inward.x + (c.y - d.hingePoint().y) * d.inward.y <= 0) {
          c.cancelOrder(); // outside a locked door: no way through
          return;
        }
        d.perform('unlock', { say: (m) => c.controlled && this.say(m) });
        this.navDirty = this.upperNavDirty = true;
      }
      c.order?.linkDone();
      return;
    }
    const w = data.window;
    const climb = () => this.beginClimb(c, w, link.to, () => c.order?.linkDone());
    if (w.passable) {
      climb();
      return;
    }
    // Open it right up (fails from outside a latched window), then climb.
    if (!w.openUp(c.pos())) {
      c.cancelOrder();
      return;
    }
    c.linkBusy = true;
    c.look = { angle: c.angleTo(w.centre), until: this.now + 800 };
    this.noise('door', w.centre.x, w.centre.y, c, 3);
    this.navDirty = this.upperNavDirty = true;
    this.time.delayedCall(700, () => {
      c.linkBusy = false;
      if (c.order && w.passable && c.status === 'ok') climb();
    });
  }

  /**
   * Plan a route. NPCs may always use links (windows, unbarring doors). The
   * character you control walks normally, and only falls back to links when
   * there's no other way there (e.g. the door's locked and a window is the only way).
   */
  private planOrder(c: Character, goal: Parameters<typeof MoveOrder.plan>[2]): MoveOrder | null {
    const nav = this.ensureNav(c.level);
    if (!c.controlled) return MoveOrder.plan(nav, c.pos(), goal, true);
    const plain = MoveOrder.plan(nav, c.pos(), goal, false);
    if (plain) return plain;
    const linked = MoveOrder.plan(nav, c.pos(), goal, true);
    if (linked?.path.some((w) => (w.link?.data as { kind?: string } | undefined)?.kind === 'window')) {
      this.say("There's no other way: you'll have to go through a window.");
    }
    return linked;
  }

  orderToPoint(c: Character, p: Point): boolean {
    const order = this.planOrder(c, { kind: 'point', x: p.x, y: p.y });
    if (!order) return false;
    c.order = order;
    c.onArrive = null;
    return true;
  }

  orderToCharacter(c: Character, target: Character, reach: number): boolean {
    const distance = (p: Point) => {
      const dx = p.x - target.x;
      const dy = p.y - target.y;
      return Math.sqrt(dx * dx + dy * dy);
    };
    return this.orderToReach(c, () => target.pos(), reach, null, distance);
  }

  private orderToReach(c: Character, closest: (from: Point) => Point, reach: number, onArrive: (() => void) | null, distance?: (from: Point) => number): boolean {
    const order = this.planOrder(c, { kind: 'reach', closest, reach, distance });
    if (!order) return false;
    c.order = order;
    c.onArrive = onArrive;
    return true;
  }

  wanderPoint(c: Character, radius: number): Point | null {
    const nav = this.ensureNav(c.level);
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
      const ctx: InteractContext = {
        say: (msg) => c.controlled && this.say(msg),
        // You're asked how long to sleep; anyone else (you too, on free will) just goes to bed.
        sleepIn: c === this.active && !this.freeWilling ? (bed) => this.askRest('sleep', bed) : undefined,
        begin: (o, offer) => this.beginDoing(c, o, offer),
      };
      obj.perform(optionId, ctx);
      this.navDirty = this.upperNavDirty = true; // e.g. a door got locked
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

  /** Walk up to an open window and climb through it to the other side. */
  startClimb(c: Character, w: Window): void {
    const side = w.isInside(c.pos()) ? 1 : -1;
    const n = w.inward;
    const near = { x: w.centre.x + n.x * side * 0.6 * M, y: w.centre.y + n.y * side * 0.6 * M };
    const far = { x: w.centre.x - n.x * side * 0.65 * M, y: w.centre.y - n.y * side * 0.65 * M };
    const begin = () => {
      c.cancelOrder();
      if (w.passable) {
        this.beginClimb(c, w, far);
        return;
      }
      // Open it up first (unless it's latched and you're outside).
      if (!w.openUp(c.pos())) {
        if (c.controlled) this.say('The window is latched.');
        return;
      }
      this.noise('door', w.centre.x, w.centre.y, c, 3);
      this.navDirty = this.upperNavDirty = true;
      c.linkBusy = true;
      c.look = { angle: c.angleTo(w.centre), until: this.now + 800 };
      this.time.delayedCall(700, () => {
        c.linkBusy = false;
        if (c.status === 'ok' && !c.climb && w.passable) this.beginClimb(c, w, far);
      });
    };
    if (Math.hypot(c.x - near.x, c.y - near.y) < 0.25 * M) begin();
    else if (!this.orderToReach(c, () => near, 0.15 * M, begin) && c.controlled) this.say("You can't get to that window.");
  }

  /** Climb through `w` to `far` (keeps any route they're following; `onDone` when they're through). */
  private beginClimb(c: Character, w: Window, far: Point, onDone?: () => void): void {
    c.social = null;
    c.mode = 'explore';
    c.lockTarget = null;
    c.climb = { from: c.pos(), to: far, t: 0, dur: 0.9, onDone };
    c.body.checkCollision.none = true;
    c.motor = { ...c.motor, vx: 0, vy: 0, facing: Math.atan2(far.y - c.y, far.x - c.x) };
    // Climbing isn't quiet, and anyone watching will remember it.
    this.noise('thud', w.centre.x, w.centre.y, c, 4);
    this.witness('saw_climb', w.centre.x, w.centre.y, c);
  }

  /** Move a climbing character through the window; returns true while they're climbing. */
  private stepClimb(c: Character, dt: number): boolean {
    const cl = c.climb;
    if (!cl) return false;
    cl.t += dt;
    const k = Math.min(1, cl.t / cl.dur);
    const e = k < 0.5 ? 2 * k * k : 1 - (-2 * k + 2) ** 2 / 2;
    const x = cl.from.x + (cl.to.x - cl.from.x) * e;
    const y = cl.from.y + (cl.to.y - cl.from.y) * e;
    c.obj.setPosition(x, y);
    c.body.reset(x, y);
    c.motor = { ...c.motor, vx: 0, vy: 0 };
    c.pose.lift = Math.sin(k * Math.PI) * 0.55 * M;
    c.pose.crouched = true;
    if (k >= 1) {
      const done = cl.onDone;
      c.climb = null;
      c.pose.lift = 0;
      c.body.checkCollision.none = false;
      done?.();
    }
    return true;
  }

  startSocial(c: Character, target: Character, action: SocialActionId): boolean {
    if (target === c || c.status !== 'ok') return false;
    if (target.asleep) {
      if (c.controlled) this.say(`${target.name} is asleep.`);
      return false;
    }
    // Nobody comes up and talks to you while you're waiting or sleeping.
    if (target === this.active && this.rest) return false;
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
    profiler.begin('update');
    this.frameUpdate(time, deltaMs);
    profiler.end('update');
  }

  /** Is this person simulated in full detail right now? (See sim/detail.ts.) */
  fullDetail(c: Character): boolean {
    const b = this.detailBox;
    if (!b || c === this.active) return true;
    return c.x >= b.x0 && c.x <= b.x1 && c.y >= b.y0 && c.y <= b.y1;
  }

  /** How many people are in full detail right now. */
  fullDetailCount(): number {
    return this.characters.reduce((n, c) => n + (this.fullDetail(c) ? 1 : 0), 0);
  }

  /** Near enough to the camera to be drawn? (Independent of the simulation's level of detail.) */
  private onScreen(c: Character): boolean {
    const b = this.screenBox;
    return !b || c === this.active || (c.x >= b.x0 && c.x <= b.x1 && c.y >= b.y0 && c.y <= b.y1);
  }

  /** Work out the screen area (for drawing) and the full-detail area (for the simulation). */
  private updateDetailBox(): void {
    const v = this.cameras.main.worldView;
    const p = this.proj;
    const m = detailSettings.marginM * M;
    const a = p.toGround(v.x, v.y);
    const b = p.toGround(v.right, v.bottom);
    // People stand up from their feet, so someone just below the bottom edge can still show: allow their height.
    const tall = p.upright ? (1.7 * M * p.up) / Math.max(0.1, Math.abs(p.toGround(0, 1).y)) : 0;
    this.screenBox = { x0: Math.min(a.x, b.x) - m, x1: Math.max(a.x, b.x) + m, y0: Math.min(a.y, b.y) - m, y1: Math.max(a.y, b.y) + m + tall };
    this.detailBox = detailSettings.offscreenLod ? this.screenBox : null;
  }

  /** Add someone to the world (e.g. the performance test's spawner). */
  spawnPerson(def: CharacterDef): Character {
    const c = new Character(this, def);
    this.personOf.set(c.obj, c);
    this.characters.push(c);
    this.senses.addCharacter(c);
    c.brain.reset(this.now + this.rng() * 1500);
    return c;
  }

  /** Take someone out of the world (e.g. the performance test lowering the headcount). Not the one you control. */
  removePerson(c: Character): void {
    if (c === this.active) return;
    const i = this.characters.indexOf(c);
    if (i < 0) return;
    this.characters.splice(i, 1);
    const j = this.peopleObjs.indexOf(c.obj);
    if (j >= 0) this.peopleObjs.splice(j, 1);
    // Anyone dealing with them stops.
    for (const o of this.characters) {
      if (o.lockTarget === c) o.lockTarget = null;
      if (o.social?.target === c) o.social = null;
      const st = o.brain.state as { foe?: Character; from?: Character; subject?: Character; other?: Character };
      if (st.foe === c || st.from === c || st.subject === c || st.other === c) o.brain.reset(this.now);
    }
    if (this.hoveredChar === c) this.clearHover();
    if (this.menu?.kind === 'character' && this.menu.target === c) this.closeMenu();
    this.senses.removeCharacter(c);
    this.charScreen.delete(c);
    this.footstepTimer.delete(c.id);
    c.view.destroy();
    c.overhead.destroy();
    c.obj.destroy();
  }

  private frameUpdate(_time: number, deltaMs: number): void {
    // Real time since the last frame (capped: after a long stall, don't try to simulate it all).
    const dt = Math.min(deltaMs / 1000, 0.25);
    this.updateDetailBox();
    // Wall collisions for people in full detail only (refilled in place: no new array).
    this.peopleObjs.length = 0;
    for (const c of this.characters) if (this.fullDetail(c)) this.peopleObjs.push(c.obj);
    this.senses.trackNoises = this.sensesOverlay;
    const k = this.keys;
    const a = this.active;

    // The rest dialog keeps the game paused until it's answered.
    if (Phaser.Input.Keyboard.JustDown(k.pause) && !this.restAsk) this.setPaused(!this.paused);
    if (Phaser.Input.Keyboard.JustDown(k.walls)) this.cycleWalls();
    if (Phaser.Input.Keyboard.JustDown(k.floorUp)) this.stepViewLevel(1);
    if (Phaser.Input.Keyboard.JustDown(k.floorDown)) this.stepViewLevel(-1);
    if (this.paused) {
      if (Phaser.Input.Keyboard.JustDown(k.esc)) {
        if (this.restAsk) this.answerRest(null);
        else this.closeMenu();
      }
      return;
    }

    if (this.switching) {
      // Mid-switch nobody is under your control: consume the presses so they don't fire on landing.
      // (Number keys still get through: picking someone else mid-switch queues it.)
      for (const [name, key] of Object.entries(k)) if (!['one', 'two', 'three', 'four', 'pause'].includes(name)) Phaser.Input.Keyboard.JustDown(key);
    }
    if (Phaser.Input.Keyboard.JustDown(k.combat)) this.toggleCombat();
    if (Phaser.Input.Keyboard.JustDown(k.lock)) this.toggleLock();
    if (Phaser.Input.Keyboard.JustDown(k.talk)) this.talk();
    if (Phaser.Input.Keyboard.JustDown(k.crouch) && a.status === 'ok') {
      this.endRest();
      a.motor = toggleCrouch(a.motor);
    }
    if (Phaser.Input.Keyboard.JustDown(k.debug)) this.toggleDebug();
    if (Phaser.Input.Keyboard.JustDown(k.senses)) this.sensesOverlay = !this.sensesOverlay;
    if (Phaser.Input.Keyboard.JustDown(k.esc)) this.closeMenu();
    (['one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'] as const).forEach((key, i) => {
      if (Phaser.Input.Keyboard.JustDown(k[key]) && this.characters[i]) this.switchTo(this.characters[i].id);
    });

    const pointerScreen = this.input.activePointer.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    // The floor under the pointer, on the storey shown (for following a held press, and aiming).
    const pointer = this.groundAt(pointerScreen.x, pointerScreen.y);

    // ---- the active character's input
    let manual = { x: (k.right.isDown ? 1 : 0) - (k.left.isDown ? 1 : 0), y: (k.down.isDown ? 1 : 0) - (k.up.isDown ? 1 : 0) };
    if (manual.x === 0 && manual.y === 0) manual = { ...touchStick.move };
    // WASD and the stick are screen-relative: up walks up the screen in whichever view.
    manual = screenToGroundDir(this.proj, manual.x, manual.y);
    if (this.switching) manual = { x: 0, y: 0 };
    const hasManual = (manual.x !== 0 || manual.y !== 0) && !a.climb;
    if (hasManual && a.status !== 'ko') {
      this.endRest();
      this.endDoing(a, false);
      a.cancelOrder();
      a.social = null;
      this.press = null;
      this.closeMenu();
      if (a.status === 'yielded') this.standUp(a);
    }
    if (this.press) {
      if (!this.press.touch) {
        if (!this.input.activePointer.leftButtonDown()) this.press = null;
        else if (pointer.level === a.level) this.press.point = { x: pointer.x, y: pointer.y };
      }
      if (this.press && this.now - this.press.since >= HOLD_TO_FOLLOW_MS) this.follow(this.now);
    }

    this.advance(dt, manual, hasManual, pointer);
    this.updateHover(pointerScreen.x, pointerScreen.y);
    profiler.begin('ui');
    this.emitUi(dt);
    profiler.end('ui');
  }

  /**
   * A world tick (20 a second, like Minecraft's): decisions and perception. Brains, conversations,
   * footstep noise and senses. Movement runs separately, faster (see moveStep).
   */
  private worldTick(dt: number): void {
    profiler.tick();
    profiler.begin('brains');
    this.updateFreeWill();
    for (const c of this.characters) {
      if (c.status === 'ko' || c.climb || c.asleep) continue;
      if (!c.controlled || (c === this.active && this.freeWilling)) c.brain.update(c, this);
      this.updateSocial(c);
    }
    this.lifeTick();
    profiler.end('brains');
    this.updateFootsteps(dt);
    profiler.begin('senses');
    this.senses.update(dt);
    profiler.end('senses');
  }

  /**
   * A movement step (60 a second): routes, motors, doors, climbing, poses, knockback, then physics.
   * Fixed size, so it behaves the same whatever the screen's frame rate.
   */
  private moveStep(dt: number, manual: Point, hasManual: boolean, pointer: Point): void {
    const k = this.keys;
    for (const c of this.characters) {
      c.prevX = c.x;
      c.prevY = c.y;
    }
    this.simMs += dt * 1000;
    this.clock.advance(dt);
    profiler.begin('separation');
    this.separatePeople();
    profiler.end('separation');
    // ---- doors swing under their own weight
    for (const door of this.doors) {
      const thud = door.update(dt);
      if (thud > 0) {
        this.doorThud(door, thud);
        const p = door.latchPoint();
        this.noise('door', p.x, p.y, undefined, LOUDNESS.door * Math.min(1, 0.4 + thud / 4));
      }
    }

    // ---- everyone
    profiler.begin('movement');
    for (const c of this.characters) {
      this.updateStatus(c, dt);
      if (c.status === 'ko') {
        c.body.setVelocity(0, 0);
        c.appliedKnock = { x: 0, y: 0 };
        this.updatePose(c, dt);
        continue;
      }
      if (c.climb) {
        this.updatePose(c, dt);
        this.stepClimb(c, dt);
        continue;
      }
      if (c.asleep) {
        c.body.setVelocity(0, 0);
        this.updatePose(c, dt);
        continue;
      }
      this.pushDoors(c, dt, this.now);


      let move: Point = ZERO;
      let run = false;
      if (c.controlled && hasManual) move = manual;
      else {
        const o = this.stepOrder(c, dt);
        move = o.move;
        run = o.run;
      }
      const held = !c.controlled && c.heldUntil > this.now;
      if (held || c.status === 'yielded') move = ZERO;
      // Busy with something (sitting, drinking, asleep): stay put, unless they've decided to go somewhere.
      if (c.doing) {
        if (c.order) this.endDoing(c, false);
        else move = ZERO;
      }
      // Tired or frozen people move slower.
      if (move !== ZERO) {
        const f = speedFactor(c.needs);
        if (f < 1) {
          this.scaledMove.x = move.x * f;
          this.scaledMove.y = move.y * f;
          move = this.scaledMove;
        }
      }

      if (c.lockTarget && (!c.lockTarget.isTargetable() || Math.hypot(c.lockTarget.x - c.x, c.lockTarget.y - c.y) > LOCK_BREAK)) {
        c.lockTarget = null;
      }
      let aimAngle: number | null = null;
      // Locked on (in or out of combat): keep facing them. Combat without a lock: face the mouse.
      if (c.lockTarget) aimAngle = c.angleTo(c.lockTarget);
      else if (c.mode === 'combat' && c.controlled && this.inputSource === 'mouse') aimAngle = c.angleTo(pointer);
      const sprintKey = c.controlled && (k.sprint.isDown || (touchStick.sprint && !c.motor.crouched));
      const input = this.motorInput;
      input.move = move;
      // Long point-and-click trips run too, unless sneaking. Only the sprint key breaks a sneak.
      input.sprint = sprintKey || (run && !c.motor.crouched);
      input.aimAngle = aimAngle;
      input.lookAngle = c.look && this.now < c.look.until ? c.look.angle : null;
      // The motor keeps its own velocity. (Reading it back from the physics body made every
      // touch, even a glancing one, wipe out your speed: Arcade zeroes the whole velocity on
      // contact, so you crept along at one frame's acceleration.) Only the part pushing straight
      // into something solid is dropped, so you don't walk on the spot against a wall.
      const bl = c.body.blocked;
      if ((bl.left && c.motor.vx < 0) || (bl.right && c.motor.vx > 0)) c.motor.vx = 0;
      if ((bl.up && c.motor.vy < 0) || (bl.down && c.motor.vy > 0)) c.motor.vy = 0;
      stepMotorInto(c.motor, input, tuning, dt);
      c.body.setVelocity(c.motor.vx + c.knock.x, c.motor.vy + c.knock.y);
      c.appliedKnock = { x: c.knock.x, y: c.knock.y };
      const decay = Math.exp(-12 * dt);
      c.knock.x *= decay;
      c.knock.y *= decay;

      this.updatePose(c, dt);
    }

    profiler.end('movement');
    this.physicsStep(dt);
    this.updateLevels();
  }

  /** Stairs: walking up one lifts you as you go, and halfway up you're on the floor above. */
  private updateLevels(): void {
    const town = this.town;
    if (!town) return;
    for (const c of this.characters) {
      let on = -1;
      for (let i = 0; i < town.stairs.length; i++) {
        const z = town.stairs[i];
        if ((c.level === z.fromLevel || c.level === z.toLevel) && inRect(c, z.rect)) {
          on = i;
          break;
        }
      }
      if (on >= 0) {
        const z = town.stairs[on];
        const t = stairProgress(z, c.x, c.y);
        c.z = z.zFrom + (z.zTo - z.zFrom) * t;
        c.level = t > 0.5 ? z.toLevel : z.fromLevel;
      } else if (c.level > 0) {
        const f = floorAt(town, c.x, c.y, c.level);
        if (f) c.z = f.z;
      } else c.z = 0;
      c.stair = on;
      c.pose.floor = c.z;
      c.pose.level = c.level;
    }
  }

  /** Arcade's physics, stepped by us at the movement rate (not once per rendered frame). */
  private physicsStep(dt: number): void {
    const world = this.physics.world;
    profiler.begin('physics');
    world.update(0, dt * 1000);
    world.postUpdate();
    profiler.end('physics');
  }

  /**
   * Run the simulation for this frame: fixed 60 Hz movement steps, with a world tick every third
   * one (20 Hz). Real time is accumulated and spent in whole steps; whatever's left over is used to
   * smooth drawing between steps. If the device falls behind, it catches up with extra steps (up to a
   * limit, then it lets time slip rather than grind to a halt). Waiting / sleeping runs many steps a
   * frame, within a time budget.
   */
  private advance(realDt: number, manual: Point, hasManual: boolean, pointer: Point): void {
    const started = performance.now();
    const speed = this.rest ? REST_SPEED : 1;
    this.time.timeScale = speed;
    this.moveAcc += realDt * speed;
    let steps = 0;
    while (this.moveAcc >= MOVE_DT) {
      const spent = performance.now() - started;
      if (this.rest ? spent > REST_FRAME_BUDGET_MS : steps >= MAX_CATCH_UP_STEPS || (steps > 0 && spent > CATCH_UP_BUDGET_MS)) {
        this.moveAcc = Math.min(this.moveAcc, MOVE_DT * 0.999); // drop the backlog
        break;
      }
      this.moveAcc -= MOVE_DT;
      if (++this.stepCount % WORLD_EVERY === 0) this.worldTick(MOVE_DT * WORLD_EVERY);
      this.moveStep(MOVE_DT, manual, hasManual, pointer);
      steps++;
      if (this.rest && this.clock.seconds >= this.rest.untilS) {
        this.endRest(this.rest.kind === 'sleep' ? 'You wake up.' : 'You finish waiting.');
        this.moveAcc = 0;
        break;
      }
    }
    if (this.rest) this.moveAcc = Math.min(this.moveAcc, MOVE_DT * 0.999);
    this.speedNow = realDt > 0 && speed > 1 ? Math.max(1, Math.round((steps * MOVE_DT) / realDt)) : 1;
  }

  // ---------------------------------------------------------------- waiting & sleeping

  /** Open the TES-style "how long?" dialog (pauses the game behind it). */
  private askRest(kind: RestKind, bed: Offering | null, explain = false): void {
    const a = this.active;
    if (this.rest || this.restAsk) return;
    if (a.status !== 'ok' || a.mode === 'combat' || this.switching) {
      if (explain) this.say(a.mode === 'combat' ? "You can't wait in the middle of a fight." : "You can't wait right now.");
      return;
    }
    this.closeMenu();
    this.restAsk = { kind, bed, wasPaused: this.paused };
    this.setPaused(true);
    // Sleep defaults to until dawn (if that's a night's sleep away), otherwise 8 hours; waiting to 1 hour.
    const toDawn = Math.round(this.clock.hoursUntil(DAWN_HOUR));
    const defaultHours = kind === 'sleep' ? (toDawn <= 12 ? Math.max(1, toDawn) : 8) : 1;
    restDialogChannel.emit({ kind, hourNow: this.clock.hourOfDay, defaultHours, maxHours: MAX_REST_HOURS });
  }

  private answerRest(hours: number | null): void {
    const ask = this.restAsk;
    if (!ask) return;
    this.restAsk = null;
    restDialogChannel.emit(null);
    this.setPaused(ask.wasPaused);
    if (hours && hours > 0) this.startRest(ask.kind, Math.min(MAX_REST_HOURS, hours), ask.bed);
  }

  private startRest(kind: RestKind, hours: number, bed: Offering | null): void {
    const a = this.active;
    if (a.status !== 'ok') return;
    a.cancelOrder();
    a.social = null;
    a.lockTarget = null;
    this.press = null;
    this.endDoing(a, false);
    this.rest = { kind, untilS: this.clock.seconds + hours * 3600, bed, startS: this.clock.seconds };
    // Anyone on their way over for a chat thinks better of it.
    for (const o of this.characters) if (o !== a && o.social?.target === a) o.social = null;
    const span = `${hours} hour${hours === 1 ? '' : 's'}`;
    if (kind === 'sleep') {
      a.asleep = true;
      a.lieHeight = bed ? bed.lieHeight : 0;
      if (a.motor.crouched) a.motor = toggleCrouch(a.motor);
      const offer = sleepOffer(bed);
      if (bed && offer) {
        bed.users.add(a.id);
        this.placeAt(a, bed.spotFor(offer, { x: a.x, y: a.y }));
      }
      this.say(`You lie down to sleep for ${span}.`);
    } else this.say(`You settle in to wait for ${span}.`);
  }

  /** Stop waiting / wake up (with a message if given). Does nothing if not resting. */
  private endRest(message?: string): void {
    const r = this.rest;
    if (!r) return;
    this.rest = null;
    this.time.timeScale = 1;
    this.speedNow = 1;
    const a = this.active;
    if (a.asleep) {
      a.asleep = false;
      a.lieHeight = 0;
      a.pose.lift = 0;
      // A proper night (3 hours or more) leaves a feeling about where they slept.
      if (r.kind === 'sleep' && this.clock.seconds - r.startS >= 3 * 3600) this.feel(a, sleepOffer(r.bed)?.moodlet ?? 'slept_rough');
      if (r.bed) {
        r.bed.users.delete(a.id);
        // Get up on the open side.
        const want = { x: a.x, y: a.y + 0.9 * M };
        const p = this.ensureNav(a.level).nearestFree(want, 2.5 * M) ?? want;
        a.obj.setPosition(p.x, p.y);
        a.body.reset(p.x, p.y);
        a.body.checkCollision.none = false;
        a.motor = { ...a.motor, facing: Math.PI / 2 };
      }
    }
    if (message) this.say(message);
  }

  /** Keep people from overlapping; whoever's easier to shift gives way more (see movement/shove.ts). */
  private separatePeople(): void {
    // Only people in full detail jostle; off-screen people walk their routes without bumping.
    const people = this.characters.filter((c) => !c.body.checkCollision.none && this.fullDetail(c));
    if (people.length < 2) return;
    // Bump in small local groups (a grid), not every pair in the world.
    this.bumpGrid.build(people);
    const done = new Set<Character>();
    for (const c of people) {
      if (done.has(c)) continue;
      const group = this.bumpGrid.query(c.x, c.y, BODY_RADIUS * 4, this.bumpNear).filter((o) => o.level === c.level && Math.hypot(o.x - c.x, o.y - c.y) < BODY_RADIUS * 2 + 2);
      if (group.length < 2) continue;
      const moves = separate(group.map((o) => ({ x: o.x, y: o.y, r: BODY_RADIUS, resistance: this.resistanceOf(o) })));
      group.forEach((o, i) => {
        const mv = moves[i];
        o.obj.x += mv.dx;
        o.obj.y += mv.dy;
      });
      done.add(c);
    }
  }

  private resistanceOf(c: Character): number {
    const prof = MOCK_PROFILES[c.id];
    return resistance({
      build: buildOf(c.figure),
      strength: prof?.skills.labour?.level ?? 3,
      temperament: c.temperament,
      traits: prof?.traits ?? [],
      braced: c.mode === 'combat' || c.motor.crouched || speedOf(c.motor) < 0.3 * M,
      limp: c.status === 'ko',
    });
  }

  private updateStatus(c: Character, dt: number): void {
    const now = this.now;
    if (c.status !== 'ok' && now >= c.statusUntil) this.standUp(c);
    if (c.status === 'ok' && c.health < MAX_HEALTH && now - c.lastHitAt > 8000 && !inDanger(c.needs)) {
      c.health = Math.min(MAX_HEALTH, c.health + 2 * dt);
    }
    c.pose.hitFlash = Math.max(0, c.pose.hitFlash - dt);
  }

  private pushDoors(c: Character, dt: number, time: number): void {
    for (const door of this.doors) {
      if (door.level !== c.level) continue;
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
    if (a.order && a.order.goal.kind === 'point') a.order.retarget(this.ensureNav(a.level), a.pos(), press.point);
    else this.orderToPoint(a, press.point);
    if (a.order) a.order.following = true;
  }

  private stepOrder(c: Character, dt: number): { move: Point; run: boolean } {
    const none = NO_MOVE;
    if (!c.order) return none;
    const st = c.order.step(c.pos(), dt);
    if (st.link) {
      this.handleLink(c, st.link);
      return none;
    }
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
      // Hungry or exhausted people take things worse.
      const outcome = resolveSocial(s.action, this.relationships.opinion(t.id, c.id) - irritability(t.needs), t.temperament, this.rng);
      const warm = outcome.reaction === 'pleased' || outcome.reaction === 'amused';
      const sour = outcome.reaction === 'annoyed' || outcome.reaction === 'hurt' || outcome.reaction === 'angry';
      for (const p of [c, t]) {
        p.needs.company = Math.min(1, p.needs.company + (sour ? 0.08 : 0.22));
        if (warm) p.needs.fun = Math.min(1, p.needs.fun + 0.06);
        if (warm) this.feel(p, 'nice_chat');
        if (sour) this.feel(p, 'argument');
      }
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
    pose.asleep = c.asleep;
    pose.sitting = c.sitting;
    if (c.asleep) pose.lift = c.lieHeight;
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
      if (other === c || other.status === 'ko' || !canFight(c.age, other.age)) continue;
      if (Math.hypot(wx - other.x, wy - other.y) <= BODY_RADIUS + 5) {
        this.hitCharacter(c, other, hand);
        return;
      }
    }
    const d = this.dummy;
    if (d && Math.hypot(wx - d.x, wy - d.y) <= d.radius + 6) {
      this.noise('thud', d.x, d.y, c, 4);
      d.hits++;
      if (c.controlled) this.say(`Your ${hand} hand hits the dummy. (${d.hits})`);
      d.flashUntil = this.now + 90;
      const away = Math.atan2(d.y - c.y, d.x - c.x);
      d.wobble = { x: 0, y: 0 };
      this.tweens.add({ targets: d.wobble, x: Math.cos(away) * 4, y: Math.sin(away) * 4, duration: 60, yoyo: true });
    }
  }

  private hitCharacter(attacker: Character, victim: Character, hand: Hand): void {
    victim.health = Math.max(0, victim.health - PUNCH_DAMAGE[hand]);
    victim.lastHitAt = this.now;
    victim.pose.hitFlash = 0.12;
    const away = attacker.angleTo(victim);
    victim.knock = { x: Math.cos(away) * 160, y: Math.sin(away) * 160 };
    victim.social = null;
    this.endDoing(victim, false);
    this.feel(victim, 'was_hit');
    if (victim.heldUntil !== Infinity) victim.heldUntil = 0;
    if (victim === this.active && this.rest) this.endRest(interruptsRest(this.rest.kind, { kind: 'hit', by: attacker.name }) ?? undefined);
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
    if (c === this.active && this.rest) return `${this.rest.kind === 'sleep' ? 'Sleeping' : 'Waiting'} · ${formatDuration(this.rest.untilS - this.clock.seconds)} left`;
    if (c.status === 'ko') return 'Out cold';
    if (c.status === 'yielded') return 'Yielding';
    if (c.social) {
      const verb = socialAction(c.social.action).label.toLowerCase();
      return c.social.phase === 'approach' ? `Going to ${verb} with ${c.social.target.name}` : `${socialAction(c.social.action).label} · ${c.social.target.name}`;
    }
    if (!c.controlled && c.heldUntil > this.now) return 'Talking';
    if (c.doing) return c.doing.offer.posture === 'lie' ? 'Asleep' : c.doing.obj ? `${c.doing.offer.label} · ${c.doing.obj.name}` : c.doing.offer.label;
    if (c === this.active && this.freeWilling) return `On their own: ${c.brain.activity || (c.order ? 'walking' : 'idling')}`;
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
    this.clockTimer -= dt;
    if (this.clockTimer <= 0) {
      this.clockTimer = 0.1;
      const parts = this.clock.parts();
      clockChannel.emit({ time: formatTime(parts), date: formatDate(parts), isDaytime: parts.isDaytime, speed: this.rest ? this.speedNow : 1 });
    }
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
        // Only something you're controlling can be cancelled from the action chip.
        busy: c.controlled && !!(this.rest || c.order || c.social || c.mode === 'combat' || c.lockTarget || c.doing),
        mood: moodOf(c.needs, c.moodlets),
        life:
          c === a
            ? {
                needs: { ...c.needs },
                moodlets: c.moodlets
                  .map((m) => ({ label: MOODLETS[m.id].label, value: MOODLETS[m.id].value, hoursLeft: Math.max(0, (m.until - this.clock.seconds) / 3600) }))
                  .sort((x, y) => Math.abs(y.value) - Math.abs(x.value)),
              }
            : undefined,
      }));
      rosterChannel.emit({
        members,
        activeId: a.id,
        memories: this.senses
          .memoriesOf(a)
          .recent(this.now, 12)
          .map(({ memory, confidence }) => ({
            text: describeMemory(memory, (id) => (id === a.id ? 'me' : (this.characters.find((c) => c.id === id)?.name ?? 'someone'))),
            sense: memory.sense,
            actor: memory.actor,
            target: memory.target,
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
    profiler.begin('draw');
    this.drawFrame(time, deltaMs);
    profiler.end('draw');
  }

  private drawFrame(time: number, deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000, 0.05);
    const cam = this.cameras.main;
    const sw = this.switching;
    let switchFocus: Point | null = null;
    if (sw) {
      if (!this.paused) sw.t += dt;
      const s = sampleSwitch(sw.plan, sw.t, { x: sw.next.x, y: sw.next.y });
      this.rig.span = s.span;
      switchFocus = s.focus;
      // Colour drains as you rise and comes back as you drop in (the game canvas only; the UI keeps its colour).
      const grey = s.airborne * sw.plan.intensity;
      this.game.canvas.style.filter = grey > 0.01 ? `grayscale(${(grey * 0.9).toFixed(3)}) brightness(${(1 - grey * 0.12).toFixed(3)})` : '';
      // Failsafe: never let a switch hang (it would block all further switching).
      if (s.done || sw.t > switchDuration(sw.plan) + 0.5) this.landSwitch();
    } else {
      this.rig.update(dt);
    }
    cam.setZoom(this.rig.rendererZoom(this.scale.width, this.scale.height, M));
    const screenScale = this.dpr() / cam.zoom;

    const p = this.proj;
    for (const c of this.characters) {
      if (!this.onScreen(c) || !this.personShown(c)) {
        // Off screen: not drawn (whatever the level of detail), and nothing to click.
        c.view.hide();
        c.overhead.setShown(false);
        this.charScreen.delete(c);
        continue;
      }
      c.overhead.setShown(true);
      const lyingOn = c.asleep && c.lieHeight > 0 ? (c.doing?.obj ?? (c === this.active ? this.rest?.bed : null) ?? null) : null;
      const onTop = lyingOn ?? (c.sitting ? c.doing?.obj ?? null : null);
      if (onTop) {
        const sp = onTop.sortPoint(p);
        c.view.depthOverride = 10 + p.depth(sp.x, sp.y) / 1000 + 0.0004;
      } else c.view.depthOverride = null;
      const dp = this.drawPos(c);
      const r = c.view.update(dp.x, dp.y, c.motor.facing, c.pose, p);
      this.charScreen.set(c, r);
      const showBar = c.health < MAX_HEALTH - 0.5 || c.mode === 'combat';
      c.overhead.setIndicator(this.awarenessIndicator(c));
      // Overhead.update lifts by 18 px itself; seen from above that's from their centre, upright from the top of their head.
      const at = p.upright ? { x: r.headTop.x, y: r.headTop.y + 14 } : { x: c.x, y: c.y };
      c.overhead.update(at.x, at.y, screenScale, this.now, c.health, MAX_HEALTH, showBar);
    }
    const a = this.active;
    const view = this.cameras.main.worldView;
    const pad = 3 * M;
    this.scenery.cull({ x0: view.x - pad, y0: view.y - pad, x1: view.right + pad, y1: view.bottom + pad });
    this.scenery.updateGround({ x0: view.x - pad, y0: view.y - pad, x1: view.right + pad, y1: view.bottom + pad });
    this.scenery.update(dt, { x: a.x, y: a.y }, this.charScreen.get(a)?.bounds ?? null);
    const bv = this.buildingView;
    if (bv) {
      this.updateViewLevel();
      bv.update(dt, a, a.level, this.charScreen.get(a)?.bounds ?? null, { x0: view.x - pad, y0: view.y - pad, x1: view.right + pad, y1: view.bottom + pad });
    }
    // Doors and windows cut down with their wall.
    for (const door of this.doors) {
      const h = door.hingePoint();
      door.displayHeight = bv && this.townDoors.has(door) ? bv.wallHeightNear(h.x, h.y, door.level) : this.scenery.wallHeightNear(h.x, h.y, 14);
    }
    bv?.updateDoors(this.doors);
    for (const w of this.windows) w.cut = this.scenery.isCutNear(w.centre.x, w.centre.y, 2);
    for (const obj of this.interactables) {
      const o = this.objectGfx.get(obj)!;
      o.g.clear();
      o.bounds = obj.render(o.g, p);
      const sp = obj.sortPoint(p);
      if (obj instanceof Window) {
        // Glass sits in the opening, so the wall above and below it draws over it; the shutters
        // sit on the outside face, in front of the wall if that face is towards you, behind it if not.
        const key = 10 + p.depth(sp.x, sp.y) / 1000;
        o.g.setDepth(key - 0.00004);
        const outsideFacesViewer = p.toward ? -(obj.inward.x * p.toward.x + obj.inward.y * p.toward.y) >= -0.01 : true;
        obj.outerG?.setDepth(outsideFacesViewer ? key + 0.0002 : key - 0.00004);
      } else {
        o.g.setDepth(p.upright ? (obj instanceof Door ? bandOf(obj.level) : 10) + p.depth(sp.x, sp.y) / 1000 + 0.0002 : obj.name === 'door' ? 12 : 11);
      }
    }
    this.drawFire(time, dt);
    this.drawMidden(time);
    this.drawDummy();

    this.drawLockRing(time);
    this.drawRoute(a, time, dt);
    this.drawSensesOverlay(time);
    this.drawCollisionView();

    const focus = switchFocus ?? this.followFocus(a, dt);
    const s = p.toScreen(focus.x, focus.y, p.upright ? 0.8 * M : 0);
    cam.centerOn(s.x, s.y);
  }

  /** Ground point the camera follows (smoothed, frame-rate independent). */
  private followFocus(a: Character, dt: number): Point {
    const at = this.drawPos(a);
    if (!this.cameraFocus) this.cameraFocus = { x: at.x, y: at.y };
    const k = 1 - Math.exp(-CAMERA_FOLLOW * dt);
    this.cameraFocus.x += (at.x - this.cameraFocus.x) * k;
    this.cameraFocus.y += (at.y - this.cameraFocus.y) * k;
    return this.cameraFocus;
  }

  /**
   * Where to draw someone this frame: between their last two movement steps, by how far through
   * the current step real time has got (so a 120 Hz screen stays smooth with 60 Hz movement).
   * Big jumps (teleports, climbing, getting into bed) aren't smoothed.
   */
  private drawPos(c: Character): Point {
    const t = this.rest ? 1 : Math.min(1, this.moveAcc / MOVE_DT);
    const dx = c.x - c.prevX;
    const dy = c.y - c.prevY;
    if (dx * dx + dy * dy > M * M) return this.drawAt.set(c.x, c.y);
    return this.drawAt.set(c.prevX + dx * t, c.prevY + dy * t);
  }

  private depthAt(x: number, y: number, topdownDepth: number): number {
    return this.proj.upright ? 10 + this.proj.depth(x, y) / 1000 : topdownDepth;
  }

  private drawDummy(): void {
    const d = this.dummy;
    if (!d) return;
    const p = this.proj;
    const g = d.g;
    g.clear();
    const x = d.x + d.wobble.x;
    const y = d.y + d.wobble.y;
    const sack = this.now < d.flashUntil ? 0xf0dca0 : 0xc9a65f;
    if (p.upright) {
      flat(g, p, circlePts(d.x, d.y, 18, 16), 0, 0x000000, 0.2);
      prism(g, p, circlePts(x, y, 3, 8), 0, 1.6 * M, { colour: 0x6b4a2b, outline: null });
      prism(g, p, circlePts(x, y, 14, 16), 0.75 * M, 0.7 * M, { colour: sack, outline: 0x231a12 });
      prism(g, p, rectPts(x - 3, y - 24, 6, 48), 1.25 * M, 0.08 * M, { colour: sack, outline: 0x231a12 });
      prism(g, p, circlePts(x, y, 9, 14), 1.45 * M, 0.25 * M, { colour: sack, outline: 0x231a12 });
    } else {
      g.fillStyle(0x000000, 0.2);
      g.fillEllipse(x + 2, y + 2, 26, 50);
      g.lineStyle(2, 0x231a12, 1);
      g.fillStyle(sack, 1);
      g.fillRect(x - 4, y - 24, 8, 48);
      g.strokeRect(x - 4, y - 24, 8, 48);
      g.fillCircle(x, y, 14);
      g.strokeCircle(x, y, 14);
      g.fillStyle(0x6b4a2b, 1);
      g.fillCircle(x, y, 4);
    }
    g.setDepth(this.depthAt(d.x, d.y + 14, 15));
  }

  private drawFire(time: number, dt: number): void {
    const f = this.fire;
    if (!f) return;
    const p = this.proj;
    const g = f.g;
    g.clear();
    discOnGround(g, p, f.x + 2, f.y + 2, 28, 0x000000, 0.2);
    discOnGround(g, p, f.x, f.y, 20, 0x2a2420, 1);
    // Ring of stones.
    for (let i = 0; i < 9; i++) {
      const a = (i / 9) * Math.PI * 2;
      prism(g, p, circlePts(f.x + Math.cos(a) * 22, f.y + Math.sin(a) * 22, 6, 10), 0, p.upright ? 0.18 * M : 0, { colour: i % 2 ? 0x8a857c : 0x77726a, outline: 0x2c2822 });
    }
    // Logs.
    prism(g, p, rectPts(f.x - 14, f.y - 3, 28, 6), 0, p.upright ? 0.1 * M : 0, { colour: 0x5a3a22, outline: null });
    prism(g, p, rectPts(f.x - 3, f.y - 14, 6, 28), p.upright ? 0.1 * M : 0, p.upright ? 0.1 * M : 0, { colour: 0x6a4428, outline: null });
    // Flames: seen from above they're blobs; upright they stand up.
    const base = p.toScreen(f.x, f.y, p.upright ? 0.15 * M : 0);
    for (let i = 0; i < 5; i++) {
      const fl = Math.sin(time / (90 + i * 23) + i) * 0.5 + 0.5;
      const a = i * 1.3 + time / 700;
      g.fillStyle(i % 2 ? 0xf2a33a : 0xe0612c, 0.85);
      if (p.upright) g.fillEllipse(base.x + Math.cos(a) * 6, base.y - 10 - fl * 8, 9 + fl * 4, 18 + fl * 12);
      else g.fillEllipse(base.x + Math.cos(a) * 5, base.y + Math.sin(a) * 5, 9 + fl * 6, 9 + fl * 6);
    }
    g.fillStyle(0xffe08a, 0.9);
    g.fillCircle(base.x, base.y - (p.upright ? 8 : 0), 4 + Math.sin(time / 70) * 1.5);
    g.setDepth(this.depthAt(f.x, f.y + 24, 10));

    f.smokeTimer += dt;
    if (f.smokeTimer > 0.35) {
      f.smokeTimer = 0;
      const s = p.toScreen(f.x + (this.rng() - 0.5) * 10, f.y, p.upright ? 0.5 * M : 0);
      const puff = this.add.circle(s.x, s.y, 6, 0xbfb8ad, 0.35).setDepth(35);
      this.tweens.add({ targets: puff, x: s.x + 30 + this.rng() * 20, y: s.y - (p.upright ? 70 : 40) - this.rng() * 20, scale: 3, alpha: 0, duration: 2200, onComplete: () => puff.destroy() });
    }
  }

  private drawMidden(time: number): void {
    const m = this.midden;
    if (!m) return;
    const p = this.proj;
    const g = m.g;
    g.clear();
    const z = (k: number) => (p.upright ? k * M : 0);
    flat(g, p, ellipse(m.x + 3, m.y + 4, 60, 40), 0, 0x000000, 0.15);
    flat(g, p, ellipse(m.x, m.y, 56, 36), z(0.05), 0x4a3a24);
    flat(g, p, ellipse(m.x - 10, m.y - 6, 40, 26), z(0.22), 0x5c4a2c);
    flat(g, p, ellipse(m.x - 14, m.y - 8, 24, 15), z(0.36), 0x6a5634);
    flat(g, p, ellipse(m.x + 18, m.y + 10, 22, 13), z(0.12), 0x3a2c1a);
    // Flies.
    g.fillStyle(0x111111, 0.9);
    for (let i = 0; i < 6; i++) {
      const t = time / (300 + i * 37) + i * 2;
      const s = p.toScreen(m.x + Math.cos(t) * (20 + i * 4), m.y + Math.sin(t * 1.3) * (12 + i * 3) - 10, z(0.6 + 0.15 * Math.sin(t * 2)));
      g.fillCircle(s.x, s.y, 1.6);
    }
    g.setDepth(p.upright ? 2.5 : 2);
  }

  /** Debug overlay (F4 or the Tuning panel): vision cones, noises, scents, smells. */
  private drawSensesOverlay(time: number): void {
    const g = this.overlayGfx;
    g.clear();
    if (!this.sensesOverlay) return;
    const a = this.active;
    // Smell sources.
    const p = this.proj;
    const pt = (x: number, y: number) => p.toScreen(x, y);
    for (const s of this.senses.smells) {
      g.lineStyle(2, s.pleasant ? 0xf2a33a : 0x7a8a3a, 0.5);
      ringOnGround(g, p, s.x, s.y, s.radius);
      discOnGround(g, p, s.x, s.y, s.radius, s.pleasant ? 0xf2a33a : 0x7a8a3a, 0.06);
    }
    // Scents: trails in the owner's colour, blood in red.
    for (const m of this.senses.scents.marks) {
      if (m.kind === 'blood') {
        g.fillStyle(0xb3121e, Math.min(0.9, m.strength));
        g.fillCircle(pt(m.x, m.y).x, pt(m.x, m.y).y, 4);
      } else {
        const owner = this.characters.find((c) => c.id === m.owner);
        g.fillStyle(owner?.palette.tunic ?? 0xffffff, m.strength * 0.6);
        g.fillCircle(pt(m.x, m.y).x, pt(m.x, m.y).y, 2.5);
      }
    }
    // Vision cones, clipped by walls, tinted by how aware they are of you.
    const rays = 28;
    for (const c of this.characters) {
      if (c.status === 'ko') continue;
      const aw = c === a ? 0 : this.senses.awarenessOf(c, a);
      const colour = c === a ? 0xffffff : aw >= 1 ? 0xe0574a : aw > 0.15 ? 0xe8c25a : 0x7fd47f;
      const pts: Phaser.Math.Vector2[] = [new Phaser.Math.Vector2(pt(c.x, c.y).x, pt(c.x, c.y).y)];
      for (let i = 0; i <= rays; i++) {
        const ang = c.motor.facing - SIGHT.halfAngle + (i / rays) * SIGHT.halfAngle * 2;
        let r = 0;
        while (r < SIGHT.range && !this.sightGrid.isBlockedAt(c.x + Math.cos(ang) * r, c.y + Math.sin(ang) * r)) r += 8;
        const q = pt(c.x + Math.cos(ang) * r, c.y + Math.sin(ang) * r);
        pts.push(new Phaser.Math.Vector2(q.x, q.y));
      }
      g.fillStyle(colour, c === a ? 0.05 : 0.1);
      g.fillPoints(pts, true);
      g.lineStyle(1, colour, 0.35);
      g.strokePoints(pts, true);
      g.lineStyle(1, 0xffffff, 0.25);
      ringOnGround(g, p, c.x, c.y, SCENT.presenceRange * M);
    }
    // Noises: expanding rings out to how far they carry.
    for (const n of this.senses.recentNoises) {
      const t = (this.now - n.at) / 700;
      const colour = n.kind === 'punch' || n.kind === 'shout' ? 0xe0574a : n.kind === 'footsteps' ? 0xffffff : 0x8ab4f8;
      g.lineStyle(2, colour, 0.6 * (1 - t));
      ringOnGround(g, p, n.x, n.y, n.loudness * M * Math.min(1, 0.25 + t));
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
      ringOnGround(g, this.proj, t.x, t.y, r, 0, a - 0.45, a + 0.45, 8);
    }
  }

  /** Point-and-click feedback for the active character: route line and destination marker. */
  private drawRoute(a: Character, time: number, dt: number): void {
    const g = this.routeGfx;
    g.clear();
    const p = this.proj;
    const marker = (mx: number, my: number, alpha: number) => {
      const r = 9 + Math.sin(time / 180) * 1.5;
      g.lineStyle(2.5, 0xf3e3b5, 0.85 * alpha);
      ringOnGround(g, p, mx, my, r);
      discOnGround(g, p, mx, my, 2.5, 0xf3e3b5, 0.6 * alpha);
    };
    if (a.order && !a.social) {
      g.lineStyle(2, 0xf3e3b5, 0.35);
      g.beginPath();
      const s0 = p.toScreen(a.x, a.y);
      g.moveTo(s0.x, s0.y);
      for (const q of a.order.path) {
        const s1 = p.toScreen(q.x, q.y);
        g.lineTo(s1.x, s1.y);
      }
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
    const latch = door.latchPoint();
    const p = this.proj.toScreen(latch.x, latch.y, this.proj.upright ? 1.0 * M : 0);
    const strength = Phaser.Math.Clamp(speed / 4, 0.25, 1);
    for (let i = 0; i < 5; i++) {
      const a = Math.random() * Math.PI * 2;
      const puff = this.add.circle(p.x, p.y, 3 + Math.random() * 3 * strength, 0xd8cbb0, 0.55 * strength).setDepth(35);
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

  /** F3: collision shapes outlined on the ground (physics bodies, nav-blocked areas aren't shown). */
  private toggleDebug(): void {
    this.collisionView = !this.collisionView;
  }

  private drawCollisionView(): void {
    const g = this.collisionGfx;
    g.clear();
    if (!this.collisionView) return;
    const p = this.proj;
    g.lineStyle(1.5, 0xff4fd8, 0.9);
    for (const child of this.solids.getChildren()) {
      const b = (child as Phaser.GameObjects.GameObject).body as Phaser.Physics.Arcade.StaticBody | null;
      if (!b || !b.enable) continue;
      if (b.isCircle) ringOnGround(g, p, b.center.x, b.center.y, b.halfWidth);
      else {
        const pts = rectPts(b.x, b.y, b.width, b.height).map((q) => p.toScreen(q.x, q.y));
        g.strokePoints(pts as Phaser.Math.Vector2[], true);
      }
    }
    g.lineStyle(1.5, 0x4fe0ff, 0.9);
    for (const c of this.characters) if (!c.body.checkCollision.none) ringOnGround(g, p, c.body.center.x, c.body.center.y, BODY_RADIUS);
    g.lineStyle(1.5, 0xffd84f, 0.9);
    for (const d of this.doors) {
      const a = p.toScreen(d.hingePoint().x, d.hingePoint().y);
      const b = p.toScreen(d.latchPoint().x, d.latchPoint().y);
      g.lineBetween(a.x, a.y, b.x, b.y);
    }
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

function cssColour(c: Character): string {
  return `#${c.palette.tunic.toString(16).padStart(6, '0')}`;
}

function ellipse(cx: number, cy: number, rx: number, ry: number): Point[] {
  const out: Point[] = [];
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * Math.PI * 2;
    out.push({ x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry });
  }
  return out;
}

/** The bits of a perception that matter for whether it interrupts a rest. */
function toStimulus(p: Perception): RestStimulus {
  switch (p.kind) {
    case 'sawAttack':
      return { kind: 'sawAttack', attacker: p.attacker.name, victim: p.victim.name };
    case 'heard':
      return { kind: 'heard', noise: p.noise, audibility: p.audibility };
    default:
      return { kind: p.kind };
  }
}

/** Why one person can't fight another (the age rule), or null if they can. */
function fightBar(attackerAge: number, targetAge: number): string | null {
  if (canFight(attackerAge, targetAge)) return null;
  if (fightGroup(attackerAge) === 'child') return "Children can't fight";
  if (fightGroup(targetAge) === 'child') return "They're a child";
  return fightGroup(attackerAge) === 'teen' ? 'Only other teenagers' : "They're a teenager";
}

/** What lying down on something gives (a bed, a straw pallet), if it offers that. */
function sleepOffer(o: Offering | null): Offer | null {
  return o?.offers().find((f) => f.posture === 'lie') ?? null;
}
