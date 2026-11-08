/**
 * Camera rig: one continuous zoom across the whole game.
 *
 * Zoom is expressed as a *view span*, the number of metres visible across the
 * screen's "average side" (the square root of its area). That keeps a phone in
 * portrait, a desktop monitor and a near-square foldable showing a similar
 * amount of world at the same zoom.
 *
 * The span runs through bands. Today only the direct-control band exists. The
 * strategic overview will be a further band beyond it, so zooming out keeps
 * going instead of switching screens. Band thresholds are PLACEHOLDERS; the
 * real values and transition mechanics are still open (see DESIGN_LOG.md).
 *
 * Pure TypeScript, no Phaser.
 */

export type ViewLayer = 'direct' | 'overview';

export interface ZoomBand {
  layer: ViewLayer;
  /** Closest zoom in this band (metres across). */
  minSpan: number;
  /** Furthest zoom in this band (metres across). */
  maxSpan: number;
}

export interface CameraRigConfig {
  bands: ZoomBand[];
  /** Which layers are actually available yet. Zoom is clamped to these. */
  enabledLayers: ViewLayer[];
  /** Starting span, metres. */
  initialSpan: number;
  /** How quickly the actual zoom catches up with the target (per second, exponential). */
  smoothing: number;
}

export const DEFAULT_CAMERA_CONFIG: CameraRigConfig = {
  bands: [
    { layer: 'direct', minSpan: 4, maxSpan: 22 },
    // Placeholder: the overview would take over beyond the direct band. Not built yet.
    { layer: 'overview', minSpan: 22, maxSpan: 4000 },
  ],
  enabledLayers: ['direct'],
  initialSpan: 8,
  smoothing: 14,
};

export class CameraRig {
  /** Current (smoothed) span in metres. */
  span: number;
  /** Where the zoom is heading. */
  targetSpan: number;

  constructor(readonly config: CameraRigConfig = DEFAULT_CAMERA_CONFIG) {
    this.span = config.initialSpan;
    this.targetSpan = config.initialSpan;
  }

  /** The zoom range currently reachable, given which layers exist. */
  get limits(): { min: number; max: number } {
    const usable = this.config.bands.filter((b) => this.config.enabledLayers.includes(b.layer));
    return {
      min: Math.min(...usable.map((b) => b.minSpan)),
      max: Math.max(...usable.map((b) => b.maxSpan)),
    };
  }

  /** Multiply the target span (factor > 1 zooms out). Returns true if it hit a limit. */
  zoomBy(factor: number): boolean {
    const { min, max } = this.limits;
    const wanted = this.targetSpan * factor;
    this.targetSpan = Math.min(max, Math.max(min, wanted));
    return wanted > max || wanted < min;
  }

  /** Advance smoothing. Interpolates in log space so zoom speed feels even at every scale. */
  update(dt: number): void {
    const k = 1 - Math.exp(-this.config.smoothing * dt);
    const a = Math.log(this.span);
    const b = Math.log(this.targetSpan);
    this.span = Math.exp(a + (b - a) * k);
    if (Math.abs(this.span - this.targetSpan) < 1e-4) this.span = this.targetSpan;
  }

  /** Which layer the current span is in. */
  get layer(): ViewLayer {
    for (const b of this.config.bands) if (this.span >= b.minSpan && this.span <= b.maxSpan) return b.layer;
    return this.config.bands[this.config.bands.length - 1].layer;
  }

  /**
   * 0 at the closest zoom of the direct band, 1 at its furthest. Intended for
   * future cross-fades into the overview (e.g. fading in map labels near 1).
   */
  get directBandProgress(): number {
    const d = this.config.bands.find((b) => b.layer === 'direct')!;
    return Math.min(1, Math.max(0, Math.log(this.span / d.minSpan) / Math.log(d.maxSpan / d.minSpan)));
  }

  /**
   * Camera zoom factor for a renderer whose world unit is `pxPerMetre` and whose
   * viewport is `widthPx` × `heightPx` device pixels.
   */
  rendererZoom(widthPx: number, heightPx: number, pxPerMetre: number): number {
    const side = Math.sqrt(widthPx * heightPx);
    return side / (this.span * pxPerMetre);
  }
}
