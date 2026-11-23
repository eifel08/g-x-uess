import { describe, expect, it } from 'vitest';
import { formatDomain, MAX_DOMAIN, MIN_DOMAIN, wheelFactor, zoomDomain } from './zoom';

describe('3D zoom', () => {
  it('scales and clamps the box size', () => {
    expect(zoomDomain(5, 2)).toBe(10);
    expect(zoomDomain(5, 0.5)).toBe(2.5);
    expect(zoomDomain(5, 1e9)).toBe(MAX_DOMAIN);
    expect(zoomDomain(5, 1e-9)).toBe(MIN_DOMAIN);
    expect(zoomDomain(5, NaN)).toBe(5);
    expect(zoomDomain(5, 0)).toBe(5);
  });

  it('zooms out on scroll down and in on scroll up, symmetrically', () => {
    const out = wheelFactor(100, 0, 800, false);
    const inn = wheelFactor(-100, 0, 800, false);
    expect(out).toBeGreaterThan(1);
    expect(inn).toBeLessThan(1);
    expect(out * inn).toBeCloseTo(1, 12);
    // Line-based wheels and trackpad pinches still give sensible steps.
    expect(wheelFactor(3, 1, 800, false)).toBeCloseTo(wheelFactor(48, 0, 800, false), 12);
    expect(wheelFactor(-10, 0, 800, true)).toBeLessThan(wheelFactor(-10, 0, 800, false));
  });

  it('formats the visible range', () => {
    expect(formatDomain(5)).toBe('±5');
    expect(formatDomain(0.25)).toBe('±0.25');
    expect(formatDomain(1234)).toBe('±1200');
  });
});
