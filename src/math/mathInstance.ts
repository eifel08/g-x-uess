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
  minDependencies,
  maxDependencies,
  gammaDependencies,
  hypotDependencies,
  piDependencies,
  eDependencies,
  tauDependencies,
  phiDependencies,
} from 'mathjs';

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
    minDependencies,
    maxDependencies,
    gammaDependencies,
    hypotDependencies,
    piDependencies,
    eDependencies,
    tauDependencies,
    phiDependencies,
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
  'abs', 'sign', 'floor', 'ceil', 'round', 'fix', 'mod', 'min', 'max',
  'gamma', 'factorial', 'hypot',
]);

/** Built-in constants. Users cannot redefine these. */
export const BUILTIN_CONSTANTS = new Set(['pi', 'e', 'tau', 'phi']);

/** Names that have special meaning in rows (`y = ...`) and can't be defined as functions/variables. */
export const RESERVED_NAMES = new Set(['x', 'y']);
