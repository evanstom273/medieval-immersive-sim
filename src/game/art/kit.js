// @ts-nocheck
/* eslint-disable */
/**
 * The art catalogue's drawing kit (walls, floors, roofs, doors, windows, stairs), the same code that
 * draws the catalogue boards, so the game's buildings use the same art. Everything is SVG path data
 * in the game's 3/4 screen space: x as is, ground y x 0.72, height x 0.78 (64 px = 1 m).
 * Generated from the catalogue generators (scratch tooling); keep hand edits small.
 */
export function makeKit() {
  const M = 64;
  const RISE = 0.78;
  const FORE = 0.72;
  const WALL_H = 2.4 * M * RISE; // 119.8 screen px
  const THICK = 0.3 * M * FORE; // 13.8 (top strip, an E–W wall seen from the south)
  const CUT_H = 0.35 * M * RISE; // 17.5
  const OUT = '#2a1d14';

  // ---------------------------------------------------------------- helpers
  let seed = 1;
  const rnd = () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const r = (a, b) => a + (b - a) * rnd();
  const pick = (arr) => arr[Math.floor(rnd() * arr.length)];
  const f = (n) => Math.round(n * 10) / 10;
  let items = [];
  const labels = [];
  const clips = [];
  let clipId = null;
  let maskNow = 'none';
  const masks = [];
  /** Everything added until the next mask() call is hidden where `d` covers (null = no mask). */
  const mask = (d) => {
    if (!d) {
      maskNow = 'none';
      return;
    }
    const id = 'wm' + masks.length;
    masks.push({ id, d });
    maskNow = `url(#${id})`;
  };
  /** Everything added until the next clip() call is clipped to this rectangle. */
  /** A transform for everything added until the next tf() call (CSS matrix), e.g. a door leaf swung open. */
  let tfNow = 'none';
  const tf = (m) => {
    tfNow = m ? `matrix(${m.map((n) => Math.round(n * 1000) / 1000).join(',')})` : 'none';
  };
  const clipD = (d) => {
    clipId = 'wc' + clips.length;
    clips.push({ id: clipId, d });
  };
  const clip = (x, y, w, h) => {
    if (x === null) {
      clipId = null;
      return;
    }
    clipId = 'wc' + clips.length;
    clips.push({ id: clipId, d: `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z` });
  };
  // Paths are pooled by style, so a wall is a handful of <path>s however many stones it has.
  let pools = new Map();
  /** Paths of the same style are merged within a layer; a new layer always draws over the last. */
  let layerN = 0;
  const layer = () => layerN++;
  const pool = (style0) => {
    const style = { fill: 'none', fo: 1, stroke: 'none', sw: 0, so: 1, ...style0, clip: clipId ? `url(#${clipId})` : 'none', tf: tfNow, mask: maskNow };
    const key = layerN + '|' + JSON.stringify(style);
    let p = pools.get(key);
    if (!p) {
      p = { ...style, d: '' };
      pools.set(key, p);
    }
    return p;
  };
  const flush = () => {
    for (const p of pools.values()) if (p.d) items.push(p);
    pools = new Map();
  };
  const add = (style, d) => {
    pool(style).d += ' ' + d;
  };
  const rect = (x, y, w, h) => `M${f(x)} ${f(y)}h${f(w)}v${f(h)}h${f(-w)}Z`;
  const poly = (pts) => 'M' + pts.map((p) => f(p[0]) + ' ' + f(p[1])).join('L') + 'Z';
  const line = (pts) => (pts.length < 2 ? '' : 'M' + pts.map((p) => f(p[0]) + ' ' + f(p[1])).join('L'));
  /** A slightly irregular, softly rounded block. */
  const blob = (x, y, w, h, j, round) => {
    const pts = [
      [x + r(-j, j), y + r(-j, j)],
      [x + w + r(-j, j), y + r(-j, j)],
      [x + w + r(-j, j), y + h + r(-j, j)],
      [x + r(-j, j), y + h + r(-j, j)],
    ];
    const k = Math.min(round, w / 2.5, h / 2.5);
    let d = '';
    for (let i = 0; i < 4; i++) {
      const a = pts[(i + 3) % 4];
      const b = pts[i];
      const c = pts[(i + 1) % 4];
      const ab = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
      const bc = Math.hypot(c[0] - b[0], c[1] - b[1]) || 1;
      const p1 = [b[0] + ((a[0] - b[0]) * k) / ab, b[1] + ((a[1] - b[1]) * k) / ab];
      const p2 = [b[0] + ((c[0] - b[0]) * k) / bc, b[1] + ((c[1] - b[1]) * k) / bc];
      d += (i === 0 ? 'M' : 'L') + f(p1[0]) + ' ' + f(p1[1]) + 'Q' + f(b[0]) + ' ' + f(b[1]) + ' ' + f(p2[0]) + ' ' + f(p2[1]);
    }
    return { d: d + 'Z', pts };
  };
  const label = (x, y, text, size = 15, weight = 600, fill = '#2a2118', anchor = 'start', halo = false) => labels.push({ x, y, text, size, weight, fill, anchor, stroke: halo ? '#f6f1e6' : 'none', sw: halo ? 3.5 : 0 });

  // Shared finishing: light from the upper left. Face shading, contact darkening at the foot, a lit top edge, outlines.
  const finishFace = (x, y, w, h) => {
    add({ fill: 'url(#wFace)', fo: 1 }, rect(x, y, w, h));
    add({ fill: 'url(#wFoot)', fo: 1 }, rect(x, y + h - Math.min(22, h * 0.5), w, Math.min(22, h * 0.5)));
  };
  const finishTop = (x, y, w, h) => add({ fill: 'url(#wTop)', fo: 1 }, rect(x, y, w, h));
  const outlineBox = (x, y, w, topH, faceH) => {
    add({ fill: 'none', stroke: OUT, sw: 1.4 }, rect(x, y, w, topH + faceH));
    add({ fill: 'none', stroke: OUT, sw: 0.9, so: 0.8 }, line([[x, y + topH], [x + w, y + topH]]));
    add({ fill: 'none', stroke: '#ffffff', sw: 0.8, so: 0.35 }, line([[x + 1, y + topH + 1], [x + w - 1, y + topH + 1]]));
  };
  const groundShadow = (x, y, w) => add({ fill: 'url(#wGround)', fo: 1 }, `M${f(x - 10)} ${f(y)}h${f(w + 20)}v10h${f(-w - 20)}Z`);

  // ---------------------------------------------------------------- materials (front faces)

  /** Coursed rubble or ashlar: courses of blocks with mortar between, each block lit top-left. */
  function stones(x, y, w, h, o) {
    add({ fill: o.mortar }, rect(x, y, w, h));
    let cy = y + h;
    let row = 0;
    while (cy > y + 0.5) {
      const ch = Math.min(cy - y, o.course ? o.course * (row === 0 && o.plinth ? 1.35 : 1) : r(o.minH, o.maxH));
      const rubble = !o.ashlar;
      let cx = x - (row % 2 ? o.stagger : 0) - r(0, o.ashlar ? 0 : 8);
      while (cx < x + w) {
        const bw = o.ashlar ? o.blockW * r(0.75, 1.25) : r(o.minW, o.maxW);
        const gx = o.gap;
        const x0 = Math.max(x + gx * 0.5, cx + gx * 0.5);
        const x1 = Math.min(x + w - gx * 0.5, cx + bw - gx * 0.5);
        if (x1 - x0 > 2.5) {
          const missing = o.worn && rnd() < o.worn.missing;
          // Rubble: each stone its own height, sitting low or high in the course.
          const sh = rubble ? (ch - gx) * r(0.62, 1.08) : ch - gx;
          const sy = rubble ? cy - gx * 0.5 - sh - r(0, (ch - gx - sh) * 0.6 + 1.5) : cy - ch + gx * 0.5;
          const b = blob(x0, Math.max(y + 0.5, sy), x1 - x0, Math.min(sh, cy - y), o.jitter, o.round);
          if (missing) add({ fill: o.hole }, b.d);
          else {
            add({ fill: pick(o.colours) }, b.d);
            const p = b.pts;
            // Lit upper-left edges, shaded lower-right edges, then a soft dark rim.
            add({ fill: 'none', stroke: '#fffbe8', sw: o.ashlar ? 0.9 : 1.2, so: 0.38 }, line([[p[3][0] + 1, p[3][1] - 1.5], [p[0][0] + 1, p[0][1] + 1], [p[1][0] - 1.5, p[1][1] + 1]]));
            add({ fill: 'none', stroke: '#1c140c', sw: o.ashlar ? 0.9 : 1.3, so: 0.34 }, line([[p[1][0] - 1, p[1][1] + 1.5], [p[2][0] - 1, p[2][1] - 1], [p[3][0] + 1.5, p[3][1] - 1]]));
            if (o.tooling && rnd() < 0.7) {
              for (let k = 0; k < 4; k++) {
                const tx = r(x0 + 3, x1 - 3);
                const ty = r(cy - ch + 3, cy - 3);
                add({ fill: 'none', stroke: '#6b5d45', sw: 0.5, so: 0.35 }, line([[tx, ty], [tx + 2.5, ty - 1.2]]));
              }
            }
            if (o.worn && rnd() < o.worn.moss) add({ fill: '#5f7a3a', fo: 0.55 }, blob(x0 + r(0, (x1 - x0) * 0.5), cy - gx - r(2, 4), r(5, 12), r(2, 4), 0.6, 2).d);
          }
        }
        cx += bw;
      }
      cy -= ch;
      row++;
    }
  }

  /** Wattle and daub: lumpy clay plaster, patchy limewash, cracks, damp at the foot; worn: daub gone, wattle showing. */
  function daub(x, y, w, h, worn) {
    add({ fill: '#b9a37c' }, rect(x, y, w, h));
    // Faint horizontal ridges where the daub follows the woven rods beneath.
    for (let ry = y + 6; ry < y + h - 4; ry += r(7, 10)) {
      const pts = [];
      for (let px = x; px <= x + w; px += 12) pts.push([px, ry + Math.sin(px * 0.11 + ry) * 1.2]);
      add({ fill: 'none', stroke: '#8f7a56', sw: 1, so: 0.22 }, line(pts));
    }
    // Limewash over everything, flaked off in places to show the clay; the flakes' upper edges catch the light.
    add({ fill: '#e6ddc6', fo: worn ? 0.72 : 0.9 }, rect(x, y, w, h));
    for (let ry = y + 6; ry < y + h - 4; ry += r(8, 11)) {
      const pts = [];
      for (let px = x; px <= x + w; px += 12) pts.push([px, ry + Math.sin(px * 0.11 + ry) * 1.2]);
      add({ fill: 'none', stroke: '#b3a07c', sw: 0.9, so: 0.25 }, line(pts));
    }
    layer();
    const flakes = Math.ceil(w / (worn ? 16 : 30));
    for (let k = 0; k < flakes; k++) {
      const bx = r(x - 4, x + w - 8);
      const by = r(y + 4, y + h - 24);
      const fw2 = r(8, worn ? 34 : 22);
      const fh2 = r(5, worn ? 20 : 12);
      const b = blob(bx, by, fw2, fh2, 2.5, 4);
      add({ fill: '#b9a37c' }, b.d);
      add({ fill: 'none', stroke: '#5e4a33', sw: 0.7, so: 0.55 }, line([b.pts[0], b.pts[1]]));
      add({ fill: 'none', stroke: '#fffaf0', sw: 0.8, so: 0.55 }, line([[b.pts[3][0], b.pts[3][1] + 1], [b.pts[2][0], b.pts[2][1] + 1]]));
    }
    // Rising damp and mud splashes at the foot.
    add({ fill: 'url(#wDamp)', fo: 1 }, rect(x, y + h - 26, w, 26));
    for (let k = 0; k < w / 5; k++) add({ fill: '#5e4a33', fo: r(0.25, 0.55) }, blob(r(x, x + w), y + h - r(1, 9), r(1, 3), r(1, 2.2), 0.3, 1).d);
    // Cracks.
    const cracks = worn ? 7 : 3;
    for (let k = 0; k < cracks; k++) {
      let px = r(x + 4, x + w - 4);
      let py = r(y + 8, y + h - 20);
      const pts = [[px, py]];
      for (let s = 0; s < 5; s++) {
        px += r(-5, 5);
        py += r(3, 7);
        pts.push([px, py]);
      }
      add({ fill: 'none', stroke: '#4a3a28', sw: 0.9, so: 0.7 }, line(pts));
      add({ fill: 'none', stroke: '#fff6dc', sw: 0.6, so: 0.35 }, line(pts.map((p) => [p[0] + 0.9, p[1] + 0.4])));
    }
    if (worn) {
      // Daub fallen away: the woven hazel shows through.
      for (const [hx, hy, hw, hh] of [
        [x + w * 0.18, y + h * 0.3, 40, 30],
        [x + w * 0.62, y + h * 0.52, 30, 24],
      ]) {
        const hole = blob(hx, hy, hw, hh, 5, 8);
        add({ fill: '#3d2c1c' }, hole.d);
        for (let sx = hx + 4; sx < hx + hw - 2; sx += 9) add({ fill: '#7a5c3a' }, rect(sx, hy + 2, 3, hh - 4));
        for (let ry = hy + 4, k = 0; ry < hy + hh - 3; ry += 5, k++) {
          const pts = [];
          for (let px = hx + 2; px <= hx + hw - 2; px += 4.5) pts.push([px, ry + (Math.floor((px - hx) / 9 + k) % 2 ? 1.6 : -1.6)]);
          add({ fill: 'none', stroke: '#9a7a50', sw: 2.4, so: 1 }, line(pts));
          add({ fill: 'none', stroke: '#c9a873', sw: 0.8, so: 0.6 }, line(pts.map((p) => [p[0], p[1] - 0.7])));
        }
        add({ fill: 'none', stroke: '#2a1d14', sw: 1.1 }, hole.d);
        add({ fill: 'none', stroke: '#fff4d8', sw: 0.8, so: 0.5 }, line([[hx + 3, hy + hh + 1.5], [hx + hw - 3, hy + hh + 1.2]]));
      }
    }
  }

  /** Wood grain along a timber (horizontal or vertical). */
  function grain(x, y, w, h, vertical, colour, n) {
    for (let k = 0; k < n; k++) {
      const pts = [];
      if (vertical) {
        const gx = r(x + 1.5, x + w - 1.5);
        for (let py = y; py <= y + h; py += 8) pts.push([gx + Math.sin(py * 0.09 + k) * 0.8, py]);
      } else {
        const gy = r(y + 1.5, y + h - 1.5);
        for (let px = x; px <= x + w; px += 8) pts.push([px, gy + Math.sin(px * 0.09 + k) * 0.8]);
      }
      add({ fill: 'none', stroke: colour, sw: 0.6, so: 0.55 }, line(pts));
    }
  }

  /** One oak timber, lit on its upper/left edge. */
  function timber(x, y, w, h, vertical, worn) {
    add({ fill: worn ? pick(['#6a5847', '#62513f']) : pick(['#5a4330', '#553f2c', '#604834']) }, rect(x, y, w, h));
    grain(x, y, w, h, vertical, '#2f2216', Math.max(2, Math.round((vertical ? w : h) / 3)));
    add({ fill: 'none', stroke: '#c9a77e', sw: 0.9, so: 0.45 }, vertical ? line([[x + 0.8, y], [x + 0.8, y + h]]) : line([[x, y + 0.8], [x + w, y + 0.8]]));
    add({ fill: 'none', stroke: '#140d07', sw: 1, so: 0.75 }, rect(x, y, w, h));
  }

  /** Timber frame: posts, studs, sill on a stone plinth, wall plate, a brace; limewashed infill panels. */
  function timberFrame(x, y, w, h, worn) {
    const plinth = 12;
    stones(x, y + h - plinth, w, plinth, { mortar: '#b8ad96', colours: ['#8f8778', '#9e9584', '#857d70'], minH: 12, maxH: 12, minW: 14, maxW: 26, stagger: 7, gap: 1.6, jitter: 0.8, round: 2.5, hole: '#2a2218' });
    const top = y;
    const fh = h - plinth;
    // Infill first.
    add({ fill: '#e4dac2' }, rect(x, top, w, fh));
    for (let k = 0; k < w / 14; k++) add({ fill: pick(['#d8ccb0', '#efe7d4']), fo: 0.55 }, blob(r(x, x + w), r(top, top + fh), r(8, 22), r(6, 16), 3, 6).d);
    add({ fill: 'url(#wDamp)', fo: 0.5 }, rect(x, top + fh - 18, w, 18));
    const post = 10;
    const stud = 7;
    const studs = [];
    for (let sx = x + post + 34; sx < x + w - post - 20; sx += 40) studs.push(sx);
    // Worn: one panel's infill gone.
    if (worn) {
      const px0 = x + post;
      const px1 = (studs[0] ?? x + w - post) - 0;
      const hole = blob(px0 + 3, top + fh * 0.42, px1 - px0 - 6, fh * 0.32, 3, 6);
      add({ fill: '#3d2c1c' }, hole.d);
      for (let sx = px0 + 6; sx < px1 - 4; sx += 8) add({ fill: '#7a5c3a' }, rect(sx, top + fh * 0.42 + 2, 2.5, fh * 0.32 - 4));
      add({ fill: 'none', stroke: OUT, sw: 1 }, hole.d);
      // Damp staining down from the plate.
      for (let k = 0; k < 4; k++) add({ fill: '#8f7b58', fo: 0.3 }, blob(r(x, x + w), top + 6, r(6, 12), r(20, 45), 2, 5).d);
    }
    // Shade the infill where the timbers overhang it a touch.
    finishFace(x, top, w, fh);
    const plate = 9;
    const sill = 8;
    for (const sx of studs) {
      timber(sx, top + plate, stud, fh - plate - sill, true, worn);
      add({ fill: '#000000', fo: 0.18 }, rect(sx + stud, top + plate, 2, fh - plate - sill));
    }
    // A brace across the second panel.
    if (studs.length > 1) {
      const bx0 = studs[0] + stud;
      const bx1 = studs[1];
      const bw = 6;
      add({ fill: worn ? '#665441' : '#583f2c' }, poly([[bx0, top + fh - sill - 2], [bx0 + bw, top + fh - sill - 2], [bx1, top + plate + bw + 2], [bx1, top + plate + 2]]));
      add({ fill: 'none', stroke: '#140d07', sw: 1, so: 0.75 }, poly([[bx0, top + fh - sill - 2], [bx0 + bw, top + fh - sill - 2], [bx1, top + plate + bw + 2], [bx1, top + plate + 2]]));
    }
    timber(x, top, post, fh, true, worn);
    timber(x + w - post, top, post, fh, true, worn);
    timber(x, top, w, plate, false, worn);
    timber(x, top + fh - sill, w, sill, false, worn);
    // Oak pegs at the joints.
    for (const sx of [x + post / 2, ...studs.map((s) => s + stud / 2), x + w - post / 2]) {
      for (const py of [top + plate / 2, top + fh - sill / 2]) add({ fill: '#2a1d12' }, `M${f(sx + 1.1)} ${f(py)}a1.1 1.1 0 1 0 -2.2 0a1.1 1.1 0 1 0 2.2 0Z`);
    }
  }

  /** Vertical boards with battens; worn boards weathered grey, one split, one missing. */
  function planks(x, y, w, h, worn) {
    add({ fill: '#1e140c' }, rect(x, y, w, h));
    let px = x;
    let k = 0;
    while (px < x + w - 1) {
      const bw = Math.min(r(16, 24), x + w - px);
      const missing = worn && k === 3;
      if (!missing) {
        const base = worn ? pick(['#8d877c', '#857f72', '#958e80', '#7e776b']) : pick(['#8a6a48', '#7d5f40', '#957552', '#86663f']);
        const top = worn && k === 6 ? y + 14 : y;
        add({ fill: base }, rect(px + 0.6, top, bw - 1.2, h - (top - y)));
        grain(px + 0.6, top, bw - 1.2, h - (top - y), true, worn ? '#4f4a42' : '#4a3420', 3);
        add({ fill: 'none', stroke: '#fff3d6', sw: 0.8, so: 0.3 }, line([[px + 1.2, top], [px + 1.2, y + h]]));
        add({ fill: 'none', stroke: '#140d07', sw: 0.9, so: 0.6 }, line([[px + bw - 0.6, top], [px + bw - 0.6, y + h]]));
        // A knot now and then.
        if (rnd() < 0.5) {
          const kx = px + r(4, bw - 4);
          const ky = r(y + 15, y + h - 15);
          add({ fill: worn ? '#5f594f' : '#4f3820' }, `M${f(kx + 2)} ${f(ky)}a2 3 0 1 0 -4 0a2 3 0 1 0 4 0Z`);
        }
        if (worn && k === 1) add({ fill: 'none', stroke: '#1e140c', sw: 1.2 }, line([[px + bw * 0.5, y + h * 0.15], [px + bw * 0.45, y + h * 0.4], [px + bw * 0.55, y + h * 0.62]]));
      }
      px += bw;
      k++;
    }
    // Battens.
    for (const by of [y + 16, y + h - 26]) {
      add({ fill: worn ? '#7a7468' : '#6f5233' }, rect(x, by, w, 8));
      grain(x, by, w, 8, false, '#3a2a18', 2);
      add({ fill: 'none', stroke: '#fff3d6', sw: 0.8, so: 0.35 }, line([[x, by + 0.8], [x + w, by + 0.8]]));
      add({ fill: 'none', stroke: '#140d07', sw: 1, so: 0.8 }, rect(x, by, w, 8));
      for (let nx = x + 6; nx < x + w; nx += 20) add({ fill: '#2d2a28' }, `M${f(nx + 1)} ${f(by + 4)}a1 1 0 1 0 -2 0a1 1 0 1 0 2 0Z`);
    }
  }

  /** Brick in Flemish bond (stretcher, header, stretcher… each course), lime mortar; worn: spalled faces, eroded joints, salts. */
  function bricks(x, y, w, h, worn) {
    add({ fill: worn ? '#b9ad94' : '#cfc3a8' }, rect(x, y, w, h));
    layer();
    const course = 0.075 * M * RISE; // a brick and its joint
    const sL = 0.23 * M; // stretcher
    const hL = 0.11 * M; // header
    const j = 0.9;
    let row = 0;
    for (let cy = y + h; cy > y; cy -= course, row++) {
      let cx = x - (row % 2 ? (sL + hL) / 2 : 0);
      let k = 0;
      while (cx < x + w) {
        const header = k % 2 === 1;
        const bw = header ? hL : sL;
        const x0 = Math.max(x, cx + j / 2);
        const x1 = Math.min(x + w, cx + bw - j / 2);
        const y0 = Math.max(y, cy - course + j / 2);
        if (x1 - x0 > 0.6 && cy - j / 2 - y0 > 0.4) {
          const missing = worn && rnd() < 0.006;
          const spalled = worn && rnd() < 0.06;
          const col = missing ? '#3a2a20' : header && rnd() < 0.35 ? pick(['#6a3f3a', '#5e3a3a', '#734535']) : spalled ? pick(['#c27a5a', '#b9714f']) : pick(['#9a4a32', '#a85638', '#8e4430', '#b0603f', '#a24f35', '#94503a']);
          add({ fill: col }, rect(x0, y0, x1 - x0, cy - j / 2 - y0));
          if (!missing && !worn) add({ fill: 'none', stroke: '#ffd9b8', sw: 0.45, so: 0.35 }, line([[x0, y0 + 0.3], [x1, y0 + 0.3]]));
        }
        cx += bw;
        k++;
      }
    }
    if (worn) {
      layer();
      // Salts blooming near the foot, and soot-dark streaks.
      add({ fill: 'url(#bSalt)' }, rect(x, y + h - 30, w, 30));
    }
  }

  // ---------------------------------------------------------------- tops (seen from above)

  function topOf(kind, x, y, w, h, cut) {
    layer();
    if (kind === 'daub') {
      add({ fill: cut ? '#a8926b' : '#c9b48f' }, rect(x, y, w, h));
      if (cut) {
        // Section: daub skins with the hazel core showing as a row of stake ends.
        add({ fill: '#7a5c3a', fo: 0.85 }, rect(x, y + h * 0.42, w, h * 0.16));
        for (let sx = x + 3; sx < x + w; sx += 9) add({ fill: '#5a4128' }, `M${f(sx + 1.6)} ${f(y + h / 2)}a1.6 1.6 0 1 0 -3.2 0a1.6 1.6 0 1 0 3.2 0Z`);
      } else add({ fill: '#ebe3cf', fo: 0.6 }, rect(x, y, w, h));
    } else if (kind === 'timber') {
      add({ fill: cut ? '#4f3a28' : '#5e4633' }, rect(x, y, w, h));
      grain(x, y, w, h, h > w, '#2c1f14', 3);
      if (cut) for (let sx = x + 44; sx < x + w - 20; sx += 40) add({ fill: '#6e5236' }, rect(sx, y + 1, 7, h - 2));
    } else if (kind === 'rubble') {
      add({ fill: '#b9af98' }, rect(x, y, w, h));
      const n = Math.round((w * h) / 70);
      for (let k = 0; k < n; k++) add({ fill: pick(['#9a9283', '#8a8274', '#a8a08f', '#7f776a']) }, blob(r(x, x + w - 6), r(y, y + h - 5), r(4, 10), r(3, 7), 0.8, 2).d);
    } else if (kind === 'ashlar') {
      if (cut) {
        add({ fill: '#b5aa92' }, rect(x, y, w, h));
        const n = Math.round((w * h * 0.4) / 40);
        for (let k = 0; k < n; k++) add({ fill: pick(['#9a9283', '#8a8274', '#a8a08f']) }, blob(r(x, x + w - 6), r(y + h * 0.3, y + h * 0.65), r(4, 8), r(2, 4), 0.6, 1.5).d);
        for (const yy of [y, y + h * 0.7]) for (let bx = x; bx < x + w; bx += r(26, 40)) add({ fill: pick(['#d8ccb0', '#cdbf9f', '#e2d7be']) }, rect(bx + 0.7, yy + 0.6, 26, h * 0.3 - 1.2));
      } else {
        add({ fill: '#9c8e72' }, rect(x, y, w, h));
        let bx = x;
        while (bx < x + w) {
          const bw = r(30, 44);
          add({ fill: pick(['#ddd2b8', '#d2c5a6', '#e5dbc4']) }, rect(bx + 0.7, y + 0.7, Math.min(bw, x + w - bx) - 1.4, h - 1.4));
          bx += bw;
        }
      }
    } else if (kind === 'brick') {
      // A course of bricks laid flat along the top (or, cut down, the section through the wall's thickness).
      add({ fill: '#cfc3a8' }, rect(x, y, w, h));
      const across = h > w;
      const n = cut ? 3 : 2;
      for (let i = 0; i < n; i++) {
        const along = across ? h : w;
        const step = 0.23 * M * (across ? FORE : 1);
        for (let p = (i % 2) * step * 0.5 - step * 0.5; p < along; p += step) {
          const a0 = Math.max(0, p + 0.5);
          const a1 = Math.min(along, p + step - 0.5);
          if (a1 - a0 < 0.5) continue;
          const b0 = (i / n) * (across ? w : h) + 0.4;
          const bl = (across ? w : h) / n - 0.8;
          const col = pick(['#9a4a32', '#a85638', '#8e4430', '#b0603f']);
          if (across) add({ fill: col }, rect(x + b0, y + a0, bl, a1 - a0));
          else add({ fill: col }, rect(x + a0, y + b0, a1 - a0, bl));
        }
      }
    } else if (kind === 'plank') {
      add({ fill: '#6f5233' }, rect(x, y, w, h));
      grain(x, y, w, h, h > w, '#3a2a18', 2);
    }
    finishTop(x, y, w, h);
  }

  function face(kind, x, y, w, h, worn) {
    layer();
    if (kind === 'daub') daub(x, y, w, h, worn);
    else if (kind === 'timber') timberFrame(x, y, w, h, worn);
    else if (kind === 'rubble')
      stones(x, y, w, h, { mortar: worn ? '#9c927b' : '#b5ab93', colours: ['#8f8778', '#a39a89', '#7d7568', '#b0a48c', '#968c79', '#9b8f7a'], minH: 10, maxH: 19, minW: 10, maxW: 32, stagger: 0, gap: 1.6, jitter: 2.4, round: 5.5, hole: '#2a2218', worn: worn ? { missing: 0.05, moss: 0.18 } : null });
    else if (kind === 'ashlar')
      stones(x, y, w, h, { mortar: '#a3957a', colours: worn ? ['#cbbd9c', '#c5b797', '#d0c3a4'] : ['#ddd2b8', '#d7cbaf', '#e1d6bd'], course: 16.6, plinth: true, blockW: 38, stagger: 19, gap: 1.2, jitter: worn ? 0.9 : 0.25, round: worn ? 3 : 1.2, ashlar: true, tooling: true, hole: '#2a2218', worn: worn ? { missing: 0, moss: 0.12 } : null });
    else if (kind === 'plank') planks(x, y, w, h, worn);
    else if (kind === 'brick') bricks(x, y, w, h, worn);
    if (kind !== 'timber') finishFace(x, y, w, h);
    if (worn && kind !== 'plank') {
      // Rain stains running down from the top.
      for (let k = 0; k < 5; k++) {
        const sx = r(x + 4, x + w - 12);
        const sw = r(5, 12);
        const sh = r(h * 0.2, h * 0.55);
        // Wide at the top, tapering to a point, wavering a little.
        const mid = sx + sw / 2 + r(-2, 2);
        add({ fill: 'url(#wStreak)', fo: 0.7 }, `M${f(sx)} ${f(y)}h${f(sw)}C${f(sx + sw * 0.9)} ${f(y + sh * 0.4)} ${f(mid + 1.5)} ${f(y + sh * 0.7)} ${f(mid)} ${f(y + sh)}C${f(mid - 1.5)} ${f(y + sh * 0.7)} ${f(sx + sw * 0.1)} ${f(y + sh * 0.4)} ${f(sx)} ${f(y)}Z`);
      }
    }
  }

  // ================================================================ floors (ground plane: x as is, ground y × 0.72)

  const sx = (n) => n * FORE; // a ground distance north–south, on screen

  /** Packed earth strewn with rushes; worn: trodden bare, muddy, the rushes few and filthy. */
  function earth(x, y, w, h, worn) {
    add({ fill: worn ? '#5f4c37' : '#6e5a42' }, rect(x, y, w, h));
    layer();
    for (let k = 0; k < (w * h) / 90; k++) add({ fill: pick(['#5e4b36', '#7d6850', '#665238', '#80694d']), fo: 0.55 }, blob(r(x - 6, x + w), r(y - 4, y + h), r(6, 22), r(3, 10), 2, 4).d);
    for (let k = 0; k < (w * h) / 60; k++) add({ fill: pick(['#8a7a62', '#4e3f2e', '#9b8a6c']) }, blob(r(x, x + w), r(y, y + h), r(1, 2.6), r(0.8, 1.8), 0.3, 0.8).d);
    if (worn) {
      layer();
      // A trodden path through the middle and a puddle.
      add({ fill: '#4d3c2b', fo: 0.55 }, `M${f(x)} ${f(y + h * 0.45)}C${f(x + w * 0.3)} ${f(y + h * 0.3)} ${f(x + w * 0.6)} ${f(y + h * 0.75)} ${f(x + w)} ${f(y + h * 0.55)}V${f(y + h * 0.85)}C${f(x + w * 0.6)} ${f(y + h * 1.05)} ${f(x + w * 0.3)} ${f(y + h * 0.6)} ${f(x)} ${f(y + h * 0.75)}Z`);
      const pd = blob(x + w * 0.6, y + h * 0.18, 46, 17, 4, 8);
      add({ fill: '#3a3024' }, pd.d);
      add({ fill: '#7d8890', fo: 0.35 }, blob(x + w * 0.6 + 6, y + h * 0.18 + 3, 22, 6, 2, 3).d);
      add({ fill: 'none', stroke: '#2a2018', sw: 0.8, so: 0.6 }, pd.d);
    }
    layer();
    // Rushes: thin stalks lying every which way, flattened by the view (north–south squashed).
    const n = (w * h) / (worn ? 70 : 34);
    for (let k = 0; k < n; k++) {
      const cx = r(x + 2, x + w - 2);
      const cy = r(y + 2, y + h - 2);
      const a = r(0, Math.PI);
      const len = r(6, 15);
      const dx = Math.cos(a) * len;
      const dy = sx(Math.sin(a) * len);
      const col = worn ? pick(['#8f7d52', '#7a6a45', '#9c8a5c']) : pick(['#c9b26a', '#b39a52', '#d8c27e', '#bfa65c', '#a8b060']);
      add({ fill: 'none', stroke: '#3e3020', sw: 1.6, so: 0.35 }, line([[cx, cy + 0.7], [cx + dx, cy + dy + 0.7]]));
      add({ fill: 'none', stroke: col, sw: 1.1 }, line([[cx, cy], [cx + dx, cy + dy]]));
    }
    if (!worn) for (let k = 0; k < (w * h) / 900; k++) {
      // A few sprigs of strewing herbs.
      const cx = r(x + 6, x + w - 6);
      const cy = r(y + 4, y + h - 4);
      for (let l = 0; l < 4; l++) add({ fill: pick(['#7d8a4a', '#6c7a3e']) }, blob(cx + r(-3, 3), cy + r(-2, 2), 2.6, 1.6, 0.3, 0.8).d);
    }
  }

  /** Floorboards running east–west, staggered joints, nailed at the joists; worn: scuffed, stained, one broken. */
  function boards(x, y, w, h, worn) {
    add({ fill: '#2a1c10' }, rect(x, y, w, h));
    layer();
    const bh = 0.22 * M * FORE;
    let row = 0;
    for (let by = y; by < y + h; by += bh, row++) {
      let bx = x - r(0, 90);
      while (bx < x + w) {
        const len = r(2, 4) * M;
        const x0 = Math.max(x, bx);
        const x1 = Math.min(x + w, bx + len);
        const hh = Math.min(bh, y + h - by);
        const broken = worn && row === 4 && x0 < x + w * 0.45 && x1 > x + w * 0.45;
        const col = worn ? pick(['#8a7458', '#806b51', '#937c5f']) : pick(['#9a7650', '#8f6c47', '#a67f56', '#93714b']);
        add({ fill: col }, rect(x0, by + 0.5, x1 - x0 - 0.8, hh - 1));
        grain(x0, by + 0.5, x1 - x0 - 0.8, hh - 1, false, worn ? '#5a4a36' : '#5e4228', 2);
        add({ fill: 'none', stroke: '#fff1d2', sw: 0.7, so: 0.35 }, line([[x0, by + 1], [x1 - 1, by + 1]]));
        for (let jx = x + 19; jx < x + w; jx += 38) if (jx > x0 + 2 && jx < x1 - 3) {
          add({ fill: '#2b2622' }, `M${f(jx + 0.9)} ${f(by + hh * 0.3)}a0.9 0.7 0 1 0 -1.8 0a0.9 0.7 0 1 0 1.8 0Z`);
          add({ fill: '#2b2622' }, `M${f(jx + 0.9)} ${f(by + hh * 0.7)}a0.9 0.7 0 1 0 -1.8 0a0.9 0.7 0 1 0 1.8 0Z`);
        }
        if (broken) {
          const bxm = x + w * 0.45;
          add({ fill: '#120c07' }, poly([[bxm - 14, by + 1], [bxm + 12, by + 1.5], [bxm + 8, by + hh - 1], [bxm - 10, by + hh - 1]]));
          add({ fill: 'none', stroke: '#c9a77e', sw: 0.8, so: 0.6 }, line([[bxm - 14, by + 1], [bxm - 9, by + 4], [bxm - 12, by + 6], [bxm - 10, by + hh - 1]]));
        }
        bx += len;
      }
    }
    if (worn) {
      layer();
      add({ fill: 'url(#fWear)' }, rect(x, y, w, h));
      for (let k = 0; k < 3; k++) add({ fill: '#3a2a1a', fo: 0.35 }, blob(r(x, x + w - 30), r(y, y + h - 14), r(12, 28), r(6, 12), 3, 6).d);
    }
  }

  /** Flagstones: the floor split at random into big slabs, in dirty joints, lit along their northern edges. */
  function flags(x, y, w, h, worn) {
    add({ fill: '#4f4a42' }, rect(x, y, w, h));
    layer();
    const slabs = [];
    const split = (sx0, sy0, sw0, sh0) => {
      const wm = sw0 / M;
      const hm = sh0 / FORE / M;
      if ((wm > 0.95 || hm > 0.8) && slabs.length < 400) {
        const vertical = wm / Math.max(0.3, hm) > r(0.9, 1.6);
        if (vertical) {
          const c = sw0 * r(0.35, 0.65);
          split(sx0, sy0, c, sh0);
          split(sx0 + c, sy0, sw0 - c, sh0);
        } else {
          const c = sh0 * r(0.35, 0.65);
          split(sx0, sy0, sw0, c);
          split(sx0, sy0 + c, sw0, sh0 - c);
        }
      } else slabs.push([sx0, sy0, sw0, sh0]);
    };
    split(x - 10, y - 6, w + 20, h + 12);
    slabs.forEach(([cx, cy, sw2, rh], i) => {
      const sunk = worn && i % 11 === 5;
      const b = blob(cx + 1.2, cy + 1, sw2 - 2.4, rh - 2, 1.2, 2.5);
      add({ fill: sunk ? '#76716a' : worn ? pick(['#8a867d', '#958f84', '#807b73']) : pick(['#8e8a80', '#9c978b', '#85817a', '#a39e90', '#948c7e']) }, b.d);
      const p = b.pts;
      add({ fill: 'none', stroke: '#fbf6e8', sw: 1, so: sunk ? 0.15 : 0.4 }, line([[p[0][0] + 1, p[0][1] + 1], [p[1][0] - 1, p[1][1] + 1]]));
      add({ fill: 'none', stroke: '#1c1812', sw: 1.1, so: 0.45 }, line([[p[3][0] + 1, p[3][1] - 1], [p[2][0] - 1, p[2][1] - 1]]));
      for (let k = 0; k < (sw2 * rh) / 120; k++) add({ fill: '#6e6a62', fo: 0.5 }, blob(r(cx + 3, cx + sw2 - 4), r(cy + 2, cy + rh - 3), r(1, 2.5), r(0.6, 1.4), 0.3, 0.6).d);
      if (worn && rnd() < 0.3) {
        const cxx = r(cx + 4, cx + sw2 - 6);
        add({ fill: 'none', stroke: '#2e2a24', sw: 0.9, so: 0.8 }, line([[cxx, cy + 1.5], [cxx + r(-6, 6), cy + rh * 0.5], [cxx + r(-8, 8), cy + rh - 1.5]]));
      }
      if (worn && rnd() < 0.45) add({ fill: '#5f7a3a', fo: 0.6 }, blob(cx + r(0, Math.max(1, sw2 - 8)), cy + rh - 2.5, r(4, 10), 2.4, 0.4, 1).d);
    });
    if (worn) add({ fill: 'url(#fWear)' }, rect(x, y, w, h));
  }

  /** Glazed clay tiles laid on the diagonal in two colours, a plain border; worn: dull glaze, chips, a few missing. */
  function tiles(x, y, w, h, worn) {
    add({ fill: '#6b5a48' }, rect(x, y, w, h));
    layer();
    const t = 0.16 * M;
    const th = sx(t);
    let row = 0;
    for (let ty = y; ty < y + h; ty += th, row++) {
      let col = 0;
      for (let tx = x; tx < x + w; tx += t, col++) {
        const missing = worn && rnd() < 0.04;
        if (missing) {
          add({ fill: '#8f8066' }, rect(tx + 0.5, ty + 0.4, t - 1, th - 0.8));
          continue;
        }
        const border = row === 0 || col === 0 || ty + th * 2 > y + h || tx + t * 2 > x + w;
        const dark = (row + col) % 2 === 0;
        const base = border ? '#6e3a22' : dark ? pick(['#8e3f24', '#97452a', '#883b22']) : pick(['#c99a45', '#d0a24c', '#c2913c']);
        add({ fill: worn ? (dark ? '#7e4a32' : '#b08c52') : base }, rect(tx + 0.5, ty + 0.4, t - 1, th - 0.8));
        if (!dark && !border && (row + col) % 4 === 1) add({ fill: '#8e3f24', fo: worn ? 0.4 : 0.85 }, `M${f(tx + t / 2 + 1.6)} ${f(ty + th / 2)}a1.6 1.2 0 1 0 -3.2 0a1.6 1.2 0 1 0 3.2 0Z`);
        // Glaze catching the light.
        if (!worn || rnd() < 0.3) add({ fill: 'none', stroke: '#fff7e0', sw: 0.6, so: worn ? 0.2 : 0.5 }, line([[tx + 1.2, ty + 1.1], [tx + t - 2, ty + 1.1]]));
        if (worn && rnd() < 0.12) add({ fill: '#7a6a55' }, poly([[tx + t - 0.5, ty + th - 0.4], [tx + t - 4, ty + th - 0.4], [tx + t - 0.5, ty + th - 3.5]]));
      }
    }
    if (worn) add({ fill: 'url(#fGrime)' }, rect(x, y, w, h));
  }

  /** Plain red quarry tiles, unglazed, in wide joints; worn: dirty, chipped, one cracked through. */
  function quarry(x, y, w, h, worn) {
    add({ fill: worn ? '#5e5244' : '#7a6c5a' }, rect(x, y, w, h));
    layer();
    const t = 0.3 * M;
    const th = sx(t);
    let row = 0;
    for (let ty = y; ty < y + h; ty += th, row++) {
      for (let tx = x; tx < x + w; tx += t) {
        const col = worn ? pick(['#8a5238', '#7f4c34', '#93583c', '#7a4a36']) : pick(['#a65a3a', '#9a5034', '#b06440', '#8f4a30', '#a95f3e']);
        const b = blob(tx + 1, ty + 0.9, t - 2, th - 1.8, worn ? 0.6 : 0.25, 1.2);
        add({ fill: col }, b.d);
        add({ fill: 'none', stroke: '#ffd2b0', sw: 0.6, so: worn ? 0.15 : 0.3 }, line([[b.pts[0][0] + 1, b.pts[0][1] + 0.8], [b.pts[1][0] - 1, b.pts[1][1] + 0.8]]));
        add({ fill: 'none', stroke: '#2a160c', sw: 0.8, so: 0.35 }, line([[b.pts[3][0] + 1, b.pts[3][1] - 0.6], [b.pts[2][0] - 1, b.pts[2][1] - 0.6]]));
        if (worn && rnd() < 0.08) add({ fill: 'none', stroke: '#2e1a10', sw: 0.8 }, line([[tx + r(2, t - 2), ty + 1], [tx + r(2, t - 2), ty + th - 1]]));
        if (worn && rnd() < 0.1) add({ fill: '#5e5244' }, poly([[tx + 1, ty + 1], [tx + 5, ty + 1], [tx + 1, ty + 3.5]]));
      }
    }
    if (worn) add({ fill: 'url(#fGrime)' }, rect(x, y, w, h));
  }

  /** Black and white marble squares laid on the diagonal, polished; worn: scuffed dull, chipped, a crack. */
  function marble(x, y, w, h, worn) {
    add({ fill: '#8c877d' }, rect(x, y, w, h));
    layer();
    const s0 = 0.3 * M; // side of a square
    const d = s0 / Math.SQRT2; // half-diagonal, on the ground
    let i = 0;
    for (let gy = -d; gy < h / FORE + d; gy += d) {
      const odd = Math.round(gy / d) % 2 !== 0;
      for (let gx = (odd ? d : 0) - d; gx < w + d; gx += 2 * d) {
        i++;
        const cx = x + gx;
        const cy = y + sx(gy);
        const black = (Math.round(gx / (2 * d)) + Math.round(gy / d)) % 2 === 0;
        const pts = [[cx, cy - sx(d) + 0.7], [cx + d - 0.9, cy], [cx, cy + sx(d) - 0.7], [cx - d + 0.9, cy]];
        const fill = black ? (worn ? pick(['#3a3836', '#423f3b']) : pick(['#2a2928', '#302e2c', '#262524'])) : worn ? pick(['#cfc9bb', '#c8c1b2']) : pick(['#ece8de', '#e6e1d4', '#f0ece3']);
        add({ fill }, poly(pts));
        // Veins in the white, a soft gleam on the black.
        if (!black) for (let k = 0; k < 2; k++) {
          const a = r(0, Math.PI);
          const vx = Math.cos(a) * d * 0.6;
          const vy = sx(Math.sin(a) * d * 0.6);
          add({ fill: 'none', stroke: '#9a958c', sw: 0.5, so: 0.45 }, line([[cx - vx, cy - vy], [cx + r(-2, 2), cy + r(-1, 1)], [cx + vx, cy + vy]]));
        } else if (!worn) add({ fill: 'none', stroke: '#ffffff', sw: 0.8, so: 0.18 }, line([pts[3], pts[0], pts[1]]));
        if (worn && i % 23 === 7) add({ fill: 'none', stroke: black ? '#77736c' : '#4a463f', sw: 0.8 }, line([pts[0], [cx + r(-3, 3), cy], pts[2]]));
        if (worn && i % 17 === 3) add({ fill: '#8c877d' }, poly([pts[1], [pts[1][0] - 4, pts[1][1] - 1.5], [pts[1][0] - 3, pts[1][1] + 2]]));
      }
    }
    if (worn) add({ fill: 'url(#fWear)' }, rect(x, y, w, h));
    else add({ fill: 'url(#fSheen)' }, rect(x, y, w, h));
  }

  /** Rush matting: plaited strips sewn edge to edge, in a herringbone; worn: frayed, holed, grubby. */
  function matting(x, y, w, h, worn) {
    add({ fill: '#4a3a26' }, rect(x, y, w, h));
    layer();
    const sh = sx(0.3 * M);
    let row = 0;
    for (let sy = y; sy < y + h; sy += sh, row++) {
      layer();
      const hh = Math.min(sh, y + h - sy);
      const base = worn ? pick(['#a8955e', '#9e8c58', '#ad9a62']) : pick(['#c9b26a', '#c2ac64', '#cdb872', '#bfae66']);
      add({ fill: base }, rect(x, sy + 0.6, w, hh - 1.2));
      // Herringbone: rows of short slanted plaits, alternating direction down the strip.
      const step = 3.2;
      for (let k = 0; k < 3; k++) {
        const ly = sy + 1.5 + (k * (hh - 3)) / 3;
        const lh = (hh - 3) / 3;
        const dir = k % 2 ? 1 : -1;
        let d1 = '';
        let d2 = '';
        for (let px = x - 2; px < x + w; px += step) {
          d1 += `M${f(px)} ${f(ly + lh)}L${f(px + dir * step * 0.9)} ${f(ly)}`;
          d2 += `M${f(px + 0.8)} ${f(ly + lh)}L${f(px + 0.8 + dir * step * 0.9)} ${f(ly)}`;
        }
        add({ fill: 'none', stroke: worn ? '#6e5e38' : '#8f7a3e', sw: 0.9, so: 0.6 }, d1);
        add({ fill: 'none', stroke: '#f2e2a0', sw: 0.5, so: worn ? 0.2 : 0.45 }, d2);
      }
      // The sewn seam between strips.
      add({ fill: 'none', stroke: '#5a4628', sw: 1, so: 0.8 }, line([[x, sy + 0.4], [x + w, sy + 0.4]]));
      for (let px = x + 2; px < x + w; px += 6) add({ fill: 'none', stroke: '#e0cc88', sw: 0.6, so: 0.5 }, line([[px, sy - 0.8], [px + 1.5, sy + 1.6]]));
    }
    if (worn) {
      layer();
      for (const [hx, hy, hw, hh2] of [[x + w * 0.3, y + h * 0.4, 30, 12], [x + w * 0.75, y + h * 0.15, 16, 8]]) {
        const hole = blob(hx, hy, hw, hh2, 2.5, 5);
        add({ fill: '#3a2c1c' }, hole.d);
        for (let k = 0; k < 8; k++) add({ fill: 'none', stroke: '#b8a46a', sw: 0.7 }, line([[hx + r(0, hw), hy + r(-1, 1)], [hx + r(0, hw), hy + r(2, 5)]]));
      }
      add({ fill: 'url(#fGrime)' }, rect(x, y, w, h));
    }
  }

  /** Turkey work: knotted wool, a red field of stepped lozenges inside a dark blue border; worn: faded, threadbare in the middle. */
  function turkey(x, y, w, h, worn) {
    const red = worn ? '#8a4a3c' : '#8a2a22';
    const blue = worn ? '#3e4658' : '#1f2c48';
    const gold = worn ? '#bfa66e' : '#d6a840';
    const ivory = worn ? '#d8ccb0' : '#ece0c2';
    add({ fill: '#2a1a14' }, rect(x, y, w, h));
    layer();
    const bw = 0.32 * M;
    const bh = sx(bw);
    add({ fill: blue }, rect(x + 1, y + 1, w - 2, h - 2));
    add({ fill: red }, rect(x + bw, y + bh, w - 2 * bw, h - 2 * bh));
    // Border: a running chain of small ivory and gold motifs, with gold guard stripes.
    for (const [gx, gy, gw, gh] of [[x + bw - 3, y + bh - 2.2, w - 2 * bw + 6, h - 2 * bh + 4.4], [x + 4, y + 3, w - 8, h - 6]]) add({ fill: 'none', stroke: gold, sw: 1.4 }, rect(gx, gy, gw, gh));
    const motif = (cx, cy, s, col) => add({ fill: col }, poly([[cx, cy - sx(s)], [cx + s, cy], [cx, cy + sx(s)], [cx - s, cy]]));
    for (let px = x + bw / 2; px < x + w; px += 11) {
      motif(px, y + bh / 2, 3.6, ivory);
      motif(px, y + h - bh / 2, 3.6, ivory);
      motif(px, y + bh / 2, 1.4, red);
      motif(px, y + h - bh / 2, 1.4, red);
    }
    for (let py = y + bh * 1.5; py < y + h - bh; py += sx(11)) {
      motif(x + bw / 2, py, 3.6, ivory);
      motif(x + w - bw / 2, py, 3.6, ivory);
    }
    // Field: a lattice of stepped lozenges with smaller motifs between.
    const fx0 = x + bw;
    const fy0 = y + bh;
    const fw = w - 2 * bw;
    const fh = h - 2 * bh;
    const cellW = 0.6 * M;
    const cellH = sx(cellW);
    for (let cy = fy0 + cellH / 2; cy < fy0 + fh; cy += cellH) {
      for (let cx = fx0 + cellW / 2; cx < fx0 + fw; cx += cellW) {
        for (const [s, col] of [[cellW * 0.42, blue], [cellW * 0.32, gold], [cellW * 0.22, red], [cellW * 0.1, ivory]]) {
          // Stepped edges, as knotted pile makes them.
          const st = s / 4;
          const pts = [];
          for (let i = 0; i < 4; i++) {
            pts.push([cx + i * st, cy - sx(s - i * st)], [cx + (i + 1) * st, cy - sx(s - i * st)]);
          }
          const q = [...pts, ...pts.slice().reverse().map(([px, py]) => [px, 2 * cy - py])];
          const full = [...q, ...q.slice().reverse().map(([px, py]) => [2 * cx - px, py])];
          add({ fill: col }, poly(full));
        }
        motif(cx + cellW / 2, cy + cellH / 2, 3, gold);
      }
    }
    // The pile: a fine stipple over everything.
    layer();
    let d = '';
    for (let k = 0; k < (w * h) / 6; k++) {
      const px = r(x, x + w);
      const py = r(y, y + h);
      d += `M${f(px)} ${f(py)}h0.8`;
    }
    add({ fill: 'none', stroke: '#000000', sw: 0.7, so: 0.12 }, d);
    if (worn) {
      layer();
      // Threadbare where feet go: the pile worn away to the pale warp threads, fading out at the edges.
      add({ fill: 'url(#tBare)' }, rect(x + w * 0.2, y + h * 0.22, w * 0.6, h * 0.56));
      for (let k = 0; k < 18; k++) {
        const py = r(y + h * 0.38, y + h * 0.62);
        const px = r(x + w * 0.38, x + w * 0.55);
        add({ fill: 'none', stroke: '#e6dcc4', sw: 0.5, so: 0.35 }, line([[px, py], [px + r(8, 22), py]]));
      }
      add({ fill: 'url(#fWear)' }, rect(x, y, w, h));
    }
  }

  function floor(kind, x, y, w, h, worn) {
    layer();
    if (kind === 'earth') earth(x, y, w, h, worn);
    else if (kind === 'boards') boards(x, y, w, h, worn);
    else if (kind === 'flags') flags(x, y, w, h, worn);
    else if (kind === 'tiles') tiles(x, y, w, h, worn);
    else if (kind === 'quarry') quarry(x, y, w, h, worn);
    else if (kind === 'marble') marble(x, y, w, h, worn);
    else if (kind === 'matting') matting(x, y, w, h, worn);
    else if (kind === 'turkey') turkey(x, y, w, h, worn);
    layer();
    // Flat ground: a gentle light-to-shade across, no hard edge.
    add({ fill: 'url(#fShade)' }, rect(x, y, w, h));
  }

  // ================================================================ roofs
  // World metres → screen: x as is, ground y × 0.72 (south is down the screen), height × 0.78.
  let ox = 0;
  let oy = 0;
  const P = (x, y, z) => [ox + x * M, oy + y * M * FORE - z * M * RISE];
  const at = (cellX, groundY, D) => {
    ox = cellX;
    oy = groundY - D * M * FORE; // so the building's south front meets the ground at groundY
  };
  const polyD = (pts) => poly(pts);
  const add3 = (a, s) => [a[0] + s[0], a[1] + s[1], a[2] + s[2]];
  const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
  const norm3 = (a) => {
    const l = Math.hypot(a[0], a[1], a[2]) || 1;
    return [a[0] / l, a[1] / l, a[2] / l];
  };
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const LIGHT = norm3([-0.5, -0.35, 0.8]);
  /** Light on a surface, as an overlay: lit faces brighten, faces turned away darken. */
  const lightOverlay = (n, d) => {
    const k = n[0] * LIGHT[0] + n[1] * LIGHT[1] + n[2] * LIGHT[2];
    if (k > 0.72) add({ fill: '#fff6e0', fo: Math.min(0.22, (k - 0.72) * 0.9) }, d);
    else add({ fill: '#120c08', fo: Math.min(0.4, (0.72 - k) * 0.55) }, d);
  };

  const ROOF = {
    thatch: { name: 'Thatch', base: '#a8864c', lip: 0.32 },
    shingle: { name: 'Wooden shingles', base: '#7d6a55', gauge: 0.13, minW: 0.1, maxW: 0.2, colours: ['#857260', '#7a6754', '#8e7a65', '#6f5e4c', '#93806a'], line: '#3a2e22', hi: '#e8dcc6', lip: 0.05 },
    tile: { name: 'Clay tiles', base: '#9a4a30', gauge: 0.1, minW: 0.165, maxW: 0.165, colours: ['#a85638', '#9a4a32', '#b0603f', '#94462e', '#a3523a', '#8a4430'], line: '#3a1a10', hi: '#ffd2b0', lip: 0.05 },
    slate: { name: 'Slate', base: '#4e5560', gauge: 0.17, minW: 0.22, maxW: 0.32, colours: ['#4f5662', '#5a616c', '#474d58', '#555b66', '#60646c'], line: '#1c2026', hi: '#c8d0dc', lip: 0.04 },
    lead: { name: 'Lead', base: '#80878e', lip: 0.02 },
  };

  /**
   * One roof slope: a polygon (world points), textured in its own frame: `o` a point on the eave,
   * `e` along the eave, `u` up the slope (unit world vectors), `lu` × `lv` metres of cover.
   */
  function slope(mat, corners, o, e, u, lu, lv) {
    const R = ROOF[mat];
    const scr = corners.map((c) => P(...c));
    const d = polyD(scr);
    const map = (uu, vv) => P(...add3(add3(o, mul3(e, uu)), mul3(u, vv)));
    const quad = (u0, v0, u1, v1) => poly([map(u0, v0), map(u1, v0), map(u1, v1), map(u0, v1)]);
    layer();
    clipD(d);
    add({ fill: R.base }, d);
    layer();
    if (mat === 'thatch') {
      // Combed straw: short strokes running down the slope, in bands, darker where each course tucks under.
      for (let v = 0; v < lv; v += 0.3) add({ fill: '#7d6236', fo: 0.35 }, quad(-1, v, lu + 1, v + 0.05));
      let dl = '';
      let dd = '';
      let dh = '';
      for (let k = 0; k < lu * lv * 70; k++) {
        const uu = r(-0.5, lu + 0.5);
        const vv = r(0, lv);
        const len = r(0.15, 0.4);
        const a = map(uu, vv);
        const b = map(uu + r(-0.03, 0.03), vv - len);
        const seg = `M${f(a[0])} ${f(a[1])}L${f(b[0])} ${f(b[1])}`;
        const t = rnd();
        if (t < 0.45) dl += seg;
        else if (t < 0.8) dd += seg;
        else dh += seg;
      }
      add({ fill: 'none', stroke: '#c9a865', sw: 0.8, so: 0.8 }, dl);
      add({ fill: 'none', stroke: '#86683a', sw: 0.8, so: 0.8 }, dd);
      add({ fill: 'none', stroke: '#e3c886', sw: 0.6, so: 0.7 }, dh);
    } else if (mat === 'lead') {
      // Sheets with rolled seams running down the slope, a little patina.
      for (let uu = 0; uu < lu; uu += 0.6) {
        add({ fill: pick(['#80878e', '#878e95', '#7a8188']) }, quad(uu + 0.02, -0.5, uu + 0.6, lv + 0.5));
        add({ fill: 'none', stroke: '#b9c0c6', sw: 1.6, so: 0.6 }, line([map(uu, -0.5), map(uu, lv + 0.5)]));
        add({ fill: 'none', stroke: '#3a3f44', sw: 0.8, so: 0.6 }, line([map(uu + 0.03, -0.5), map(uu + 0.03, lv + 0.5)]));
      }
      for (let k = 0; k < lu * lv * 0.8; k++) add({ fill: '#b8c6c0', fo: 0.18 }, blob(...map(r(0, lu), r(0, lv)), r(6, 18), r(3, 8), 2, 4).d);
    } else {
      // Courses parallel to the eave, joints staggered; each course's lower edge casts a thin shadow.
      let row = 0;
      for (let v = 0; v < lv; v += R.gauge, row++) {
        let uu = -(row % 2 ? R.maxW / 2 : 0) - r(0, 0.05);
        while (uu < lu + 0.3) {
          const tw = r(R.minW, R.maxW);
          add({ fill: pick(R.colours) }, quad(uu + 0.008, v, uu + tw - 0.008, v + R.gauge));
          if (mat === 'shingle' && rnd() < 0.5) add({ fill: 'none', stroke: R.line, sw: 0.5, so: 0.4 }, line([map(uu + tw * r(0.3, 0.7), v + 0.01), map(uu + tw * r(0.3, 0.7), v + R.gauge * 0.9)]));
          uu += tw;
        }
        add({ fill: 'none', stroke: R.line, sw: 1.1, so: 0.65 }, line([map(-1, v + 0.004), map(lu + 1, v + 0.004)]));
        add({ fill: 'none', stroke: R.hi, sw: 0.6, so: 0.3 }, line([map(-1, v + 0.025), map(lu + 1, v + 0.025)]));
      }
    }
    layer();
    const n = norm3(cross(u, e));
    lightOverlay(n[2] < 0 ? mul3(n, -1) : n, d);
    clip(null);
    layer();
    add({ fill: 'none', stroke: OUT, sw: 1.3 }, d);
    flush();
  }

  /** The visible thickness under an eave (thatch is thick, tiles thin), plus the shadow it throws on the wall. */
  function eave(mat, a, b, wallShadow) {
    const t = ROOF[mat].lip;
    const pa = P(...a);
    const pb = P(...b);
    const da = t * M * RISE;
    layer();
    if (wallShadow) add({ fill: 'url(#rEaveShadow)' }, poly([[pa[0], pa[1] + da], [pb[0], pb[1] + da], [pb[0], pb[1] + da + 14], [pa[0], pa[1] + da + 14]]));
    const col = mat === 'thatch' ? '#6e5632' : mat === 'lead' ? '#5a6066' : mat === 'slate' ? '#2e333a' : mat === 'tile' ? '#6e3020' : '#4e4032';
    const d = poly([pa, pb, [pb[0], pb[1] + da + 1], [pa[0], pa[1] + da + 1]]);
    add({ fill: col }, d);
    if (mat === 'thatch') {
      let dd = '';
      for (let x = Math.min(pa[0], pb[0]); x < Math.max(pa[0], pb[0]); x += 1.6) {
        const tt = (x - pa[0]) / (pb[0] - pa[0] || 1);
        const yy = pa[1] + (pb[1] - pa[1]) * tt;
        dd += `M${f(x)} ${f(yy + 1)}l${f(r(-0.6, 0.6))} ${f(da * r(0.7, 1.05))}`;
      }
      add({ fill: 'none', stroke: '#a08048', sw: 0.7, so: 0.8 }, dd);
    }
    add({ fill: 'none', stroke: OUT, sw: 1.1 }, d);
    flush();
  }

  /** A ridge cap along a ridge line (world points). */
  function ridge(mat, a, b) {
    const pa = P(...a);
    const pb = P(...b);
    const w = mat === 'thatch' ? 4.5 : 2.6;
    const dx = pb[0] - pa[0];
    const dy = pb[1] - pa[1];
    const len = Math.hypot(dx, dy) || 1;
    // Perpendicular on screen, pointing up.
    let nx = -dy / len;
    let ny = dx / len;
    if (ny > 0) {
      nx = -nx;
      ny = -ny;
    }
    if (Math.abs(ny) < 0.3) {
      nx = 0;
      ny = -1;
    }
    const q = [[pa[0] + nx * w * 0.4, pa[1] + ny * w * 0.4], [pb[0] + nx * w * 0.4, pb[1] + ny * w * 0.4], [pb[0] - nx * w * 0.6, pb[1] - ny * w * 0.6], [pa[0] - nx * w * 0.6, pa[1] - ny * w * 0.6]];
    layer();
    const col = mat === 'thatch' ? '#8f7240' : mat === 'slate' ? '#3e444e' : mat === 'shingle' ? '#6a5a48' : mat === 'lead' ? '#70777e' : '#8a3e28';
    add({ fill: col }, poly(q));
    if (mat === 'thatch') {
      // A block-cut ridge: scallops along its lower edge and crossed hazel liggers on top.
      let d = '';
      const n = Math.max(2, Math.round(len / 7));
      for (let i = 0; i < n; i++) {
        const t0 = i / n;
        const t1 = (i + 1) / n;
        const x0 = q[3][0] + (q[2][0] - q[3][0]) * t0;
        const y0 = q[3][1] + (q[2][1] - q[3][1]) * t0;
        const x1 = q[3][0] + (q[2][0] - q[3][0]) * t1;
        const y1 = q[3][1] + (q[2][1] - q[3][1]) * t1;
        d += `M${f(x0)} ${f(y0)}Q${f((x0 + x1) / 2)} ${f((y0 + y1) / 2 + 4)} ${f(x1)} ${f(y1)}`;
      }
      add({ fill: 'none', stroke: '#5e4626', sw: 1.2 }, d);
      let lg = '';
      for (let i = 0; i < n * 2; i++) {
        const t = (i + 0.5) / (n * 2);
        const cx = pa[0] + dx * t;
        const cy = pa[1] + dy * t;
        lg += `M${f(cx - 2.2)} ${f(cy - 1.4)}L${f(cx + 2.2)} ${f(cy + 0.6)}M${f(cx + 2.2)} ${f(cy - 1.4)}L${f(cx - 2.2)} ${f(cy + 0.6)}`;
      }
      add({ fill: 'none', stroke: '#c9a865', sw: 0.6, so: 0.8 }, lg);
    } else if (mat !== 'lead') {
      // Half-round ridge tiles, joints across.
      let j = '';
      const n = Math.max(2, Math.round(len / (mat === 'slate' ? 9 : 7)));
      for (let i = 1; i < n; i++) {
        const t = i / n;
        j += line([[q[0][0] + (q[1][0] - q[0][0]) * t, q[0][1] + (q[1][1] - q[0][1]) * t], [q[3][0] + (q[2][0] - q[3][0]) * t, q[3][1] + (q[2][1] - q[3][1]) * t]]);
      }
      add({ fill: 'none', stroke: '#000000', sw: 0.7, so: 0.4 }, j);
      add({ fill: 'none', stroke: '#ffffff', sw: 0.7, so: 0.3 }, line([q[0], q[1]]));
    }
    add({ fill: 'none', stroke: OUT, sw: 1.1 }, poly(q));
    flush();
  }

  /** A wall face between world points (south-facing, y fixed), drawn with the wall kit and clipped to its outline. */
  function wallFace(mat, outline) {
    const scr = outline.map((c) => P(...c));
    const xs = scr.map((p) => p[0]);
    const ys = scr.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const d = polyD(scr);
    layer();
    clipD(d);
    face(mat, x0, y0, Math.max(...xs) - x0, Math.max(...ys) - y0, false);
    clip(null);
    layer();
    add({ fill: 'none', stroke: OUT, sw: 1.3 }, d);
    flush();
  }

  /** A chimney stack: a brick box (world footprint) rising to `top`. */
  function chimney(x0, y0, w, dpt, zBase, top) {
    const front = [[x0, y0 + dpt, zBase], [x0 + w, y0 + dpt, zBase], [x0 + w, y0 + dpt, top], [x0, y0 + dpt, top]];
    wallFace('brick', front);
    const tp = [P(x0 - 0.05, y0 - 0.05, top), P(x0 + w + 0.05, y0 - 0.05, top), P(x0 + w + 0.05, y0 + dpt + 0.05, top), P(x0 - 0.05, y0 + dpt + 0.05, top)];
    layer();
    add({ fill: '#7a3a26' }, poly(tp));
    add({ fill: '#1a120c' }, poly([P(x0 + 0.12, y0 + 0.12, top), P(x0 + w - 0.12, y0 + 0.12, top), P(x0 + w - 0.12, y0 + dpt - 0.12, top), P(x0 + 0.12, y0 + dpt - 0.12, top)]));
    add({ fill: 'none', stroke: OUT, sw: 1.2 }, poly(tp));
    flush();
  }

  // ================================================================ doors
  const iron = '#2b2826';
  const nail = (x, y, rr = 1) => `M${f(x + rr)} ${f(y)}a${f(rr)} ${f(rr)} 0 1 0 ${f(-2 * rr)} 0a${f(rr)} ${f(rr)} 0 1 0 ${f(2 * rr)} 0Z`;

  /** Vertical boards across a leaf. */
  function leafBoards(x, y, w, h, colours, n) {
    const bw = w / n;
    for (let i = 0; i < n; i++) {
      const bx = x + i * bw;
      add({ fill: pick(colours) }, rect(bx, y, bw, h));
      grain(bx, y, bw, h, true, '#3a2616', 3);
      add({ fill: 'none', stroke: '#fff1d6', sw: 0.6, so: 0.3 }, line([[bx + 0.7, y], [bx + 0.7, y + h]]));
      add({ fill: 'none', stroke: '#120a05', sw: 0.8, so: 0.75 }, line([[bx + bw, y], [bx + bw, y + h]]));
    }
  }

  /** A long iron strap hinge with a scrolled end, from the hinge edge. */
  function strap(x, y, len, dir) {
    const d = `M${f(x)} ${f(y - 1.3)}h${f(dir * len)}l${f(dir * 3)} 1.3l${f(-dir * 3)} 1.3h${f(-dir * len)}Z`;
    add({ fill: iron }, d);
    add({ fill: 'none', stroke: '#8a8580', sw: 0.5, so: 0.5 }, line([[x, y - 1], [x + dir * len, y - 1]]));
    for (let k = 4; k < len; k += 7) add({ fill: '#77716a' }, nail(x + dir * k, y, 0.7));
  }

  /** The leaf of each kind of door, closed, in screen units: x, y top-left, w × h. */
  function leaf(kind, x, y, w, h, part) {
    layer();
    if (kind === 'plank') {
      leafBoards(x, y, w, h, ['#7d5f40', '#86663f', '#8a6a48', '#775a3b'], 5);
      strap(x, y + h * 0.18, w * 0.6, 1);
      strap(x, y + h * 0.82, w * 0.6, 1);
      // Wooden latch and thumb lever.
      add({ fill: '#5a4128' }, rect(x + w - 16, y + h * 0.5 - 1.5, 12, 3));
      add({ fill: iron }, rect(x + w - 6, y + h * 0.5 - 5, 2, 6));
    } else if (kind === 'oak') {
      leafBoards(x, y, w, h, ['#5a4330', '#553f2c', '#604834', '#4e3a28'], 4);
      for (let yy = y + 8; yy < y + h - 4; yy += 11) for (let xx = x + 5; xx < x + w - 2; xx += w / 4) add({ fill: '#6f6a64' }, nail(xx, yy, 1.1));
      strap(x, y + h * 0.15, w * 0.85, 1);
      strap(x, y + h * 0.5, w * 0.85, 1);
      strap(x, y + h * 0.85, w * 0.85, 1);
      // Ring handle.
      add({ fill: 'none', stroke: iron, sw: 1.4 }, `M${f(x + w - 10)} ${f(y + h * 0.52)}a4 4 0 1 0 0.01 0Z`);
      add({ fill: iron }, nail(x + w - 10, y + h * 0.5, 1.6));
    } else if (kind === 'panel') {
      // Stiles and rails round six raised-and-fielded panels, painted.
      const paint = '#2f4a3a';
      add({ fill: paint }, rect(x, y, w, h));
      const st = w * 0.16;
      const rl = h * 0.07;
      const cols = 2;
      const rows = [0.24, 0.36, 0.2];
      let py = y + rl;
      for (const rh of rows) {
        const ph = (h - rl * 4) * (rh / 0.8);
        for (let c = 0; c < cols; c++) {
          const pw = (w - st * 3) / 2;
          const px = x + st + c * (pw + st);
          // Bevel: lit top and left, shaded bottom and right; the raised field inside.
          add({ fill: '#3c5a48' }, poly([[px, py], [px + pw, py], [px + pw - 3, py + 3], [px + 3, py + 3]]));
          add({ fill: '#3c5a48' }, poly([[px, py], [px + 3, py + 3], [px + 3, py + ph - 3], [px, py + ph]]));
          add({ fill: '#1e3226' }, poly([[px + pw, py], [px + pw, py + ph], [px + pw - 3, py + ph - 3], [px + pw - 3, py + 3]]));
          add({ fill: '#1e3226' }, poly([[px, py + ph], [px + pw, py + ph], [px + pw - 3, py + ph - 3], [px + 3, py + ph - 3]]));
          add({ fill: '#33503f' }, rect(px + 3, py + 3, pw - 6, ph - 6));
          add({ fill: 'none', stroke: '#0e1a12', sw: 0.6, so: 0.7 }, rect(px, py, pw, ph));
        }
        py += ph + rl;
      }
      add({ fill: 'none', stroke: '#ffffff', sw: 0.7, so: 0.2 }, line([[x + 1, y + h], [x + 1, y + 1], [x + w, y + 1]]));
      add({ fill: '#c9a24a' }, nail(x + w - 7, y + h * 0.53, 2));
      add({ fill: '#fff0b8', fo: 0.8 }, nail(x + w - 7.6, y + h * 0.53 - 0.6, 0.7));
    } else if (kind === 'stable') {
      const top = part !== 'bottom';
      const bottom = part !== 'top';
      const hh = h * 0.48;
      if (top) {
        leafBoards(x, y, w, hh, ['#7d5f40', '#86663f', '#8a6a48'], 5);
        strap(x, y + hh * 0.3, w * 0.55, 1);
      }
      if (bottom) {
        leafBoards(x, y + hh + 1, w, h - hh - 1, ['#7d5f40', '#86663f', '#8a6a48'], 5);
        strap(x, y + h - 10, w * 0.55, 1);
        add({ fill: '#6f5233' }, rect(x - 1, y + hh, w + 2, 5));
        add({ fill: 'none', stroke: '#140d07', sw: 0.8 }, rect(x - 1, y + hh, w + 2, 5));
        add({ fill: iron }, rect(x + w - 8, y + hh + 8, 2, 7));
      }
    } else if (kind === 'arched') {
      leafBoards(x, y, w, h, ['#5a4330', '#553f2c', '#604834'], 5);
      for (let yy = y + 14; yy < y + h - 4; yy += 12) for (let xx = x + 6; xx < x + w - 2; xx += w / 5) add({ fill: '#6f6a64' }, nail(xx, yy, 1));
      strap(x, y + h * 0.3, w * 0.9, 1);
      strap(x, y + h * 0.75, w * 0.9, 1);
      add({ fill: 'none', stroke: iron, sw: 1.6 }, `M${f(x + w - 12)} ${f(y + h * 0.55)}a5 5 0 1 0 0.01 0Z`);
    } else if (kind === 'gate') {
      // One leaf of a pair of gates: boards with a Z of ledges and brace on the face.
      leafBoards(x, y, w, h, ['#6f5233', '#7a5c3a', '#65492d', '#735637'], 5);
      const bw = 7;
      for (const yy of [y + 10, y + h - 18]) {
        add({ fill: '#5a4128' }, rect(x, yy, w, bw));
        add({ fill: 'none', stroke: '#140d07', sw: 0.9 }, rect(x, yy, w, bw));
      }
      add({ fill: '#5a4128' }, poly([[x + 2, y + h - 18], [x + 9, y + h - 18], [x + w - 2, y + 17], [x + w - 9, y + 17]]));
      add({ fill: 'none', stroke: '#140d07', sw: 0.9 }, poly([[x + 2, y + h - 18], [x + 9, y + h - 18], [x + w - 2, y + 17], [x + w - 9, y + 17]]));
      strap(part === 'right' ? x + w : x, y + 13.5, w * 0.7, part === 'right' ? -1 : 1);
      strap(part === 'right' ? x + w : x, y + h - 14.5, w * 0.7, part === 'right' ? -1 : 1);
    }
    layer();
    add({ fill: 'url(#wFace)' }, rect(x, y, w, h));
    add({ fill: 'none', stroke: OUT, sw: 1.1 }, rect(x, y, w, h));
  }

  /** Seen through the doorway: dark inside, the floor going back, the threshold across the wall's thickness. */
  function insideOpening(x, y, w, h, arch) {
    layer();
    add({ fill: 'url(#dInside)' }, rect(x, y, w, h));
    add({ fill: 'url(#dFloor)' }, rect(x, y + h * 0.55, w, h * 0.45));
    const th = 0.3 * M * FORE;
    add({ fill: '#9a9286' }, rect(x, y + h - th, w, th));
    add({ fill: 'none', stroke: '#fff6e0', sw: 0.8, so: 0.4 }, line([[x, y + h - th + 0.8], [x + w, y + h - th + 0.8]]));
    add({ fill: 'none', stroke: OUT, sw: 0.9 }, line([[x, y + h - th], [x + w, y + h - th]]));
  }

  /** Hinge-side swing: a CSS matrix rotating a leaf `deg` about the vertical line x = hx (inward, away from the camera). */
  const swing = (hx, degA, side) => {
    const a = (degA * Math.PI) / 180;
    const c = Math.cos(a);
    const s = Math.sin(a) * FORE * side; // side 1: hinge on the left; −1: hinge on the right
    return { m: [c, -s, 0, 1, hx * (1 - c), s * hx], c, s, hx };
  };
  /** The opening rectangle, mapped back into the swung leaf's own coordinates (so the clip lands on the opening). */
  const openingInLeaf = (sw, x, y, w, h) => {
    const back = ([X, Y]) => {
      const lx = sw.hx + (X - sw.hx) / Math.max(0.02, sw.c);
      return [lx, Y + (lx - sw.hx) * sw.s];
    };
    return poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]].map(back));
  };

  /** A frame or surround round the opening, in front of everything. */
  function surround(kind, x, y, w, h, archH) {
    layer();
    if (kind === 'plank' || kind === 'stable' || kind === 'gate') {
      const pw = kind === 'gate' ? 10 : 7;
      timber(x - pw, y - pw, pw, h + pw, true, false);
      timber(x + w, y - pw, pw, h + pw, true, false);
      timber(x - pw - 4, y - pw - 8, w + 2 * pw + 8, 9, false, false);
    } else if (kind === 'oak') {
      // Dressed-stone jambs and lintel, chamfered.
      const sw0 = 9;
      for (const sx0 of [x - sw0, x + w]) {
        for (let yy = y; yy < y + h; yy += 16) add({ fill: pick(['#d2c5a6', '#ddd2b8']) }, rect(sx0, yy + 0.6, sw0, Math.min(16, y + h - yy) - 1.2));
        add({ fill: '#000000', fo: 0.15 }, rect(sx0 === x - sw0 ? x - 2.5 : x + w, y, 2.5, h));
      }
      add({ fill: '#d8ccb0' }, rect(x - sw0 - 3, y - 13, w + 2 * sw0 + 6, 13));
      add({ fill: 'none', stroke: OUT, sw: 1 }, rect(x - sw0 - 3, y - 13, w + 2 * sw0 + 6, 13));
      add({ fill: 'none', stroke: '#fff6e0', sw: 0.8, so: 0.5 }, line([[x - sw0 - 3, y - 12.4], [x + w + sw0 + 3, y - 12.4]]));
      add({ fill: 'none', stroke: OUT, sw: 1 }, rect(x - sw0, y, w + 2 * sw0, h));
    } else if (kind === 'panel') {
      // A classical doorcase: pilasters, an entablature, a pediment; painted stone white. An overlight above the door.
      const pl = 9;
      const ent = 9;
      for (const px of [x - pl - 2, x + w + 2]) {
        add({ fill: '#e8e2d2' }, rect(px, y - 18, pl, h + 18));
        add({ fill: '#c9c0aa' }, rect(px + pl - 2.5, y - 18, 2.5, h + 18));
        add({ fill: 'none', stroke: OUT, sw: 0.9 }, rect(px, y - 18, pl, h + 18));
        add({ fill: '#d8d0bc' }, rect(px - 1.5, y + h - 8, pl + 3, 8));
        add({ fill: 'none', stroke: OUT, sw: 0.9 }, rect(px - 1.5, y + h - 8, pl + 3, 8));
      }
      const ex0 = x - pl - 6;
      const ex1 = x + w + pl + 6;
      add({ fill: '#ece6d6' }, rect(ex0, y - 18 - ent, ex1 - ex0, ent));
      add({ fill: '#000000', fo: 0.18 }, rect(ex0, y - 18 - 3, ex1 - ex0, 3));
      add({ fill: 'none', stroke: OUT, sw: 1 }, rect(ex0, y - 18 - ent, ex1 - ex0, ent));
      const pd = poly([[ex0 - 3, y - 18 - ent], [ex1 + 3, y - 18 - ent], [(ex0 + ex1) / 2, y - 18 - ent - 13]]);
      add({ fill: '#ece6d6' }, pd);
      add({ fill: '#d2c9b3' }, poly([[ex0 + 7, y - 18 - ent - 2], [ex1 - 7, y - 18 - ent - 2], [(ex0 + ex1) / 2, y - 18 - ent - 10]]));
      add({ fill: 'none', stroke: OUT, sw: 1 }, pd);
      // Overlight (glazed) between door head and entablature.
      add({ fill: '#33424e' }, rect(x, y - 16, w, 14));
      add({ fill: '#9fb4c2', fo: 0.35 }, poly([[x, y - 16], [x + w * 0.5, y - 16], [x, y - 4]]));
      for (let gx = x + w / 4; gx < x + w - 1; gx += w / 4) add({ fill: '#e8e2d2' }, rect(gx - 0.8, y - 16, 1.6, 14));
      add({ fill: '#e8e2d2' }, rect(x, y - 3, w, 3));
      add({ fill: 'none', stroke: OUT, sw: 0.9 }, rect(x, y - 16, w, 16));
      // Two stone steps.
      add({ fill: '#c9c0aa' }, rect(x - 10, y + h, w + 20, 4));
      add({ fill: 'none', stroke: OUT, sw: 0.9 }, rect(x - 10, y + h, w + 20, 4));
    } else if (kind === 'arched') {
      // Voussoirs round a four-centred arch, a hood mould over it.
      const n = 9;
      const cx = x + w / 2;
      for (let i = 0; i < n; i++) {
        const a0 = Math.PI + (Math.PI * i) / n;
        const a1 = Math.PI + (Math.PI * (i + 1)) / n;
        const ro = w / 2 + 12;
        const ri = w / 2;
        const ry = archH;
        const ryo = archH + 12;
        add({ fill: pick(['#d2c5a6', '#ddd2b8', '#cfc2a2']) }, poly([[cx + Math.cos(a0) * ri, y + archH + Math.sin(a0) * ry], [cx + Math.cos(a0) * ro, y + archH + Math.sin(a0) * ryo], [cx + Math.cos(a1) * ro, y + archH + Math.sin(a1) * ryo], [cx + Math.cos(a1) * ri, y + archH + Math.sin(a1) * ry]]));
      }
      for (const sx0 of [x - 12, x + w]) for (let yy = y + archH; yy < y + h; yy += 15) add({ fill: pick(['#d2c5a6', '#ddd2b8']) }, rect(sx0, yy + 0.6, 12, Math.min(15, y + h - yy) - 1.2));
      const hood = `M${f(x - 18)} ${f(y + archH + 2)}A${f(w / 2 + 18)} ${f(archH + 16)} 0 0 1 ${f(x + w + 18)} ${f(y + archH + 2)}`;
      add({ fill: 'none', stroke: OUT, sw: 5 }, hood);
      add({ fill: 'none', stroke: '#d8ccb0', sw: 3.4 }, hood);
      add({ fill: 'none', stroke: OUT, sw: 1 }, `M${f(x - 12)} ${f(y + h)}V${f(y + archH)}A${f(w / 2 + 12)} ${f(archH + 12)} 0 0 1 ${f(x + w + 12)} ${f(y + archH)}V${f(y + h)}`);
    }
    flush();
  }

  // ================================================================ windows
  /** Glass: dark with a sky reflection; `quarries` = leaded diamonds, else clear panes. */
  function glass(x, y, w, h, kind) {
    add({ fill: '#2f3b46' }, rect(x, y, w, h));
    add({ fill: 'url(#gSky)' }, rect(x, y, w, h));
    add({ fill: '#cfe0ea', fo: 0.22 }, poly([[x, y + h * 0.15], [x + w * 0.45, y], [x + w * 0.7, y], [x, y + h * 0.75]]));
    if (kind === 'diamond') {
      // Keep the lead inside this pane (restoring whatever clip was set before).
      const was = clipId;
      layer();
      clip(x, y, w, h);
      const qw = 5.2;
      const qh = 7.4;
      let d = '';
      for (let k = -h / qh - 2; k < w / qw + h / qh + 2; k++) {
        d += `M${f(x + k * qw)} ${f(y)}l${f(-h * (qw / qh))} ${f(h)}`;
        d += `M${f(x + k * qw)} ${f(y)}l${f(h * (qw / qh))} ${f(h)}`;
      }
      add({ fill: 'none', stroke: '#2a2826', sw: 0.8, so: 0.95 }, d);
      add({ fill: 'none', stroke: '#9a9a96', sw: 0.3, so: 0.5 }, d);
      clipId = was;
      layer();
    }
  }
  /** Glazing bars over glass (a grid of `cols` × `rows` panes). */
  function bars(x, y, w, h, cols, rows, colour, t) {
    for (let i = 1; i < cols; i++) add({ fill: colour }, rect(x + (w * i) / cols - t / 2, y, t, h));
    for (let j = 1; j < rows; j++) add({ fill: colour }, rect(x, y + (h * j) / rows - t / 2, w, t));
  }
  function openingDark(x, y, w, h) {
    add({ fill: 'url(#dInside)' }, rect(x, y, w, h));
    const th = 0.3 * M * FORE;
    add({ fill: '#9a9286' }, rect(x, y + h - Math.min(th, h * 0.3), w, Math.min(th, h * 0.3)));
    add({ fill: 'none', stroke: OUT, sw: 0.8 }, line([[x, y + h - Math.min(th, h * 0.3)], [x + w, y + h - Math.min(th, h * 0.3)]]));
  }
  /** A casement leaf (iron or timber frame round leaded glass), swung outwards by `angle` on its left hinge. */
  function casement(x, y, w, h, angle, frame) {
    if (angle) {
      const a = (angle * Math.PI) / 180;
      const c = Math.cos(a);
      const s = -Math.sin(a) * FORE; // outward: the free edge comes towards the camera, down the screen
      tf([c, -s, 0, 1, x * (1 - c), s * x]);
    }
    layer();
    glass(x + 1.5, y + 1.5, w - 3, h - 3, 'diamond');
    add({ fill: 'none', stroke: frame, sw: 3 }, rect(x + 1.5, y + 1.5, w - 3, h - 3));
    add({ fill: 'none', stroke: OUT, sw: 0.9 }, rect(x, y, w, h));
    if (angle) add({ fill: '#1c1a18' }, rect(x + w - 2, y + h * 0.5 - 1, 4, 2));
    flush();
    tf(null);
  }

  const quadD = (pts) => poly(pts.map((c) => P(...c)));
  const WOOD = ['#8a6a48', '#7d5f40', '#957552', '#86663f'];
  const WOOD_DARK = '#5a4128';
  /** A box: its top and its south face (the only faces this camera sees, besides an end turned towards it). */
  function box(x, y, z, dx, dy, dz, top, front, opts = {}) {
    layer();
    const t = [[x, y, z + dz], [x + dx, y, z + dz], [x + dx, y + dy, z + dz], [x, y + dy, z + dz]];
    const fr = [[x, y + dy, z], [x + dx, y + dy, z], [x + dx, y + dy, z + dz], [x, y + dy, z + dz]];
    if (dz > 0.001) {
      add({ fill: front }, quadD(fr));
      if (opts.grain) grainQuad(fr, true);
      add({ fill: '#000000', fo: 0.14 }, quadD(fr));
    }
    add({ fill: top }, quadD(t));
    if (opts.grain) grainQuad(t, false);
    add({ fill: 'none', stroke: '#fff6e0', sw: 0.7, so: 0.35 }, line([P(...t[3]), P(...t[2])]));
    add({ fill: 'none', stroke: OUT, sw: opts.thin ? 0.8 : 1.1 }, quadD(t));
    if (dz > 0.001) add({ fill: 'none', stroke: OUT, sw: opts.thin ? 0.8 : 1.1 }, quadD(fr));
  }
  /** A few grain lines along a quad (world points), running along its longer screen direction. */
  function grainQuad(q, vertical) {
    const s = q.map((c) => P(...c));
    const xs = s.map((p) => p[0]);
    const ys = s.map((p) => p[1]);
    const x0 = Math.min(...xs);
    const y0 = Math.min(...ys);
    const w = Math.max(...xs) - x0;
    const h = Math.max(...ys) - y0;
    if (w < 2 || h < 1) return;
    const was = clipId;
    clipD(poly(s));
    grain(x0, y0, w, h, w < h, '#4a3420', 2);
    clipId = was;
  }

  /** A ladder from foot (world) to top (world): two rails, rungs every 0.3 m. */
  function ladder(foot, top, width, col) {
    layer();
    const r0a = foot;
    const r0b = [foot[0] + width, foot[1], foot[2]];
    const r1a = top;
    const r1b = [top[0] + width, top[1], top[2]];
    const len = Math.hypot(top[1] - foot[1], top[2] - foot[2]);
    const n = Math.floor(len / 0.3);
    for (let k = 1; k <= n; k++) {
      const t = (k - 0.4) / n;
      const a = P(...r0a.map((v, i) => v + (r1a[i] - v) * t));
      const b = P(...r0b.map((v, i) => v + (r1b[i] - v) * t));
      add({ fill: 'none', stroke: OUT, sw: 3.2 }, line([a, b]));
      add({ fill: 'none', stroke: col, sw: 1.8 }, line([a, b]));
    }
    for (const [a, b] of [[r0a, r1a], [r0b, r1b]]) {
      add({ fill: 'none', stroke: OUT, sw: 5 }, line([P(...a), P(...b)]));
      add({ fill: 'none', stroke: col, sw: 3.2 }, line([P(...a), P(...b)]));
      add({ fill: 'none', stroke: '#ffffff', sw: 0.8, so: 0.3 }, line([P(...a), P(...b)].map(([x, y]) => [x - 0.8, y])));
    }
    flush();
  }


  // ---- windows set into a wall face at a given screen rectangle (ported from the windows board)
  const px = (m) => m * M;
  const pz = (m) => m * M * RISE;
  function mullionOn(x, y, w, h, open = false) {

      // Stone mullions and a transom: three lights over three; a label mould over the head.
      const m = 7;
      const lw = (w - 4 * m) / 3;
      const th = h * 0.33;
      for (let r2 = 0; r2 < 2; r2++) {
        for (let c = 0; c < 3; c++) {
          const lx = x + m + c * (lw + m);
          const ly = r2 === 0 ? y + m : y + m + th + m;
          const lh = r2 === 0 ? th : h - th - 3 * m;
          const isOpen = open && r2 === 1 && c === 2;
          if (isOpen) {
            openingDark(lx, ly, lw, lh);
            flush();
          } else {
            glass(lx, ly, lw, lh, 'diamond');
          }
        }
      }
      // Stone frame.
      const stone = (sx, sy, sw2, sh2) => {
        add({ fill: pick(['#d8ccb0', '#d2c5a6']) }, rect(sx, sy, sw2, sh2));
        add({ fill: '#000000', fo: 0.14 }, rect(sx + sw2 - 2, sy, 2, sh2));
        add({ fill: 'none', stroke: OUT, sw: 0.8 }, rect(sx, sy, sw2, sh2));
      };
      layer();
      stone(x, y, w, m);
      stone(x, y + h - m, w, m);
      stone(x, y + m + th, w, m);
      for (let c = 0; c <= 3; c++) stone(x + c * (lw + m), y + m, m, h - 2 * m);
      // Label mould: a drip moulding over the head, returning down at the ends.
      add({ fill: 'none', stroke: OUT, sw: 5 }, line([[x - 6, y + 12], [x - 6, y - 6], [x + w + 6, y - 6], [x + w + 6, y + 12]]));
      add({ fill: 'none', stroke: '#ddd2b8', sw: 3.2 }, line([[x - 6, y + 12], [x - 6, y - 6], [x + w + 6, y - 6], [x + w + 6, y + 12]]));
      flush();
      if (open) casement(x + m + 2 * (lw + m), y + m + th + m, lw, h - th - 3 * m, 55, '#2b2826');

  }
  function sashOn(x, y, w, h, open = false) {

      // Six over six, in a stone-dressed opening with a keystone; open: the lower sash raised behind the upper.
      const sh = h / 2;
      openingDark(x, y, w, h);
      const sashAt = (sy) => {
        layer();
        glass(x + 3, sy + 3, w - 6, sh - 6, 'clear');
        bars(x + 3, sy + 3, w - 6, sh - 6, 3, 2, '#ece6d6', 1.8);
        add({ fill: 'none', stroke: '#ece6d6', sw: 4.5 }, rect(x + 2.5, sy + 2.5, w - 5, sh - 5));
        add({ fill: 'none', stroke: OUT, sw: 0.8 }, rect(x + 0.5, sy + 0.5, w - 1, sh - 1));
        flush();
      };
      if (open) {
        sashAt(y + sh * 0.12);
        sashAt(y);
      } else {
        sashAt(y + sh);
        sashAt(y);
      }
      // Stone dressings: lintel with keystone, sill.
      layer();
      add({ fill: '#ddd4be' }, rect(x - 8, y - 11, w + 16, 11));
      add({ fill: 'none', stroke: OUT, sw: 0.9 }, rect(x - 8, y - 11, w + 16, 11));
      add({ fill: '#e8e0cc' }, poly([[x + w / 2 - 6, y - 13], [x + w / 2 + 6, y - 13], [x + w / 2 + 4, y + 1], [x + w / 2 - 4, y + 1]]));
      add({ fill: 'none', stroke: OUT, sw: 0.9 }, poly([[x + w / 2 - 6, y - 13], [x + w / 2 + 6, y - 13], [x + w / 2 + 4, y + 1], [x + w / 2 - 4, y + 1]]));
      add({ fill: '#ddd4be' }, rect(x - 6, y + h, w + 12, 5));
      add({ fill: 'none', stroke: OUT, sw: 0.9 }, rect(x - 6, y + h, w + 12, 5));
      add({ fill: 'none', stroke: '#ece6d6', sw: 2 }, rect(x, y, w, h));
      add({ fill: 'none', stroke: OUT, sw: 0.8 }, rect(x - 1, y - 1, w + 2, h + 2));
      flush();

  }
  function shopOn(x, y, w, h, open, by) {

      // Shop front: two shutters; open, the lower one drops to a counter on legs, the upper lifts to an awning.
      const sh = h / 2;
      const depth = 0.5 * M * FORE;
      if (open) {
        openingDark(x, y, w, h);
        // A shelf of wares inside.
        add({ fill: '#5a4128' }, rect(x + 4, y + h * 0.5, w - 8, 3));
        for (let k = 0; k < 7; k++) add({ fill: pick(['#c9a24a', '#a8564a', '#8fa060', '#d8ccb0']) }, `M${f(x + 12 + k * 18)} ${f(y + h * 0.5 - 4)}a5 4 0 1 0 -10 0a5 4 0 1 0 10 0Z`);
        flush();
        // Awning: the upper shutter held out level, its top showing.
        layer();
        add({ fill: '#86663f' }, poly([[x - 2, y], [x + w + 2, y], [x + w + 2, y + depth], [x - 2, y + depth]]));
        for (let k = 1; k < 6; k++) add({ fill: 'none', stroke: '#4a3420', sw: 0.8, so: 0.6 }, line([[x - 2 + (k * (w + 4)) / 6, y], [x - 2 + (k * (w + 4)) / 6, y + depth]]));
        add({ fill: '#000000', fo: 0.25 }, rect(x - 2, y + depth, w + 4, 3));
        add({ fill: 'none', stroke: OUT, sw: 1 }, poly([[x - 2, y], [x + w + 2, y], [x + w + 2, y + depth], [x - 2, y + depth]]));
        // Counter: the lower shutter let down level on two legs, wares laid out.
        const cy = y + h;
        add({ fill: iron }, rect(x + 6, cy + depth, 2.5, by - cy - depth));
        add({ fill: iron }, rect(x + w - 8.5, cy + depth, 2.5, by - cy - depth));
        add({ fill: '#8a6a48' }, poly([[x - 2, cy], [x + w + 2, cy], [x + w + 2, cy + depth], [x - 2, cy + depth]]));
        for (let k = 1; k < 6; k++) add({ fill: 'none', stroke: '#4a3420', sw: 0.8, so: 0.6 }, line([[x - 2 + (k * (w + 4)) / 6, cy], [x - 2 + (k * (w + 4)) / 6, cy + depth]]));
        add({ fill: '#5a4128' }, rect(x - 2, cy + depth, w + 4, 4));
        add({ fill: 'none', stroke: OUT, sw: 1 }, poly([[x - 2, cy], [x + w + 2, cy], [x + w + 2, cy + depth + 4], [x - 2, cy + depth + 4]]));
        for (let k = 0; k < 6; k++) add({ fill: pick(['#c9a24a', '#a8564a', '#d8ccb0', '#8a6a48']) }, `M${f(x + 16 + k * 21)} ${f(cy + depth * 0.5)}a6 3.5 0 1 0 -12 0a6 3.5 0 1 0 12 0Z`);
      } else {
        leafBoards(x, y, w, sh, ['#7d5f40', '#86663f', '#8a6a48'], 8);
        leafBoards(x, y + sh, w, sh, ['#7d5f40', '#86663f', '#8a6a48'], 8);
        add({ fill: 'none', stroke: OUT, sw: 1 }, rect(x, y, w, h));
        add({ fill: 'none', stroke: OUT, sw: 1 }, line([[x, y + sh], [x + w, y + sh]]));
        add({ fill: iron }, rect(x - 3, y + sh - 2, w + 6, 4));
        add({ fill: iron }, rect(x + w / 2 - 3, y + sh - 6, 6, 12));
      }
      flush();
      layer();
      timber(x - 6, y - 8, w + 12, 8, false, false);
      timber(x - 6, y, 6, h, true, false);
      timber(x + w, y, 6, h, true, false);

  }
  const deg = Math.PI / 180;
  /** A Dutch gable: the end wall rises above the roof in curved shoulders to a little pediment. */
  function dutchGable(mat, wallMat, W, D, Hw, pitch) {
    const t = Math.tan(pitch * deg);
    const Hr = Hw + (W / 2) * t;
    // The roof behind, stopping short of the gable.
    const o = 0.3;
    const zE = Hw - o * t;
    const lv = Math.hypot(W / 2 + o, Hr - zE);
    slope(mat, [[-o, -o, zE], [-o, D - 0.2, zE], [W / 2, D - 0.2, Hr], [W / 2, -o, Hr]], [-o, D - 0.2, zE], [0, -1, 0], norm3([1, 0, t]), D + o, lv);
    slope(mat, [[W + o, -o, zE], [W + o, D - 0.2, zE], [W / 2, D - 0.2, Hr], [W / 2, -o, Hr]], [W + o, D - 0.2, zE], [0, -1, 0], norm3([-1, 0, t]), D + o, lv);
    ridge(mat, [W / 2, -o, Hr], [W / 2, D - 0.2, Hr]);
    // Gable outline, left half (x across, z up from the eave), then mirrored: a concave sweep up to a
    // rounded shoulder, a step in, a second smaller sweep to the neck, and a pediment on top.
    const q = (p0, c, p1, n = 8) => Array.from({ length: n }, (_, i) => {
      const k = (i + 1) / n;
      return [(1 - k) * (1 - k) * p0[0] + 2 * (1 - k) * k * c[0] + k * k * p1[0], (1 - k) * (1 - k) * p0[1] + 2 * (1 - k) * k * c[1] + k * k * p1[1]];
    });
    const top = Hr - Hw + 0.8;
    const pts2 = [[0, 0], [0, 0.35]];
    pts2.push(...q([0, 0.35], [0.05, 1.3], [0.85, 1.35]));
    pts2.push(...q([0.85, 1.35], [1.35, 1.4], [1.25, 1.95]));
    pts2.push([1.55, 1.95]);
    pts2.push(...q([1.55, 1.95], [1.6, 2.7], [2.05, 2.75]));
    pts2.push([2.05, top - 0.75], [1.9, top - 0.75], [1.9, top - 0.6]);
    const half = pts2.map(([x, z]) => [x, D, Hw + z]);
    const peak = [W / 2, D, Hw + top];
    const left = [[0, D, 0], ...half];
    const right = left.slice().reverse().map(([x, y, z]) => [W - x, y, z]);
    const outline = [...left, peak, ...right];
    const nz = Hw + top - 0.75;
    wallFace(wallMat, outline);
    // Stone coping along the top edge.
    layer();
    const cop = [...half.slice(1), peak, ...half.slice(1).reverse().map(([x, y, z]) => [W - x, y, z])].map((c) => P(...c));
    add({ fill: 'none', stroke: '#2a1d14', sw: 4.2 }, line(cop));
    add({ fill: 'none', stroke: '#d8ccb0', sw: 2.6 }, line(cop));
    add({ fill: 'none', stroke: '#fff6e0', sw: 0.8, so: 0.6 }, line(cop.map(([x, y]) => [x, y - 0.8])));
    // An oval window (oculus) in the pediment.
    const oc = P(W / 2, D, nz + 0.25);
    add({ fill: '#1c2430' }, `M${f(oc[0] + 4)} ${f(oc[1])}a4 5.5 0 1 0 -8 0a4 5.5 0 1 0 8 0Z`);
    add({ fill: 'none', stroke: '#d8ccb0', sw: 1.6 }, `M${f(oc[0] + 4)} ${f(oc[1])}a4 5.5 0 1 0 -8 0a4 5.5 0 1 0 8 0Z`);
    flush();
  }

  // ================================================================ buildings in a row, drawn from their plans
  const wallLen = (w) => Math.hypot(w.to[0] - w.from[0], w.to[1] - w.from[1]);
  const isEW = (w) => w.from[1] === w.to[1];
  const wallRect = (w, a = 0, b = wallLen(w)) => {
    const t = w.thickness / 2;
    if (isEW(w)) {
      const x = Math.min(w.from[0], w.to[0]);
      return [x + a, w.from[1] - t, x + b, w.from[1] + t];
    }
    const y = Math.min(w.from[1], w.to[1]);
    return [w.from[0] - t, y + a, w.from[0] + t, y + b];
  };
  /** Unit vector along a wall, and its footprint between a and b metres along it (four corners, any angle). */
  const dirOf = (w) => {
    const L = wallLen(w);
    return [(w.to[0] - w.from[0]) / L, (w.to[1] - w.from[1]) / L];
  };
  const wallPoly = (w, a = 0, b = wallLen(w)) => {
    const [ux, uy] = dirOf(w);
    const nx = -uy;
    const ny = ux;
    const t = w.thickness / 2;
    const p0 = [w.from[0] + ux * a, w.from[1] + uy * a];
    const p1 = [w.from[0] + ux * b, w.from[1] + uy * b];
    return [[p0[0] + nx * t, p0[1] + ny * t], [p1[0] + nx * t, p1[1] + ny * t], [p1[0] - nx * t, p1[1] - ny * t], [p0[0] - nx * t, p0[1] - ny * t]];
  };
  /** The normal pointing out of the building (for outside walls), or towards +x/+y (for partitions). */
  const outward = (w, b) => {
    const [ux, uy] = dirOf(w);
    let n = [-uy, ux];
    const mid = [(w.from[0] + w.to[0]) / 2, (w.from[1] + w.to[1]) / 2];
    const towardCentre = (b.size.w / 2 - mid[0]) * n[0] + (b.size.d / 2 - mid[1]) * n[1];
    if (w.exterior ? towardCentre > 0 : n[0] + n[1] < 0) n = [-n[0], -n[1]];
    return n;
  };
  /** Does this wall's outside face look towards the camera (south, or south-east/west)? */
  const facesCamera = (w, b) => w.exterior && outward(w, b)[1] > 0.3;
  const solidRuns = (w) => {
    const cuts = w.openings.filter((o) => o.kind === 'door').map((o) => [o.at, o.at + o.width]).sort((p, q) => p[0] - q[0]);
    const runs = [];
    let a = 0;
    for (const [c0, c1] of cuts) {
      if (c0 > a + 0.01) runs.push([a, c0]);
      a = Math.max(a, c1);
    }
    if (wallLen(w) > a + 0.01) runs.push([a, wallLen(w)]);
    return runs;
  };
  const storey = (b, level) => b.storeys.find((s) => s.level === level);
  const frontWall = (s, b) => s.walls.find((w) => isEW(w) && w.exterior && w.from[1] > b.size.d / 2);

  /** A window or door of any style, on a south-facing face, at a screen rectangle. */
  function openingOn(o, x, y, w, h, groundY) {
    if (o.kind === 'door') {
      layer();
      leaf(o.style, x, y, w, h, null);
      flush();
      surround(o.style, x, y, w, h, 0);
      return;
    }
    if (o.style === 'leaded' || o.style === 'shutters') windowOn(o.style, x, y, w, h);
    else if (o.style === 'mullion') mullionOn(x, y, w, h, false);
    else if (o.style === 'sash') sashOn(x, y, w, h, false);
    else if (o.style === 'shop') shopOn(x, y, w, h, true, groundY);
    flush();
  }
  function windowOn(style, x, y, w, h) {
    layer();
    if (style === 'leaded') {
      const n = w > 70 ? 3 : 2;
      const lw = (w - 6) / n;
      for (let i = 0; i < n; i++) casement(x + 3 + i * lw, y + 3, lw, h - 6, 0, '#4e3a28');
      timber(x - 3, y - 3, w + 6, 6, false, false);
      timber(x - 3, y + h - 3, w + 6, 6, false, false);
      timber(x - 3, y, 6, h, true, false);
      timber(x + w - 3, y, 6, h, true, false);
      for (let i = 1; i < n; i++) timber(x + 3 + i * lw - 2.5, y, 5, h, true, false);
    } else {
      leafBoards(x, y, w / 2, h, ['#7d5f40', '#86663f', '#8a6a48'], 2);
      leafBoards(x + w / 2, y, w / 2, h, ['#7d5f40', '#86663f', '#8a6a48'], 2);
      add({ fill: 'none', stroke: OUT, sw: 1 }, rect(x, y, w, h));
    }
    flush();
  }

  /** A plain round column (stone): base, shaft, a square capital under the floor it carries. */
  function column(fx, top, frontY) {
    const r = fx.w / 2;
    // Nothing of it shows above the line where the floor it carries meets the street front.
    const cutY = P(fx.x, frontY, top)[1];
    clip(P(fx.x - 1, 0, 0)[0], cutY, 2 * M, 400);
    const b0 = P(fx.x, fx.y, 0);
    const b1 = P(fx.x, fx.y, top);
    const rx = r * M;
    layer();
    const shaft = `M${f(b0[0] - rx * 0.8)} ${f(cutY + 8)}L${f(b0[0] - rx)} ${f(b0[1] - 6)}L${f(b0[0] + rx)} ${f(b0[1] - 6)}L${f(b0[0] + rx * 0.8)} ${f(cutY + 8)}Z`;
    add({ fill: '#ddd2b8' }, shaft);
    add({ fill: 'url(#rCyl)' }, shaft);
    add({ fill: 'none', stroke: OUT, sw: 1.1 }, shaft);
    for (const [y0, hh, ww] of [[b0[1] - 7, 7, rx * 1.35], [cutY, 8, rx * 1.4]]) {
      add({ fill: '#d8ccb0' }, rect(b0[0] - ww, y0, ww * 2, hh));
      add({ fill: '#000000', fo: 0.15 }, rect(b0[0] + ww * 0.5, y0, ww * 0.5, hh));
      add({ fill: 'none', stroke: OUT, sw: 1 }, rect(b0[0] - ww, y0, ww * 2, hh));
    }
    clip(null);
    flush();
  }

  /** One building from outside, in the game's view. Drawn back to front: each storey's walls then its doors and
   * windows (so the floor above always sits in front of them), the main gable and roof, then anything projecting
   * over the street (columns, a bay and its own little gable). */
  function exteriorOf(b, sx, groundY) {
    const W = b.size.w;
    const D = b.size.d;
    const E = b.roof.eaves;
    const t = Math.tan((b.roof.pitch * Math.PI) / 180);
    const Hr = E + (W / 2) * t;
    at(sx, groundY, D);
    const levels = b.storeys.filter((s) => s.level >= 0).sort((p, q) => p.level - q.level);
    const top = levels[levels.length - 1];
    const topMat = frontWall(top, b).material;
    const outerFace = (w) => {
      const n = outward(w, b);
      return [[w.from[0] + (n[0] * w.thickness) / 2, w.from[1] + (n[1] * w.thickness) / 2], [w.to[0] + (n[0] * w.thickness) / 2, w.to[1] + (n[1] * w.thickness) / 2]];
    };
    const projecting = (w) => Math.min(...outerFace(w).map((p) => p[1])) > D + 0.01;
    const topOfWall = (w, s, i) => s.floorZ + (w.top ?? (i === levels.length - 1 ? E - s.floorZ : s.height));
    const drawWalls = (s, i, walls) => {
      walls.sort((p, q) => Math.max(...outerFace(p).map((v) => v[1])) - Math.max(...outerFace(q).map((v) => v[1])));
      for (const w of walls) {
        const [e0, e1] = outerFace(w);
        const z1 = topOfWall(w, s, i);
        wallFace(w.material, [[e0[0], e0[1], s.floorZ], [e1[0], e1[1], s.floorZ], [e1[0], e1[1], z1], [e0[0], e0[1], z1]]);
        const recessed = Math.max(e0[1], e1[1]) < D - 0.05;
        if (!isEW(w) || recessed) {
          layer();
          add({ fill: '#000000', fo: isEW(w) ? 0.12 : 0.16 }, poly([P(e0[0], e0[1], s.floorZ), P(e1[0], e1[1], s.floorZ), P(e1[0], e1[1], z1), P(e0[0], e0[1], z1)]));
          if (s.level === 0) {
            // Set back under the floor above: the ground in its shade, the top of the wall darker still.
            if (isEW(w)) add({ fill: '#000000', fo: 0.2 }, poly([P(e0[0], e0[1], 0), P(e1[0], e1[1], 0), P(e1[0], D, 0), P(e0[0], D, 0)]));
            else {
              const corner = [Math.max(e0[0], e1[0]), Math.max(e0[1], e1[1])];
              add({ fill: '#000000', fo: 0.22 }, poly([P(e0[0], e0[1], 0), P(e1[0], e1[1], 0), P(corner[0], corner[1], 0)]));
            }
            add({ fill: 'url(#rEaveShadow)' }, poly([P(e0[0], e0[1], z1), P(e1[0], e1[1], z1), P(e1[0], e1[1], z1 - 0.6), P(e0[0], e0[1], z1 - 0.6)]));
          }
          flush();
        }
        // Its doors and windows straight away, before anything in front of it.
        const n = outward(w, b);
        const [ux, uy] = dirOf(w);
        for (const o of w.openings) {
          const z0 = s.floorZ + (o.kind === 'door' ? 0 : o.sill);
          const wx = w.from[0] + ux * o.at + (n[0] * w.thickness) / 2;
          const wy = w.from[1] + uy * o.at + (n[1] * w.thickness) / 2;
          const p0 = P(wx, wy, z0);
          const p1 = P(wx, wy, z0 + o.height);
          const wPx = o.width * M;
          if (isEW(w)) openingOn(o, p0[0], p1[1], wPx, p0[1] - p1[1], groundY);
          else {
            tf([ux, uy * FORE, 0, 1, p0[0] * (1 - ux), -p0[0] * uy * FORE]);
            openingOn(o, p0[0], p1[1], wPx, p0[1] - p1[1], groundY);
            tf(null);
            flush();
          }
        }
      }
    };
    const columns = (storey(b, 0)?.fixtures ?? []).filter((q) => q.kind === 'column');
    const upperFloor = storey(b, 1)?.floorZ ?? 3;
    if (b.roof.shape === 'dutchGable') {
      dutchGable(b.roof.covering, topMat, W, D, E, b.roof.pitch);
      levels.forEach((s, i) => drawWalls(s, i, []));
      for (const s of levels) {
        for (const w of s.walls.filter((q) => facesCamera(q, b))) {
          for (const o of w.openings) {
            const z0 = s.floorZ + (o.kind === 'door' ? 0 : o.sill);
            const p0 = P(w.from[0] + o.at, D, z0);
            const p1 = P(w.from[0] + o.at + o.width, D, z0 + o.height);
            openingOn(o, p0[0], p1[1], p1[0] - p0[0], p0[1] - p1[1], groundY);
          }
        }
      }
    } else {
      levels.forEach((s, i) => {
        if (i > 0) {
          for (const fx of columns.filter((q) => q.y <= D + 0.01)) column(fx, s.floorZ, D);
          // The band where this floor sits.
          const mat = frontWall(levels[0], b).material;
          const a0 = P(0, D, s.floorZ + 0.1);
          const c0 = P(W, D, s.floorZ - 0.08);
          layer();
          if (mat === 'timber' || frontWall(s, b).material === 'timber') timber(a0[0], a0[1], c0[0] - a0[0], c0[1] - a0[1], false, false);
          else {
            add({ fill: mat === 'brick' ? '#7a3a26' : '#e2d8c2' }, rect(a0[0], a0[1], c0[0] - a0[0], c0[1] - a0[1]));
            add({ fill: 'none', stroke: '#fff6e0', sw: 0.8, so: 0.4 }, line([[a0[0], a0[1] + 0.6], [c0[0], a0[1] + 0.6]]));
            add({ fill: 'none', stroke: OUT, sw: 0.9 }, rect(a0[0], a0[1], c0[0] - a0[0], c0[1] - a0[1]));
          }
          flush();
        }
        drawWalls(s, i, s.walls.filter((w) => facesCamera(w, b) && !projecting(w)));
      });
      wallFace(topMat, [[0, D, E], [W, D, E], [W / 2, D, Hr]]);
      const fr = b.roof.overhang;
      const lv = Math.hypot(W / 2, Hr - E);
      slope(b.roof.covering, [[0, 0, E], [0, D + fr, E], [W / 2, D + fr, Hr], [W / 2, 0, Hr]], [0, D + fr, E], [0, -1, 0], norm3([1, 0, t]), D + fr, lv);
      slope(b.roof.covering, [[W, 0, E], [W, D + fr, E], [W / 2, D + fr, Hr], [W / 2, 0, Hr]], [W, D + fr, E], [0, -1, 0], norm3([-1, 0, t]), D + fr, lv);
      ridge(b.roof.covering, [W / 2, 0, Hr], [W / 2, D + fr, Hr]);
      layer();
      add({ fill: 'none', stroke: '#3a2a1c', sw: 2.4 }, line([P(0, D + fr, E), P(W / 2, D + fr, Hr), P(W, D + fr, E)]));
      add({ fill: 'none', stroke: '#8a6a48', sw: 1 }, line([P(0, D + fr, E), P(W / 2, D + fr, Hr), P(W, D + fr, E)]));
      flush();
      // Anything standing out over the street: its columns, its walls, its own gable.
      levels.forEach((s, i) => {
        if (i === 0) return;
        const out = s.walls.filter((w) => w.exterior && projecting(w) || (w.exterior && !isEW(w) && w.top !== undefined));
        if (!out.length) return;
        for (const fx of columns.filter((q) => q.y > D + 0.01)) column(fx, s.floorZ, fx.y + 0.15);
        drawWalls(s, i, s.walls.filter((w) => facesCamera(w, b) && projecting(w)));
      });
      for (const g of b.gablets ?? []) {
        const gt = Math.tan((g.pitch * Math.PI) / 180);
        const xc = g.x + g.w / 2;
        const gH = g.eaves + (g.w / 2) * gt;
        wallFace(g.material, [[g.x, g.to, g.eaves], [g.x + g.w, g.to, g.eaves], [xc, g.to, gH]]);
        const o2 = 0.1;
        const zE = g.eaves - o2 * gt;
        const glv = Math.hypot(g.w / 2 + o2, gH - zE);
        const ylen = g.to + g.overhang - g.from;
        slope(g.covering, [[g.x - o2, g.from, zE], [g.x - o2, g.to + g.overhang, zE], [xc, g.to + g.overhang, gH], [xc, g.from, gH]], [g.x - o2, g.to + g.overhang, zE], [0, -1, 0], norm3([1, 0, gt]), ylen, glv);
        slope(g.covering, [[g.x + g.w + o2, g.from, zE], [g.x + g.w + o2, g.to + g.overhang, zE], [xc, g.to + g.overhang, gH], [xc, g.from, gH]], [g.x + g.w + o2, g.to + g.overhang, zE], [0, -1, 0], norm3([-1, 0, gt]), ylen, glv);
        ridge(g.covering, [xc, g.from, gH], [xc, g.to + g.overhang, gH]);
        layer();
        add({ fill: 'none', stroke: '#3a2a1c', sw: 2.2 }, line([P(g.x - o2, g.to + g.overhang, zE), P(xc, g.to + g.overhang, gH), P(g.x + g.w + o2, g.to + g.overhang, zE)]));
        add({ fill: 'none', stroke: '#8a6a48', sw: 0.9 }, line([P(g.x - o2, g.to + g.overhang, zE), P(xc, g.to + g.overhang, gH), P(g.x + g.w + o2, g.to + g.overhang, zE)]));
        flush();
      }
    }
    // A painted board over the shop front.
    if (b.sign) {
      const bw = Math.min(W - 0.4, 0.55 + b.sign.text.length * 0.2);
      const x0 = Math.max(0.15, Math.min(W - 0.15 - bw, b.sign.at - bw / 2));
      const a = P(x0, D + 0.05, 2.95);
      const c = P(x0 + bw, D + 0.05, 2.6);
      layer();
      add({ fill: '#1f3a2e' }, rect(a[0], a[1], c[0] - a[0], c[1] - a[1]));
      add({ fill: 'none', stroke: '#c9a24a', sw: 1.2 }, rect(a[0] + 2, a[1] + 2, c[0] - a[0] - 4, c[1] - a[1] - 4));
      add({ fill: 'none', stroke: OUT, sw: 1 }, rect(a[0], a[1], c[0] - a[0], c[1] - a[1]));
      flush();
      label((a[0] + c[0]) / 2, (a[1] + c[1]) / 2 + 4, b.sign.text, 11, 700, '#e8c56a', 'middle');
    }
    for (const c of b.chimneys) {
      const cx = c.x + c.w / 2;
      const zBase = E + Math.min(cx, W - cx) * t - 0.25;
      chimney(c.x, c.y, c.w, c.d, zBase, Math.max(Hr + c.aboveRidge, zBase + 1.2));
    }
  }

  /** The whole row's ground floor as the game shows it inside: floors, then every wall as one, back walls full height. */
  function cutawayRow(sx, groundY) {
    const D = PLOTS[0].building.size.d;
    at(sx, groundY, D);
    for (const p of PLOTS) {
      const s = storey(p.building, 0);
      for (const room of s.rooms) {
        const xs = room.outline.map((q) => q[0] + p.x);
        const ys = room.outline.map((q) => q[1]);
        const a = P(Math.min(...xs), Math.min(...ys), 0);
        const c = P(Math.max(...xs), Math.max(...ys), 0);
        clipD(poly(room.outline.map((q) => P(q[0] + p.x, q[1], 0))));
        floor(room.floor, a[0], a[1], c[0] - a[0], c[1] - a[1], false);
        clip(null);
        flush();
      }
      for (const fx of s.fixtures) {
        if (fx.kind === 'hearth') {
          box(p.x + fx.x, fx.y, 0, fx.w, fx.d, 0.12, '#a39a89', '#7f776a');
          const c = P(p.x + fx.x + fx.w * 0.5, fx.y + fx.d * 0.5, 0.12);
          add({ fill: 'url(#bFire)' }, `M${f(c[0] + 14)} ${f(c[1])}a14 10 0 1 0 -28 0a14 10 0 1 0 28 0Z`);
          add({ fill: '#e0712a' }, `M${f(c[0] - 5)} ${f(c[1] + 2)}q5 -14 10 0z`);
          flush();
        }
      }
    }
    // Walls as pieces: a footprint (any angle) at a height, plus the face turned towards the camera.
    const pieces = [];
    for (const p of PLOTS) {
      const s = storey(p.building, 0);
      for (const w of s.walls) {
        const full = w.exterior && isEW(w) && w.from[1] < D / 2;
        const n = outward(w, p.building);
        const faceSide = isEW(w) || facesCamera(w, p.building) ? (n[1] > 0 || !w.exterior ? 1 : -1) : 0;
        for (const [a, c] of solidRuns(w)) {
          const fp = wallPoly(w, a, c).map(([x, y]) => [x + p.x, y]);
          // The edge that faces the camera: of the two long edges, the one further south.
          const e1 = [fp[0], fp[1]];
          const e2 = [fp[3], fp[2]];
          const edge = isEW(w) || faceSide ? ((e1[0][1] + e1[1][1]) / 2 > (e2[0][1] + e2[1][1]) / 2 ? e1 : e2) : null;
          pieces.push({ w, fp, edge, h: full ? s.height : 0.35, full, plot: p, south: Math.max(...fp.map((q) => q[1])) });
        }
      }
    }
    pieces.sort((p, q) => p.south - q.south);
    const topQ = (pc) => pc.fp.map(([x, y]) => [x, y, pc.h]);
    const faceQ = (pc) => [[pc.edge[0][0], pc.edge[0][1], 0], [pc.edge[1][0], pc.edge[1][1], 0], [pc.edge[1][0], pc.edge[1][1], pc.h], [pc.edge[0][0], pc.edge[0][1], pc.h]];
    layer();
    for (const pc of pieces) {
      add({ fill: 'none', stroke: OUT, sw: 2.8 }, quadD(topQ(pc)));
      if (pc.edge) add({ fill: 'none', stroke: OUT, sw: 2.8 }, quadD(faceQ(pc)));
    }
    flush();
    const fillQuad = (q, fn) => {
      const sp = q.map((c) => P(...c));
      const xs = sp.map((v) => v[0]);
      const ys = sp.map((v) => v[1]);
      layer();
      clipD(poly(sp));
      fn(Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
      clip(null);
      flush();
    };
    for (const pc of pieces) {
      if (pc.edge) fillQuad(faceQ(pc), (x, y, w2, h2) => face(pc.w.material, x, y, w2, h2, false));
      fillQuad(topQ(pc), (x, y, w2, h2) => topOf(pc.w.material, x, y, w2, h2, !pc.full));
      if (pc.full) {
        for (const o of pc.w.openings.filter((q) => q.kind === 'window')) {
          const yy = pc.edge[0][1];
          const a = P(pc.plot.x + o.at, yy, o.sill);
          const c = P(pc.plot.x + o.at + o.width, yy, o.sill + o.height);
          if (o.style === 'sash') sashOn(a[0], c[1], c[0] - a[0], a[1] - c[1], false);
          else windowOn(o.style, a[0], c[1], c[0] - a[0], a[1] - c[1]);
          flush();
        }
      }
      layer();
      if (pc.edge) add({ fill: 'none', stroke: OUT, sw: 0.9, so: 0.8 }, line([P(pc.edge[0][0], pc.edge[0][1], pc.h), P(pc.edge[1][0], pc.edge[1][1], pc.h)]));
      flush();
    }
    // Columns, cut down like the walls.
    for (const p of PLOTS) for (const fx of storey(p.building, 0).fixtures.filter((q) => q.kind === 'column')) {
      const c0 = P(p.x + fx.x, fx.y, 0);
      const c1 = P(p.x + fx.x, fx.y, 0.35);
      const rx = (fx.w / 2) * M;
      layer();
      add({ fill: '#ddd2b8' }, `M${f(c0[0] - rx)} ${f(c1[1])}L${f(c0[0] - rx)} ${f(c0[1])}A${f(rx)} ${f(rx * FORE)} 0 0 0 ${f(c0[0] + rx)} ${f(c0[1])}L${f(c0[0] + rx)} ${f(c1[1])}Z`);
      add({ fill: 'url(#rCyl)' }, `M${f(c0[0] - rx)} ${f(c1[1])}L${f(c0[0] - rx)} ${f(c0[1])}A${f(rx)} ${f(rx * FORE)} 0 0 0 ${f(c0[0] + rx)} ${f(c0[1])}L${f(c0[0] + rx)} ${f(c1[1])}Z`);
      add({ fill: '#cfc2a2' }, `M${f(c1[0] + rx)} ${f(c1[1])}a${f(rx)} ${f(rx * FORE)} 0 1 0 ${f(-2 * rx)} 0a${f(rx)} ${f(rx * FORE)} 0 1 0 ${f(2 * rx)} 0Z`);
      add({ fill: 'none', stroke: OUT, sw: 1 }, `M${f(c0[0] - rx)} ${f(c1[1])}L${f(c0[0] - rx)} ${f(c0[1])}A${f(rx)} ${f(rx * FORE)} 0 0 0 ${f(c0[0] + rx)} ${f(c0[1])}L${f(c0[0] + rx)} ${f(c1[1])}`);
      add({ fill: 'none', stroke: OUT, sw: 1 }, `M${f(c1[0] + rx)} ${f(c1[1])}a${f(rx)} ${f(rx * FORE)} 0 1 0 ${f(-2 * rx)} 0a${f(rx)} ${f(rx * FORE)} 0 1 0 ${f(2 * rx)} 0Z`);
      flush();
    }
    // Stairs rising north to the floor above.
    for (const p of PLOTS) {
      const s = storey(p.building, 0);
      for (const fx of s.fixtures.filter((q) => q.kind === 'stair')) {
        const up = storey(p.building, fx.toLevel).floorZ;
        const n = Math.round(up / 0.2);
        const run = fx.d / n;
        for (let i = n - 1; i >= 0; i--) box(p.x + fx.x, fx.y + fx.d - (i + 1) * run, 0, fx.w, run, (i + 1) * (up / n), pick(['#9a7650', '#8f6c47', '#a67f56']), '#5a4128', { thin: true });
        flush();
      }
    }
    for (const p of PLOTS) {
      for (const room of storey(p.building, 0).rooms) {
        const xs = room.outline.map((q) => q[0] + p.x);
        const ys = room.outline.map((q) => q[1]);
        const c = P((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2 + 0.4, 0);
        label(c[0], c[1], room.name, 14, 700, '#1c140c', 'middle', true);
      }
    }
  }

  // ---------------------------------------------------------------- plans (top-down)
  const PLAN_WALL = { timber: '#6b4a2b', daub: '#cdbb94', rubble: '#8f877a', brick: '#a85638', ashlar: '#d8ccb0', plank: '#8a6a48' };
  const PLAN_FLOOR = { earth: '#b39c78', matting: '#dcc888', boards: '#c9a272', flags: '#bdb7a9', quarry: '#c98a68', tiles: '#d6ae5c', marble: '#ece8de', turkey: '#a8483a' };
  const FLOOR_NAME = { earth: 'earth and rushes', matting: 'rush matting', boards: 'boards', flags: 'flagstones', quarry: 'quarry tiles', tiles: 'glazed tiles', marble: 'marble', turkey: 'Turkey work' };
  function planOf(b, s, x0, y0, S) {
    const X = (m) => x0 + m * S;
    const Y = (m) => y0 + m * S;
    const R = (r) => rect(X(r[0]), Y(r[1]), (r[2] - r[0]) * S, (r[3] - r[1]) * S);
    for (const room of s.rooms) {
      const xs = room.outline.map((p) => p[0]);
      const ys = room.outline.map((p) => p[1]);
      const r = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)];
      const outlineD = poly(room.outline.map(([px2, py2]) => [X(px2), Y(py2)]));
      layer();
      add({ fill: PLAN_FLOOR[room.floor] }, outlineD);
      layer();
      clipD(outlineD);
      if (room.floor === 'boards') for (let yy = r[1]; yy < r[3]; yy += 0.2) add({ fill: 'none', stroke: '#8a6a48', sw: 0.6, so: 0.45 }, line([[X(r[0]), Y(yy)], [X(r[2]), Y(yy)]]));
      else if (room.floor === 'flags' || room.floor === 'quarry') {
        const g = room.floor === 'flags' ? 0.55 : 0.3;
        for (let yy = r[1]; yy < r[3]; yy += g) {
          add({ fill: 'none', stroke: '#6e665a', sw: 0.6, so: 0.5 }, line([[X(r[0]), Y(yy)], [X(r[2]), Y(yy)]]));
          for (let xx = r[0] + (room.floor === 'flags' ? (Math.round(yy / g) % 2) * 0.35 : 0); xx < r[2]; xx += room.floor === 'flags' ? 0.7 : 0.3) add({ fill: 'none', stroke: '#6e665a', sw: 0.6, so: 0.5 }, line([[X(xx), Y(yy)], [X(xx), Y(Math.min(r[3], yy + g))]]));
        }
      } else if (room.floor === 'earth') {
        for (let k = 0; k < (r[2] - r[0]) * (r[3] - r[1]) * 25; k++) add({ fill: '#7d6a4e', fo: 0.6 }, `M${f(X(r[0] + rnd() * (r[2] - r[0])))} ${f(Y(r[1] + rnd() * (r[3] - r[1])))}h1.2v1.2h-1.2Z`);
      } else if (room.floor === 'turkey') {
        add({ fill: 'none', stroke: '#1f2c48', sw: 5, so: 0.8 }, rect(X(r[0]) + 6, Y(r[1]) + 6, (r[2] - r[0]) * S - 12, (r[3] - r[1]) * S - 12));
      }
      clip(null);
      flush();
    }
    const Q = (pts) => poly(pts.map(([px2, py2]) => [X(px2), Y(py2)]));
    const runs = [];
    for (const w of s.walls) for (const [a, c] of solidRuns(w)) runs.push([w, wallPoly(w, a, c)]);
    layer();
    for (const [, q] of runs) add({ fill: 'none', stroke: '#1c140c', sw: 2.6 }, Q(q));
    layer();
    for (const [w, q] of runs) add({ fill: PLAN_WALL[w.material] }, Q(q));
    flush();
    for (const w of s.walls) {
      const [ux, uy] = dirOf(w);
      const n = outward(w, b);
      const nIn = [-n[0], -n[1]];
      for (const o of w.openings) {
        const q = wallPoly(w, o.at, o.at + o.width);
        layer();
        if (o.kind === 'window') {
          add({ fill: '#ffffff' }, Q(q));
          add({ fill: 'none', stroke: '#1c140c', sw: 1.3 }, Q(q));
          for (const k of [-0.1, 0.1]) {
            const c0 = [w.from[0] + ux * o.at + n[0] * w.thickness * k, w.from[1] + uy * o.at + n[1] * w.thickness * k];
            add({ fill: 'none', stroke: '#1c140c', sw: 0.8 }, line([[X(c0[0]), Y(c0[1])], [X(c0[0] + ux * o.width), Y(c0[1] + uy * o.width)]]));
          }
        } else {
          // Swing inwards (towards the middle for outside walls; east or south for partitions).
          const dir = w.exterior ? nIn : [Math.abs(n[0]), Math.abs(n[1])];
          const t2 = w.thickness / 2;
          const startP = [w.from[0] + ux * o.at + dir[0] * t2, w.from[1] + uy * o.at + dir[1] * t2];
          const endP = [startP[0] + ux * o.width, startP[1] + uy * o.width];
          const hinge = o.hinge === 'right' ? endP : startP;
          const jamb = o.hinge === 'right' ? startP : endP;
          const tip = [hinge[0] + dir[0] * o.width, hinge[1] + dir[1] * o.width];
          add({ fill: 'none', stroke: '#1c140c', sw: 2.2 }, line([[X(hinge[0]), Y(hinge[1])], [X(tip[0]), Y(tip[1])]]));
          const cr = (tip[0] - hinge[0]) * (jamb[1] - hinge[1]) - (tip[1] - hinge[1]) * (jamb[0] - hinge[0]);
          add({ fill: 'none', stroke: '#1c140c', sw: 0.8, so: 0.6 }, `M${f(X(tip[0]))} ${f(Y(tip[1]))}A${f(o.width * S)} ${f(o.width * S)} 0 0 ${cr > 0 ? 1 : 0} ${f(X(jamb[0]))} ${f(Y(jamb[1]))}`);
        }
        flush();
      }
    }
    for (const fx of s.fixtures) {
      layer();
      const r = [fx.x, fx.y, fx.x + fx.w, fx.y + fx.d];
      if (fx.kind === 'hearth') {
        add({ fill: '#a39a89' }, R(r));
        add({ fill: '#e0712a', fo: 0.8 }, `M${f(X(fx.x + fx.w / 2) + 5)} ${f(Y(fx.y + fx.d / 2))}a5 8 0 1 0 -10 0a5 8 0 1 0 10 0Z`);
        add({ fill: 'none', stroke: '#1c140c', sw: 1.2 }, R(r));
      } else if (fx.kind === 'column') {
        const rr = (fx.w / 2) * S;
        add({ fill: '#d8ccb0' }, `M${f(X(fx.x) + rr)} ${f(Y(fx.y))}a${f(rr)} ${f(rr)} 0 1 0 ${f(-2 * rr)} 0a${f(rr)} ${f(rr)} 0 1 0 ${f(2 * rr)} 0Z`);
        add({ fill: 'none', stroke: '#1c140c', sw: 1.4 }, `M${f(X(fx.x) + rr)} ${f(Y(fx.y))}a${f(rr)} ${f(rr)} 0 1 0 ${f(-2 * rr)} 0a${f(rr)} ${f(rr)} 0 1 0 ${f(2 * rr)} 0Z`);
        flush();
        label(X(fx.x) - 8, Y(fx.y) + 4, 'column', 10, 700, '#2a1d14', 'end', true);
      } else if (fx.kind === 'stair' || fx.kind === 'stairwell') {
        if (fx.kind === 'stairwell') add({ fill: '#2a1c12', fo: 0.35 }, R(r));
        add({ fill: 'none', stroke: '#1c140c', sw: 1.4 }, R(r));
        for (let yy = r[1] + 0.2; yy < r[3]; yy += 0.2) add({ fill: 'none', stroke: '#1c140c', sw: 0.8, so: fx.kind === 'stair' ? 0.9 : 0.5 }, line([[X(r[0]), Y(yy)], [X(r[2]), Y(yy)]]));
        const mx = X((r[0] + r[2]) / 2);
        if (fx.kind === 'stair') {
          add({ fill: 'none', stroke: '#8a2a1a', sw: 1.4 }, line([[mx, Y(r[3]) - 2], [mx, Y(r[1]) + 6]]));
          add({ fill: '#8a2a1a' }, poly([[mx - 4, Y(r[1]) + 9], [mx + 4, Y(r[1]) + 9], [mx, Y(r[1]) + 1]]));
        }
        flush();
        label(mx, Y(r[3]) + 13, fx.kind === 'stair' ? 'up' : 'down', 10, 700, '#8a2a1a', 'middle', true);
      }
      flush();
    }
    for (const room of s.rooms) {
      const xs = room.outline.map((p) => p[0]);
      const ys = room.outline.map((p) => p[1]);
      const cx = X((Math.min(...xs) + Math.max(...xs)) / 2);
      const cy = Y((Math.min(...ys) + Math.max(...ys)) / 2);
      const narrow = (Math.max(...xs) - Math.min(...xs)) < 1.6;
      label(cx, cy - 4, room.name, narrow ? 12 : 15, 700, '#1c140c', 'middle', true);
      if (!narrow) {
        label(cx, cy + 11, room.use, 10.5, 400, '#2a1d14', 'middle', true);
        label(cx, cy + 24, FLOOR_NAME[room.floor], 10.5, 400, '#4a3a2a', 'middle', true);
      }
    }
  }

  function cottageWindowOn(style, x, y, w, h) {
    layer();
    if (style === 'leaded') {
      const lw = (w - 6) / 2;
      casement(x + 3, y + 3, lw, h - 6, 0, '#4e3a28');
      casement(x + 3 + lw, y + 3, lw, h - 6, 0, '#4e3a28');
      timber(x - 3, y - 3, w + 6, 6, false, false);
      timber(x - 3, y + h - 3, w + 6, 6, false, false);
      timber(x - 3, y, 6, h, true, false);
      timber(x + w - 3, y, 6, h, true, false);
      timber(x + w / 2 - 2.5, y, 5, h, true, false);
    } else {
      leafBoards(x, y, w / 2, h, ['#7d5f40', '#86663f', '#8a6a48'], 2);
      leafBoards(x + w / 2, y, w / 2, h, ['#7d5f40', '#86663f', '#8a6a48'], 2);
      add({ fill: 'none', stroke: OUT, sw: 1 }, rect(x, y, w, h));
      timber(x - 3, y - 5, w + 6, 5, false, false);
    }
    flush();
  }

  /** The building from outside, in the game's view (from the south). */
  function exteriorEW(B, cellX, groundY) {
    const ground = B.storeys.find((s) => s.level === 0);
    const W = B.size.w;
    const D = B.size.d;
    const E = B.roof.eaves;
    at(cellX, groundY, D);
    const south = ground.walls.find((w) => isEW(w) && w.exterior && w.from[1] > D / 2);
    // The plinth and wall face, then what's set into it.
    wallFace(south.material, [[0, D, 0], [W, D, 0], [W, D, E], [0, D, E]]);
    for (const o of south.openings) {
      const p0 = P(o.at, D, o.kind === 'door' ? 0 : o.sill);
      const p1 = P(o.at + o.width, D, (o.kind === 'door' ? 0 : o.sill) + o.height);
      const x = p0[0];
      const y = p1[1];
      const w = p1[0] - p0[0];
      const h = p0[1] - p1[1];
      if (o.kind === 'door') {
        layer();
        leaf(o.style, x, y, w, h, null);
        flush();
        surround(o.style, x, y, w, h, 0);
      } else cottageWindowOn(o.style, x, y, w, h);
    }
    // Roof: gabled, ridge east–west, so the near slope faces the camera.
    const o = B.roof.overhang;
    const t = Math.tan((B.roof.pitch * Math.PI) / 180);
    const zE = E - o * t;
    const Hr = E + (D / 2) * t;
    eave(B.roof.covering, [-o, D + o, zE], [W + o, D + o, zE], true);
    slope(B.roof.covering, [[-o, D + o, zE], [W + o, D + o, zE], [W + o, D / 2, Hr], [-o, D / 2, Hr]], [-o, D + o, zE], [1, 0, 0], norm3([0, -1, t]), W + 2 * o, Math.hypot(D / 2 + o, Hr - zE));
    ridge(B.roof.covering, [-o, D / 2, Hr], [W + o, D / 2, Hr]);
    // The stack rises out of the thatch: its front starts where it meets the slope.
    for (const c of B.chimneys) chimney(c.x, c.y, c.w, c.d, Hr - Math.max(0, c.y + c.d - D / 2) * t, Hr + c.aboveRidge);
    groundShadow(cellX, groundY, W * M);
  }


  /** Just the roof of a building (gables above the eaves, slopes, ridges, little gables, chimneys): its walls are pieces of their own. */
  function roofOf(b, cellX, groundY) {
    const W = b.size.w;
    const D = b.size.d;
    const E = b.roof.eaves;
    const t = Math.tan((b.roof.pitch * Math.PI) / 180);
    at(cellX, groundY, D);
    if (b.roof.ridge === 'ew') {
      const o = b.roof.overhang;
      const zE = E - o * t;
      const Hr = E + (D / 2) * t;
      eave(b.roof.covering, [-o, D + o, zE], [W + o, D + o, zE], true);
      slope(b.roof.covering, [[-o, D + o, zE], [W + o, D + o, zE], [W + o, D / 2, Hr], [-o, D / 2, Hr]], [-o, D + o, zE], [1, 0, 0], norm3([0, -1, t]), W + 2 * o, Math.hypot(D / 2 + o, Hr - zE));
      ridge(b.roof.covering, [-o, D / 2, Hr], [W + o, D / 2, Hr]);
      for (const c of b.chimneys) chimney(c.x, c.y, c.w, c.d, Hr - Math.max(0, c.y + c.d - D / 2) * t, Hr + c.aboveRidge);
      flush();
      return;
    }
    const levels = b.storeys.filter((s) => s.level >= 0).sort((p, q) => p.level - q.level);
    const topMat = frontWall(levels[levels.length - 1], b).material;
    const Hr = E + (W / 2) * t;
    if (b.roof.shape === 'dutchGable') {
      // The shaped gable is drawn from the ground: keep only what's above the eaves.
      const e = P(0, D, E);
      mask(`M${f(e[0] - 2000)} ${f(e[1])}h${f(W * M + 4000)}v4000h${f(-W * M - 4000)}Z`);
      dutchGable(b.roof.covering, topMat, W, D, E, b.roof.pitch);
      mask(null);
      flush();
    } else {
      wallFace(topMat, [[0, D, E], [W, D, E], [W / 2, D, Hr]]);
      const fr = b.roof.overhang;
      const lv = Math.hypot(W / 2, Hr - E);
      slope(b.roof.covering, [[0, 0, E], [0, D + fr, E], [W / 2, D + fr, Hr], [W / 2, 0, Hr]], [0, D + fr, E], [0, -1, 0], norm3([1, 0, t]), D + fr, lv);
      slope(b.roof.covering, [[W, 0, E], [W, D + fr, E], [W / 2, D + fr, Hr], [W / 2, 0, Hr]], [W, D + fr, E], [0, -1, 0], norm3([-1, 0, t]), D + fr, lv);
      ridge(b.roof.covering, [W / 2, 0, Hr], [W / 2, D + fr, Hr]);
      layer();
      add({ fill: 'none', stroke: '#3a2a1c', sw: 2.4 }, line([P(0, D + fr, E), P(W / 2, D + fr, Hr), P(W, D + fr, E)]));
      add({ fill: 'none', stroke: '#8a6a48', sw: 1 }, line([P(0, D + fr, E), P(W / 2, D + fr, Hr), P(W, D + fr, E)]));
      flush();
      for (const g of b.gablets ?? []) {
        const gt = Math.tan((g.pitch * Math.PI) / 180);
        const xc = g.x + g.w / 2;
        const gH = g.eaves + (g.w / 2) * gt;
        wallFace(g.material, [[g.x, g.to, g.eaves], [g.x + g.w, g.to, g.eaves], [xc, g.to, gH]]);
        const o2 = 0.1;
        const zE = g.eaves - o2 * gt;
        const glv = Math.hypot(g.w / 2 + o2, gH - zE);
        const ylen = g.to + g.overhang - g.from;
        slope(g.covering, [[g.x - o2, g.from, zE], [g.x - o2, g.to + g.overhang, zE], [xc, g.to + g.overhang, gH], [xc, g.from, gH]], [g.x - o2, g.to + g.overhang, zE], [0, -1, 0], norm3([1, 0, gt]), ylen, glv);
        slope(g.covering, [[g.x + g.w + o2, g.from, zE], [g.x + g.w + o2, g.to + g.overhang, zE], [xc, g.to + g.overhang, gH], [xc, g.from, gH]], [g.x + g.w + o2, g.to + g.overhang, zE], [0, -1, 0], norm3([-1, 0, gt]), ylen, glv);
        ridge(g.covering, [xc, g.from, gH], [xc, g.to + g.overhang, gH]);
        layer();
        add({ fill: 'none', stroke: '#3a2a1c', sw: 2.2 }, line([P(g.x - o2, g.to + g.overhang, zE), P(xc, g.to + g.overhang, gH), P(g.x + g.w + o2, g.to + g.overhang, zE)]));
        add({ fill: 'none', stroke: '#8a6a48', sw: 0.9 }, line([P(g.x - o2, g.to + g.overhang, zE), P(xc, g.to + g.overhang, gH), P(g.x + g.w + o2, g.to + g.overhang, zE)]));
        flush();
      }
    }
    for (const c of b.chimneys) {
      const cx = c.x + c.w / 2;
      const zBase = E + Math.min(cx, W - cx) * t - 0.25;
      chimney(c.x, c.y, c.w, c.d, zBase, Math.max(Hr + c.aboveRidge, zBase + 1.2));
    }
    flush();
  }

  /** A shop's painted board, hung on the front between `z0` and `z1`. */
  function signOf(b, cellX, groundY, z0, z1) {
    const W = b.size.w;
    const D = b.size.d;
    at(cellX, groundY, D);
    const bw = Math.min(W - 0.4, 0.55 + b.sign.text.length * 0.2);
    const x0 = Math.max(0.15, Math.min(W - 0.15 - bw, b.sign.at - bw / 2));
    const a = P(x0, D + 0.05, z1);
    const c = P(x0 + bw, D + 0.05, z0);
    layer();
    add({ fill: '#1f3a2e' }, rect(a[0], a[1], c[0] - a[0], c[1] - a[1]));
    add({ fill: 'none', stroke: '#c9a24a', sw: 1.2 }, rect(a[0] + 2, a[1] + 2, c[0] - a[0] - 4, c[1] - a[1] - 4));
    add({ fill: 'none', stroke: OUT, sw: 1 }, rect(a[0], a[1], c[0] - a[0], c[1] - a[1]));
    flush();
    label((a[0] + c[0]) / 2, (a[1] + c[1]) / 2 + 4, b.sign.text, 11, 700, '#e8c56a', 'middle');
    return [a, c];
  }
  return {
    M, RISE, FORE, OUT,
    begin(s) {
      seed = s;
      items = [];
      labels.length = 0;
      clips.length = 0;
      masks.length = 0;
      pools = new Map();
      layerN = 0;
      clipId = null;
      maskNow = 'none';
      tfNow = 'none';
      ox = 0;
      oy = 0;
    },
    end() {
      flush();
      return { items, clips: clips.slice(), masks: masks.slice(), labels: labels.slice() };
    },
    setOrigin(x, y) {
      ox = x;
      oy = y;
    },
    P, add, layer, flush, rect, poly, line, clip, clipD, mask, tf, label, rnd, pick,
    face, topOf, floor, wallFace, slope, ridge, eave, chimney, box, ladder, leaf, surround, column,
    openingOn, windowOn, mullionOn, sashOn, shopOn, cottageWindowOn, timber, norm3,
    exteriorOf, exteriorEW, roofOf, signOf,
  };
}
