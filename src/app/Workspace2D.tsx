import { useMemo, type ReactNode } from 'react';
import { ExpressionPanel, useExpressionEditor, useExpressions, type ExpressionItem } from '../expressions';
import { TARGET_COLOR, TARGET_PLOT_ID, TargetRow, useGame } from '../game';
import { GraphCanvas, type GraphPlot } from '../graph';
import { compileExpressions, type RowResult } from '../math';
import { GraphSettings, type Settings } from '../settings';
import { useWorkspaceChrome } from './useWorkspaceChrome';
import { WorkspaceLayout } from './WorkspaceLayout';

interface Props {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  modeSwitch: ReactNode;
}

/** The 2D calculator and the 2D "guess f(x)" game. */
export function Workspace2D({ settings, updateSettings, modeSwitch }: Props) {
  const [items, dispatch] = useExpressions();
  const editor = useExpressionEditor(items, dispatch);
  const chrome = useWorkspaceChrome(settings, updateSettings);
  const { angleMode } = settings;
  const game = useGame();
  const { targetFn } = game;

  // Recompile only when text, angle mode or the target change, not on colour/visibility toggles.
  // The hidden target is callable as f in every row: sin(f(x)), f'(x), g(x) = f(x) - x, …
  const textKey = items.map((i) => `${i.id}\u0000${i.text}`).join('\u0001');
  const results = useMemo(
    () => compileExpressions(items, { angleMode, externals: { f: targetFn } }),
    [textKey, angleMode, targetFn],
  );

  const targetVisible = game.state.targetVisible;
  const plots = useMemo<GraphPlot[]>(() => {
    const userPlots = items.flatMap((item) => (item.visible ? toPlot(item.id, item.color, results[item.id]) : []));
    if (!targetVisible) return userPlots;
    // The target is drawn first so player curves sit on top of its glow.
    const target: GraphPlot = { type: 'function', id: TARGET_PLOT_ID, color: TARGET_COLOR, fn: targetFn, emphasis: 'target', label: 'f(x)' };
    return [target, ...userPlots];
  }, [items, results, targetFn, targetVisible]);

  // Any plain function-of-x row can be submitted as a guess while a round is on.
  // Rows built from f itself (y = f(x), g(x) = f(x) + 0, …) would win trivially.
  const submittable = (r: RowResult | undefined) => game.state.status === 'playing' && r?.kind === 'curve' && !r.inequality;
  const submitFor = (item: ExpressionItem, r: RowResult | undefined) =>
    submittable(r) && r?.kind === 'curve' && !r.usesExternal ? () => game.submit(item.id, item.text, r.fn) : undefined;
  const submitBlockedFor = (_item: ExpressionItem, r: RowResult | undefined) =>
    submittable(r) && r?.kind === 'curve' && r.usesExternal ? 'A guess can’t use f itself. Write it with x only.' : undefined;
  const feedback = game.state.feedback;
  const feedbackFor = (item: ExpressionItem) =>
    feedback && feedback.rowId === item.id && feedback.text === item.text ? feedback.result : undefined;

  return (
    <WorkspaceLayout
      chrome={chrome}
      settings={settings}
      updateSettings={updateSettings}
      editor={editor}
      panel={
        <ExpressionPanel
          items={items}
          results={results}
          dispatch={dispatch}
          editor={editor}
          keypadOpen={chrome.keypadOpen}
          onToggleKeypad={chrome.toggleKeypad}
          onSelect={chrome.setSelectedId}
          onCollapse={() => chrome.setPanelOpen(false)}
          expanded={settings.panelExpanded}
          onToggleExpanded={() => updateSettings({ panelExpanded: !settings.panelExpanded })}
          headerExtra={modeSwitch}
          top={<TargetRow game={game} />}
          submitFor={submitFor}
          submitBlockedFor={submitBlockedFor}
          feedbackFor={feedbackFor}
        />
      }
      graph={
        <GraphCanvas
          plots={plots}
          showPointsOfInterest={settings.showPointsOfInterest}
          activeCurveId={chrome.selectedId}
          controls={<GraphSettings settings={settings} onChange={updateSettings} />}
        />
      }
    />
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
