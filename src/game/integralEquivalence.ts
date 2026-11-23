import type { RealFn } from '../math/types';
import { mulberry32 } from './random';

export interface IntegralEquivalenceOptions {
  /** Number of random intervals to test. */
  intervals?: number;
  /** Relative tolerance ε in  ∫|f − g| ≤ ε · (∫|f| + ∫|g| + w). */
  epsilon?: number;
  /** Smallest scale used for interval centres and widths. */
  minScale?: number;
  /** Largest scale used for interval centres and widths. */
  maxScale?: number;
  /** Simpson subintervals per interval (rounded up to an even number). */
  subdivisions?: number;
  /** Seed for the deterministic interval generator. */
  seed?: number;
}

export interface Interval {
  a: number;
  b: number;
}

export interface IntegralEquivalenceResult {
  equivalent: boolean;
  /** Fraction of intervals that passed (0–1). */
  agreement: number;
  /** First interval that failed, useful for hints. */
  counterexample?: Interval;
}

/**
 * Checks whether two functions agree "in integral": on each of `intervals`
 * random intervals [a, b] (width w = b − a) it requires
 *
 *     ∫|f − g| dx  ≤  ε · ( ∫|f| dx + ∫|g| dx + w )
 *
 * The ε·w term is an absolute tolerance per unit length (so f = g = 0 passes),
 * and the other terms make the test relative to the size of the functions.
 *
 * Interval centres and widths are drawn log-uniformly from
 * [minScale, maxScale] with random signs, so the test covers tiny intervals
 * near 0 as well as ranges of millions of units, not just [−10, 10].
 *
 * Integrals use composite Simpson's rule with the same nodes for all three
 * integrands. Where both functions are undefined at a node (NaN/±∞) that node
 * contributes nothing. Where only one of them is defined, the interval fails:
 * the domains differ.
 */
export function compareFunctionsByIntegral(
  f: RealFn,
  g: RealFn,
  options: IntegralEquivalenceOptions = {},
): IntegralEquivalenceResult {
  const { intervals = 256, epsilon = 1e-6, subdivisions = 128 } = options;
  const list = randomIntervals(intervals, options);
  let passed = 0;
  let counterexample: Interval | undefined;
  for (const interval of list) {
    if (intervalPasses(f, g, interval, epsilon, subdivisions)) passed++;
    else counterexample ??= interval;
  }
  return { equivalent: passed === list.length, agreement: passed / list.length, counterexample };
}

/** Deterministic random intervals spanning many orders of magnitude. */
export function randomIntervals(count: number, options: IntegralEquivalenceOptions = {}): Interval[] {
  const { minScale = 1e-2, maxScale = 1e6, seed = 1 } = options;
  const rand = mulberry32(seed);
  const lo = Math.log10(minScale);
  const hi = Math.log10(maxScale);
  const logUniform = () => 10 ** (lo + rand() * (hi - lo));
  const result: Interval[] = [];
  for (let i = 0; i < count; i++) {
    const centre = (rand() < 0.5 ? -1 : 1) * logUniform();
    const width = logUniform();
    result.push({ a: centre - width / 2, b: centre + width / 2 });
  }
  return result;
}

function intervalPasses(f: RealFn, g: RealFn, { a, b }: Interval, epsilon: number, subdivisions: number): boolean {
  const n = Math.max(2, Math.ceil(subdivisions / 2) * 2);
  const h = (b - a) / n;
  const fv = new Float64Array(n + 1);
  const gv = new Float64Array(n + 1);
  const defined = new Uint8Array(n + 1);

  // Evaluate once and find the largest magnitude so the sums can be scaled
  // to avoid overflow (e.g. f ≈ 1e308, g ≈ −1e308).
  let scale = 0;
  for (let i = 0; i <= n; i++) {
    const x = i === n ? b : a + i * h;
    const fx = f(x);
    const gx = g(x);
    const ff = Number.isFinite(fx);
    const fg = Number.isFinite(gx);
    if (ff !== fg) return false; // only one is defined here
    if (!ff) continue; // both undefined here: skip this node
    defined[i] = 1;
    fv[i] = fx;
    gv[i] = gx;
    scale = Math.max(scale, Math.abs(fx), Math.abs(gx));
  }
  if (scale === 0) return true; // both are 0 (or undefined) everywhere we looked

  let diff = 0;
  let sumF = 0;
  let sumG = 0;
  for (let i = 0; i <= n; i++) {
    if (!defined[i]) continue;
    const weight = i === 0 || i === n ? 1 : i % 2 === 1 ? 4 : 2;
    const fs = fv[i] / scale;
    const gs = gv[i] / scale;
    diff += weight * Math.abs(fs - gs);
    sumF += weight * Math.abs(fs);
    sumG += weight * Math.abs(gs);
  }
  // Every integral is (h/3) · scale · sum, so we divide both sides by
  // (h/3) · scale. The width w = n · h becomes 3n / scale.
  const w = (3 * n) / scale;
  return diff <= epsilon * (sumF + sumG + w);
}
