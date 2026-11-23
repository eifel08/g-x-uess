import { describe, expect, it } from 'vitest';
import { compileExpressions } from '../math/compile';
import { compareFunctionsByIntegral, randomIntervals } from './integralEquivalence';

const fn = (text: string) => {
  const r = compileExpressions([{ id: 'a', text }]).a;
  if (r.kind !== 'curve') throw new Error(text);
  return r.fn;
};

const same = (a: string, b: string) => compareFunctionsByIntegral(fn(a), fn(b)).equivalent;

describe('randomIntervals', () => {
  it('produces 256 valid, deterministic intervals across many scales', () => {
    const list = randomIntervals(256);
    expect(list).toHaveLength(256);
    expect(randomIntervals(256)).toEqual(list);
    for (const { a, b } of list) expect(b).toBeGreaterThan(a);
    const widths = list.map(({ a, b }) => b - a);
    expect(Math.min(...widths)).toBeLessThan(1);
    expect(Math.max(...widths)).toBeGreaterThan(1e4);
    expect(list.some(({ a, b }) => Math.max(Math.abs(a), Math.abs(b)) > 1e4)).toBe(true);
    expect(list.some(({ a }) => a < 0)).toBe(true);
    expect(list.some(({ b }) => b > 0)).toBe(true);
  });
});

describe('compareFunctionsByIntegral', () => {
  it('accepts algebraically equal forms', () => {
    expect(same('2x + 2', '2(x+1)')).toBe(true);
    expect(same('sin(x)^2', '1 - cos(x)^2')).toBe(true);
    expect(same('(x+1)^2', 'x^2 + 2x + 1')).toBe(true);
    expect(same('exp(2 ln(abs(x)))', 'x^2')).toBe(true);
    expect(same('y = 0', 'y = 0')).toBe(true);
  });

  it('handles poles shared by both functions', () => {
    expect(same('1/x', 'x/x^2')).toBe(true);
    expect(same('tan(x)', 'sin(x)/cos(x)')).toBe(true);
  });

  it('rejects functions that differ, including small additive offsets', () => {
    expect(same('x^2', 'x^2 + 0.01')).toBe(false);
    expect(same('sin(x)', 'cos(x)')).toBe(false);
    expect(same('x^3', 'x^3 + x')).toBe(false);
    expect(same('y = 0', 'y = 0.001')).toBe(false);
  });

  it('rejects functions with different domains', () => {
    expect(same('sqrt(x)^2', 'x')).toBe(false);
  });

  it('reports a failing interval and the pass rate', () => {
    const result = compareFunctionsByIntegral(fn('abs(x)'), fn('x'));
    expect(result.equivalent).toBe(false);
    expect(result.agreement).toBeGreaterThan(0);
    expect(result.agreement).toBeLessThan(1);
    expect(result.counterexample!.a).toBeLessThan(0); // they differ only for x < 0
  });

  it('respects epsilon', () => {
    const f = fn('x^2');
    const g = fn('x^2 * (1 + 1e-4)');
    expect(compareFunctionsByIntegral(f, g, { epsilon: 1e-6 }).equivalent).toBe(false);
    expect(compareFunctionsByIntegral(f, g, { epsilon: 1e-3 }).equivalent).toBe(true);
  });
});
