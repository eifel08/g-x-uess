import type { RealFn } from '../math/types';

export interface EquivalenceOptions {
  /** Interval to test on. */
  domain?: [number, number];
  /** Number of sample points. */
  samples?: number;
  /** Relative/absolute tolerance for comparing values. */
  tolerance?: number;
  /** Seed for the deterministic sample positions. */
  seed?: number;
}

export interface EquivalenceResult {
  equivalent: boolean;
  /** Fraction of sample points where the two functions agree (0–1). */
  agreement: number;
  /** First x where they disagree, useful for hints. */
  counterexample?: number;
}

/**
 * Numerically checks whether two functions agree, so a guess like
 * `2(x+1)` counts as correct for a hidden `2x + 2`. Points where both are
 * undefined agree; points where only one is defined don't. This is the
 * building block for Phase 2 "is the guess correct?" checks.
 */
export function compareFunctions(f: RealFn, g: RealFn, options: EquivalenceOptions = {}): EquivalenceResult {
  const { domain = [-10, 10], samples = 256, tolerance = 1e-7, seed = 1 } = options;
  const rand = mulberry32(seed);
  const [lo, hi] = domain;
  let agree = 0;
  let counterexample: number | undefined;

  for (let i = 0; i < samples; i++) {
    // Stratified jitter: spread points evenly but avoid "nice" values.
    const x = lo + ((i + rand()) / samples) * (hi - lo);
    const a = f(x);
    const b = g(x);
    const fa = Number.isFinite(a);
    const fb = Number.isFinite(b);
    const same = fa && fb ? Math.abs(a - b) <= tolerance * Math.max(1, Math.abs(a), Math.abs(b)) : fa === fb;
    if (same) agree++;
    else counterexample ??= x;
  }
  return { equivalent: agree === samples, agreement: agree / samples, counterexample };
}

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t = (t + 0x6d2b79f5) >>> 0;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r = (r + Math.imul(r ^ (r >>> 7), 61 | r)) ^ r;
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}
