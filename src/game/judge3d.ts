import type { RealFn2 } from '../math/types';
import type { GuessResult } from './judge';
import { mulberry32 } from './random';

/**
 * Domains for the exactness check, as half-widths of squares around the
 * origin: the default box, near the origin (densely), and far out.
 */
const EXACT_DOMAINS = [5, 1, 50, 500];
const SAMPLES = 300;

const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));

/** Points (x, y) in [−r, r]², deterministic per seed. */
function points(r: number, n: number, seed: number): [number, number][] {
  const rand = mulberry32(seed);
  return Array.from({ length: n }, () => [(rand() * 2 - 1) * r, (rand() * 2 - 1) * r]);
}

/** Every sample agrees: both undefined, or both defined and equal to rounding error. */
function equivalent(f: RealFn2, g: RealFn2): boolean {
  return EXACT_DOMAINS.every((r, i) =>
    points(r, SAMPLES, 11 + i).every(([x, y]) => {
      const a = f(x, y);
      const b = g(x, y);
      const fa = Number.isFinite(a);
      const fb = Number.isFinite(b);
      return fa && fb ? close(a, b, 1e-7) : fa === fb;
    }),
  );
}

/** Feedback grid over the default box, nudged off "nice" values. */
const VIEW_POINTS = points(5, 900, 3);

/** Judges a 3D guess z = g(x, y) against the hidden surface z = f(x, y). */
export function judgeGuess3D(target: RealFn2, guess: RealFn2): GuessResult {
  if (equivalent(target, guess)) return { correct: true, closeness: 1, message: 'Correct! Your surface matches f(x, y).' };

  const pairs: [number, number, number, number][] = [];
  let onlyTarget = 0;
  let onlyGuess = 0;
  let near = 0;
  for (const [x, y] of VIEW_POINTS) {
    const a = target(x, y);
    const b = guess(x, y);
    const fa = Number.isFinite(a);
    const fb = Number.isFinite(b);
    if (fa && fb) {
      pairs.push([x, y, a, b]);
      if (close(a, b, 0.02)) near++;
    } else if (fa) onlyTarget++;
    else if (fb) onlyGuess++;
    else near++;
  }
  const n = VIEW_POINTS.length;
  const closeness = near / n;
  const pct = Math.round(closeness * 100);
  if (pairs.length < 20) return { correct: false, closeness, message: 'Your guess and f(x, y) are hardly ever defined at the same points.' };

  const domainNote =
    onlyGuess > n * 0.05
      ? 'Your guess is defined in places where f(x, y) isn’t.'
      : onlyTarget > n * 0.05
        ? 'f(x, y) is defined in places where your guess isn’t.'
        : '';
  const agree = pairs.filter(([, , a, b]) => close(a, b, 1e-6)).length;
  if (domainNote && agree >= 0.9 * pairs.length) {
    return { correct: false, closeness, message: `Right surface where both are defined! ${domainNote}` };
  }

  const fmt = (v: number) => String(Number(v.toPrecision(3)));
  const diffs = pairs.map(([, , a, b]) => b - a);
  const mean = diffs.reduce((s, d) => s + d, 0) / diffs.length;
  if (Math.abs(mean) > 1e-9 && diffs.every((d) => Math.abs(d - mean) <= 1e-6 * Math.max(1, Math.abs(mean)))) {
    return { correct: false, closeness, message: `Right shape! It's ${mean > 0 ? 'above' : 'below'} f(x, y) by ${fmt(Math.abs(mean))} everywhere.` };
  }
  const ratios = pairs.filter(([, , a]) => Math.abs(a) > 1e-6).map(([, , a, b]) => b / a);
  if (ratios.length > 20) {
    const r = ratios[0];
    if (Math.abs(r - 1) > 1e-9 && ratios.every((q) => Math.abs(q - r) <= 1e-6 * Math.max(1, Math.abs(r)))) {
      if (Math.abs(r + 1) < 1e-6) return { correct: false, closeness, message: 'Right shape, but upside down (flipped over the xy-plane).' };
      return {
        correct: false,
        closeness,
        message: `Right shape, but ${Math.abs(r) > 1 ? 'stretched' : 'squashed'} vertically by a factor of ${fmt(Math.abs(r))}${r < 0 ? ' and flipped' : ''}.`,
      };
    }
  }
  for (const axis of ['x', 'y'] as const) {
    const h = shiftAlong(target, guess, axis);
    if (h !== null) {
      const dir = axis === 'x' ? (h > 0 ? '+x' : '−x') : h > 0 ? '+y' : '−y';
      return { correct: false, closeness, message: `Right shape! It's shifted by ${fmt(Math.abs(h))} in the ${dir} direction.` };
    }
  }
  const lead = pct >= 90 ? 'Very close' : pct >= 60 ? 'Getting closer' : pct >= 25 ? 'Partly there' : 'Not quite';
  return { correct: false, closeness, message: `${lead}: ${pct}% of the surface in view matches.${domainNote ? ` ${domainNote}` : ''}` };
}

/** If g(x, y) = f(x − h, y) (or f(x, y − h)) for h in [−5, 5] (step 0.25), returns h. */
function shiftAlong(f: RealFn2, g: RealFn2, axis: 'x' | 'y'): number | null {
  const sample = VIEW_POINTS.slice(0, 60);
  for (let k = -20; k <= 20; k++) {
    if (k === 0) continue;
    const h = k / 4;
    let compared = 0;
    let ok = true;
    for (const [x, y] of sample) {
      const a = axis === 'x' ? f(x - h, y) : f(x, y - h);
      const b = g(x, y);
      if (Number.isFinite(a) !== Number.isFinite(b)) {
        ok = false;
        break;
      }
      if (!Number.isFinite(a)) continue;
      compared++;
      if (!close(a, b, 1e-6)) {
        ok = false;
        break;
      }
    }
    if (ok && compared >= 20) return h;
  }
  return null;
}
