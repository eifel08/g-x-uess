import type { RealFn } from '../math/types';
import type { Bounds, Size } from './viewport';

export type PoiKind = 'x-intercept' | 'y-intercept' | 'intersection';

export interface PoiCurve {
  id: string;
  fn: RealFn;
}

export interface PointOfInterest {
  /** Stable identity of the source (kind + curves), used to keep pins attached. */
  key: string;
  kind: PoiKind;
  x: number;
  y: number;
  curveIds: string[];
}

/** A vertical line x = `x`. */
export interface PoiVertical {
  id: string;
  x: number;
}

export interface PoiOptions {
  /** Spacing of the scan grid in pixels. */
  stepPx?: number;
  /**
   * If one source (a curve's roots, or a pair's intersections) produces more
   * points than this in view, it's dropped as clutter — e.g. sin(x) zoomed
   * far out, or two overlapping curves.
   */
  maxPerSource?: number;
}

/**
 * Finds x-intercepts, y-intercepts and pairwise intersections of the given
 * curves within `bounds`.
 *
 * Each curve is sampled once on a uniform grid. A zero of h (h = f for roots,
 * h = f − g for intersections) is bracketed by a sign change between two
 * finite samples and refined by bisection to full double precision. The
 * candidate is rejected unless |h| there is tiny compared with the bracket's
 * values. That filters out poles (1/x changes sign through ±∞) and jumps
 * (floor(x) − 0.5 changes sign without crossing 0). Touching zeros without a
 * sign change (x² at 0) are found from local minima of |h| that come within a
 * pixel of 0, refined by golden-section search.
 */
export function findPointsOfInterest(
  curves: readonly PoiCurve[],
  bounds: Bounds,
  size: Size,
  options: PoiOptions = {},
  verticals: readonly PoiVertical[] = [],
): PointOfInterest[] {
  const { stepPx = 3, maxPerSource = 40 } = options;
  const { xMin, xMax, yMin, yMax } = bounds;
  if (size.width <= 0 || (curves.length === 0 && verticals.length === 0)) return [];

  const n = Math.max(2, Math.ceil(size.width / stepPx));
  const xs = new Float64Array(n + 1);
  for (let i = 0; i <= n; i++) xs[i] = xMin + ((xMax - xMin) * i) / n;
  const values = curves.map((c) => xs.map((x) => c.fn(x)));
  const pxPerUnit = size.height / (yMax - yMin);
  const minGapX = ((xMax - xMin) / size.width) * 0.5; // half a pixel

  // Aliasing guard: a second, jittered grid (shared by all curves). If the
  // zeros of h are resolved, both grids see the same number of sign changes;
  // if h oscillates faster than the grid (sin(x) zoomed far out), the counts
  // disagree and we drop that source instead of showing a misleading subset.
  const mids = jitteredMidpoints(xs);
  const midValues = curves.map((c) => mids.map((x) => c.fn(x)));
  const consistent = (grid: Float64Array, mid: Float64Array) => Math.abs(signChanges(grid) - signChanges(mid)) <= 2;

  const points: PointOfInterest[] = [];
  const inView = (y: number) => y >= yMin && y <= yMax;
  const addSource = (found: PointOfInterest[]) => {
    const visible = found.filter((p) => inView(p.y));
    if (visible.length <= maxPerSource) points.push(...visible);
  };

  // x-intercepts
  curves.forEach((c, ci) => {
    if (!consistent(values[ci], midValues[ci])) return;
    const roots = findZeros(c.fn, xs, values[ci], pxPerUnit, minGapX);
    addSource(roots.map((x) => ({ key: `root:${c.id}`, kind: 'x-intercept', x, y: 0, curveIds: [c.id] })));
  });

  // y-intercepts
  if (xMin <= 0 && xMax >= 0) {
    for (const c of curves) {
      const y = c.fn(0);
      if (Number.isFinite(y) && inView(y)) {
        points.push({ key: `yint:${c.id}`, kind: 'y-intercept', x: 0, y, curveIds: [c.id] });
      }
    }
  }

  // Pairwise intersections
  for (let i = 0; i < curves.length; i++) {
    for (let j = i + 1; j < curves.length; j++) {
      const f = curves[i].fn;
      const g = curves[j].fn;
      const diff = values[i].map((v, k) => v - values[j][k]);
      const midDiff = midValues[i].map((v, k) => v - midValues[j][k]);
      if (!consistent(diff, midDiff)) continue;
      const h: RealFn = (x) => f(x) - g(x);
      const zeros = findZeros(h, xs, diff, pxPerUnit, minGapX, (x) => Math.max(Math.abs(f(x)), Math.abs(g(x))));
      addSource(
        zeros
          .map((x) => ({ x, y: f(x) }))
          .filter((p) => Number.isFinite(p.y))
          .map(({ x, y }) => ({
            key: `int:${curves[i].id}|${curves[j].id}`,
            kind: 'intersection' as const,
            x,
            y,
            curveIds: [curves[i].id, curves[j].id],
          })),
      );
    }
  }

  // Vertical lines: x-intercept, and exact intersections x = x0 with each curve.
  for (const v of verticals) {
    if (v.x < xMin || v.x > xMax) continue;
    if (yMin <= 0 && yMax >= 0) {
      points.push({ key: `vroot:${v.id}`, kind: 'x-intercept', x: v.x, y: 0, curveIds: [v.id] });
    }
    for (const c of curves) {
      const y = c.fn(v.x);
      if (Number.isFinite(y) && inView(y)) {
        points.push({ key: `int:${c.id}|${v.id}`, kind: 'intersection', x: v.x, y, curveIds: [c.id, v.id] });
      }
    }
  }

  return dedupe(points, minGapX * 2, (minGapX * 2 * size.width) / size.height);
}

/**
 * Zeros of h on the sampled grid. `magnitude(x)` gives the size of the values
 * h was formed from (for f − g, max(|f|, |g|)) so tolerances stay relative.
 */
function findZeros(
  h: RealFn,
  xs: Float64Array,
  hs: Float64Array,
  pxPerUnit: number,
  minGapX: number,
  magnitude?: (x: number) => number,
): number[] {
  const zeros: number[] = [];
  const accept = (x: number, a: number, b: number) => {
    const v = h(x);
    if (!Number.isFinite(v)) return;
    const scale = Math.max(1, Math.abs(a), Math.abs(b), magnitude ? magnitude(x) : 0);
    if (Math.abs(v) <= 1e-9 * scale) zeros.push(x);
  };

  for (let i = 0; i < xs.length - 1; i++) {
    const a = hs[i];
    const b = hs[i + 1];
    if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
    if (a === 0) {
      zeros.push(xs[i]);
      continue;
    }
    if (a * b < 0) accept(bisect(h, xs[i], xs[i + 1], a), a, b);
  }

  // Touching zeros: local minima of |h| within about a pixel of zero.
  for (let i = 1; i < xs.length - 1; i++) {
    const a = hs[i - 1];
    const mid = hs[i];
    const b = hs[i + 1];
    if (!Number.isFinite(a) || !Number.isFinite(mid) || !Number.isFinite(b) || mid === 0) continue;
    if (Math.sign(a) !== Math.sign(mid) || Math.sign(b) !== Math.sign(mid)) continue;
    if (Math.abs(mid) > Math.abs(a) || Math.abs(mid) > Math.abs(b)) continue;
    if (Math.abs(mid) * pxPerUnit > 1.5) continue;
    const x = goldenMinAbs(h, xs[i - 1], xs[i + 1]);
    const v = h(x);
    const scale = Math.max(1, magnitude ? magnitude(x) : 0);
    if (Number.isFinite(v) && Math.abs(v) <= 1e-10 * scale) zeros.push(x);
  }

  zeros.sort((p, q) => p - q);
  return zeros.filter((x, i) => i === 0 || x - zeros[i - 1] > minGapX);
}

/** One deterministic, randomly placed point inside each grid interval. */
function jitteredMidpoints(xs: Float64Array): Float64Array {
  const mids = new Float64Array(xs.length - 1);
  let seed = 0x9e3779b9;
  for (let i = 0; i < mids.length; i++) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const t = 0.2 + 0.6 * (seed / 2 ** 32);
    mids[i] = xs[i] + t * (xs[i + 1] - xs[i]);
  }
  return mids;
}

/** Sign changes between consecutive finite samples. */
function signChanges(v: Float64Array): number {
  let count = 0;
  for (let i = 0; i < v.length - 1; i++) {
    if (Number.isFinite(v[i]) && Number.isFinite(v[i + 1]) && v[i] * v[i + 1] < 0) count++;
  }
  return count;
}

/** Bisection on a bracket [lo, hi] with h(lo) = hLo of opposite sign to h(hi). */
function bisect(h: RealFn, lo: number, hi: number, hLo: number): number {
  for (let iter = 0; iter < 80; iter++) {
    const mid = (lo + hi) / 2;
    if (mid <= lo || mid >= hi) break;
    const v = h(mid);
    if (v === 0) return mid;
    if (!Number.isFinite(v)) break;
    if (Math.sign(v) === Math.sign(hLo)) {
      lo = mid;
      hLo = v;
    } else {
      hi = mid;
    }
  }
  return Math.abs(h(lo)) <= Math.abs(h(hi)) ? lo : hi;
}

/** Golden-section search for the minimum of |h| on [a, b]. */
function goldenMinAbs(h: RealFn, a: number, b: number): number {
  const r = (Math.sqrt(5) - 1) / 2;
  let c = b - r * (b - a);
  let d = a + r * (b - a);
  let fc = Math.abs(h(c));
  let fd = Math.abs(h(d));
  for (let iter = 0; iter < 100 && b - a > 1e-15 * Math.max(1, Math.abs(a)); iter++) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - r * (b - a);
      fc = Math.abs(h(c));
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + r * (b - a);
      fd = Math.abs(h(d));
    }
  }
  return fc < fd ? c : d;
}

/** Drops points that land on (nearly) the same spot, keeping the first. */
function dedupe(points: PointOfInterest[], gapX: number, gapY: number): PointOfInterest[] {
  const kept: PointOfInterest[] = [];
  for (const p of points) {
    if (!kept.some((q) => Math.abs(q.x - p.x) < gapX && Math.abs(q.y - p.y) < gapY)) kept.push(p);
  }
  return kept;
}
