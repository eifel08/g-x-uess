import { useCallback, useEffect, useRef, useState } from 'react';
import type { RealFn } from '../math/types';
import { drawScene, type GraphTheme, type MarkedPoint } from './renderer';
import { sampleCurve, type Polyline } from './sampler';
import {
  DEFAULT_VIEWPORT,
  getBounds,
  pan,
  toWorldX,
  zoomAt,
  type Size,
  type Viewport,
} from './viewport';
import { ZoomControls } from './ZoomControls';
import './GraphCanvas.css';

export interface GraphCurve {
  id: string;
  color: string;
  fn: RealFn;
}

interface Props {
  curves: GraphCurve[];
  initialViewport?: Viewport;
}

interface Pin {
  curveId: string;
  x: number;
}

const HIT_RADIUS_MOUSE = 10;
const HIT_RADIUS_TOUCH = 22;
const TAP_SLOP = 5;

export function GraphCanvas({ curves, initialViewport = DEFAULT_VIEWPORT }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Rendering state lives in refs so pan/zoom never re-renders React.
  const viewRef = useRef<Viewport>(initialViewport);
  const sizeRef = useRef<Size>({ width: 0, height: 0 });
  const dprRef = useRef(1);
  const themeRef = useRef<GraphTheme | null>(null);
  const curvesRef = useRef(curves);
  const hoverRef = useRef<Pin | null>(null);
  const pinsRef = useRef<Pin[]>([]);
  const frameRef = useRef(0);
  const animRef = useRef<{ from: Viewport; to: Viewport; start: number } | null>(null);
  const sampleCache = useRef<{ view: Viewport; curves: GraphCurve[]; size: Size; lines: Map<string, Polyline[]> } | null>(
    null,
  );
  const [cursor, setCursor] = useState<'grab' | 'grabbing' | 'pointer'>('grab');

  /* ---------------------------- drawing ---------------------------- */

  const getSamples = useCallback(() => {
    const view = viewRef.current;
    const size = sizeRef.current;
    const list = curvesRef.current;
    const cached = sampleCache.current;
    if (cached && cached.view === view && cached.curves === list && cached.size === size) return cached.lines;
    const bounds = getBounds(view, size);
    const lines = new Map<string, Polyline[]>();
    for (const c of list) lines.set(c.id, sampleCurve(c.fn, bounds, size));
    sampleCache.current = { view, curves: list, size, lines };
    return lines;
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

    const samples = getSamples();
    const byId = new Map(curvesRef.current.map((c) => [c.id, c]));
    const points: MarkedPoint[] = [];
    const addPoint = (p: Pin, pinned: boolean) => {
      const curve = byId.get(p.curveId);
      if (!curve) return;
      const y = curve.fn(p.x);
      if (Number.isFinite(y)) points.push({ x: p.x, y, color: curve.color, pinned });
    };
    for (const p of pinsRef.current) addPoint(p, true);
    if (hoverRef.current) addPoint(hoverRef.current, false);

    drawScene(ctx, {
      viewport: viewRef.current,
      size,
      dpr: dprRef.current,
      theme,
      curves: curvesRef.current.map((c) => ({ color: c.color, lines: samples.get(c.id) ?? [] })),
      points,
    });
  }, [getSamples]);

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
    curvesRef.current = curves;
    requestDraw();
  }, [curves, requestDraw]);

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

  /** Nearest visible curve point to (px, py) within `radius` pixels. */
  const hitTest = useCallback(
    (px: number, py: number, radius: number): Pin | null => {
      const samples = getSamples();
      let best: { id: string; dist: number; x: number } | null = null;
      for (const [id, lines] of samples) {
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
            if (dist <= radius && (!best || dist < best.dist)) best = { id, dist, x: qx };
          }
        }
      }
      if (!best) return null;
      return { curveId: best.id, x: toWorldX(viewRef.current, sizeRef.current, best.x) };
    },
    [getSamples],
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

  const togglePin = (hit: Pin) => {
    const scale = viewRef.current.scale;
    const existing = pinsRef.current.findIndex((p) => p.curveId === hit.curveId && Math.abs(p.x - hit.x) * scale < 12);
    pinsRef.current =
      existing >= 0 ? pinsRef.current.filter((_, i) => i !== existing) : [...pinsRef.current, hit];
    requestDraw();
  };

  const onPointerLeave = () => {
    if (hoverRef.current) {
      hoverRef.current = null;
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
      />
    </div>
  );
}
