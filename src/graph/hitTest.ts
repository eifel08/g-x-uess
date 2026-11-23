import type { PointOfInterest } from './poi';
import type { Polyline } from './sampler';

export interface CurveHit {
  curveId: string;
  /** Closest point on the curve's polyline, in pixels. */
  px: number;
  py: number;
  dist: number;
}

/** Nearest point on any polyline to (px, py) within `radius` pixels. */
export function nearestOnCurves(
  samples: ReadonlyMap<string, Polyline[]>,
  px: number,
  py: number,
  radius: number,
): CurveHit | null {
  let best: CurveHit | null = null;
  for (const [curveId, lines] of samples) {
    for (const line of lines) {
      for (let i = 2; i < line.length; i += 2) {
        const ax = line[i - 2];
        const bx = line[i];
        if (Math.max(ax, bx) < px - radius || Math.min(ax, bx) > px + radius) continue;
        const ay = line[i - 1];
        const by = line[i + 1];
        const dx = bx - ax;
        const dy = by - ay;
        const len2 = dx * dx + dy * dy;
        const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / len2));
        const qx = ax + t * dx;
        const qy = ay + t * dy;
        const dist = Math.hypot(px - qx, py - qy);
        if (dist <= radius && (!best || dist < best.dist)) best = { curveId, px: qx, py: qy, dist };
      }
    }
  }
  return best;
}

/** Nearest point of interest to (px, py) within `radius` pixels. */
export function nearestPoi(
  pois: readonly PointOfInterest[],
  toPx: (x: number, y: number) => [number, number],
  px: number,
  py: number,
  radius: number,
): PointOfInterest | null {
  let best: PointOfInterest | null = null;
  let bestDist = radius;
  for (const p of pois) {
    const [x, y] = toPx(p.x, p.y);
    const dist = Math.hypot(x - px, y - py);
    if (dist <= bestDist) {
      best = p;
      bestDist = dist;
    }
  }
  return best;
}
