import { describe, expect, it } from 'vitest';
import { compileExpressions } from '../math/compile';
import { findPointsOfInterest, type PoiCurve } from './poi';
import { DEFAULT_VIEWPORT, getBounds } from './viewport';

const size = { width: 1000, height: 600 };
const bounds = getBounds(DEFAULT_VIEWPORT, size); // x ∈ [-10, 10], y ∈ [-6, 6]

function curves(...texts: string[]): PoiCurve[] {
  const rows = compileExpressions(texts.map((text, i) => ({ id: `c${i}`, text })));
  return texts.map((_, i) => {
    const r = rows[`c${i}`];
    if (r.kind !== 'curve') throw new Error(texts[i]);
    return { id: `c${i}`, fn: r.fn };
  });
}

const ofKind = (points: ReturnType<typeof findPointsOfInterest>, kind: string) =>
  points.filter((p) => p.kind === kind).sort((a, b) => a.x - b.x);

describe('findPointsOfInterest', () => {
  it('finds roots and the y-intercept of a polynomial to full precision', () => {
    const points = findPointsOfInterest(curves('x^2 - 2'), bounds, size);
    const roots = ofKind(points, 'x-intercept');
    expect(roots.map((p) => p.x)).toHaveLength(2);
    expect(roots[0].x).toBeCloseTo(-Math.SQRT2, 14);
    expect(roots[1].x).toBeCloseTo(Math.SQRT2, 14);
    expect(ofKind(points, 'y-intercept')).toEqual([
      { key: 'yint:c0', kind: 'y-intercept', x: 0, y: -2, curveIds: ['c0'] },
    ]);
  });

  it('finds touching (double) roots', () => {
    const roots = ofKind(findPointsOfInterest(curves('(x - 1)^2'), bounds, size), 'x-intercept');
    expect(roots).toHaveLength(1);
    expect(roots[0].x).toBeCloseTo(1, 7);
  });

  it('finds curve-curve intersections', () => {
    const points = findPointsOfInterest(curves('x^2', 'x + 2'), bounds, size);
    const hits = ofKind(points, 'intersection');
    expect(hits.map((p) => [p.x, p.y])).toEqual([
      [expect.closeTo(-1, 12), expect.closeTo(1, 12)],
      [expect.closeTo(2, 12), expect.closeTo(4, 12)],
    ]);
  });

  it('does not report poles or jumps as roots', () => {
    expect(ofKind(findPointsOfInterest(curves('1/x'), bounds, size), 'x-intercept')).toHaveLength(0);
    expect(ofKind(findPointsOfInterest(curves('tan(x)'), bounds, size), 'x-intercept')).toHaveLength(7); // 0, ±π, ±2π, ±3π
    expect(ofKind(findPointsOfInterest(curves('floor(x) - 0.5'), bounds, size), 'x-intercept')).toHaveLength(0);
  });

  it('handles undefined regions', () => {
    const points = findPointsOfInterest(curves('sqrt(x) - 1', 'ln(x)'), bounds, size);
    expect(ofKind(points, 'x-intercept').map((p) => p.x)).toEqual([expect.closeTo(1, 12)]);
    // ln(0) is undefined, so only sqrt(0) − 1 = −1 counts.
    expect(ofKind(points, 'y-intercept').map((p) => [p.curveIds[0], p.y])).toEqual([['c0', -1]]);
  });

  it('suppresses clutter from dense sources', () => {
    const zoomedOut = getBounds({ cx: 0, cy: 0, scale: 0.5 }, size); // x ∈ [-1000, 1000]
    expect(ofKind(findPointsOfInterest(curves('sin(x)'), zoomedOut, size), 'x-intercept')).toHaveLength(0);
    // Identical curves intersect everywhere: report nothing rather than noise.
    expect(ofKind(findPointsOfInterest(curves('x^2', 'x*x'), bounds, size), 'intersection')).toHaveLength(0);
  });

  it('only reports points inside the viewport', () => {
    const points = findPointsOfInterest(curves('x + 100'), bounds, size);
    expect(points).toHaveLength(0);
  });
});
