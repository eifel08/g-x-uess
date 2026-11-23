import { describe, expect, it } from 'vitest';
import { compileExpressions } from './compile';
import type { RowResult } from './types';

const f = (x: number) => x * x - 1; // stands in for the game's hidden target
const rows = (...texts: string[]) =>
  compileExpressions(
    texts.map((text, i) => ({ id: String(i), text })),
    { externals: { f } },
  );
const curve = (r: RowResult) => {
  if (r.kind !== 'curve') throw new Error(JSON.stringify(r));
  return r;
};

describe('external functions', () => {
  it('can be called from any expression', () => {
    const r = rows('sin(f(x))', 'y = f(x) + 1', 'f(x - 2)', 'f(f(x))');
    expect(curve(r['0']).fn(2)).toBeCloseTo(Math.sin(3), 12);
    expect(curve(r['1']).fn(3)).toBe(9);
    expect(curve(r['2']).fn(5)).toBe(8);
    expect(curve(r['3']).fn(2)).toBe(8);
  });

  it('works in values, definitions, derivatives and relations', () => {
    const r = rows('f(3)', 'g(x) = 2f(x)', 'g(2)', "f'(x)", 'd/dx f(x)', 'y < f(x)', 'x^2 + f(y) = 4');
    expect(r['0']).toEqual({ kind: 'value', value: 8 });
    expect(r['2']).toEqual({ kind: 'value', value: 6 });
    expect(curve(r['3']).fn(2)).toBeCloseTo(4, 8);
    expect(curve(r['4']).fn(-1)).toBeCloseTo(-2, 8);
    expect(r['5']).toMatchObject({ kind: 'curve', inequality: '<' });
    expect(r['6'].kind).toBe('implicit');
  });

  it('reports which curves depend on them, directly or indirectly', () => {
    const r = rows('sin(f(x))', 'g(x) = f(x) + x', 'h(x) = g(x) * 2', 'y = h(x)', 'y = x^2 - 1');
    expect(curve(r['0']).usesExternal).toEqual(['f']);
    expect(curve(r['1']).usesExternal).toEqual(['f']);
    expect(curve(r['3']).usesExternal).toEqual(['f']); // through h → g → f
    expect(curve(r['4']).usesExternal).toBeUndefined();
  });

  it("can't be redefined, and keep their arity", () => {
    const r = rows('f(x) = x^3', 'f = 2', 'f(1, 2)');
    expect(r['0']).toEqual({ kind: 'error', message: '"f" is the hidden function. Pick another name, e.g. g(x) = …' });
    expect(r['1'].kind).toBe('error');
    expect(r['2']).toEqual({ kind: 'error', message: 'f takes 1 argument' });
  });

  it('leave f free for user definitions when not provided', () => {
    expect(compileExpressions([{ id: 'a', text: 'f(x) = x^3' }]).a.kind).toBe('curve');
  });
});
