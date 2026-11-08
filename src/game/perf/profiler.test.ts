import { describe, expect, it } from 'vitest';
import { Profiler, summarise, toCsv } from './profiler';

function fakeClock() {
  let t = 0;
  return { now: () => t, advance: (ms: number) => (t += ms) };
}

describe('Profiler', () => {
  it('adds up a section entered several times in a frame', () => {
    const c = fakeClock();
    const p = new Profiler(c.now);
    p.enabled = true;
    p.endFrame(1, null);
    for (let i = 0; i < 3; i++) {
      p.begin('brains');
      c.advance(2);
      p.end('brains');
    }
    c.advance(10);
    const s = p.endFrame(5, null)!;
    expect(s.ms.brains).toBe(6);
    expect(s.frameMs).toBe(16);
    expect(s.people).toBe(5);
  });

  it('records only while recording, and summarises', () => {
    const c = fakeClock();
    const p = new Profiler(c.now);
    p.enabled = true;
    p.endFrame(1, null);
    p.startRecording();
    for (let i = 0; i < 100; i++) {
      c.advance(i === 99 ? 50 : 10);
      p.tick();
      p.endFrame(1, null);
    }
    const rec = p.stopRecording();
    expect(rec).toHaveLength(100);
    const sum = summarise(rec)!;
    expect(sum.maxFrameMs).toBe(50);
    expect(sum.low1Fps).toBeCloseTo(20);
    expect(sum.ticksPerSec).toBeCloseTo(100 / (99 * 0.01 + 0.05));
  });

  it('writes a CSV with a header and one row per frame', () => {
    const c = fakeClock();
    const p = new Profiler(c.now);
    p.enabled = true;
    p.endFrame(1, null);
    p.startRecording();
    c.advance(16);
    p.endFrame(3, 12.5);
    const csv = toCsv(p.stopRecording(), { people: 3 });
    const lines = csv.trim().split('\n');
    expect(lines[0]).toBe('# people: 3');
    expect(lines[1].startsWith('frame,t_ms,frame_ms,fps,ticks,people,full_detail,heap_mb,update_ms')).toBe(true);
    expect(lines[2].split(',').slice(0, 8)).toEqual(['0', '16.0', '16.000', '62.5', '0', '3', '3', '12.5']);
  });
});
