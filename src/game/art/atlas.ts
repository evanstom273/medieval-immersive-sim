import { ART_DEFS } from './defs';
import type { KitOutput } from './kit';

/**
 * Bakes catalogue art (SVG path data from the kit) into a few big texture
 * sheets. Each job is a rectangle of world screen space (the game's ¾ view:
 * x, ground y × 0.72 − height × 0.78) with its drawing; jobs are packed onto
 * sheets, each sheet becomes one SVG, rasterised at SCALE× for crispness.
 * Things are drawn by mapping screen points into a job (see `uv`), so a wall
 * cut down, or a door swung open, still shows the right bit of the art.
 */

/** Sheet size in world px (the texture is SHEET × SCALE pixels square). */
export const SHEET = 2048;
export const SCALE = 2;
const GUTTER = 3;

export interface ArtRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface ArtJob {
  key: string;
  /** World screen-space rectangle the drawing covers. */
  rect: ArtRect;
  out: KitOutput;
}

export interface Placed {
  sheet: number;
  /** Where the job's rect sits on its sheet (world px). */
  ax: number;
  ay: number;
  rect: ArtRect;
}

export interface Atlas {
  sheets: string[];
  jobs: Map<string, Placed>;
}

/** Shelf-pack jobs onto sheets. */
export function pack(jobs: ArtJob[]): { placed: Map<string, Placed>; sheetCount: number } {
  const order = [...jobs].sort((a, b) => b.rect.h - a.rect.h);
  const placed = new Map<string, Placed>();
  let sheet = 0;
  let x = GUTTER;
  let y = GUTTER;
  let shelf = 0;
  for (const j of order) {
    const w = Math.ceil(j.rect.w) + GUTTER;
    const h = Math.ceil(j.rect.h) + GUTTER;
    if (w > SHEET || h > SHEET) throw new Error(`art job ${j.key} too big (${w}×${h})`);
    if (x + w > SHEET) {
      x = GUTTER;
      y += shelf;
      shelf = 0;
    }
    if (y + h > SHEET) {
      sheet++;
      x = GUTTER;
      y = GUTTER;
      shelf = 0;
    }
    placed.set(j.key, { sheet, ax: x, ay: y, rect: j.rect });
    x += w;
    shelf = Math.max(shelf, h);
  }
  return { placed, sheetCount: jobs.length ? sheet + 1 : 0 };
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** One sheet as an SVG document. */
export function sheetSvg(jobs: ArtJob[], placed: Map<string, Placed>, sheet: number): string {
  const parts: string[] = [];
  const defs: string[] = [ART_DEFS];
  let n = 0;
  for (const j of jobs) {
    const p = placed.get(j.key)!;
    if (p.sheet !== sheet) continue;
    const pre = `j${n++}_`;
    const r = j.rect;
    defs.push(`<clipPath id="${pre}box" clipPathUnits="userSpaceOnUse"><rect x="${r.x}" y="${r.y}" width="${r.w}" height="${r.h}"/></clipPath>`);
    for (const c of j.out.clips) defs.push(`<clipPath id="${pre}${c.id}" clipPathUnits="userSpaceOnUse"><path d="${c.d}" clip-rule="evenodd"/></clipPath>`);
    for (const m of j.out.masks) {
      defs.push(
        `<mask id="${pre}${m.id}" maskUnits="userSpaceOnUse" x="${r.x - 50}" y="${r.y - 50}" width="${r.w + 100}" height="${r.h + 100}"><rect x="${r.x - 50}" y="${r.y - 50}" width="${r.w + 100}" height="${r.h + 100}" fill="#fff"/><path d="${m.d}" fill="#000"/></mask>`,
      );
    }
    const ref = (u: string) => (u && u !== 'none' ? u.replace('url(#', `url(#${pre}`) : '');
    let body = '';
    for (const it of j.out.items) {
      if (!it.d) continue;
      const clip = ref(it.clip);
      const mask = ref(it.mask);
      body +=
        `<path d="${it.d}" fill="${it.fill}" fill-opacity="${it.fo}" stroke="${it.stroke}" stroke-width="${it.sw}" stroke-opacity="${it.so}" stroke-linejoin="round" stroke-linecap="round"` +
        (clip ? ` clip-path="${clip}"` : '') +
        (mask ? ` mask="${mask}"` : '') +
        (it.tf && it.tf !== 'none' ? ` transform="${it.tf}"` : '') +
        '/>';
    }
    for (const l of j.out.labels) {
      body += `<text x="${l.x}" y="${l.y}" text-anchor="${l.anchor}" font-family="Georgia, serif" font-size="${l.size}" font-weight="${l.weight}" fill="${l.fill}" stroke="${l.stroke}" stroke-width="${l.sw}" paint-order="stroke">${esc(l.text)}</text>`;
    }
    parts.push(`<g transform="translate(${p.ax - r.x} ${p.ay - r.y})"><g clip-path="url(#${pre}box)">${body}</g></g>`);
  }
  const px = SHEET * SCALE;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${px}" height="${px}" viewBox="0 0 ${SHEET} ${SHEET}"><defs>${defs.join('')}</defs>${parts.join('')}</svg>`;
}

/** Texture coordinates (0..1) of a screen point within a job, shifted by `dy` (e.g. a wall top drawn lower than baked). */
export function uv(p: Placed, sx: number, sy: number): [number, number] {
  return [(p.ax + (sx - p.rect.x)) / SHEET, (p.ay + (sy - p.rect.y)) / SHEET];
}
