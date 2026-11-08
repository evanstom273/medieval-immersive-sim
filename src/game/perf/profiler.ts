/**
 * Frame profiler for the performance test scene. Pure TypeScript (no Phaser).
 *
 * Sections are timed with begin/end (they can be entered many times a frame,
 * e.g. once per character; the times add up). At the end of each frame the
 * totals become a sample. While a test is recording, every sample is kept for
 * the CSV.
 */

export const SECTIONS = ['update', 'physics', 'brains', 'movement', 'separation', 'senses', 'ui', 'draw', 'render'] as const;
export type Section = (typeof SECTIONS)[number];

export interface Sample {
  /** ms since the test (or profiler) started. */
  t: number;
  /** Real time since the previous frame. */
  frameMs: number;
  /** World steps run this frame (more than 1 while waiting / sleeping). */
  ticks: number;
  people: number;
  /** MB of JS heap in use, where the browser reports it (Chrome); else null. */
  heapMb: number | null;
  ms: Record<Section, number>;
}

const zero = (): Record<Section, number> => Object.fromEntries(SECTIONS.map((s) => [s, 0])) as Record<Section, number>;

export class Profiler {
  enabled = false;
  private open: Partial<Record<Section, number>> = {};
  private cur = zero();
  private ticks = 0;
  /** Recent samples (rolling window for the HUD). */
  readonly recent: Sample[] = [];
  /** Everything since recording started (for the CSV). */
  recording: Sample[] | null = null;
  private recordStart = 0;
  private lastFrameAt: number | null = null;
  private readonly started: number;

  constructor(
    private readonly now: () => number = () => performance.now(),
    private readonly window = 240,
  ) {
    this.started = now();
  }

  begin(s: Section): void {
    if (this.enabled) this.open[s] = this.now();
  }

  end(s: Section): void {
    if (!this.enabled) return;
    const t0 = this.open[s];
    if (t0 === undefined) return;
    this.cur[s] += this.now() - t0;
    this.open[s] = undefined;
  }

  tick(): void {
    if (this.enabled) this.ticks++;
  }

  /** Close the frame: turn this frame's totals into a sample. */
  endFrame(people: number, heapMb: number | null): Sample | null {
    if (!this.enabled) return null;
    const now = this.now();
    const frameMs = this.lastFrameAt === null ? 0 : now - this.lastFrameAt;
    this.lastFrameAt = now;
    const s: Sample = { t: now - (this.recording ? this.recordStart : this.started), frameMs, ticks: this.ticks, people, heapMb, ms: this.cur };
    this.cur = zero();
    this.ticks = 0;
    if (frameMs > 0) {
      this.recent.push(s);
      if (this.recent.length > this.window) this.recent.shift();
      this.recording?.push(s);
    }
    return s;
  }

  startRecording(): void {
    this.recording = [];
    this.recordStart = this.now();
  }

  stopRecording(): Sample[] {
    const out = this.recording ?? [];
    this.recording = null;
    return out;
  }
}

export interface Summary {
  frames: number;
  seconds: number;
  avgFps: number;
  /** Average fps over the slowest 1% of frames. */
  low1Fps: number;
  avgFrameMs: number;
  p95FrameMs: number;
  maxFrameMs: number;
  ticksPerSec: number;
  avgMs: Record<Section, number>;
  people: number;
}

export function summarise(samples: readonly Sample[]): Summary | null {
  const xs = samples.filter((s) => s.frameMs > 0);
  if (xs.length === 0) return null;
  const total = xs.reduce((a, s) => a + s.frameMs, 0);
  const sorted = xs.map((s) => s.frameMs).sort((a, b) => a - b);
  const worst = sorted.slice(Math.floor(sorted.length * 0.99));
  const worstAvg = worst.reduce((a, v) => a + v, 0) / worst.length;
  const avgMs = zero();
  for (const s of xs) for (const k of SECTIONS) avgMs[k] += s.ms[k] / xs.length;
  return {
    frames: xs.length,
    seconds: total / 1000,
    avgFps: (xs.length * 1000) / total,
    low1Fps: 1000 / worstAvg,
    avgFrameMs: total / xs.length,
    p95FrameMs: sorted[Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95))],
    maxFrameMs: sorted[sorted.length - 1],
    ticksPerSec: (xs.reduce((a, s) => a + s.ticks, 0) * 1000) / total,
    avgMs,
    people: xs[xs.length - 1].people,
  };
}

/** One row per frame. Times in ms, to 3 decimal places. */
export function toCsv(samples: readonly Sample[], meta: Record<string, string | number> = {}): string {
  const head = ['frame', 't_ms', 'frame_ms', 'fps', 'ticks', 'people', 'heap_mb', ...SECTIONS.map((s) => `${s}_ms`)];
  const rows = samples
    .filter((s) => s.frameMs > 0)
    .map((s, i) => [i, s.t.toFixed(1), s.frameMs.toFixed(3), (1000 / s.frameMs).toFixed(1), s.ticks, s.people, s.heapMb === null ? '' : s.heapMb.toFixed(1), ...SECTIONS.map((k) => s.ms[k].toFixed(3))].join(','));
  // Metadata as leading comment lines (spreadsheets show them as text rows; most CSV readers can skip '#').
  const metaLines = Object.entries(meta).map(([k, v]) => `# ${k}: ${String(v).replace(/[\r\n]/g, ' ')}`);
  return [...metaLines, head.join(','), ...rows].join('\n') + '\n';
}

/** Shared profiler (the scenes time their own sections into it when it's enabled). */
export const profiler = new Profiler();
