import { describe, expect, it } from 'vitest';
import { compileExpressions } from './compile';
import type { RowResult } from './types';

function compileOne(text: string): RowResult {
  return compileExpressions([{ id: 'a', text }]).a;
}

function curve(result: RowResult) {
  if (result.kind !== 'curve') throw new Error(`expected curve, got ${JSON.stringify(result)}`);
  return result.fn;
}

describe('compileExpressions', () => {
  it('handles empty rows', () => {
    expect(compileOne('   ').kind).toBe('empty');
  });

  it('plots bare expressions and y = …', () => {
    expect(curve(compileOne('x^2 + 1'))(3)).toBe(10);
    expect(curve(compileOne('y = 2x - 1'))(4)).toBe(7);
    expect(curve(compileOne('y = 3'))(100)).toBe(3);
  });

  it('supports the common function library', () => {
    const cases: [string, number, number][] = [
      ['sin(x)', Math.PI / 2, 1],
      ['cos(x)', 0, 1],
      ['tan(x)', Math.PI / 4, 1],
      ['sqrt(x)', 9, 3],
      ['abs(x)', -4, 4],
      ['exp(x)', 0, 1],
      ['ln(x)', Math.E, 1],
      ['log(x)', 1000, 3],
      ['log(x, 2)', 8, 3],
      ['|x - 3|', 1, 2],
      ['2x^3 - x + 4', 2, 18],
      ['π x', 1, Math.PI],
    ];
    for (const [text, x, y] of cases) {
      expect(curve(compileOne(text))(x), text).toBeCloseTo(y, 10);
    }
  });

  it('reads calculator-style implicit forms', () => {
    expect(curve(compileOne('sin x'))(Math.PI / 2)).toBeCloseTo(1);
    expect(curve(compileOne('2 sin x'))(Math.PI / 2)).toBeCloseTo(2);
    expect(curve(compileOne('x(x+1)'))(3)).toBe(12);
    expect(curve(compileOne('(x+1)(x-1)'))(3)).toBe(8);
  });

  it('returns NaN outside the real domain instead of complex numbers', () => {
    expect(curve(compileOne('sqrt(x)'))(-1)).toBeNaN();
    expect(curve(compileOne('ln(x)'))(-1)).toBeNaN();
  });

  it('evaluates constant expressions to values', () => {
    expect(compileOne('2 + 3 * 4')).toEqual({ kind: 'value', value: 14 });
  });

  it('links definitions across rows, in any order', () => {
    const rows = compileExpressions([
      { id: '1', text: 'g(x) = f(x) + a' },
      { id: '2', text: 'f(x) = x^2' },
      { id: '3', text: 'a = 10' },
      { id: '4', text: 'f(3)' },
      { id: '5', text: 'h(p, q) = p * q' },
      { id: '6', text: 'h(2, x)' },
    ]);
    expect(curve(rows['1'])(2)).toBe(14);
    expect(rows['2']).toMatchObject({ kind: 'curve', name: 'f' });
    expect(rows['3']).toEqual({ kind: 'value', value: 10, name: 'a' });
    expect(rows['4']).toEqual({ kind: 'value', value: 9 });
    expect(rows['5']).toEqual({ kind: 'definition', name: 'h' });
    expect(curve(rows['6'])(5)).toBe(10);
  });

  it('supports nested calls of the same function', () => {
    const rows = compileExpressions([
      { id: '1', text: 'f(x) = x + 1' },
      { id: '2', text: 'f(f(f(x)))' },
    ]);
    expect(curve(rows['2'])(0)).toBe(3);
  });

  it('reports syntax errors without throwing', () => {
    for (const text of ['sin(', '(x+1', 'x +', '2 *', 'y =']) {
      const result = compileOne(text);
      expect(result.kind, text).toBe('error');
    }
    expect(compileOne('sin(')).toEqual({ kind: 'error', message: 'Expression is incomplete' });
    expect(compileOne('(x+1')).toEqual({ kind: 'error', message: 'Missing closing parenthesis' });
    expect(compileOne('|x')).toEqual({ kind: 'error', message: 'Missing closing |' });
  });

  it('reports semantic errors', () => {
    expect(compileOne('foo(x)')).toEqual({ kind: 'error', message: 'Unknown function "foo"' });
    expect(compileOne('x + b')).toEqual({ kind: 'error', message: '"b" is not defined' });
    expect(compileOne('a = x + 1')).toEqual({ kind: 'error', message: 'Use a(x) = … to define a function of x' });
    expect(compileOne('sin(x) = 2')).toEqual({ kind: 'error', message: '"sin" is a reserved name' });
    expect(compileOne('"hello"').kind).toBe('error');
    expect(compileOne('[1, 2]').kind).toBe('error');
    expect(compileOne('5 cm').kind).toBe('error');
  });

  it('detects circular and duplicate definitions', () => {
    const rows = compileExpressions([
      { id: '1', text: 'f(x) = g(x)' },
      { id: '2', text: 'g(x) = f(x)' },
      { id: '3', text: 'f(x) + 1' },
      { id: '4', text: 'a = 1' },
      { id: '5', text: 'a = 2' },
    ]);
    expect(rows['1']).toEqual({ kind: 'error', message: 'Circular definition' });
    expect(rows['2']).toEqual({ kind: 'error', message: 'Circular definition' });
    expect(rows['3'].kind).toBe('error');
    expect(rows['4']).toEqual({ kind: 'error', message: '"a" is defined more than once' });
  });

  it('checks user function arity', () => {
    const rows = compileExpressions([
      { id: '1', text: 'f(x) = x' },
      { id: '2', text: 'f(x, 2)' },
    ]);
    expect(rows['2']).toEqual({ kind: 'error', message: 'f takes 1 argument' });
  });

  it('keeps disabled mathjs functions out of reach', () => {
    expect(compileOne('import(x)').kind).toBe('error');
    expect(compileOne('evaluate(x)').kind).toBe('error');
  });
});
