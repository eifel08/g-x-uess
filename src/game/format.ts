/** Builders for clean, readable calculator syntax used by the target generators. */


export const num = (n: number) => String(Number(n.toFixed(4)));

/** a·s with tidy coefficients: 1·s → s, −1·s → −s, 0.5·x → x/2. */
export function coef(a: number, s: string): string {
  if (a === 1) return s;
  if (a === -1) return `-${s}`;
  if (a === 0.5 && s === 'x') return 'x/2';
  if (a === -0.5 && s === 'x') return '-x/2';
  return `${num(a)}${s}`;
}

/** " + k" / " - |k|" / "" */
export const plus = (k: number) => (k > 0 ? ` + ${num(k)}` : k < 0 ? ` - ${num(-k)}` : '');

/** " + a·term" / " − |a|·term" */
export const plusTerm = (a: number, term: string) => (a < 0 ? ` - ${coef(-a, term)}` : ` + ${coef(a, term)}`);

/** "x − h" without parentheses, for use inside a function call. */
export const inner = (h: number, v = 'x') => (h === 0 ? v : h > 0 ? `${v} - ${num(h)}` : `${v} + ${num(-h)}`);

/** "(x − h)" or plain "x", for powers and products. */
export const shifted = (h: number, v = 'x') => (h === 0 ? v : `(${inner(h, v)})`);

/** Polynomial from coefficients, highest degree first: [1, -3, 0, 2] → "x^3 - 3x^2 + 2". */
export function poly(coeffs: number[]): string {
  const degree = coeffs.length - 1;
  let out = '';
  coeffs.forEach((c, i) => {
    if (c === 0) return;
    const p = degree - i;
    const variable = p === 0 ? '' : p === 1 ? 'x' : `x^${p}`;
    const mag = Math.abs(c);
    const body = variable === '' ? num(mag) : mag === 1 ? variable : `${num(mag)}${variable}`;
    if (out === '') out = c < 0 ? `-${body}` : body;
    else out += c < 0 ? ` - ${body}` : ` + ${body}`;
  });
  return out || '0';
}

