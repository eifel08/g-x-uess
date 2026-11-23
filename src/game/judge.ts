import type { RealFn } from '../math/types';
import { compareFunctions } from './equivalence';

export interface GuessResult {
  correct: boolean;
  /** How close the guess looks over the default view, 0–1. */
  closeness: number;
  /** One short, non-spoiling sentence. */
  message: string;
}

/**
 * Domains for the exactness check: the default view, the region near 0
 * (densely), and wide ranges where e.g. x² vs x² + 0.001x or growth rates
 * differ. Points where both functions are undefined agree; points where only
 * one is defined count as a mismatch, so domain restrictions matter
 * (√x² ≠ x). Algebraically equal forms such as (x−2)(x+3) and x² + x − 6
 * agree to rounding error everywhere.
 */
const EXACT_DOMAINS: [number, number][] = [
  [-10, 10],
  [-1, 1],
  [-100, 100],
  [-1000, 1000],
];

/** Sample grid used for feedback (the default view, nudged off "nice" x values). */
const FEEDBACK_X = Array.from({ length: 401 }, (_, i) => -10 + i * 0.05 + 0.0123);

export function judgeGuess(target: RealFn, guess: RealFn): GuessResult {
  const correct = EXACT_DOMAINS.every(
    (domain, i) => compareFunctions(target, guess, { domain, samples: 400, seed: 7 + i }).equivalent,
  );
  const closeness = visualCloseness(target, guess);
  if (correct) return { correct, closeness: 1, message: 'Correct! Your function matches f(x).' };
  return { correct, closeness, message: describeDifference(target, guess, closeness) };
}

/** Fraction of view samples where the two are within ~2% (or both undefined). */
function visualCloseness(f: RealFn, g: RealFn): number {
  let close = 0;
  for (const x of FEEDBACK_X) {
    const a = f(x);
    const b = g(x);
    const fa = Number.isFinite(a);
    const fb = Number.isFinite(b);
    if (fa && fb ? Math.abs(a - b) <= 0.02 * Math.max(1, Math.abs(a), Math.abs(b)) : fa === fb) close++;
  }
  return close / FEEDBACK_X.length;
}

const fmt = (n: number) => String(Number(n.toPrecision(3)));
const isConstant = (values: number[], tol: number) => {
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  return { mean, constant: values.every((v) => Math.abs(v - mean) <= tol * Math.max(1, Math.abs(mean))) };
};

/** Explains how the guess differs, without giving away the formula. */
function describeDifference(f: RealFn, g: RealFn, closeness: number): string {
  const pairs: [number, number, number][] = [];
  let onlyTarget = 0;
  let onlyGuess = 0;
  for (const x of FEEDBACK_X) {
    const a = f(x);
    const b = g(x);
    const fa = Number.isFinite(a);
    const fb = Number.isFinite(b);
    if (fa && fb) pairs.push([x, a, b]);
    else if (fa) onlyTarget++;
    else if (fb) onlyGuess++;
  }
  const n = FEEDBACK_X.length;
  if (pairs.length < 10) return 'Your guess and f(x) are hardly ever defined at the same x.';

  const domainNote =
    onlyGuess > n * 0.05
      ? 'Your guess is defined in places where f(x) isn’t.'
      : onlyTarget > n * 0.05
        ? 'f(x) is defined in places where your guess isn’t.'
        : '';
  // Same curve wherever both exist: the domain is the whole difference.
  const agreeOnCommon = pairs.filter(([, a, b]) => Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a))).length;
  if (domainNote && agreeOnCommon >= 0.9 * pairs.length) return `Right curve where both are defined! ${domainNote}`;

  const tol = 1e-6;
  const shift = isConstant(
    pairs.map(([, a, b]) => b - a),
    tol,
  );
  if (shift.constant && Math.abs(shift.mean) > 1e-9) {
    return `Right shape! It's ${shift.mean > 0 ? 'above' : 'below'} f(x) by ${fmt(Math.abs(shift.mean))} everywhere.`;
  }
  const ratios = pairs.filter(([, a]) => Math.abs(a) > 1e-6).map(([, a, b]) => b / a);
  if (ratios.length > 10) {
    const scale = isConstant(ratios, tol);
    if (scale.constant && Math.abs(scale.mean - 1) > 1e-9) {
      if (Math.abs(scale.mean + 1) < 1e-6) return 'Right shape, but upside down (reflected over the x-axis).';
      return `Right shape, but ${Math.abs(scale.mean) > 1 ? 'stretched' : 'squashed'} vertically by a factor of ${fmt(Math.abs(scale.mean))}${scale.mean < 0 ? ' and flipped' : ''}.`;
    }
  }
  const h = horizontalShift(f, g);
  if (h !== null) return `Right shape! It's shifted ${h > 0 ? 'right' : 'left'} by ${fmt(Math.abs(h))}.`;

  const pct = Math.round(closeness * 100);
  const lead = pct >= 90 ? 'Very close' : pct >= 60 ? 'Getting closer' : pct >= 25 ? 'Partly there' : 'Not quite';
  return `${lead}: ${pct}% of the visible graph matches.${domainNote ? ` ${domainNote}` : ''}`;
}

/** If g(x) = f(x − h) for some h in [−10, 10] (step 0.25), returns h. */
function horizontalShift(f: RealFn, g: RealFn): number | null {
  const xs = FEEDBACK_X.filter((_, i) => i % 8 === 0);
  for (let k = -40; k <= 40; k++) {
    if (k === 0) continue;
    const h = k / 4;
    let compared = 0;
    let ok = true;
    for (const x of xs) {
      const a = f(x - h);
      const b = g(x);
      if (!Number.isFinite(a) || !Number.isFinite(b)) {
        if (Number.isFinite(a) !== Number.isFinite(b)) {
          ok = false;
          break;
        }
        continue;
      }
      compared++;
      if (Math.abs(a - b) > 1e-6 * Math.max(1, Math.abs(a))) {
        ok = false;
        break;
      }
    }
    if (ok && compared >= 10) return h;
  }
  return null;
}
