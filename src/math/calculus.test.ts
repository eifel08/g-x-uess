import { describe, expect, it } from 'vitest';
import { compileExpressions, type CompileOptions } from './compile';
import { integrate, nthDerivative } from './numeric';
import type { RowResult } from './types';

function rows(texts: string[], options?: CompileOptions) {
  return compileExpressions(
    texts.map((text, i) => ({ id: String(i), text })),
    options,
  );
}
const one = (text: string, options?: CompileOptions) => rows([text], options)['0'];
const curve = (r: RowResult) => {
  if (r.kind !== 'curve') throw new Error(JSON.stringify(r));
  return r.fn;
};
const value = (r: RowResult) => {
  if (r.kind !== 'value') throw new Error(JSON.stringify(r));
  return r.value;
};

describe('numeric core', () => {
  it('differentiates accurately', () => {
    expect(nthDerivative(Math.sin, 1)).toBeCloseTo(Math.cos(1), 10);
    expect(nthDerivative(Math.exp, 2, 2)).toBeCloseTo(Math.exp(2), 6);
    expect(nthDerivative((x) => x ** 4, 1, 3)).toBeCloseTo(24, 3);
    expect(nthDerivative(Math.sqrt, 0)).toBeNaN();
  });

  it('integrates finite, reversed and infinite ranges', () => {
    expect(integrate(Math.sin, 0, Math.PI)).toBeCloseTo(2, 12);
    expect(integrate((x) => x * x, 3, 0)).toBeCloseTo(-9, 12);
    expect(integrate((x) => Math.exp(-x), 0, Infinity)).toBeCloseTo(1, 8);
    expect(integrate((x) => Math.exp(-x * x), -Infinity, Infinity)).toBeCloseTo(Math.sqrt(Math.PI), 8);
    expect(integrate(() => NaN, 0, 1)).toBeNaN();
  });
});

describe('calculus syntax', () => {
  it('supports d/dx', () => {
    expect(curve(one('d/dx(x^3)'))(2)).toBeCloseTo(12, 8);
    expect(curve(one('d/dx sin(x)'))(0)).toBeCloseTo(1, 8);
    expect(curve(one('d/dx(d/dx(x^3))'))(1)).toBeCloseTo(6, 5);
    expect(curve(one('d/dx(5)'))(3)).toBeCloseTo(0, 8);
  });

  it('supports prime notation for user and built-in functions', () => {
    const r = rows(['f(x) = x^3', "f'(x)", "f''(x)", 'f′(2)', "sin'(x)", "a = f'(1)"]);
    expect(curve(r['1'])(2)).toBeCloseTo(12, 6);
    expect(curve(r['2'])(2)).toBeCloseTo(12, 4);
    expect(value(r['3'])).toBeCloseTo(12, 6);
    expect(curve(r['4'])(0)).toBeCloseTo(1, 8);
    expect(value(r['5'])).toBeCloseTo(3, 6);
  });

  it('rejects bad primes', () => {
    expect(one("g'(x)")).toEqual({ kind: 'error', message: 'Unknown function "g"' });
    const r = rows(['h(a, b) = a + b', "h'(x)"]);
    expect(r['1'].kind).toBe('error');
  });

  it('supports definite integrals with any bound variable', () => {
    expect(value(one('int(t, 0, 1, t^2)'))).toBeCloseTo(1 / 3, 12);
    expect(value(one('∫(t, 0, ∞, e^(-t))'))).toBeCloseTo(1, 8);
    expect(curve(one('int(t, 0, x, cos(t))'))(1)).toBeCloseTo(Math.sin(1), 10);
    expect(value(one('int(x, 0, 2, x)'))).toBeCloseTo(2, 10); // bound x shadows the row's x
    expect(curve(one('int(x, 0, 2, x) + x'))(1)).toBeCloseTo(3, 10);
  });

  it('supports sums and products', () => {
    expect(value(one('sum(n, 1, 10, n)'))).toBe(55);
    expect(value(one('∏(n, 1, 5, n)'))).toBe(120);
    expect(curve(one('sum(n, 0, 20, x^n / n!)'))(1)).toBeCloseTo(Math.E, 10);
    expect(value(one('sum(n, 5, 1, n)'))).toBe(0);
  });

  it('validates special-form shapes', () => {
    expect(one('int(0, 1, x)')).toEqual({ kind: 'error', message: 'Use int(t, a, b, expression)' });
    expect(one('sum(pi, 1, 2, 3)').kind).toBe('error');
    expect(one('int(t, 0, 1, t + q)')).toEqual({ kind: 'error', message: '"q" is not defined' });
  });
});

describe('functions and lists', () => {
  it('supports custom log bases and inverse-trig superscripts', () => {
    expect(value(one('log_2(8)'))).toBeCloseTo(3, 12);
    expect(value(one('log_{10}(1000)'))).toBeCloseTo(3, 12);
    expect(value(one('sin^-1(1)'))).toBeCloseTo(Math.PI / 2, 12);
    expect(value(one('cos⁻¹(0)'))).toBeCloseTo(Math.PI / 2, 12);
  });

  it('supports gcd, lcm and statistics on lists and ranges', () => {
    expect(value(one('gcd(12, 18)'))).toBe(6);
    expect(value(one('lcm(4, 6)'))).toBe(12);
    expect(value(one('mean([1, 2, 3, 4])'))).toBe(2.5);
    expect(value(one('median([5, 1, 3])'))).toBe(3);
    expect(value(one('total([1...100])'))).toBe(5050);
    expect(value(one('length([1...10])'))).toBe(10);
    expect(value(one('max([3, 9, 2])'))).toBe(9);
    expect(value(one('min(4, 2)'))).toBe(2);
    expect(value(one('stdev([2, 4, 4, 4, 5, 5, 7, 9])'))).toBeCloseTo(2.138, 3);
    expect(value(one('var([1, 2, 3, 4])'))).toBeCloseTo(5 / 3, 12);
    expect(curve(one('mean([x, 2x])'))(2)).toBe(3);
  });

  it('only allows lists where they make sense', () => {
    expect(one('[1, 2, 3]').kind).toBe('error');
    expect(one('sin([1, 2])').kind).toBe('error');
  });

  it('accepts unicode symbols and inequalities', () => {
    expect(value(one('3 ≤ 4'))).toBe(1);
    expect(one('y < x^2')).toEqual({ kind: 'error', message: 'Inequalities in y (shaded regions) are not supported yet' });
    expect(one('x^2 + y^2 = 4')).toEqual({ kind: 'error', message: 'Equations like x² + y² = 4 are not supported yet' });
  });
});

describe('angle modes', () => {
  it('uses radians by default', () => {
    expect(value(one('sin(pi/2)'))).toBeCloseTo(1, 12);
  });

  it('uses degrees for trig in degree mode, exactly at right angles', () => {
    const deg = { angleMode: 'deg' as const };
    expect(value(one('sin(30)', deg))).toBeCloseTo(0.5, 12);
    expect(value(one('sin(180)', deg))).toBe(0);
    expect(value(one('cos(90)', deg))).toBe(0);
    expect(value(one('tan(45)', deg))).toBeCloseTo(1, 12);
    expect(value(one('arcsin(1)', deg))).toBeCloseTo(90, 12);
    expect(value(one('atan2(1, 1)', deg))).toBeCloseTo(45, 12);
    expect(value(one('sinh(1)', deg))).toBeCloseTo(Math.sinh(1), 12);
    // Derivatives and user functions follow the mode too.
    const r = rows(['f(x) = sin(x)', "f'(0)"], deg);
    expect(value(r['1'])).toBeCloseTo(Math.PI / 180, 8);
  });
});
