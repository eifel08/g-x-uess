import { compileExpressions } from '../math/compile';
import type { RealFn } from '../math/types';
import { mulberry32 } from './random';

export type Difficulty = 1 | 2 | 3 | 4 | 5;
export const DIFFICULTIES: readonly Difficulty[] = [1, 2, 3, 4, 5];

export interface TargetFunction {
  /** Calculator syntax, e.g. "2(x - 1)^2 + 3". Hidden until the round ends. */
  expression: string;
  /** Human-readable family, used for hints ("quadratic", "rational", …). */
  family: string;
  difficulty: Difficulty;
  seed: number;
}

import { coef, inner, num, plus, plusTerm, poly, shifted } from './format';

/* ------------------------------------------------------------------------ */
/* Templates                                                                 */
/* ------------------------------------------------------------------------ */

interface Gen {
  int(lo: number, hi: number, opts?: { nonZero?: boolean }): number;
  pick<T>(items: readonly T[]): T;
}

type Template = (g: Gen) => { expression: string; family: string };

const TEMPLATES: Record<Difficulty, Template[]> = {
  1: [
    (g) => ({
      expression: `${coef(g.pick([1, 2, 3, -1, -2, -3, 0.5, -0.5]), 'x')}${plus(g.int(-5, 5))}`,
      family: 'linear',
    }),
    (g) => ({ expression: `${g.pick(['', '-'])}x^2${plus(g.int(-5, 5, { nonZero: true }))}`, family: 'quadratic' }),
    (g) => ({ expression: `${shifted(g.int(-4, 4, { nonZero: true }))}^2${plus(g.int(-3, 3))}`, family: 'quadratic' }),
  ],
  2: [
    (g) => {
      const h = g.int(-4, 4);
      const k = h === 0 ? g.int(-4, 4, { nonZero: true }) : g.int(-4, 4);
      return { expression: `${coef(g.pick([-2, -1, -0.5, 0.5, 1, 2]), `${shifted(h)}^2`)}${plus(k)}`, family: 'quadratic' };
    },
    (g) => {
      const r1 = g.int(-5, 4);
      const r2 = g.int(r1 + 1, 5);
      return { expression: coef(g.pick([-1, 1, 0.5, -0.5]), `${shifted(r1)}${shifted(r2)}`), family: 'quadratic' };
    },
    (g) => ({
      expression: `${coef(g.pick([-2, -1, 1, 2, 0.5]), `|${inner(g.int(-4, 4))}|`)}${plus(g.int(-3, 3))}`,
      family: 'absolute value',
    }),
    (g) => ({
      expression: `${coef(g.pick([1, 2, -1, -2]), `sqrt(${inner(g.int(-5, 3))})`)}${plus(g.int(-3, 3))}`,
      family: 'square root',
    }),
    (g) => ({
      expression: `${g.pick([1, 2, 3, -1, -2])}/${shifted(g.int(-3, 3))}${plus(g.int(-2, 2))}`,
      family: 'reciprocal',
    }),
  ],
  3: [
    (g) => {
      const fn = g.pick(['sin', 'cos']);
      const inside = coef(g.pick([1, 2, 0.5, 3]), 'x');
      return {
        expression: `${coef(g.pick([1, 2, 3, -1, -2]), `${fn}(${inside})`)}${plus(g.int(-2, 2))}`,
        family: 'trigonometric',
      };
    },
    (g) => {
      const k = g.int(-3, 3);
      const forms = [
        () => `e^(${inner(g.int(-3, 3, { nonZero: true }))})${plus(k)}`,
        () => `${coef(g.pick([-1, 2, 0.5]), 'e^x')}${plus(k)}`,
        () => `2^x${plus(k)}`,
        () => `e^(-x)${plus(k)}`,
      ];
      return { expression: g.pick(forms)(), family: 'exponential' };
    },
    (g) => {
      const forms = [
        () => `ln(${inner(-g.int(-3, 4, { nonZero: true }))})${plus(g.int(-2, 2))}`,
        () => `${coef(g.pick([2, -1, 3, -2]), 'ln(x)')}${plus(g.int(-2, 2))}`,
      ];
      return { expression: g.pick(forms)(), family: 'logarithmic' };
    },
    (g) => {
      const forms = [
        () => `x^3 - ${g.int(1, 9)}x`,
        () => `${shifted(g.int(-2, 2, { nonZero: true }))}^3${plus(g.int(-3, 3))}`,
        () => `x^3/${g.pick([2, 4, 5])} - ${coef(g.int(1, 3), 'x')}`,
      ];
      return { expression: g.pick(forms)(), family: 'cubic' };
    },
  ],
  4: [
    (g) => {
      const a = g.pick([1, 2, -1, 3]);
      const c = g.int(-3, 3, { nonZero: true });
      let b = g.int(-4, 4);
      if (a * c + b === 0) b += 1; // (ax + b)/(x − c) must not cancel
      return { expression: `(${coef(a, 'x')}${plus(b)})/${shifted(c)}`, family: 'rational' };
    },
    (g) => {
      const p = g.int(-4, 3);
      const q = g.int(p + 1, 4);
      return { expression: `${g.pick([1, 2, 4, -2])}/(${shifted(p)}${shifted(q)})`, family: 'rational' };
    },
    (g) => ({ expression: `${coef(g.pick([2, 4, 6, -4]), 'x')}/(x^2 + ${g.int(1, 4)})`, family: 'rational' }),
    (g) => ({
      expression: coef(g.pick([1, 3, 4, -3]), `e^(-x/${g.pick([3, 4, 5])})sin(${coef(g.pick([1, 2, 3]), 'x')})`),
      family: 'damped trigonometric',
    }),
    (g) => {
      const fn = g.pick(['sin', 'cos']);
      const b = g.pick([2, 0.5, 3]);
      const inside = coef(b, shifted(g.int(-3, 3, { nonZero: true })));
      return {
        expression: `${coef(g.pick([1, 2, 3, -2]), `${fn}(${inside})`)}${plus(g.int(-2, 2))}`,
        family: 'trigonometric',
      };
    },
    (g) => {
      // Expanded cubic/quartic built from small integer roots, scaled to fit the view.
      const count = g.pick([3, 4]);
      const roots = Array.from({ length: count }, () => g.int(-4, 4));
      let coeffs = [1];
      for (const r of roots) coeffs = [...coeffs, 0].map((c, i) => c - r * (i > 0 ? coeffs[i - 1] : 0));
      const scale = count === 3 ? g.pick([0.25, 0.5]) : g.pick([0.05, 0.1]);
      return { expression: poly(coeffs.map((c) => Number((c * scale).toFixed(4)))), family: 'polynomial' };
    },
    (g) => {
      const forms = [() => `|x^2 - ${g.int(1, 9)}|`, () => `x^2/${g.pick([2, 4])}${plusTerm(g.pick([2, 3, -2]), 'sin(x)')}`];
      return { expression: g.pick(forms)(), family: 'combined' };
    },
  ],
  5: [
    (g) => {
      const forms = [
        () => `${coef(g.pick([2, 3]), `sin(x^2/${g.pick([4, 8])})`)}`,
        () => `e^(sin(${coef(g.pick([1, 2]), 'x')}))`,
        () => `ln(x^2 + ${g.int(1, 4)})${plus(-g.int(0, 2))}`,
        () => `${coef(g.pick([1, 2]), `sqrt(|${inner(g.int(-3, 3))}|)`)}${plus(-g.int(0, 3))}`,
        () => `cos(sqrt(|x|)${plus(g.int(1, 2))})`,
      ];
      return { expression: g.pick(forms)(), family: 'composition' };
    },
    (g) => {
      const forms = [
        () => `x sin(x)/${g.pick([2, 3, 4])}`,
        () => coef(g.pick([2, 3, 4]), `x e^(-x^2/${g.pick([4, 8])})`),
        () => `x cos(${g.pick([2, 3])}x)/${g.pick([2, 4])}`,
        () => `x^2 e^(-x)/${g.pick([2, 4])}`,
      ];
      return { expression: g.pick(forms)(), family: 'product' };
    },
    (g) => {
      const a = g.int(1, 4);
      const forms = [
        () => `${g.pick([3, 4, 5])}sin(x)/x`,
        () => `${g.pick([3, 4])}ln(x)/x`,
        () => `(x^2 - ${a})/(x^2 + ${a})`,
        () => `${coef(g.pick([3, 4]), 'x')}/(1 + |x|)`,
      ];
      return { expression: g.pick(forms)(), family: 'ratio' };
    },
    (g) => {
      const fn = g.pick(['sin', 'cos']);
      const b = g.pick([1.5, 0.75, 2.5, 1.25]);
      const phase = g.pick(['π/3', 'π/4', 'π/6', '1', '2']);
      return {
        expression: `${coef(g.pick([2, 3, -2]), `${fn}(${num(b)}x + ${phase})`)}${plus(g.int(-1, 1))}`,
        family: 'trigonometric',
      };
    },
    (g) => {
      const forms = [
        () => coef(g.pick([2, 3, 4]), '|sin(x)|'),
        () => `${g.pick([2, 4, 6])}sin(x)cos(x)`,
        () => `sqrt(x^2 + ${g.pick([4, 9])}) - ${g.int(1, 3)}`,
        () => `ln(e^x + 1)${plus(-g.int(1, 3))}`,
      ];
      return { expression: g.pick(forms)(), family: 'subtle transformation' };
    },
  ],
};

/* ------------------------------------------------------------------------ */
/* Generation and validation                                                 */
/* ------------------------------------------------------------------------ */

/** Compiles a target expression (always in radians) to a function of x. */
export function compileTarget(expression: string): RealFn | null {
  const r = compileExpressions([{ id: 'target', text: expression }]).target;
  return r.kind === 'curve' && !r.inequality ? r.fn : null;
}

/** The region a fresh game opens on (the default viewport on a typical screen). */
const VIEW = { xMin: -10, xMax: 10, yMin: -6, yMax: 6 };

/**
 * A target is good if it compiles to a function of x and is clearly visible
 * in the default view: defined and on-screen over a decent part of it, and
 * not (nearly) flat there.
 */
export function isGoodTarget(expression: string): boolean {
  const fn = compileTarget(expression);
  if (!fn) return false;
  const n = 400;
  let visible = 0;
  let lo = Infinity;
  let hi = -Infinity;
  for (let i = 0; i <= n; i++) {
    const x = VIEW.xMin + ((VIEW.xMax - VIEW.xMin) * i) / n + 1e-3; // nudge off exact integers
    const y = fn(x);
    if (Number.isFinite(y) && y >= VIEW.yMin && y <= VIEW.yMax) {
      visible++;
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
    }
  }
  return visible / (n + 1) >= 0.3 && hi - lo >= 1;
}

/**
 * Generates a hidden target for a difficulty. Deterministic for a given
 * seed, so a game can be restored from (difficulty, seed) without storing
 * the formula. Candidates that fail `isGoodTarget` are redrawn.
 */
export function generateTarget(difficulty: Difficulty, seed: number): TargetFunction {
  const rng = mulberry32(seed);
  const gen: Gen = {
    int(lo, hi, opts) {
      for (;;) {
        const v = lo + Math.floor(rng() * (hi - lo + 1));
        if (!opts?.nonZero || v !== 0) return v;
      }
    },
    pick: (items) => items[Math.floor(rng() * items.length)],
  };
  const templates = TEMPLATES[difficulty];
  for (let attempt = 0; attempt < 200; attempt++) {
    const { expression, family } = gen.pick(templates)(gen);
    if (isGoodTarget(expression)) return { expression, family, difficulty, seed };
  }
  return { expression: 'x^2 - 2', family: 'quadratic', difficulty, seed }; // practically unreachable
}

/** A fresh random seed. */
export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);
