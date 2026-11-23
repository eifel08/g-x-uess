/**
 * Pure text-editing operations used by the on-screen keypad.
 *
 * Templates describe what to insert:
 *   '#'  where the current selection goes; if nothing is selected, the cursor
 *        lands here (e.g. "sqrt(#)$" puts the cursor inside the parentheses)
 *   '$'  where the cursor lands when something *was* selected
 *        (e.g. "(#)/($)" wraps the selection as numerator, cursor in denominator)
 * Without either marker the cursor goes to the end of the inserted text.
 */
export type Edit =
  /**
   * `wrapPrevious`: with no selection, first select the operand just before
   * the cursor (a number, a name, or a call / parenthesised group), so the
   * fraction key turns "1|" into "(1)/(|)".
   */
  | { type: 'insert'; template: string; wrapPrevious?: boolean }
  /** Types ")" — or steps over an existing ")" right after the cursor. */
  | { type: 'close' }
  | { type: 'backspace' }
  | { type: 'left' }
  | { type: 'right' }
  | { type: 'clear' };

export interface EditState {
  text: string;
  /** Selection start/end; equal when it's just a cursor. */
  start: number;
  end: number;
}

export function applyEdit(state: EditState, edit: Edit): EditState {
  const { text } = state;
  const start = Math.min(state.start, state.end);
  const end = Math.max(state.start, state.end);
  const collapsed = (pos: number, t = text): EditState => ({ text: t, start: pos, end: pos });

  switch (edit.type) {
    case 'insert': {
      if (edit.wrapPrevious && start === end) {
        const from = previousOperandStart(text, start);
        if (from < start) return insertTemplate(text, from, start, edit.template);
      }
      return insertTemplate(text, start, end, edit.template);
    }
    case 'close':
      if (start === end && text[start] === ')') return collapsed(start + 1);
      return insertTemplate(text, start, end, ')');
    case 'left':
      return collapsed(start === end ? Math.max(0, start - 1) : start);
    case 'right':
      return collapsed(start === end ? Math.min(text.length, end + 1) : end);
    case 'clear':
      return collapsed(0, '');
    case 'backspace': {
      if (start !== end) return collapsed(start, text.slice(0, start) + text.slice(end));
      if (start === 0) return state;
      // Deleting into an empty call like "sqrt(|)" removes the whole call.
      if (text[start - 1] === '(' && text[start] === ')') {
        const name = /[A-Za-z_]{2,}$/.exec(text.slice(0, start - 1));
        const from = start - 1 - (name ? name[0].length : 0);
        return collapsed(from, text.slice(0, from) + text.slice(start + 1));
      }
      return collapsed(start - 1, text.slice(0, start - 1) + text.slice(start));
    }
  }
}

function insertTemplate(text: string, start: number, end: number, template: string): EditState {
  const selection = text.slice(start, end);
  const slot = template.indexOf('#');
  let body = template;
  let cursor: number;

  if (slot !== -1) {
    body = body.replace('#', selection);
    const after = body.indexOf('$');
    if (selection === '' || after === -1) {
      // Cursor at the slot (or after the wrapped selection when there's no '$').
      cursor = slot + (selection === '' ? 0 : selection.length);
      if (after !== -1 && after < cursor) cursor--;
    } else {
      cursor = after;
    }
  } else {
    const after = body.indexOf('$');
    cursor = after === -1 ? body.replace('$', '').length : after;
  }
  body = body.replace('$', '');
  const out = text.slice(0, start) + body + text.slice(end);
  const pos = start + cursor;
  return { text: out, start: pos, end: pos };
}

/**
 * Start index of the operand ending at `pos`: a run of digits / letters
 * ("12", "x", "pi"), optionally a balanced "(...)" group with the function
 * name before it ("sin(x)"). Returns `pos` if there is none.
 */
export function previousOperandStart(text: string, pos: number): number {
  let i = pos;
  if (text[i - 1] === ')') {
    let depth = 0;
    for (i = pos - 1; i >= 0; i--) {
      if (text[i] === ')') depth++;
      else if (text[i] === '(' && --depth === 0) break;
    }
    if (i < 0) return pos; // unbalanced
  }
  while (i > 0 && /[\w.πθ'′]/.test(text[i - 1])) i--;
  return i;
}
