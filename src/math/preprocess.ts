/**
 * Normalises calculator-style input into syntax mathjs understands.
 * Throws an Error with a user-facing message on unbalanced `|` bars.
 *
 *   −, ×, ÷, π, τ, φ, √, ², ³, ∞     → -, *, /, pi, tau, phi, sqrt, ^2, ^3, Infinity
 *   ≤, ≥, ≠                          → <=, >=, !=
 *   ∫, ∑, ∏                          → int, sum, prod
 *   d/dx(…)                          → ddx(…)
 *   f'(x), f''(x), f′(x)             → f__d1(x), f__d2(x), f__d1(x)
 *   sin⁻¹(x), sin^-1(x), sin^(-1)(x) → asin(x)          (same for cos, tan, …)
 *   log_2(x), log_{10}(x), log_b(x)  → logbase(2, x), …
 *   [1...10]                         → [1:10]
 *   |x|                              → abs(x)
 */
export function preprocess(input: string): string {
  const text = input
    .replace(/[−–—]/g, '-')
    .replace(/[×·⋅]/g, '*')
    .replace(/÷/g, '/')
    .replace(/π/g, 'pi')
    .replace(/τ/g, 'tau')
    .replace(/φ/g, 'phi')
    .replace(/√/g, 'sqrt')
    .replace(/∛/g, 'cbrt')
    .replace(/²/g, '^2')
    .replace(/³/g, '^3')
    .replace(/∞/g, 'Infinity')
    .replace(/≤/g, '<=')
    .replace(/≥/g, '>=')
    .replace(/≠/g, '!=')
    .replace(/∫/g, 'int')
    .replace(/[∑Σ]/g, 'sum')
    .replace(/[∏Π]/g, 'prod')
    .replace(/(\.\.\.|…)/g, ':')
    .replace(/⁻¹/g, '^-1')
    .replace(/″/g, "''")
    .replace(/′/g, "'")
    .replace(/\bd\/dx\b/g, 'ddx')
    .replace(INVERSE_TRIG, 'a$1')
    .replace(LOG_BASE, (_m, braced?: string, paren?: string, plain?: string) => `logbase(${braced ?? paren ?? plain}, `)
    .replace(PRIME, (_m, name: string, primes: string) => `${name}__d${primes.length}(`);

  return convertAbsBars(text);
}

const INVERSE_TRIG = /\b(sinh|cosh|tanh|sech|csch|coth|sin|cos|tan|sec|csc|cot)\s*\^\s*(?:\(\s*-\s*1\s*\)|-\s*1)(?=\s*\()/g;
const LOG_BASE = /\blog_(?:\{([^{}]+)\}|\(([^()]+)\)|([0-9.]+|[A-Za-z][A-Za-z0-9]*))\s*\(/g;
const PRIME = /([A-Za-z][A-Za-z0-9_]*)('+)\s*\(/g;

const OPENS_ABS_AFTER = new Set(['', '(', '[', ',', '+', '-', '*', '/', '^', '=', '<', '>', '!', '?', ':']);

/**
 * Converts `|expr|` into `abs(expr)`. A bar opens a new group when it follows
 * an operator / opening bracket / start of input, otherwise it closes the
 * innermost open group. `||x||` and `|x|+|y|` both work.
 */
function convertAbsBars(text: string): string {
  if (!text.includes('|')) return text;
  let out = '';
  let depth = 0;
  for (const ch of text) {
    if (ch !== '|') {
      out += ch;
      continue;
    }
    const prev = out.trimEnd().slice(-1);
    const opens = depth === 0 || OPENS_ABS_AFTER.has(prev);
    if (opens) {
      out += 'abs(';
      depth++;
    } else {
      out += ')';
      depth--;
    }
  }
  if (depth !== 0) throw new Error('Missing closing |');
  return out;
}
