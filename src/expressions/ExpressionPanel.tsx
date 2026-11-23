import type { Dispatch, ReactNode } from 'react';
import type { CompiledRows, RowResult } from '../math/types';
import { ExpressionRow } from './ExpressionRow';
import type { ExpressionAction, ExpressionItem } from './model';
import type { ExpressionEditor } from './useExpressionEditor';
import './ExpressionPanel.css';

interface Props {
  items: ExpressionItem[];
  results: CompiledRows;
  dispatch: Dispatch<ExpressionAction>;
  editor: ExpressionEditor;
  keypadOpen: boolean;
  onToggleKeypad: () => void;
  /** Called with the focused row's id, or null when focus leaves the list. */
  onSelect?: (id: string | null) => void;
  onCollapse?: () => void;
  /** Phones: whether the list is expanded to most of the screen, and how to toggle it. */
  expanded?: boolean;
  onToggleExpanded?: () => void;
  /** Extra header content next to the logo (the 2D / 3D switch). */
  headerExtra?: ReactNode;
  /** Tip shown at the bottom of the panel. */
  footer?: ReactNode;
  /** Placeholder for the first, empty row. */
  placeholder?: string;
  /** Pinned content above the list (the game's `f(x) = ?` row). */
  top?: ReactNode;
  /** Returns a submit handler if this row can be submitted as a guess. */
  submitFor?: (item: ExpressionItem, result: RowResult | undefined) => (() => void) | undefined;
  /** Why a function row can't be submitted, if it can't (Submit shows disabled). */
  submitBlockedFor?: (item: ExpressionItem, result: RowResult | undefined) => string | undefined;
  /** Feedback to show on a row, if any. */
  feedbackFor?: (item: ExpressionItem) => { correct: boolean; message: string } | undefined;
}

export function ExpressionPanel({
  items,
  results,
  dispatch,
  editor,
  keypadOpen,
  onToggleKeypad,
  onSelect,
  onCollapse,
  expanded = false,
  onToggleExpanded,
  headerExtra,
  footer,
  placeholder,
  top,
  submitFor,
  submitBlockedFor,
  feedbackFor,
}: Props) {
  return (
    <aside className="panel" aria-label="Expressions">
      <header className="panel__header">
        <h1 className="brand">
          <span className="brand__g">g</span>
          <span className="brand__paren">(</span>
          <span className="brand__x">x</span>
          <span className="brand__paren">)</span>
          <span className="brand__rest">uess</span>
        </h1>
        {headerExtra}
        <div className="panel__tools">
          <button
            type="button"
            className={`icon-btn${keypadOpen ? ' is-active' : ''}`}
            onClick={onToggleKeypad}
            aria-label={keypadOpen ? 'Hide math keypad' : 'Show math keypad'}
            aria-pressed={keypadOpen}
            title="Math keypad (Alt+K)"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <rect x="2.5" y="5" width="15" height="10" rx="2" />
              <path d="M5.5 8h1M9.5 8h1M13.5 8h1M5.5 11.5h9" />
            </svg>
          </button>
          {onToggleExpanded && (
            <button
              type="button"
              className={`icon-btn panel__expand${expanded ? ' is-active' : ''}`}
              onClick={onToggleExpanded}
              aria-label={expanded ? 'Shrink expression list' : 'Expand expression list'}
              aria-pressed={expanded}
              title={expanded ? 'Show more graph' : 'Show more expressions'}
            >
              <svg viewBox="0 0 20 20" aria-hidden="true">
                {expanded ? <path d="M6 7.5l4 4 4-4M6 12.5l4 4 4-4" /> : <path d="M6 8.5l4-4 4 4M6 13.5l4-4 4 4" />}
              </svg>
            </button>
          )}
          <button type="button" className="icon-btn" onClick={() => editor.addAfter()} aria-label="Add expression" title="Add expression">
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M10 4v12M4 10h12" />
            </svg>
          </button>
          {onCollapse && (
            <button type="button" className="icon-btn" onClick={onCollapse} aria-label="Hide expression list" title="Hide list">
              <svg viewBox="0 0 20 20" aria-hidden="true">
                <path d="M12.5 5 7.5 10l5 5" />
              </svg>
            </button>
          )}
        </div>
      </header>

      {top}

      <ol className="panel__list">
        {items.map((item, index) => (
          <ExpressionRow
            key={item.id}
            item={item}
            index={index}
            result={results[item.id]}
            inputRef={editor.registerInput(item.id)}
            keypadOpen={keypadOpen}
            onFocus={() => {
              editor.setActive(item.id);
              onSelect?.(item.id);
            }}
            onBlur={() => onSelect?.(null)}
            onChange={(patch) => dispatch({ type: 'update', id: item.id, patch })}
            onRemove={() => editor.remove(item.id)}
            onEnter={() => editor.addAfter(item.id)}
            onBackspaceEmpty={() => items.length > 1 && editor.remove(item.id)}
            onNavigate={(delta) => editor.focus(items[index + delta]?.id)}
            placeholder={placeholder}
            onAddSlider={(name) => dispatch({ type: 'add', afterId: item.id, text: `${name} = 1` })}
            onSubmit={submitFor?.(item, results[item.id])}
            submitBlocked={submitBlockedFor?.(item, results[item.id])}
            feedback={feedbackFor?.(item)}
          />
        ))}
      </ol>

      <button type="button" className="panel__add-row" onClick={() => editor.addAfter(items[items.length - 1]?.id)}>
        + Add expression
      </button>

      <footer className="panel__hint">
        {footer ?? (
          <>
            Try <code>g(x) = x^3 - 2x</code>, <code>|x|</code>, <code>ln(x)</code>, <code>1/x</code>. Click a curve or a gray point to pin its coordinates. Alt+K opens the keypad.
          </>
        )}
      </footer>
    </aside>
  );
}
