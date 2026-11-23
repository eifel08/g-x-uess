import { integrate, nthDerivative } from './numeric';
import { LayeredScope, toReal, type MapLike } from './scope';
import type { RealFn } from './types';

/**
 * Calculus "special forms" that need their arguments unevaluated:
 *
 *   ddx(expr)                 d/dx of expr at the current x
 *   int(t, a, b, expr)        ∫ₐᵇ expr dt
 *   sum(n, a, b, expr)        Σ expr for n = a..b
 *   prod(n, a, b, expr)       Π expr for n = a..b
 *
 * mathjs calls functions flagged `rawArgs` with the argument nodes and the
 * current scope, so the body can be re-evaluated with the bound variable set.
 * The compiler validates the shape of these calls before they get here.
 */

interface RawNode {
  name?: string;
  compile(): { evaluate(scope?: unknown): unknown };
}

type RawFn = ((args: RawNode[], math: unknown, scope: MapLike) => number) & { rawArgs: true };

const compiled = new WeakMap<RawNode, { evaluate(scope?: unknown): unknown }>();
function compileOnce(node: RawNode) {
  let c = compiled.get(node);
  if (!c) {
    c = node.compile();
    compiled.set(node, c);
  }
  return c;
}

const evalIn = (node: RawNode, scope: MapLike) => toReal(compileOnce(node).evaluate(scope));

/** Returns body as a function of `variable`, evaluated on top of `scope`. */
function bind(body: RawNode, variable: string, scope: MapLike): RealFn {
  const local = new LayeredScope(scope);
  const c = compileOnce(body);
  return (v) => {
    local.set(variable, v);
    return toReal(c.evaluate(local));
  };
}

const raw = (fn: (args: RawNode[], math: unknown, scope: MapLike) => number): RawFn =>
  Object.assign(fn, { rawArgs: true as const });

/** Maximum number of terms in a sum/product. */
export const MAX_TERMS = 100_000;

function series(args: RawNode[], scope: MapLike, identity: number, op: (acc: number, v: number) => number): number {
  const lo = evalIn(args[1], scope);
  const hi = evalIn(args[2], scope);
  if (!Number.isFinite(lo) || !Number.isFinite(hi)) return NaN;
  const start = Math.ceil(lo - 1e-9);
  const end = Math.floor(hi + 1e-9);
  if (end - start + 1 > MAX_TERMS) return NaN;
  const term = bind(args[3], args[0].name!, scope);
  let acc = identity;
  for (let n = start; n <= end; n++) acc = op(acc, term(n));
  return acc;
}

export const specialForms = {
  ddx: raw((args, _math, scope) => {
    if (!scope.has('x')) return NaN;
    return nthDerivative(bind(args[0], 'x', scope), toReal(scope.get('x')), 1);
  }),
  int: raw((args, _math, scope) => {
    const a = evalIn(args[1], scope);
    const b = evalIn(args[2], scope);
    return integrate(bind(args[3], args[0].name!, scope), a, b);
  }),
  sum: raw((args, _math, scope) => series(args, scope, 0, (acc, v) => acc + v)),
  prod: raw((args, _math, scope) => series(args, scope, 1, (acc, v) => acc * v)),
};
