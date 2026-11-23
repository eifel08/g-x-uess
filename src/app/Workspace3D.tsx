import { lazy, Suspense, useMemo, type ReactNode } from 'react';
import { defaultExpressions3D, ExpressionPanel, useExpressionEditor, useExpressions, type ExpressionItem } from '../expressions';
import { TARGET_COLOR, TARGET_PLOT_ID, TargetRow, useGame3D } from '../game';
import type { SurfaceSpec } from '../graph3d';
import { compileExpressions, type RowResult } from '../math';
import { GraphSettings, type Settings } from '../settings';
import { useWorkspaceChrome } from './useWorkspaceChrome';
import { WorkspaceLayout } from './WorkspaceLayout';

// three.js is only downloaded once 3D mode is opened.
const Graph3D = lazy(() => import('../graph3d/Graph3D'));

interface Props {
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  modeSwitch: ReactNode;
}

/** Surfaces z = f(x, y) and the 3D "guess f(x, y)" game. Separate rows and round from 2D. */
export function Workspace3D({ settings, updateSettings, modeSwitch }: Props) {
  const [items, dispatch] = useExpressions('gxuess.expressions3d.v1', defaultExpressions3D);
  const editor = useExpressionEditor(items, dispatch);
  const chrome = useWorkspaceChrome(settings, updateSettings);
  const { angleMode } = settings;
  const game = useGame3D();
  const { targetFn } = game;

  // The hidden surface is callable as f(x, y) in every row.
  const textKey = items.map((i) => `${i.id}\u0000${i.text}`).join('\u0001');
  const results = useMemo(
    () => compileExpressions(items, { angleMode, dimension: 3, externals: { f: targetFn } }),
    [textKey, angleMode, targetFn],
  );

  const targetVisible = game.state.targetVisible;
  const surfaces = useMemo<SurfaceSpec[]>(() => {
    const user = items.flatMap((item) => {
      const r = results[item.id];
      return item.visible && r?.kind === 'surface' ? [{ id: item.id, color: item.color, F: r.F }] : [];
    });
    if (!targetVisible) return user;
    return [{ id: TARGET_PLOT_ID, color: TARGET_COLOR, F: targetFn, target: true, label: 'TARGET f(x, y)' }, ...user];
  }, [items, results, targetFn, targetVisible]);

  const submittable = (r: RowResult | undefined) => game.state.status === 'playing' && r?.kind === 'surface';
  const submitFor = (item: ExpressionItem, r: RowResult | undefined) =>
    submittable(r) && r?.kind === 'surface' && !r.usesExternal ? () => game.submit(item.id, item.text, r.F) : undefined;
  const submitBlockedFor = (_item: ExpressionItem, r: RowResult | undefined) =>
    submittable(r) && r?.kind === 'surface' && r.usesExternal ? 'A guess can’t use f itself. Write it with x and y only.' : undefined;
  const feedback = game.state.feedback;
  const feedbackFor = (item: ExpressionItem) =>
    feedback && feedback.rowId === item.id && feedback.text === item.text ? feedback.result : undefined;

  return (
    <WorkspaceLayout
      chrome={chrome}
      settings={settings}
      updateSettings={updateSettings}
      editor={editor}
      threeD
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
          placeholder="Type a guess, e.g. z = x + y"
          footer={
            <>
              Try <code>z = x^2 - y^2</code>, <code>sin(x) + cos(y)</code>, <code>h(x, y) = x y</code>. Hover a surface to
              read its coordinates. Alt+K opens the keypad.
            </>
          }
          top={<TargetRow game={game} label="f(x, y)" />}
          submitFor={submitFor}
          submitBlockedFor={submitBlockedFor}
          feedbackFor={feedbackFor}
        />
      }
      graph={
        <Suspense fallback={<div className="app__loading">Loading 3D…</div>}>
          <Graph3D surfaces={surfaces} controls={<GraphSettings settings={settings} onChange={updateSettings} />} />
        </Suspense>
      }
    />
  );
}
