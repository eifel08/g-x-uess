/**
 * Grid spacing and number formatting. Major gridlines are 1, 2 or 5 × 10^k
 * units apart, chosen so they're at least `minPx` pixels apart on screen.
 */
export interface GridSpacing {
  major: number;
  minor: number;
}

export function gridSpacing(scale: number, minPx = 90): GridSpacing {
  const raw = minPx / scale;
  const exp = Math.floor(Math.log10(raw));
  const mag = 10 ** exp;
  const norm = raw / mag;
  const mantissa = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  const major = mantissa * mag;
  const minor = major / (mantissa === 2 ? 4 : 5);
  return { major, minor };
}

/** Integer multiples k such that k * step lies within [min, max]. */
export function tickIndices(min: number, max: number, step: number): [number, number] {
  return [Math.ceil(min / step), Math.floor(max / step)];
}

const SUPERSCRIPT: Record<string, string> = {
  '-': '⁻', '0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹',
};

const toSuperscript = (s: string) => [...s].map((c) => SUPERSCRIPT[c] ?? c).join('');

const MINUS = '−';

/**
 * Formats an axis label `value` that is a multiple of `step`, using as many
 * decimals as the step needs, and scientific notation for very large/small.
 */
export function formatTick(value: number, step: number): string {
  if (value === 0) return '0';
  const abs = Math.abs(value);
  if (abs >= 1e6 || abs < 1e-4) {
    const sig = Math.max(0, Math.round(Math.log10(abs) - Math.log10(step)));
    const [m, e] = value.toExponential(Math.min(sig, 6)).split('e');
    const mantissa = trimZeros(m);
    const exponent = toSuperscript(String(Number(e)));
    const prefix = mantissa === '1' ? '' : mantissa === '-1' ? MINUS : `${mantissa.replace('-', MINUS)}×`;
    return `${prefix}10${exponent}`;
  }
  const decimals = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return value.toFixed(decimals).replace('-', MINUS);
}

/** Formats a coordinate for point readouts, with precision tied to zoom. */
export function formatCoord(value: number, scale: number): string {
  if (!Number.isFinite(value)) return value > 0 ? '∞' : value < 0 ? `${MINUS}∞` : 'undefined';
  const abs = Math.abs(value);
  if (abs !== 0 && (abs >= 1e7 || abs < 1e-5)) {
    return value.toPrecision(5).replace(/\.?0+e/, 'e').replace('-', MINUS);
  }
  const decimals = Math.min(10, Math.max(0, Math.ceil(Math.log10(scale)) + 1));
  const fixed = trimZeros(value.toFixed(decimals));
  return (fixed === '-0' ? '0' : fixed).replace('-', MINUS);
}

function trimZeros(s: string): string {
  return s.includes('.') ? s.replace(/0+$/, '').replace(/\.$/, '') : s;
}
