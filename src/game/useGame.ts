import { useCallback, useEffect, useMemo, useReducer } from 'react';
import type { RealFn } from '../math/types';
import { compileTarget, generateTarget, randomSeed, type Difficulty, type TargetFunction } from './generator';
import { hintsFor } from './hints';
import { judgeGuess } from './judge';
import { gameReducer, initialGame, type GameState } from './state';

const STORAGE_KEY = 'gxuess.game.v1';

/**
 * Restores the round in progress. Only (difficulty, seed) and progress are
 * stored, never the formula itself; it's regenerated from the seed.
 */
function load(): GameState {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<GameState> | null;
    if (raw && [1, 2, 3, 4, 5].includes(raw.difficulty as number) && Number.isInteger(raw.seed)) {
      return {
        ...initialGame(raw.seed!, raw.difficulty as Difficulty),
        attempts: Number(raw.attempts) || 0,
        hintsShown: Number(raw.hintsShown) || 0,
        status: raw.status === 'won' || raw.status === 'revealed' ? raw.status : 'playing',
        targetVisible: raw.targetVisible !== false,
      };
    }
  } catch {
    // fall through to a fresh game
  }
  return initialGame(randomSeed());
}

export interface Game {
  state: GameState;
  target: TargetFunction;
  /** The hidden target as a function of x (always compiled in radians). */
  targetFn: RealFn;
  hints: string[];
  newFunction(difficulty?: Difficulty): void;
  /** Judges a row's function as a guess for f(x). */
  submit(rowId: string, text: string, guess: RealFn): void;
  hint(): void;
  reveal(): void;
  toggleTarget(): void;
}

export function useGame(): Game {
  const [state, dispatch] = useReducer(gameReducer, undefined, load);
  const target = useMemo(() => generateTarget(state.difficulty, state.seed), [state.difficulty, state.seed]);
  const targetFn = useMemo(() => compileTarget(target.expression) ?? (() => NaN), [target]);
  const hints = useMemo(() => hintsFor(target, targetFn), [target, targetFn]);

  useEffect(() => {
    try {
      const { feedback: _omit, ...persisted } = state;
      localStorage.setItem(STORAGE_KEY, JSON.stringify(persisted));
    } catch {
      // best-effort persistence
    }
  }, [state]);

  const newFunction = useCallback((difficulty?: Difficulty) => dispatch({ type: 'new', seed: randomSeed(), difficulty }), []);
  const submit = useCallback(
    (rowId: string, text: string, guess: RealFn) =>
      dispatch({ type: 'submitted', rowId, text, result: judgeGuess(targetFn, guess) }),
    [targetFn],
  );
  const hint = useCallback(() => dispatch({ type: 'hint', available: hints.length }), [hints.length]);
  const reveal = useCallback(() => dispatch({ type: 'reveal' }), []);
  const toggleTarget = useCallback(() => dispatch({ type: 'toggleTarget' }), []);

  return { state, target, targetFn, hints, newFunction, submit, hint, reveal, toggleTarget };
}
