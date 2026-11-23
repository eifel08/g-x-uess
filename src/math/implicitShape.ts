import type { Circle, RealFn, RealFn2 } from './types';

/**
 * Recognises implicit equations F(x, y) = 0 that have an exact, cheaper
 * representation than generic contouring:
 *
 *  - circles      a(x² + y²) + dx + ey + f = 0    → centre and radius
 *  - lines        dx + ey + f = 0                  → y = g(x), or x = c
 *  - linear in y  g(x) + h(x)·y = 0                → y = −g(x)/h(x)   (2y = x², xy = 1, …)
 *
 * Shapes are detected numerically: the coefficients are fitted from a few
 * evaluations, then the fit is verified at scattered points. Polynomials
 * evaluate exactly at the small integer fitting points, so detection is
 * reliable, and anything that doesn't verify falls back to generic contouring.
 */
export type ImplicitShape =
  /** F = a·((x − cx)² + (y − cy)² − r²) with a ≠ 0, r > 0. */
  | { type: 'circle'; circle: Circle; a: number }
  /** F = a·((x − cx)² + (y − cy)² − r²) with r² ≤ 0: no points (or one point). */
  | { type: 'empty-circle'; a: number; r2: number }
  /** F = d·x + e·y + f. */
  | { type: 'line'; d: number; e: number; f: number }
  /** F = g(x) + h(x)·y. `hConst` is set when h doesn't depend on x. */
  | { type: 'linear-in-y'; g: RealFn; h: RealFn; hConst?: number }
  | { type: 'general' };

/** Scattered verification points, away from "nice" values. */
const PROBES: [number, number][] = [
  [0.3712, -1.2219],
  [-2.6183, 0.8411],
  [1.9375, 2.4142],
  [-0.7071, -3.1416],
  [4.123, -0.577],
  [-5.55, 3.3],
  [7.25, 6.1],
  [-9.8, -7.6],
];

function close(a: number, b: number, scale: number): boolean {
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.isNaN(a) && Number.isNaN(b);
  return Math.abs(a - b) <= 1e-9 * (1 + scale);
}

export function analyzeImplicit(F: RealFn2): ImplicitShape {
  return fitQuadratic(F) ?? fitLinearInY(F) ?? { type: 'general' };
}

/** Fits F = a x² + b xy + c y² + d x + e y + f and returns a circle or line. */
function fitQuadratic(F: RealFn2): ImplicitShape | null {
  const f00 = F(0, 0);
  const fp0 = F(1, 0);
  const fm0 = F(-1, 0);
  const f0p = F(0, 1);
  const f0m = F(0, -1);
  const fpp = F(1, 1);
  const values = [f00, fp0, fm0, f0p, f0m, fpp];
  if (!values.every(Number.isFinite)) return null;

  const f = f00;
  const a = (fp0 + fm0) / 2 - f;
  const d = (fp0 - fm0) / 2;
  const c = (f0p + f0m) / 2 - f;
  const e = (f0p - f0m) / 2;
  const b = fpp - a - c - d - e - f;
  const Q = (x: number, y: number) => a * x * x + b * x * y + c * y * y + d * x + e * y + f;

  for (const [x, y] of PROBES) {
    const v = F(x, y);
    const terms = Math.abs(a * x * x) + Math.abs(b * x * y) + Math.abs(c * y * y) + Math.abs(d * x) + Math.abs(e * y) + Math.abs(f);
    if (!Number.isFinite(v) || !close(v, Q(x, y), terms)) return null;
  }

  const scale = Math.max(Math.abs(a), Math.abs(b), Math.abs(c), Math.abs(d), Math.abs(e), Math.abs(f), 1e-300);
  const zero = (v: number) => Math.abs(v) <= 1e-12 * scale;

  if (zero(a) && zero(b) && zero(c)) {
    if (zero(d) && zero(e)) return null; // constant: nothing exact to draw
    return { type: 'line', d, e: zero(e) ? 0 : e, f };
  }
  if (zero(b) && !zero(a) && Math.abs(a - c) <= 1e-12 * scale) {
    const cx = -d / (2 * a) + 0; // + 0 normalises −0
    const cy = -e / (2 * a) + 0;
    const r2 = cx * cx + cy * cy - f / a;
    if (r2 > 0) return { type: 'circle', circle: { cx, cy, r: Math.sqrt(r2) }, a };
    return { type: 'empty-circle', a, r2 };
  }
  return null;
}

/** Detects F(x, y) = g(x) + h(x)·y. */
function fitLinearInY(F: RealFn2): ImplicitShape | null {
  const g: RealFn = (x) => F(x, 0);
  const h: RealFn = (x) => F(x, 1) - F(x, 0);
  let anyDefined = false;
  for (const [x, y] of PROBES) {
    const v = F(x, y);
    const gx = g(x);
    const hx = h(x);
    const predicted = gx + hx * y;
    if (!close(v, predicted, Math.abs(gx) + Math.abs(hx * y))) return null;
    if (Number.isFinite(v)) anyDefined = true;
    // Also require exactness at a second y, so e.g. F = y² isn't mistaken.
    const v2 = F(x, 2 * y + 1);
    const p2 = gx + hx * (2 * y + 1);
    if (!close(v2, p2, Math.abs(gx) + Math.abs(hx * (2 * y + 1)))) return null;
  }
  if (!anyDefined) return null;
  // F doesn't depend on y at all (e.g. x² = 4): that's vertical lines, not y = …
  if (PROBES.every(([x]) => h(x) === 0 || Number.isNaN(h(x)))) return null;
  const h0 = h(PROBES[0][0]);
  const hConst = PROBES.every(([x]) => close(h(x), h0, Math.abs(h0))) && Number.isFinite(h0) && h0 !== 0 ? h0 : undefined;
  return { type: 'linear-in-y', g, h, hConst };
}
