import Phaser from 'phaser';
import type { Gains, MoodletId, NeedId } from '../life/needs';
import { PX_PER_METRE } from '../movement/tuning';
import { circlePts, emptyBounds, flat, HIGHLIGHT, OUTLINE, prism, rectPts, type Bounds } from '../view/draw';
import type { Projection, Pt } from '../view/projection';
import type { InteractContext, Interactable, MenuOption } from './interactables';

/**
 * Objects offer actions (Life Simulation Design: "Objects, items and
 * ownership"). Each offer says what it does for which needs, so people (you
 * and the NPCs alike) choose between whatever's around them; a new object
 * needs no new AI.
 *
 * PLACEHOLDER art (plain boxes) and numbers.
 */

const M = PX_PER_METRE;

export type Posture = 'stand' | 'sit' | 'lie';

export interface Offer {
  id: string;
  label: string;
  icon: string;
  /** Per game hour while doing it. */
  gains: Gains;
  posture: Posture;
  /** Longest it takes (game hours). */
  hours: number;
  /** Stop early once this need is full. */
  untilFull?: NeedId;
  /** Felt afterwards. */
  moodlet?: MoodletId;
  /** Only one person at a time. */
  single?: boolean;
}

/** Anything that offers actions. */
export interface Offering extends Interactable {
  offers(): readonly Offer[];
  /** Where someone doing an offer stands, sits or lies (ground point and facing), given where they are now. */
  spotFor(offer: Offer, from: Pt): { x: number; y: number; facing: number };
  /** People currently using it (for single-use offers). */
  users: Set<string>;
  /** How high a person lying on it is (world px). */
  readonly lieHeight: number;
}

export function isOffering(o: Interactable): o is Offering {
  return typeof (o as Partial<Offering>).offers === 'function';
}

/** Menu options for an object's offers (greyed out when someone else is using a single-use one). */
export function offerOptions(o: Offering, who?: string): MenuOption[] {
  return o.offers().map((f) => ({
    id: f.id,
    label: f.label,
    icon: f.icon,
    disabled: f.single && o.users.size > 0 && !(who && o.users.has(who)) ? 'In use' : undefined,
  }));
}

export type FurnitureKind = 'bench' | 'table' | 'hearth' | 'fire' | 'well' | 'privy' | 'larder' | 'barrel' | 'pallet';

const H = (n: number) => n * M;

interface KindSpec {
  name: string;
  colour: number;
  top?: number;
  height: number;
  offers: Offer[];
  /** Drawn by something else (the existing well and fire): just the actions here. */
  invisible?: boolean;
  round?: boolean;
}

/** What each kind of object is, and what it offers. */
const KINDS: Record<FurnitureKind, KindSpec> = {
  bench: {
    name: 'bench',
    colour: 0x7a5532,
    top: 0x8f6a42,
    height: H(0.45),
    offers: [{ id: 'sit', label: 'Sit down', icon: '🪑', gains: { comfort: 0.6, rest: 0.04 }, posture: 'sit', hours: 1, untilFull: 'comfort' }],
  },
  table: { name: 'table', colour: 0x6b4a2b, top: 0x8a6440, height: H(0.75), offers: [] },
  hearth: {
    name: 'hearth',
    colour: 0x77706a,
    top: 0x3a2a20,
    height: H(0.35),
    offers: [{ id: 'warm', label: 'Warm yourself', icon: '🔥', gains: { fun: 0.15, comfort: 0.1 }, posture: 'stand', hours: 0.5, moodlet: 'warm_fire' }],
  },
  fire: {
    name: 'fire',
    colour: 0,
    height: 0,
    invisible: true,
    offers: [{ id: 'warm', label: 'Warm yourself', icon: '🔥', gains: { fun: 0.15 }, posture: 'stand', hours: 0.5, moodlet: 'warm_fire' }],
  },
  well: {
    name: 'well',
    colour: 0,
    height: 0,
    invisible: true,
    offers: [
      { id: 'drink', label: 'Drink', icon: '💧', gains: { thirst: 4 }, posture: 'stand', hours: 0.25, untilFull: 'thirst' },
      { id: 'wash', label: 'Wash', icon: '🫧', gains: { hygiene: 2 }, posture: 'stand', hours: 0.5, untilFull: 'hygiene', moodlet: 'washed' },
    ],
  },
  privy: {
    name: 'privy',
    colour: 0x6a5238,
    top: 0x5a4a38,
    height: H(1.9),
    offers: [{ id: 'relieve', label: 'Relieve yourself', icon: '🚽', gains: { bladder: 12 }, posture: 'stand', hours: 0.1, untilFull: 'bladder', moodlet: 'relieved', single: true }],
  },
  larder: {
    name: 'larder',
    colour: 0x5e4128,
    top: 0x6e4f32,
    height: H(1.2),
    // PLACEHOLDER: food without items. Real food (that runs out, is owned, goes stale) comes with the items slice.
    offers: [{ id: 'eat', label: 'Eat', icon: '🍞', gains: { hunger: 3 }, posture: 'stand', hours: 0.35, untilFull: 'hunger', moodlet: 'ate' }],
  },
  barrel: {
    name: 'ale barrel',
    colour: 0x7a5232,
    top: 0x5e3e24,
    height: H(0.8),
    round: true,
    offers: [{ id: 'ale', label: 'Drink ale', icon: '🍺', gains: { thirst: 3, fun: 0.8 }, posture: 'stand', hours: 0.35, untilFull: 'thirst', moodlet: 'ale' }],
  },
  pallet: {
    name: 'straw pallet',
    colour: 0xb89a5a,
    top: 0xcdb070,
    height: H(0.12),
    offers: [{ id: 'sleep', label: 'Sleep', icon: '💤', gains: { rest: 0.12, comfort: 0.05 }, posture: 'lie', hours: 9, untilFull: 'rest', moodlet: 'slept_straw', single: true }],
  },
};

/** A piece of furniture or a fixture: a solid box (or invisible, for things drawn elsewhere) that offers actions. */
export class Furniture implements Offering {
  readonly name: string;
  readonly kind: FurnitureKind;
  readonly rect: Phaser.Geom.Rectangle;
  readonly users = new Set<string>();
  private highlighted = false;
  private readonly spec: KindSpec;

  constructor(scene: Phaser.Scene, staticGroup: Phaser.Physics.Arcade.StaticGroup | null, kind: FurnitureKind, x: number, y: number, w: number, h: number) {
    this.kind = kind;
    this.spec = KINDS[kind];
    this.name = this.spec.name;
    this.rect = new Phaser.Geom.Rectangle(x - w / 2, y - h / 2, w, h);
    if (staticGroup) {
      const body = scene.add.rectangle(x, y, w, h).setVisible(false);
      scene.physics.add.existing(body, true);
      staticGroup.add(body);
    }
  }

  get lieHeight(): number {
    return this.spec.height;
  }

  offers(): readonly Offer[] {
    return this.spec.offers;
  }

  spotFor(offer: Offer, from: Pt): { x: number; y: number; facing: number } {
    const r = this.rect;
    if (offer.posture === 'lie') return { x: r.centerX + 0.05 * M, y: r.centerY, facing: Math.PI };
    if (offer.posture === 'sit') {
      // On the bench, at the end nearest them, facing away from it towards the nearer long side.
      const x = Phaser.Math.Clamp(from.x, r.left + 0.3 * M, r.right - 0.3 * M);
      return { x, y: r.centerY, facing: from.y < r.centerY ? -Math.PI / 2 : Math.PI / 2 };
    }
    // Stand at its edge, facing it.
    const p = this.closestPoint(from.x, from.y);
    const a = Math.atan2(from.y - p.y, from.x - p.x);
    return { x: p.x + Math.cos(a) * 0.45 * M, y: p.y + Math.sin(a) * 0.45 * M, facing: a + Math.PI };
  }

  sortPoint(p: Projection): Pt {
    const r = this.rect;
    return p.mode === 'isometric' ? { x: r.right, y: r.bottom } : { x: r.centerX, y: r.bottom };
  }

  render(g: Phaser.GameObjects.Graphics, p: Projection): Bounds {
    const b = emptyBounds();
    if (this.spec.invisible) return b;
    const r = this.rect;
    const outline = this.highlighted ? HIGHLIGHT : OUTLINE;
    const ow = this.highlighted ? 3 : 1.5;
    const h = p.upright ? this.spec.height : 0;
    const ground = this.spec.round ? circlePts(r.centerX, r.centerY, r.width / 2, 16) : rectPts(r.x, r.y, r.width, r.height);
    prism(g, p, ground, 0, h, { colour: this.spec.colour, top: this.spec.top, outline, outlineWidth: ow }, b);
    if (this.kind === 'hearth') {
      flat(g, p, circlePts(r.centerX, r.centerY, r.width * 0.28, 12), h + 1, 0xe0712a, 0.9);
      flat(g, p, circlePts(r.centerX, r.centerY, r.width * 0.15, 10), h + 2, 0xf6c34a, 0.9);
    }
    if (this.kind === 'privy') flat(g, p, rectPts(r.centerX - 8, r.bottom - 2, 16, 2), h * 0.55, 0x2b1c10);
    return b;
  }

  hitTest(x: number, y: number): boolean {
    const r = Phaser.Geom.Rectangle.Clone(this.rect);
    Phaser.Geom.Rectangle.Inflate(r, 4, 4);
    return r.contains(x, y);
  }

  closestPoint(x: number, y: number): Phaser.Math.Vector2 {
    const r = this.rect;
    return new Phaser.Math.Vector2(Phaser.Math.Clamp(x, r.left, r.right), Phaser.Math.Clamp(y, r.top, r.bottom));
  }

  options(): MenuOption[] {
    return offerOptions(this);
  }

  idleUse(): string | null {
    return null;
  }

  perform(optionId: string, ctx: InteractContext): void {
    const offer = this.spec.offers.find((o) => o.id === optionId);
    if (!offer) return;
    // Lying down to sleep: the person you're playing is asked how long (like a bed).
    if (offer.posture === 'lie' && ctx.sleepIn) ctx.sleepIn(this);
    else ctx.begin?.(this, offer);
  }

  setHighlight(on: boolean): void {
    this.highlighted = on;
  }
}
