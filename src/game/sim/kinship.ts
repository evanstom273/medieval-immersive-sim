/**
 * Kinship: how two people are related, by blood (consanguinity) or by marriage (affinity), and what
 * the Church of England allowed. The rule in force through the Stuart period was Archbishop Parker's
 * Table of Kindred and Affinity (1563): thirty degrees within which a man may not marry (and the same
 * thirty, mirrored, for a woman). By blood: grandparents, parents, children, grandchildren, siblings,
 * aunts and uncles, nieces and nephews. By marriage: the same relations of one's spouse, and the
 * spouses of one's own relations (a step-mother, a son's wife, a brother's widow, a late wife's
 * sister…). First cousins were NOT forbidden.
 *
 * Pure: works on any people records with parents / spouse links.
 */

export interface KinPerson {
  id: string;
  sex: 'm' | 'f';
  parents: string[];
  /** Current spouse. */
  spouse?: string;
  /** Earlier spouses (widowed): affinity outlives a marriage. */
  formerSpouses?: string[];
}

export type Tie =
  | 'self'
  | 'parent'
  | 'child'
  | 'grandparent'
  | 'grandchild'
  | 'sibling'
  | 'halfSibling'
  | 'auntUncle'
  | 'nieceNephew'
  | 'firstCousin'
  | 'spouse'
  /** By marriage: a spouse's relation, or a relation's spouse (step-parents, in-laws). */
  | 'parentInLaw'
  | 'stepParent'
  | 'childInLaw'
  | 'stepChild'
  | 'siblingInLaw'
  | 'grandparentInLaw'
  | 'grandchildInLaw'
  | 'auntUncleInLaw'
  | 'nieceNephewInLaw'
  | 'none';

export interface Kinship {
  tie: Tie;
  /** Blood relation, as opposed to one made by marriage. */
  blood: boolean;
}

type Lookup = (id: string) => KinPerson | undefined;

const spousesOf = (p: KinPerson) => [...(p.spouse ? [p.spouse] : []), ...(p.formerSpouses ?? [])];

/** Blood tie from a to b (ignores marriage). */
function bloodTie(get: Lookup, a: KinPerson, b: KinPerson): Tie {
  if (a.id === b.id) return 'self';
  const parents = (p: KinPerson) => p.parents.map(get).filter((q): q is KinPerson => !!q);
  const aP = parents(a);
  const bP = parents(b);
  if (a.parents.includes(b.id)) return 'parent';
  if (b.parents.includes(a.id)) return 'child';
  if (aP.some((p) => p.parents.includes(b.id))) return 'grandparent';
  if (bP.some((p) => p.parents.includes(a.id))) return 'grandchild';
  const shared = a.parents.filter((x) => b.parents.includes(x)).length;
  if (shared >= 2 || (shared === 1 && a.parents.length === 1 && b.parents.length === 1)) return 'sibling';
  if (shared === 1) return 'halfSibling';
  // b is a sibling of one of a's parents, or the reverse.
  const sib = (x: KinPerson, y: KinPerson) => x.id !== y.id && x.parents.some((q) => y.parents.includes(q));
  if (aP.some((p) => sib(p, b))) return 'auntUncle';
  if (bP.some((p) => sib(p, a))) return 'nieceNephew';
  if (aP.some((p) => bP.some((q) => sib(p, q)))) return 'firstCousin';
  return 'none';
}

/** How b stands to a: by blood if they're kin, otherwise by marriage (through either's spouses). */
export function kinship(get: Lookup, a: KinPerson, b: KinPerson): Kinship {
  const blood = bloodTie(get, a, b);
  if (blood !== 'none') return { tie: blood, blood: true };
  if (spousesOf(a).includes(b.id)) return { tie: 'spouse', blood: false };
  // b is a blood relation of a's spouse (living or late): the spouse's parent, child, sibling…
  for (const sid of spousesOf(a)) {
    const s = get(sid);
    if (!s) continue;
    const t = bloodTie(get, s, b);
    const via: Partial<Record<Tie, Tie>> = { parent: 'parentInLaw', child: 'stepChild', grandparent: 'grandparentInLaw', grandchild: 'grandchildInLaw', sibling: 'siblingInLaw', halfSibling: 'siblingInLaw', auntUncle: 'auntUncleInLaw', nieceNephew: 'nieceNephewInLaw' };
    if (via[t]) return { tie: via[t]!, blood: false };
  }
  // b is the spouse (living or late) of one of a's blood relations: a step-parent, a son's wife…
  for (const sid of spousesOf(b)) {
    const s = get(sid);
    if (!s) continue;
    const t = bloodTie(get, a, s);
    const via: Partial<Record<Tie, Tie>> = { parent: 'stepParent', child: 'childInLaw', grandparent: 'grandparentInLaw', grandchild: 'grandchildInLaw', sibling: 'siblingInLaw', halfSibling: 'siblingInLaw', auntUncle: 'auntUncleInLaw', nieceNephew: 'nieceNephewInLaw' };
    if (via[t]) return { tie: via[t]!, blood: false };
  }
  return { tie: 'none', blood: false };
}

/** The ties within which Parker's Table (1563) forbade marriage. First cousins aren't among them. */
const FORBIDDEN: ReadonlySet<Tie> = new Set<Tie>([
  'self',
  'parent',
  'child',
  'grandparent',
  'grandchild',
  'sibling',
  'halfSibling',
  'auntUncle',
  'nieceNephew',
  'parentInLaw',
  'stepParent',
  'childInLaw',
  'stepChild',
  'siblingInLaw',
  'grandparentInLaw',
  'grandchildInLaw',
  'auntUncleInLaw',
  'nieceNephewInLaw',
]);

export interface MarriageCheck {
  /** Would the Church marry them? */
  allowed: boolean;
  kin: Kinship;
  /** Why not, in a phrase (for the player, later). */
  reason?: string;
}

/** May a and b marry, by the Table of Kindred and Affinity? (Assumes they're man and woman, both free to wed.) */
export function mayMarry(get: Lookup, a: KinPerson, b: KinPerson): MarriageCheck {
  const kin = kinship(get, a, b);
  if (kin.tie === 'spouse') return { allowed: false, kin, reason: 'already married to each other' };
  if (FORBIDDEN.has(kin.tie)) return { allowed: false, kin, reason: kin.blood ? 'too close in blood (the Table of Kindred and Affinity)' : 'too close by marriage (the Table of Kindred and Affinity)' };
  return { allowed: true, kin };
}

/**
 * How likely a permitted match is, relative to strangers: lawful, but cousin marriages were uncommon
 * among ordinary people (commoner than among the gentry, who kept land in the family).
 */
export function matchWeight(kin: Kinship): number {
  return kin.tie === 'firstCousin' ? 0.25 : 1;
}

/** A tie in words, as b stands to a ("Aunt", "Brother-in-law"…). */
export function tieWord(kin: Kinship, b: { sex: 'm' | 'f' }): string {
  const m = b.sex === 'm';
  const words: Record<Tie, [string, string]> = {
    self: ['You', 'You'],
    parent: ['Father', 'Mother'],
    child: ['Son', 'Daughter'],
    grandparent: ['Grandfather', 'Grandmother'],
    grandchild: ['Grandson', 'Granddaughter'],
    sibling: ['Brother', 'Sister'],
    halfSibling: ['Half-brother', 'Half-sister'],
    auntUncle: ['Uncle', 'Aunt'],
    nieceNephew: ['Nephew', 'Niece'],
    firstCousin: ['Cousin', 'Cousin'],
    spouse: ['Husband', 'Wife'],
    parentInLaw: ['Father-in-law', 'Mother-in-law'],
    stepParent: ['Stepfather', 'Stepmother'],
    childInLaw: ['Son-in-law', 'Daughter-in-law'],
    stepChild: ['Stepson', 'Stepdaughter'],
    siblingInLaw: ['Brother-in-law', 'Sister-in-law'],
    grandparentInLaw: ['Grandfather-in-law', 'Grandmother-in-law'],
    grandchildInLaw: ['Grandson-in-law', 'Granddaughter-in-law'],
    auntUncleInLaw: ['Uncle by marriage', 'Aunt by marriage'],
    nieceNephewInLaw: ['Nephew by marriage', 'Niece by marriage'],
    none: ['', ''],
  };
  return words[kin.tie][m ? 0 : 1];
}
