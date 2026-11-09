/**
 * Drawing people: the upper-body figures from the character mock-ups (the
 * "Body sliders" design board), ported to canvas. One body is drawn from any
 * of five angles (front, ¾ front, side, ¾ back, back); the game mirrors them
 * for the other three of its eight facings.
 *
 * Units are the mock-up's: the hem sits on the ground at y = 0, up is −y, and
 * an average adult's head top is at about y = −96. Every view is worked out
 * from the same drawn shapes, so sliders and age change every view together.
 *
 * Clothing: one plain shirt in the person's clothes colour, for now.
 */

import { ageProfile, heightStretch, type AgeProfile, type Body, type Sex } from './body';

type P2 = [number, number];
type ShapeSet = { N: P2[]; T: P2[]; F: P2[]; W: P2[]; M: P2[] };
type Arr5 = { N: number[]; T: number[]; F: number[]; W: number[]; M: number[] };
type Num5 = { N: number; T: number; F: number; W: number; M: number };

/**
 * Torso, left side, neck to hem: half-width x and height y, plus how far the body reaches in front
 * (df) and behind (db) at each of those heights. Every shape has the same nine levels, so they blend
 * level by level. N = normal, T = thinnest (fat −10), F = fattest (+10), W = wasted (muscle −10),
 * M = very muscular (+10).
 */
const SHAPES: Record<Sex, ShapeSet & { df: Arr5; db: Arr5; dip: Num5; neck: Num5 }> = {
  m: {
    N: [[-5, -68], [-11, -66.6], [-15.4, -60.6], [-15.2, -52], [-14, -44], [-13.1, -32], [-13.6, -20], [-14.2, -10], [-14, -2]],
    T: [[-4.4, -68], [-9.6, -66.6], [-12.6, -60.6], [-12.2, -52], [-10.8, -44], [-9.6, -32], [-10, -20], [-10.6, -10], [-10.5, -2]],
    F: [[-5.6, -68.4], [-12.4, -67], [-17.4, -61], [-18.4, -52], [-20.4, -42], [-22.4, -30], [-22.6, -18], [-21.2, -8], [-18.8, -2]],
    W: [[-4.6, -68], [-10, -66.2], [-13.2, -59.6], [-13.4, -51], [-13, -43], [-12.8, -32], [-13.4, -20], [-14, -10], [-13.8, -2]],
    M: [[-6.4, -68.6], [-14, -67.4], [-20.4, -60.4], [-20.6, -52], [-17.4, -42], [-13.6, -31], [-13.2, -20], [-13.6, -10], [-13.6, -2]],
    df: {
      N: [3.5, 6, 7, 8, 8, 7.5, 7.6, 7.4, 7],
      T: [3, 5, 5.6, 6, 5.6, 5, 5, 5.2, 5.2],
      F: [4.2, 7, 8.6, 11, 14, 18, 19, 15, 11],
      W: [3.1, 5.2, 5.8, 6.2, 6, 5.8, 6, 6.2, 6.2],
      M: [4.4, 7.6, 9.4, 11, 10, 8, 7.6, 7.6, 7.4],
    },
    db: {
      N: [3.5, 5.5, 6.5, 7, 6.6, 6.2, 6.6, 7.4, 7.4],
      T: [3, 4.6, 5.4, 5.6, 5, 4.6, 4.8, 5.4, 5.4],
      F: [4, 6.4, 7.6, 8.4, 8.6, 9, 10.6, 11, 10],
      W: [3.1, 5, 5.8, 6, 5.6, 5.4, 5.8, 6.4, 6.4],
      M: [4.4, 7.4, 9, 9.4, 8, 7, 7, 7.6, 7.6],
    },
    dip: { N: 2.6, T: 2.2, F: 3.8, W: 2.6, M: 2.6 },
    neck: { N: 4.5, T: 3.9, F: 5.3, W: 3.8, M: 5.9 },
  },
  f: {
    N: [[-4.6, -67.6], [-9.8, -66], [-12.8, -60], [-12.8, -53], [-13.8, -46], [-10.6, -31], [-13, -20], [-15, -9], [-14.4, -2]],
    T: [[-4.2, -67.6], [-8.8, -66], [-11, -60], [-11, -53], [-11.4, -46], [-8.8, -31], [-10.4, -20], [-11.8, -9], [-11.4, -2]],
    F: [[-5.2, -68], [-11.2, -66.6], [-15.6, -60.4], [-16.4, -53], [-18.6, -45], [-18, -31], [-20.6, -19], [-21.6, -9], [-20.4, -2]],
    W: [[-4.2, -67.4], [-9, -65.8], [-11.6, -59.6], [-11.8, -52.6], [-12.8, -45.6], [-10.2, -31], [-12.6, -20], [-14.6, -9], [-14, -2]],
    M: [[-5.6, -68], [-12.4, -67], [-17, -60.4], [-17, -52.6], [-15.6, -45], [-11.6, -31], [-12.6, -20], [-14.2, -9], [-13.8, -2]],
    df: {
      N: [3.2, 5.4, 6.4, 9.2, 10.4, 6.6, 7, 7.4, 7],
      T: [2.8, 4.8, 5.4, 7, 7.6, 4.8, 5, 5.4, 5.2],
      F: [3.8, 6.4, 8, 11.6, 14, 15, 16.4, 14, 11],
      W: [2.9, 5, 5.6, 7.6, 8.4, 5.6, 6, 6.4, 6.2],
      M: [3.8, 6.6, 8.4, 10, 10.6, 6.8, 7, 7.4, 7.2],
    },
    db: {
      N: [3.2, 5, 6, 6.4, 6.2, 5.8, 6.8, 8.4, 8],
      T: [2.8, 4.4, 5, 5.2, 5, 4.4, 5.2, 6.4, 6],
      F: [3.8, 6, 7.4, 8, 8.4, 9, 11, 12.6, 11.6],
      W: [2.9, 4.8, 5.4, 5.6, 5.4, 5, 6, 7.4, 7],
      M: [3.8, 6.6, 8, 8.4, 7.4, 6.2, 6.8, 8, 7.8],
    },
    dip: { N: 2.6, T: 2.2, F: 3.8, W: 2.6, M: 2.6 },
    neck: { N: 3.8, T: 3.4, F: 4.6, W: 3.3, M: 4.8 },
  },
};

/** Hairlines: how far down the head the hair comes, by angle round the head (0 = mid-forehead, 90 = over the ear, 180 = the nape). */
const HAIRLINE: Record<Sex, P2[]> = {
  m: [[0, -90.6], [40, -89.8], [70, -86.6], [86, -81.6], [96, -80.2], [108, -82], [128, -80.6], [155, -78.4], [180, -77.8]],
  f: [[0, -92.6], [20, -91.6], [45, -88], [65, -82], [80, -74], [95, -72.2], [180, -72.2]],
};

/** The five drawn angles, in degrees (0 = facing you, 90 = facing right, 180 = facing away). */
export const VIEW_DEGREES = [0, 45, 90, 135, 180] as const;

/** Drawing box in mock units, roomy enough for the broadest, fattest body and long hair. */
export const ART_BOX = { left: -36, right: 36, top: -112, bottom: 6 };

const R = 12.3;
const HC = -84;
const OUTLINE = '#2a1d14';

// ------------------------------------------------------------------ helpers

const f2 = (n: number) => (Math.round(n * 100) / 100).toString();
const pt = (p: P2 | { x: number; y: number }) => (Array.isArray(p) ? f2(p[0]) + ' ' + f2(p[1]) : f2(p.x) + ' ' + f2(p.y));
const NONE = '';
const through = (P: P2[]) => {
  let d = '';
  for (let i = 0; i < P.length - 1; i++) {
    const p0 = P[i - 1] || P[i];
    const p1 = P[i];
    const p2 = P[i + 1];
    const p3 = P[i + 2] || p2;
    d += ' C ' + pt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]) + ' ' + pt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]) + ' ' + pt(p2);
  }
  return d;
};
const closedThrough = (P: P2[]) => {
  const n = P.length;
  let d = 'M ' + pt(P[0]);
  for (let i = 0; i < n; i++) {
    const p0 = P[(i - 1 + n) % n];
    const p1 = P[i];
    const p2 = P[(i + 1) % n];
    const p3 = P[(i + 2) % n];
    d += ' C ' + pt([p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]) + ' ' + pt([p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]) + ' ' + pt(p2);
  }
  return d + ' Z';
};
const poly = (P: P2[]) => 'M ' + P.map(pt).join(' L ') + ' Z';
const line = (P: P2[]) => 'M ' + P.map(pt).join(' L ');
const ell = (cx: number, cy: number, rx: number, ry: number) =>
  'M ' + f2(cx - rx) + ' ' + f2(cy) + ' A ' + f2(rx) + ' ' + f2(ry) + ' 0 1 0 ' + f2(cx + rx) + ' ' + f2(cy) + ' A ' + f2(rx) + ' ' + f2(ry) + ' 0 1 0 ' + f2(cx - rx) + ' ' + f2(cy) + ' Z';
const table = (T: P2[], a: number) => {
  a = Math.min(180, Math.abs(a));
  for (let i = 1; i < T.length; i++) {
    if (a <= T[i][0]) {
      const t = (a - T[i - 1][0]) / (T[i][0] - T[i - 1][0]);
      return T[i - 1][1] + (T[i][1] - T[i - 1][1]) * t;
    }
  }
  return T[T.length - 1][1];
};

export function mixHex(a: string, b: string, t: number): string {
  return '#' + [1, 3, 5].map((i) => Math.round(parseInt(a.slice(i, i + 2), 16) * (1 - t) + parseInt(b.slice(i, i + 2), 16) * t).toString(16).padStart(2, '0')).join('');
}

// ------------------------------------------------------------------ shapes

interface Blended {
  pts: P2[];
  df: number[];
  db: number[];
  dip: number;
  neck: number;
}

function blend(sex: Sex, fat: number, mus: number): Blended {
  const S = SHAPES[sex];
  const ft = Math.abs(fat) / 10;
  const mt = Math.abs(mus) / 10;
  const Fk = fat >= 0 ? 'F' : 'T';
  const Mk = mus >= 0 ? 'M' : 'W';
  const mixArr = (o: Arr5) => o.N.map((v, i) => v + (o[Fk][i] - v) * ft + (o[Mk][i] - v) * mt);
  const pts = S.N.map((p, i): P2 => [p[0] + (S[Fk][i][0] - p[0]) * ft + (S[Mk][i][0] - p[0]) * mt, p[1] + (S[Fk][i][1] - p[1]) * ft + (S[Mk][i][1] - p[1]) * mt]);
  const mix = (o: Num5) => o.N + (o[Fk] - o.N) * ft + (o[Mk] - o.N) * mt;
  return { pts, df: mixArr(S.df), db: mixArr(S.db), dip: mix(S.dip), neck: mix(S.neck) };
}

/** Before puberty the body is halfway between the male and female shapes; toddlers have tummies; the old, rounded backs. */
function blendAged(sex: Sex, fat: number, mus: number, A: AgeProfile): Blended {
  const own = blend(sex, fat, mus);
  if (A.pub < 1) {
    const other = blend(sex === 'm' ? 'f' : 'm', fat, mus);
    const k = 0.5 + 0.5 * A.pub;
    const m = (a: number, b: number) => a * k + b * (1 - k);
    own.pts = own.pts.map((p, i): P2 => [m(p[0], other.pts[i][0]), m(p[1], other.pts[i][1])]);
    own.df = own.df.map((v, i) => m(v, other.df[i]));
    own.db = own.db.map((v, i) => m(v, other.db[i]));
    own.neck = m(own.neck, other.neck);
    own.dip = m(own.dip, other.dip);
  }
  for (let i = 1; i <= 3; i++) own.pts[i][0] *= 1 - 0.1 * A.child;
  own.df[4] += 1 * A.belly;
  own.df[5] += 2.5 * A.belly;
  own.df[6] += 3 * A.belly;
  own.pts[5][0] *= 1 + 0.08 * A.belly;
  own.pts[6][0] *= 1 + 0.08 * A.belly;
  own.db[1] += 1.2 * A.eld;
  own.db[2] += 2.4 * A.eld;
  own.db[3] += 1.6 * A.eld;
  own.df[3] -= 0.4 * A.eld;
  if (sex === 'f') own.pts[4][1] += 1.6 * A.eld * A.pub;
  return own;
}

/** Frame, bust, waist and hips reshape the blended body at particular heights and depths. */
function measure(b: Blended, body: Body, pub: number): Blended {
  const FRAME = [0.7, 1, 1, 0.9, 0.8, 0.6, 0.5, 0.5, 0.5];
  const fr = (body.frame / 10) * (0.4 + 0.6 * pub);
  b.pts.forEach((p, i) => {
    p[0] *= 1 + 0.14 * fr * FRAME[i];
    b.df[i] *= 1 + 0.1 * fr * FRAME[i];
    b.db[i] *= 1 + 0.1 * fr * FRAME[i];
  });
  b.neck *= 1 + 0.12 * fr;
  const bu = (body.bust / 10) * (body.sex === 'f' ? 1 : 0.35) * pub;
  b.pts[4][0] *= 1 + 0.12 * bu;
  b.pts[3][0] *= 1 + 0.05 * bu;
  b.df[4] += 3.2 * bu;
  b.df[3] += 1.6 * bu;
  b.df[5] += 0.6 * bu;
  const wa = (body.waist / 10) * (0.5 + 0.5 * pub);
  b.pts[5][0] *= 1 + 0.25 * wa;
  b.pts[6][0] *= 1 + 0.1 * wa;
  b.df[5] *= 1 + 0.2 * wa;
  b.db[5] *= 1 + 0.15 * wa;
  const hi = (body.hips / 10) * (0.3 + 0.7 * pub);
  b.pts[6][0] *= 1 + 0.08 * hi;
  b.pts[7][0] *= 1 + 0.25 * hi;
  b.pts[8][0] *= 1 + 0.2 * hi;
  b.db[6] += 0.8 * hi;
  b.db[7] += 2.2 * hi;
  b.db[8] += 1.6 * hi;
  return b;
}

// ------------------------------------------------------------------ one view

export interface FigureView {
  /** Torso scale (age): wide, tall. */
  X: number;
  Y: number;
  /** Head scale and placement: translate(fwd, headDy), scaled by hs about (0, −72). */
  hs: number;
  fwd: number;
  headDy: number;
  /** Mock-unit y of the top of the head, and of where hands hang. */
  headTop: number;
  handY: number;
  /** Hand radius and how far out they hang (mock units). */
  handR: number;
  handX: number;
  hair: string;
  brow: string;
  skin: string;
  silD: string;
  silBox: { x0: number; y0: number; x1: number; y1: number };
  neckD: string;
  headD: string;
  headBox: { x0: number; y0: number; x1: number; y1: number };
  headCelD: string;
  hollowD: string;
  hollowOpacity: number;
  jawD: string;
  jawOpacity: number;
  chinD: string;
  chinOpacity: number;
  wrinklesD: string;
  wrinkleOpacity: number;
  cheeksD: string;
  noseFillD: string;
  noseD: string;
  browsD: string;
  eyes: { x: number; y: number; rx: number; ry: number }[];
  glintsD: string;
  lashesD: string;
  mouthD: string;
  mouthColour: string;
  mouthWidth: number;
  earsBackD: string;
  earsFrontD: string;
  earInnerD: string;
  earsUnderD: string;
  hairMassD: string;
  hairShineD: string;
  drapeD: string;
  drapeBack: boolean;
  drapeStrandsD: string;
  collarD: string;
  placketD: string;
  shirtButtonsD: string;
  pecD: string;
  pecOpacity: number;
  bustD: string;
  bustOpacity: number;
  bellyD: string;
  bellyOpacity: number;
}

export function buildView(body: Body, deg: number): FigureView {
  const { sex, fat } = body;
  const A = ageProfile(body.age);
  const mus = body.mus * (0.35 + 0.65 * A.pub);
  const b = measure(blendAged(sex, fat, mus, A), body, A.pub);
  const th = (deg * Math.PI) / 180;
  const c = Math.cos(th);
  const s = Math.sin(th);
  const sy = heightStretch(body, A);
  const Y = sy * A.th;
  const X = A.tw;
  const hs = A.head;
  const headBottom = -68 * Y - 4 * A.neckLen;
  const fwd = 2.4 * A.eld * s;
  const headDy = headBottom + 72 + 1.5 * A.eld;
  const fP = Math.max(0, fat) / 10;
  const fN = Math.max(0, -fat) / 10;
  const mP = Math.max(0, mus) / 10;
  const mN = Math.max(0, -mus) / 10;
  const at = (arr: number[], y: number) => {
    const P = b.pts;
    if (y <= P[0][1]) return arr[0];
    for (let i = 1; i < P.length; i++) {
      if (y <= P[i][1]) return arr[i - 1] + ((arr[i] - arr[i - 1]) * (y - P[i - 1][1])) / (P[i][1] - P[i - 1][1]);
    }
    return arr[arr.length - 1];
  };
  const front = (x: number, y: number, cc?: number): P2 => [at(b.df, y) * s + x * (cc === undefined ? c : cc), y];

  // Torso outline.
  const L = b.pts.map((p, i): P2 => [-Math.sqrt((p[0] * c) ** 2 + (b.db[i] * s) ** 2), p[1]]);
  const Rt = b.pts.map((p, i): P2 => [Math.sqrt((p[0] * c) ** 2 + (b.df[i] * s) ** 2), p[1]]).reverse();
  const hl = L[L.length - 1];
  const hr = Rt[0];
  const silD = 'M ' + pt(L[0]) + through(L) + ' Q ' + f2((hl[0] + hr[0]) / 2) + ' ' + f2(hl[1] + 2 * b.dip) + ' ' + pt(hr) + through(Rt) + ' Z';
  const xs = [...L.map((p) => p[0]), ...Rt.map((p) => p[0])];
  const silBox = { x0: Math.min(...xs), y0: -68.6, x1: Math.max(...xs), y1: 2 * b.dip };

  // Neck.
  const nx = 1.0 * s;
  const bw = b.neck + mP * 2;
  const nTop = headBottom + 1.5 * A.eld - 1.5 * hs;
  const nTopW = b.neck * (0.5 * X + 0.5 * hs);
  const neckD = poly([[nx - bw * X, -65.5 * Y], [nx + fwd - nTopW, nTop], [nx + fwd + nTopW, nTop], [nx + bw * X, -65.5 * Y]]);
  const hx = 1.6 * s;

  // Head.
  const faceOn = Math.max(0.12, (1 + c) / 2);
  const jaw = (lower: number) => 1 + lower * ((0.15 * fP - 0.1 * fN - 0.08 * mN + 0.05 * mP + 0.04 * A.eld + 0.05 * A.belly) * faceOn + 0.05 * (body.frame / 10) * A.pub);
  const chinDrop = (2.6 * fP - 0.3 * fN + 0.6 * mP * A.pub + 0.9 * A.eld) * faceOn;
  const headPts: P2[] = [];
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2;
    const lower = Math.max(0, Math.sin(a));
    headPts.push([hx + R * Math.cos(a) * jaw(lower), HC + R * Math.sin(a) + lower * lower * chinDrop]);
  }
  const headD = closedThrough(headPts);
  const hxs = headPts.map((p) => p[0]);
  const headBox = { x0: Math.min(...hxs), y0: HC - R, x1: Math.max(...hxs), y1: HC + R + chinDrop };
  const headCelD = 'M ' + f2(hx + 6) + ' -98 C ' + f2(hx + 14) + ' -92 ' + f2(hx + 14) + ' -76 ' + f2(hx + 3) + ' -71 L ' + f2(hx + 22) + ' -71 L ' + f2(hx + 22) + ' -98 Z';

  type F3 = { x: number; y: number; z: number };
  const depthAt = (u: number, y: number) => Math.sqrt(Math.max(0, R * R - u * u - (y - HC) * (y - HC)));
  const P3 = (u: number, v: number, y: number): F3 => {
    const lower = Math.max(0, (y - HC) / R);
    const uj = u * jaw(lower);
    return { x: hx + uj * c + v * s, y: y + lower * lower * chinDrop * 0.7, z: -uj * s + v * c };
  };
  const inside = (p: F3, margin = 0.9): F3 => {
    const lower = Math.max(0, (p.y - HC) / R);
    const half = Math.sqrt(Math.max(0, R * R - (p.y - HC) * (p.y - HC))) * jaw(lower) - margin;
    return { ...p, x: hx + Math.max(-half, Math.min(half, p.x - hx)) };
  };
  const onFace = (u: number, y: number, out = 0) => inside(P3(u, depthAt(u, y) + out, y));
  const seen = (p: F3, min = 0.8) => p.z > min;
  const seg = (a: F3, q: F3, b2: F3, dy = 0) => ' M ' + f2(a.x) + ' ' + f2(a.y) + ' Q ' + f2(q.x) + ' ' + f2(q.y + dy) + ' ' + f2(b2.x) + ' ' + f2(b2.y);

  const eyes: FigureView['eyes'] = [];
  let glintsD = '';
  let browsD = '';
  let lashesD = '';
  let cheeksD = '';
  const lo = 1.8 * A.child;
  const big = 1 + 0.3 * A.child;
  for (const sg of [-1, 1]) {
    const e = onFace(sg * 4.4, -80.8 + lo);
    if (seen(e)) {
      const rx = 1.25 * big * Math.max(0.42, e.z / 11);
      eyes.push({ x: e.x, y: e.y, rx, ry: 1.55 * big });
      if (e.z > 3) glintsD += ' ' + ell(e.x + 0.4 * Math.max(0.4, c) + 0.2 * s, e.y - 0.5 * big, 0.4 * big, 0.4 * big);
      if (sex === 'f' && A.pub > 0.3) {
        const a1 = onFace(sg * 5.6, -82 + lo);
        const a2 = onFace(sg * 6.6, -82.8 + lo);
        const b1 = onFace(sg * 5.1, -82.3 + lo);
        const b2 = onFace(sg * 5.8, -83.3 + lo);
        lashesD += ' M ' + f2(a1.x) + ' ' + f2(a1.y) + ' L ' + f2(a2.x) + ' ' + f2(a2.y) + ' M ' + f2(b1.x) + ' ' + f2(b1.y) + ' L ' + f2(b2.x) + ' ' + f2(b2.y);
      }
    }
    const b0 = onFace(sg * 2.4, -84.7 + lo);
    const b1 = onFace(sg * 4.4, -85.9 + lo);
    const b2 = onFace(sg * 6.4, -84.3 + lo);
    if (seen(b1)) browsD += seg(b0, b1, b2);
    const ch = onFace(sg * 6.8, -76.6 + lo * 0.6);
    if (seen(ch, 1.5)) cheeksD += ' ' + ell(ch.x, ch.y, 2 * Math.max(0.4, ch.z / 8) * (1 + 0.3 * fP), 1.2);
  }
  const small = 1 - 0.45 * A.child;
  const n0 = onFace(0.3, -79.4 + lo + 1.2 * A.child);
  const n1 = onFace(1.7 * small, -76.8 + lo, 0.8 * small);
  const n2 = onFace(0, -76.2 + lo);
  const noseD = seen(n1, -1) ? seg(n0, n1, n2) : NONE;
  let noseFillD = NONE;
  if (s > 0.8 && c > -0.4) {
    const y0 = -80.2 + lo + 1.2 * A.child;
    const q0 = P3(0, depthAt(0, y0), y0);
    const q1 = P3(0, depthAt(0, -77.2 + lo) + 1.9 * small, -77.2 + lo);
    const q2 = P3(0, depthAt(0, -75.9 + lo), -75.9 + lo);
    noseFillD = 'M ' + f2(q0.x) + ' ' + f2(q0.y) + ' L ' + f2(q1.x) + ' ' + f2(q1.y) + ' L ' + f2(q2.x) + ' ' + f2(q2.y);
  }
  const mw = 2.4 * (1 - 0.3 * A.child);
  const m0 = onFace(-mw, -74.4 + lo * 0.5, 0.6);
  const m1 = onFace(0, -73.2 + lo * 0.5 + 0.3 * A.eld, 0.9);
  const m2 = onFace(mw, -74.4 + lo * 0.5, 0.6);
  const mouthD = seen(m1, -1) ? seg(m0, m1, m2) : NONE;

  let hollowD = '';
  let jawD = '';
  for (const sg of [-1, 1]) {
    const hc = onFace(sg * 7.6, -76.8);
    if (seen(hc, 2.5)) hollowD += ' ' + ell(hc.x, hc.y, 2.4 * Math.max(0.35, hc.z / 9), 1.5);
    const j0 = onFace(sg * 9.4, -77.2);
    const j1 = onFace(sg * 7.6, -73.4);
    const j2 = onFace(sg * 4.6, -72.2);
    if (seen(j0, 2) && seen(j2, 2)) jawD += seg(j0, j1, j2);
  }
  const chinY = HC + R + chinDrop;
  const chinD = c > -0.3 ? seg(P3(-4.8, 4, chinY - 2.4), P3(0, 6, chinY - 0.6), P3(4.8, 4, chinY - 2.4), 1.6) : NONE;

  let wrinklesD = '';
  const arc3 = (p0: F3, p1: F3, p2: F3) => (seen(p0, 1.5) && seen(p2, 1.5) ? seg(p0, p1, p2) : '');
  if (A.eld > 0.02) {
    for (const y of [-88, -89.6]) wrinklesD += arc3(onFace(-4.6, y), onFace(0, y - 0.5), onFace(4.6, y));
    for (const sg of [-1, 1]) {
      wrinklesD += arc3(onFace(sg * 6.6, -80.4), onFace(sg * 7.4, -80.6), onFace(sg * 8.2, -80.2));
      wrinklesD += arc3(onFace(sg * 6.6, -81.4), onFace(sg * 7.4, -81.8), onFace(sg * 8.1, -82.2));
      wrinklesD += arc3(onFace(sg * 2.4, -77.2), onFace(sg * 4, -75.6), onFace(sg * 3.6, -73.2));
      wrinklesD += arc3(onFace(sg * 3.2, -79), onFace(sg * 4.4, -78.4), onFace(sg * 5.6, -79));
    }
  }

  // Ears.
  let earsBackD = '';
  let earsFrontD = '';
  let earInnerD = '';
  for (const sg of [-1, 1]) {
    const e = P3(sg * 12 * jaw(0.16), -0.5, -82);
    const ear = ell(e.x, e.y, 2.2 * (0.55 + 0.45 * Math.abs(s * sg)), 3.2);
    if (e.z > 3) {
      earsFrontD += ' ' + ear;
      earInnerD += ' M ' + f2(e.x - 0.5) + ' ' + f2(e.y - 1.4) + ' Q ' + f2(e.x + 0.9) + ' ' + f2(e.y) + ' ' + f2(e.x - 0.3) + ' ' + f2(e.y + 1.4);
    } else earsBackD += ' ' + ear;
  }

  // Hair: everything on the ball above the hairline.
  const hp: P2[] = [];
  for (let phi = -90 - deg; phi <= 90 - deg + 0.001; phi += 5) {
    const norm = (((phi % 360) + 540) % 360) - 180;
    const recede = sex === 'm' ? 3 * A.eld * Math.max(0, 1 - Math.abs(norm) / 80) : 0;
    const H = table(HAIRLINE[sex], norm) - A.hairRise - recede;
    const rho = Math.sqrt(Math.max(0, R * R - (H - HC) * (H - HC)));
    const lower = Math.max(0, (H - HC) / R);
    hp.push([hx + rho * Math.sin(((phi + deg) * Math.PI) / 180) * jaw(lower), H]);
  }
  const first = hp[0];
  const last = hp[hp.length - 1];
  const angR = Math.atan2(last[1] - HC, last[0] - hx);
  const angL = Math.atan2(first[1] - HC, first[0] - hx);
  const span = (((angR - angL) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
  const HR = R + (sex === 'f' ? 1.2 : 0.6);
  const steps = Math.max(2, Math.ceil(span / 0.16));
  const crown: P2[] = [];
  for (let k = 1; k < steps; k++) {
    const a = angR - (span * k) / steps;
    crown.push([hx + HR * Math.cos(a), HC + HR * Math.sin(a)]);
  }
  const hairD = 'M ' + pt(first) + through(hp) + ' L ' + crown.map(pt).join(' L ') + ' Z';
  const shine = [P3(-6, depthAt(-6, -95), -95), P3(0, depthAt(0, -97.4), -97.4), P3(5, depthAt(5, -96), -96)];
  const across = Math.abs(shine[2].x - shine[0].x) > 4;
  const sh = across ? shine : [P3(0, -6.5, -95.4), P3(0, 0, -97.4), P3(0, 6, -96)];
  const hairShineD = seg(sh[0], sh[1], sh[2], -0.6);

  // Long hair falls down the back.
  let drapeD = NONE;
  let drapeStrandsD = NONE;
  const longHair = sex === 'f' && A.hairLen > 0.15;
  if (longHair) {
    const xc = hx - 6.5 * s;
    const w = R * (0.5 + 0.5 * Math.abs(c)) + 0.6;
    const top = -84;
    const len = (y: number) => top + (y - top) * A.hairLen;
    const tips: P2[] = [[-0.86, -58.2], [-0.5, -56.4], [-0.12, -57.4], [0.26, -55.8], [0.62, -57.2], [0.88, -58.6]];
    const side = (sg: number): P2[] => [[xc + sg * w * 0.7, top - 6], [xc + sg * (w + 0.4), len(-78)], [xc + sg * w * 0.98, len(-69)], [xc + sg * w * 0.9, len(-62)]];
    const leftSide = side(-1);
    const rightSide = side(1).reverse();
    const bottom = tips.map(([t, y]): P2 => [xc + t * w, len(y)]);
    drapeD = 'M ' + pt(leftSide[0]) + through([...leftSide, ...bottom, ...rightSide]) + ' Z';
    drapeStrandsD = [-0.55, -0.15, 0.25, 0.6].map((t) => 'M ' + f2(xc + t * w) + ' ' + f2(len(-77)) + ' Q ' + f2(xc + t * w * 1.08) + ' ' + f2(len(-68)) + ' ' + f2(xc + t * w * 0.95) + ' ' + f2(len(-59.4))).join(' ');
  }
  const drapeFront = longHair && c < 0.2;

  // Hands hang beside the widest part of the body around them.
  const handX = Math.max(Math.abs(b.pts[4][0]) * 0.92, Math.abs(b.pts[5][0]), Math.abs(b.pts[6][0]) * 0.94, Math.abs(b.pts[2][0]) * 0.8) + 5.2;
  const handR = (4.6 + 0.06 * mus + 0.03 * Math.max(0, fat)) * (1 + 0.1 * (body.frame / 10));

  // Shirt details.
  const collarCc = Math.max(c, 0.25);
  const back = (x: number, y: number): P2 => [-at(b.db, y) * s + x * c, y];
  const collarD =
    c > -0.1
      ? poly(([[-6.4, -69.3], [-0.3, -62.8], [-2.9, -70.8]] as P2[]).map((p) => front(p[0], p[1], collarCc))) + ' ' + poly(([[6.4, -69.3], [0.3, -62.8], [2.9, -70.8]] as P2[]).map((p) => front(p[0], p[1], collarCc)))
      : poly([back(-6, -69), back(-3, -71), back(3, -71), back(6, -69), back(5.6, -67.4), back(-5.6, -67.4)]);
  const showFront = c > 0.1;
  const dots = (list: P2[], r: number) => list.map((p) => ell(p[0], p[1], r, r)).join(' ');
  const chest = b.pts[3];
  const bust = b.pts[4];
  const belly = b.pts[6];
  const strain = (P: P2[]) =>
    'M ' + pt(front(P[0][0], P[0][1])) + ' Q ' + pt(front(P[1][0], P[1][1])) + ' ' + pt(front(P[2][0], P[2][1])) + (P.length > 3 ? ' Q ' + pt(front(P[3][0], P[3][1])) + ' ' + pt(front(P[4][0], P[4][1])) : '');
  const px = Math.abs(chest[0]) * 0.72;
  const py = chest[1] + 5;
  const bx = Math.abs(bust[0]) * 0.72;
  const by = bust[1] + 1;
  const ex = Math.abs(belly[0]) * 0.78;
  const ey = belly[1];
  const frontness = Math.max(0, c);

  const look = LOOK[sex];
  const hair = mixHex(body.hair, '#d3cec6', A.grey);
  const browBase = mixHex(body.hair, '#000000', look.browDarken);

  return {
    X,
    Y,
    hs,
    fwd,
    headDy,
    headTop: -72 + hs * (HC - R + 72) + headDy - (sex === 'f' ? 1.2 : 0.6) * hs,
    handY: -33.5 * Y,
    handR: handR * (0.2 + 0.8 * X),
    handX: handX * X,
    hair,
    brow: mixHex(browBase, '#bdb7ae', A.grey * 0.85),
    skin: body.skin,
    silD,
    silBox,
    neckD,
    headD,
    headBox,
    headCelD,
    hollowD,
    hollowOpacity: Math.max(fN, mN, 0.6 * A.eld) * 0.16,
    jawD,
    jawOpacity: mP * 0.16,
    chinD,
    chinOpacity: Math.max(0, fP - 0.2) * 0.45,
    wrinklesD,
    wrinkleOpacity: A.eld * 0.34,
    cheeksD,
    noseFillD,
    noseD,
    browsD,
    eyes,
    glintsD,
    lashesD,
    mouthD,
    mouthColour: sex === 'f' ? '#a8564a' : '#6b3a2a',
    mouthWidth: sex === 'f' ? 0.9 : 0.75,
    earsBackD,
    earsFrontD: sex === 'f' ? NONE : earsFrontD,
    earInnerD: sex === 'f' ? NONE : earInnerD,
    earsUnderD: sex === 'f' ? earsFrontD : NONE,
    hairMassD: drapeFront ? hairD + ' ' + drapeD : hairD,
    hairShineD,
    drapeD,
    drapeBack: longHair && !drapeFront,
    drapeStrandsD: drapeFront ? drapeStrandsD : NONE,
    collarD,
    placketD: showFront ? line([front(0, -63), front(0, -6)]) : NONE,
    shirtButtonsD: showFront ? dots([-56, -46.5, -37, -27.5, -18].map((y) => front(0.9, y)), 0.55) : NONE,
    pecD: strain([[-px, py], [-px / 2, py + 3], [0, py + 1], [px / 2, py + 3], [px, py]]),
    pecOpacity: mP * (sex === 'm' ? 0.24 : 0.12) * frontness * A.pub,
    bustD: strain([[-bx, by], [-bx * 0.55, by + 2.8], [-1.6, by + 0.8]]) + ' ' + strain([[1.6, by + 0.8], [bx * 0.55, by + 2.8], [bx, by]]),
    bustOpacity: sex === 'f' ? Math.max(0, 0.15 + fP * 0.05 + 0.1 * (body.bust / 10)) * frontness * A.pub : 0,
    bellyD: strain([[-ex, ey - 3], [0, ey + 5], [ex, ey - 3]]),
    bellyOpacity: (Math.max(0, fat - 2) / 8) * 0.2 * frontness,
  };
}

/** Eyebrows are the hair colour, a bit darker on women (matching the mock-ups). */
const LOOK: Record<Sex, { browDarken: number }> = { m: { browDarken: 0 }, f: { browDarken: 0.2 } };

// ------------------------------------------------------------------ drawing

export interface DrawOptions {
  /** Clothes colour (CSS). */
  clothes: string;
  eyesShut?: boolean;
}

/** Path2D made on first use (so this module loads where there's no canvas, e.g. tests). */
class Path2DLazy {
  private p: Path2D | null = null;
  constructor(private readonly d: string) {}
  get(): Path2D {
    return (this.p ??= new Path2D(this.d));
  }
}

const CEL = new Path2DLazy('M 5 -72 C 13 -56 11 -34 13 -16 C 14 -8 12 -3 10 2 L 44 2 L 44 -80 Z');
const HEM = new Path2DLazy('M -40 -9 C -10 -5 10 -5 40 -9 L 40 6 L -40 6 Z');
const HI = new Path2DLazy('M -14 -55 C -13 -45 -12 -35 -12.5 -24 C -10.5 -36 -10.5 -48 -8 -60 Z');


const path = (d: string) => new Path2D(d || 'M 0 0');

function fillD(ctx: CanvasRenderingContext2D, d: string, fill: string | CanvasGradient, alpha = 1): void {
  if (!d || alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.fill(path(d));
  ctx.globalAlpha = 1;
}

function strokeD(ctx: CanvasRenderingContext2D, d: string, colour: string, width: number, alpha = 1): void {
  if (!d || alpha <= 0) return;
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = colour;
  ctx.lineWidth = width;
  ctx.stroke(path(d));
  ctx.globalAlpha = 1;
}

/** The diagonal light-to-shade gradient used across bodies and hair. */
function shadeGradient(ctx: CanvasRenderingContext2D, box: { x0: number; y0: number; x1: number; y1: number }): CanvasGradient {
  const g = ctx.createLinearGradient(box.x0, box.y0, box.x1, box.y1);
  g.addColorStop(0, 'rgba(255,255,255,0.24)');
  g.addColorStop(0.45, 'rgba(255,255,255,0)');
  g.addColorStop(0.6, 'rgba(0,0,0,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.32)');
  return g;
}

function headGradient(ctx: CanvasRenderingContext2D, box: { x0: number; y0: number; x1: number; y1: number }): CanvasGradient {
  const w = box.x1 - box.x0;
  const h = box.y1 - box.y0;
  const g = ctx.createRadialGradient(box.x0 + 0.36 * w, box.y0 + 0.3 * h, 0, box.x0 + 0.36 * w, box.y0 + 0.3 * h, 0.78 * Math.max(w, h));
  g.addColorStop(0, 'rgba(255,255,255,0.28)');
  g.addColorStop(0.55, 'rgba(255,255,255,0)');
  g.addColorStop(1, 'rgba(0,0,0,0.26)');
  return g;
}

function headTransform(ctx: CanvasRenderingContext2D, v: FigureView): void {
  ctx.translate(v.fwd, v.headDy);
  ctx.translate(0, -72);
  ctx.scale(v.hs, v.hs);
  ctx.translate(0, 72);
}

/**
 * Draw one person, from one angle, in mock units (the caller sets up the
 * transform: hem on the ground at the origin). No hands: the game draws those
 * itself, where they really are.
 */
export function drawFigure(ctx: CanvasRenderingContext2D, v: FigureView, opts: DrawOptions): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  const sb = 1 / Math.sqrt(v.X * v.Y);
  const shh = 1 / v.hs;

  // Long hair hanging behind the body.
  if (v.drapeBack) {
    ctx.save();
    headTransform(ctx, v);
    fillD(ctx, v.drapeD, v.hair);
    strokeD(ctx, v.drapeD, OUTLINE, 0.75 * shh);
    fillD(ctx, v.drapeD, '#000000', 0.22);
    ctx.restore();
  }

  // Neck.
  fillD(ctx, v.neckD, v.skin);
  strokeD(ctx, v.neckD, OUTLINE, 0.7);
  fillD(ctx, v.neckD, '#000000', 0.18);

  // Body in its shirt.
  ctx.save();
  ctx.scale(v.X, v.Y);
  const sil = path(v.silD);
  ctx.fillStyle = opts.clothes;
  ctx.strokeStyle = OUTLINE;
  ctx.lineWidth = 2.2 * sb;
  ctx.stroke(sil);
  ctx.fill(sil);
  ctx.strokeStyle = opts.clothes;
  ctx.lineWidth = 0.6 * sb;
  ctx.stroke(sil);
  ctx.save();
  ctx.clip(sil);
  ctx.fillStyle = shadeGradient(ctx, v.silBox);
  ctx.fill(sil);
  ctx.globalAlpha = 0.17;
  ctx.fillStyle = '#000000';
  ctx.fill(CEL.get());
  ctx.globalAlpha = 0.1;
  ctx.fill(HEM.get());
  ctx.globalAlpha = 0.2;
  ctx.fillStyle = '#ffffff';
  ctx.fill(HI.get());
  ctx.globalAlpha = 1;
  strokeD(ctx, v.placketD, '#000000', 0.45 * sb, 0.16);
  if (v.shirtButtonsD) {
    fillD(ctx, v.shirtButtonsD, mixHex(opts.clothes, '#ffffff', 0.35));
    strokeD(ctx, v.shirtButtonsD, '#000000', 0.25 * sb, 0.3);
  }
  strokeD(ctx, v.pecD, '#000000', 0.7 * sb, v.pecOpacity);
  strokeD(ctx, v.bustD, '#000000', 0.7 * sb, v.bustOpacity);
  strokeD(ctx, v.bellyD, '#000000', 0.7 * sb, v.bellyOpacity);
  ctx.restore();
  fillD(ctx, v.collarD, opts.clothes);
  strokeD(ctx, v.collarD, OUTLINE, 0.55 * sb);
  ctx.restore();

  // Head.
  ctx.save();
  headTransform(ctx, v);
  if (v.earsBackD) {
    fillD(ctx, v.earsBackD, v.skin);
    strokeD(ctx, v.earsBackD, OUTLINE, 0.7 * shh);
  }
  fillD(ctx, v.headD, v.skin);
  fillD(ctx, v.headD, headGradient(ctx, v.headBox));
  ctx.save();
  ctx.clip(path(v.headD));
  fillD(ctx, v.headCelD, '#000000', 0.14);
  fillD(ctx, v.hollowD, '#000000', v.hollowOpacity);
  strokeD(ctx, v.jawD, '#000000', 0.7 * shh, v.jawOpacity);
  strokeD(ctx, v.chinD, '#000000', 0.7 * shh, v.chinOpacity);
  strokeD(ctx, v.wrinklesD, '#000000', 0.5 * shh, v.wrinkleOpacity);
  fillD(ctx, v.cheeksD, '#d9705a', 0.2);
  ctx.restore();
  if (v.noseFillD) {
    fillD(ctx, v.noseFillD, v.skin);
    strokeD(ctx, v.noseFillD, OUTLINE, 0.6 * shh);
  }
  strokeD(ctx, v.headD, OUTLINE, 0.8 * shh);
  strokeD(ctx, v.browsD, v.brow, 0.95 * shh);
  if (opts.eyesShut) {
    let d = '';
    for (const e of v.eyes) d += ' M ' + f2(e.x - e.rx * 1.2) + ' ' + f2(e.y) + ' Q ' + f2(e.x) + ' ' + f2(e.y + 0.9) + ' ' + f2(e.x + e.rx * 1.2) + ' ' + f2(e.y);
    strokeD(ctx, d, OUTLINE, 0.6 * shh);
  } else {
    fillD(ctx, v.eyes.map((e) => ell(e.x, e.y, e.rx, e.ry)).join(' '), OUTLINE);
    fillD(ctx, v.glintsD, '#ffffff');
    strokeD(ctx, v.lashesD, OUTLINE, 0.45 * shh);
  }
  strokeD(ctx, v.noseD, '#000000', 0.65 * shh, 0.32);
  strokeD(ctx, v.mouthD, v.mouthColour, v.mouthWidth * shh);
  if (v.earsUnderD) {
    fillD(ctx, v.earsUnderD, v.skin);
    strokeD(ctx, v.earsUnderD, OUTLINE, 0.7 * shh);
  }
  strokeD(ctx, v.hairMassD, OUTLINE, 1.5 * shh);
  fillD(ctx, v.hairMassD, v.hair);
  fillD(ctx, v.hairMassD, shadeGradient(ctx, { x0: v.headBox.x0, y0: v.headBox.y0, x1: v.headBox.x1, y1: v.drapeD && !v.drapeBack ? -56 : v.headBox.y1 }));
  strokeD(ctx, v.drapeStrandsD, '#000000', 0.5 * shh, 0.2);
  strokeD(ctx, v.hairShineD, '#ffffff', 0.6 * shh, 0.28);
  if (v.earsFrontD) {
    fillD(ctx, v.earsFrontD, v.skin);
    strokeD(ctx, v.earsFrontD, OUTLINE, 0.7 * shh);
    strokeD(ctx, v.earInnerD, '#000000', 0.5 * shh, 0.25);
  }
  ctx.restore();
  ctx.restore();
}

/**
 * The person's outline only, as a thick band all round (drawn in white): used
 * for the highlight shown when they're hovered or selected.
 */
export function drawGlow(ctx: CanvasRenderingContext2D, v: FigureView, width: number): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.strokeStyle = '#ffffff';
  ctx.fillStyle = '#ffffff';
  const both = (d: string, w: number) => {
    if (!d) return;
    const p = path(d);
    ctx.lineWidth = w;
    ctx.stroke(p);
    ctx.fill(p);
  };
  both(v.neckD, width);
  ctx.save();
  ctx.scale(v.X, v.Y);
  both(v.silD, width / Math.sqrt(v.X * v.Y));
  ctx.restore();
  ctx.save();
  headTransform(ctx, v);
  both(v.headD, width / v.hs);
  both(v.hairMassD, width / v.hs);
  if (v.drapeBack) both(v.drapeD, width / v.hs);
  ctx.restore();
  ctx.restore();
}
