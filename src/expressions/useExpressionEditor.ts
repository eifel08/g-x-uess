import { useEffect, useMemo, useRef, useState, type Dispatch } from 'react';
import { applyEdit, type Edit } from './editing';
import { newId, type ExpressionAction, type ExpressionItem } from './model';

/**
 * Shared editing controller for the expression list. Both the rows (physical
 * keyboard) and the on-screen keypad go through it, so cursor handling and
 * focus behave the same either way.
 */
export interface ExpressionEditor {
  /** Ref callback for a row's <input>. */
  registerInput(id: string): (el: HTMLInputElement | null) => void;
  /** Marks a row as the target for keypad input (called on focus). */
  setActive(id: string): void;
  /** Focuses a row after the next render, with the cursor at `pos` (default: end). */
  focus(id: string | undefined, pos?: number): void;
  addAfter(afterId?: string): void;
  remove(id: string): void;
  /** Applies a keypad edit to the active row. */
  apply(edit: Edit): void;
  /** Keypad ↵: new row after the active one. */
  enter(): void;
}

export function useExpressionEditor(items: ExpressionItem[], dispatch: Dispatch<ExpressionAction>): ExpressionEditor {
  const inputs = useRef(new Map<string, HTMLInputElement>());
  const activeId = useRef<string | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const [focusRequest, setFocusRequest] = useState<{ id: string; pos?: number } | null>(null);

  // Runs after React has rendered the new text, so the selection sticks.
  useEffect(() => {
    if (!focusRequest) return;
    const el = inputs.current.get(focusRequest.id);
    if (el) {
      el.focus({ preventScroll: false });
      const pos = focusRequest.pos ?? el.value.length;
      el.setSelectionRange(pos, pos);
      el.scrollIntoView({ block: 'nearest' });
    }
    setFocusRequest(null);
  }, [focusRequest, items]);

  return useMemo<ExpressionEditor>(() => {
    const focus = (id: string | undefined, pos?: number) => {
      if (id) setFocusRequest({ id, pos });
    };
    const addAfter = (afterId?: string) => {
      const id = newId();
      dispatch({ type: 'add', afterId, id });
      activeId.current = id;
      focus(id);
    };
    const target = () => {
      const list = itemsRef.current;
      const current = list.find((i) => i.id === activeId.current);
      return current ?? list[list.length - 1];
    };
    return {
      registerInput: (id) => (el) => {
        if (el) inputs.current.set(id, el);
        else inputs.current.delete(id);
      },
      setActive: (id) => {
        activeId.current = id;
      },
      focus,
      addAfter,
      remove: (id) => {
        const list = itemsRef.current;
        const index = list.findIndex((i) => i.id === id);
        const neighbour = list[index - 1] ?? list[index + 1];
        dispatch({ type: 'remove', id });
        if (activeId.current === id) activeId.current = neighbour?.id ?? null;
        focus(neighbour?.id);
      },
      apply: (edit) => {
        const item = target();
        if (!item) return;
        const el = inputs.current.get(item.id);
        const len = item.text.length;
        const state = {
          text: item.text,
          start: Math.min(el?.selectionStart ?? len, len),
          end: Math.min(el?.selectionEnd ?? len, len),
        };
        const next = applyEdit(state, edit);
        if (next.text !== item.text) dispatch({ type: 'update', id: item.id, patch: { text: next.text } });
        activeId.current = item.id;
        focus(item.id, next.start);
      },
      enter: () => addAfter(target()?.id),
    };
  }, [dispatch]);
}
