/** A single line of user input, identified by a stable id. */
export interface ExpressionSource {
  id: string;
  text: string;
}

/** A real-valued function of one variable. Returns NaN where undefined. */
export type RealFn = (x: number) => number;

/** The result of compiling one row, in the context of all other rows. */
export type RowResult =
  /** Blank row. */
  | { kind: 'empty' }
  /** Invalid / incomplete input. `message` is short and user-facing. */
  | { kind: 'error'; message: string }
  /** Something to draw as y = fn(x). `name` is set for `f(x) = …` definitions. */
  | { kind: 'curve'; fn: RealFn; name?: string }
  /** A constant expression (`2+3`, `f(1)`) or variable definition (`a = 3`). */
  | { kind: 'value'; value: number; name?: string }
  /** A definition that is valid but not drawable, e.g. `h(a, b) = a + b`. */
  | { kind: 'definition'; name: string };

export type CompiledRows = Record<string, RowResult>;
