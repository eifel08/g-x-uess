import type { RealFn2 } from '../math/types';

/** The visible box: x, y ∈ [−domain, domain] and z ∈ [zMin, zMax]. */
export interface Box3 {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  zMin: number;
  zMax: number;
}

export interface SurfaceMesh {
  /** xyz per vertex (grid order); invalid vertices are zeroed and unused. */
  positions: Float32Array;
  /** Triangle vertex indices. */
  indices: Uint32Array;
  /** Mesh lines along x and y, as segment endpoints (xyz xyz …). */
  lines: Float32Array;
  /** Highest in-box vertex, for placing labels (null if nothing is in the box). */
  peak: [number, number, number] | null;
}

/**
 * Samples z = F(x, y) on a (resolution + 1)² grid and triangulates it.
 *
 * - Undefined points (NaN, ±∞) leave holes instead of spikes.
 * - z is clamped to a band around the box so values stay sane; the renderer
 *   cuts the surface exactly at the box with clipping planes.
 * - Triangles across discontinuities (poles of 1/x, jumps of floor) are
 *   dropped: when an edge rises much more than the grid explains, F is
 *   evaluated at the edge midpoint, and if the midpoint is far from the
 *   straight-line value the edge spans a jump, not a steep slope.
 */
export function buildSurfaceMesh(F: RealFn2, box: Box3, resolution: number, lineEvery = 8): SurfaceMesh {
  const n = Math.max(2, Math.floor(resolution));
  const stride = n + 1;
  const count = stride * stride;
  const zRange = box.zMax - box.zMin;
  const clampLo = box.zMin - zRange;
  const clampHi = box.zMax + zRange;
  const dx = (box.xMax - box.xMin) / n;
  const dy = (box.yMax - box.yMin) / n;

  const raw = new Float64Array(count);
  const valid = new Uint8Array(count);
  const positions = new Float32Array(count * 3);
  for (let j = 0; j <= n; j++) {
    const y = box.yMin + j * dy;
    for (let i = 0; i <= n; i++) {
      const x = box.xMin + i * dx;
      const k = j * stride + i;
      const z = F(x, y);
      raw[k] = z;
      if (Number.isFinite(z)) {
        valid[k] = 1;
        positions[k * 3] = x;
        positions[k * 3 + 1] = y;
        positions[k * 3 + 2] = Math.min(clampHi, Math.max(clampLo, z));
      }
    }
  }

  // An edge is a discontinuity if it jumps a lot AND its midpoint disagrees
  // strongly with the straight line between its ends. Results are cached.
  const jumpLimit = zRange * 0.25;
  const edgeCache = new Map<number, boolean>();
  const broken = (a: number, b: number): boolean => {
    const za = raw[a];
    const zb = raw[b];
    const jump = Math.abs(za - zb);
    if (jump <= jumpLimit) return false;
    // Both ends far outside the box on the same side: invisible either way.
    if ((za > clampHi && zb > clampHi) || (za < clampLo && zb < clampLo)) return false;
    const key = a < b ? a * count + b : b * count + a;
    const cached = edgeCache.get(key);
    if (cached !== undefined) return cached;
    const mx = (positions[a * 3] + positions[b * 3]) / 2;
    const my = (positions[a * 3 + 1] + positions[b * 3 + 1]) / 2;
    const zm = F(mx, my);
    const result = !Number.isFinite(zm) || Math.abs(zm - (za + zb) / 2) > 0.25 * jump;
    edgeCache.set(key, result);
    return result;
  };

  const indices: number[] = [];
  const tri = (a: number, b: number, c: number) => {
    if (!valid[a] || !valid[b] || !valid[c]) return;
    if (broken(a, b) || broken(b, c) || broken(a, c)) return;
    indices.push(a, b, c);
  };
  for (let j = 0; j < n; j++) {
    for (let i = 0; i < n; i++) {
      const a = j * stride + i;
      const b = a + 1;
      const c = a + stride + 1;
      const d = a + stride;
      tri(a, b, c);
      tri(a, c, d);
    }
  }

  // Mesh lines every `lineEvery` grid lines, following the surface.
  const lines: number[] = [];
  const seg = (a: number, b: number) => {
    if (!valid[a] || !valid[b] || broken(a, b)) return;
    lines.push(positions[a * 3], positions[a * 3 + 1], positions[a * 3 + 2]);
    lines.push(positions[b * 3], positions[b * 3 + 1], positions[b * 3 + 2]);
  };
  for (let j = 0; j <= n; j += lineEvery) for (let i = 0; i < n; i++) seg(j * stride + i, j * stride + i + 1);
  for (let i = 0; i <= n; i += lineEvery) for (let j = 0; j < n; j++) seg(j * stride + i, (j + 1) * stride + i);

  let peak: [number, number, number] | null = null;
  for (let k = 0; k < count; k++) {
    const z = raw[k];
    if (valid[k] && z >= box.zMin && z <= box.zMax && (!peak || z > peak[2])) {
      peak = [positions[k * 3], positions[k * 3 + 1], z];
    }
  }

  return { positions, indices: Uint32Array.from(indices), lines: Float32Array.from(lines), peak };
}

/** A cube box of half-size `domain`, centred on the origin. */
export const cubeBox = (domain: number): Box3 => ({
  xMin: -domain,
  xMax: domain,
  yMin: -domain,
  yMax: domain,
  zMin: -domain,
  zMax: domain,
});
