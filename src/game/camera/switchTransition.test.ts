import { describe, expect, it } from 'vitest';
import { planSwitch, sampleSwitch, switchDuration } from './switchTransition';

const M = 64;

describe('switch transition', () => {
  it('scales with distance: quick glide nearby, big pull-out with a wide shot far away', () => {
    const near = planSwitch({ x: 0, y: 0 }, { x: 3 * M, y: 0 }, 8, M);
    const far = planSwitch({ x: 0, y: 0 }, { x: 40 * M, y: 0 }, 8, M);
    expect(switchDuration(near)).toBeLessThan(1.2);
    expect(near.hold).toBe(0);
    expect(far.hold).toBeGreaterThan(0);
    expect(far.topSpan).toBeGreaterThan(40);
    expect(switchDuration(far)).toBeGreaterThan(switchDuration(near) * 2);
    expect(near.intensity).toBeLessThan(far.intensity);
  });

  it('starts on the old character, peaks at the top, and lands on the new one at the original zoom', () => {
    const from = { x: 0, y: 0 };
    const to = { x: 30 * M, y: 0 };
    const p = planSwitch(from, to, 8, M);
    const start = sampleSwitch(p, 0, to);
    expect(start.focus).toEqual(from);
    expect(start.span).toBeCloseTo(8);
    expect(start.airborne).toBeCloseTo(0);
    const top = sampleSwitch(p, p.up + p.hold / 2, to);
    expect(top.span).toBeCloseTo(p.topSpan);
    expect(top.airborne).toBe(1);
    const end = sampleSwitch(p, switchDuration(p) + 0.01, to);
    expect(end.done).toBe(true);
    expect(end.focus.x).toBeCloseTo(to.x);
    expect(end.span).toBeCloseTo(8);
  });

  it('follows the target if they move during the switch', () => {
    const p = planSwitch({ x: 0, y: 0 }, { x: 10 * M, y: 0 }, 8, M);
    const end = sampleSwitch(p, switchDuration(p), { x: 12 * M, y: 2 * M });
    expect(end.focus).toEqual({ x: 12 * M, y: 2 * M });
  });
});
