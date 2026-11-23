import { compileExpressions } from '../math/compile';
import type { RealFn2 } from '../math/types';
import { coef, inner, num, plus, plusTerm, shifted } from './format';
import type { Difficulty, TargetFunction } from './generator';
import { mulberry32 } from './random';

/* ------------------------------------------------------------------------ */
/* Templates: hidden surfaces z = f(x, y)                                    */
/* ------------------------------------------------------------------------ */

interface Gen {
  int(lo: number, hi: number, opts?: { nonZero?: boolean }): number;
  pick<T>(items: readonly T[]): T;
}

type Template = (g: Gen) => { expression: string; family: string };

const r2 = 'x^2 + y^2';
/** "(y − k)" / "y", the y-counterpart of `shifted`. */
const shiftedY = (k: number) => shifted(k).replace('x', 'y');

const TEMPLATES: Record<Difficulty, Template[]> = {
  1: [
    (g) => ({
      expression: `${coef(g.pick([1, 2, -1, -2, 0.5, -0.5]), 'x')}${plusTerm(g.pick([1, 2, -1, -2, 0.5, -0.5]), 'y')}${plus(g.int(-3, 3))}`,
      family: 'plane',
    }),
    (g) => ({ expression: `${g.pick(['', '-'])}(${r2})/${g.pick([2, 4, 5])}${plus(g.int(-3, 3))}`, family: 'paraboloid' }),
    (g) => ({
      expression: `x^2/${g.pick([2, 4])}${plusTerm(g.pick([1, -1, 0.5]), 'y')}${plus(g.int(-2, 2))}`,
      family: 'quadratic',
    }),
  ],
  2: [
    (g) => {
      const h = g.int(-2, 2);
      const k = h === 0 ? g.int(-2, 2, { nonZero: true }) : g.int(-2, 2);
      return {
        expression: `(${shifted(h)}^2 + ${shiftedY(k)}^2)/${g.pick([2, 4])}${plus(g.int(-3, 1))}`,
        family: 'paraboloid',
      };
    },
    (g) => {
      const [a, b] = g.pick([
        [2, 4],
        [4, 2],
        [1, 4],
        [4, 1],
        [2, 8],
      ]);
      return { expression: `x^2/${a} + y^2/${b}${plus(g.int(-3, 0))}`, family: 'elliptic paraboloid' };
    },
    (g) => ({
      expression: g.pick([`(x^2 - y^2)/${g.pick([2, 4])}`, `(y^2 - x^2)/${g.pick([2, 4])}`, `x y/${g.pick([2, 3, 4])}`]),
      family: 'saddle',
    }),
    (g) => ({ expression: `${coef(g.pick([1, -1, 0.5]), `sqrt(${r2})`)}${plus(g.int(-3, 2))}`, family: 'cone' }),
    (g) => ({
      expression: g.pick([`|x| + |y|${plus(g.int(-4, 0))}`, `|x - y|${plus(g.int(-2, 1))}`, `-|x| - |y| + ${g.int(2, 4)}`]),
      family: 'absolute value',
    }),
    (g) => ({ expression: `${coef(g.pick([1, 2]), `sqrt(x + y + ${g.int(3, 6)})`)}${plus(-g.int(0, 3))}`, family: 'square root' }),
  ],
  3: [
    (g) => ({
      expression: `${coef(g.pick([1, 2, -2]), 'sin(x)')}${plusTerm(g.pick([1, 2, -1]), 'cos(y)')}`,
      family: 'trigonometric',
    }),
    (g) => ({
      expression: coef(g.pick([2, 3, -2]), `${g.pick(['sin', 'cos'])}(sqrt(${r2}))`),
      family: 'radial wave',
    }),
    (g) => ({ expression: `x^3/${g.pick([8, 10])} - ${coef(g.int(1, 2), 'x')}${plusTerm(g.pick([0.5, -0.5, 1]), 'y')}`, family: 'cubic' }),
    (g) => ({ expression: coef(g.pick([3, 4, -3]), `e^(-(${r2})/${g.pick([2, 4, 8])})`), family: 'exponential' }),
    (g) => ({ expression: `ln(${r2} + ${g.int(1, 3)})${plus(-g.int(0, 2))}`, family: 'logarithmic' }),
  ],
  4: [
    (g) => ({ expression: coef(g.pick([2, 3, -3]), `sin(x)cos(${coef(g.pick([1, 0.5]), 'y')})`), family: 'product' }),
    (g) => {
      const forms = [
        () => `${g.pick([4, 5, -4])}/(1 + ${r2})`,
        () => `${coef(g.pick([4, 6]), 'x')}/(1 + ${r2})`,
        () => `${g.pick([3, 4])}(x^2 - y^2)/(1 + ${r2})`,
      ];
      return { expression: g.pick(forms)(), family: 'ratio' };
    },
    (g) => {
      const b = g.pick([1.5, 2, 0.75]);
      return { expression: `${coef(g.pick([2, 3]), `cos(${num(b)}sqrt(${r2}))`)}${plus(g.int(-1, 1))}`, family: 'radial wave' };
    },
    (g) => ({
      expression: `x^2/${g.pick([4, 6])}${plusTerm(g.pick([-1, 1]), `x y/${g.pick([3, 4])}`)}${plusTerm(g.pick([-1, 1]), `y^2/${g.pick([4, 8])}`)}${plusTerm(g.pick([1, -1]), `x/${g.pick([2, 3])}`)}`,
      family: 'polynomial',
    }),
    (g) => ({
      expression: `${coef(g.pick([2, 3]), `sin(${inner(g.int(-2, 2, { nonZero: true }))})`)} + ${shiftedY(g.int(-2, 2))}^2/${g.pick([4, 8])}`,
      family: 'combined',
    }),
  ],
  5: [
    (g) => {
      const forms = [
        () => `${g.pick([4, 5])}sin(x)cos(y)e^(-(${r2})/${g.pick([16, 20])})`,
        () => `${g.pick([3, 4])}cos(${r2})/(1 + ${r2})`,
        () => `${g.pick([2, 3])}sin(x y/${g.pick([2, 3])})`,
      ];
      return { expression: g.pick(forms)(), family: 'modulated wave' };
    },
    (g) => {
      const h = g.int(1, 2);
      const k = g.int(-2, 2);
      return {
        expression: `${g.pick([3, 4])}e^(-(${shifted(h)}^2 + ${shiftedY(k)}^2)) - ${g.pick([2, 3])}e^(-((x + ${g.int(1, 2)})^2 + ${shiftedY(-k)}^2)/2)`,
        family: 'localized peaks',
      };
    },
    (g) => {
      const forms = [
        () => coef(g.pick([2, 3]), 'sin(x + sin(y))'),
        () => `ln(1 + |x y|)${plus(-g.int(1, 2))}`,
        () => `cos(x)e^(sin(y))`,
        () => `${g.pick([2, 3])}sin(sqrt(|x y|))`,
      ];
      return { expression: g.pick(forms)(), family: 'composition' };
    },
    (g) => {
      const forms = [
        () => `${coef(g.pick([2, 3]), `sin(${coef(g.pick([1, 2]), 'x')}${plusTerm(g.pick([1, -1, 0.5]), 'y')})`)}${plus(g.int(-1, 1))}`,
        () => `(x^2${plusTerm(g.pick([1, -1, 0.5]), 'x y')} + y^2)/${g.pick([4, 6])}${plus(-g.int(1, 3))}`,
        () => `${g.pick([2, 3])}cos(x/2)sin(y/2)${plusTerm(g.pick([0.25, -0.25]), 'x')}`,
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
 * Good targets are mostly defined and inside the default box, not flat, and
 * depend on both x and y (otherwise it's really a 2D puzzle).
 */
export function isGoodTarget3D(expression: string): boolean {
  const F = compileTarget3D(expression);
  if (!F) return false;
  const n = 30;
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
  return visible / ((n + 1) * (n + 1)) >= 0.4 && hi - lo >= 1 && variesX && variesY;
}

export function generateTarget3D(difficulty: Difficulty, seed: number): TargetFunction {
  const rng = mulberry32(seed ^ 0x3d3d3d);
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
    if (isGoodTarget3D(expression)) return { expression, family, difficulty, seed };
  }
  return { expression: `(${r2})/4 - 2`, family: 'paraboloid', difficulty, seed };
}
