import { describe, expect, it } from 'vitest';
import { kinship, mayMarry, tieWord, type KinPerson } from './kinship';

/** A little family: grandparents Gf+Gm; their children Father (m) and Aunt (f); Father + Mother have
 * Son and Daughter; Aunt + Uncle have Cousin; Mother's late first husband… and so on. */
function family() {
  const ps: Record<string, KinPerson> = {};
  const add = (id: string, sex: 'm' | 'f', parents: string[] = [], spouse?: string) => (ps[id] = { id, sex, parents, spouse });
  add('gf', 'm', [], 'gm');
  add('gm', 'f', [], 'gf');
  add('father', 'm', ['gf', 'gm'], 'mother');
  add('mother', 'f', [], 'father');
  add('aunt', 'f', ['gf', 'gm'], 'uncle');
  add('uncle', 'm', [], 'aunt');
  add('son', 'm', ['father', 'mother']);
  add('daughter', 'f', ['father', 'mother']);
  add('cousin', 'f', ['aunt', 'uncle']);
  add('half', 'f', ['father']);
  add('stranger', 'f');
  // A widower and his late wife's sister.
  add('widower', 'm');
  add('lateWife', 'f', ['p1', 'p2']);
  add('wifesSister', 'f', ['p1', 'p2']);
  add('p1', 'm');
  add('p2', 'f');
  ps.widower.formerSpouses = ['lateWife'];
  const get = (id: string) => ps[id];
  return { ps, get };
}

describe('kinship and the Table of Kindred and Affinity', () => {
  const { ps, get } = family();

  it('names blood ties', () => {
    expect(tieWord(kinship(get, ps.son, ps.daughter), ps.daughter)).toBe('Sister');
    expect(tieWord(kinship(get, ps.son, ps.gm), ps.gm)).toBe('Grandmother');
    expect(tieWord(kinship(get, ps.son, ps.aunt), ps.aunt)).toBe('Aunt');
    expect(tieWord(kinship(get, ps.son, ps.cousin), ps.cousin)).toBe('Cousin');
    expect(tieWord(kinship(get, ps.son, ps.half), ps.half)).toBe('Half-sister');
  });

  it('names ties by marriage', () => {
    expect(tieWord(kinship(get, ps.son, ps.uncle), ps.uncle)).toBe('Uncle by marriage');
    expect(tieWord(kinship(get, ps.widower, ps.wifesSister), ps.wifesSister)).toBe('Sister-in-law');
    expect(tieWord(kinship(get, ps.half, ps.mother), ps.mother)).toBe('Stepmother');
  });

  it('forbids what the Table forbids', () => {
    expect(mayMarry(get, ps.son, ps.daughter).allowed).toBe(false); // sister
    expect(mayMarry(get, ps.son, ps.half).allowed).toBe(false); // half-sister
    expect(mayMarry(get, ps.son, ps.aunt).allowed).toBe(false); // father's sister
    expect(mayMarry(get, ps.son, ps.gm).allowed).toBe(false); // grandmother
    expect(mayMarry(get, ps.widower, ps.wifesSister).allowed).toBe(false); // late wife's sister
  });

  it('allows first cousins and strangers', () => {
    expect(mayMarry(get, ps.son, ps.cousin).allowed).toBe(true);
    expect(mayMarry(get, ps.son, ps.stranger).allowed).toBe(true);
  });
});
