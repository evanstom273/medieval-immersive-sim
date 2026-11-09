import { describe, expect, it } from 'vitest';
import type { Offer } from '../world/furniture';
import { NEED_IDS, type Needs } from './needs';
import { scoreOffer, WORTH_DOING } from './choose';

const needs = (patch: Partial<Needs> = {}): Needs => ({ ...(Object.fromEntries(NEED_IDS.map((id) => [id, 0.9])) as Needs), ...patch });
const drink: Offer = { id: 'drink', label: 'Drink', icon: '', gains: { thirst: 4 }, posture: 'stand', hours: 0.25, untilFull: 'thirst' };
const sleep: Offer = { id: 'sleep', label: 'Sleep', icon: '', gains: { rest: 0.14, comfort: 0.1 }, posture: 'lie', hours: 9, untilFull: 'rest' };

describe('choosing what to do', () => {
  it('thirsty people want a drink; satisfied ones do not bother', () => {
    expect(scoreOffer(drink, needs({ thirst: 0.2 }), 10, 12)).toBeGreaterThan(WORTH_DOING);
    expect(scoreOffer(drink, needs(), 10, 12)).toBeLessThan(WORTH_DOING);
  });

  it('nearer is better', () => {
    expect(scoreOffer(drink, needs({ thirst: 0.3 }), 2, 12)).toBeGreaterThan(scoreOffer(drink, needs({ thirst: 0.3 }), 40, 12));
  });

  it('bed at night when a bit tired; not in the afternoon unless exhausted', () => {
    expect(scoreOffer(sleep, needs({ rest: 0.6 }), 5, 23)).toBeGreaterThan(WORTH_DOING);
    expect(scoreOffer(sleep, needs({ rest: 0.6 }), 5, 15)).toBeLessThan(scoreOffer(sleep, needs({ rest: 0.6 }), 5, 23) / 5);
    expect(scoreOffer(sleep, needs({ rest: 0.1 }), 5, 15)).toBeGreaterThan(WORTH_DOING);
  });
});
