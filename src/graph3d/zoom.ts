/** Smallest and largest half-size of the 3D box. */
export const MIN_DOMAIN = 1e-3;
export const MAX_DOMAIN = 1e4;

/** Applies a zoom factor (>1 shows more of the graph) and clamps the result. */
export function zoomDomain(domain: number, factor: number): number {
  if (!(factor > 0) || !Number.isFinite(factor)) return domain;
  return Math.min(MAX_DOMAIN, Math.max(MIN_DOMAIN, domain * factor));
}

/** Zoom factor for a wheel event: scrolling down (positive delta) zooms out. */
export function wheelFactor(deltaY: number, deltaMode: number, pageHeight: number, pinchGesture: boolean): number {
  const unit = deltaMode === 1 ? 16 : deltaMode === 2 ? pageHeight : 1;
  // Trackpad pinch arrives as ctrl+wheel with small deltas.
  return Math.exp(deltaY * unit * (pinchGesture ? 0.01 : 0.0015));
}

/** Formats a box half-size for display ("±5", "±0.25", "±1.2e+3"). */
export function formatDomain(domain: number): string {
  const r = Number(domain.toPrecision(2));
  return `±${r >= 1e4 || r < 1e-3 ? r.toExponential(1) : r}`;
}
