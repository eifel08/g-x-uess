import { compileExpressions } from '../math/compile';
import type { RealFn2 } from '../math/types';
import { coef, inner, plus, plusTerm, shifted } from './format';
import { makeGen, signed, type Gen } from './gen';
import type { Difficulty, TargetFunction } from './generator';

/* ------------------------------------------------------------------------ */
/* Templates: hidden surfaces z = f(x, y)                                    */
/* ------------------------------------------------------------------------ */

type Template = (g: Gen) => { expression: string; family: string };

const r2 = 'x^2 + y^2';
const sx = (h: number) => shifted(h, 'x');
const sy = (k: number) => shifted(k, 'y');
/** "(x − h)^2 + (y − k)^2", the squared distance from (h, k). */
const dist2 = (h: number, k: number) => `${sx(h)}^2 + ${sy(k)}^2`;

const SLOPES = signed([0.25, 0.5, 0.75, 1, 1.5, 2, 3]);
/** "/d", or nothing when d = 1. */
const over = (d: number) => (d === 1 ? '' : `/${d}`);
const AMPS = signed([0.5, 1, 1.5, 2, 2.5, 3]);
const FREQS = [0.5, 0.75, 1, 1.5, 2];

const TEMPLATES: Record<Difficulty, Template[]> = {
  1: [
    (g) => ({ expression: `${coef(g.pick(SLOPES), 'x')}${plusTerm(g.pick(SLOPES), 'y')}${plus(g.half(-4, 4))}`, family: 'plane' }),
    (g) => ({
      expression: `${g.pick(['', '-'])}(${r2})${over(g.pick([1, 2, 3, 4, 5, 6, 8]))}${plus(g.half(-4, 4))}`,
      family: 'paraboloid',
    }),
    (g) => {
      const [sq, lin] = g.pick([
        ['x', 'y'],
        ['y', 'x'],
      ]);
      return {
        expression: `${coef(g.pick(signed([0.1, 0.2, 0.25, 0.5])), `${sq}^2`)}${plusTerm(g.pick(SLOPES), lin)}${plus(g.half(-3, 3))}`,
        family: 'quadratic',
      };
    },
  ],
  2: [
    (g) => {
      const h = g.int(-3, 3);
      const k = h === 0 ? g.int(-3, 3, { nonZero: true }) : g.int(-3, 3);
      return {
        expression: `${g.pick(['', '-'])}(${dist2(h, k)})/${g.pick([2, 3, 4, 6])}${plus(g.half(-3, 3))}`,
        family: 'paraboloid',
      };
    },
    (g) => {
      const [a, b] = g.pair([1, 2, 3, 4, 6, 8]);
      const [p, q] = g.pick([
        [a, b],
        [b, a],
      ]);
      return { expression: `${g.pick(['', '-'])}(x^2${over(p)} + y^2${over(q)})${plus(g.half(-4, 3))}`, family: 'elliptic paraboloid' };
    },
    (g) => {
      const c = g.half(-2, 2);
      const forms = [
        () => `${g.pick(['', '-'])}(${sx(g.int(-2, 2))}^2 - ${sy(g.int(-2, 2))}^2)/${g.pick([2, 3, 4, 6])}${plus(c)}`,
        () => `${coef(g.pick(signed([0.1, 0.2, 0.25, 0.5, 1])), `${sx(g.int(-2, 2))}${sy(g.int(-2, 2))}`)}${plus(c)}`,
      ];
      return { expression: g.pick(forms)(), family: 'saddle' };
    },
    (g) => ({
      expression: `${coef(g.pick(signed([0.5, 0.75, 1, 1.5])), `sqrt(${dist2(g.int(-3, 3), g.int(-3, 3))})`)}${plus(g.half(-3, 3))}`,
      family: 'cone',
    }),
    (g) => ({
      expression: `${coef(g.pick(signed([0.5, 1, 1.5])), `|${inner(g.int(-3, 3), 'x')}|`)}${plusTerm(g.pick(signed([0.5, 1, 1.5])), `|${inner(g.int(-3, 3), 'y')}|`)}${plus(g.half(-4, 2))}`,
      family: 'absolute value',
    }),
    (g) => ({
      expression: `${coef(g.pick(signed([1, 1.5, 2])), `sqrt(${coef(g.pick(signed([1, 2])), 'x')}${plusTerm(g.pick(signed([1, 2])), 'y')} + ${g.int(3, 8)})`)}${plus(g.half(-3, 1))}`,
      family: 'square root',
    }),
  ],
  3: [
    (g) => ({
      expression: `${coef(g.pick(signed([0.5, 1, 1.5, 2])), `sin(${coef(g.pick(FREQS), 'x')})`)}${plusTerm(g.pick(signed([0.5, 1, 1.5, 2])), `cos(${coef(g.pick(FREQS), 'y')})`)}${plus(g.half(-1, 1))}`,
      family: 'trigonometric',
    }),
    (g) => ({
      expression: `${coef(g.pick(AMPS), `${g.pick(['sin', 'cos'])}(${coef(g.pick(FREQS), `sqrt(${r2})`)})`)}${plus(g.half(-2, 2))}`,
      family: 'radial wave',
    }),
    (g) => {
      const [cube, lin] = g.pick([
        ['x', 'y'],
        ['y', 'x'],
      ]);
      const b = g.int(0, 3);
      return {
        expression: `${coef(g.pick(signed([0.05, 0.1, 0.125, 0.2])), `${cube}^3`)}${b ? plusTerm(-b, cube) : ''}${plusTerm(g.pick(SLOPES), lin)}${plus(g.half(-2, 2))}`,
        family: 'cubic',
      };
    },
    (g) => ({
      expression: `${coef(g.pick(signed([2, 3, 4, 5])), `e^(-(${dist2(g.int(-2, 2), g.int(-2, 2))})${over(g.pick([1, 2, 4, 8]))})`)}${plus(g.half(-2, 2))}`,
      family: 'exponential',
    }),
    (g) => ({
      expression: `${coef(g.pick([1, 1.5, 2, -1, -2]), `ln(${dist2(g.int(-2, 2), g.int(-2, 2))} + ${g.pick([0.5, 1, 2, 3])})`)}${plus(g.half(-3, 1))}`,
      family: 'logarithmic',
    }),
  ],
  4: [
    (g) => ({
      expression: `${coef(g.pick(AMPS), `${g.pick(['sin', 'cos'])}(${coef(g.pick(FREQS), 'x')})${g.pick(['sin', 'cos'])}(${coef(g.pick(FREQS), 'y')})`)}${plus(g.half(-1, 1))}`,
      family: 'product',
    }),
    (g) => {
      const forms = [
        () => `${g.pick(signed([3, 4, 5, 6]))}/(1 + ${dist2(g.int(-2, 2), g.int(-2, 2))})`,
        () => `${coef(g.pick(signed([2, 4, 6])), g.pick(['x', 'y']))}/(${g.pick([1, 2, 4])} + ${r2})`,
        () => `${g.pick(signed([2, 3, 4]))}(x^2 - y^2)/(${g.pick([1, 2, 4])} + ${r2})`,
        () => `${g.pick(signed([2, 3, 4]))}x y/(${g.pick([1, 2, 4])} + ${r2})`,
      ];
      return { expression: `${g.pick(forms)()}${plus(g.half(-1, 1))}`, family: 'ratio' };
    },
    (g) => ({
      expression: `${coef(g.pick(AMPS), `${g.pick(['sin', 'cos'])}(${coef(g.pick([1.25, 1.5, 2, 2.5, 3]), `sqrt(${dist2(g.int(-2, 2), g.int(-2, 2))})`)})`)}${plus(g.half(-1, 1))}`,
      family: 'radial wave',
    }),
    (g) => ({
      expression: `x^2/${g.pick([4, 6, 8])}${plusTerm(g.pick([1, -1]), `x y/${g.pick([2, 3, 4, 6, 8])}`)}${plusTerm(g.pick([1, -1]), `y^2/${g.pick([3, 4, 6, 8])}`)}${plusTerm(g.pick(SLOPES), 'x')}${plusTerm(g.pick(SLOPES), 'y')}${plus(g.half(-2, 2))}`,
      family: 'polynomial',
    }),
    (g) => ({
      expression: `${coef(g.pick(signed([1, 1.5, 2, 3])), `${g.pick(['sin', 'cos'])}(${inner(g.half(-2, 2, { nonZero: true }), 'x')})`)} + ${sy(g.int(-2, 2))}^2/${g.pick([4, 6, 8])}${plus(g.half(-3, 1))}`,
      family: 'combined',
    }),
  ],
  5: [
    (g) => {
      const forms = [
        () => `${g.pick([3, 4, 5, -4])}${g.pick(['sin', 'cos'])}(${coef(g.pick(FREQS), 'x')})${g.pick(['sin', 'cos'])}(${coef(g.pick(FREQS), 'y')})e^(-(${r2})/${g.pick([12, 16, 20, 30])})`,
        () => `${g.pick(signed([2, 3, 4]))}cos(${coef(g.pick([0.5, 1]), `(${r2})`)})/(1 + ${r2})`,
        () => `${g.pick(signed([1.5, 2, 3]))}sin(x y/${g.pick([2, 3, 4, 5])})`,
      ];
      return { expression: g.pick(forms)(), family: 'modulated wave' };
    },
    (g) => {
      const [h1, k1] = [g.int(-3, 3), g.int(-3, 3)];
      let [h2, k2] = [g.int(-3, 3), g.int(-3, 3)];
      if (h1 === h2 && k1 === k2) h2 = h1 === 3 ? -3 : h1 + 2;
      return {
        expression: `${g.pick([2, 3, 4, 5])}e^(-(${dist2(h1, k1)})${over(g.pick([1, 2]))}) - ${g.pick([2, 3, 4])}e^(-(${dist2(h2, k2)})${over(g.pick([1, 2, 3]))})`,
        family: 'localized peaks',
      };
    },
    (g) => {
      const forms = [
        () => coef(g.pick(signed([1.5, 2, 3])), `sin(${coef(g.pick([0.5, 1]), 'x')} + ${coef(g.pick([1, 1.5, 2]), `sin(${coef(g.pick([0.5, 1]), 'y')})`)})`),
        () => `${coef(g.pick([1, 1.5, 2]), `ln(1 + |x y|${g.pick(['', '/2', '/4'])})`)}${plus(-g.half(0, 3))}`,
        () => `${coef(g.pick(signed([1, 1.5])), `${g.pick(['cos', 'sin'])}(${coef(g.pick([0.5, 1]), 'x')})e^(${g.pick(['sin', 'cos'])}(${coef(g.pick([0.5, 1]), 'y')}))`)}`,
        () => coef(g.pick(signed([2, 3])), `sin(sqrt(|x y|${g.pick(['', ' + 1', ' + 2'])}))`),
      ];
      return { expression: g.pick(forms)(), family: 'composition' };
    },
    (g) => {
      const forms = [
        () =>
          `${coef(g.pick(signed([1.5, 2, 3])), `${g.pick(['sin', 'cos'])}(${coef(g.pick(FREQS), 'x')}${plusTerm(g.pick(signed([0.5, 1, 1.5])), 'y')}${plus(g.half(-1, 1))})`)}${plus(g.half(-1, 1))}`,
        () => `(x^2${plusTerm(g.pick(signed([0.5, 1, 1.5])), 'x y')} + y^2)/${g.pick([4, 6, 8])}${plus(-g.half(0, 3))}`,
        () =>
          `${g.pick([2, 3])}${g.pick(['cos', 'sin'])}(x/${g.pick([2, 3])})${g.pick(['sin', 'cos'])}(y/${g.pick([2, 3])})${plusTerm(g.pick(signed([0.25, 0.5])), g.pick(['x', 'y']))}`,
      ];
      return { expression: g.pick(forms)(), family: 'subtle combination' };
    },
  ],
};

/* ------------------------------------------------------------------------ */
/* Generation and validation                                                 */
/* ------------------------------------------------------------------------ */

/** Compiles a 3D target to z = F(x, y) (always in radians). */
export function compileTarget3D(expression: string): RealFn2 | null {
  const r = compileExpressions([{ id: 'target', text: `z = ${expression}` }], { dimension: 3 }).target;
  return r.kind === 'surface' ? r.F : null;
}

/** The default 3D view: x, y, z ∈ [−5, 5]. */
export const VIEW3D = 5;

/**
 * Good targets cover a decent part of the box's floor with surface inside
 * the box (steep planes that cross the box count), aren't flat, and depend
 * on both x and y (otherwise it's really a 2D puzzle).
 */
export function isGoodTarget3D(expression: string): boolean {
  const F = compileTarget3D(expression);
  if (!F) return false;
  const n = 20;
  let visible = 0;
  let lo = Infinity;
  let hi = -Infinity;
  let variesX = false;
  let variesY = false;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = -VIEW3D + (2 * VIEW3D * i) / n + 1e-3;
      const y = -VIEW3D + (2 * VIEW3D * j) / n + 2e-3;
      const z = F(x, y);
      if (!Number.isFinite(z)) continue;
      if (Math.abs(z) <= VIEW3D) {
        visible++;
        lo = Math.min(lo, z);
        hi = Math.max(hi, z);
      }
      if (!variesX && Math.abs(F(x + 0.37, y) - z) > 1e-6) variesX = true;
      if (!variesY && Math.abs(F(x, y + 0.37) - z) > 1e-6) variesY = true;
    }
  }
  return visible / ((n + 1) * (n + 1)) >= 0.2 && hi - lo >= 1 && variesX && variesY;
}

export function generateTarget3D(difficulty: Difficulty, seed: number): TargetFunction {
  const gen = makeGen(seed ^ 0x3d3d3d);
  const templates = TEMPLATES[difficulty];
  for (let attempt = 0; attempt < 200; attempt++) {
    const { expression, family } = gen.pick(templates)(gen);
    if (isGoodTarget3D(expression)) return { expression, family, difficulty, seed };
  }
  return { expression: `(${r2})/4 - 2`, family: 'paraboloid', difficulty, seed };
}
