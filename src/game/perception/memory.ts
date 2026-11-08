/**
 * What a character remembers perceiving. Memories are BELIEFS, not facts:
 * hearing a fight gives "there was a fight over there", seeing it gives
 * "Edric hit Agnes". They fade over time. Pure TypeScript.
 */

export type Sense = 'sight' | 'sound' | 'smell' | 'touch';

export type MemoryKind = 'saw_attack' | 'was_attacked' | 'heard_fight' | 'saw_yield' | 'saw_ko' | 'smelled_blood' | 'saw_intervene' | 'saw_climb';

export interface Memory {
  kind: MemoryKind;
  sense: Sense;
  /** Who did it, if known. */
  actor?: string;
  /** Who it was done to, if known. */
  target?: string;
  x: number;
  y: number;
  /** First perceived (ms). */
  at: number;
  /** Last reinforced (ms). */
  lastAt: number;
  /** How many times it was reinforced (e.g. several punches seen). */
  count: number;
  /** 0..1 at the time it was last reinforced. */
  confidence: number;
}

/** Confidence halves every this many ms. PLACEHOLDER: real time, not game time, for now. */
export const MEMORY_HALF_LIFE = 3 * 60 * 1000;
const FORGET_BELOW = 0.08;
/** Repeat perceptions of the same thing within this window strengthen one memory. */
const MERGE_WINDOW = 15000;

export class Memories {
  private items: Memory[] = [];

  record(m: Omit<Memory, 'lastAt' | 'count'>): Memory {
    const same = this.items.find(
      (o) => o.kind === m.kind && o.actor === m.actor && o.target === m.target && m.at - o.lastAt < MERGE_WINDOW,
    );
    if (same) {
      same.lastAt = m.at;
      same.count++;
      same.confidence = Math.max(this.confidence(same, m.at), m.confidence);
      same.x = m.x;
      same.y = m.y;
      // Seeing beats hearing: upgrade the sense if this time was clearer.
      if (m.sense === 'sight') same.sense = 'sight';
      return same;
    }
    const fresh: Memory = { ...m, lastAt: m.at, count: 1 };
    this.items.push(fresh);
    return fresh;
  }

  /** Current confidence after fading. */
  confidence(m: Memory, now: number): number {
    return m.confidence * 0.5 ** ((now - m.lastAt) / MEMORY_HALF_LIFE);
  }

  /** Drop memories that have faded away. */
  prune(now: number): void {
    this.items = this.items.filter((m) => this.confidence(m, now) >= FORGET_BELOW);
  }

  /** Most recent first. */
  recent(now: number, n = 6): { memory: Memory; confidence: number }[] {
    return [...this.items]
      .sort((a, b) => b.lastAt - a.lastAt)
      .slice(0, n)
      .map((memory) => ({ memory, confidence: this.confidence(memory, now) }));
  }

  all(): readonly Memory[] {
    return this.items;
  }
}

export function describeMemory(m: Memory, name: (id: string | undefined) => string): string {
  const a = name(m.actor);
  const t = name(m.target);
  const times = m.count > 1 ? ` (×${m.count})` : '';
  switch (m.kind) {
    case 'saw_attack':
      return `Saw ${a} hit ${t}${times}`;
    case 'was_attacked':
      return `${a} hit me${times}`;
    case 'heard_fight':
      return `Heard a fight nearby${times}`;
    case 'saw_yield':
      return `Saw ${a} yield`;
    case 'saw_ko':
      return `Saw ${t} knocked out${m.actor ? ` by ${a}` : ''}`;
    case 'smelled_blood':
      return 'Smelled blood';
    case 'saw_climb':
      return `Saw ${a} climb through a window`;
    case 'saw_intervene':
      return `Saw ${a} step in for ${t}`;
  }
}
