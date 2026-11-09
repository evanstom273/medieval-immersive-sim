import { between, createRng, pick, type Rng } from '../util/rng';
import { kinship, matchWeight, mayMarry, tieWord } from './kinship';
import { DAYS_PER_YEAR as CALENDAR_DAYS_PER_YEAR } from '../time/clock';

/**
 * Everyone in the world as records, for the long view: the generational fast-forward (the overview)
 * runs their lives abstractly, a day at a time: ageing, marrying, children, dying. The live village
 * is rebuilt from this when you zoom back in.
 *
 * PLACEHOLDER numbers throughout (death rates, marriage and birth chances): rough period figures,
 * to be tuned. PLACEHOLDER family: until real family ties are decided, the starting household (you
 * and the cast) counts as your family line.
 */

export type Sex = 'm' | 'f';

export interface Person {
  id: string;
  name: string;
  surname: string;
  sex: Sex;
  /** Game day of birth (can be before day 0). */
  born: number;
  /** Game day of death, if dead. */
  died?: number;
  spouse?: string;
  /** Late husbands or wives: ties by marriage outlive the marriage (see kinship.ts). */
  formerSpouses?: string[];
  parents: string[];
  children: string[];
  /** Where they live: an index into the region's settlements (0 = home). */
  home: number;
  /** In your family line (heirs are chosen from these). */
  family: boolean;
  /** Has a body in the live village (the cast, and family born there). */
  live: boolean;
}

export type LifeEvent =
  | { kind: 'birth'; person: string; family: boolean; needsName: boolean }
  | { kind: 'death'; person: string; family: boolean; you: boolean; age: number }
  | { kind: 'marriage'; a: string; b: string; family: boolean }
  | { kind: 'cameOfAge'; person: string; stage: string }
  | { kind: 'newcomer'; person: string };

/** 17th-century English given names and surnames, for people the game names. */
export const GIVEN: Record<Sex, string[]> = {
  m: ['John', 'William', 'Thomas', 'Richard', 'Robert', 'Henry', 'George', 'Edward', 'James', 'Francis', 'Nicholas', 'Christopher', 'Edmund', 'Ralph', 'Walter', 'Hugh', 'Roger', 'Matthew', 'Samuel', 'Daniel', 'Peter', 'Anthony', 'Stephen', 'Simon', 'Humphrey', 'Lawrence', 'Giles', 'Miles'],
  f: ['Mary', 'Elizabeth', 'Anne', 'Margaret', 'Jane', 'Joan', 'Alice', 'Agnes', 'Katherine', 'Ellen', 'Sarah', 'Susan', 'Dorothy', 'Frances', 'Grace', 'Isabel', 'Bridget', 'Joyce', 'Judith', 'Martha', 'Rebecca', 'Hester', 'Prudence', 'Lettice', 'Amy', 'Cicely', 'Barbara', 'Rose'],
};
export const SURNAMES = ['Smith', 'Taylor', 'Baker', 'Cooper', 'Fletcher', 'Turner', 'Walker', 'Wright', 'Carter', 'Mason', 'Thatcher', 'Shepherd', 'Miller', 'Webb', 'Ward', 'Wood', 'Hill', 'Green', 'Clarke', 'Harris', 'Allen', 'Cook', 'Hall', 'Young', 'King', 'Wilkins', 'Hobbs', 'Pratt', 'Coles', 'Lambert', 'Saunders', 'Fuller', 'Dyer', 'Tanner', 'Chandler', 'Archer'];

/** The game's calendar year (336 days: 12 months of 28). */
export const DAYS_PER_YEAR = CALENDAR_DAYS_PER_YEAR;
export const ageOf = (p: Person, day: number) => ((p.died ?? day) - p.born) / DAYS_PER_YEAR;
export const alive = (p: Person) => p.died === undefined;

/** Chance of dying within a year, by age. */
export function yearlyDeath(age: number): number {
  if (age < 1) return 0.15;
  if (age < 5) return 0.03;
  if (age < 15) return 0.006;
  if (age < 45) return 0.012;
  if (age < 60) return 0.025;
  if (age < 70) return 0.05;
  if (age < 80) return 0.1;
  return 0.22;
}

const perDay = (yearly: number) => 1 - Math.pow(1 - yearly, 1 / DAYS_PER_YEAR);
const STAGES: [number, string][] = [
  [13, 'a teenager'],
  [18, 'a young adult'],
  [30, 'an adult'],
  [65, 'an elder'],
];

export class Population {
  readonly people = new Map<string, Person>();
  private next = 1;
  private readonly rng: Rng;

  constructor(seed = 1647) {
    this.rng = createRng(seed);
  }

  add(p: Omit<Person, 'id' | 'children' | 'parents'> & Partial<Pick<Person, 'id' | 'children' | 'parents'>>): Person {
    const person: Person = { children: [], parents: [], ...p, id: p.id ?? `p${this.next++}` };
    this.people.set(person.id, person);
    return person;
  }

  get(id: string): Person | undefined {
    return this.people.get(id);
  }

  living(): Person[] {
    return [...this.people.values()].filter(alive);
  }

  /** A name for a new person: often after a parent or grandparent, otherwise from the list. */
  nameFor(sex: Sex, parents: Person[]): string {
    const r = this.rng;
    const kin = parents.filter((p) => p.sex === sex);
    for (const p of parents) for (const g of p.parents.map((id) => this.get(id)).filter((q): q is Person => !!q && q.sex === sex)) kin.push(g);
    if (kin.length && r() < 0.45) return pick(r, kin).name;
    return pick(r, GIVEN[sex]);
  }

  /**
   * Fill a settlement with households: couples with children, the odd widow or widower, a few
   * single people. `size` is roughly how many people.
   */
  populate(home: number, size: number, day: number): void {
    const r = this.rng;
    let n = 0;
    while (n < size) {
      const surname = pick(r, SURNAMES);
      const hAge = between(r, 20, 62);
      const husband = this.add({ name: pick(r, GIVEN.m), surname, sex: 'm', born: day - Math.round(hAge * DAYS_PER_YEAR), home, family: false, live: false });
      n++;
      if (r() < 0.85) {
        const wAge = Math.max(18, hAge + between(r, -8, 3));
        const wife = this.add({ name: pick(r, GIVEN.f), surname, sex: 'f', born: day - Math.round(wAge * DAYS_PER_YEAR), home, family: false, live: false, spouse: husband.id });
        husband.spouse = wife.id;
        n++;
        const kids = Math.floor(between(r, 0, Math.min(6, (wAge - 18) / 3)));
        for (let k = 0; k < kids; k++) {
          const age = between(r, 0, Math.min(wAge - 18, 25));
          const sex: Sex = r() < 0.5 ? 'm' : 'f';
          const child = this.add({ name: this.nameFor(sex, [husband, wife]), surname, sex, born: day - Math.round(age * DAYS_PER_YEAR), home, family: false, live: false, parents: [husband.id, wife.id] });
          husband.children.push(child.id);
          wife.children.push(child.id);
          n++;
        }
      }
    }
  }

  /**
   * One day of everyone's lives. `you` is the person you play (their death ends the reign).
   * Returns what happened, for the event pop-ups.
   */
  day(today: number, you: string | null): LifeEvent[] {
    const r = this.rng;
    const events: LifeEvent[] = [];
    const living = this.living();
    for (const p of living) {
      const age = ageOf(p, today);
      // Growing up.
      for (const [at, stage] of STAGES) {
        if (age >= at && age - 1 / DAYS_PER_YEAR < at && p.family) events.push({ kind: 'cameOfAge', person: p.id, stage });
      }
      // Dying.
      if (r() < perDay(yearlyDeath(age))) {
        p.died = today;
        const sp = p.spouse ? this.get(p.spouse) : undefined;
        if (sp && sp.spouse === p.id) {
          sp.spouse = undefined;
          sp.formerSpouses = [...(sp.formerSpouses ?? []), p.id];
        }
        events.push({ kind: 'death', person: p.id, family: p.family, you: p.id === you, age: Math.floor(age) });
        continue;
      }
    }
    // Marrying: unmarried adults find someone, mostly close to home.
    for (const p of this.living()) {
      if (p.spouse || p.sex !== 'f') continue;
      const age = ageOf(p, today);
      if (age < 18 || age > 45) continue;
      if (r() >= perDay(age < 30 ? 0.22 : 0.08)) continue;
      // Only matches the Church would make (the Table of Kindred and Affinity); cousins less often.
      const get = (id: string) => this.get(id);
      const suitors = this.living()
        .filter((q) => q.sex === 'm' && !q.spouse && ageOf(q, today) >= 18 && Math.abs(ageOf(q, today) - age) < 15)
        .map((q) => ({ q, check: mayMarry(get, p, q) }))
        .filter((s) => s.check.allowed);
      if (!suitors.length) continue;
      const near = suitors.filter((s) => s.q.home === p.home);
      const pool = near.length && r() < 0.7 ? near : suitors;
      const total = pool.reduce((t, s) => t + matchWeight(s.check.kin), 0);
      let roll = r() * total;
      let m = pool[0].q;
      for (const s of pool) {
        roll -= matchWeight(s.check.kin);
        if (roll <= 0) {
          m = s.q;
          break;
        }
      }
      p.spouse = m.id;
      m.spouse = p.id;
      // The bride moves to his home and takes his name; marrying into your family makes them family.
      const fromAway = p.home !== m.home;
      p.home = m.home;
      p.surname = m.surname;
      if (p.family || m.family) {
        if (!p.family && fromAway) events.push({ kind: 'newcomer', person: p.id });
        p.family = m.family = true;
        p.live = m.live = p.live || m.live || p.home === 0;
      }
      events.push({ kind: 'marriage', a: p.id, b: m.id, family: p.family });
    }
    // Children.
    for (const w of this.living()) {
      if (w.sex !== 'f' || !w.spouse) continue;
      const age = ageOf(w, today);
      if (age < 18 || age > 44) continue;
      const lastBirth = Math.max(-Infinity, ...w.children.map((id) => this.get(id)?.born ?? -Infinity));
      if (today - lastBirth < 450) continue;
      if (r() >= perDay(age < 35 ? 0.3 : 0.14)) continue;
      const h = this.get(w.spouse)!;
      const sex: Sex = r() < 0.5 ? 'm' : 'f';
      const family = w.family || h.family;
      const baby = this.add({ name: this.nameFor(sex, [h, w]), surname: h.surname, sex, born: today, home: h.home, family, live: family && h.home === 0, parents: [h.id, w.id] });
      h.children.push(baby.id);
      w.children.push(baby.id);
      events.push({ kind: 'birth', person: baby.id, family, needsName: family });
    }
    return events;
  }
}

/** How someone in the family stands to you, in a word or two (for the family panel). */
export function describeTie(pop: Population, you: Person, p: Person): string {
  return tieWord(kinship((id) => pop.get(id), you, p), p) || 'Household';
}
