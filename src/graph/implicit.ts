import type { RealFn2 } from '../math/types';
import type { Polyline } from './sampler';
import type { Bounds, Size } from './viewport';

export interface ImplicitTrace {
  /** Contour F = 0 as connected polylines (px). */
  lines: Polyline[];
  /** Polygons (px) covering the region where `region(F)` holds. Fill with the nonzero rule. */
  fill: Polyline[];
}

export interface TraceOptions {
  /** Coarse grid cell size in px. */
  coarsePx?: number;
  /** Each active coarse cell is split into subdivisions² leaf cells (must be even). */
  subdivisions?: number;
  /** If given, compute the region where this holds for F(x, y). */
  region?: (value: number) => boolean;
  /** Evaluation budget, so pathological inputs can't stall a frame. */
  maxEvals?: number;
}

/**
 * Traces F(x, y) = 0 (and optionally a region) on the screen with adaptive
 * marching squares:
 *
 *  1. Evaluate F on a coarse grid (16 px) plus each cell's centre. Cells with a
 *     sign change, a zero, or a domain edge are "active"; that set is widened
 *     by one cell so contours crossing a cell edge between samples aren't lost.
 *  2. Split active cells into 4 px leaves and run marching squares, with the
 *     saddle case resolved by the leaf centre's sign.
 *  3. Each edge crossing is refined with regula falsi (Illinois), so contour
 *     points lie on F = 0 to near machine precision and the curve doesn't
 *     wobble while panning. Crossings where |F| doesn't shrink (sign changes
 *     through a pole) are rejected.
 *  4. Segments that share an edge are chained into polylines, so dashed
 *     strokes flow continuously.
 *
 * Regions are filled with whole coarse cells where F's sign is uniform, and
 * clipped leaf polygons along the boundary, all wound the same way so a
 * single nonzero fill has no seams.
 */
export function traceImplicit(F: RealFn2, bounds: Bounds, size: Size, options: TraceOptions = {}): ImplicitTrace {
  const { coarsePx = 16, subdivisions = 4, region, maxEvals = 80_000 } = options;
  const { width: W, height: H } = size;
  if (W <= 0 || H <= 0) return { lines: [], fill: [] };
  const k = subdivisions;
  const leafPx = coarsePx / k;
  const nx = Math.ceil(W / coarsePx);
  const ny = Math.ceil(H / coarsePx);
  const NI = nx * k;
  const NJ = ny * k;
  const stride = NI + 1;

  const { xMin, xMax, yMax, yMin } = bounds;
  const unitsPerPxX = (xMax - xMin) / W;
  const unitsPerPxY = (yMax - yMin) / H;
  const wx = (px: number) => xMin + px * unitsPerPxX;
  const wy = (py: number) => yMax - py * unitsPerPxY;

  let evals = 0;
  // ±∞ is treated as undefined, so poles never produce crossings.
  const f = (px: number, py: number) => {
    evals++;
    const v = F(wx(px), wy(py));
    return Number.isFinite(v) ? v : NaN;
  };

  const values = new Float64Array((NI + 1) * (NJ + 1));
  const known = new Uint8Array(values.length);
  const at = (I: number, J: number) => {
    const idx = J * stride + I;
    if (!known[idx]) {
      known[idx] = 1;
      values[idx] = f(I * leafPx, J * leafPx);
    }
    return values[idx];
  };

  /* ----------------------------- coarse pass ----------------------------- */

  // -1 negative, 0 zero, 1 positive, 2 undefined
  const sign = (v: number) => (Number.isNaN(v) ? 2 : v > 0 ? 1 : v < 0 ? -1 : 0);
  const activeSeed = new Uint8Array(nx * ny);
  const half = k / 2;
  for (let cj = 0; cj < ny; cj++) {
    for (let ci = 0; ci < nx; ci++) {
      const I = ci * k;
      const J = cj * k;
      const s = [at(I, J), at(I + k, J), at(I + k, J + k), at(I, J + k), at(I + half, J + half)].map(sign);
      if (s.some((v) => v !== s[0]) || s[0] === 0) activeSeed[cj * nx + ci] = 1;
    }
  }
  const active = new Uint8Array(nx * ny);
  for (let cj = 0; cj < ny; cj++) {
    for (let ci = 0; ci < nx; ci++) {
      if (!activeSeed[cj * nx + ci]) continue;
      for (let dj = -1; dj <= 1; dj++) {
        for (let di = -1; di <= 1; di++) {
          const i = ci + di;
          const j = cj + dj;
          if (i >= 0 && j >= 0 && i < nx && j < ny) active[j * nx + i] = 1;
        }
      }
    }
  }

  /* ------------------------------ crossings ------------------------------ */

  // Edge keys: horizontal edge (I,J)→(I+1,J) = 2·node, vertical (I,J)→(I,J+1) = 2·node + 1.
  const hKey = (I: number, J: number) => (J * stride + I) * 2;
  const vKey = (I: number, J: number) => (J * stride + I) * 2 + 1;
  const crossings = new Map<number, [number, number] | null>();

  /** Zero of F on the segment (ax, ay)→(bx, by) in px, or null if it's a pole. */
  const refine = (ax: number, ay: number, va: number, bx: number, by: number, vb: number): [number, number] | null => {
    if (va === 0) return [ax, ay];
    if (vb === 0) return [bx, by];
    let t0 = 0;
    let t1 = 1;
    let f0 = va;
    let f1 = vb;
    let side = 0;
    let t = 0.5;
    let ft = NaN;
    for (let iter = 0; iter < 8; iter++) {
      t = (t0 * f1 - t1 * f0) / (f1 - f0);
      if (!(t > t0 && t < t1)) t = (t0 + t1) / 2;
      ft = f(ax + (bx - ax) * t, ay + (by - ay) * t);
      if (!Number.isFinite(ft)) return null;
      if (ft === 0) break;
      if (Math.sign(ft) === Math.sign(f1)) {
        t1 = t;
        f1 = ft;
        if (side === -1) f0 /= 2;
        side = -1;
      } else {
        t0 = t;
        f0 = ft;
        if (side === 1) f1 /= 2;
        side = 1;
      }
    }
    if (Math.abs(ft) > 0.05 * Math.max(Math.abs(va), Math.abs(vb))) return null;
    return [ax + (bx - ax) * t, ay + (by - ay) * t];
  };

  const crossing = (key: number, I0: number, J0: number, I1: number, J1: number) => {
    if (crossings.has(key)) return crossings.get(key)!;
    const va = at(I0, J0);
    const vb = at(I1, J1);
    const p = refine(I0 * leafPx, J0 * leafPx, va, I1 * leafPx, J1 * leafPx, vb);
    crossings.set(key, p);
    return p;
  };

  /* ------------------------------ leaf pass ------------------------------ */

  const segA: number[] = [];
  const segB: number[] = [];
  const fill: Polyline[] = [];

  const addSegment = (ka: number, kb: number) => {
    if (crossings.get(ka) && crossings.get(kb)) {
      segA.push(ka);
      segB.push(kb);
    }
  };

  for (let cj = 0; cj < ny; cj++) {
    // Region: merge runs of uniformly-inside inactive coarse cells.
    let runStart = -1;
    const flushRun = (end: number) => {
      if (runStart >= 0) {
        const x0 = runStart * coarsePx;
        const x1 = end * coarsePx;
        const y0 = cj * coarsePx;
        const y1 = y0 + coarsePx;
        fill.push([x0, y0, x1, y0, x1, y1, x0, y1]);
        runStart = -1;
      }
    };

    for (let ci = 0; ci < nx; ci++) {
      if (!active[cj * nx + ci]) {
        if (region) {
          const v = at(ci * k + half, cj * k + half);
          if (Number.isFinite(v) && region(v)) {
            if (runStart < 0) runStart = ci;
          } else flushRun(ci);
        }
        continue;
      }
      flushRun(ci);
      if (evals > maxEvals) continue;

      for (let J = cj * k; J < cj * k + k; J++) {
        for (let I = ci * k; I < ci * k + k; I++) {
          const va = at(I, J); // top-left
          const vb = at(I + 1, J); // top-right
          const vc = at(I + 1, J + 1); // bottom-right
          const vd = at(I, J + 1); // bottom-left
          if (Number.isNaN(va) || Number.isNaN(vb) || Number.isNaN(vc) || Number.isNaN(vd)) continue;

          const pa = va > 0;
          const pb = vb > 0;
          const pc = vc > 0;
          const pd = vd > 0;
          const top = hKey(I, J);
          const bottom = hKey(I, J + 1);
          const left = vKey(I, J);
          const right = vKey(I + 1, J);
          if (pa !== pb) crossing(top, I, J, I + 1, J);
          if (pb !== pc) crossing(right, I + 1, J, I + 1, J + 1);
          if (pd !== pc) crossing(bottom, I, J + 1, I + 1, J + 1);
          if (pa !== pd) crossing(left, I, J, I, J + 1);

          const edges = [pa !== pb ? top : -1, pb !== pc ? right : -1, pd !== pc ? bottom : -1, pa !== pd ? left : -1];
          const count = edges.filter((e) => e >= 0).length;
          if (count === 2) {
            const [e0, e1] = edges.filter((e) => e >= 0);
            addSegment(e0, e1);
          } else if (count === 4) {
            const center = f((I + 0.5) * leafPx, (J + 0.5) * leafPx) > 0;
            if (center === pa) {
              addSegment(top, right);
              addSegment(left, bottom);
            } else {
              addSegment(left, top);
              addSegment(right, bottom);
            }
          }

          if (region) {
            const ia = region(va);
            const ib = region(vb);
            const ic = region(vc);
            const id = region(vd);
            if (!ia && !ib && !ic && !id) continue;
            const x0 = I * leafPx;
            const y0 = J * leafPx;
            const x1 = x0 + leafPx;
            const y1 = y0 + leafPx;
            if (ia && ib && ic && id) {
              fill.push([x0, y0, x1, y0, x1, y1, x0, y1]);
              continue;
            }
            // Walk TL → TR → BR → BL, inserting boundary points where inside-ness flips.
            const poly: number[] = [];
            const cut = (key: number, px0: number, py0: number, v0: number, px1: number, py1: number, v1: number) => {
              const p = crossings.get(key);
              if (p) poly.push(p[0], p[1]);
              else {
                const t = v0 / (v0 - v1);
                const tt = Number.isFinite(t) ? Math.min(1, Math.max(0, t)) : 0.5;
                poly.push(px0 + (px1 - px0) * tt, py0 + (py1 - py0) * tt);
              }
            };
            if (ia) poly.push(x0, y0);
            if (ia !== ib) cut(top, x0, y0, va, x1, y0, vb);
            if (ib) poly.push(x1, y0);
            if (ib !== ic) cut(right, x1, y0, vb, x1, y1, vc);
            if (ic) poly.push(x1, y1);
            if (ic !== id) cut(bottom, x1, y1, vc, x0, y1, vd);
            if (id) poly.push(x0, y1);
            if (id !== ia) cut(left, x0, y1, vd, x0, y0, va);
            if (poly.length >= 6) fill.push(poly);
          }
        }
      }
    }
    flushRun(nx);
  }

  return { lines: chain(segA, segB, crossings), fill };
}

/** Joins segments that share edge crossings into polylines. */
function chain(segA: number[], segB: number[], crossings: Map<number, [number, number] | null>): Polyline[] {
  const adjacency = new Map<number, number[]>();
  const link = (key: number, seg: number) => {
    const list = adjacency.get(key);
    if (list) list.push(seg);
    else adjacency.set(key, [seg]);
  };
  for (let s = 0; s < segA.length; s++) {
    link(segA[s], s);
    link(segB[s], s);
  }

  const used = new Uint8Array(segA.length);
  const walk = (start: number): number[] => {
    const keys: number[] = [];
    let key = start;
    for (;;) {
      const next = adjacency.get(key)?.find((s) => !used[s]);
      if (next === undefined) return keys;
      used[next] = 1;
      key = segA[next] === key ? segB[next] : segA[next];
      keys.push(key);
    }
  };

  const lines: Polyline[] = [];
  for (let s = 0; s < segA.length; s++) {
    if (used[s]) continue;
    used[s] = 1;
    const forward = walk(segB[s]);
    const backward = walk(segA[s]).reverse();
    const keys = [...backward, segA[s], segB[s], ...forward];
    const line: number[] = [];
    for (const key of keys) {
      const p = crossings.get(key)!;
      line.push(p[0], p[1]);
    }
    lines.push(line);
  }
  return lines;
}

/**
 * Moves (x, y) onto the curve F = 0 with a few Newton steps along the
 * gradient. Returns the original point if that fails or moves farther than
 * `maxMove` (world units).
 */
export function snapToImplicit(F: RealFn2, x: number, y: number, maxMove: number): [number, number] {
  let px = x;
  let py = y;
  for (let i = 0; i < 8; i++) {
    const v = F(px, py);
    if (!Number.isFinite(v)) return [x, y];
    if (v === 0) break;
    const h = 1e-7 * Math.max(1, Math.abs(px), Math.abs(py));
    const gx = (F(px + h, py) - F(px - h, py)) / (2 * h);
    const gy = (F(px, py + h) - F(px, py - h)) / (2 * h);
    const g2 = gx * gx + gy * gy;
    if (!(g2 > 0) || !Number.isFinite(g2)) return [x, y];
    px -= (v * gx) / g2;
    py -= (v * gy) / g2;
  }
  return Number.isFinite(px) && Number.isFinite(py) && Math.hypot(px - x, py - y) <= maxMove ? [px, py] : [x, y];
}
