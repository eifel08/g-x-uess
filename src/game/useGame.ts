import { useCallback, useEffect, useMemo, useReducer } from 'react';
import type { RealFn, RealFn2 } from '../math/types';
import { compileTarget, freshSeed, generateTarget, randomSeed, type Difficulty, type TargetFunction } from './generator';
import { compileTarget3D, generateTarget3D } from './generator3d';
import { hintsFor } from './hints';
import { hintsFor3D } from './hints3d';
import { judgeGuess, type GuessResult } from './judge';
import { judgeGuess3D } from './judge3d';
import { gameReducer, initialGame, RECENT_LIMIT, type GameState } from './state';

/** Keeps only well-formed seed lists from storage. */
function loadRecent(raw: unknown): GameState['recent'] {
  const recent: GameState['recent'] = {};
  if (!raw || typeof raw !== 'object') return recent;
  for (const d of [1, 2, 3, 4, 5] as Difficulty[]) {
    const seeds = (raw as Record<string, unknown>)[d];
    if (Array.isArray(seeds)) recent[d] = seeds.filter(Number.isInteger).slice(0, RECENT_LIMIT) as number[];
  }
  return recent;
}

/** Everything that differs between the 2D and 3D games. */
export interface GameKit<Fn> {
  storageKey: string;
  generate(difficulty: Difficulty, seed: number): TargetFunction;
  compile(expression: string): Fn | null;
  /** Used if a target somehow fails to compile. */
  fallback: Fn;
  judge(target: Fn, guess: Fn): GuessResult;
  hints(target: TargetFunction, fn: Fn): string[];
}

export const GAME_2D: GameKit<RealFn> = {
  storageKey: 'gxuess.game.v1',
  generate: generateTarget,
  compile: compileTarget,
  fallback: () => NaN,
  judge: judgeGuess,
  hints: hintsFor,
};

export const GAME_3D: GameKit<RealFn2> = {
  storageKey: 'gxuess.game3d.v1',
  generate: generateTarget3D,
  compile: compileTarget3D,
  fallback: () => NaN,
  judge: judgeGuess3D,
  hints: hintsFor3D,
};

/**
 * Restores the round in progress. Only (difficulty, seed) and progress are
 * stored, never the formula itself; it's regenerated from the seed.
 */
function load(storageKey: string): GameState {
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey) ?? 'null') as Partial<GameState> | null;
    if (raw && [1, 2, 3, 4, 5].includes(raw.difficulty as number) && Number.isInteger(raw.seed)) {
      return {
        ...initialGame(raw.seed!, raw.difficulty as Difficulty, loadRecent(raw.recent)),
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

/** The parts of a game the UI controls need (shared by 2D and 3D). */
export interface GameControls {
  state: GameState;
  target: TargetFunction;
  hints: string[];
  newFunction(difficulty?: Difficulty): void;
  hint(): void;
  reveal(): void;
  toggleTarget(): void;
}

export interface Game<Fn = RealFn> extends GameControls {
  /** The hidden target as a function (always compiled in radians). */
  targetFn: Fn;
  /** Judges a row's function as a guess for f. */
  submit(rowId: string, text: string, guess: Fn): void;
}

export function useGameWith<Fn>(kit: GameKit<Fn>): Game<Fn> {
  const [state, dispatch] = useReducer(gameReducer, kit.storageKey, load);
  const target = useMemo(() => kit.generate(state.difficulty, state.seed), [kit, state.difficulty, state.seed]);
  const targetFn = useMemo(() => kit.compile(target.expression) ?? kit.fallback, [kit, target]);
  const hints = useMemo(() => kit.hints(target, targetFn), [kit, target, targetFn]);

  useEffect(() => {
    try {
      const { feedback: _omit, ...persisted } = state;
      localStorage.setItem(kit.storageKey, JSON.stringify(persisted));
    } catch {
      // best-effort persistence
    }
  }, [kit, state]);

  const newFunction = useCallback(
    (difficulty?: Difficulty) => {
      const d = difficulty ?? state.difficulty;
      // The round being left joins `recent` in the reducer, so avoid it here too.
      const seeds = [...(state.recent[d] ?? []), ...(d === state.difficulty ? [state.seed] : [])];
      const avoid = new Set(seeds.map((s) => kit.generate(d, s).expression));
      const seed = freshSeed((s) => kit.generate(d, s).expression, avoid);
      dispatch({ type: 'new', seed, difficulty });
    },
    [kit, state.difficulty, state.seed, state.recent],
  );
  const submit = useCallback(
    (rowId: string, text: string, guess: Fn) =>
      dispatch({ type: 'submitted', rowId, text, result: kit.judge(targetFn, guess) }),
    [kit, targetFn],
  );
  const hint = useCallback(() => dispatch({ type: 'hint', available: hints.length }), [hints.length]);
  const reveal = useCallback(() => dispatch({ type: 'reveal' }), []);
  const toggleTarget = useCallback(() => dispatch({ type: 'toggleTarget' }), []);

  return { state, target, targetFn, hints, newFunction, submit, hint, reveal, toggleTarget };
}

/** The 2D game: hidden f(x). */
export const useGame = () => useGameWith(GAME_2D);
/** The 3D game: hidden surface z = f(x, y). */
export const useGame3D = () => useGameWith(GAME_3D);
