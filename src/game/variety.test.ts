import { describe, expect, it } from 'vitest';
import { compileTarget, DIFFICULTIES, generateTarget, isGoodTarget } from './generator';
import { compileTarget3D, generateTarget3D, isGoodTarget3D } from './generator3d';

/** Functions are counted by their values at fixed points, so equivalent strings count once. */
const XS = [-7.3, -2.9, -0.41, 0.77, 2.6, 5.3, 8.9];
const PS: [number, number][] = [
  [-3.1, 1.7],
  [0.6, -2.2],
  [2.9, 3.3],
  [-1.4, -4.1],
  [4.2, 0.3],
];
const fmt = (y: number) => (Number.isFinite(y) ? y.toPrecision(9) : 'u');
const seedAt = (i: number) => (i * 2654435761) % 2 ** 31;

describe('target variety', () => {
  it.each(DIFFICULTIES)('2D difficulty %i has at least 1,000 distinct functions', (d) => {
    const seen = new Set<string>();
    for (let i = 1; i <= 3000; i++) {
      const f = compileTarget(generateTarget(d, seedAt(i)).expression)!;
      seen.add(XS.map((x) => fmt(f(x))).join());
    }
    expect(seen.size).toBeGreaterThanOrEqual(1000);
  });

  it.each(DIFFICULTIES)('3D difficulty %i has at least 500 distinct surfaces', (d) => {
    const seen = new Set<string>();
    for (let i = 1; i <= 1500; i++) {
      const F = compileTarget3D(generateTarget3D(d, seedAt(i)).expression)!;
      seen.add(PS.map(([x, y]) => fmt(F(x, y))).join());
    }
    expect(seen.size).toBeGreaterThanOrEqual(500);
  });

  it('generates quickly, without long rejection loops', () => {
    const t0 = performance.now();
    for (const d of DIFFICULTIES) for (let i = 1; i <= 100; i++) generateTarget(d, seedAt(i));
    for (const d of DIFFICULTIES) for (let i = 1; i <= 100; i++) generateTarget3D(d, seedAt(i));
    // ~0.2–0.5 ms each on a laptop; generous bound for slow CI machines.
    expect((performance.now() - t0) / 1000).toBeLessThan(10);
  });
});

describe('clean formatting', () => {
  it('never produces awkward syntax in any mode or difficulty', () => {
    const awkward = /\+ -|- -|(^|[^\d.])0[xy(]|(^|[^\d.])1[xy]|[+-] 0(?![.\d])|\/1(?!\d)|\(\)|NaN|undefined|\d\.\d{5,}|\d\.\d+[xy] [xy]\//;
    for (const d of DIFFICULTIES) {
      for (let i = 1; i <= 600; i++) {
        for (const e of [generateTarget(d, seedAt(i)).expression, generateTarget3D(d, seedAt(i)).expression]) {
          expect(e, e).not.toMatch(awkward);
        }
      }
    }
  });
});

describe('visibility checks', () => {
  it('accepts curves that cross the 2D view, including steep lines', () => {
    for (const e of ['2x', '2x + 3', '3x - 1', '5x + 2', '-4x', 'x^2 - 5', '3(x - 2)^2 + 1', '1/(x - 2)']) {
      expect(isGoodTarget(e), e).toBe(true);
    }
  });

  it('rejects off-screen, corner-clipping and flat 2D candidates', () => {
    for (const e of ['x + 100', '-x^2 - 7', '0.02x + 3', '5', 'x^2 + 6.5', 'sqrt(x - 9.9)']) {
      expect(isGoodTarget(e), e).toBe(false);
    }
  });

  it('accepts steep 3D planes and rejects flat, off-box or one-variable surfaces', () => {
    for (const e of ['3x + 3y', '2x - 2y + 1', '(x^2 + y^2)/4 - 2']) expect(isGoodTarget3D(e), e).toBe(true);
    for (const e of ['x + y + 40', '0.01x + 0.01y', 'x^2', '3']) expect(isGoodTarget3D(e), e).toBe(false);
  });
});
