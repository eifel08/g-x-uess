import type { Circle } from '../math/types';
import type { Polyline } from './sampler';
import type { Bounds, Size } from './viewport';

/** Max distance (px) between the true circle and its polygon. */
const SAGITTA_PX = 0.15;
/** Above this pixel radius only the visible arc is generated. */
const FULL_CIRCLE_MAX_PX = 2e5;

export interface CircleGeometry {
  /** Where the view is relative to the circle. Only 'crosses' has a visible boundary. */
  view: 'crosses' | 'inside' | 'outside';
  /** Boundary polyline in px; for a full circle the first point is repeated at the end. */
  boundary: Polyline | null;
  /** Polygons (px) covering the visible part of the disc's interior. */
  inside: Polyline[];
  /** Polygons (px) covering the visible exterior; fill with the even-odd rule. */
  outside: Polyline[];
}

/**
 * Exact circle geometry for the current view. Points are computed from the
 * centre and radius (cx + r·cosθ), with an angular step chosen so the polygon
 * stays within ~0.15 px of the true circle. Huge circles (deep zoom on a
 * large radius) generate only the arc near the viewport, so cost and
 * precision don't depend on zoom.
 */
export function circleGeometry(c: Circle, bounds: Bounds, size: Size): CircleGeometry {
  const { xMin, xMax, yMin, yMax } = bounds;
  const { width: W, height: H } = size;
  const scale = W / (xMax - xMin);
  const vcx = (xMin + xMax) / 2;
  const vcy = (yMin + yMax) / 2;
  const rPx = c.r * scale;
  const pad = 4;
  const viewRect: Polyline = [-pad, -pad, W + pad, -pad, W + pad, H + pad, -pad, H + pad];

  // Distance from the centre to the nearest point / farthest corner of the view.
  const nearX = Math.min(Math.max(c.cx, xMin), xMax);
  const nearY = Math.min(Math.max(c.cy, yMin), yMax);
  const dMin = Math.hypot(c.cx - nearX, c.cy - nearY);
  const dMax = Math.max(
    Math.hypot(c.cx - xMin, c.cy - yMin),
    Math.hypot(c.cx - xMin, c.cy - yMax),
    Math.hypot(c.cx - xMax, c.cy - yMin),
    Math.hypot(c.cx - xMax, c.cy - yMax),
  );
  const margin = pad / scale;
  if (dMin > c.r + margin) return { view: 'outside', boundary: null, inside: [], outside: [viewRect] };
  if (dMax < c.r - margin) return { view: 'inside', boundary: null, inside: [viewRect], outside: [] };

  // Point at angle θ on a circle of radius ρ, in px. Offsets from the view
  // centre are computed first to keep precision when the circle is huge.
  const ox = c.cx - vcx;
  const oy = c.cy - vcy;
  const point = (rho: number, theta: number, out: number[]) =>
    out.push((ox + rho * Math.cos(theta)) * scale + W / 2, H / 2 - (oy + rho * Math.sin(theta)) * scale);

  const step = Math.min(0.1, 2 * Math.sqrt((2 * SAGITTA_PX) / Math.max(rPx, 1e-9)));

  if (rPx <= FULL_CIRCLE_MAX_PX) {
    const n = Math.ceil((2 * Math.PI) / step);
    const boundary: number[] = [];
    for (let i = 0; i <= n; i++) point(c.r, (2 * Math.PI * i) / n, boundary);
    return { view: 'crosses', boundary, inside: [boundary], outside: [viewRect, boundary] };
  }

  // Huge circle: only the arc within reach of the view. D bounds the view's
  // half-diagonal (with room to spare); points on the circle within D of the
  // view lie within ±2D/r radians of the direction to the view centre.
  const D = Math.hypot(xMax - xMin, yMax - yMin);
  const theta0 = Math.atan2(vcy - c.cy, vcx - c.cx);
  const span = Math.min(Math.PI, (2 * D) / c.r);
  const n = Math.max(2, Math.ceil((2 * span) / step));
  const arc: number[] = [];
  for (let i = 0; i <= n; i++) point(c.r, theta0 - span + (2 * span * i) / n, arc);

  // Close each side with a band 3D deep, which reaches well past the view.
  const band = (rho: number) => {
    const poly = arc.slice();
    point(rho, theta0 + span, poly);
    point(rho, theta0 - span, poly);
    return poly;
  };
  return { view: 'crosses', boundary: arc, inside: [band(c.r - 3 * D)], outside: [band(c.r + 3 * D)] };
}

/** Closest point on the circle to (x, y), in world coordinates. */
export function projectOntoCircle(c: Circle, x: number, y: number): [number, number] {
  const dx = x - c.cx;
  const dy = y - c.cy;
  const d = Math.hypot(dx, dy);
  if (d === 0) return [c.cx + c.r, c.cy];
  return [c.cx + (c.r * dx) / d, c.cy + (c.r * dy) / d];
}
