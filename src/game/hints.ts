import type { RealFn } from '../math/types';
import type { TargetFunction } from './generator';

const fmt = (n: number) => String(Number(n.toPrecision(4)));

/**
 * Progressive hints for a target, from vague to specific. None of them
 * reveal the formula: family, y-intercept, symmetry, then zeros.
 */
export function hintsFor(target: TargetFunction, fn: RealFn): string[] {
  const hints = [`f is a ${target.family} function.`];

  const y0 = fn(0);
  hints.push(Number.isFinite(y0) ? `f(0) = ${fmt(y0)}.` : 'f(0) is undefined: f has no y-intercept.');

  const xs = Array.from({ length: 200 }, (_, i) => 0.05 + i * 0.05);
  const both = xs.filter((x) => Number.isFinite(fn(x)) && Number.isFinite(fn(-x)));
  const near = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  if (both.length > 20 && both.every((x) => near(fn(x), fn(-x)))) hints.push('f is even: its graph is symmetric about the y-axis.');
  else if (both.length > 20 && both.every((x) => near(fn(x), -fn(-x)))) hints.push('f is odd: its graph is symmetric about the origin.');
  else hints.push('f is neither even nor odd.');

  const zeros: number[] = [];
  for (let i = 0; i < 2000; i++) {
    const a = -10 + i * 0.01 + 0.0007;
    const b = a + 0.01;
    const fa = fn(a);
    const fb = fn(b);
    if (Number.isFinite(fa) && Number.isFinite(fb) && fa * fb < 0) {
      let lo = a;
      let hi = b;
      for (let k = 0; k < 50; k++) {
        const mid = (lo + hi) / 2;
        if (Math.sign(fn(mid)) === Math.sign(fn(lo))) lo = mid;
        else hi = mid;
      }
      if (Math.abs(fn(lo)) < 1e-6) zeros.push(lo);
    }
  }
  if (zeros.length === 0) hints.push('f never crosses the x-axis between −10 and 10.');
  else if (zeros.length <= 4) hints.push(`f crosses the x-axis at x ≈ ${zeros.map((z) => fmt(Number(z.toFixed(3)))).join(', ')}.`);
  else hints.push(`f crosses the x-axis ${zeros.length} times between −10 and 10.`);
  return hints;
}
