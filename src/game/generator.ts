import { compileExpressions } from '../math/compile';
import type { RealFn } from '../math/types';

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
import { makeGen, signed, type Gen } from './gen';

/* ------------------------------------------------------------------------ */
/* Parameter pools                                                           */
/* ------------------------------------------------------------------------ */

/** Slopes / scales: integers plus friendly decimals. */
const SLOPES = signed([1, 2, 3, 4, 5, 0.5, 1.5, 2.5, 0.25, 0.75]);
const SCALES = signed([0.25, 0.5, 1, 1.5, 2, 3]);
const SMALL_SCALES = signed([0.5, 1, 1.5, 2, 3]);
const FREQS = [0.25, 0.5, 1, 1.5, 2, 2.5, 3];
const PHASE_FREQS = [0.6, 0.75, 1.25, 1.5, 1.75, 2.5, 3.5];
const PHASES = ['π/2', 'π/3', 'π/4', 'π/6', '2π/3', '0.5', '1', '2'];

/* ------------------------------------------------------------------------ */
/* Templates                                                                 */
/* ------------------------------------------------------------------------ */

type Template = (g: Gen) => { expression: string; family: string };

const TEMPLATES: Record<Difficulty, Template[]> = {
  1: [
    (g) => ({ expression: `${coef(g.pick(SLOPES), 'x')}${plus(g.half(-8, 8))}`, family: 'linear' }),
    (g) => ({ expression: `${g.pick(['', '-'])}x/${g.pick([3, 5, 6])}${plus(g.half(-5, 5))}`, family: 'linear' }),
    (g) => ({
      expression: `${coef(g.pick(signed([0.25, 0.5, 0.75, 1, 1.5, 2, 3])), 'x^2')}${plus(g.half(-6, 6, { nonZero: true }))}`,
      family: 'quadratic',
    }),
    (g) => ({
      expression: `${g.pick(['', '-'])}${shifted(g.half(-6, 6, { nonZero: true }))}^2${plus(g.half(-8, 8))}`,
      family: 'quadratic',
    }),
  ],
  2: [
    (g) => {
      const h = g.half(-5, 5);
      const k = h === 0 ? g.half(-5, 5, { nonZero: true }) : g.half(-5, 5);
      return { expression: `${coef(g.pick(SCALES), `${shifted(h)}^2`)}${plus(k)}`, family: 'quadratic' };
    },
    (g) => {
      const [r1, r2] = g.pair([-6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5, 6]);
      return {
        expression: `${coef(g.pick(signed([0.25, 0.5, 1, 2])), `${shifted(r1)}${shifted(r2)}`)}${plus(g.int(-2, 2))}`,
        family: 'quadratic',
      };
    },
    (g) => ({
      expression: `${coef(g.pick(SMALL_SCALES), `|${inner(g.half(-5, 5))}|`)}${plus(g.half(-5, 5))}`,
      family: 'absolute value',
    }),
    (g) => {
      const h = g.int(-6, 6);
      // Square roots opening right, √(x − h), or left, √(h − x).
      const inside = g.pick([inner(h), h === 0 ? '-x' : `${num(h)} - x`]);
      return { expression: `${coef(g.pick(SMALL_SCALES), `sqrt(${inside})`)}${plus(g.half(-4, 4))}`, family: 'square root' };
    },
    (g) => ({
      expression: `${g.pick(signed([1, 2, 3, 4, 0.5]))}/${shifted(g.half(-4, 4))}${plus(g.half(-3, 3))}`,
      family: 'reciprocal',
    }),
  ],
  3: [
    (g) => {
      const fn = g.pick(['sin', 'cos']);
      return {
        expression: `${coef(g.pick(signed([0.5, 1, 1.5, 2, 2.5, 3])), `${fn}(${coef(g.pick(FREQS), 'x')})`)}${plus(g.half(-3, 3))}`,
        family: 'trigonometric',
      };
    },
    (g) => {
      const k = g.half(-4, 4);
      const forms = [
        () => `${coef(g.pick(signed([0.5, 1, 2, 3])), `e^(${coef(g.pick(signed([0.25, 0.5, 1, 1.5])), 'x')})`)}${plus(k)}`,
        () => `e^(${inner(g.half(-3, 3, { nonZero: true }))})${plus(k)}`,
        () => `${coef(g.pick([1, -1, 2, 0.5]), `${g.pick(['2', '3', '0.5'])}^x`)}${plus(k)}`,
      ];
      return { expression: g.pick(forms)(), family: 'exponential' };
    },
    (g) => {
      const fn = g.pick(['ln', 'ln', 'log']);
      return {
        expression: `${coef(g.pick(signed([0.5, 1, 1.5, 2, 3])), `${fn}(${inner(g.int(-6, 6))})`)}${plus(g.half(-3, 3))}`,
        family: 'logarithmic',
      };
    },
    (g) => {
      const forms = [
        () => {
          const b = g.int(0, 6);
          return `${coef(g.pick(signed([0.05, 0.1, 0.125, 0.2, 0.25, 0.5])), 'x^3')}${b ? plusTerm(-b, 'x') : ''}${plus(g.half(-3, 3))}`;
        },
        () => `${coef(g.pick(signed([0.1, 0.25, 0.5, 1])), `${shifted(g.half(-3, 3))}^3`)}${plus(g.half(-3, 3))}`,
      ];
      return { expression: g.pick(forms)(), family: 'cubic' };
    },
  ],
  4: [
    (g) => {
      const a = g.pick([1, 2, 3, -1, -2, 0.5]);
      const c = g.half(-4, 4, { nonZero: true });
      let b = g.half(-5, 5);
      if (a * c + b === 0) b += 1; // (ax + b)/(x − c) must not cancel
      return { expression: `(${coef(a, 'x')}${plus(b)})/${shifted(c)}${plus(g.int(-2, 2))}`, family: 'rational' };
    },
    (g) => {
      const [p, q] = g.pair([-5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5]);
      return {
        expression: `${g.pick(signed([1, 2, 4, 6]))}/(${shifted(p)}${shifted(q)})${plus(g.half(-2, 2))}`,
        family: 'rational',
      };
    },
    (g) => {
      const top = g.pick([() => coef(g.pick(signed([2, 3, 4, 6])), 'x'), () => String(g.pick(signed([2, 4, 6, 8])))])();
      return { expression: `${top}/(x^2 + ${g.int(1, 9)})${plus(g.half(-2, 2))}`, family: 'rational' };
    },
    (g) => {
      const forms = [
        () => coef(g.pick(signed([1, 2, 3, 4])), `e^(-x/${g.pick([2, 3, 4, 5, 6])})${g.pick(['sin', 'cos'])}(${coef(g.pick(FREQS.slice(1)), 'x')})`),
        () => coef(g.pick(signed([2, 3, 4])), `e^(-x^2/${g.pick([4, 8, 16, 25])})${g.pick(['sin', 'cos'])}(${coef(g.pick(FREQS.slice(1)), 'x')})`),
      ];
      return { expression: g.pick(forms)(), family: 'damped trigonometric' };
    },
    (g) => {
      const fn = g.pick(['sin', 'cos']);
      const inside = coef(g.pick([0.5, 1.5, 2, 3]), shifted(g.half(-3, 3, { nonZero: true })));
      return {
        expression: `${coef(g.pick(signed([1, 1.5, 2, 3])), `${fn}(${inside})`)}${plus(g.half(-2, 2))}`,
        family: 'trigonometric',
      };
    },
    (g) => {
      // Expanded cubic/quartic built from small roots, scaled to fit the view.
      const count = g.pick([3, 4]);
      // Whole-number roots keep the expanded coefficients short and exact.
      const roots = Array.from({ length: count }, () => g.int(-4, 4));
      let coeffs = [1];
      for (const r of roots) coeffs = [...coeffs, 0].map((c, i) => c - r * (i > 0 ? coeffs[i - 1] : 0));
      const scale = g.pick(count === 3 ? signed([0.1, 0.2, 0.25, 0.5]) : signed([0.02, 0.05, 0.1]));
      return { expression: poly(coeffs.map((c) => Number((c * scale).toFixed(4)))), family: 'polynomial' };
    },
    (g) => {
      const forms = [
        () => `|x^2 - ${g.int(1, 16)}|${plus(-g.int(0, 4))}`,
        () => `x^2/${g.pick([2, 4, 6, 8])}${plusTerm(g.pick(signed([1, 2, 3])), `sin(${coef(g.pick([1, 2, 3]), 'x')})`)}`,
        () => `|${coef(g.pick([1, 2]), 'x')}${plus(g.int(-3, 3))}|${plusTerm(g.pick(signed([0.5, 1])), 'x')}${plus(g.int(-3, 3))}`,
      ];
      return { expression: g.pick(forms)(), family: 'combined' };
    },
  ],
  5: [
    (g) => {
      const c = g.half(-2, 2);
      const forms = [
        () => `${coef(g.pick(signed([1, 2, 3])), `sin(x^2/${g.pick([2, 4, 6, 8, 10])})`)}${plus(c)}`,
        () => `${coef(g.pick([1, 2, -1]), `e^(sin(${coef(g.pick([0.5, 1, 1.5, 2]), 'x')}))`)}${plus(c)}`,
        () => `${coef(g.pick([1, 2, -1]), `ln(x^2 + ${g.int(1, 9)})`)}${plus(c)}`,
        () => `${coef(g.pick(signed([1, 1.5, 2])), `sqrt(|${inner(g.half(-4, 4))}|)`)}${plus(c)}`,
        () => `${coef(g.pick(signed([1, 2, 3])), `cos(sqrt(|x|)${plus(g.half(-2, 2))})`)}${plus(c)}`,
        () => `${coef(g.pick(signed([1, 2])), `sin(x + ${coef(g.pick([0.5, 1, 2]), `sin(${coef(g.pick([1, 2]), 'x')})`)})`)}${plus(c)}`,
      ];
      return { expression: g.pick(forms)(), family: 'composition' };
    },
    (g) => {
      const forms = [
        () => `x ${g.pick(['sin', 'cos'])}(${coef(g.pick([0.5, 1, 1.5, 2, 3]), 'x')})/${g.pick([2, 3, 4, 5])}`,
        () => coef(g.pick(signed([2, 3, 4, 5])), `x e^(-x^2/${g.pick([2, 4, 8, 16])})`),
        () => `${coef(g.pick([1, -1]), `x^2 e^(${g.pick(['-x', '-x/2', 'x', 'x/2'])})`)}/${g.pick([2, 4, 6])}`,
        () => coef(g.pick(signed([0.25, 0.5])), `x^2 ${g.pick(['sin', 'cos'])}(${coef(g.pick([1, 2]), 'x')})`),
      ];
      return { expression: g.pick(forms)(), family: 'product' };
    },
    (g) => {
      const a = g.int(1, 9);
      const forms = [
        () => `${g.pick(signed([2, 3, 4, 5]))}sin(${coef(g.pick([0.5, 1, 1.5, 2]), 'x')})/x`,
        () => `${g.pick(signed([2, 3, 4]))}ln(${g.pick(['x', '|x|'])})/x`,
        () => `${g.pick([1, 2, 3, -2])}(x^2 - ${a})/(x^2 + ${g.int(1, 9)})`,
        () => `${coef(g.pick(signed([2, 3, 4, 5])), 'x')}/(${g.int(1, 4)} + |x|)`,
      ];
      return { expression: g.pick(forms)(), family: 'ratio' };
    },
    (g) => {
      const fn = g.pick(['sin', 'cos']);
      return {
        expression: `${coef(g.pick(signed([1, 1.5, 2, 3])), `${fn}(${num(g.pick(PHASE_FREQS))}x + ${g.pick(PHASES)})`)}${plus(g.half(-2, 2))}`,
        family: 'trigonometric',
      };
    },
    (g) => {
      const forms = [
        () => `${coef(g.pick([1, 2, 3, 4, -2]), `|sin(${coef(g.pick([0.5, 1, 1.5, 2]), 'x')})|`)}${plus(g.half(-2, 1))}`,
        () => `${g.pick(signed([2, 3, 4, 6]))}sin(x)cos(${coef(g.pick([1, 2, 3]), 'x')})`,
        () => `sqrt(x^2 + ${g.int(1, 16)})${plus(-g.half(0, 4))}`,
        () => `${coef(g.pick([1, 2, -1]), `ln(e^x + ${g.int(1, 5)})`)}${plus(-g.half(0, 3))}`,
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
 * in the default view. "Visible" is measured as the length of curve drawn
 * inside the view (in view units, 20 × 12), not the share of the x-range it
 * covers, so steep lines like 3x that cross the whole screen count, while
 * curves that are off-screen, barely clip a corner, or are (nearly) flat
 * don't.
 */
export function isGoodTarget(expression: string): boolean {
  const fn = compileTarget(expression);
  if (!fn) return false;
  const n = 600;
  const dx = (VIEW.xMax - VIEW.xMin) / n;
  const inView = (y: number) => Number.isFinite(y) && y >= VIEW.yMin && y <= VIEW.yMax;
  let length = 0;
  let samples = 0;
  let lo = Infinity;
  let hi = -Infinity;
  let prev = NaN;
  for (let i = 0; i <= n; i++) {
    const y = fn(VIEW.xMin + i * dx + 1e-3); // nudge off exact integers
    if (inView(y)) {
      samples++;
      lo = Math.min(lo, y);
      hi = Math.max(hi, y);
      if (inView(prev) && Math.abs(y - prev) < VIEW.yMax - VIEW.yMin) length += Math.hypot(dx, y - prev);
    }
    prev = y;
  }
  return length >= 6 && samples >= 8 && hi - lo >= 1;
}

/**
 * Generates a hidden target for a difficulty. Deterministic for a given
 * seed, so a game can be restored from (difficulty, seed) without storing
 * the formula. Candidates that fail `isGoodTarget` are redrawn.
 */
export function generateTarget(difficulty: Difficulty, seed: number): TargetFunction {
  const gen = makeGen(seed);
  const templates = TEMPLATES[difficulty];
  for (let attempt = 0; attempt < 200; attempt++) {
    const { expression, family } = gen.pick(templates)(gen);
    if (isGoodTarget(expression)) return { expression, family, difficulty, seed };
  }
  return { expression: 'x^2 - 2', family: 'quadratic', difficulty, seed }; // practically unreachable
}

/** A fresh random seed. */
export const randomSeed = () => Math.floor(Math.random() * 2 ** 31);

/**
 * A random seed whose target isn't one of `avoid` (expressions seen recently).
 * Small pools can't always dodge every recent target, so after `tries` draws
 * the last one is taken anyway.
 */
export function freshSeed(
  expressionFor: (seed: number) => string,
  avoid: ReadonlySet<string>,
  draw: () => number = randomSeed,
  tries = 50,
): number {
  let seed = draw();
  for (let i = 1; i < tries && avoid.has(expressionFor(seed)); i++) seed = draw();
  return seed;
}
