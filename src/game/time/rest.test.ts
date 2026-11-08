import { describe, expect, it } from 'vitest';
import { interruptsRest } from './rest';

describe('interruptsRest', () => {
  it('a quiet door bang interrupts neither; a loud one stops a wait before it wakes a sleeper', () => {
    expect(interruptsRest('wait', { kind: 'heard', noise: 'door', audibility: 0.3 })).toBeNull();
    expect(interruptsRest('wait', { kind: 'heard', noise: 'door', audibility: 0.75 })).not.toBeNull();
    expect(interruptsRest('sleep', { kind: 'heard', noise: 'door', audibility: 0.75 })).toBeNull();
    expect(interruptsRest('sleep', { kind: 'heard', noise: 'door', audibility: 0.9 })).not.toBeNull();
  });

  it('sleepers see nothing', () => {
    expect(interruptsRest('sleep', { kind: 'sawAttack', attacker: 'Wat', victim: 'Maud' })).toBeNull();
    expect(interruptsRest('wait', { kind: 'sawAttack', attacker: 'Wat', victim: 'Maud' })).toContain('Wat');
  });

  it('footsteps and chatter never interrupt; being hit always does', () => {
    expect(interruptsRest('wait', { kind: 'heard', noise: 'footsteps', audibility: 1 })).toBeNull();
    expect(interruptsRest('sleep', { kind: 'heard', noise: 'talk', audibility: 1 })).toBeNull();
    expect(interruptsRest('sleep', { kind: 'hit', by: 'Edric' })).not.toBeNull();
  });
});
