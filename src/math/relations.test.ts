import { describe, expect, it } from 'vitest';
import { compileExpressions } from './compile';
import { satisfies, type RowResult } from './types';

const rows = (...texts: string[]) => compileExpressions(texts.map((text, i) => ({ id: String(i), text })));
const one = (text: string) => rows(text)['0'];

function asCurve(r: RowResult) {
  if (r.kind !== 'curve') throw new Error(JSON.stringify(r));
  return r;
}
function asImplicit(r: RowResult) {
  if (r.kind !== 'implicit') throw new Error(JSON.stringify(r));
  return r;
}

describe('vertical lines', () => {
  it('parses x = constant expressions', () => {
    expect(one('x = 3')).toEqual({ kind: 'vline', x: 3, inequality: undefined });
    expect(one('x = -2.5')).toMatchObject({ kind: 'vline', x: -2.5 });
    expect(one('x = sin(1)')).toMatchObject({ kind: 'vline', x: Math.sin(1) });
    expect(one('3 = x')).toMatchObject({ kind: 'vline', x: 3 });
    expect(rows('a = 4', 'x = a / 2')['1']).toMatchObject({ kind: 'vline', x: 2 });
  });

  it('parses half-planes and flips reversed comparisons', () => {
    expect(one('x > 2')).toMatchObject({ kind: 'vline', x: 2, inequality: '>' });
    expect(one('x <= -1')).toMatchObject({ kind: 'vline', x: -1, inequality: '<=' });
    expect(one('2 < x')).toMatchObject({ kind: 'vline', x: 2, inequality: '>' });
  });

  it('rejects non-finite positions', () => {
    expect(one('x = 1/0')).toEqual({ kind: 'error', message: 'x = … must be a finite number' });
  });
});

describe('shaded inequalities of y', () => {
  it('handles all four operators', () => {
    for (const op of ['<', '<=', '>', '>='] as const) {
      const r = asCurve(one(`y ${op} x^2`));
      expect(r.inequality).toBe(op);
      expect(r.fn(3)).toBe(9);
    }
  });

  it('accepts unicode operators and y on the right', () => {
    expect(one('y ≤ x + 1')).toMatchObject({ kind: 'curve', inequality: '<=' });
    expect(one('sin(x) < y')).toMatchObject({ kind: 'curve', inequality: '>' });
    expect(one('y >= -x^2 + 4')).toMatchObject({ kind: 'curve', inequality: '>=' });
  });
});

describe('implicit equations', () => {
  it('recognises circles exactly', () => {
    expect(asImplicit(one('x^2 + y^2 = 4')).circle).toEqual({ cx: 0, cy: 0, r: 2 });
    expect(asImplicit(one('(x - 1)^2 + (y + 2)^2 = 9')).circle).toEqual({ cx: 1, cy: -2, r: 3 });
    const c = asImplicit(one('x^2 + y^2 + 2x - 4y = 4')).circle!; // (x+1)² + (y−2)² = 9
    expect(c.cx).toBeCloseTo(-1, 12);
    expect(c.cy).toBeCloseTo(2, 12);
    expect(c.r).toBeCloseTo(3, 12);
    expect(asImplicit(one('2x^2 + 2y^2 = 8')).circle!.r).toBeCloseTo(2, 12);
    expect(asImplicit(rows('a = 3', 'x^2 + y^2 = a^2')['1']).circle!.r).toBeCloseTo(3, 12);
  });

  it('keeps the equation so regions can be tested', () => {
    const r = asImplicit(one('x^2 + y^2 < 4'));
    expect(r.inequality).toBe('<');
    expect(satisfies(r.F(0, 0), '<')).toBe(true);
    expect(satisfies(r.F(3, 0), '<')).toBe(false);
  });

  it('turns lines and equations linear in y into exact curves', () => {
    const line = asCurve(one('2y + x = 4'));
    expect(line.fn(2)).toBeCloseTo(1, 12);
    expect(asCurve(one('x^2 = 2y')).fn(2)).toBeCloseTo(2, 12);
    expect(asCurve(one('x y = 1')).fn(4)).toBeCloseTo(0.25, 12);
    expect(one('3x = 6')).toMatchObject({ kind: 'vline', x: 2 });
    expect(one('x + y < 1')).toMatchObject({ kind: 'curve', inequality: '<' });
    // −y > x  ⇔  y < −x
    const flipped = asCurve(one('-y > x'));
    expect(flipped.inequality).toBe('<');
    expect(flipped.fn(2)).toBeCloseTo(-2, 12);
  });

  it('falls back to generic implicit curves', () => {
    expect(asImplicit(one('x^2 / 4 + y^2 = 1')).circle).toBeUndefined(); // ellipse
    expect(asImplicit(one('x = y^2')).circle).toBeUndefined();
    expect(asImplicit(one('sin(x y) = 0.5')).F(1, Math.PI / 6)).toBeCloseTo(0, 12);
    expect(one('x^2 = 4').kind).toBe('implicit'); // two vertical lines
    // Coefficient of y changes sign → can't be a y-inequality, stays implicit.
    expect(one('x y > 1').kind).toBe('implicit');
  });

  it('reports clean errors for malformed or unsupported input', () => {
    expect(one('y < x <')).toMatchObject({ kind: 'error' });
    expect(one('1 < y < 2')).toEqual({ kind: 'error', message: 'Double inequalities like 1 < y < 2 are not supported yet' });
    expect(one('x = y = 2').kind).toBe('error');
    expect(one('2 = 3')).toEqual({ kind: 'error', message: 'An equation needs x or y, e.g. y = 2x or x = 3' });
    expect(one('y^2 + 1')).toEqual({ kind: 'error', message: 'y can only be used in an equation or inequality, e.g. y = x^2' });
    expect(one('x^2 + y^2 = q')).toEqual({ kind: 'error', message: '"q" is not defined' });
  });

  it('keeps existing behaviour for definitions and conditionals', () => {
    expect(rows('f(x) = x^2', 'y = f(x)')['1'].kind).toBe('curve');
    expect(one('3 ≤ 4')).toEqual({ kind: 'value', value: 1 });
    expect(asCurve(one('x > 0 ? x : -x')).fn(-3)).toBe(3);
  });
});
