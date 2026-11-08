import { useEffect, useState } from 'react';
import { perfCommands, perfResultChannel, perfStatsChannel, type PerfResult, type PerfStats } from '../game/bridge';

/** Sections in display order; the indented ones are parts of "Scene update". */
const ROWS: { key: string; label: string; child?: boolean; hint: string }[] = [
  { key: 'update', label: 'Scene update', hint: 'Everything in the scene update: the rows below it plus input, hover, etc.' },
  { key: 'brains', label: 'Brains', child: true, hint: 'NPC decisions' },
  { key: 'movement', label: 'Movement', child: true, hint: 'Motors, routes, doors, poses (everyone)' },
  { key: 'separation', label: 'Bumping', child: true, hint: 'Keeping people apart (pairwise)' },
  { key: 'senses', label: 'Senses', child: true, hint: 'Sight, hearing, smell, memory (pairwise, 10 Hz)' },
  { key: 'ui', label: 'UI feed', child: true, hint: 'Building HUD / roster data' },
  { key: 'physics', label: 'Physics', hint: 'Arcade physics step: moving bodies, collisions with walls' },
  { key: 'draw', label: 'Drawing', hint: 'Rebuilding every figure, object and wall graphic' },
  { key: 'render', label: 'Render', hint: 'Phaser handing it to the GPU' },
];

const SPAWNS = [1, 10, 50, 100, 500];

function download(r: PerfResult) {
  const url = URL.createObjectURL(new Blob([r.csv], { type: 'text/csv' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = r.filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/** Frame-time graph: last ~120 frames, with 60 / 30 fps guide lines. */
function Graph({ frames }: { frames: number[] }) {
  const W = 240;
  const H = 48;
  const top = Math.max(40, ...frames);
  const y = (ms: number) => H - (Math.min(ms, top) / top) * H;
  const pts = frames.map((ms, i) => `${((i / Math.max(1, frames.length - 1)) * W).toFixed(1)},${y(ms).toFixed(1)}`).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="mt-2 h-12 w-full" preserveAspectRatio="none">
      {[16.7, 33.3].map((g) => (
        <line key={g} x1={0} x2={W} y1={y(g)} y2={y(g)} stroke="currentColor" strokeOpacity={0.2} strokeDasharray="3 3" vectorEffect="non-scaling-stroke" />
      ))}
      <polyline points={pts} fill="none" stroke="#fcd34d" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
    </svg>
  );
}

const fpsColour = (fps: number) => (fps >= 55 ? 'text-emerald-300' : fps >= 30 ? 'text-amber-300' : 'text-rose-400');

export function PerfHud() {
  const [stats, setStats] = useState<PerfStats | null>(null);
  const [result, setResult] = useState<PerfResult | null>(null);
  const [open, setOpen] = useState(true);
  const [custom, setCustom] = useState('200');

  useEffect(() => perfStatsChannel.on(setStats), []);
  useEffect(
    () =>
      perfResultChannel.on((r) => {
        setResult(r);
        download(r);
      }),
    [],
  );

  const s = stats;
  const testing = s?.testLeft != null;
  const maxSection = s ? Math.max(1, ...Object.values(s.sections)) : 1;

  return (
    <div
      className="pointer-events-auto fixed z-30 w-[min(20rem,calc(100vw-24px))] rounded-2xl bg-neutral-950/85 p-3 font-mono text-[11px] text-white/85 shadow-xl ring-1 ring-white/10 backdrop-blur-sm"
      style={{ top: 'max(12px, env(safe-area-inset-top))', left: 'max(12px, env(safe-area-inset-left))' }}
      onPointerDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between">
        <span className="font-sans text-sm font-semibold">Performance</span>
        <span className="text-white/50">
          {s ? `${s.people} people · ${s.renderer}` : '…'}
          <button className="ml-2 rounded px-1.5 hover:bg-white/10" onClick={() => setOpen(!open)} title={open ? 'Collapse' : 'Expand'}>
            {open ? '▴' : '▾'}
          </button>
        </span>
      </div>

      {s && (
        <div className="mt-2 grid grid-cols-4 gap-1 text-center">
          <div>
            <div className={`text-lg font-semibold ${fpsColour(s.fps)}`}>{s.fps.toFixed(0)}</div>
            <div className="text-white/45">FPS</div>
          </div>
          <div>
            <div className={`text-lg font-semibold ${fpsColour(s.low1Fps)}`}>{s.low1Fps.toFixed(0)}</div>
            <div className="text-white/45">1% low</div>
          </div>
          <div>
            <div className="text-lg font-semibold">{s.frameMs.toFixed(1)}</div>
            <div className="text-white/45">ms/frame</div>
          </div>
          <div>
            <div className="text-lg font-semibold">{s.ticksPerSec.toFixed(0)}</div>
            <div className="text-white/45">ticks/s</div>
          </div>
        </div>
      )}

      {open && s && (
        <>
          <Graph frames={s.recentFrameMs} />
          <div className="flex justify-between text-white/45">
            <span>worst {s.maxFrameMs.toFixed(1)} ms</span>
            <span>{s.heapMb === null ? 'heap n/a' : `heap ${s.heapMb.toFixed(0)} MB`}</span>
          </div>
          <div className="mt-2 space-y-0.5">
            {ROWS.map((r) => {
              const ms = s.sections[r.key] ?? 0;
              return (
                <div key={r.key} className="flex items-center gap-2" title={r.hint}>
                  <span className={`w-24 shrink-0 truncate ${r.child ? 'pl-3 text-white/60' : ''}`}>{r.label}</span>
                  <span className="h-1.5 flex-1 overflow-hidden rounded bg-white/10">
                    <span className={`block h-full rounded ${r.child ? 'bg-sky-400/60' : 'bg-sky-300'}`} style={{ width: `${(ms / maxSection) * 100}%` }} />
                  </span>
                  <span className="w-12 shrink-0 text-right tabular-nums">{ms.toFixed(2)}</span>
                </div>
              );
            })}
            <div className="text-right text-white/35">ms per frame, last second</div>
          </div>
        </>
      )}

      <div className="mt-3 font-sans">
        <div className="text-white/50">People: add, or set the total (you included)</div>
        <div className="mt-1 flex flex-wrap gap-1">
          {SPAWNS.map((n) => (
            <button key={n} className="rounded-full bg-white/10 px-2.5 py-1 hover:bg-white/20" onClick={() => perfCommands.emit({ kind: 'spawn', count: n })}>
              +{n}
            </button>
          ))}
        </div>
        <form
          className="mt-1 flex gap-1"
          onSubmit={(e) => {
            e.preventDefault();
            const n = Math.floor(Number(custom));
            if (n >= 1) perfCommands.emit({ kind: 'setPeople', total: Math.min(n, 5000) });
            // Hand the keyboard back to the game.
            (document.activeElement as HTMLElement | null)?.blur();
          }}
        >
          <input
            type="number"
            min={1}
            max={5000}
            aria-label="Total people"
            value={custom}
            onChange={(e) => setCustom(e.target.value)}
            className="w-20 rounded-full bg-white/10 px-2.5 py-1 text-white outline-none focus:ring-1 focus:ring-amber-300"
          />
          <button className="rounded-full bg-white/10 px-2.5 py-1 hover:bg-white/20" title="Set the total number of people (you included): adds or removes people to match">
            Set total
          </button>
          <a className="ml-auto rounded-full px-2.5 py-1 text-white/50 hover:bg-white/10" href="?scene=perf" title="Reload the scene with nobody but you">
            Reset
          </a>
        </form>

        <div className="mt-3 flex items-center gap-2">
          {testing ? (
            <>
              <span className="text-amber-300">Recording… {Math.ceil(s!.testLeft!)} s</span>
              <button className="ml-auto rounded-full bg-white/10 px-2.5 py-1 hover:bg-white/20" onClick={() => perfCommands.emit({ kind: 'cancelTest' })}>
                Cancel
              </button>
            </>
          ) : (
            <button
              className="rounded-full bg-amber-300 px-3 py-1 font-semibold text-neutral-900 hover:bg-amber-200"
              onClick={() => {
                setResult(null);
                perfCommands.emit({ kind: 'startTest' });
              }}
            >
              Run 30 s test → CSV
            </button>
          )}
        </div>
        {result && !testing && (
          <div className="mt-2 rounded-lg bg-white/5 p-2 font-mono">
            <div>
              {result.summary.people} people · {result.summary.frames} frames
            </div>
            <div>
              avg {result.summary.avgFps.toFixed(1)} fps · 1% low {result.summary.low1Fps.toFixed(1)}
            </div>
            <div>
              p95 {result.summary.p95FrameMs.toFixed(1)} ms · worst {result.summary.maxFrameMs.toFixed(1)} ms
            </div>
            <button className="mt-1 font-sans text-amber-300 underline" onClick={() => download(result)}>
              Download CSV again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
