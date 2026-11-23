// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { generateTarget } from '../game';
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
