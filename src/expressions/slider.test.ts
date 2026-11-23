import { describe, expect, it } from 'vitest';
import { defaultBounds, effectiveBounds, formatSliderValue, niceStep, parseSliderRow, undefinedVariable } from './slider';

describe('sliders', () => {
  it('recognises variables set to plain numbers', () => {
    expect(parseSliderRow('a = 3')).toEqual({ name: 'a', value: 3 });
    expect(parseSliderRow('k=-2.5')).toEqual({ name: 'k', value: -2.5 });
    expect(parseSliderRow(' b_1 = .5 ')).toEqual({ name: 'b_1', value: 0.5 });
    expect(parseSliderRow('θ = 1')).toEqual({ name: 'θ', value: 1 });
    expect(parseSliderRow('a = 2 + 1')).toBeNull(); // not a plain number
    expect(parseSliderRow('a = pi')).toBeNull();
    expect(parseSliderRow('x = 3')).toBeNull(); // vertical line
    expect(parseSliderRow('f(x) = 3')).toBeNull();
  });

  it('picks sensible ranges and steps', () => {
    expect(defaultBounds(3)).toEqual({ min: -10, max: 10, step: 0.1 });
    expect(defaultBounds(-40)).toEqual({ min: -100, max: 100, step: 1 });
    expect(niceStep(2)).toBeCloseTo(0.01, 12);
    expect(effectiveBounds(15, { min: 0, max: 10, step: 0.1 })).toEqual({ min: 0, max: 15, step: 0.1 });
  });

  it('formats values to the step precision', () => {
    expect(formatSliderValue(2.30000000004, 0.1)).toBe('2.3');
    expect(formatSliderValue(-0.04, 0.1)).toBe('0');
    expect(formatSliderValue(7, 1)).toBe('7');
    expect(formatSliderValue(0.125, 0.005)).toBe('0.125');
  });

  it('finds the variable to offer a slider for', () => {
    expect(undefinedVariable('"a" is not defined')).toBe('a');
    expect(undefinedVariable('"y" is not defined')).toBeNull();
    expect(undefinedVariable('Expression is incomplete')).toBeNull();
  });
});
