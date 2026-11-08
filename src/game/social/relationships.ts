/**
 * Opinions between characters. One-directional: what A thinks of B can differ
 * from what B thinks of A. Range −100 (loathing) … 100 (devoted). Pure TypeScript.
 */
export class Relationships {
  private opinions = new Map<string, number>();

  private key(of: string, about: string): string {
    return `${of}>${about}`;
  }

  opinion(of: string, about: string): number {
    return this.opinions.get(this.key(of, about)) ?? 0;
  }

  set(of: string, about: string, value: number): void {
    this.opinions.set(this.key(of, about), clampOpinion(value));
  }

  /** Change an opinion and return the new value. */
  adjust(of: string, about: string, delta: number): number {
    const v = clampOpinion(this.opinion(of, about) + delta);
    this.opinions.set(this.key(of, about), v);
    return v;
  }
}

export function clampOpinion(v: number): number {
  return Math.max(-100, Math.min(100, Math.round(v * 10) / 10));
}

/** A word for an opinion value, for the UI. */
export function opinionWord(v: number): string {
  if (v >= 60) return 'Devoted';
  if (v >= 30) return 'Fond';
  if (v >= 10) return 'Friendly';
  if (v > -10) return 'Neutral';
  if (v > -30) return 'Cool';
  if (v > -60) return 'Hostile';
  return 'Loathes';
}
