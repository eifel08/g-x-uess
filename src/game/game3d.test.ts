import { describe, expect, it } from 'vitest';
import { compileExpressions, type CompileOptions } from '../math/compile';
import type { RowResult } from '../math/types';
import { DIFFICULTIES, type Difficulty } from './generator';
import { compileTarget3D, generateTarget3D, isGoodTarget3D } from './generator3d';
import { hintsFor3D } from './hints3d';
import { judgeGuess3D } from './judge3d';

const rows3d = (texts: string[], options: CompileOptions = {}) =>
  compileExpressions(
    texts.map((text, i) => ({ id: String(i), text })),
    { dimension: 3, ...options },
  );
const one = (text: string, options?: CompileOptions) => rows3d([text], options)['0'];
const F = (r: RowResult) => {
  if (r.kind !== 'surface') throw new Error(JSON.stringify(r));
  return r.F;
};
const surface = (text: string) => F(one(text));

describe('3D expressions', () => {
  it('plots z = …, bare expressions and definitions as surfaces', () => {
    expect(surface('z = x^2 + y^2')(1, 2)).toBe(5);
    expect(surface('sin(x) + cos(y)')(0, 0)).toBe(1);
    expect(surface('z = 3')(7, -7)).toBe(3); // horizontal plane
    const r = rows3d(['h(x, y) = x y', 'g(x) = 2x', 'k(a, b, c) = a']);
    expect(F(r['0'])(2, 3)).toBe(6);
    expect(F(r['1'])(2, 99)).toBe(4); // extruded along y
    expect(r['2']).toEqual({ kind: 'definition', name: 'k' });
  });

  it('supports the function library, constants and user definitions', () => {
    const cases: [string, number, number, number][] = [
      ['sqrt(x^2 + y^2)', 3, 4, 5],
      ['ln(x y)', Math.E, 1, 1],
      ['e^(x + y)', 0, 0, 1],
      ['|x - y|', 1, 4, 3],
      ['max(x, y) - min(x, y)', 1, 4, 3],
      ['atan(y/x)', 1, 1, Math.PI / 4],
      ['pi x', 1, 0, Math.PI],
      ['log_2(x) + y^(1/3)', 8, 27, 6],
    ];
    for (const [text, x, y, z] of cases) expect(surface(text)(x, y), text).toBeCloseTo(z, 12);
    const r = rows3d(['a = 2', 'z = a x + y']);
    expect(F(r['1'])(1, 1)).toBe(3);
    expect(r['0']).toEqual({ kind: 'value', value: 2, name: 'a' });
    expect(one('2 + 3')).toEqual({ kind: 'value', value: 5 });
  });

  it('respects degree mode', () => {
    expect(F(one('z = sin(x) + cos(y)', { angleMode: 'deg' }))(90, 0)).toBeCloseTo(2, 12);
  });

  it('returns NaN for undefined points instead of throwing', () => {
    expect(surface('1/(x - y)')(2, 2)).not.toBeLessThan(Infinity);
    expect(surface('sqrt(x)')(-1, 0)).toBeNaN();
    expect(surface('ln(x)')(-1, 5)).toBeNaN();
  });

  it('gives clear errors for unsupported 3D input', () => {
    expect(one('x^2 + y^2 + z^2 = 4').kind).toBe('error');
    expect(one('z < x')).toEqual({ kind: 'error', message: "Inequalities aren't supported in 3D yet" });
    expect(one('y = x^2')).toEqual({ kind: 'error', message: 'In 3D, write surfaces as z = …, e.g. z = x^2 + y^2' });
    expect(one('z = z + 1').kind).toBe('error');
    expect(one('x + z')).toEqual({ kind: 'error', message: 'z can only appear as z = …' });
    expect(one('z = x +')).toEqual({ kind: 'error', message: 'Expression is incomplete' });
    expect(one('z = q x')).toEqual({ kind: 'error', message: '"q" is not defined' });
  });

  it('exposes a two-variable hidden f and tracks its use', () => {
    const f = (x: number, y: number) => x + y;
    const r = rows3d(['z = sin(f(x, y))', 'z = f(x, y) - 1', 'z = x + y', 'f(1, 2)', 'f(x)'], { externals: { f } });
    expect(F(r['0'])(1, 0)).toBeCloseTo(Math.sin(1), 12);
    expect(r['1']).toMatchObject({ kind: 'surface', usesExternal: ['f'] });
    expect(r['2']).not.toHaveProperty('usesExternal');
    expect(r['3']).toEqual({ kind: 'value', value: 3 });
    expect(r['4']).toEqual({ kind: 'error', message: 'f takes 2 arguments' });
  });

  it('leaves the 2D calculator unchanged', () => {
    expect(compileExpressions([{ id: 'a', text: 'y = x^2' }]).a.kind).toBe('curve');
    expect(compileExpressions([{ id: 'a', text: 'z = x' }]).a.kind).toBe('error');
  });
});

const FAMILIES: Record<Difficulty, string[]> = {
  1: ['plane', 'paraboloid', 'quadratic'],
  2: ['paraboloid', 'elliptic paraboloid', 'saddle', 'cone', 'absolute value', 'square root'],
  3: ['trigonometric', 'radial wave', 'cubic', 'exponential', 'logarithmic'],
  4: ['product', 'ratio', 'radial wave', 'polynomial', 'combined'],
  5: ['modulated wave', 'localized peaks', 'composition', 'subtle combination'],
};

describe('generateTarget3D', () => {
  it.each(DIFFICULTIES)('difficulty %i: valid, visible, two-variable, varied', (d) => {
    const expressions = new Set<string>();
    const families = new Set<string>();
    for (let seed = 1; seed <= 100; seed++) {
      const t = generateTarget3D(d, seed);
      expect(t.difficulty).toBe(d);
      expect(FAMILIES[d]).toContain(t.family);
      expect(compileTarget3D(t.expression), t.expression).not.toBeNull();
      expect(isGoodTarget3D(t.expression), t.expression).toBe(true);
      // Clean formatting: no "+ -", "1x", "×0".
      expect(t.expression, t.expression).not.toMatch(/\+ -|- -|(^|[^\d.])1[xy]|(^|[^\d.])0[xy(]/);
      expressions.add(t.expression);
      families.add(t.family);
    }
    expect(expressions.size).toBeGreaterThan(30);
    expect(families.size).toBe(FAMILIES[d].length);
  });

  it('is deterministic per seed and differs from the 2D target', () => {
    expect(generateTarget3D(4, 9)).toEqual(generateTarget3D(4, 9));
  });
});

describe('judgeGuess3D', () => {
  it('accepts algebraically equivalent surfaces', () => {
    const cases: [string, string][] = [
      ['(x + y)^2', 'x^2 + 2x y + y^2'],
      ['sin(x)cos(y)', '(sin(x + y) + sin(x - y))/2'],
      ['e^(-(x^2 + y^2)/4)', 'e^(-x^2/4) e^(-y^2/4)'],
      ['ln(x^2 + y^2 + 1)', 'ln(x^2 + y^2 + 1)'],
      ['1/(x - y)', '-1/(y - x)'], // pole along x = y
    ];
    for (const [t, g] of cases) expect(judgeGuess3D(surface(t), surface(g)).correct, `${t} vs ${g}`).toBe(true);
  });

  it('rejects different surfaces and respects domains', () => {
    expect(judgeGuess3D(surface('x^2 + y^2'), surface('x^2 + y^2 + 0.001')).correct).toBe(false);
    expect(judgeGuess3D(surface('sqrt(x y)'), surface('sqrt(x) sqrt(y)')).correct).toBe(false);
  });

  it('explains how a miss differs', () => {
    const m = (t: string, g: string) => judgeGuess3D(surface(t), surface(g)).message;
    expect(m('x^2 + y^2', 'x^2 + y^2 + 2')).toBe("Right shape! It's above f(x, y) by 2 everywhere.");
    expect(m('x y', '3x y')).toMatch(/stretched vertically by a factor of 3/);
    expect(m('x^2 - y^2', 'y^2 - x^2')).toMatch(/upside down/);
    expect(m('(x - 1)^2 + y^2', 'x^2 + y^2')).toBe("Right shape! It's shifted by 1 in the −x direction.");
    expect(m('x^2 + y^2', 'sin(x) + y')).toMatch(/% of the surface in view matches/);
  });
});

describe('hintsFor3D', () => {
  it('describes family, value at the origin, symmetry and the high point', () => {
    const t = { expression: '4 - x^2 - y^2', family: 'paraboloid', difficulty: 1 as Difficulty, seed: 0 };
    const hints = hintsFor3D(t, surface(t.expression));
    expect(hints[0]).toBe('f is a paraboloid surface.');
    expect(hints[1]).toBe('f(0, 0) = 4.');
    expect(hints[2]).toMatch(/radially symmetric/);
    expect(hints[3]).toBe('The highest point in view is near (0, 0, 4).');
    expect(hintsFor3D(t, surface('x + 2y'))[2]).toMatch(/f\(−x, −y\) = −f\(x, y\)/);
  });
});
