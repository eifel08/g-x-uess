import { isStrict, satisfies, type Circle, type Comparison, type RealFn, type RealFn2 } from '../math/types';
import { circleGeometry } from './circle';
import { traceImplicit } from './implicit';
import { sampleCurve, type Polyline } from './sampler';
import type { Bounds, Size } from './viewport';

/** Something the graph can draw. Built from compiled rows by the app. */
export type GraphPlot =
  /**
   * y = fn(x), or the region y <op> fn(x). `emphasis: 'target'` marks the
   * game's hidden f(x): it gets a glow and a floating `label` badge, a style
   * reserved for the target so player curves never look like it.
   */
  | {
      type: 'function';
      id: string;
      color: string;
      fn: RealFn;
      inequality?: Comparison;
      emphasis?: 'target';
      label?: string;
    }
  /** x = x0, or the half-plane x <op> x0. */
  | { type: 'vline'; id: string; color: string; x: number; inequality?: Comparison }
  /** F(x, y) = 0, or the region F(x, y) <op> 0. `circle` enables exact geometry. */
  | { type: 'implicit'; id: string; color: string; F: RealFn2; circle?: Circle; inequality?: Comparison };

/** A plot turned into pixels for one frame. */
export interface PreparedPlot {
  plot: GraphPlot;
  /** Boundary / curve strokes. */
  lines: Polyline[];
  /** Shaded region polygons. */
  fills: Polyline[];
  fillRule: CanvasFillRule;
  /** Strict inequalities get a dashed boundary. */
  dashed: boolean;
}

const EDGE_PAD = 4;

export function preparePlot(plot: GraphPlot, bounds: Bounds, size: Size): PreparedPlot {
  const op = plot.inequality;
  const base = { plot, dashed: op ? isStrict(op) : false, fillRule: 'nonzero' as CanvasFillRule };
  const { width: W, height: H } = size;

  switch (plot.type) {
    case 'function': {
      const lines = sampleCurve(plot.fn, bounds, size);
      if (!op) return { ...base, lines, fills: [] };
      // y > f(x) shades above the curve (smaller pixel y), y < f(x) below.
      const edgeY = op === '>' || op === '>=' ? -EDGE_PAD : H + EDGE_PAD;
      const fills = lines.map((line) => [...line, line[line.length - 2], edgeY, line[0], edgeY]);
      return { ...base, lines, fills };
    }

    case 'vline': {
      const px = ((plot.x - bounds.xMin) / (bounds.xMax - bounds.xMin)) * W;
      const visible = px >= -EDGE_PAD && px <= W + EDGE_PAD;
      const lines = visible ? [[px, -EDGE_PAD, px, H + EDGE_PAD]] : [];
      if (!op) return { ...base, lines, fills: [] };
      const right = op === '>' || op === '>=';
      const x0 = right ? Math.max(px, -EDGE_PAD) : -EDGE_PAD;
      const x1 = right ? W + EDGE_PAD : Math.min(px, W + EDGE_PAD);
      const fills = x1 > x0 ? [[x0, -EDGE_PAD, x1, -EDGE_PAD, x1, H + EDGE_PAD, x0, H + EDGE_PAD]] : [];
      return { ...base, lines, fills };
    }

    case 'implicit': {
      if (plot.circle) {
        const geo = circleGeometry(plot.circle, bounds, size);
        const lines = geo.boundary ? [geo.boundary] : [];
        if (!op) return { ...base, lines, fills: [] };
        // F at the centre tells which side of the circle satisfies the inequality.
        const insideHolds = satisfies(plot.F(plot.circle.cx, plot.circle.cy), op);
        return {
          ...base,
          lines,
          fills: insideHolds ? geo.inside : geo.outside,
          fillRule: insideHolds ? 'nonzero' : 'evenodd',
        };
      }
      const trace = traceImplicit(plot.F, bounds, size, op ? { region: (v) => satisfies(v, op) } : {});
      return { ...base, lines: trace.lines, fills: trace.fill };
    }
  }
}
