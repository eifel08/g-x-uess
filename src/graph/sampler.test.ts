import { describe, expect, it } from 'vitest';
import { compileExpressions } from '../math/compile';
import { sampleCurve, type Polyline } from './sampler';
import { DEFAULT_VIEWPORT, getBounds } from './viewport';

const size = { width: 1000, height: 600 };
const bounds = getBounds(DEFAULT_VIEWPORT, size); // x ∈ [-10, 10], y ∈ [-6, 6]

function fnOf(text: string) {
  const r = compileExpressions([{ id: 'a', text }]).a;
  if (r.kind !== 'curve') throw new Error(text);
  return r.fn;
}

/** Longest vertical extent of any single segment that is inside the screen. */
function maxOnscreenVerticalSegment(lines: Polyline[]) {
  let max = 0;
  for (const line of lines) {
    for (let i = 2; i < line.length; i += 2) {
      const y0 = line[i - 1];
      const y1 = line[i + 1];
      const top = Math.max(0, Math.min(y0, y1));
      const bottom = Math.min(size.height, Math.max(y0, y1));
      max = Math.max(max, bottom - top);
    }
  }
  return max;
}

describe('sampleCurve', () => {
  it('draws a continuous function as a single polyline', () => {
    const lines = sampleCurve(fnOf('sin(x)'), bounds, size);
    expect(lines).toHaveLength(1);
  });

  it('breaks at the pole of 1/x without a vertical connector', () => {
    const lines = sampleCurve(fnOf('1/x'), bounds, size);
    expect(lines).toHaveLength(2);
    // Each branch hugs the asymptote but nothing jumps across the screen.
    for (const line of lines) {
      const ys = line.filter((_, i) => i % 2 === 1);
      const goesUp = Math.min(...ys) < 0;
      const goesDown = Math.max(...ys) > size.height;
      expect(goesUp && goesDown).toBe(false);
    }
  });

  it('breaks tan(x) into one branch per period', () => {
    const lines = sampleCurve(fnOf('tan(x)'), bounds, size);
    // Poles at ±π/2, ±3π/2, ±5π/2 inside [-10, 10] → 6 poles → 7 branches.
    expect(lines).toHaveLength(7);
    for (const line of lines) {
      const ys = line.filter((_, i) => i % 2 === 1);
      expect(ys[0] > ys[ys.length - 1]).toBe(true); // each branch is increasing (y-down pixels)
    }
  });

  it('does not connect the steps of floor(x)', () => {
    const lines = sampleCurve(fnOf('floor(x)'), bounds, size);
    expect(lines.length).toBeGreaterThanOrEqual(13); // one per visible step
    expect(maxOnscreenVerticalSegment(lines)).toBeLessThan(2);
  });

  it('stops cleanly at a domain edge', () => {
    const lines = sampleCurve(fnOf('sqrt(x)'), bounds, size);
    expect(lines).toHaveLength(1);
    // Starts within a fraction of a pixel of x = 0 (pixel 500).
    expect(Math.abs(lines[0][0] - 500)).toBeLessThan(0.05);
  });

  it('extends ln(x) down to -infinity at the domain edge', () => {
    const lines = sampleCurve(fnOf('ln(x)'), bounds, size);
    expect(lines).toHaveLength(1);
    expect(lines[0][1]).toBeGreaterThan(size.height);
  });

  it('draws nothing for a nowhere-defined function', () => {
    expect(sampleCurve(fnOf('sqrt(-1 - x^2)'), bounds, size)).toHaveLength(0);
  });

  it('stays within the evaluation budget on pathological input', () => {
    let calls = 0;
    const f = fnOf('sin(1/x)');
    sampleCurve((x) => (calls++, f(x)), bounds, size, { maxEvals: 20_000 });
    expect(calls).toBeLessThan(25_000);
  });
});
