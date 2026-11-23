/**
 * The visible region of the plane. `scale` is CSS pixels per world unit and
 * is shared by both axes, so circles look like circles.
 */
export interface Viewport {
  cx: number;
  cy: number;
  scale: number;
}

export interface Size {
  width: number;
  height: number;
}

export interface Bounds {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
}

export const MIN_SCALE = 1e-3;
export const MAX_SCALE = 1e10;

export const DEFAULT_VIEWPORT: Viewport = { cx: 0, cy: 0, scale: 50 };

export function getBounds(v: Viewport, size: Size): Bounds {
  const hw = size.width / 2 / v.scale;
  const hh = size.height / 2 / v.scale;
  return { xMin: v.cx - hw, xMax: v.cx + hw, yMin: v.cy - hh, yMax: v.cy + hh };
}

export const toPxX = (v: Viewport, size: Size, x: number) => (x - v.cx) * v.scale + size.width / 2;
export const toPxY = (v: Viewport, size: Size, y: number) => size.height / 2 - (y - v.cy) * v.scale;
export const toWorldX = (v: Viewport, size: Size, px: number) => (px - size.width / 2) / v.scale + v.cx;
export const toWorldY = (v: Viewport, size: Size, py: number) => (size.height / 2 - py) / v.scale + v.cy;

/** Pan by a screen-space delta (positive dx drags the content right). */
export function pan(v: Viewport, dxPx: number, dyPx: number): Viewport {
  return { ...v, cx: v.cx - dxPx / v.scale, cy: v.cy + dyPx / v.scale };
}

/** Zoom by `factor` (>1 zooms in) keeping the world point under (px, py) fixed. */
export function zoomAt(v: Viewport, size: Size, factor: number, px: number, py: number): Viewport {
  const scale = clamp(v.scale * factor, MIN_SCALE, MAX_SCALE);
  const wx = toWorldX(v, size, px);
  const wy = toWorldY(v, size, py);
  return {
    scale,
    cx: wx - (px - size.width / 2) / scale,
    cy: wy - (size.height / 2 - py) / scale,
  };
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
