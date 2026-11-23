import type { RealFn2 } from '../math/types';
import type { TargetFunction } from './generator';
import { VIEW3D } from './generator3d';

const fmt = (n: number) => String(Number(n.toPrecision(3)));

/**
 * Progressive hints for a hidden surface, from vague to specific, without
 * revealing the formula: family, f(0, 0), symmetry, highest point in view.
 */
export function hintsFor3D(target: TargetFunction, F: RealFn2): string[] {
  const hints = [`f is a ${target.family} surface.`];

  const z0 = F(0, 0);
  hints.push(Number.isFinite(z0) ? `f(0, 0) = ${fmt(z0)}.` : 'f(0, 0) is undefined.');

  const samples: [number, number][] = [];
  for (let i = 0; i < 60; i++) samples.push([0.31 + (i % 10) * 0.47, 0.17 + Math.floor(i / 10) * 0.71]);
  const same = (a: number, b: number) =>
    (!Number.isFinite(a) && !Number.isFinite(b)) || Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));
  const holds = (test: (x: number, y: number) => boolean) => samples.every(([x, y]) => test(x, y));
  if (holds((x, y) => same(F(x, y), F(Math.hypot(x, y), 0)))) {
    hints.push('f is radially symmetric: it only depends on the distance from the z-axis.');
  } else {
    const parts: string[] = [];
    if (holds((x, y) => same(F(x, y), F(y, x)))) parts.push('swapping x and y doesn’t change it');
    if (holds((x, y) => same(F(x, y), F(-x, y)))) parts.push('it is even in x');
    if (holds((x, y) => same(F(x, y), F(x, -y)))) parts.push('it is even in y');
    if (holds((x, y) => same(F(x, y), -F(-x, -y)))) parts.push('f(−x, −y) = −f(x, y)');
    hints.push(parts.length ? `Symmetry: ${parts.join('; ')}.` : 'f has no simple symmetry.');
  }

  let best: [number, number, number] | null = null;
  const n = 40;
  for (let j = 0; j <= n; j++) {
    for (let i = 0; i <= n; i++) {
      const x = -VIEW3D + (2 * VIEW3D * i) / n;
      const y = -VIEW3D + (2 * VIEW3D * j) / n;
      const z = F(x, y);
      if (Number.isFinite(z) && Math.abs(z) <= VIEW3D && (!best || z > best[2])) best = [x, y, z];
    }
  }
  if (best) hints.push(`The highest point in view is near (${fmt(best[0])}, ${fmt(best[1])}, ${fmt(best[2])}).`);
  return hints;
}
