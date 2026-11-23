import { describe, expect, it } from 'vitest';
import { applyEdit, type Edit, type EditState } from './editing';

/** Writes state as text with "|" for the cursor or "[…]" for a selection. */
function show({ text, start, end }: EditState) {
  return start === end ? text.slice(0, start) + '|' + text.slice(start) : `${text.slice(0, start)}[${text.slice(start, end)}]${text.slice(end)}`;
}
function parse(s: string): EditState {
  const sel = /\[(.*)\]/.exec(s);
  if (sel) {
    const start = sel.index;
    return { text: s.replace(/[[\]]/g, ''), start, end: start + sel[1].length };
  }
  const pos = s.indexOf('|');
  return { text: s.replace('|', ''), start: pos, end: pos };
}
const run = (s: string, ...edits: Edit[]) => show(edits.reduce(applyEdit, parse(s)));
const ins = (template: string): Edit => ({ type: 'insert', template });

describe('applyEdit', () => {
  it('inserts plain text at the cursor', () => {
    expect(run('x|', ins('+'), ins('1'))).toBe('x+1|');
    expect(run('a|b', ins('π'))).toBe('aπ|b');
  });

  it('places the cursor inside function templates', () => {
    expect(run('|', ins('sqrt(#)$'))).toBe('sqrt(|)');
    expect(run('2|', ins('int(t, #, , )'))).toBe('2int(t, |, , )');
  });

  it('wraps the selection', () => {
    expect(run('[x+1]', ins('sqrt(#)$'))).toBe('sqrt(x+1)|');
    expect(run('[x+1]', ins('(#)/($)'))).toBe('(x+1)/(|)');
    expect(run('|', ins('(#)/($)'))).toBe('(|)/()');
  });

  it('takes the previous operand as numerator for fractions', () => {
    const frac: Edit = { type: 'insert', template: '(#)/($)', wrapPrevious: true };
    expect(run('1|', frac)).toBe('(1)/(|)');
    expect(run('2+x|', frac)).toBe('2+(x)/(|)');
    expect(run('sin(x+1)|', frac)).toBe('(sin(x+1))/(|)');
    expect(run('3+|', frac)).toBe('3+(|)/()');
  });

  it('replaces the selection with plain text', () => {
    expect(run('1+[2]+3', ins('5'))).toBe('1+5|+3');
  });

  it('steps over a closing parenthesis', () => {
    expect(run('sin(x|)', { type: 'close' })).toBe('sin(x)|');
    expect(run('(x|', { type: 'close' })).toBe('(x)|');
  });

  it('moves left and right', () => {
    expect(run('ab|c', { type: 'left' }, { type: 'left' }, { type: 'left' })).toBe('|abc');
    expect(run('a|bc', { type: 'right' }, { type: 'right' }, { type: 'right' })).toBe('abc|');
    expect(run('a[bc]d', { type: 'left' })).toBe('a|bcd');
  });

  it('backspaces characters, selections and empty calls', () => {
    expect(run('x^2|', { type: 'backspace' })).toBe('x^|');
    expect(run('[abc]d', { type: 'backspace' })).toBe('|d');
    expect(run('2sqrt(|)', { type: 'backspace' })).toBe('2|');
    expect(run('(|)', { type: 'backspace' })).toBe('|');
    expect(run('|x', { type: 'backspace' })).toBe('|x');
  });

  it('clears', () => {
    expect(run('x+1|', { type: 'clear' })).toBe('|');
  });
});
