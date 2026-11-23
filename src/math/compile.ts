import type { MathNode } from 'mathjs';
import { degreeTrig, type AngleMode } from './functions';
import {
  ALL_FUNCTION_NAMES,
  BUILTIN_CONSTANTS,
  BUILTIN_FUNCTIONS,
  LIST_FUNCTIONS,
  RESERVED_NAMES,
  SPECIAL_FORMS,
  math,
  parse,
} from './mathInstance';
import { nthDerivative } from './numeric';
import { preprocess } from './preprocess';
import { LayeredScope, toReal } from './scope';
import type { CompiledRows, ExpressionSource, RealFn, RowResult } from './types';

export interface CompileOptions {
  /** Units for trigonometric functions. Default: radians. */
  angleMode?: AngleMode;
}

/* ------------------------------------------------------------------------ */
/* Minimal structural views of mathjs nodes (the bundled types are loose).   */
/* ------------------------------------------------------------------------ */

interface AnyNode {
  type: string;
  name?: string;
  fn?: AnyNode | string;
  op?: string;
  args?: AnyNode[];
  implicit?: boolean;
  value?: unknown;
  object?: AnyNode;
  params?: string[];
  expr?: AnyNode;
  content?: AnyNode;
  condition?: AnyNode;
  trueExpr?: AnyNode;
  falseExpr?: AnyNode;
  items?: AnyNode[];
  start?: AnyNode;
  end?: AnyNode;
  step?: AnyNode | null;
  map(cb: (child: AnyNode) => AnyNode): AnyNode;
  filter(cb: (node: AnyNode) => boolean): AnyNode[];
  compile(): { evaluate(scope?: unknown): unknown };
}

/** mathjs node constructors want their own node type; ours is a structural view of it. */
const m = (node: AnyNode) => node as unknown as MathNode;
const asAny = (node: unknown) => node as AnyNode;
const call = (name: string, args: AnyNode[]) => asAny(new math.FunctionNode(name, args.map(m)));

/** Matches the internal names produced for primes: f'' → f__d2. */
const PRIME_NAME = /^(.+?)__d(\d+)$/;
const MAX_PRIME_ORDER = 6;

const RELATIONAL = new Set(['larger', 'smaller', 'largerEq', 'smallerEq', 'equal', 'unequal']);

/* ------------------------------------------------------------------------ */
/* Stage 1: parse each row on its own                                        */
/* ------------------------------------------------------------------------ */

type ParsedRow =
  | { kind: 'empty' }
  | { kind: 'error'; message: string }
  /** f(x) = body */
  | { kind: 'func'; name: string; params: string[]; body: AnyNode }
  /** a = body */
  | { kind: 'var'; name: string; body: AnyNode }
  /** y = body, or a bare expression */
  | { kind: 'expr'; body: AnyNode; explicitY: boolean };

export function parseRow(text: string): ParsedRow {
  if (text.trim() === '') return { kind: 'empty' };
  let node: AnyNode;
  try {
    node = parse(preprocess(text)) as unknown as AnyNode;
  } catch (err) {
    return { kind: 'error', message: friendlySyntaxError(err, text) };
  }

  if (node.type === 'FunctionAssignmentNode') {
    const name = node.name!;
    return { kind: 'func', name, params: node.params ?? [], body: node.expr! };
  }
  if (node.type === 'AssignmentNode') {
    if (node.object?.type !== 'SymbolNode') {
      return { kind: 'error', message: 'Left side must be y, a name, or f(x)' };
    }
    const name = node.object.name!;
    const body = node.value as AnyNode;
    if (name === 'y') return { kind: 'expr', body, explicitY: true };
    if (name === 'x') return { kind: 'error', message: 'Vertical lines (x = …) are not supported yet' };
    return { kind: 'var', name, body };
  }
  if (node.type === 'OperatorNode' && RELATIONAL.has(node.fn as string) && mentionsY(node)) {
    return { kind: 'error', message: 'Inequalities in y (shaded regions) are not supported yet' };
  }
  return { kind: 'expr', body: node, explicitY: false };
}

const mentionsY = (node: AnyNode) => node.filter((n) => n.type === 'SymbolNode' && n.name === 'y').length > 0;

function friendlySyntaxError(err: unknown, text: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  const msg = raw.replace(/\s*\(char \d+\)\s*$/, '');
  if (/^Unexpected end of expression/.test(msg)) return 'Expression is incomplete';
  if (/^Parenthesis \) expected/.test(msg)) return 'Missing closing parenthesis';
  if (/^Unexpected operator \)/.test(msg) || /^Unexpected "\)"/.test(msg)) return 'Unmatched closing parenthesis';
  if (/^Invalid left hand side of assignment/.test(msg)) {
    return /y/.test(text)
      ? 'Equations like x² + y² = 4 are not supported yet'
      : 'Only y = …, name = … or f(x) = … are supported';
  }
  if (/^Value expected/.test(msg)) return 'Expected a number or expression';
  return msg;
}

/* ------------------------------------------------------------------------ */
/* Stage 2: calculator-style rewrites                                        */
/* ------------------------------------------------------------------------ */

/** Built-ins that may be applied without parentheses: `sin x`, `d/dx x^2`. */
const IMPLICIT_CALLABLE = (name: string) => BUILTIN_FUNCTIONS.has(name) || name === 'ddx';

/**
 * Rewrites the AST bottom-up so it reads the way a graphing calculator would:
 *  - `sin x`, `2 sin x`   → sin(x), 2 * sin(x)    (mathjs reads `sin * x`)
 *  - `x(x+1)`, `a(x-1)`   → x * (x+1)              (mathjs reads a call to x)
 *  - `[1, 2, 3]`          → __list(1, 2, 3)        (plain JS arrays, no mathjs matrices)
 *  - `[1:10]` (`[1...10]`)→ __list(__range(1, 10))
 */
function rewrite(node: AnyNode, isValueName: (name: string) => boolean): AnyNode {
  const mapped = node.map((child) => rewrite(child, isValueName));

  if (mapped.type === 'ArrayNode') return call('__list', mapped.items ?? []);
  if (mapped.type === 'RangeNode') {
    return call('__range', [mapped.start!, mapped.end!, ...(mapped.step ? [mapped.step] : [])]);
  }

  if (mapped.type === 'OperatorNode' && mapped.fn === 'multiply' && mapped.implicit && mapped.args?.length === 2) {
    const [left, right] = mapped.args;
    if (left.type === 'SymbolNode' && IMPLICIT_CALLABLE(left.name!)) return call(left.name!, [right]);
    const tail = left.type === 'OperatorNode' && left.fn === 'multiply' && left.implicit ? left.args?.[1] : undefined;
    if (tail?.type === 'SymbolNode' && IMPLICIT_CALLABLE(tail.name!)) {
      return asAny(new math.OperatorNode('*', 'multiply', [m(left.args![0]), m(call(tail.name!, [right]))], true));
    }
  }

  if (mapped.type === 'FunctionNode' && mapped.args?.length === 1) {
    const fnNode = mapped.fn as AnyNode;
    if (fnNode.type === 'SymbolNode' && isValueName(fnNode.name!)) {
      const sym = new math.SymbolNode(fnNode.name!);
      const paren = new math.ParenthesisNode(m(mapped.args[0]));
      return asAny(new math.OperatorNode('*', 'multiply', [sym, paren], true));
    }
  }
  return mapped;
}

/* ------------------------------------------------------------------------ */
/* Stage 3: validation against a whitelist                                   */
/* ------------------------------------------------------------------------ */

const ALLOWED_OPERATORS = new Set([
  'add', 'subtract', 'multiply', 'divide', 'pow', 'unaryMinus', 'unaryPlus', 'factorial', 'mod',
  'larger', 'smaller', 'largerEq', 'smallerEq', 'equal', 'unequal', 'and', 'or', 'not', 'xor',
  'dotMultiply', 'dotDivide', 'dotPow',
]);

const SPECIAL_FORM_USAGE: Record<string, string> = {
  int: 'int(t, a, b, expression)',
  sum: 'sum(n, a, b, expression)',
  prod: 'prod(n, a, b, expression)',
};

interface Definitions {
  functions: Map<string, number>; // name -> arity
  variables: Set<string>;
}

interface Analysis {
  deps: Set<string>; // user definitions referenced
  usesLocal: Set<string>; // row-level variables referenced (e.g. x, or a function's params)
  primes: Set<string>; // prime-derivative names referenced, e.g. f__d2
}

class ValidationError extends Error {}

function analyse(body: AnyNode, locals: Set<string>, defs: Definitions): Analysis {
  const deps = new Set<string>();
  const usesLocal = new Set<string>();
  const primes = new Set<string>();
  const fail = (msg: string): never => {
    throw new ValidationError(msg);
  };

  // Variables that ∫/Σ/Π may bind (x is allowed and shadows the row's x).
  const isBindable = (name: string) =>
    name !== 'y' && !ALL_FUNCTION_NAMES.has(name) && !BUILTIN_CONSTANTS.has(name) && !defs.functions.has(name);

  /** `bound`: variables bound by ∫/Σ/Π; `context`: the enclosing call, for list syntax. */
  const walk = (node: AnyNode, bound: ReadonlySet<string>, context?: string): void => {
    switch (node.type) {
      case 'ParenthesisNode':
        return walk(node.content!, bound);
      case 'ConditionalNode':
        walk(node.condition!, bound);
        walk(node.trueExpr!, bound);
        return walk(node.falseExpr!, bound);
      case 'ConstantNode':
        if (typeof node.value !== 'number') fail('Only numbers are supported');
        return;
      case 'OperatorNode':
        if (!ALLOWED_OPERATORS.has(node.fn as string)) fail(`Operator "${node.op}" is not supported`);
        node.args!.forEach((a) => walk(a, bound));
        return;
      case 'SymbolNode':
        return symbol(node.name!, bound);
      case 'FunctionNode':
        return callNode(node, bound, context);
      default:
        fail('Unsupported syntax');
    }
  };

  const symbol = (name: string, bound: ReadonlySet<string>) => {
    if (bound.has(name)) return;
    if (locals.has(name)) usesLocal.add(name);
    else if (BUILTIN_CONSTANTS.has(name)) return;
    else if (defs.variables.has(name)) deps.add(name);
    else if (defs.functions.has(name) || ALL_FUNCTION_NAMES.has(name)) fail(`${name} is a function — write ${name}(x)`);
    else if (name === 'y') fail('y can only appear as "y = …"');
    else fail(`"${name}" is not defined`);
  };

  const callNode = (node: AnyNode, bound: ReadonlySet<string>, context?: string) => {
    const fnNode = node.fn as AnyNode;
    if (fnNode.type !== 'SymbolNode') fail('Invalid function call');
    const name = fnNode.name!;
    const args = node.args!;

    if (name === '__list') {
      if (!context || !LIST_FUNCTIONS.has(context)) fail('Lists can only be used inside mean, median, total, …');
      args.forEach((a) => walk(a, bound, '__list'));
      return;
    }
    if (name === '__range') {
      if (context !== '__list') fail('Ranges like 1...10 must be inside a list: [1...10]');
      args.forEach((a) => walk(a, bound));
      return;
    }

    if (name === 'ddx') {
      if (args.length !== 1) fail('d/dx takes one expression: d/dx(x^2)');
      // d/dx always depends on x, even d/dx(5).
      if (locals.has('x')) usesLocal.add('x');
      else if (!bound.has('x')) fail('d/dx needs an expression in x');
      walk(args[0], bound);
      return;
    }
    if (SPECIAL_FORMS.has(name)) {
      if (args.length !== 4) fail(`Use ${SPECIAL_FORM_USAGE[name]}`);
      const v = args[0];
      if (v.type !== 'SymbolNode' || !isBindable(v.name!)) {
        fail(`The first part of ${name}(…) must be a variable name, e.g. ${SPECIAL_FORM_USAGE[name]}`);
      }
      walk(args[1], bound);
      walk(args[2], bound);
      walk(args[3], new Set([...bound, v.name!]));
      return;
    }

    const prime = PRIME_NAME.exec(name);
    if (prime) {
      const [, base, orderText] = prime;
      const order = Number(orderText);
      const label = `${base}${"'".repeat(order)}`;
      if (order > MAX_PRIME_ORDER) fail(`At most ${MAX_PRIME_ORDER} primes are supported`);
      if (args.length !== 1) fail(`${label} takes 1 argument`);
      if (defs.functions.has(base)) {
        if (defs.functions.get(base) !== 1) fail(`${label} needs ${base} to be a function of one variable`);
        deps.add(base);
      } else if (!BUILTIN_FUNCTIONS.has(base)) {
        fail(`Unknown function "${base}"`);
      }
      primes.add(name);
      walk(args[0], bound);
      return;
    }

    if (defs.functions.has(name)) {
      const arity = defs.functions.get(name)!;
      if (args.length !== arity) fail(`${name} takes ${arity} argument${arity === 1 ? '' : 's'}`);
      deps.add(name);
    } else if (LIST_FUNCTIONS.has(name)) {
      if (args.length === 0) fail(`${name} needs a list, e.g. ${name}([1, 2, 3])`);
      args.forEach((a) => walk(a, bound, name));
      return;
    } else if (!BUILTIN_FUNCTIONS.has(name)) {
      fail(
        locals.has(name) || bound.has(name) || defs.variables.has(name) || BUILTIN_CONSTANTS.has(name)
          ? `${name} is not a function`
          : `Unknown function "${name}"`,
      );
    }
    args.forEach((a) => walk(a, bound));
  };

  walk(body, new Set());
  return { deps, usesLocal, primes };
}

/* ------------------------------------------------------------------------ */
/* Stage 4: link all rows together                                           */
/* ------------------------------------------------------------------------ */

type BodyRow = Extract<ParsedRow, { body: AnyNode }>;
type DefRow = Extract<ParsedRow, { kind: 'func' } | { kind: 'var' }>;

/** Builds f^(n) for a prime name like `f__d2`, from whatever `f` is in scope. */
function primeFunction(primeName: string, globals: Map<string, unknown>): RealFn {
  const [, base, order] = PRIME_NAME.exec(primeName)!;
  const fn = (globals.get(base) ?? (math as unknown as Record<string, unknown>)[base]) as (x: number) => unknown;
  const real: RealFn = (x) => toReal(fn(x));
  return (x) => nthDerivative(real, x, Number(order));
}

/**
 * Compiles a full list of rows. Rows can reference definitions from other
 * rows (`g(x) = f(x) + a`), in any order. Every row gets its own result, so
 * one bad row never breaks the others.
 */
export function compileExpressions(sources: readonly ExpressionSource[], options: CompileOptions = {}): CompiledRows {
  const { angleMode = 'rad' } = options;
  const results: CompiledRows = {};
  const parsed = new Map<string, ParsedRow>();
  for (const src of sources) parsed.set(src.id, parseRow(src.text));

  // --- Collect definitions; reject reserved names and duplicates. ---
  const defOwners = new Map<string, string[]>();
  for (const [id, row] of parsed) {
    if (row.kind !== 'func' && row.kind !== 'var') continue;
    const reserved =
      RESERVED_NAMES.has(row.name) ||
      ALL_FUNCTION_NAMES.has(row.name) ||
      BUILTIN_CONSTANTS.has(row.name) ||
      row.name.startsWith('__') ||
      PRIME_NAME.test(row.name);
    if (reserved) {
      parsed.set(id, { kind: 'error', message: `"${row.name}" is a reserved name` });
      continue;
    }
    if (row.kind === 'func') {
      const bad = row.params.find((p) => p === 'y' || BUILTIN_CONSTANTS.has(p) || ALL_FUNCTION_NAMES.has(p));
      if (bad) {
        parsed.set(id, { kind: 'error', message: `"${bad}" can't be a parameter name` });
        continue;
      }
      if (new Set(row.params).size !== row.params.length) {
        parsed.set(id, { kind: 'error', message: 'Parameter names must be different' });
        continue;
      }
    }
    defOwners.set(row.name, [...(defOwners.get(row.name) ?? []), id]);
  }
  for (const [name, ids] of defOwners) {
    if (ids.length > 1) {
      for (const id of ids) parsed.set(id, { kind: 'error', message: `"${name}" is defined more than once` });
      defOwners.delete(name);
    }
  }

  const defs: Definitions = { functions: new Map(), variables: new Set() };
  const defRows = new Map<string, { id: string; row: DefRow }>();
  for (const [name, [id]] of defOwners) {
    const row = parsed.get(id) as DefRow;
    defRows.set(name, { id, row });
    if (row.kind === 'func') defs.functions.set(name, row.params.length);
    else defs.variables.add(name);
  }

  // --- Rewrite + validate every row. ---
  const analysed = new Map<string, { row: BodyRow; analysis: Analysis }>();
  const allPrimes = new Set<string>();
  for (const [id, row] of parsed) {
    if (row.kind === 'empty' || row.kind === 'error') {
      results[id] = row;
      continue;
    }
    const locals = new Set(row.kind === 'func' ? row.params : row.kind === 'expr' ? ['x'] : []);
    try {
      const isValueName = (name: string) =>
        !defs.functions.has(name) && (locals.has(name) || defs.variables.has(name) || BUILTIN_CONSTANTS.has(name));
      const body = rewrite(row.body, isValueName);
      const analysis = analyse(body, locals, defs);
      analysis.primes.forEach((p) => allPrimes.add(p));
      analysed.set(id, { row: { ...row, body }, analysis });
    } catch (err) {
      results[id] = { kind: 'error', message: err instanceof ValidationError ? err.message : 'Invalid expression' };
    }
  }
  // Variables referencing `x` would be caught as undefined; improve that message.
  for (const [id, result] of Object.entries(results)) {
    const row = parsed.get(id);
    if (row?.kind === 'var' && result.kind === 'error' && /^"x" is not defined|^d\/dx needs/.test(result.message)) {
      results[id] = { kind: 'error', message: `Use ${row.name}(x) = … to define a function of x` };
    }
  }

  // --- Global scope: angle-mode overrides, then built-in derivatives. ---
  const globals = new Map<string, unknown>();
  if (angleMode === 'deg') for (const [name, fn] of Object.entries(degreeTrig)) globals.set(name, fn);
  for (const p of allPrimes) {
    if (!defs.functions.has(PRIME_NAME.exec(p)![1])) globals.set(p, primeFunction(p, globals));
  }

  // --- Resolve definitions in dependency order, detecting cycles. ---
  const defState = new Map<string, 'ok' | 'error'>();
  const stack: string[] = [];
  const failDef = (name: string, message: string) => {
    defState.set(name, 'error');
    const id = defRows.get(name)!.id;
    if (results[id]?.kind !== 'error') results[id] = { kind: 'error', message };
  };

  const resolve = (name: string): boolean => {
    const state = defState.get(name);
    if (state) return state === 'ok';
    const entry = defRows.get(name)!;
    const info = analysed.get(entry.id);
    if (!info) {
      defState.set(name, 'error');
      return false;
    }
    const cycleStart = stack.indexOf(name);
    if (cycleStart !== -1) {
      for (const member of stack.slice(cycleStart)) failDef(member, 'Circular definition');
      return false;
    }
    stack.push(name);
    let depsOk = true;
    for (const dep of info.analysis.deps) {
      if (!resolve(dep)) {
        depsOk = false;
        if (!defState.has(name)) failDef(name, `Depends on "${dep}", which has an error`);
      }
    }
    stack.pop();
    if (defState.get(name) === 'error') return false;
    if (!depsOk) return false;

    const compiled = info.row.body.compile();
    if (info.row.kind === 'func') {
      const params = (info.row as Extract<ParsedRow, { kind: 'func' }>).params;
      // One reusable scope per function is safe: definitions are acyclic, so a
      // function's body can never re-enter the same function.
      const scope = new LayeredScope(globals);
      const fn = (...args: number[]) => {
        for (let i = 0; i < params.length; i++) scope.set(params[i], args[i]);
        return toReal(compiled.evaluate(scope));
      };
      globals.set(name, fn);
      for (const p of allPrimes) if (PRIME_NAME.exec(p)![1] === name) globals.set(p, primeFunction(p, globals));
    } else {
      try {
        globals.set(name, toReal(compiled.evaluate(new LayeredScope(globals))));
      } catch (err) {
        failDef(name, runtimeMessage(err));
        return false;
      }
    }
    defState.set(name, 'ok');
    return true;
  };
  for (const name of defRows.keys()) resolve(name);

  // --- Produce final per-row results. ---
  for (const [id, { row, analysis }] of analysed) {
    if (results[id]) continue; // already an error
    const firstBadDep = [...analysis.deps].find((d) => defState.get(d) !== 'ok');
    if (firstBadDep) {
      results[id] = { kind: 'error', message: `Depends on "${firstBadDep}", which has an error` };
      continue;
    }
    results[id] = finishRow(row, analysis, globals);
  }
  return results;
}

function finishRow(row: BodyRow, analysis: Analysis, globals: Map<string, unknown>): RowResult {
  if (row.kind === 'var') {
    return { kind: 'value', value: globals.get(row.name) as number, name: row.name };
  }
  if (row.kind === 'func') {
    if (row.params.length !== 1) return { kind: 'definition', name: row.name };
    const userFn = globals.get(row.name) as (x: number) => number;
    return probeCurve((x) => userFn(x), row.name);
  }
  // Bare expression or y = …
  const compiled = row.body.compile();
  const scope = new LayeredScope(globals);
  if (!analysis.usesLocal.has('x') && !row.explicitY) {
    try {
      return { kind: 'value', value: toReal(compiled.evaluate(scope)) };
    } catch (err) {
      return { kind: 'error', message: runtimeMessage(err) };
    }
  }
  return probeCurve((x) => {
    scope.set('x', x);
    return toReal(compiled.evaluate(scope));
  });
}

/**
 * Runs a candidate curve at a few points. If it throws everywhere the
 * expression is broken (e.g. wrong argument count for a builtin) and we
 * report that; otherwise we return a version that maps any throw to NaN.
 */
function probeCurve(raw: RealFn, name?: string): RowResult {
  let lastError: unknown = null;
  let anyOk = false;
  for (const x of [0.123, 1.7, -2.3, 10.5]) {
    try {
      raw(x);
      anyOk = true;
      break;
    } catch (err) {
      lastError = err;
    }
  }
  if (!anyOk) return { kind: 'error', message: runtimeMessage(lastError) };
  const safe: RealFn = (x) => {
    try {
      return raw(x);
    } catch {
      return NaN;
    }
  };
  return { kind: 'curve', fn: safe, name };
}

function runtimeMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  if (/Too few arguments|Too many arguments|Wrong number of arguments/i.test(msg)) {
    return 'Wrong number of arguments';
  }
  return msg.length > 80 ? 'Could not evaluate this expression' : msg;
}
