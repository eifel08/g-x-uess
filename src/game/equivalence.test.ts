import { describe, expect, it } from 'vitest';
import { compileExpressions } from '../math/compile';
import { compareFunctions } from './equivalence';

const fn = (text: string) => {
  const r = compileExpressions([{ id: 'a', text }]).a;
  if (r.kind !== 'curve') throw new Error(text);
  return r.fn;
};

describe('compareFunctions', () => {
  it('accepts algebraically equal forms', () => {
    expect(compareFunctions(fn('2x + 2'), fn('2(x+1)')).equivalent).toBe(true);
    expect(compareFunctions(fn('sin(x)^2'), fn('1 - cos(x)^2')).equivalent).toBe(true);
    expect(compareFunctions(fn('sqrt(x)^2'), fn('x'), { domain: [0, 10] }).equivalent).toBe(true);
  });

  it('rejects different functions and reports a counterexample', () => {
    const result = compareFunctions(fn('x^2'), fn('x^2 + 0.01'));
    expect(result.equivalent).toBe(false);
    expect(result.counterexample).toBeTypeOf('number');
  });

  it('treats domain differences as a mismatch', () => {
    expect(compareFunctions(fn('sqrt(x)^2'), fn('x')).equivalent).toBe(false);
  });
});
