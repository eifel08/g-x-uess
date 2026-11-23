// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { compileTarget, generateTarget } from '../game';
import { installDomStubs } from '../test/domSetup';
import { App } from './App';

const SEED = 20260;
const DIFFICULTY = 2;
const target = generateTarget(DIFFICULTY, SEED);

beforeAll(installDomStubs);
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('gxuess.game.v1', JSON.stringify({ difficulty: DIFFICULTY, seed: SEED }));
  localStorage.setItem(
    'gxuess.expressions.v1',
    JSON.stringify([{ id: 'r1', text: '', color: '#3e63dd', visible: true }]),
  );
});
afterEach(cleanup);

const row = () => screen.getByLabelText('Expression 1') as HTMLInputElement;
const type = (text: string) => fireEvent.change(row(), { target: { value: text } });
const submitButton = () => screen.queryByRole('button', { name: /Submit expression 1/ });
const formula = () => screen.getByTestId('target-formula').textContent;

describe('game mode in the app', () => {
  it('pins a hidden f(x) = ? row with a working visibility toggle', () => {
    render(<App />);
    expect(formula()).toBe('f(x) = ?');
    expect(document.body.textContent).not.toContain(target.expression);

    const hide = screen.getByRole('button', { name: 'Hide f(x) on the graph' });
    expect(hide.getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(hide);
    const show = screen.getByRole('button', { name: 'Show f(x) on the graph' });
    expect(show.getAttribute('aria-pressed')).toBe('false');
    expect(JSON.parse(localStorage.getItem('gxuess.game.v1')!).targetVisible).toBe(false);
  });

  it('only offers Submit on rows that are functions of x', () => {
    render(<App />);
    expect(submitButton()).toBeNull(); // empty row
    type('x = 3');
    expect(submitButton()).toBeNull(); // vertical line
    type('y < x^2');
    expect(submitButton()).toBeNull(); // inequality
    type('x^2 + y^2 = 4');
    expect(submitButton()).toBeNull(); // circle
    type('g(x) = x^2');
    expect(submitButton()).not.toBeNull();
    type('y = 2x');
    expect(submitButton()).not.toBeNull();
    type('3x - 1');
    expect(submitButton()).not.toBeNull();
  });

  it('gives feedback on a miss, then celebrates and reveals f(x) on a match', () => {
    render(<App />);
    type('y = x^5 + 40');
    fireEvent.click(submitButton()!);
    const miss = screen.getByText(/^✗/);
    expect(miss.textContent).not.toContain(target.expression);
    expect(screen.getByLabelText('Attempts').textContent).toBe('1 try');
    expect(formula()).toBe('f(x) = ?');

    // Feedback goes away once the row is edited.
    type('y = x^5 + 41');
    expect(screen.queryByText(/^✗/)).toBeNull();

    // An algebraically equivalent (not identical) form wins.
    type(`g(x) = 2(${target.expression}) / 2`);
    fireEvent.click(submitButton()!);
    expect(screen.getByText(/^✓/).textContent).toContain('Correct');
    expect(screen.getByText(/Solved in 2 tries/)).toBeTruthy();
    expect(formula()).toBe(`f(x) = ${target.expression}`);
    expect(submitButton()).toBeNull(); // round over
  });

  it('lets expressions use the hidden f, but not submit them', () => {
    render(<App />);
    type('sin(f(x))');
    expect(screen.queryByText(/is not defined|Unknown function/)).toBeNull();
    const blocked = screen.getByRole('button', { name: /Can't submit expression 1/ });
    expect((blocked as HTMLButtonElement).disabled).toBe(true);
    expect(submitButton()).toBeNull();

    // Values of f are fine to inspect (like hovering the curve).
    type('f(0)');
    const fn = compileTarget(target.expression)!;
    const y0 = fn(0);
    if (Number.isFinite(y0)) expect(screen.getByText(/^=/).textContent).toContain(String(Number(y0.toPrecision(12))).replace('-', '−'));

    // Indirect use through another definition is also caught.
    fireEvent.click(screen.getByRole('button', { name: 'Add expression' }));
    fireEvent.change(screen.getByLabelText('Expression 2'), { target: { value: 'g(x) = f(x) + 0' } });
    type('y = g(x)');
    expect(screen.getByRole('button', { name: /Can't submit expression 1/ })).toBeTruthy();

    // A user definition named f is rejected with a clear message.
    type('f(x) = x^2');
    expect(screen.getByText(/"f" is the hidden function/)).toBeTruthy();
  });

  it('picks difficulty 1–5 and generates a fresh function', () => {
    render(<App />);
    type('y = x^5');
    fireEvent.click(submitButton()!);
    fireEvent.click(screen.getByRole('radio', { name: 'Difficulty 5' }));
    const saved = JSON.parse(localStorage.getItem('gxuess.game.v1')!);
    expect(saved).toMatchObject({ difficulty: 5, attempts: 0, status: 'playing' });
    expect(saved.seed).not.toBe(SEED);
    expect(screen.getByRole('radio', { name: 'Difficulty 5' }).getAttribute('aria-checked')).toBe('true');
    expect(formula()).toBe('f(x) = ?');
  });

  it('shows hints progressively and reveals on give-up', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    expect(screen.getByRole('list', { name: 'Hints' }).textContent).toContain(`f is a ${target.family} function.`);
    fireEvent.click(screen.getByRole('button', { name: 'Give up and reveal f(x)' }));
    expect(formula()).toBe(`f(x) = ${target.expression}`);
    expect(screen.getByText(/Revealed/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'New function' }));
    expect(formula()).toBe('f(x) = ?');
  });
});

describe('variable sliders', () => {
  it('shows a slider for name = number rows and updates the row when dragged', () => {
    render(<App />);
    type('a = 2');
    const slider = screen.getByRole('slider', { name: 'a' }) as HTMLInputElement;
    expect(slider.value).toBe('2');
    expect([slider.min, slider.max, slider.step]).toEqual(['-10', '10', '0.1']);
    fireEvent.change(slider, { target: { value: '3.5' } });
    expect(row().value).toBe('a = 3.5');

    // Editing the range is remembered on the row.
    const max = screen.getByLabelText('Maximum of a');
    fireEvent.change(max, { target: { value: '50' } });
    fireEvent.blur(max);
    expect((screen.getByRole('slider', { name: 'a' }) as HTMLInputElement).max).toBe('50');
    const saved = JSON.parse(localStorage.getItem('gxuess.expressions.v1')!);
    expect(saved[0].slider).toMatchObject({ min: -10, max: 50 });
  });

  it('offers a slider for an undefined variable', () => {
    render(<App />);
    type('y = k x^2');
    fireEvent.click(screen.getByRole('button', { name: '+ slider for k' }));
    expect((screen.getByLabelText('Expression 2') as HTMLInputElement).value).toBe('k = 1');
    expect(screen.getByRole('slider', { name: 'k' })).toBeTruthy();
    expect(screen.queryByText(/"k" is not defined/)).toBeNull();
  });

  it('does not show sliders for non-numeric definitions', () => {
    render(<App />);
    type('a = 2 + 1');
    expect(screen.queryByRole('slider')).toBeNull();
  });
});

describe('phone layout', () => {
  it('toggles an expanded expression list and remembers it', () => {
    const { container } = render(<App />);
    const app = container.querySelector('.app')!;
    expect(app.classList.contains('is-panel-expanded')).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Expand expression list' }));
    expect(app.classList.contains('is-panel-expanded')).toBe(true);
    expect(JSON.parse(localStorage.getItem('gxuess.settings.v1')!).panelExpanded).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Shrink expression list' }));
    expect(app.classList.contains('is-panel-expanded')).toBe(false);
  });
});
