import type { Offer } from '../world/furniture';
import { doneWhenFull, scoreOffer, sleepsOn, WORTH_DOING } from './choose';
import { addMoodlet, ambientWarmth, expireMoodlets, healthLossPerHour, tickNeeds, type Moodlet, type Needs, type TickInput } from './needs';

/**
 * Living through time you're not watching (the overview's fast-forward): the same needs, the same
 * things on offer, the same scoring, routine, moodlets and health rules as the live game, run in
 * quarter-hour steps without bodies or walking. So when you zoom back in, everyone is as the time
 * they lived left them: fed or hungry, rested or not, in bed if it's the middle of the night.
 * Pure.
 */

/** Something in the village that offers actions (a bed, the larder, the well…), by id. */
export interface Source {
  id: string;
  offers: readonly Offer[];
  /** Near a fire (it warms you). */
  warm?: boolean;
}

export interface AbstractLife {
  needs: Needs;
  moodlets: Moodlet[];
  health: number;
  maxHealth: number;
  /** What they're doing now, if anything, and with what (a source id, or null for nothing, e.g. a chat). */
  doing: { offer: Offer; source: string | null; endS: number } | null;
  /** Collapsed from neglect (thirst, hunger, cold): out cold until looked after. */
  collapsed: boolean;
}

/** Talking with someone: a pseudo-action, available when there's anyone else about. */
export const CHAT: Offer = { id: 'chat', label: 'Chat', icon: '💬', gains: { company: 0.9, fun: 0.25 }, posture: 'stand', hours: 0.5, untilFull: 'company', moodlet: 'nice_chat' };
/** Sleeping on the floor, when there's no bed. */
export const FLOOR: Offer = { id: 'sleep', label: 'Sleep', icon: '💤', gains: { rest: 0.1 }, posture: 'lie', hours: 9, untilFull: 'rest', moodlet: 'slept_rough' };

const STEP = 15 * 60;

export interface LiveOptions {
  sources: readonly Source[];
  /** Is there anyone to talk to? */
  company: boolean;
  dayOfYear: (s: number) => number;
  /** For the small differences between people (dawdling, weighing things up differently). */
  rng?: () => number;
}

/** Live from game second `fromS` to `toS` (alone: nobody else wanting the same bed). */
export function liveThrough(life: AbstractLife, fromS: number, toS: number, o: LiveOptions): void {
  liveTogether([life], fromS, toS, o);
}

/**
 * Several people living the same stretch of time together, a quarter-hour at a time: a single-use
 * thing (a bed, a pallet, the privy) holds one person at a time, so the others make do (a pallet, the
 * floor, waiting their turn).
 */
export function liveTogether(lives: AbstractLife[], fromS: number, toS: number, o: LiveOptions): void {
  const rng = o.rng ?? Math.random;
  const singles = new Set<string>();
  for (const src of o.sources) if (src.offers.some((f) => f.single)) singles.add(src.id);
  for (let s = fromS; s < toS; s += STEP) {
    const dt = Math.min(STEP, toS - s);
    // Who's using what, this step.
    const taken = new Set<string>();
    for (const l of lives) if (l.doing?.source && singles.has(l.doing.source)) taken.add(l.doing.source);
    for (const life of lives) step(life, s, dt, o, taken, rng);
  }
}

const tick: TickInput = { dt: STEP, asleep: false, ambientWarmth: 0.6, gains: null };

function step(life: AbstractLife, s: number, dt: number, o: LiveOptions, taken: Set<string>, rng: () => number): void {
  {
    const hour = (s % 86400) / 3600;
    const now = s + dt;
    // Between things they dawdle a little (as the live brains pause before deciding).
    if (!life.doing && !life.collapsed && rng() < 0.7) {
      life.doing = choose(life, s, hour, o, taken, rng);
      if (life.doing?.source && life.doing.offer.single) taken.add(life.doing.source);
    }
    const d = life.doing;
    const src = d?.source ? o.sources.find((q) => q.id === d.source) : undefined;
    tick.dt = dt;
    tick.asleep = life.collapsed || d?.offer.posture === 'lie';
    // Indoors (they live at home), warmer by the fire.
    tick.ambientWarmth = ambientWarmth(o.dayOfYear(s), hour, true, src?.warm ? 1 : 4);
    tick.gains = life.collapsed ? null : (d?.offer.gains ?? null);
    tickNeeds(life.needs, tick);
    expireMoodlets(life.moodlets, now);
    if (d && !sleepsOn(d.offer, hour) && (now >= d.endS || (doneWhenFull(d.offer, hour) && life.needs[d.offer.untilFull!] >= 0.995))) {
      if (d.offer.moodlet) addMoodlet(life.moodlets, d.offer.moodlet, now);
      life.doing = null;
    }
    // Neglect costs health; looked after, it comes back.
    const loss = healthLossPerHour(life.needs) * (dt / 3600);
    if (loss > 0) {
      life.health = Math.max(0, life.health - loss);
      if (life.health <= 0) {
        life.collapsed = true;
        life.doing = null;
      }
    } else {
      life.health = Math.min(life.maxHealth, life.health + 20 * (dt / 3600));
      if (life.collapsed && life.health > 20) life.collapsed = false;
    }
    // Exhausted: asleep where they drop.
    if (life.needs.rest <= 0 && !life.doing && !life.collapsed) life.doing = { offer: FLOOR, source: null, endS: now + FLOOR.hours * 3600 };
  }
}

/** The best thing to do now, by the live game's scoring and routine (nothing nearby is far: it's home). */
function choose(life: AbstractLife, s: number, hour: number, o: LiveOptions, taken: Set<string>, rng: () => number): AbstractLife['doing'] {
  let best: { offer: Offer; source: string | null; score: number } | null = null;
  const consider = (offer: Offer, source: string | null) => {
    if (source && offer.single && taken.has(source)) return;
    // Everyone weighs things up a little differently.
    const score = scoreOffer(offer, life.needs, 8, hour) * (0.85 + rng() * 0.3);
    if (!best || score > best.score) best = { offer, source, score };
  };
  for (const src of o.sources) for (const offer of src.offers) consider(offer, src.id);
  if (o.company) consider(CHAT, null);
  // No bed free (or none at all): the floor.
  if (!o.sources.some((q) => q.offers.some((f) => f.posture === 'lie' && !(f.single && taken.has(q.id))))) consider(FLOOR, null);
  const b = best as { offer: Offer; source: string | null; score: number } | null;
  if (!b || b.score < WORTH_DOING) return null;
  return { offer: b.offer, source: b.source, endS: s + b.offer.hours * 3600 };
}
