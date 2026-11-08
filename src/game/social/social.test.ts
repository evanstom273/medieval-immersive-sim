import { describe, expect, it } from 'vitest';
import { reactToAttack } from '../combat/combat';
import { createRng } from '../util/rng';
import { Relationships, opinionWord } from './relationships';
import { resolveSocial, successChance } from './socialActions';

describe('relationships', () => {
  it('are one-directional and clamped', () => {
    const r = new Relationships();
    r.adjust('a', 'b', 30);
    expect(r.opinion('a', 'b')).toBe(30);
    expect(r.opinion('b', 'a')).toBe(0);
    r.adjust('a', 'b', 500);
    expect(r.opinion('a', 'b')).toBe(100);
    expect(opinionWord(-70)).toBe('Loathes');
  });
});

describe('social actions', () => {
  it('land more often with people who like you', () => {
    expect(successChance('joke', 60)).toBeGreaterThan(successChance('joke', -60));
    expect(successChance('embrace', 0)).toBeLessThan(0.1);
  });

  it('jokes mostly land with friends and mostly fall flat with enemies', () => {
    const rng = createRng(1);
    let friendly = 0;
    let hostile = 0;
    for (let i = 0; i < 400; i++) {
      if (resolveSocial('joke', 60, 'wary', rng).success) friendly++;
      if (resolveSocial('joke', -60, 'wary', rng).success) hostile++;
    }
    expect(friendly).toBeGreaterThan(300);
    expect(hostile).toBeLessThan(100);
  });

  it('insults always hurt, and anger the bold', () => {
    const rng = createRng(2);
    expect(resolveSocial('insult', 50, 'bold', rng).reaction).toBe('angry');
    expect(resolveSocial('insult', 50, 'meek', rng).targetDelta).toBeLessThan(0);
  });
});

describe('combat temperament', () => {
  it('bold fight, wary flee (unless cornered), meek yield, and everyone yields when beaten down', () => {
    expect(reactToAttack('bold', 0.9, false)).toBe('fight');
    expect(reactToAttack('wary', 0.9, false)).toBe('flee');
    expect(reactToAttack('wary', 0.9, true)).toBe('fight');
    expect(reactToAttack('meek', 0.9, false)).toBe('yield');
    expect(reactToAttack('bold', 0.2, false)).toBe('yield');
  });
});
