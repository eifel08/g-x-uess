import { useEffect, useReducer } from 'react';
import { defaultExpressions, expressionsReducer, type ExpressionItem } from './model';

const STORAGE_KEY = 'gxuess.expressions.v1';

function load(): ExpressionItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultExpressions();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return defaultExpressions();
    const valid = parsed.filter(
      (i): i is ExpressionItem =>
        i && typeof i.id === 'string' && typeof i.text === 'string' && typeof i.color === 'string' && typeof i.visible === 'boolean',
    );
    return valid.length > 0 ? valid : defaultExpressions();
  } catch {
    return defaultExpressions();
  }
}

/** Expression list state, persisted to localStorage per browser. */
export function useExpressions() {
  const [items, dispatch] = useReducer(expressionsReducer, undefined, load);
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch {
      // Storage can be unavailable (private mode, quota); persistence is best-effort.
    }
  }, [items]);
  return [items, dispatch] as const;
}
