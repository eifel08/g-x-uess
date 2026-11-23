import type { MathNode } from 'mathjs';
import { BUILTIN_CONSTANTS, BUILTIN_FUNCTIONS, RESERVED_NAMES, math, parse } from './mathInstance';
import { preprocess } from './preprocess';
import type { CompiledRows, ExpressionSource, RealFn, RowResult } from './types';

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
  map(cb: (child: AnyNode) => AnyNode): AnyNode;
  traverse(cb: (node: AnyNode, path: string, parent: AnyNode | null) => void): void;
  compile(): { evaluate(scope?: unknown): unknown };
}

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
    node = parse(preprocess(text)) as AnyNode;
  } catch (err) {
    return { kind: 'error', message: friendlySyntaxError(err) };
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
  return { kind: 'expr', body: node, explicitY: false };
}

function friendlySyntaxError(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  const msg = raw.replace(/\s*\(char \d+\)\s*$/, '');
  if (/^Unexpected end of expression/.test(msg)) return 'Expression is incomplete';
  if (/^Parenthesis \) expected/.test(msg)) return 'Missing closing parenthesis';
  if (/^Unexpected operator \)/.test(msg) || /^Unexpected "\)"/.test(msg)) return 'Unmatched closing parenthesis';
  if (/^Invalid left hand side of assignment/.test(msg)) return 'Only y = …, name = … or f(x) = … are supported';
  if (/^Value expected/.test(msg)) return 'Expected a number or expression';
  return msg;
}

/** mathjs node constructors want their own node type; ours is a structural view of it. */
const m = (node: AnyNode) => node as unknown as MathNode;

/* ------------------------------------------------------------------------ */
/* Stage 2: calculator-style rewrites                                        */
/* ------------------------------------------------------------------------ */

/**
 * Rewrites the AST bottom-up so it reads the way a graphing calculator would:
 *  - `sin x`, `2 sin x`   → sin(x), 2 * sin(x)    (mathjs reads `sin * x`)
 *  - `x(x+1)`, `a(x-1)`   → x * (x+1)              (mathjs reads a call to x)
 */
function rewrite(node: AnyNode, isValueName: (name: string) => boolean): AnyNode {
  const mapped = node.map((child) => rewrite(child, isValueName));

  if (mapped.type === 'OperatorNode' && mapped.fn === 'multiply' && mapped.implicit && mapped.args?.length === 2) {
    const [left, right] = mapped.args;
    if (left.type === 'SymbolNode' && BUILTIN_FUNCTIONS.has(left.name!)) {
      return new math.FunctionNode(left.name!, [m(right)]) as unknown as AnyNode;
    }
    const tail = left.type === 'OperatorNode' && left.fn === 'multiply' && left.implicit ? left.args?.[1] : undefined;
    if (tail?.type === 'SymbolNode' && BUILTIN_FUNCTIONS.has(tail.name!)) {
      const call = new math.FunctionNode(tail.name!, [m(right)]);
      return new math.OperatorNode('*', 'multiply', [m(left.args![0]), call], true) as unknown as AnyNode;
    }
  }

  if (mapped.type === 'FunctionNode' && mapped.args?.length === 1) {
    const fnNode = mapped.fn as AnyNode;
    if (fnNode.type === 'SymbolNode' && isValueName(fnNode.name!)) {
      const sym = new math.SymbolNode(fnNode.name!);
      const paren = new math.ParenthesisNode(m(mapped.args[0]));
      return new math.OperatorNode('*', 'multiply', [sym, paren], true) as unknown as AnyNode;
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

interface Definitions {
  functions: Map<string, number>; // name -> arity
  variables: Set<string>;
}

interface Analysis {
  deps: Set<string>; // user definitions referenced
  usesLocal: Set<string>; // local/bound variables referenced (e.g. x)
}

class ValidationError extends Error {}

function analyse(body: AnyNode, locals: Set<string>, defs: Definitions): Analysis {
  const deps = new Set<string>();
  const usesLocal = new Set<string>();

  body.traverse((node, path) => {
    switch (node.type) {
      case 'ParenthesisNode':
      case 'ConditionalNode':
        return;
      case 'ConstantNode':
        if (typeof node.value !== 'number') throw new ValidationError('Only numbers are supported');
        return;
      case 'OperatorNode':
        if (!ALLOWED_OPERATORS.has(node.fn as string)) {
          throw new ValidationError(`Operator "${node.op}" is not supported`);
        }
        return;
      case 'FunctionNode': {
        const fnNode = node.fn as AnyNode;
        if (fnNode.type !== 'SymbolNode') throw new ValidationError('Invalid function call');
        const name = fnNode.name!;
        if (defs.functions.has(name)) {
          const arity = defs.functions.get(name)!;
          if (node.args!.length !== arity) {
            throw new ValidationError(`${name} takes ${arity} argument${arity === 1 ? '' : 's'}`);
          }
          deps.add(name);
        } else if (!BUILTIN_FUNCTIONS.has(name)) {
          throw new ValidationError(
            locals.has(name) || defs.variables.has(name) || BUILTIN_CONSTANTS.has(name)
              ? `${name} is not a function`
              : `Unknown function "${name}"`,
          );
        }
        return;
      }
      case 'SymbolNode': {
        if (path === 'fn') return; // the name part of a FunctionNode, handled above
        const name = node.name!;
        if (locals.has(name)) usesLocal.add(name);
        else if (BUILTIN_CONSTANTS.has(name)) return;
        else if (defs.variables.has(name)) deps.add(name);
        else if (defs.functions.has(name) || BUILTIN_FUNCTIONS.has(name)) {
          throw new ValidationError(`${name} is a function — write ${name}(x)`);
        } else if (name === 'y') throw new ValidationError('y can only appear as "y = …"');
        else throw new ValidationError(`"${name}" is not defined`);
        return;
      }
      default:
        throw new ValidationError('Unsupported syntax');
    }
  });
  return { deps, usesLocal };
}

/* ------------------------------------------------------------------------ */
/* Runtime scopes                                                            */
/* ------------------------------------------------------------------------ */

/** A Map-compatible scope with local bindings layered over a shared parent. */
class LayeredScope {
  private readonly local = new Map<string, unknown>();
  constructor(private readonly parent: Map<string, unknown>) {}
  get(key: string) {
    return this.local.has(key) ? this.local.get(key) : this.parent.get(key);
  }
  set(key: string, value: unknown) {
    this.local.set(key, value);
    return this;
  }
  has(key: string) {
    return this.local.has(key) || this.parent.has(key);
  }
  keys() {
    return new Set([...this.parent.keys(), ...this.local.keys()]).values();
  }
  delete(key: string) {
    return this.local.delete(key);
  }
  clear() {
    this.local.clear();
  }
  forEach(cb: (value: unknown, key: string) => void) {
    for (const key of this.keys()) cb(this.get(key), key);
  }
}

function toReal(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'boolean') return v ? 1 : 0;
  return NaN;
}

/* ------------------------------------------------------------------------ */
/* Stage 4: link all rows together                                           */
/* ------------------------------------------------------------------------ */

type BodyRow = Extract<ParsedRow, { body: AnyNode }>;
type DefRow = Extract<ParsedRow, { kind: 'func' } | { kind: 'var' }>;

/**
 * Compiles a full list of rows. Rows can reference definitions from other
 * rows (`g(x) = f(x) + a`), in any order. Every row gets its own result, so
 * one bad row never breaks the others.
 */
export function compileExpressions(sources: readonly ExpressionSource[]): CompiledRows {
  const results: CompiledRows = {};
  const parsed = new Map<string, ParsedRow>();
  for (const src of sources) parsed.set(src.id, parseRow(src.text));

  // --- Collect definitions; reject reserved names and duplicates. ---
  const defOwners = new Map<string, string[]>();
  for (const [id, row] of parsed) {
    if (row.kind !== 'func' && row.kind !== 'var') continue;
    const reserved = RESERVED_NAMES.has(row.name) || BUILTIN_FUNCTIONS.has(row.name) || BUILTIN_CONSTANTS.has(row.name);
    if (reserved) {
      parsed.set(id, { kind: 'error', message: `"${row.name}" is a reserved name` });
      continue;
    }
    if (row.kind === 'func') {
      const bad = row.params.find((p) => p === 'y' || BUILTIN_CONSTANTS.has(p) || BUILTIN_FUNCTIONS.has(p));
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
      analysed.set(id, { row: { ...row, body }, analysis });
    } catch (err) {
      results[id] = { kind: 'error', message: err instanceof ValidationError ? err.message : 'Invalid expression' };
    }
  }
  // Variables referencing `x` would be caught as undefined; improve that message.
  for (const [id, result] of Object.entries(results)) {
    const row = parsed.get(id);
    if (row?.kind === 'var' && result.kind === 'error' && result.message === '"x" is not defined') {
      results[id] = { kind: 'error', message: `Use ${row.name}(x) = … to define a function of x` };
    }
  }

  // --- Resolve definitions in dependency order, detecting cycles. ---
  const globals = new Map<string, unknown>();
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
