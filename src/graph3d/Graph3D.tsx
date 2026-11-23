import { useEffect, useRef, useState, type ReactNode } from 'react';
import { ZoomControls } from '../graph/ZoomControls';
import { Scene3D, type SurfaceSpec, type Theme3D } from './Scene3D';
import { formatDomain } from './zoom';
import '../graph/GraphCanvas.css';
import './Graph3D.css';

interface Props {
  surfaces: SurfaceSpec[];
  /** Extra buttons under the view controls (e.g. settings). */
  controls?: ReactNode;
}

const DEFAULT_DOMAIN = 5;
/** Each − / + press shows twice / half as much of the graph. */
const BUTTON_FACTOR = 2;

interface Hover {
  x: number;
  y: number;
  z: number;
  left: number;
  top: number;
  color: string;
  label?: string;
}

const fmt = (v: number) => {
  const r = Number(v.toPrecision(4));
  return (Object.is(r, -0) ? 0 : r).toString().replace('-', '−');
};

/**
 * 3D view of surfaces z = F(x, y). Drag to orbit, right-drag / two fingers
 * to pan, scroll / pinch to zoom; − / + change the size of the box.
 */
export default function Graph3D({ surfaces, controls }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<Scene3D | null>(null);
  const [failed, setFailed] = useState(false);
  const [domain, setDomain] = useState(DEFAULT_DOMAIN);
  const [hover, setHover] = useState<Hover | null>(null);
  const surfacesRef = useRef(surfaces);
  surfacesRef.current = surfaces;

  useEffect(() => {
    const container = containerRef.current!;
    const readTheme = (): Theme3D => {
      const css = getComputedStyle(container);
      const get = (name: string) => css.getPropertyValue(name).trim();
      return {
        background: get('--graph-bg') || '#ffffff',
        grid: get('--graph-grid-major') || '#dcdfe4',
        axis: get('--graph-axis') || '#4b5563',
        label: get('--graph-label') || '#374151',
        font: get('--font-sans') || 'sans-serif',
      };
    };
    const resolution = () => (container.clientWidth < 700 ? 64 : 100);

    let scene: Scene3D;
    try {
      scene = new Scene3D(container, readTheme(), resolution());
    } catch {
      setFailed(true);
      return;
    }
    sceneRef.current = scene;
    scene.onDomainChange = (d) => {
      setDomain(d);
      setHover(null); // the point under the cursor moved
    };
    scene.setSurfaces(surfacesRef.current);

    const observer = new ResizeObserver(() => {
      scene.resize(container.clientWidth, container.clientHeight);
      scene.setResolution(resolution());
    });
    observer.observe(container);
    scene.resize(container.clientWidth, container.clientHeight);

    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const onTheme = () => scene.setTheme(readTheme());
    media.addEventListener('change', onTheme);

    // Hover readout, throttled to one pick per frame; never while dragging.
    let pending = 0;
    let last: PointerEvent | null = null;
    const onMove = (e: PointerEvent) => {
      if (e.buttons !== 0 || e.pointerType === 'touch') {
        setHover(null);
        return;
      }
      last = e;
      if (pending) return;
      pending = requestAnimationFrame(() => {
        pending = 0;
        if (!last) return;
        const hit = scene.pick(last.clientX, last.clientY);
        const rect = container.getBoundingClientRect();
        const spec = hit && surfacesRef.current.find((s) => s.id === hit.id);
        setHover(
          hit && spec
            ? {
                ...hit,
                left: last.clientX - rect.left,
                top: last.clientY - rect.top,
                color: spec.color,
                label: spec.target ? 'f(x, y)' : undefined,
              }
            : null,
        );
      });
    };
    const onLeave = () => setHover(null);
    scene.canvas.addEventListener('pointermove', onMove);
    scene.canvas.addEventListener('pointerleave', onLeave);

    return () => {
      cancelAnimationFrame(pending);
      observer.disconnect();
      media.removeEventListener('change', onTheme);
      scene.canvas.removeEventListener('pointermove', onMove);
      scene.canvas.removeEventListener('pointerleave', onLeave);
      scene.dispose();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    sceneRef.current?.setSurfaces(surfaces);
    setHover(null);
  }, [surfaces]);


  return (
    <div className="graph graph3d" ref={containerRef}>
      {failed && (
        <div className="graph3d__fallback" role="status">
          3D graphing needs WebGL, which isn’t available in this browser.
        </div>
      )}
      {hover && (
        <div className="graph3d__tooltip" style={{ left: hover.left, top: hover.top, borderColor: hover.color }}>
          {hover.label && <span className="graph3d__tooltip-label">{hover.label}</span>}({fmt(hover.x)}, {fmt(hover.y)}, {fmt(hover.z)})
        </div>
      )}
      <ZoomControls
        onZoomIn={() => sceneRef.current?.zoomBy(1 / BUTTON_FACTOR)}
        onZoomOut={() => sceneRef.current?.zoomBy(BUTTON_FACTOR)}
        onReset={() => sceneRef.current?.setDomain(DEFAULT_DOMAIN)}
      >
        {controls}
      </ZoomControls>
      <div className="graph3d__hint" aria-hidden="true">
        Drag to rotate · right-drag or two fingers to pan · scroll, pinch or −/+ to zoom · showing {formatDomain(domain)}
      </div>
    </div>
  );
}
