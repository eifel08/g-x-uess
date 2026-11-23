import type { ReactNode } from 'react';
import type { ExpressionEditor } from '../expressions';
import { Keypad } from '../keypad';
import type { Settings } from '../settings';
import type { WorkspaceChrome } from './useWorkspaceChrome';

interface Props {
  chrome: WorkspaceChrome;
  settings: Settings;
  updateSettings: (patch: Partial<Settings>) => void;
  editor: ExpressionEditor;
  /** The expression sidebar (rendered only while open). */
  panel: ReactNode;
  /** The 2D or 3D graph. */
  graph: ReactNode;
  threeD?: boolean;
}

/** The shared frame: sidebar, graph area (with badges), and docked keypad. */
export function WorkspaceLayout({ chrome, settings, updateSettings, editor, panel, graph, threeD }: Props) {
  const { panelOpen, setPanelOpen, keypadOpen, toggleKeypad } = chrome;
  return (
    <div
      className={`app${panelOpen ? '' : ' is-collapsed'}${keypadOpen ? ' has-keypad' : ''}${settings.panelExpanded ? ' is-panel-expanded' : ''}`}
    >
      {panelOpen && panel}
      <main className="app__graph">
        {graph}
        {settings.angleMode === 'deg' && (
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
          <Keypad threeD={threeD} onEdit={editor.apply} onEnter={editor.enter} onClose={toggleKeypad} />
        </div>
      )}
    </div>
  );
}
