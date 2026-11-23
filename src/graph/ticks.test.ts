import { describe, expect, it } from 'vitest';
import { formatCoord, formatTick, gridSpacing } from './ticks';

describe('gridSpacing', () => {
  it('picks 1-2-5 steps at least ~90px apart', () => {
    expect(gridSpacing(50)).toEqual({ major: 2, minor: 0.5 });
    expect(gridSpacing(100)).toEqual({ major: 1, minor: 0.2 });
    expect(gridSpacing(10).major).toBe(10);
    expect(gridSpacing(1e6).major).toBeCloseTo(1e-4);
  });
});

describe('formatTick', () => {
  it('uses just enough decimals for the step', () => {
    expect(formatTick(2, 1)).toBe('2');
    expect(formatTick(-0.5, 0.5)).toBe('−0.5');
    expect(formatTick(0.3, 0.1)).toBe('0.3');
    expect(formatTick(0.799998, 0.000001)).toBe('0.799998');
  });

  it('switches to scientific notation for extreme magnitudes', () => {
    expect(formatTick(2e6, 1e6)).toBe('2×10⁶');
    expect(formatTick(1e-6, 1e-6)).toBe('10⁻⁶');
    expect(formatTick(-3e-7, 1e-7)).toBe('−3×10⁻⁷');
  });
});

describe('formatCoord', () => {
  it('rounds to a precision matching the zoom level', () => {
    expect(formatCoord(Math.PI, 50)).toBe('3.142');
    expect(formatCoord(-2, 50)).toBe('−2');
    expect(formatCoord(Math.PI, 1e5)).toBe('3.141593');
  });
});
