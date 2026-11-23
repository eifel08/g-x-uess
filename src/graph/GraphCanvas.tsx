import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { projectOntoCircle } from './circle';
import { nearestOnCurves, nearestPoi } from './hitTest';
import { snapToImplicit } from './implicit';
import { preparePlot, type GraphPlot, type PreparedPlot } from './plots';
import { findPointsOfInterest, type PoiKind, type PointOfInterest } from './poi';
import { drawScene, type GraphTheme, type MarkedPoint } from './renderer';
import type { Polyline } from './sampler';
import {
  DEFAULT_VIEWPORT,
  getBounds,
  pan,
  toPxX,
  toPxY,
  toWorldX,
  toWorldY,
  zoomAt,
  type Size,
  type Viewport,
} from './viewport';
import { ZoomControls } from './ZoomControls';
import './GraphCanvas.css';

interface Props {
  /** Curves, vertical lines, implicit curves and inequality regions to draw. */
  plots: GraphPlot[];
  /** Detect and show intercepts / intersections. */
  showPointsOfInterest?: boolean;
  /**
   * The selected expression's curve. Like Desmos, points of interest are
   * shown for the selected (or hovered) curve; with nothing selected they're
   * only shown when there are few enough not to clutter the graph.
   */
  activeCurveId?: string | null;
  initialViewport?: Viewport;
  /** Extra buttons rendered under the zoom controls (e.g. settings). */
  controls?: ReactNode;
}

/**
 * A pinned or hovered point:
 *  - curve: on y = f(x); follows the function as it's edited
 *  - fixed: an exact point on a vertical line / implicit curve
 *  - poi:   a point of interest; re-attaches to the recomputed point
 */
type Pin =
  | { kind: 'curve'; curveId: string; x: number }
  | { kind: 'fixed'; plotId: string; x: number; y: number }
  | { kind: 'poi'; key: string; x: number; y: number };

interface FrameData {
  view: Viewport;
  plots: GraphPlot[];
  size: Size;
  showPoi: boolean;
  prepared: PreparedPlot[];
  /** Stroked polylines per plot id, for hit testing. */
  lines: Map<string, Polyline[]>;
  pois: PointOfInterest[];
}

const HIT_RADIUS_MOUSE = 10;
const HIT_RADIUS_TOUCH = 22;
const TAP_SLOP = 5;
/** With no curve selected or hovered, show all points of interest only up to this many. */
const MAX_UNFOCUSED_POIS = 24;

const POI_CAPTION: Record<PoiKind, string> = {
  'x-intercept': 'x-intercept',
  'y-intercept': 'y-intercept',
  intersection: 'Intersection',
};

export function GraphCanvas({
  plots,
  showPointsOfInterest = true,
  activeCurveId = null,
  initialViewport = DEFAULT_VIEWPORT,
  controls,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Rendering state lives in refs so pan/zoom never re-renders React.
  const viewRef = useRef<Viewport>(initialViewport);
  const sizeRef = useRef<Size>({ width: 0, height: 0 });
  const dprRef = useRef(1);
  const themeRef = useRef<GraphTheme | null>(null);
  const plotsRef = useRef(plots);
  const showPoiRef = useRef(showPointsOfInterest);
  const hoverRef = useRef<Pin | null>(null);
  const activeCurveRef = useRef(activeCurveId);
  /** Last curve the pointer was over; sticky so you can move onto its points. */
  const hoverCurveRef = useRef<string | null>(null);
  const pinsRef = useRef<Pin[]>([]);
  const frameRef = useRef(0);
  const animRef = useRef<{ from: Viewport; to: Viewport; start: number } | null>(null);
  const frameCache = useRef<FrameData | null>(null);
  const [cursor, setCursor] = useState<'grab' | 'grabbing' | 'pointer'>('grab');

  /* ---------------------------- drawing ---------------------------- */

  /** Geometry and points of interest for the current view (cached per view/plots). */
  const getFrame = useCallback((): FrameData => {
    const view = viewRef.current;
    const size = sizeRef.current;
    const list = plotsRef.current;
    const showPoi = showPoiRef.current;
    const cached = frameCache.current;
    if (cached && cached.view === view && cached.plots === list && cached.size === size && cached.showPoi === showPoi) {
      return cached;
    }
    const bounds = getBounds(view, size);
    const prepared = list.map((p) => preparePlot(p, bounds, size));
    const lines = new Map(prepared.map((p) => [p.plot.id, p.lines]));
    let pois: PointOfInterest[] = [];
    if (showPoi) {
      const functions = list.flatMap((p) => (p.type === 'function' ? [{ id: p.id, fn: p.fn }] : []));
      const verticals = list.flatMap((p) => (p.type === 'vline' ? [{ id: p.id, x: p.x }] : []));
      pois = findPointsOfInterest(functions, bounds, size, {}, verticals);
    }
    frameCache.current = { view, plots: list, size, showPoi, prepared, lines, pois };
    return frameCache.current;
  }, []);

  /** Points of interest currently shown (and hoverable). */
  const shownPois = useCallback((frame: FrameData): PointOfInterest[] => {
    const focus = [activeCurveRef.current, hoverCurveRef.current].find(
      (id) => id && frame.plots.some((p) => p.id === id),
    );
    if (focus) return frame.pois.filter((p) => p.curveIds.includes(focus));
    return frame.pois.length <= MAX_UNFOCUSED_POIS ? frame.pois : [];
  }, []);

  /** Resolves a pin to concrete coordinates in the current frame (or null). */
  const resolvePin = useCallback((pin: Pin, frame: FrameData): MarkedPoint | null => {
    if (pin.kind === 'curve') {
      const plot = frame.plots.find((p) => p.id === pin.curveId);
      if (plot?.type !== 'function') return null;
      const y = plot.fn(pin.x);
      return Number.isFinite(y) ? { x: pin.x, y, color: plot.color, pinned: false } : null;
    }
    if (pin.kind === 'fixed') {
      const plot = frame.plots.find((p) => p.id === pin.plotId);
      return plot ? { x: pin.x, y: pin.y, color: plot.color, pinned: false, precise: plot.type === 'vline' } : null;
    }
    // Re-attach to the recomputed point of interest nearest the pinned one,
    // so pins follow along when an expression is edited slightly.
    const scale = viewRef.current.scale;
    let best: PointOfInterest | null = null;
    let bestDist = 12;
    for (const p of frame.pois) {
      if (p.key !== pin.key) continue;
      const dist = Math.hypot(p.x - pin.x, p.y - pin.y) * scale;
      if (dist < bestDist) {
        best = p;
        bestDist = dist;
      }
    }
    const p = best;
    if (!p) return null;
    pin.x = p.x; // follow small changes
    pin.y = p.y;
    return { x: p.x, y: p.y, color: themeRef.current!.poi, pinned: false, caption: POI_CAPTION[p.kind], precise: true };
  }, []);

  const draw = useCallback(() => {
    frameRef.current = 0;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    const theme = themeRef.current;
    const size = sizeRef.current;
    if (!canvas || !ctx || !theme || size.width === 0) return;

    const anim = animRef.current;
    if (anim) {
      const t = Math.min(1, (performance.now() - anim.start) / 220);
      const e = 1 - (1 - t) ** 3;
      const logScale = Math.log(anim.from.scale) + (Math.log(anim.to.scale) - Math.log(anim.from.scale)) * e;
      viewRef.current = {
        cx: anim.from.cx + (anim.to.cx - anim.from.cx) * e,
        cy: anim.from.cy + (anim.to.cy - anim.from.cy) * e,
        scale: Math.exp(logScale),
      };
      if (t < 1) frameRef.current = requestAnimationFrame(draw);
      else animRef.current = null;
    }

    const frame = getFrame();
    const points: MarkedPoint[] = [];
    const highlighted = new Set<string>();
    for (const pin of pinsRef.current) {
      const p = resolvePin(pin, frame);
      if (p) {
        points.push({ ...p, pinned: true, color: pin.kind === 'poi' ? theme.label : p.color });
        if (pin.kind === 'poi') highlighted.add(`${p.x},${p.y}`);
      }
    }
    if (hoverRef.current) {
      const p = resolvePin(hoverRef.current, frame);
      if (p) {
        points.push(p);
        highlighted.add(`${p.x},${p.y}`);
      }
    }

    drawScene(ctx, {
      viewport: viewRef.current,
      size,
      dpr: dprRef.current,
      theme,
      curves: frame.prepared.map((p) => ({
        color: p.plot.color,
        lines: p.lines,
        fills: p.fills,
        fillRule: p.fillRule,
        dashed: p.dashed,
      })),
      pois: shownPois(frame).filter((p) => !highlighted.has(`${p.x},${p.y}`)),
      points,
    });
  }, [getFrame, resolvePin, shownPois]);

  const requestDraw = useCallback(() => {
    if (!frameRef.current) frameRef.current = requestAnimationFrame(draw);
  }, [draw]);

  const setView = useCallback(
    (v: Viewport) => {
      animRef.current = null;
      viewRef.current = v;
      requestDraw();
    },
    [requestDraw],
  );

  const animateTo = useCallback(
    (to: Viewport) => {
      animRef.current = { from: viewRef.current, to, start: performance.now() };
      requestDraw();
    },
    [requestDraw],
  );

  useEffect(() => {
    plotsRef.current = plots;
    showPoiRef.current = showPointsOfInterest;
    activeCurveRef.current = activeCurveId;
    requestDraw();
  }, [plots, showPointsOfInterest, activeCurveId, requestDraw]);

  /* ------------------------ size & theme --------------------------- */

  useEffect(() => {
    const container = containerRef.current!;
    const canvas = canvasRef.current!;

    const readTheme = () => {
      const css = getComputedStyle(container);
      const get = (name: string) => css.getPropertyValue(name).trim();
      themeRef.current = {
        background: get('--graph-bg'),
        minorGrid: get('--graph-grid-minor'),
        majorGrid: get('--graph-grid-major'),
        axis: get('--graph-axis'),
        label: get('--graph-label'),
        poi: get('--graph-poi'),
        font: get('--font-sans'),
      };
      requestDraw();
    };
    readTheme();
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    media.addEventListener('change', readTheme);

    const resize = () => {
      const rect = container.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      dprRef.current = dpr;
      sizeRef.current = { width: rect.width, height: rect.height };
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      draw(); // synchronous to avoid a blank frame after resizing
    };
    const observer = new ResizeObserver(resize);
    observer.observe(container);
    resize();

    return () => {
      observer.disconnect();
      media.removeEventListener('change', readTheme);
      cancelAnimationFrame(frameRef.current);
      frameRef.current = 0;
    };
  }, [draw, requestDraw]);

  /* --------------------------- hit testing -------------------------- */

  /** What's under (px, py): a point of interest takes priority over a curve. */
  const hitTest = useCallback(
    (px: number, py: number, radius: number): Pin | null => {
      const frame = getFrame();
      const v = viewRef.current;
      const size = sizeRef.current;
      const poi = nearestPoi(shownPois(frame), (x, y) => [toPxX(v, size, x), toPxY(v, size, y)], px, py, radius);
      if (poi) return { kind: 'poi', key: poi.key, x: poi.x, y: poi.y };
      const hit = nearestOnCurves(frame.lines, px, py, radius);
      if (!hit) return null;
      const plot = frame.plots.find((p) => p.id === hit.curveId)!;
      const hx = toWorldX(v, size, hit.px);
      const hy = toWorldY(v, size, hit.py);
      switch (plot.type) {
        case 'function':
          return { kind: 'curve', curveId: plot.id, x: hx };
        case 'vline':
          return { kind: 'fixed', plotId: plot.id, x: plot.x, y: hy };
        case 'implicit': {
          const [x, y] = plot.circle
            ? projectOntoCircle(plot.circle, hx, hy)
            : snapToImplicit(plot.F, hx, hy, (2 * radius) / v.scale);
          return { kind: 'fixed', plotId: plot.id, x, y };
        }
      }
    },
    [getFrame, shownPois],
  );

  /* ---------------------------- pointers ---------------------------- */

  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef({ startX: 0, startY: 0, moved: false });

  const localPoint = (e: { clientX: number; clientY: number }) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  };

  const onPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    const p = localPoint(e);
    pointers.current.set(e.pointerId, p);
    if (pointers.current.size === 1) gesture.current = { startX: p.x, startY: p.y, moved: false };
    else gesture.current.moved = true; // multi-touch is never a tap
    animRef.current = null;
    setCursor('grabbing');
  };

  const onPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const p = localPoint(e);
    const active = pointers.current;
    const prev = active.get(e.pointerId);

    if (!prev) {
      // Plain hover (mouse / pen without buttons).
      if (e.pointerType === 'touch') return;
      // Hovering near a curve also reveals its points of interest.
      const near = nearestOnCurves(getFrame().lines, p.x, p.y, HIT_RADIUS_MOUSE * 2);
      if (near) hoverCurveRef.current = near.curveId;
      const hit = hitTest(p.x, p.y, HIT_RADIUS_MOUSE);
      hoverRef.current = hit;
      setCursor(hit ? 'pointer' : 'grab');
      requestDraw();
      return;
    }

    const g = gesture.current;
    if (!g.moved && Math.hypot(p.x - g.startX, p.y - g.startY) > TAP_SLOP) g.moved = true;

    if (active.size === 1) {
      if (g.moved) {
        hoverRef.current = null;
        setView(pan(viewRef.current, p.x - prev.x, p.y - prev.y));
      }
    } else if (active.size === 2) {
      const other = [...active.entries()].find(([id]) => id !== e.pointerId)![1];
      const prevDist = Math.hypot(prev.x - other.x, prev.y - other.y);
      const nextDist = Math.hypot(p.x - other.x, p.y - other.y);
      const prevMid = { x: (prev.x + other.x) / 2, y: (prev.y + other.y) / 2 };
      const nextMid = { x: (p.x + other.x) / 2, y: (p.y + other.y) / 2 };
      let v = pan(viewRef.current, nextMid.x - prevMid.x, nextMid.y - prevMid.y);
      if (prevDist > 0) v = zoomAt(v, sizeRef.current, nextDist / prevDist, nextMid.x, nextMid.y);
      hoverRef.current = null;
      setView(v);
    }
    active.set(e.pointerId, p);
  };

  const togglePin = (hit: Pin) => {
    const scale = viewRef.current.scale;
    const near = (a: { x: number; y?: number }, b: { x: number; y?: number }) =>
      Math.hypot(a.x - b.x, (a.y ?? 0) - (b.y ?? 0)) * scale < 12;
    const same = (p: Pin) => {
      switch (hit.kind) {
        case 'curve':
          return p.kind === 'curve' && p.curveId === hit.curveId && Math.abs(p.x - hit.x) * scale < 12;
        case 'fixed':
          return p.kind === 'fixed' && p.plotId === hit.plotId && near(p, hit);
        case 'poi':
          return p.kind === 'poi' && p.key === hit.key && near(p, hit);
      }
    };
    const existing = pinsRef.current.findIndex(same);
    pinsRef.current = existing >= 0 ? pinsRef.current.filter((_, i) => i !== existing) : [...pinsRef.current, hit];
    requestDraw();
  };

  const endPointer = (e: React.PointerEvent<HTMLCanvasElement>, cancelled: boolean) => {
    const active = pointers.current;
    if (!active.has(e.pointerId)) return;
    const wasTap = !cancelled && active.size === 1 && !gesture.current.moved;
    active.delete(e.pointerId);
    if (active.size === 0) setCursor('grab');

    if (wasTap) {
      const p = localPoint(e);
      const hit = hitTest(p.x, p.y, e.pointerType === 'touch' ? HIT_RADIUS_TOUCH : HIT_RADIUS_MOUSE);
      if (hit) togglePin(hit);
    }
  };

  const onPointerLeave = () => {
    if (hoverRef.current || hoverCurveRef.current) {
      hoverRef.current = null;
      hoverCurveRef.current = null;
      requestDraw();
    }
  };

  /* ------------------------- wheel & keyboard ------------------------ */

  useEffect(() => {
    const canvas = canvasRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const unit = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? sizeRef.current.height : 1;
      const delta = e.deltaY * unit;
      // ctrlKey is set for trackpad pinch gestures, which send small deltas.
      const factor = Math.exp(-delta * (e.ctrlKey ? 0.01 : 0.002));
      const p = localPoint(e);
      setView(zoomAt(viewRef.current, sizeRef.current, factor, p.x, p.y));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, [setView]);

  const zoomBy = useCallback(
    (factor: number) => {
      const { width, height } = sizeRef.current;
      const target = animRef.current?.to ?? viewRef.current;
      animateTo(zoomAt(target, sizeRef.current, factor, width / 2, height / 2));
    },
    [animateTo],
  );

  const onKeyDown = (e: React.KeyboardEvent<HTMLCanvasElement>) => {
    const step = 60;
    const actions: Record<string, () => void> = {
      ArrowLeft: () => animateTo(pan(viewRef.current, step, 0)),
      ArrowRight: () => animateTo(pan(viewRef.current, -step, 0)),
      ArrowUp: () => animateTo(pan(viewRef.current, 0, step)),
      ArrowDown: () => animateTo(pan(viewRef.current, 0, -step)),
      '+': () => zoomBy(1.5),
      '=': () => zoomBy(1.5),
      '-': () => zoomBy(1 / 1.5),
      '0': () => animateTo(initialViewport),
      Escape: () => {
        pinsRef.current = [];
        requestDraw();
      },
    };
    const action = actions[e.key];
    if (action) {
      e.preventDefault();
      action();
    }
  };

  return (
    <div ref={containerRef} className="graph">
      <canvas
        ref={canvasRef}
        className="graph__canvas"
        style={{ cursor }}
        tabIndex={0}
        role="img"
        aria-label="Graph. Drag to pan, scroll or pinch to zoom, arrow keys to move, plus and minus to zoom."
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={(e) => endPointer(e, false)}
        onPointerCancel={(e) => endPointer(e, true)}
        onPointerLeave={onPointerLeave}
        onKeyDown={onKeyDown}
      />
      <ZoomControls
        onZoomIn={() => zoomBy(1.6)}
        onZoomOut={() => zoomBy(1 / 1.6)}
        onReset={() => animateTo(initialViewport)}
      >
        {controls}
      </ZoomControls>
    </div>
  );
}
