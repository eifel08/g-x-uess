import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExpressionPanel, useExpressionEditor, useExpressions } from '../expressions';
import { GraphCanvas, type GraphCurve } from '../graph';
import { Keypad } from '../keypad';
import { compileExpressions } from '../math';
import { GraphSettings, useSettings } from '../settings';
import './App.css';

export function App() {
  const [items, dispatch] = useExpressions();
  const [settings, updateSettings] = useSettings();
  const editor = useExpressionEditor(items, dispatch);
  const [panelOpen, setPanelOpen] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const keypadOpen = settings.keypadOpen && panelOpen;
  const { angleMode } = settings;

  // Recompile only when text or angle mode changes — not on colour/visibility toggles.
  const textKey = items.map((i) => `${i.id}\u0000${i.text}`).join('\u0001');
  const results = useMemo(
    () => compileExpressions(items, { angleMode }),
    [textKey, angleMode],
  );

  const curves = useMemo<GraphCurve[]>(
    () =>
      items.flatMap((item) => {
        const r = results[item.id];
        return item.visible && r?.kind === 'curve' ? [{ id: item.id, color: item.color, fn: r.fn }] : [];
      }),
    [items, results],
  );

  const toggleKeypad = useCallback(() => {
    const open = !keypadOpen;
    updateSettings({ keypadOpen: open });
    if (open) setPanelOpen(true);
  }, [keypadOpen, updateSettings]);

  // Alt+K toggles the keypad from anywhere.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.altKey && !e.ctrlKey && !e.metaKey && e.code === 'KeyK') {
        e.preventDefault();
        toggleKeypad();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [toggleKeypad]);

  return (
    <div className={`app${panelOpen ? '' : ' is-collapsed'}${keypadOpen ? ' has-keypad' : ''}`}>
      {panelOpen && (
        <ExpressionPanel
          items={items}
          results={results}
          dispatch={dispatch}
          editor={editor}
          keypadOpen={keypadOpen}
          onToggleKeypad={toggleKeypad}
          onSelect={setSelectedId}
          onCollapse={() => setPanelOpen(false)}
        />
      )}
      <main className="app__graph">
        <GraphCanvas
          curves={curves}
          showPointsOfInterest={settings.showPointsOfInterest}
          activeCurveId={selectedId}
          controls={<GraphSettings settings={settings} onChange={updateSettings} />}
        />
        {angleMode === 'deg' && (
          <button
            type="button"
            className="app__badge"
            onClick={() => updateSettings({ angleMode: 'rad' })}
            title="Trig functions use degrees. Click to switch to radians."
          >
            Degrees
          </button>
        )}
        {!panelOpen && (
          <button type="button" className="app__expand" onClick={() => setPanelOpen(true)} aria-label="Show expression list">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M7.5 5l5 5-5 5" />
            </svg>
            <span>Expressions</span>
          </button>
        )}
      </main>
      {keypadOpen && (
        <div className="app__keypad">
          <Keypad onEdit={editor.apply} onEnter={editor.enter} onClose={toggleKeypad} />
        </div>
      )}
    </div>
  );
}
