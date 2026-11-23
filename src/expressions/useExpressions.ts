import { useEffect, useReducer } from 'react';
import { defaultExpressions, expressionsReducer, type ExpressionItem } from './model';

const STORAGE_KEY = 'gxuess.expressions.v1';

function load({ storageKey, defaults }: { storageKey: string; defaults: () => ExpressionItem[] }): ExpressionItem[] {
  try {
    const raw = localStorage.getItem(storageKey);
    if (!raw) return defaults();
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed) || parsed.length === 0) return defaults();
    const valid = parsed.filter(
      (i): i is ExpressionItem =>
        i && typeof i.id === 'string' && typeof i.text === 'string' && typeof i.color === 'string' && typeof i.visible === 'boolean',
    );
    // Drop malformed slider settings rather than the whole row.
    for (const item of valid) {
      const s = item.slider;
      if (s && !(Number.isFinite(s.min) && Number.isFinite(s.max) && s.step > 0 && s.max > s.min)) delete item.slider;
    }
    return valid.length > 0 ? valid : defaults();
  } catch {
    return defaults();
  }
}

/** Expression list state, persisted to localStorage per browser. */
export function useExpressions(storageKey = STORAGE_KEY, defaults: () => ExpressionItem[] = defaultExpressions) {
  const [items, dispatch] = useReducer(expressionsReducer, { storageKey, defaults }, load);
  useEffect(() => {
    try {
      localStorage.setItem(storageKey, JSON.stringify(items));
    } catch {
      // Storage can be unavailable (private mode, quota); persistence is best-effort.
    }
  }, [items, storageKey]);
  return [items, dispatch] as const;
}
