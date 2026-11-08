import { describe, expect, it } from 'vitest';
import { PX_PER_METRE as M } from '../movement/tuning';
import { Memories, MEMORY_HALF_LIFE } from './memory';
import { ScentField, smellStrength } from './scents';
import { SIGHT, audibility, stepAwareness, visibility } from './senseRules';

const viewer = { x: 0, y: 0, facing: 0 };
const walker = (x: number, y: number) => ({ x, y, crouched: false, speed: 1.4 });

describe('sight', () => {
  it('sees ahead, not behind, and not through walls', () => {
    expect(visibility(viewer, walker(5 * M, 0), true)).toBeGreaterThan(0.5);
    expect(visibility(viewer, walker(-5 * M, 0), true)).toBe(0);
    expect(visibility(viewer, walker(5 * M, 0), false)).toBe(0);
    expect(visibility(viewer, walker(20 * M, 0), true)).toBe(0);
  });

  it('notices sneaking and peripheral figures more slowly', () => {
    const centre = visibility(viewer, walker(6 * M, 0), true);
    const edge = visibility(viewer, walker(6 * M * Math.cos(1), 6 * M * Math.sin(1)), true);
    const sneaking = visibility(viewer, { ...walker(6 * M, 0), crouched: true }, true);
    expect(edge).toBeLessThan(centre);
    expect(sneaking).toBeLessThan(centre / 2);
  });

  it('builds awareness over time, instantly up close unless sneaking', () => {
    let a = 0;
    for (let i = 0; i < 3; i++) a = stepAwareness(a, 0.5, 8 * M, false, 0.1);
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(1);
    expect(stepAwareness(0, 1, SIGHT.closeRange - 1, false, 0.1)).toBe(1);
    expect(stepAwareness(0, 0.35, SIGHT.closeRange - 1, true, 0.1)).toBeLessThan(1);
  });
});

describe('hearing', () => {
  it('carries less far through walls', () => {
    expect(audibility(8 * M, 10, 0)).toBeGreaterThan(0);
    expect(audibility(8 * M, 10, 1)).toBe(0);
    expect(audibility(2 * M, 10, 1)).toBeGreaterThan(0);
  });
});

describe('memory', () => {
  it('merges repeats, upgrades sound to sight, and fades', () => {
    const mem = new Memories();
    mem.record({ kind: 'saw_attack', sense: 'sound', actor: 'a', target: 'b', x: 0, y: 0, at: 0, confidence: 0.5 });
    const m = mem.record({ kind: 'saw_attack', sense: 'sight', actor: 'a', target: 'b', x: 0, y: 0, at: 1000, confidence: 0.9 });
    expect(mem.all().length).toBe(1);
    expect(m.count).toBe(2);
    expect(m.sense).toBe('sight');
    expect(mem.confidence(m, 1000 + MEMORY_HALF_LIFE)).toBeCloseTo(0.45);
    mem.prune(1000 + MEMORY_HALF_LIFE * 6);
    expect(mem.all().length).toBe(0);
  });
});

describe('smell', () => {
  it('scent marks fade away; sources weaken with distance', () => {
    const f = new ScentField();
    f.add({ kind: 'blood', x: 0, y: 0, strength: 1, fade: 0.5 });
    expect(f.near(10, 0, 50).length).toBe(1);
    f.update(3);
    expect(f.marks.length).toBe(0);
    const src = { id: 's', kind: 'smoke' as const, x: 0, y: 0, radius: 100, pleasant: true };
    expect(smellStrength(src, 50, 0)).toBeCloseTo(0.5);
    expect(smellStrength(src, 150, 0)).toBe(0);
  });
});
