import { describe, expect, it } from 'vitest';
import { CameraRig } from './CameraRig';

describe('CameraRig', () => {
  it('clamps zoom to the enabled layers', () => {
    const rig = new CameraRig();
    expect(rig.zoomBy(1e6)).toBe(true);
    expect(rig.targetSpan).toBe(rig.limits.max);
    rig.span = rig.targetSpan;
    expect(rig.layer).toBe('overview');
    expect(rig.villageMix).toBe(1);
    expect(rig.zoomBy(0.0001)).toBe(true);
    expect(rig.targetSpan).toBe(rig.limits.min);
  });

  it('smooths toward the target', () => {
    const rig = new CameraRig();
    rig.zoomBy(2);
    rig.update(1 / 60);
    expect(rig.span).toBeGreaterThan(8);
    expect(rig.span).toBeLessThan(16);
    for (let i = 0; i < 120; i++) rig.update(1 / 60);
    expect(rig.span).toBeCloseTo(16);
  });

  it('shows a similar amount of world on differently shaped screens', () => {
    const rig = new CameraRig();
    const phone = rig.rendererZoom(412 * 2.6, 915 * 2.6, 64) / 2.6;
    const fold = rig.rendererZoom(860 * 2.6, 880 * 2.6, 64) / 2.6;
    // Area visible (m²) should match regardless of shape.
    const area = (w: number, h: number, z: number) => (w / (z * 64)) * (h / (z * 64));
    expect(area(412, 915, phone)).toBeCloseTo(area(860, 880, fold));
  });
});
