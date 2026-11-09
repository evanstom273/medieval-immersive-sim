import { useEffect, useRef, useState } from 'react';
import { mapChannel, uiCommands, waypointChannel, type WaypointScreen } from '../game/bridge';
import type { MapFeature, MapState } from '../game/map/worldMap';

/**
 * The world map: a drawn plan on parchment. Tap anywhere to set a waypoint there, either one you walk
 * to yourself or auto-walk (time runs fast until you arrive). M or the Map button opens and closes it.
 */

const INK = '#3b2a1a';
const INK_SOFT = '#6b5236';
const PAPER = '#e9dcb8';

export function WorldMap() {
  const [map, setMap] = useState<MapState | null>(() => mapChannel.last ?? null);
  const [pick, setPick] = useState<{ x: number; y: number } | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  useEffect(() => mapChannel.on(setMap), []);
  useEffect(() => {
    if (!map) setPick(null);
  }, [map]);
  if (!map) return null;

  const close = () => uiCommands.emit({ kind: 'map', open: false });
  const pad = 2;
  const vb = `${-pad} ${-pad} ${map.w + pad * 2} ${map.h + pad * 2}`;
  const label = Math.max(map.w, map.h) / 70;

  const onTap = (e: React.PointerEvent<SVGSVGElement>) => {
    const el = svg.current;
    const m = el?.getScreenCTM();
    if (!el || !m) return;
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(m.inverse());
    if (p.x < 0 || p.y < 0 || p.x > map.w || p.y > map.h) return;
    setPick({ x: p.x, y: p.y });
  };

  return (
    <div
      className="absolute inset-0 z-30 flex items-center justify-center bg-black/55 p-3 backdrop-blur-[2px]"
      onPointerDown={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div className="relative flex max-h-full w-full max-w-5xl flex-col rounded-md shadow-2xl ring-1 ring-black/40" style={{ background: PAPER }}>
        <div className="flex items-center justify-between px-4 pt-3 pb-1" style={{ color: INK, fontFamily: 'Georgia, serif' }}>
          <span className="text-lg italic">Map</span>
          <div className="flex items-center gap-2">
            {map.waypoint && (
              <button className="rounded-full px-3 py-1 text-sm ring-1" style={{ borderColor: INK_SOFT, color: INK }} onClick={() => uiCommands.emit({ kind: 'clearWaypoint' })}>
                Clear waypoint
              </button>
            )}
            <button className="rounded-full px-3 py-1 text-sm ring-1" style={{ color: INK }} onClick={close} aria-label="Close map" title="Close (M)">
              ✕
            </button>
          </div>
        </div>
        <div className="relative min-h-0 flex-1 px-3 pb-3">
          <svg ref={svg} viewBox={vb} className="h-full max-h-[calc(100vh-7rem)] w-full touch-none select-none" preserveAspectRatio="xMidYMid meet" onPointerDown={onTap}>
            <defs>
              <filter id="paper" x="0" y="0" width="100%" height="100%">
                <feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="3" seed="7" result="n" />
                <feColorMatrix in="n" type="matrix" values="0 0 0 0 0.42  0 0 0 0 0.32  0 0 0 0 0.18  0 0 0 0.16 0" />
              </filter>
              <radialGradient id="age" cx="0.5" cy="0.5" r="0.75">
                <stop offset="0.6" stopColor="#000" stopOpacity="0" />
                <stop offset="1" stopColor="#5a3a18" stopOpacity="0.35" />
              </radialGradient>
              <pattern id="hatch" width="0.6" height="0.6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                <line x1="0" y1="0" x2="0" y2="0.6" stroke={INK_SOFT} strokeWidth="0.12" />
              </pattern>
            </defs>
            {/* The sheet: paper grain, darkened with age at the edges, ruled in a double border. */}
            <rect x={-pad} y={-pad} width={map.w + pad * 2} height={map.h + pad * 2} fill={PAPER} />
            <rect x={-pad} y={-pad} width={map.w + pad * 2} height={map.h + pad * 2} filter="url(#paper)" />
            <rect x={-pad} y={-pad} width={map.w + pad * 2} height={map.h + pad * 2} fill="url(#age)" />
            <rect x={-0.8} y={-0.8} width={map.w + 1.6} height={map.h + 1.6} fill="none" stroke={INK} strokeWidth={0.35} />
            <rect x={-0.2} y={-0.2} width={map.w + 0.4} height={map.h + 0.4} fill="none" stroke={INK} strokeWidth={0.12} />

            {map.features.map((f, i) => (
              <Feature key={i} f={f} label={label} />
            ))}

            {map.people.map((p, i) =>
              p.you ? (
                <g key={i}>
                  <circle cx={p.x} cy={p.y} r={label * 0.9} fill="none" stroke="#a8261c" strokeWidth={0.25} />
                  <circle cx={p.x} cy={p.y} r={label * 0.45} fill="#a8261c" stroke={INK} strokeWidth={0.12} />
                  <text x={p.x} y={p.y - label * 1.3} textAnchor="middle" fontSize={label * 0.9} fontFamily="Georgia, serif" fontStyle="italic" fill="#7a1a12">
                    You
                  </text>
                </g>
              ) : (
                <circle key={i} cx={p.x} cy={p.y} r={label * 0.3} fill={INK_SOFT} opacity={0.75}>
                  <title>{p.name}</title>
                </circle>
              ),
            )}

            {map.waypoint && <Pin x={map.waypoint.x} y={map.waypoint.y} size={label} auto={map.waypoint.auto} />}
            {pick && <circle cx={pick.x} cy={pick.y} r={label * 0.5} fill="none" stroke={INK} strokeWidth={0.2} strokeDasharray="0.4 0.3" />}

            <Compass x={map.w - label * 4} y={label * 4} s={label * 2.6} />
            <ScaleBar x={label * 2} y={map.h - label * 2} unit={label} />
          </svg>

          {pick && (
            <div className="absolute inset-x-0 bottom-6 flex justify-center">
              <div className="flex flex-wrap items-center justify-center gap-2 rounded-full px-2 py-1.5 shadow-lg ring-1 ring-black/30" style={{ background: '#f4ead0', color: INK, fontFamily: 'Georgia, serif' }}>
                <button
                  className="rounded-full px-3 py-1.5 text-sm text-white"
                  style={{ background: '#a8261c' }}
                  onClick={() => {
                    uiCommands.emit({ kind: 'waypoint', x: pick.x, y: pick.y, auto: false });
                    setPick(null);
                  }}
                >
                  Set waypoint
                </button>
                <button
                  className="rounded-full px-3 py-1.5 text-sm text-white"
                  style={{ background: '#2f5f8f' }}
                  onClick={() => {
                    uiCommands.emit({ kind: 'waypoint', x: pick.x, y: pick.y, auto: true });
                    setPick(null);
                  }}
                >
                  Auto-walk here
                </button>
                <button className="rounded-full px-3 py-1.5 text-sm" onClick={() => setPick(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Feature({ f, label }: { f: MapFeature; label: number }) {
  const text = (x: number, y: number, s: string, size = label) => (
    <text x={x} y={y} textAnchor="middle" dominantBaseline="middle" fontSize={size} fontFamily="Georgia, serif" fontStyle="italic" fill={INK}>
      {s}
    </text>
  );
  switch (f.kind) {
    case 'building':
      return (
        <g>
          <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="#c7a46e" stroke={INK} strokeWidth={0.25} />
          <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="url(#hatch)" opacity={0.6} />
          {text(f.x + f.w / 2, f.y + f.h / 2, f.name, Math.min(label, (f.w / Math.max(4, f.name.length)) * 1.7))}
        </g>
      );
    case 'paving':
      return <rect x={f.x} y={f.y} width={f.w} height={f.h} fill="#d6c7a2" stroke={INK_SOFT} strokeWidth={0.1} strokeDasharray="0.5 0.3" />;
    case 'wall':
      return <rect x={f.x} y={f.y} width={f.w} height={f.h} fill={INK_SOFT} />;
    case 'well':
      return (
        <g>
          <circle cx={f.x} cy={f.y} r={f.r} fill="#9db3bf" stroke={INK} strokeWidth={0.2} />
          {text(f.x, f.y + f.r + label * 0.9, f.name, label * 0.8)}
        </g>
      );
    case 'fire':
      return (
        <g>
          <path d={`M${f.x} ${f.y - 0.9}q0.7 0.6 0.5 1.2q-0.5 0.4 -1 0q-0.2 -0.6 0.5 -1.2z`} fill="#c0501e" stroke={INK} strokeWidth={0.1} />
          {text(f.x, f.y + label * 0.9, f.name, label * 0.8)}
        </g>
      );
    case 'midden':
      return (
        <g>
          <ellipse cx={f.x} cy={f.y} rx={f.r} ry={f.r * 0.7} fill="#7a5a34" opacity={0.7} stroke={INK} strokeWidth={0.1} />
          {text(f.x, f.y + f.r + label * 0.8, f.name, label * 0.8)}
        </g>
      );
    case 'dummy':
      return (
        <g stroke={INK} strokeWidth={0.2}>
          <line x1={f.x - 0.4} y1={f.y - 0.4} x2={f.x + 0.4} y2={f.y + 0.4} />
          <line x1={f.x + 0.4} y1={f.y - 0.4} x2={f.x - 0.4} y2={f.y + 0.4} />
        </g>
      );
  }
}

function Pin({ x, y, size, auto }: { x: number; y: number; size: number; auto: boolean }) {
  const s = size;
  return (
    <g>
      <line x1={x} y1={y} x2={x} y2={y - s * 2.4} stroke={INK} strokeWidth={0.22} />
      <path d={`M${x} ${y - s * 2.4}l${s * 1.6} ${s * 0.55}l${-s * 1.6} ${s * 0.55}z`} fill={auto ? '#2f5f8f' : '#a8261c'} stroke={INK} strokeWidth={0.12} />
      <circle cx={x} cy={y} r={s * 0.25} fill={INK} />
    </g>
  );
}

function Compass({ x, y, s }: { x: number; y: number; s: number }) {
  return (
    <g transform={`translate(${x} ${y})`} stroke={INK} strokeWidth={s * 0.03}>
      <circle r={s} fill="none" />
      <path d={`M0 ${-s}L${s * 0.18} 0L0 ${s}L${-s * 0.18} 0Z`} fill={INK} />
      <path d={`M${-s} 0L0 ${s * 0.18}L${s} 0L0 ${-s * 0.18}Z`} fill={PAPER} />
      <text y={-s * 1.25} textAnchor="middle" fontSize={s * 0.5} fontFamily="Georgia, serif" fill={INK} stroke="none">
        N
      </text>
    </g>
  );
}

function ScaleBar({ x, y, unit }: { x: number; y: number; unit: number }) {
  const len = 10;
  return (
    <g stroke={INK} strokeWidth={0.15}>
      <line x1={x} y1={y} x2={x + len} y2={y} />
      <line x1={x} y1={y - 0.4} x2={x} y2={y + 0.4} />
      <line x1={x + len / 2} y1={y - 0.3} x2={x + len / 2} y2={y + 0.3} />
      <line x1={x + len} y1={y - 0.4} x2={x + len} y2={y + 0.4} />
      <text x={x + len / 2} y={y - unit * 0.7} textAnchor="middle" fontSize={unit * 0.8} fontFamily="Georgia, serif" fontStyle="italic" fill={INK} stroke="none">
        10 metres
      </text>
    </g>
  );
}

/** When the waypoint is off screen: an arrow at the edge pointing to it, with how far. */
export function WaypointArrow() {
  const [w, setW] = useState<WaypointScreen | null>(() => waypointChannel.last ?? null);
  useEffect(() => waypointChannel.on(setW), []);
  if (!w) return null;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const margin = 40;
  const bottomBar = 90;
  const on = w.x > margin && w.x < vw - margin && w.y > margin && w.y < vh - bottomBar;
  if (on) return null;
  const cx = vw / 2;
  const cy = (vh - bottomBar) / 2;
  const dx = w.x - cx;
  const dy = w.y - cy;
  // Clamp to the edge of the safe rectangle along the line from the centre.
  const sx = (vw / 2 - margin) / Math.abs(dx || 1e-6);
  const sy = ((vh - bottomBar) / 2 - margin) / Math.abs(dy || 1e-6);
  const k = Math.min(sx, sy);
  const ax = cx + dx * k;
  const ay = cy + dy * k;
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return (
    <div className="pointer-events-none absolute" style={{ left: ax, top: ay, transform: 'translate(-50%, -50%)' }}>
      <div className="flex flex-col items-center gap-0.5">
        <svg width="30" height="30" viewBox="-15 -15 30 30" style={{ transform: `rotate(${deg}deg)` }}>
          <path d="M12 0L-8 -9L-4 0L-8 9Z" fill={w.auto ? '#3f7fbf' : '#c0392b'} stroke="#1c140c" strokeWidth="1.5" strokeLinejoin="round" />
        </svg>
        <span className="rounded-full bg-neutral-900/75 px-1.5 text-[11px] text-white">{Math.round(w.metres)} m</span>
      </div>
    </div>
  );
}
