import { describe, expect, it } from 'vitest';
import { compileExpressions } from '../math/compile';
import { satisfies, type RowResult } from '../math/types';
import { circleGeometry, projectOntoCircle } from './circle';
import { traceImplicit } from './implicit';
import { preparePlot, type GraphPlot } from './plots';
import { DEFAULT_VIEWPORT, getBounds, toWorldX, toWorldY } from './viewport';

const size = { width: 1000, height: 600 };
const view = DEFAULT_VIEWPORT; // 50 px per unit, x ∈ [-10, 10], y ∈ [-6, 6]
const bounds = getBounds(view, size);
const wx = (px: number) => toWorldX(view, size, px);
const wy = (py: number) => toWorldY(view, size, py);

function plotOf(text: string): GraphPlot {
  const r: RowResult = compileExpressions([{ id: 'a', text }]).a;
  const common = { id: 'a', color: '#000' };
  if (r.kind === 'curve') return { ...common, type: 'function', fn: r.fn, inequality: r.inequality };
  if (r.kind === 'vline') return { ...common, type: 'vline', x: r.x, inequality: r.inequality };
  if (r.kind === 'implicit') return { ...common, type: 'implicit', F: r.F, circle: r.circle, inequality: r.inequality };
  throw new Error(JSON.stringify(r));
}

/** Area (px²) of a polygon by the shoelace formula. */
function area(poly: number[]) {
  let a = 0;
  for (let i = 0; i < poly.length; i += 2) {
    const j = (i + 2) % poly.length;
    a += poly[i] * poly[j + 1] - poly[j] * poly[i + 1];
  }
  return Math.abs(a) / 2;
}
const totalArea = (polys: number[][]) => polys.reduce((s, p) => s + area(p), 0);

describe('vertical lines', () => {
  it('span the full height at the right x', () => {
    const p = preparePlot(plotOf('x = 3'), bounds, size);
    expect(p.lines).toHaveLength(1);
    const [x0, y0, x1, y1] = p.lines[0];
    expect(x0).toBe(650);
    expect(x1).toBe(650);
    expect(y0).toBeLessThan(0);
    expect(y1).toBeGreaterThan(600);
    expect(p.fills).toHaveLength(0);
  });

  it('shade half-planes with dashed or solid boundaries', () => {
    const strict = preparePlot(plotOf('x > 2'), bounds, size);
    expect(strict.dashed).toBe(true);
    expect(strict.fills[0][0]).toBe(600); // from x = 2 to the right edge
    const solid = preparePlot(plotOf('x <= 2'), bounds, size);
    expect(solid.dashed).toBe(false);
    expect(solid.fills[0][2]).toBe(600);
    // Off-screen line, everything shaded / nothing shaded.
    expect(preparePlot(plotOf('x > -100'), bounds, size).fills).toHaveLength(1);
    expect(preparePlot(plotOf('x > 100'), bounds, size).fills).toHaveLength(0);
  });
});

describe('function inequalities', () => {
  it('shade below for <, above for >', () => {
    const below = preparePlot(plotOf('y < 0'), bounds, size);
    expect(below.dashed).toBe(true);
    // Half the view (plus a few px of padding past the edges).
    expect(Math.abs(totalArea(below.fills) - 1000 * 300) / (1000 * 300)).toBeLessThan(0.03);
    const above = preparePlot(plotOf('y >= x'), bounds, size);
    expect(above.dashed).toBe(false);
    const ys = above.fills[0].filter((_, i) => i % 2 === 1);
    expect(Math.min(...ys)).toBeLessThan(0); // closes along the top edge
  });

  it('skips shading where the boundary is undefined', () => {
    const p = preparePlot(plotOf('y > sqrt(x)'), bounds, size);
    const xs = p.fills.flat().filter((_, i) => i % 2 === 0);
    expect(Math.min(...xs)).toBeGreaterThan(499); // nothing left of x = 0
  });
});

describe('circles', () => {
  it('lie exactly on the circle', () => {
    const c = { cx: 1, cy: -2, r: 3 };
    const geo = circleGeometry(c, bounds, size);
    expect(geo.view).toBe('crosses');
    const pts = geo.boundary!;
    for (let i = 0; i < pts.length; i += 2) {
      expect(Math.hypot(wx(pts[i]) - 1, wy(pts[i + 1]) + 2)).toBeCloseTo(3, 10);
    }
    expect(pts.slice(-2)).toEqual(pts.slice(0, 2).map((v) => expect.closeTo(v, 9))); // closed
  });

  it('stay exact and cheap when zoomed far in on a huge circle', () => {
    const r = 1e6;
    const c = { cx: 0, cy: -r, r }; // passes through the origin
    const zoomed = { cx: 0, cy: 0, scale: 1e5 };
    const zb = getBounds(zoomed, size);
    const geo = circleGeometry(c, zb, size);
    expect(geo.view).toBe('crosses');
    expect(geo.boundary!.length / 2).toBeLessThan(10_000);
    // The arc through the visible area sits at the right height (y ≈ −x²/2r).
    const px = geo.boundary!;
    let closest = Infinity;
    for (let i = 0; i < px.length; i += 2) closest = Math.min(closest, Math.hypot(px[i] - 500, px[i + 1] - 300));
    expect(closest).toBeLessThan(1);
  });

  it('report inside / outside when the boundary is off-screen', () => {
    expect(circleGeometry({ cx: 0, cy: 0, r: 100 }, bounds, size).view).toBe('inside');
    expect(circleGeometry({ cx: 50, cy: 0, r: 1 }, bounds, size).view).toBe('outside');
  });

  it('shade the inside or the outside', () => {
    const inside = preparePlot(plotOf('x^2 + y^2 < 4'), bounds, size);
    expect(inside.dashed).toBe(true);
    // Inscribed polygon within ~0.15 px of the circle: area within 0.3%.
    expect(Math.abs(totalArea(inside.fills) - Math.PI * 100 * 100) / (Math.PI * 100 * 100)).toBeLessThan(0.003);
    const outside = preparePlot(plotOf('x^2 + y^2 >= 4'), bounds, size);
    expect(outside.fillRule).toBe('evenodd');
    expect(outside.dashed).toBe(false);
  });

  it('projects points exactly', () => {
    const [x, y] = projectOntoCircle({ cx: 1, cy: 1, r: 2 }, 5, 1);
    expect([x, y]).toEqual([3, 1]);
  });
});

describe('generic implicit curves', () => {
  it('traces an ellipse with points on the curve and joined polylines', () => {
    const F = (x: number, y: number) => (x * x) / 16 + y * y - 1;
    const { lines } = traceImplicit(F, bounds, size);
    expect(lines).toHaveLength(1); // one closed loop
    const pts = lines[0];
    expect(pts.length / 2).toBeGreaterThan(100);
    for (let i = 0; i < pts.length; i += 2) expect(Math.abs(F(wx(pts[i]), wy(pts[i + 1])))).toBeLessThan(1e-6);
    // Closed: last point equals first.
    expect(Math.hypot(pts[0] - pts[pts.length - 2], pts[1] - pts[pts.length - 1])).toBeLessThan(1e-9);
  });

  it('rejects sign changes through poles', () => {
    const F = (x: number, y: number) => 1 / x - y * 0; // no zeros, just a pole at x = 0
    expect(traceImplicit(F, bounds, size).lines).toHaveLength(0);
  });

  it('fills regions with about the right area', () => {
    const F = (x: number, y: number) => (x * x) / 16 + y * y - 1;
    const { fill } = traceImplicit(F, bounds, size, { region: (v) => satisfies(v, '<') });
    const expected = Math.PI * 4 * 1 * 50 * 50; // π·a·b in px²
    expect(Math.abs(totalArea(fill) - expected) / expected).toBeLessThan(0.01);
  });

  it('finds vertical lines like x² = 4', () => {
    const { lines } = traceImplicit((x) => x * x - 4, bounds, size);
    expect(lines).toHaveLength(2);
    for (const line of lines) {
      const xs = line.filter((_, i) => i % 2 === 0);
      expect(xs.every((v) => Math.abs(Math.abs(wx(v)) - 2) < 1e-9)).toBe(true);
    }
  });

  // Cost is measured in evaluations of F, not wall-clock time, so the test
  // is deterministic across machines (CI runners are slower than desktops).
  it('stays cheap: few evaluations for typical curves, hard cap for dense ones', () => {
    let n = 0;
    const ellipse = (x: number, y: number) => (n++, (x * x) / 16 + y * y - 1);
    traceImplicit(ellipse, bounds, size, { region: (v) => v < 0 });
    expect(n).toBeLessThan(15_000);

    n = 0;
    const dense = (x: number, y: number) => (n++, Math.sin(x * y) - 0.5);
    traceImplicit(dense, bounds, size, { region: (v) => v > 0, maxEvals: 80_000 });
    expect(n).toBeLessThan(80_000 + 200); // budget respected (one leaf cell of slack)
  });
});
