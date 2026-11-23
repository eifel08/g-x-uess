import type { Polyline } from './sampler';
import { formatCoord, formatPrecise, formatTick, gridSpacing, tickIndices } from './ticks';
import { getBounds, toPxX, toPxY, type Size, type Viewport } from './viewport';

export interface GraphTheme {
  background: string;
  minorGrid: string;
  majorGrid: string;
  axis: string;
  label: string;
  /** Points of interest (intercepts, intersections). */
  poi: string;
  font: string;
}

export interface RenderedCurve {
  color: string;
  lines: Polyline[];
}

export interface MarkedPoint {
  x: number;
  y: number;
  color: string;
  /** Pinned points keep their label; hover points are drawn lighter. */
  pinned: boolean;
  /** Optional caption above the coordinates, e.g. "x-intercept". */
  caption?: string;
  /** Show coordinates at full precision (for exact points like roots). */
  precise?: boolean;
}

export interface Scene {
  viewport: Viewport;
  size: Size;
  dpr: number;
  theme: GraphTheme;
  curves: RenderedCurve[];
  /** Unselected points of interest, drawn as small gray dots. */
  pois: { x: number; y: number }[];
  /** Hovered / pinned points, drawn with a callout. */
  points: MarkedPoint[];
}

const CURVE_WIDTH = 2.5;
const LABEL_SIZE = 12;

export function drawScene(ctx: CanvasRenderingContext2D, scene: Scene) {
  const { size, dpr, theme } = scene;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = theme.background;
  ctx.fillRect(0, 0, size.width, size.height);

  drawGrid(ctx, scene);
  drawCurves(ctx, scene);
  drawPois(ctx, scene);
  drawPoints(ctx, scene);
}

/** Snap a coordinate so a line of `widthCss` falls on whole device pixels. */
function snap(v: number, dpr: number, widthCss: number) {
  const device = Math.round(widthCss * dpr);
  const offset = device % 2 === 1 ? 0.5 : 0;
  return (Math.round(v * dpr - offset) + offset) / dpr;
}

function drawGrid(ctx: CanvasRenderingContext2D, { viewport: v, size, dpr, theme }: Scene) {
  const { xMin, xMax, yMin, yMax } = getBounds(v, size);
  const { major, minor } = gridSpacing(v.scale);
  const { width, height } = size;

  const strokeLines = (step: number, color: string, lineWidth: number, skipEvery?: number) => {
    ctx.beginPath();
    const [x0, x1] = tickIndices(xMin, xMax, step);
    for (let i = x0; i <= x1; i++) {
      if (skipEvery && i % skipEvery === 0) continue;
      const px = snap(toPxX(v, size, i * step), dpr, lineWidth);
      ctx.moveTo(px, 0);
      ctx.lineTo(px, height);
    }
    const [y0, y1] = tickIndices(yMin, yMax, step);
    for (let i = y0; i <= y1; i++) {
      if (skipEvery && i % skipEvery === 0) continue;
      const py = snap(toPxY(v, size, i * step), dpr, lineWidth);
      ctx.moveTo(0, py);
      ctx.lineTo(width, py);
    }
    ctx.strokeStyle = color;
    ctx.lineWidth = lineWidth;
    ctx.stroke();
  };

  const minorPerMajor = Math.round(major / minor);
  strokeLines(minor, theme.minorGrid, 1, minorPerMajor);
  strokeLines(major, theme.majorGrid, 1);

  // Axes
  const axisX = toPxX(v, size, 0); // vertical axis position
  const axisY = toPxY(v, size, 0); // horizontal axis position
  ctx.beginPath();
  if (axisY >= 0 && axisY <= height) {
    const py = snap(axisY, dpr, 1.5);
    ctx.moveTo(0, py);
    ctx.lineTo(width, py);
  }
  if (axisX >= 0 && axisX <= width) {
    const px = snap(axisX, dpr, 1.5);
    ctx.moveTo(px, 0);
    ctx.lineTo(px, height);
  }
  ctx.strokeStyle = theme.axis;
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Labels. When an axis scrolls off-screen its labels stick to the edge.
  ctx.font = `${LABEL_SIZE}px ${theme.font}`;
  ctx.fillStyle = theme.label;
  ctx.strokeStyle = theme.background;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';

  const pad = 4;
  const xLabelY = clamp(axisY + pad, pad, height - LABEL_SIZE - pad);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  const [xi0, xi1] = tickIndices(xMin, xMax, major);
  for (let i = xi0; i <= xi1; i++) {
    if (i === 0) continue;
    const text = formatTick(i * major, major);
    const px = toPxX(v, size, i * major);
    const half = ctx.measureText(text).width / 2;
    if (px - half < 2 || px + half > width - 2) continue; // would be clipped
    // Nudge negative labels so the number (not the minus sign) is centred.
    const shift = text.startsWith('−') ? -ctx.measureText('−').width / 2 : 0;
    haloText(ctx, text, px + shift, xLabelY);
  }

  ctx.textBaseline = 'middle';
  const [yi0, yi1] = tickIndices(yMin, yMax, major);
  for (let i = yi0; i <= yi1; i++) {
    if (i === 0) continue;
    const text = formatTick(i * major, major);
    const py = toPxY(v, size, i * major);
    if (py < LABEL_SIZE / 2 + 2 || py > height - LABEL_SIZE / 2 - 2) continue; // would be clipped
    const w = ctx.measureText(text).width;
    if (axisX - pad - w < pad) {
      ctx.textAlign = 'left';
      haloText(ctx, text, axisX < pad ? pad : axisX + pad, py);
    } else if (axisX > width) {
      ctx.textAlign = 'right';
      haloText(ctx, text, width - pad, py);
    } else {
      ctx.textAlign = 'right';
      haloText(ctx, text, axisX - pad, py);
    }
  }

  if (axisX >= 0 && axisX <= width && axisY >= 0 && axisY <= height) {
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    haloText(ctx, '0', axisX - pad, axisY + pad);
  }
}

function haloText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number) {
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}

function drawCurves(ctx: CanvasRenderingContext2D, { curves }: Scene) {
  ctx.lineWidth = CURVE_WIDTH;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  for (const curve of curves) {
    ctx.strokeStyle = curve.color;
    ctx.beginPath();
    for (const line of curve.lines) {
      ctx.moveTo(line[0], line[1]);
      for (let i = 2; i < line.length; i += 2) ctx.lineTo(line[i], line[i + 1]);
    }
    ctx.stroke();
  }
}

function drawPois(ctx: CanvasRenderingContext2D, { pois, viewport: v, size, theme }: Scene) {
  ctx.fillStyle = theme.poi;
  ctx.strokeStyle = theme.background;
  ctx.lineWidth = 1.5;
  for (const p of pois) {
    ctx.beginPath();
    ctx.arc(toPxX(v, size, p.x), toPxY(v, size, p.y), 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

function drawPoints(ctx: CanvasRenderingContext2D, { points, viewport: v, size, theme }: Scene) {
  for (const p of points) {
    const px = toPxX(v, size, p.x);
    const py = toPxY(v, size, p.y);
    if (px < -20 || px > size.width + 20 || py < -20 || py > size.height + 20) continue;

    ctx.beginPath();
    ctx.arc(px, py, p.pinned ? 5 : 4.5, 0, Math.PI * 2);
    ctx.fillStyle = p.color;
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = theme.background;
    ctx.stroke();

    const fmt = (n: number) => (p.precise ? formatPrecise(n, v.scale) : formatCoord(n, v.scale));
    const text = `(${fmt(p.x)}, ${fmt(p.y)})`;
    ctx.font = `500 13px ${theme.font}`;
    let w = ctx.measureText(text).width + 14;
    if (p.caption) {
      ctx.font = `500 11px ${theme.font}`;
      w = Math.max(w, ctx.measureText(p.caption).width + 14);
    }
    const h = p.caption ? 38 : 24;
    let bx = px + 10;
    let by = py - h - 8;
    if (bx + w > size.width - 4) bx = px - w - 10;
    if (by < 4) by = py + 10;

    ctx.beginPath();
    ctx.roundRect(bx, by, w, h, 6);
    ctx.fillStyle = theme.background;
    ctx.globalAlpha = 0.94;
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.lineWidth = 1;
    ctx.strokeStyle = p.pinned ? p.color : theme.majorGrid;
    ctx.stroke();
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    if (p.caption) {
      ctx.font = `500 11px ${theme.font}`;
      ctx.fillStyle = theme.poi;
      ctx.fillText(p.caption, bx + 7, by + 11);
    }
    ctx.font = `500 13px ${theme.font}`;
    ctx.fillStyle = theme.label;
    ctx.fillText(text, bx + 7, by + h - 12 + 0.5);
  }
}

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
