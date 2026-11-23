import { describe, expect, it } from 'vitest';
import { compileExpressions } from '../math/compile';
import { compileTarget, DIFFICULTIES, generateTarget, isGoodTarget, type Difficulty } from './generator';
import { hintsFor } from './hints';
import { judgeGuess } from './judge';
import { gameReducer, initialGame } from './state';

const fn = (text: string) => {
  const r = compileExpressions([{ id: 'a', text }]).a;
  if (r.kind !== 'curve') throw new Error(`${text}: ${JSON.stringify(r)}`);
  return r.fn;
};

const FAMILIES: Record<Difficulty, string[]> = {
  1: ['linear', 'quadratic'],
  2: ['quadratic', 'absolute value', 'square root', 'reciprocal'],
  3: ['trigonometric', 'exponential', 'logarithmic', 'cubic'],
  4: ['rational', 'damped trigonometric', 'trigonometric', 'polynomial', 'combined'],
  5: ['composition', 'product', 'ratio', 'trigonometric', 'subtle transformation'],
};

describe('generateTarget', () => {
  it.each(DIFFICULTIES)('difficulty %i: valid, visible, varied, from the right families', (d) => {
    const expressions = new Set<string>();
    const families = new Set<string>();
    for (let seed = 1; seed <= 150; seed++) {
      const t = generateTarget(d, seed);
      expect(t.difficulty).toBe(d);
      expect(FAMILIES[d]).toContain(t.family);
      expect(compileTarget(t.expression), t.expression).not.toBeNull();
      expect(isGoodTarget(t.expression), t.expression).toBe(true);
      expressions.add(t.expression);
      families.add(t.family);
    }
    expect(expressions.size).toBeGreaterThan(40); // genuinely random
    expect(families.size).toBe(FAMILIES[d].length); // every family shows up
  });

  it('is deterministic per seed', () => {
    for (const d of DIFFICULTIES) expect(generateTarget(d, 42)).toEqual(generateTarget(d, 42));
  });

  it('avoids degenerate targets', () => {
    for (const d of DIFFICULTIES) {
      for (let seed = 1; seed <= 150; seed++) {
        const { expression } = generateTarget(d, seed);
        // No ×0, "+ 0", 1x or "+ -" (decimals like 0.5x are fine).
        expect(expression).not.toMatch(/(^|[^\d.])0(x|\()|[+-] 0(?![.\d])|(^|[^\d.])1x|\+ -|- -/);
        const f = compileTarget(expression)!;
        // Not constant: differs somewhere across the view.
        const ys = Array.from({ length: 41 }, (_, i) => f(-9.97 + i * 0.5)).filter(Number.isFinite);
        expect(new Set(ys.map((y) => y.toFixed(6))).size, expression).toBeGreaterThan(1);
      }
    }
  });

  it('formats coefficients and shifts cleanly', () => {
    const samples = DIFFICULTIES.flatMap((d) => Array.from({ length: 40 }, (_, i) => generateTarget(d, i + 1).expression));
    expect(samples.some((e) => /\(x - \d\)/.test(e))).toBe(true);
    expect(samples.some((e) => /\(x \+ \d\)/.test(e))).toBe(true);
  });
});

describe('judgeGuess', () => {
  it('accepts algebraically equivalent forms', () => {
    const cases: [string, string][] = [
      ['(x - 2)(x + 3)', 'x^2 + x - 6'],
      ['2(x - 1)^2 + 3', '2x^2 - 4x + 5'],
      ['|x - 1|', 'sqrt((x - 1)^2)'],
      ['e^(x - 2) + 1', 'e^x / e^2 + 1'],
      ['2sin(x)cos(x)', 'sin(2x)'],
      ['ln(x + 2)', 'ln(x + 2)'],
      ['3sin(x)/x', '3sin(x)/x'], // removable singularity at 0
      ['1/(x - 1)', '1/(x - 1)'], // pole
    ];
    for (const [target, guess] of cases) expect(judgeGuess(fn(target), fn(guess)).correct, `${target} vs ${guess}`).toBe(true);
  });

  it('respects domain restrictions', () => {
    expect(judgeGuess(fn('x'), fn('sqrt(x)^2')).correct).toBe(false);
    expect(judgeGuess(fn('2ln(x)'), fn('ln(x^2)')).correct).toBe(false);
    expect(judgeGuess(fn('sqrt(x)'), fn('sqrt(|x|)')).message).toBe(
      'Right curve where both are defined! Your guess is defined in places where f(x) isn’t.',
    );
    expect(judgeGuess(fn('ln(x)'), fn('sin(x)')).message).toMatch(/^Not quite: \d+% .* Your guess is defined in places/);
  });

  it('rejects near misses that only differ far away or by a little', () => {
    expect(judgeGuess(fn('x^2'), fn('x^2 + 0.001')).correct).toBe(false);
    expect(judgeGuess(fn('x^3'), fn('x^3 + x/1000')).correct).toBe(false);
  });

  it('explains common differences without revealing the formula', () => {
    expect(judgeGuess(fn('x^2'), fn('x^2 + 3')).message).toBe("Right shape! It's above f(x) by 3 everywhere.");
    expect(judgeGuess(fn('sin(x)'), fn('2sin(x)')).message).toMatch(/stretched vertically by a factor of 2/);
    expect(judgeGuess(fn('x^3'), fn('-x^3')).message).toMatch(/upside down/);
    expect(judgeGuess(fn('x^2'), fn('(x - 2)^2')).message).toBe("Right shape! It's shifted right by 2.");
    const far = judgeGuess(fn('x^2'), fn('sin(x)'));
    expect(far.correct).toBe(false);
    expect(far.message).toMatch(/% of the visible graph matches/);
    expect(far.closeness).toBeLessThan(0.5);
  });
});

describe('hintsFor', () => {
  it('gives family, intercept, symmetry and zeros without the formula', () => {
    const target = { expression: 'x^2 - 4', family: 'quadratic', difficulty: 1 as Difficulty, seed: 0 };
    const hints = hintsFor(target, fn(target.expression));
    expect(hints).toEqual([
      'f is a quadratic function.',
      'f(0) = -4.',
      'f is even: its graph is symmetric about the y-axis.',
      'f crosses the x-axis at x ≈ -2, 2.',
    ]);
    expect(hintsFor({ ...target, family: 'reciprocal' }, fn('1/x'))[1]).toMatch(/undefined/);
  });
});

describe('gameReducer', () => {
  const miss = { correct: false, closeness: 0.3, message: 'Not quite' };
  const hit = { correct: true, closeness: 1, message: 'Correct!' };

  it('counts attempts and records feedback for the submitting row', () => {
    let s = initialGame(1, 3);
    s = gameReducer(s, { type: 'submitted', rowId: 'r1', text: 'x^2', result: miss });
    expect(s.attempts).toBe(1);
    expect(s.status).toBe('playing');
    expect(s.feedback).toEqual({ rowId: 'r1', text: 'x^2', result: miss });
    s = gameReducer(s, { type: 'submitted', rowId: 'r2', text: 'x^3', result: hit });
    expect(s.attempts).toBe(2);
    expect(s.status).toBe('won');
    // After winning, further submissions are ignored.
    expect(gameReducer(s, { type: 'submitted', rowId: 'r1', text: 'x', result: miss })).toBe(s);
  });

  it('toggles target visibility, and shows the target on win / reveal', () => {
    let s = initialGame(1);
    expect(s.targetVisible).toBe(true);
    s = gameReducer(s, { type: 'toggleTarget' });
    expect(s.targetVisible).toBe(false);
    expect(gameReducer(s, { type: 'reveal' })).toMatchObject({ status: 'revealed', targetVisible: true });
    expect(gameReducer(s, { type: 'submitted', rowId: 'r', text: 't', result: hit }).targetVisible).toBe(true);
  });

  it('starts new functions at the current or a chosen difficulty', () => {
    let s = gameReducer(initialGame(1, 2), { type: 'submitted', rowId: 'r', text: 't', result: hit });
    s = gameReducer(s, { type: 'new', seed: 99 });
    expect(s).toMatchObject({ seed: 99, difficulty: 2, attempts: 0, status: 'playing', feedback: null });
    expect(gameReducer(s, { type: 'new', seed: 5, difficulty: 5 }).difficulty).toBe(5);
  });

  it('caps hints at the number available', () => {
    let s = initialGame(1);
    for (let i = 0; i < 10; i++) s = gameReducer(s, { type: 'hint', available: 4 });
    expect(s.hintsShown).toBe(4);
  });
});
