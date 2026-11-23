import type { RealFn } from './types';

/* ------------------------------------------------------------------------ */
/* Differentiation                                                           */
/* ------------------------------------------------------------------------ */

const EPS = Number.EPSILON;

/** Step that is exactly representable around x (avoids rounding in x ± h). */
function step(x: number, h: number): number {
  const t = x + h;
  return t - x;
}

/**
 * n-th derivative of f at x by finite differences.
 *  - n = 1: five-point stencil, O(h⁴) truncation error.
 *  - n ≥ 2: central binomial difference, O(h²), with h ≈ ε^(1/(n+2)).
 * Returns NaN if f is undefined anywhere in the stencil.
 */
export function nthDerivative(f: RealFn, x: number, n = 1): number {
  if (!Number.isFinite(x) || n < 1) return NaN;
  const scale = Math.max(1, Math.abs(x));
  if (n === 1) {
    const h = step(x, EPS ** (1 / 5) * scale);
    const f1 = f(x + h);
    const f_1 = f(x - h);
    const f2 = f(x + 2 * h);
    const f_2 = f(x - 2 * h);
    const d = (f_2 - 8 * f_1 + 8 * f1 - f2) / (12 * h);
    return Number.isFinite(d) ? d : NaN;
  }
  const h = step(x, EPS ** (1 / (n + 2)) * scale);
  let sum = 0;
  let binom = 1;
  for (let k = 0; k <= n; k++) {
    const v = f(x + (n / 2 - k) * h);
    if (!Number.isFinite(v)) return NaN;
    sum += (k % 2 === 0 ? 1 : -1) * binom * v;
    binom = (binom * (n - k)) / (k + 1);
  }
  const d = sum / h ** n;
  return Number.isFinite(d) ? d : NaN;
}

/* ------------------------------------------------------------------------ */
/* Integration                                                               */
/* ------------------------------------------------------------------------ */

// Gauss–Kronrod 7/15 nodes and weights on [-1, 1].
const XGK = [
  0.991455371120812639206854697526329, 0.949107912342758524526189684047851, 0.864864423359769072789712788640926,
  0.741531185599394439863864773280788, 0.586087235467691130294144845693013, 0.405845151377397166906606412076961,
  0.207784955007898467600689403773245, 0,
];
const WGK = [
  0.02293532201052922496373200805897, 0.063092092629978553290700663189204, 0.104790010322250183839876322541518,
  0.140653259715525918745189590510238, 0.16900472663926790282658342659855, 0.190350578064785409913256402421014,
  0.204432940075298892414161999234649, 0.209482141084727828012999174891714,
];
const WG = [
  0.129484966168869693270611432679082, 0.27970539148927666790146777142378, 0.381830050505118944950369775488975,
  0.417959183673469387755102040816327,
];

interface Panel {
  a: number;
  b: number;
  value: number;
  error: number;
}

function gk15(f: RealFn, a: number, b: number): Panel {
  const c = (a + b) / 2;
  const h = (b - a) / 2;
  const fc = f(c);
  let k = fc * WGK[7];
  let g = fc * WG[3];
  for (let j = 0; j < 7; j++) {
    const dx = h * XGK[j];
    const pair = f(c - dx) + f(c + dx);
    k += WGK[j] * pair;
    if (j % 2 === 1) g += WG[(j - 1) / 2] * pair;
  }
  return { a, b, value: k * h, error: Math.abs((k - g) * h) };
}

export interface IntegrateOptions {
  /** Relative tolerance on the result. */
  relTol?: number;
  /** Maximum number of Gauss–Kronrod panels (15 evaluations each). */
  maxPanels?: number;
}

/**
 * Definite integral of f over [a, b] by adaptive Gauss–Kronrod (G7/K15).
 * Supports reversed bounds and infinite bounds (via t/(1−t) substitution).
 * Returns NaN if the integrand is undefined at any node.
 */
export function integrate(f: RealFn, a: number, b: number, options: IntegrateOptions = {}): number {
  if (Number.isNaN(a) || Number.isNaN(b)) return NaN;
  if (a === b) return 0;
  if (a > b) return -integrate(f, b, a, options);
  if (a === -Infinity && b === Infinity) {
    return integrate(f, -Infinity, 0, options) + integrate(f, 0, Infinity, options);
  }
  if (b === Infinity) {
    return adaptive((t) => {
      const s = 1 - t;
      return f(a + t / s) / (s * s);
    }, 0, 1, options);
  }
  if (a === -Infinity) {
    return adaptive((t) => f(b - (1 - t) / t) / (t * t), 0, 1, options);
  }
  return adaptive(f, a, b, options);
}

function adaptive(f: RealFn, a: number, b: number, { relTol = 1e-10, maxPanels = 64 }: IntegrateOptions): number {
  const panels: Panel[] = [gk15(f, a, b)];
  for (;;) {
    let total = 0;
    let error = 0;
    let worst = 0;
    for (let i = 0; i < panels.length; i++) {
      total += panels[i].value;
      error += panels[i].error;
      if (panels[i].error > panels[worst].error) worst = i;
    }
    if (!Number.isFinite(total)) return NaN;
    if (error <= Math.max(relTol * Math.abs(total), 1e-14) || panels.length >= maxPanels) return total;
    const p = panels[worst];
    const mid = (p.a + p.b) / 2;
    if (!(mid > p.a && mid < p.b)) return total; // can't split further
    panels.splice(worst, 1, gk15(f, p.a, mid), gk15(f, mid, p.b));
  }
}
