import type { Edit } from '../expressions/editing';

/**
 * Keypad layout as data. Templates use the markers from editing.ts:
 * '#' = selection / cursor slot, '$' = cursor after a wrapped selection.
 */
export type KeyAction = { kind: 'edit'; edit: Edit } | { kind: 'enter' };

export type KeyStyle = 'default' | 'num' | 'op' | 'action' | 'accent';

export interface KeyDef {
  label: string;
  /** Tooltip and accessible name. */
  title: string;
  action: KeyAction;
  style?: KeyStyle;
}

const ins = (template: string): KeyAction => ({ kind: 'edit', edit: { type: 'insert', template } });
const key = (label: string, title: string, template: string, style?: KeyStyle): KeyDef => ({
  label,
  title,
  action: ins(template),
  style,
});
const fn = (name: string, label = name, title = `${name}(x)`) => key(label, title, `${name}(#)$`);

/* ------------------------------- main pad -------------------------------- */

export const SYMBOL_KEYS: KeyDef[] = [
  key('x', 'x', 'x'),
  key('y', 'y', 'y'),
  key('a', 'a', 'a'),
  key('b', 'b', 'b'),
  key('θ', 'theta', 'θ'),

  key('a²', 'Square', '^2'),
  key('aᵇ', 'Power', '^'),
  key('√', 'Square root', 'sqrt(#)$'),
  { label: 'a⁄b', title: 'Fraction', action: { kind: 'edit', edit: { type: 'insert', template: '(#)/($)', wrapPrevious: true } } },
  key('|a|', 'Absolute value', 'abs(#)$'),

  key('(', 'Open parenthesis', '(#)$'),
  { label: ')', title: 'Close parenthesis', action: { kind: 'edit', edit: { type: 'close' } } },
  key('<', 'Less than', '<'),
  key('>', 'Greater than', '>'),
  key(',', 'Comma', ', '),

  key('π', 'pi', 'π'),
  key('e', "Euler's number", 'e'),
  key('∞', 'Infinity', '∞'),
  key('≤', 'Less than or equal', '≤'),
  key('≥', 'Greater than or equal', '≥'),
];

export const NUMBER_KEYS: KeyDef[] = [
  key('7', '7', '7', 'num'),
  key('8', '8', '8', 'num'),
  key('9', '9', '9', 'num'),
  key('÷', 'Divide', '/', 'op'),
  key('4', '4', '4', 'num'),
  key('5', '5', '5', 'num'),
  key('6', '6', '6', 'num'),
  key('×', 'Multiply', '*', 'op'),
  key('1', '1', '1', 'num'),
  key('2', '2', '2', 'num'),
  key('3', '3', '3', 'num'),
  key('−', 'Subtract', '-', 'op'),
  key('0', '0', '0', 'num'),
  key('.', 'Decimal point', '.', 'num'),
  key('=', 'Equals', '=', 'op'),
  key('+', 'Add', '+', 'op'),
];

export const NAV_KEYS = {
  left: { label: '←', title: 'Move cursor left', action: { kind: 'edit', edit: { type: 'left' } }, style: 'action' },
  right: { label: '→', title: 'Move cursor right', action: { kind: 'edit', edit: { type: 'right' } }, style: 'action' },
  backspace: { label: '⌫', title: 'Backspace', action: { kind: 'edit', edit: { type: 'backspace' } }, style: 'action' },
  enter: { label: '↵', title: 'New expression', action: { kind: 'enter' }, style: 'accent' },
} satisfies Record<string, KeyDef>;

/* ------------------------------- functions ------------------------------- */

export interface KeyGroup {
  title: string;
  keys: KeyDef[];
}

export const FUNCTION_GROUPS: KeyGroup[] = [
  {
    title: 'Trigonometry',
    keys: ['sin', 'cos', 'tan', 'csc', 'sec', 'cot'].map((n) => fn(n)),
  },
  {
    title: 'Inverse trig',
    keys: ['sin', 'cos', 'tan', 'csc', 'sec', 'cot'].map((n) => fn(`a${n}`, `${n}⁻¹`, `arc${n}(x)`)),
  },
  {
    title: 'Hyperbolic',
    keys: [
      ...['sinh', 'cosh', 'tanh', 'csch', 'sech', 'coth'].map((n) => fn(n)),
      ...['sinh', 'cosh', 'tanh'].map((n) => fn(`a${n}`, `${n}⁻¹`, `inverse ${n}(x)`)),
    ],
  },
  {
    title: 'Calculus',
    keys: [
      key('d/dx', 'Derivative: d/dx(x^2)', 'd/dx(#)$'),
      key("f′(x)", "Derivative of f: f'(x)", "f'(x)"),
      key("f″(x)", "Second derivative: f''(x)", "f''(x)"),
      key('′', 'Prime', "'"),
      key('∫ₐᵇ', 'Definite integral: int(t, a, b, expression)', 'int(t, #, , )'),
    ],
  },
  {
    title: 'Series & products',
    keys: [
      key('Σ', 'Sum: sum(n, from, to, expression)', 'sum(n, #, , )'),
      key('Π', 'Product: prod(n, from, to, expression)', 'prod(n, #, , )'),
      key('n!', 'Factorial', '!'),
    ],
  },
  {
    title: 'Roots & powers',
    keys: [
      key('√', 'Square root', 'sqrt(#)$'),
      key('∛', 'Cube root', 'cbrt(#)$'),
      key('ⁿ√', 'nth root: nthRoot(x, n)', 'nthRoot(#, )'),
      key('a²', 'Square', '^2'),
      key('aᵇ', 'Superscript (power)', '^'),
      key('a⁻¹', 'Reciprocal', '^(-1)'),
      key('a₁', 'Subscript (in names like a_1)', '_'),
    ],
  },
  {
    title: 'Logs & exponentials',
    keys: [
      fn('ln'),
      fn('log', 'log', 'log base 10'),
      key('logₐ', 'Log with custom base: log_2(x)', 'log_#()'),
      fn('exp'),
      key('eˣ', 'e to the power', 'e^(#)$'),
      key('10ˣ', '10 to the power', '10^(#)$'),
    ],
  },
  {
    title: 'Number',
    keys: [
      fn('abs', '|a|', 'abs(x)'),
      fn('floor'),
      fn('ceil'),
      fn('round'),
      fn('sign'),
      key('mod', 'mod(a, b)', 'mod(#, )'),
      key('gcd', 'gcd(a, b)', 'gcd(#, )'),
      key('lcm', 'lcm(a, b)', 'lcm(#, )'),
      key('min', 'min(a, b)', 'min(#, )'),
      key('max', 'max(a, b)', 'max(#, )'),
    ],
  },
  {
    title: 'Statistics & lists',
    keys: [
      ...['mean', 'median', 'stdev', 'stdevp', 'var', 'varp', 'total', 'length', 'min', 'max'].map((n) =>
        key(n, `${n}([1, 2, 3])`, `${n}([#])`),
      ),
      key('[ ]', 'List: [1, 2, 3]', '[#]'),
      key('[a…b]', 'Range: [1...10]', '[1...#]'),
    ],
  },
];
