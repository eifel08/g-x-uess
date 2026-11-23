/** A single line of user input, identified by a stable id. */
export interface ExpressionSource {
  id: string;
  text: string;
}

/** A real-valued function of one variable. Returns NaN where undefined. */
export type RealFn = (x: number) => number;

/** A real-valued function of x and y (the left side of F(x, y) = 0). */
export type RealFn2 = (x: number, y: number) => number;

/** Inequality operators. A plot with one of these shades a region. */
export type Comparison = '<' | '<=' | '>' | '>=';

export interface Circle {
  cx: number;
  cy: number;
  r: number;
}

/** True when v satisfies `v op 0`. */
export function satisfies(v: number, op: Comparison): boolean {
  switch (op) {
    case '<':
      return v < 0;
    case '<=':
      return v <= 0;
    case '>':
      return v > 0;
    case '>=':
      return v >= 0;
  }
}

/** Strict inequalities (<, >) are drawn with a dashed boundary. */
export const isStrict = (op: Comparison) => op === '<' || op === '>';

/** The result of compiling one row, in the context of all other rows. */
export type RowResult =
  /** Blank row. */
  | { kind: 'empty' }
  /** Invalid / incomplete input. `message` is short and user-facing. */
  | { kind: 'error'; message: string }
  /**
   * y = fn(x). `name` is set for `f(x) = …` definitions. With `inequality`,
   * the row is the region `y <op> fn(x)` (e.g. y < x²), bounded by the curve.
   */
  | { kind: 'curve'; fn: RealFn; name?: string; inequality?: Comparison }
  /** The vertical line x = `x`, or with `inequality` the half-plane `x <op> x`. */
  | { kind: 'vline'; x: number; inequality?: Comparison }
  /**
   * The implicit curve F(x, y) = 0, or with `inequality` the region
   * `F(x, y) <op> 0`. `circle` is set when F is exactly a circle, so it can be
   * drawn from its geometry.
   */
  | { kind: 'implicit'; F: RealFn2; circle?: Circle; inequality?: Comparison }
  /** A constant expression (`2+3`, `f(1)`) or variable definition (`a = 3`). */
  | { kind: 'value'; value: number; name?: string }
  /** A definition that is valid but not drawable, e.g. `h(a, b) = a + b`. */
  | { kind: 'definition'; name: string };

export type CompiledRows = Record<string, RowResult>;

/** Rows that draw something on the graph. */
export const isPlottable = (r: RowResult | undefined): r is Extract<RowResult, { kind: 'curve' | 'vline' | 'implicit' }> =>
  r?.kind === 'curve' || r?.kind === 'vline' || r?.kind === 'implicit';
