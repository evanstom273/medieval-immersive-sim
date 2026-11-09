import { PX_PER_METRE } from '../movement/tuning';
import type { MapFeature } from './worldMap';

/**
 * The village plan on parchment, as an SVG to bake into a texture. It's drawn in the game's ¾ screen
 * space (x as is, ground y × 0.72), so it lines up exactly with the live world it crossfades from.
 */

const M = PX_PER_METRE;
const FORE = 0.72;
const INK = '#3b2a1a';
const INK_SOFT = '#6b5236';
const PAPER = '#e9dcb8';
/** Texture pixels per world pixel (the plan is seen zoomed out, so it needn't be sharp up close). */
export const VILLAGE_TEXTURE_SCALE = 0.25;

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;');

export function villageSvg(features: MapFeature[], wM: number, hM: number): { svg: string; w: number; h: number } {
  const W = wM * M;
  const H = hM * M * FORE;
  const X = (x: number) => (x * M).toFixed(1);
  const Y = (y: number) => (y * M * FORE).toFixed(1);
  const parts: string[] = [];
  const label = (x: number, y: number, text: string, size: number) =>
    `<text x="${X(x)}" y="${Y(y)}" text-anchor="middle" dominant-baseline="middle" font-family="Georgia, serif" font-style="italic" font-size="${size.toFixed(0)}" fill="${INK}">${esc(text)}</text>`;
  const L = 1.5 * M; // label size, world px
  for (const f of features) {
    switch (f.kind) {
      case 'paving':
        parts.push(`<rect x="${X(f.x)}" y="${Y(f.y)}" width="${(f.w * M).toFixed(1)}" height="${(f.h * M * FORE).toFixed(1)}" fill="#d6c7a2" stroke="${INK_SOFT}" stroke-width="6" stroke-dasharray="30 18"/>`);
        break;
      case 'wall':
        parts.push(`<rect x="${X(f.x)}" y="${Y(f.y)}" width="${(f.w * M).toFixed(1)}" height="${Math.max(12, f.h * M * FORE).toFixed(1)}" fill="${INK_SOFT}"/>`);
        break;
      case 'building': {
        const w = f.w * M;
        const h = f.h * M * FORE;
        parts.push(`<rect x="${X(f.x)}" y="${Y(f.y)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="#c7a46e" stroke="${INK}" stroke-width="14"/>`);
        parts.push(`<rect x="${X(f.x)}" y="${Y(f.y)}" width="${w.toFixed(1)}" height="${h.toFixed(1)}" fill="url(#hatch)" opacity="0.6"/>`);
        const size = Math.min(L, (w / Math.max(4, f.name.length)) * 1.7);
        parts.push(label(f.x + f.w / 2, f.y + f.h / 2, f.name, size));
        break;
      }
      case 'well':
        parts.push(`<ellipse cx="${X(f.x)}" cy="${Y(f.y)}" rx="${(f.r * M).toFixed(1)}" ry="${(f.r * M * FORE).toFixed(1)}" fill="#9db3bf" stroke="${INK}" stroke-width="10"/>`);
        parts.push(label(f.x, f.y + f.r + 1.4, f.name, L * 0.8));
        break;
      case 'fire':
        parts.push(`<path d="M${X(f.x)} ${(f.y * M * FORE - 60).toFixed(1)}q45 38 32 76q-32 26 -64 0q-13 -38 32 -76z" fill="#c0501e" stroke="${INK}" stroke-width="6"/>`);
        parts.push(label(f.x, f.y + 1.6, f.name, L * 0.8));
        break;
      case 'midden':
        parts.push(`<ellipse cx="${X(f.x)}" cy="${Y(f.y)}" rx="${(f.r * M).toFixed(1)}" ry="${(f.r * M * FORE * 0.8).toFixed(1)}" fill="#7a5a34" opacity="0.7" stroke="${INK}" stroke-width="6"/>`);
        parts.push(label(f.x, f.y + f.r + 1.2, f.name, L * 0.8));
        break;
      case 'dummy':
        parts.push(`<g stroke="${INK}" stroke-width="12"><line x1="${(f.x * M - 26).toFixed(1)}" y1="${(f.y * M * FORE - 20).toFixed(1)}" x2="${(f.x * M + 26).toFixed(1)}" y2="${(f.y * M * FORE + 20).toFixed(1)}"/><line x1="${(f.x * M + 26).toFixed(1)}" y1="${(f.y * M * FORE - 20).toFixed(1)}" x2="${(f.x * M - 26).toFixed(1)}" y2="${(f.y * M * FORE + 20).toFixed(1)}"/></g>`);
        break;
    }
  }
  const s = VILLAGE_TEXTURE_SCALE;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${Math.ceil(W * s)}" height="${Math.ceil(H * s)}" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}">
<defs>
<filter id="paper" x="0" y="0" width="100%" height="100%"><feTurbulence type="fractalNoise" baseFrequency="0.012" numOctaves="3" seed="7"/><feColorMatrix type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.32  0 0 0 0 0.18  0 0 0 0.18 0"/></filter>
<radialGradient id="age" cx="0.5" cy="0.5" r="0.75"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#5a3a18" stop-opacity="0.35"/></radialGradient>
<pattern id="hatch" width="38" height="38" patternUnits="userSpaceOnUse" patternTransform="rotate(45)"><line x1="0" y1="0" x2="0" y2="38" stroke="${INK_SOFT}" stroke-width="8"/></pattern>
</defs>
<rect width="${W.toFixed(0)}" height="${H.toFixed(0)}" fill="${PAPER}"/>
<rect width="${W.toFixed(0)}" height="${H.toFixed(0)}" filter="url(#paper)"/>
<rect width="${W.toFixed(0)}" height="${H.toFixed(0)}" fill="url(#age)"/>
<rect x="30" y="30" width="${(W - 60).toFixed(0)}" height="${(H - 60).toFixed(0)}" fill="none" stroke="${INK}" stroke-width="22"/>
${parts.join('\n')}
</svg>`;
  return { svg, w: W, h: H };
}
