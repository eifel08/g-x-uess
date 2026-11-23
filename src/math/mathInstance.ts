import {
  create,
  parseDependencies,
  addDependencies,
  subtractDependencies,
  multiplyDependencies,
  divideDependencies,
  powDependencies,
  unaryMinusDependencies,
  unaryPlusDependencies,
  factorialDependencies,
  modDependencies,
  largerDependencies,
  smallerDependencies,
  largerEqDependencies,
  smallerEqDependencies,
  equalDependencies,
  unequalDependencies,
  andDependencies,
  orDependencies,
  notDependencies,
  xorDependencies,
  dotMultiplyDependencies,
  dotDivideDependencies,
  dotPowDependencies,
  sinDependencies,
  cosDependencies,
  tanDependencies,
  secDependencies,
  cscDependencies,
  cotDependencies,
  asinDependencies,
  acosDependencies,
  atanDependencies,
  asecDependencies,
  acscDependencies,
  acotDependencies,
  atan2Dependencies,
  sinhDependencies,
  coshDependencies,
  tanhDependencies,
  sechDependencies,
  cschDependencies,
  cothDependencies,
  asinhDependencies,
  acoshDependencies,
  atanhDependencies,
  sqrtDependencies,
  cbrtDependencies,
  nthRootDependencies,
  expDependencies,
  log10Dependencies,
  log2Dependencies,
  log1pDependencies,
  expm1Dependencies,
  absDependencies,
  signDependencies,
  floorDependencies,
  ceilDependencies,
  roundDependencies,
  fixDependencies,
  gammaDependencies,
  hypotDependencies,
  piDependencies,
  eDependencies,
  tauDependencies,
  phiDependencies,
  InfinityDependencies,
} from 'mathjs';
import { gcd, lcm, list, listFunctions, logbase, range } from './functions';
import { specialForms } from './specialForms';

/**
 * A private mathjs instance configured for a graphing calculator.
 *
 * Only the factories we actually expose are included, which keeps the bundle
 * small (tree-shaking can't remove anything from `create(all)`).
 *
 * - `predictable: true` makes e.g. sqrt(-1) return NaN instead of a complex
 *   number, which is what a real-valued plotter wants.
 * - `log` follows calculator convention (base 10) and `ln` is the natural log.
 *
 * Security: we never call `evaluate` on raw user text. Expressions are parsed
 * into an AST, validated against an explicit whitelist of node types, symbols
 * and functions (see compile.ts), and only then compiled. The handful of
 * mathjs functions that could reach outside that sandbox are disabled below
 * as defence-in-depth.
 */
export const math = create(
  {
    parseDependencies,
    addDependencies,
    subtractDependencies,
    multiplyDependencies,
    divideDependencies,
    powDependencies,
    unaryMinusDependencies,
    unaryPlusDependencies,
    factorialDependencies,
    modDependencies,
    largerDependencies,
    smallerDependencies,
    largerEqDependencies,
    smallerEqDependencies,
    equalDependencies,
    unequalDependencies,
    andDependencies,
    orDependencies,
    notDependencies,
    xorDependencies,
    dotMultiplyDependencies,
    dotDivideDependencies,
    dotPowDependencies,
    sinDependencies,
    cosDependencies,
    tanDependencies,
    secDependencies,
    cscDependencies,
    cotDependencies,
    asinDependencies,
    acosDependencies,
    atanDependencies,
    asecDependencies,
    acscDependencies,
    acotDependencies,
    atan2Dependencies,
    sinhDependencies,
    coshDependencies,
    tanhDependencies,
    sechDependencies,
    cschDependencies,
    cothDependencies,
    asinhDependencies,
    acoshDependencies,
    atanhDependencies,
    sqrtDependencies,
    cbrtDependencies,
    nthRootDependencies,
    expDependencies,
    log10Dependencies,
    log2Dependencies,
    log1pDependencies,
    expm1Dependencies,
    absDependencies,
    signDependencies,
    floorDependencies,
    ceilDependencies,
    roundDependencies,
    fixDependencies,
    gammaDependencies,
    hypotDependencies,
    piDependencies,
    eDependencies,
    tauDependencies,
    phiDependencies,
    InfinityDependencies,
  },
  { predictable: true },
);

const naturalLog = (x: number) => Math.log(x);
const calcLog = (x: number, base?: number) =>
  base === undefined ? Math.log10(x) : Math.log(x) / Math.log(base);

math.import(
  {
    ln: naturalLog,
    log: calcLog,
    arcsin: Math.asin,
    arccos: Math.acos,
    arctan: Math.atan,
    logbase,
    gcd,
    lcm,
    ...listFunctions,
    // Internal names produced by the compiler for [a, b, c] and [a...b].
    __list: list,
    __range: range,
    // d/dx, ∫, Σ, Π: these receive unevaluated arguments (`rawArgs`).
    ...specialForms,
  },
  { override: true },
);

// Keep references we need before disabling the dangerous entry points.
export const parse = math.parse.bind(math);

const disabled = (name: string) => () => {
  throw new Error(`Function ${name} is disabled`);
};
math.import(
  {
    import: disabled('import'),
    createUnit: disabled('createUnit'),
    evaluate: disabled('evaluate'),
    parse: disabled('parse'),
    simplify: disabled('simplify'),
    derivative: disabled('derivative'),
    resolve: disabled('resolve'),
    reviver: disabled('reviver'),
  },
  { override: true },
);

/** Built-in functions users may call. Anything else is rejected at compile time. */
export const BUILTIN_FUNCTIONS = new Set([
  // trig
  'sin', 'cos', 'tan', 'sec', 'csc', 'cot',
  'asin', 'acos', 'atan', 'asec', 'acsc', 'acot', 'atan2',
  'arcsin', 'arccos', 'arctan',
  'sinh', 'cosh', 'tanh', 'sech', 'csch', 'coth',
  'asinh', 'acosh', 'atanh',
  // powers, roots, logs
  'sqrt', 'cbrt', 'nthRoot', 'exp', 'pow', 'ln', 'log', 'log10', 'log2', 'log1p', 'expm1',
  // misc
  'abs', 'sign', 'floor', 'ceil', 'round', 'fix', 'mod', 'gcd', 'lcm', 'logbase',
  'gamma', 'factorial', 'hypot',
]);

/** Functions that accept lists (`mean([1, 2, 3])`) as well as plain arguments. */
export const LIST_FUNCTIONS = new Set(['mean', 'median', 'stdev', 'stdevp', 'var', 'varp', 'total', 'length', 'min', 'max']);

/** Calculus forms with a bound variable or unevaluated body (see specialForms.ts). */
export const SPECIAL_FORMS = new Set(['ddx', 'int', 'sum', 'prod']);

/** Every callable name a user can't redefine. */
export const ALL_FUNCTION_NAMES = new Set([...BUILTIN_FUNCTIONS, ...LIST_FUNCTIONS, ...SPECIAL_FORMS]);

/** Built-in constants. Users cannot redefine these. */
export const BUILTIN_CONSTANTS = new Set(['pi', 'e', 'tau', 'phi', 'Infinity']);

/** Names that have special meaning in rows (`y = ...`) and can't be defined as functions/variables. */
export const RESERVED_NAMES = new Set(['x', 'y']);
