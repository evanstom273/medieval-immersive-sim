import { PX_PER_METRE } from '../movement/tuning';
import type { Region } from './region';

/**
 * The region as a painted map (the overview's look, after CKIII): soft colour for the lie of the land,
 * shaded hills, dark woods, ochre fields, the river and roads, washed together with blurs. An SVG to
 * bake into a texture, in the game's ¾ screen space (x as is, ground y × 0.72) like the other layers.
 */

const M = PX_PER_METRE;
const FORE = 0.72;
/** The texture's width in pixels (it covers the whole region). */
export const PAINTED_TEXTURE_W = 4096;

const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
function mix(c1: [number, number, number], c2: [number, number, number], t: number): string {
  const c = c1.map((v, i) => Math.round(lerp(v, c2[i], Math.max(0, Math.min(1, t)))));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

export function paintedSvg(r: Region): { svg: string; x: number; y: number; w: number; h: number } {
  const X = (x: number) => (x - r.x0) * M;
  const Y = (y: number) => (y - r.y0) * M * FORE;
  const W = (r.x1 - r.x0) * M;
  const H = (r.y1 - r.y0) * M * FORE;
  const parts: string[] = [];
  // The land: lowland green to upland olive and brown, a cell at a time (blurred together below).
  const s = r.heightStep;
  const rows = r.heights.length / r.heightCols;
  const at = (i: number, j: number) => r.heights[Math.min(rows - 1, Math.max(0, j)) * r.heightCols + Math.min(r.heightCols - 1, Math.max(0, i))];
  const land: string[] = [];
  const shade: string[] = [];
  for (let j = 0; j < rows; j++) {
    for (let i = 0; i < r.heightCols; i++) {
      const h = at(i, j);
      const colour = h < 0.45 ? mix([126, 152, 92], [148, 160, 98], h / 0.45) : h < 0.65 ? mix([148, 160, 98], [160, 148, 100], (h - 0.45) / 0.2) : mix([160, 148, 100], [132, 116, 92], (h - 0.65) / 0.25);
      const x = X(r.x0 + i * s - s / 2);
      const y = Y(r.y0 + j * s - s / 2);
      land.push(`<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${(s * M + 2).toFixed(0)}" height="${(s * M * FORE + 2).toFixed(0)}" fill="${colour}"/>`);
      // Light from the north-west: slopes facing it lighter, slopes facing away darker.
      const slope = (at(i, j) - at(i - 1, j - 1)) * 6;
      if (Math.abs(slope) > 0.05) shade.push(`<rect x="${x.toFixed(0)}" y="${y.toFixed(0)}" width="${(s * M + 2).toFixed(0)}" height="${(s * M * FORE + 2).toFixed(0)}" fill="${slope > 0 ? '#fff4d8' : '#2a2416'}" fill-opacity="${Math.min(0.35, Math.abs(slope) * 0.5).toFixed(2)}"/>`);
    }
  }
  const poly = (pts: [number, number][]) => pts.map(([x, y]) => `${X(x).toFixed(0)},${Y(y).toFixed(0)}`).join(' ');
  const path = (pts: [number, number][]) => 'M' + pts.map(([x, y]) => `${X(x).toFixed(0)} ${Y(y).toFixed(0)}`).join('L');
  parts.push(`<g filter="url(#soft)">${land.join('')}</g>`);
  parts.push(`<g filter="url(#soft)">${shade.join('')}</g>`);
  parts.push(`<g filter="url(#wash)" opacity="0.75">${r.commons.map((c) => `<polygon points="${poly(c)}" fill="#b8c486"/>`).join('')}</g>`);
  parts.push(`<g filter="url(#wash)" opacity="0.8">${r.fields.map((f, i) => `<polygon points="${poly(f)}" fill="${['#d2b56a', '#c9a95c', '#d8c07a', '#bfa055'][i % 4]}"/>`).join('')}</g>`);
  parts.push(`<g filter="url(#wood)">${r.woods.map(([x, y, rr]) => `<ellipse cx="${X(x).toFixed(0)}" cy="${Y(y).toFixed(0)}" rx="${(rr * M * 1.15).toFixed(0)}" ry="${(rr * M * FORE * 1.15).toFixed(0)}" fill="#4f6a3a"/>`).join('')}</g>`);
  parts.push(`<path d="${path(r.river)}" fill="none" stroke="#3f6a80" stroke-width="${(48 * M).toFixed(0)}" stroke-linecap="round" stroke-linejoin="round" filter="url(#wash)"/>`);
  parts.push(`<path d="${path(r.river)}" fill="none" stroke="#7fa9bd" stroke-width="${(30 * M).toFixed(0)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  for (const rd of r.roads) parts.push(`<path d="${path(rd.points)}" fill="none" stroke="${rd.main ? '#d9c497' : '#c2ad80'}" stroke-opacity="0.9" stroke-width="${((rd.main ? 16 : 9) * M).toFixed(0)}" stroke-linecap="round" stroke-linejoin="round"/>`);
  for (const st of r.settlements) {
    const size = st.kind === 'town' ? 330 : st.kind === 'castle' ? 90 : st.kind === 'manor' ? 60 : st.kind === 'home' ? 110 : 130;
    const colour = st.kind === 'castle' ? '#9a9486' : st.kind === 'manor' ? '#b38a5e' : '#b0754a';
    parts.push(`<ellipse cx="${X(st.x).toFixed(0)}" cy="${Y(st.y).toFixed(0)}" rx="${(size * M).toFixed(0)}" ry="${(size * M * FORE).toFixed(0)}" fill="${colour}" filter="url(#wash)"/>`);
    if (st.kind === 'town') parts.push(`<ellipse cx="${X(st.x).toFixed(0)}" cy="${Y(st.y).toFixed(0)}" rx="${(330 * M).toFixed(0)}" ry="${(330 * M * FORE).toFixed(0)}" fill="none" stroke="#5a4a3a" stroke-width="${(18 * M).toFixed(0)}"/>`);
  }
  const k = PAINTED_TEXTURE_W / W;
  const blur = (m: number) => (m * M).toFixed(0);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${PAINTED_TEXTURE_W}" height="${Math.ceil(H * k)}" viewBox="0 0 ${W.toFixed(0)} ${H.toFixed(0)}">
<defs>
<filter id="soft" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${blur(170)}"/></filter>
<filter id="wash" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${blur(14)}"/></filter>
<filter id="wood" x="-5%" y="-5%" width="110%" height="110%"><feGaussianBlur stdDeviation="${blur(35)}"/></filter>
<radialGradient id="edge" cx="0.5" cy="0.5" r="0.72"><stop offset="0.7" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#2a1d10" stop-opacity="0.45"/></radialGradient>
</defs>
<rect width="${W.toFixed(0)}" height="${H.toFixed(0)}" fill="#8fa16a"/>
${parts.join('\n')}
<rect width="${W.toFixed(0)}" height="${H.toFixed(0)}" fill="url(#edge)"/>
</svg>`;
  return { svg, x: r.x0 * M, y: r.y0 * M * FORE, w: W, h: H };
}
