import { describe, expect, it } from 'vitest';
import { resistance, separate, type ShoveFactors } from './shove';

const base: ShoveFactors = { build: { heightM: 1.7, weightKg: 70 }, strength: 3, temperament: 'wary', traits: [], braced: false, limp: false };

describe('resistance', () => {
  it('heavier, stronger, bolder, braced people are harder to move', () => {
    const r = resistance(base);
    expect(resistance({ ...base, build: { heightM: 1.85, weightKg: 95 } })).toBeGreaterThan(r);
    expect(resistance({ ...base, strength: 8 })).toBeGreaterThan(r);
    expect(resistance({ ...base, temperament: 'bold' })).toBeGreaterThan(r);
    expect(resistance({ ...base, temperament: 'meek' })).toBeLessThan(r);
    expect(resistance({ ...base, traits: ['Strong'] })).toBeGreaterThan(r);
    expect(resistance({ ...base, traits: ['Gentle'] })).toBeLessThan(r);
    expect(resistance({ ...base, braced: true })).toBeGreaterThan(r);
  });
});

describe('separate', () => {
  it('equal people share the overlap', () => {
    const [a, b] = separate([{ x: 0, y: 0, r: 16, resistance: 70 }, { x: 24, y: 0, r: 16, resistance: 70 }], 1);
    expect(a.dx).toBeCloseTo(-4);
    expect(b.dx).toBeCloseTo(4);
  });

  it('the one who holds their ground moves less', () => {
    const [big, small] = separate([{ x: 0, y: 0, r: 16, resistance: 150 }, { x: 24, y: 0, r: 16, resistance: 50 }], 1);
    expect(Math.abs(big.dx)).toBeCloseTo(2);
    expect(small.dx).toBeCloseTo(6);
  });

  it('leaves people who are not touching alone', () => {
    const out = separate([{ x: 0, y: 0, r: 16, resistance: 70 }, { x: 40, y: 0, r: 16, resistance: 70 }]);
    expect(out).toEqual([{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }]);
  });
});
