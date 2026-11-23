import { useMemo, useState } from 'react';
import { ExpressionPanel, useExpressions } from '../expressions';
import { GraphCanvas, type GraphCurve } from '../graph';
import { compileExpressions } from '../math';
import './App.css';

export function App() {
  const [items, dispatch] = useExpressions();
  const [panelOpen, setPanelOpen] = useState(true);

  // Recompile only when text changes — not on colour/visibility toggles.
  const textKey = items.map((i) => `${i.id}\u0000${i.text}`).join('\u0001');
  const results = useMemo(() => compileExpressions(items), [textKey]);

  const curves = useMemo<GraphCurve[]>(
    () =>
      items.flatMap((item) => {
        const r = results[item.id];
        return item.visible && r?.kind === 'curve' ? [{ id: item.id, color: item.color, fn: r.fn }] : [];
      }),
    [items, results],
  );

  return (
    <div className={`app${panelOpen ? '' : ' is-collapsed'}`}>
      {panelOpen && (
        <ExpressionPanel items={items} results={results} dispatch={dispatch} onCollapse={() => setPanelOpen(false)} />
      )}
      <main className="app__graph">
        <GraphCanvas curves={curves} />
        {!panelOpen && (
          <button type="button" className="app__expand" onClick={() => setPanelOpen(true)} aria-label="Show expression list">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M7.5 5l5 5-5 5" />
            </svg>
            <span>Expressions</span>
          </button>
        )}
      </main>
    </div>
  );
}
