/**
 * Plain-number implementations of calculator functions that mathjs either
 * lacks or implements differently from graphing-calculator conventions.
 */

/* ----------------------------- logs & numbers ---------------------------- */

export const logbase = (base: number, x: number) => Math.log(x) / Math.log(base);

const isInt = (n: number) => Number.isInteger(n);

function gcd2(a: number, b: number): number {
  a = Math.abs(a);
  b = Math.abs(b);
  while (b) [a, b] = [b, a % b];
  return a;
}

export function gcd(...args: unknown[]): number {
  const nums = flatten(args);
  if (nums.length === 0 || !nums.every(isInt)) return NaN;
  return nums.reduce(gcd2);
}

export function lcm(...args: unknown[]): number {
  const nums = flatten(args);
  if (nums.length === 0 || !nums.every(isInt)) return NaN;
  return nums.reduce((a, b) => (a === 0 || b === 0 ? 0 : Math.abs(a * b) / gcd2(a, b)));
}

/* --------------------------------- lists --------------------------------- */

/** Maximum list length produced by ranges like [1...n]. */
export const MAX_LIST_LENGTH = 10_000;

/** Flattens numbers and (nested) arrays into a flat number list. */
export function flatten(args: readonly unknown[]): number[] {
  const out: number[] = [];
  const visit = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(visit);
    else out.push(typeof v === 'number' ? v : typeof v === 'boolean' ? Number(v) : NaN);
  };
  args.forEach(visit);
  return out;
}

/** `[a, b, c]` literal (internal name, produced by the compiler). */
export const list = (...items: unknown[]) => flatten(items);

/** `[start...end]` or `[start...end, step]`: integer-stepped range. */
export function range(start: number, end: number, stepArg?: number): number[] {
  const step = stepArg ?? (end >= start ? 1 : -1);
  if (!Number.isFinite(start) || !Number.isFinite(end) || !Number.isFinite(step) || step === 0) return [NaN];
  const count = Math.floor((end - start) / step + 1e-9) + 1;
  if (count <= 0) return [];
  if (count > MAX_LIST_LENGTH) return [NaN];
  return Array.from({ length: count }, (_, i) => start + i * step);
}

const nonEmpty = (f: (xs: number[]) => number) => (...args: unknown[]) => {
  const xs = flatten(args);
  return xs.length === 0 ? NaN : f(xs);
};

const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const meanOf = (xs: number[]) => sum(xs) / xs.length;
const sqDev = (xs: number[]) => {
  const m = meanOf(xs);
  return xs.reduce((acc, v) => acc + (v - m) ** 2, 0);
};

export const listFunctions = {
  mean: nonEmpty(meanOf),
  median: nonEmpty((xs) => {
    const s = [...xs].sort((a, b) => a - b);
    const mid = s.length >> 1;
    return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
  }),
  /** Sample standard deviation (n − 1). */
  stdev: nonEmpty((xs) => (xs.length < 2 ? NaN : Math.sqrt(sqDev(xs) / (xs.length - 1)))),
  /** Population standard deviation (n). */
  stdevp: nonEmpty((xs) => Math.sqrt(sqDev(xs) / xs.length)),
  /** Sample variance (n − 1). */
  var: nonEmpty((xs) => (xs.length < 2 ? NaN : sqDev(xs) / (xs.length - 1))),
  /** Population variance (n). */
  varp: nonEmpty((xs) => sqDev(xs) / xs.length),
  total: (...args: unknown[]) => sum(flatten(args)),
  length: (...args: unknown[]) => flatten(args).length,
  min: nonEmpty((xs) => xs.reduce((a, b) => (b < a || Number.isNaN(b) ? b : a))),
  max: nonEmpty((xs) => xs.reduce((a, b) => (b > a || Number.isNaN(b) ? b : a))),
};

/* ------------------------------ angle modes ------------------------------ */

export type AngleMode = 'rad' | 'deg';

const DEG = Math.PI / 180;

/** sin in degrees, exact at multiples of 90°. */
function sinDeg(d: number): number {
  const r = ((d % 360) + 360) % 360;
  if (r === 0 || r === 180) return 0;
  if (r === 90) return 1;
  if (r === 270) return -1;
  return Math.sin(r * DEG);
}
const cosDeg = (d: number) => sinDeg(d + 90);
const tanDeg = (d: number) => sinDeg(d) / cosDeg(d);

/**
 * Overrides for trigonometric functions in degree mode: forward functions
 * take degrees, inverse functions return degrees. Hyperbolic functions are
 * unaffected (their arguments aren't angles).
 */
export const degreeTrig: Record<string, (...args: number[]) => number> = {
  sin: sinDeg,
  cos: cosDeg,
  tan: tanDeg,
  sec: (d) => 1 / cosDeg(d),
  csc: (d) => 1 / sinDeg(d),
  cot: (d) => cosDeg(d) / sinDeg(d),
  asin: (x) => Math.asin(x) / DEG,
  acos: (x) => Math.acos(x) / DEG,
  atan: (x) => Math.atan(x) / DEG,
  asec: (x) => Math.acos(1 / x) / DEG,
  acsc: (x) => Math.asin(1 / x) / DEG,
  acot: (x) => Math.atan(1 / x) / DEG,
  atan2: (y, x) => Math.atan2(y, x) / DEG,
  arcsin: (x) => Math.asin(x) / DEG,
  arccos: (x) => Math.acos(x) / DEG,
  arctan: (x) => Math.atan(x) / DEG,
};
