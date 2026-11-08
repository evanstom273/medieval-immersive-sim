/**
 * GTA-style character switch camera: pull out, (on long switches) hold a wide
 * shot showing both people, then drop in on the new character. Scaled to
 * distance, so switching to someone nearby is a quick glide and someone far
 * away gets a big pull-out. Pure TypeScript.
 *
 * The target is sampled live: the world keeps running during the switch, so
 * you land on wherever they've got to.
 */
import type { Point } from '../navigation/NavGrid';

export interface SwitchPlan {
  from: Point;
  /** View span (m) when the switch started; also where it lands. */
  startSpan: number;
  /** Highest point of the pull-out (m across). */
  topSpan: number;
  /** How strongly the colour drains at the top (0..1): a light dip for short hops, full for long ones. */
  intensity: number;
  /** Phase durations, seconds. */
  up: number;
  hold: number;
  down: number;
}

export interface SwitchSample {
  focus: Point;
  span: number;
  /** 0 on the ground … 1 at the top of the pull-out (drives the desaturation). */
  airborne: number;
  done: boolean;
}

/** Switches longer than this (m) linger on a wide shot at the top. */
export const WIDE_SHOT_DISTANCE = 15;

export function planSwitch(from: Point, to: Point, startSpan: number, pxPerMetre: number): SwitchPlan {
  const d = Math.hypot(to.x - from.x, to.y - from.y) / pxPerMetre;
  // High enough to have both people comfortably in view, and always at least a little pull-out.
  const topSpan = Math.max(startSpan * 1.25, d * 1.35 + 6);
  const up = 0.35 + Math.min(0.6, d / 40);
  const intensity = Math.min(1, Math.max(0.35, d / WIDE_SHOT_DISTANCE));
  return { from: { ...from }, startSpan, topSpan, intensity, up, hold: d > WIDE_SHOT_DISTANCE ? 0.7 : 0, down: up + 0.1 };
}

export function switchDuration(p: SwitchPlan): number {
  return p.up + p.hold + p.down;
}

const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
/** Interpolate zoom in log space so it feels even at every scale. */
const lerpSpan = (a: number, b: number, t: number) => Math.exp(lerp(Math.log(a), Math.log(b), t));

/**
 * @param t   seconds since the switch began
 * @param to  the new character's position right now
 */
export function sampleSwitch(p: SwitchPlan, t: number, to: Point): SwitchSample {
  const mid = { x: (p.from.x + to.x) / 2, y: (p.from.y + to.y) / 2 };
  const air = (span: number) => (p.topSpan > p.startSpan ? Math.log(span / p.startSpan) / Math.log(p.topSpan / p.startSpan) : 0);

  if (t < p.up) {
    const e = ease(t / p.up);
    const span = lerpSpan(p.startSpan, p.topSpan, e);
    return { focus: { x: lerp(p.from.x, mid.x, e), y: lerp(p.from.y, mid.y, e) }, span, airborne: air(span), done: false };
  }
  if (t < p.up + p.hold) {
    return { focus: mid, span: p.topSpan, airborne: 1, done: false };
  }
  const k = Math.min(1, (t - p.up - p.hold) / p.down);
  const e = ease(k);
  const span = lerpSpan(p.topSpan, p.startSpan, e);
  return { focus: { x: lerp(mid.x, to.x, e), y: lerp(mid.y, to.y, e) }, span, airborne: air(span), done: k >= 1 };
}
