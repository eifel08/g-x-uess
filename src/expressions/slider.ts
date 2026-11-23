/** Range settings for a variable's slider, stored on its row. */
export interface SliderBounds {
  min: number;
  max: number;
  step: number;
}

const NAME = /^\s*([A-Za-zα-ωΑ-Ω][A-Za-z0-9_α-ωΑ-Ω]*)\s*=\s*(-?(?:\d+\.?\d*|\.\d+)(?:e-?\d+)?)\s*$/;

/** Rows that get a slider: a variable set to a plain number, e.g. `a = -2.5`. */
export function parseSliderRow(text: string): { name: string; value: number } | null {
  const m = NAME.exec(text);
  if (!m || m[1] === 'x' || m[1] === 'y') return null;
  const value = Number(m[2]);
  return Number.isFinite(value) ? { name: m[1], value } : null;
}

/** A 1-2-5 step giving roughly 200 positions across the range. */
export function niceStep(range: number): number {
  const raw = range / 200;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const norm = raw / mag;
  return (norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10) * mag;
}

/** Default range: −10…10, or a power of ten that contains the value. */
export function defaultBounds(value: number): SliderBounds {
  const abs = Math.abs(value);
  const limit = abs <= 10 ? 10 : 10 ** Math.ceil(Math.log10(abs));
  return { min: -limit, max: limit, step: niceStep(2 * limit) };
}

/** Stored bounds widened to include the current value (typed values may fall outside). */
export function effectiveBounds(value: number, stored: SliderBounds | undefined): SliderBounds {
  const b = stored ?? defaultBounds(value);
  return { ...b, min: Math.min(b.min, value), max: Math.max(b.max, value) };
}

/** Formats a slider value with no more decimals than the step needs. */
export function formatSliderValue(value: number, step: number): string {
  const decimals = Math.max(0, Math.min(10, -Math.floor(Math.log10(step) + 1e-9)));
  const text = value.toFixed(decimals);
  return Number(text) === 0 ? '0' : String(Number(text));
}

/** The variable an error is about, when the fix is to define it: `"a" is not defined`. */
export function undefinedVariable(message: string): string | null {
  const m = /^"([^"]+)" is not defined$/.exec(message);
  return m && m[1] !== 'x' && m[1] !== 'y' ? m[1] : null;
}
