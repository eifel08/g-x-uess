import type { RealFn } from '../math/types';
import { mulberry32 } from './random';

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
