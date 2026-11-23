// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateTarget3D } from '../game';
import { installDomStubs } from '../test/domSetup';
import { App } from './App';

const SEED = 31337;
const DIFFICULTY = 3;
const target = generateTarget3D(DIFFICULTY, SEED);

beforeAll(installDomStubs);
beforeEach(() => {
  localStorage.clear();
  localStorage.setItem('gxuess.settings.v1', JSON.stringify({ mode: '3d' }));
  localStorage.setItem('gxuess.game3d.v1', JSON.stringify({ difficulty: DIFFICULTY, seed: SEED }));
  localStorage.setItem('gxuess.expressions3d.v1', JSON.stringify([{ id: 'r1', text: '', color: '#3e63dd', visible: true }]));
  vi.spyOn(console, 'error').mockImplementation(() => {}); // three.js reports the missing WebGL context
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

const row = () => screen.getByLabelText('Expression 1') as HTMLInputElement;
const type = (text: string) => fireEvent.change(row(), { target: { value: text } });
const submitButton = () => screen.queryByRole('button', { name: /Submit expression 1/ });
const formula = () => screen.getByTestId('target-formula').textContent;

describe('3D mode', () => {
  it('switches between 2D and 3D, each with its own target and rows', async () => {
    render(<App />);
    expect(formula()).toBe('f(x, y) = ?');
    expect(screen.getByRole('radio', { name: '3D' }).getAttribute('aria-checked')).toBe('true');
    // Without WebGL the 3D view degrades to a message instead of crashing.
    expect(await screen.findByText(/needs WebGL/)).toBeTruthy();

    type('z = x y');
    fireEvent.click(screen.getByRole('radio', { name: '2D' }));
    expect(formula()).toBe('f(x) = ?');
    expect(screen.queryByDisplayValue('z = x y')).toBeNull();
    expect(JSON.parse(localStorage.getItem('gxuess.settings.v1')!).mode).toBe('2d');

    fireEvent.click(screen.getByRole('radio', { name: '3D' }));
    expect(screen.getByDisplayValue('z = x y')).toBeTruthy(); // 3D rows were kept
  });

  it('toggles the target surface independently', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('button', { name: 'Hide f(x, y) on the graph' }));
    expect(screen.getByRole('button', { name: 'Show f(x, y) on the graph' }).getAttribute('aria-pressed')).toBe('false');
    expect(JSON.parse(localStorage.getItem('gxuess.game3d.v1')!).targetVisible).toBe(false);
    expect(JSON.parse(localStorage.getItem('gxuess.game.v1') ?? '{}').targetVisible).not.toBe(false); // 2D untouched
  });

  it('submits surfaces from rows: miss, then win with an equivalent form', () => {
    render(<App />);
    type('y = x');
    expect(screen.getByText(/In 3D, write surfaces as z = …/)).toBeTruthy();
    expect(submitButton()).toBeNull();

    type('z = x^3 + 40');
    fireEvent.click(submitButton()!);
    expect(screen.getByText(/^✗/).textContent).not.toContain(target.expression);
    expect(screen.getByLabelText('Attempts').textContent).toBe('1 try');

    type(`z = 3(${target.expression})/3`);
    fireEvent.click(submitButton()!);
    expect(screen.getByText(/^✓/).textContent).toContain('Correct');
    expect(screen.getByText(/Solved in 2 tries/)).toBeTruthy();
    expect(formula()).toBe(`f(x, y) = ${target.expression}`);
    fireEvent.click(screen.getByRole('button', { name: 'New function' }));
    expect(formula()).toBe('f(x, y) = ?');
  });

  it('lets rows use f(x, y) but not submit them', () => {
    render(<App />);
    type('z = sin(f(x, y))');
    expect((screen.getByRole('button', { name: /Can't submit expression 1/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('generates a new 3D surface when the difficulty changes', () => {
    render(<App />);
    fireEvent.click(screen.getByRole('radio', { name: 'Difficulty 5' }));
    expect(JSON.parse(localStorage.getItem('gxuess.game3d.v1')!)).toMatchObject({ difficulty: 5, attempts: 0 });
    fireEvent.click(screen.getByRole('button', { name: 'Hint' }));
    expect(screen.getByRole('list', { name: 'Hints' }).textContent).toMatch(/surface\./);
  });
});
