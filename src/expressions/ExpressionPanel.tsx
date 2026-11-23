import { useEffect, useRef, useState, type Dispatch } from 'react';
import type { CompiledRows } from '../math/types';
import { ExpressionRow } from './ExpressionRow';
import { newId, type ExpressionAction, type ExpressionItem } from './model';
import './ExpressionPanel.css';

interface Props {
  items: ExpressionItem[];
  results: CompiledRows;
  dispatch: Dispatch<ExpressionAction>;
  onCollapse?: () => void;
}

export function ExpressionPanel({ items, results, dispatch, onCollapse }: Props) {
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const [focusRequest, setFocusRequest] = useState<string | null>(null);

  // Focus after React has rendered the target row.
  useEffect(() => {
    if (!focusRequest) return;
    const el = inputs.current.get(focusRequest);
    if (el) {
      el.focus();
      const end = el.value.length;
      el.setSelectionRange(end, end);
    }
    setFocusRequest(null);
  }, [focusRequest, items]);

  const focus = (id: string | undefined) => id && setFocusRequest(id);

  const addAfter = (afterId?: string) => {
    const id = newId();
    dispatch({ type: 'add', afterId, id });
    focus(id);
  };

  const remove = (index: number) => {
    const item = items[index];
    const neighbour = items[index - 1] ?? items[index + 1];
    dispatch({ type: 'remove', id: item.id });
    focus(neighbour?.id);
  };

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
        <div className="panel__tools">
          <button type="button" className="icon-btn" onClick={() => addAfter()} aria-label="Add expression" title="Add expression">
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

      <ol className="panel__list">
        {items.map((item, index) => (
          <ExpressionRow
            key={item.id}
            item={item}
            index={index}
            result={results[item.id]}
            inputRef={(el) => {
              if (el) inputs.current.set(item.id, el);
              else inputs.current.delete(item.id);
            }}
            onChange={(patch) => dispatch({ type: 'update', id: item.id, patch })}
            onRemove={() => remove(index)}
            onEnter={() => addAfter(item.id)}
            onBackspaceEmpty={() => items.length > 1 && remove(index)}
            onNavigate={(delta) => focus(items[index + delta]?.id)}
          />
        ))}
      </ol>

      <button type="button" className="panel__add-row" onClick={() => addAfter(items[items.length - 1]?.id)}>
        + Add expression
      </button>

      <footer className="panel__hint">
        Try <code>f(x) = x^3 - 2x</code>, <code>|x|</code>, <code>ln(x)</code>, <code>1/x</code>. Click a curve to pin a point.
      </footer>
    </aside>
  );
}
