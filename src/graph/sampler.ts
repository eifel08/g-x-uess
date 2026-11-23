import type { RealFn } from '../math/types';
import type { Bounds, Size } from './viewport';

/** A connected run of points in CSS pixels: [x0, y0, x1, y1, …]. */
export type Polyline = number[];

export interface SampleOptions {
  /** Spacing of the initial uniform samples, in pixels. */
  baseStepPx?: number;
  /** Maximum bisection depth below each initial interval. */
  maxDepth?: number;
  /** Max allowed deviation (px) of the midpoint from the chord before refining. */
  tolerancePx?: number;
  /** Hard cap on function evaluations per curve, for pathological inputs. */
  maxEvals?: number;
}

/**
 * Adaptive sampler for y = f(x).
 *
 * Starts from uniform samples a couple of pixels apart, then recursively
 * bisects any interval where:
 *   - the curve bends more than `tolerancePx` away from a straight chord, or
 *   - finiteness changes (a domain edge like sqrt(x) at 0, or a pole).
 *
 * At the deepest level an interval that still shows a big vertical jump is
 * classified: if the midpoint lies between the endpoints the function is just
 * steep and we connect it; otherwise (pole of tan(x), step of floor(x)) we
 * break the polyline so no false vertical line is drawn. Values of ±Infinity
 * at a domain edge (ln(x) at 0) are extended off-screen in the matching
 * direction.
 */
export function sampleCurve(fn: RealFn, bounds: Bounds, size: Size, options: SampleOptions = {}): Polyline[] {
  const { baseStepPx = 2, maxDepth = 14, tolerancePx = 0.35, maxEvals = 40_000 } = options;
  const { width, height } = size;
  const { xMin, xMax, yMin, yMax } = bounds;
  if (width <= 0 || height <= 0) return [];

  const sx = width / (xMax - xMin);
  const sy = height / (yMax - yMin);
  const LIMIT = height * 4 + 1000; // how far off-screen we clamp drawn points
  const rawPy = (y: number) => (yMax - y) * sy;
  const outPy = (y: number) => Math.max(-LIMIT, Math.min(height + LIMIT, rawPy(y)));
  const outPx = (x: number) => (x - xMin) * sx;
  const offscreenY = (y: number) => (y > 0 ? -LIMIT : height + LIMIT);

  let evals = 0;
  const f = (x: number) => {
    evals++;
    return fn(x);
  };

  const polylines: Polyline[] = [];
  let cur: Polyline = [];
  const flush = () => {
    if (cur.length >= 4) polylines.push(cur);
    cur = [];
  };
  const startAt = (x: number, y: number) => {
    if (cur.length === 0) cur.push(outPx(x), outPy(y));
  };
  const lineTo = (x: number, y: number) => cur.push(outPx(x), outPy(y));

  const segment = (xa: number, ya: number, xb: number, yb: number, depth: number) => {
    const xm = (xa + xb) / 2;
    const canSplit = depth < maxDepth && evals < maxEvals && xm > xa && xm < xb;
    const ym = f(xm);
    const fa = Number.isFinite(ya);
    const fb = Number.isFinite(yb);
    const fm = Number.isFinite(ym);

    if (canSplit) {
      let split = false;
      if (fa !== fb || fa !== fm) {
        split = true;
      } else if (fa) {
        const pa = rawPy(ya);
        const pb = rawPy(yb);
        const pm = rawPy(ym);
        const allAbove = pa < 0 && pb < 0 && pm < 0;
        const allBelow = pa > height && pb > height && pm > height;
        if (!allAbove && !allBelow && Math.abs(pm - (pa + pb) / 2) > tolerancePx) split = true;
      }
      if (split) {
        segment(xa, ya, xm, ym, depth + 1);
        segment(xm, ym, xb, yb, depth + 1);
        return;
      }
    }

    // Leaf interval: decide how to connect a → b.
    if (fa && fb) {
      const jumpPx = Math.abs(rawPy(yb) - rawPy(ya));
      if (canSplit || jumpPx < 2) {
        startAt(xa, ya);
        lineTo(xb, yb);
        return;
      }
      // Couldn't refine further and there's still a jump: steep or discontinuous?
      const t = fm ? (ym - ya) / (yb - ya) : NaN;
      if (t > 0.01 && t < 0.99) {
        startAt(xa, ya);
        lineTo(xm, ym);
        lineTo(xb, yb);
      } else {
        flush();
      }
      return;
    }
    if (fa && !fb) {
      startAt(xa, ya);
      if (yb === Infinity || yb === -Infinity) {
        if (Math.sign(yb) === Math.sign(ya)) cur.push(outPx(xb), offscreenY(yb));
      }
      flush();
      return;
    }
    if (!fa && fb) {
      flush();
      if ((ya === Infinity || ya === -Infinity) && Math.sign(ya) === Math.sign(yb)) {
        cur.push(outPx(xa), offscreenY(ya));
      }
      lineTo(xb, yb);
      return;
    }
    flush();
  };

  // Sample one step beyond each edge so curves leave the screen cleanly.
  const pad = baseStepPx / sx;
  const x0 = xMin - pad;
  const x1 = xMax + pad;
  const n = Math.max(2, Math.ceil(width / baseStepPx) + 2);
  const dx = (x1 - x0) / n;
  let xa = x0;
  let ya = f(xa);
  for (let i = 1; i <= n; i++) {
    const xb = i === n ? x1 : x0 + i * dx;
    const yb = f(xb);
    segment(xa, ya, xb, yb, 0);
    xa = xb;
    ya = yb;
  }
  flush();
  return polylines;
}
