/** One row in the expression list, as the UI sees it. */
import type { SliderBounds } from './slider';

export interface ExpressionItem {
  id: string;
  text: string;
  color: string;
  visible: boolean;
  /** Range of this row's slider, once the player has changed it (`a = 3` rows). */
  slider?: SliderBounds;
}

export const PALETTE = [
  '#e5484d', // red
  '#3e63dd', // blue
  '#30a46c', // green
  '#8e4ec6', // purple
  '#f76b15', // orange
  '#0d9488', // teal
  '#d6409f', // pink
  '#5b6472', // slate
] as const;

export type ExpressionAction =
  | { type: 'add'; afterId?: string; id?: string; text?: string }
  | { type: 'update'; id: string; patch: Partial<Omit<ExpressionItem, 'id'>> }
  | { type: 'remove'; id: string }
  | { type: 'replaceAll'; items: ExpressionItem[] };

let counter = 0;
export function newId(): string {
  counter += 1;
  return `e${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}

/** Picks the palette colour used least so far (ties → palette order). */
export function nextColor(items: readonly ExpressionItem[]): string {
  const counts = new Map<string, number>(PALETTE.map((c) => [c, 0]));
  for (const item of items) if (counts.has(item.color)) counts.set(item.color, counts.get(item.color)! + 1);
  let best: string = PALETTE[0];
  for (const color of PALETTE) if (counts.get(color)! < counts.get(best)!) best = color;
  return best;
}

export function createItem(items: readonly ExpressionItem[], text = '', id = newId()): ExpressionItem {
  return { id, text, color: nextColor(items), visible: true };
}

export function expressionsReducer(state: ExpressionItem[], action: ExpressionAction): ExpressionItem[] {
  switch (action.type) {
    case 'add': {
      const item = createItem(state, action.text, action.id);
      const index = action.afterId ? state.findIndex((i) => i.id === action.afterId) : -1;
      if (index === -1) return [...state, item];
      return [...state.slice(0, index + 1), item, ...state.slice(index + 1)];
    }
    case 'update':
      return state.map((i) => (i.id === action.id ? { ...i, ...action.patch } : i));
    case 'remove': {
      const next = state.filter((i) => i.id !== action.id);
      // Always keep one (possibly empty) row to type into.
      return next.length > 0 ? next : [createItem([])];
    }
    case 'replaceAll':
      return action.items;
  }
}

export function defaultExpressions(): ExpressionItem[] {
  const items: ExpressionItem[] = [];
  // f is the hidden target in game mode, so the starter example uses g.
  for (const text of ['g(x) = x^2', '']) items.push(createItem(items, text));
  return items;
}
