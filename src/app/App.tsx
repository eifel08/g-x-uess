import { useCallback, useEffect, useMemo, useState } from 'react';
import { ExpressionPanel, useExpressionEditor, useExpressions, type ExpressionItem } from '../expressions';
import { TARGET_COLOR, TARGET_PLOT_ID, TargetRow, useGame } from '../game';
import { GraphCanvas, type GraphPlot } from '../graph';
import { Keypad } from '../keypad';
import { compileExpressions, type RowResult } from '../math';
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

  const game = useGame();
  const { targetFn } = game;
  const targetVisible = game.state.targetVisible;

  const plots = useMemo<GraphPlot[]>(() => {
    const userPlots = items.flatMap((item) => (item.visible ? toPlot(item.id, item.color, results[item.id]) : []));
    if (!targetVisible) return userPlots;
    // The target is drawn first so player curves sit on top of its glow.
    const target: GraphPlot = {
      type: 'function',
      id: TARGET_PLOT_ID,
      color: TARGET_COLOR,
      fn: targetFn,
      emphasis: 'target',
      label: 'f(x)',
    };
    return [target, ...userPlots];
  }, [items, results, targetFn, targetVisible]);

  // Any plain function-of-x row can be submitted as a guess while a round is on.
  const submitFor = (item: ExpressionItem, r: RowResult | undefined) =>
    game.state.status === 'playing' && r?.kind === 'curve' && !r.inequality
      ? () => game.submit(item.id, item.text, r.fn)
      : undefined;
  const feedback = game.state.feedback;
  const feedbackFor = (item: ExpressionItem) =>
    feedback && feedback.rowId === item.id && feedback.text === item.text ? feedback.result : undefined;

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
          top={<TargetRow game={game} />}
          submitFor={submitFor}
          feedbackFor={feedbackFor}
        />
      )}
      <main className="app__graph">
        <GraphCanvas
          plots={plots}
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

/** Turns a compiled row into something the graph can draw (or nothing). */
function toPlot(id: string, color: string, r: RowResult | undefined): GraphPlot[] {
  switch (r?.kind) {
    case 'curve':
      return [{ type: 'function', id, color, fn: r.fn, inequality: r.inequality }];
    case 'vline':
      return [{ type: 'vline', id, color, x: r.x, inequality: r.inequality }];
    case 'implicit':
      return [{ type: 'implicit', id, color, F: r.F, circle: r.circle, inequality: r.inequality }];
    default:
      return [];
  }
}
