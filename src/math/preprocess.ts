/**
 * Normalises calculator-style input into syntax mathjs understands:
 * unicode operators/symbols and `|x|` absolute-value bars.
 * Throws an Error with a user-facing message on unbalanced bars.
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
    .replace(/²/g, '^2')
    .replace(/³/g, '^3');

  return convertAbsBars(text);
}

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
