import { describe, expect, it } from 'vitest';
import { compileExpressions } from '../math/compile';
import type { RealFn2 } from '../math/types';
import { buildSurfaceMesh, cubeBox } from './mesh';

const box = cubeBox(5);
const N = 40;

function surface(text: string): RealFn2 {
  const r = compileExpressions([{ id: 'a', text }], { dimension: 3 }).a;
  if (r.kind !== 'surface') throw new Error(JSON.stringify(r));
  return r.F;
}

/** Max |Δz| over the triangle edges actually drawn. */
function maxEdgeJump(mesh: ReturnType<typeof buildSurfaceMesh>) {
  let max = 0;
  const z = (k: number) => mesh.positions[k * 3 + 2];
  for (let t = 0; t < mesh.indices.length; t += 3) {
    const [a, b, c] = [mesh.indices[t], mesh.indices[t + 1], mesh.indices[t + 2]];
    max = Math.max(max, Math.abs(z(a) - z(b)), Math.abs(z(b) - z(c)), Math.abs(z(a) - z(c)));
  }
  return max;
}

describe('buildSurfaceMesh', () => {
  it('triangulates a smooth surface completely, with vertices on the surface', () => {
    const F = surface('z = (x^2 + y^2)/4');
    const mesh = buildSurfaceMesh(F, box, N);
    expect(mesh.indices.length).toBe(N * N * 2 * 3);
    for (let k = 0; k < mesh.positions.length; k += 3 * 37) {
      const [x, y, z] = [mesh.positions[k], mesh.positions[k + 1], mesh.positions[k + 2]];
      expect(z).toBeCloseTo((x * x + y * y) / 4, 4);
    }
    expect(mesh.peak![2]).toBeLessThanOrEqual(5);
    expect(mesh.lines.length).toBeGreaterThan(0);
  });

  it('leaves holes where the surface is undefined', () => {
    const mesh = buildSurfaceMesh(surface('sqrt(x)'), box, N); // only x ≥ 0
    const triangles = mesh.indices.length / 3;
    expect(triangles).toBeGreaterThan(N * N * 0.8);
    expect(triangles).toBeLessThan(N * N * 1.2); // about half the grid
    for (let t = 0; t < mesh.indices.length; t++) expect(mesh.positions[mesh.indices[t] * 3]).toBeGreaterThanOrEqual(0);
  });

  it('drops triangles across poles instead of drawing spikes', () => {
    for (const text of ['1/x', 'tan(x)', '1/(x - y)', 'floor(x)']) {
      const mesh = buildSurfaceMesh(surface(text), box, N);
      expect(mesh.indices.length, text).toBeGreaterThan(0);
      expect(maxEdgeJump(mesh), text).toBeLessThan(5); // half the z range
    }
  });

  it('keeps steep but continuous surfaces', () => {
    const mesh = buildSurfaceMesh(surface('e^x'), box, N);
    expect(mesh.indices.length).toBe(N * N * 2 * 3);
  });

  it('extrudes one-variable functions along y', () => {
    const r = compileExpressions([{ id: 'a', text: 'g(x) = x^2' }], { dimension: 3 }).a;
    expect(r).toMatchObject({ kind: 'surface', name: 'g' });
    if (r.kind === 'surface') expect(r.F(2, 7)).toBe(4);
  });

  it('is fast enough to rebuild while animating', () => {
    const F = surface('sin(sqrt(x^2 + y^2)) * e^(-(x^2 + y^2)/20)');
    let evals = 0;
    buildSurfaceMesh((x, y) => (evals++, F(x, y)), box, 100);
    expect(evals).toBeLessThan(101 * 101 * 1.05); // ≈ one evaluation per vertex
  });
});
