import type { Difficulty } from './generator';
import type { GuessResult } from './judge';

export type GameStatus = 'playing' | 'won' | 'revealed';

/** Feedback on the latest submission, shown on the row it came from. */
export interface SubmissionFeedback {
  rowId: string;
  /** The row's text when submitted; feedback hides once the row is edited. */
  text: string;
  result: GuessResult;
}

export interface GameState {
  difficulty: Difficulty;
  /** Seed of the current target; the formula is derived from (difficulty, seed). */
  seed: number;
  attempts: number;
  hintsShown: number;
  status: GameStatus;
  /** Whether the target curve f(x) is drawn on the graph. */
  targetVisible: boolean;
  feedback: SubmissionFeedback | null;
  /** Seeds of the last few finished-or-skipped rounds per difficulty, newest first, so new targets don't repeat them. */
  recent: Partial<Record<Difficulty, number[]>>;
}

/** How many past targets per difficulty a new one must differ from. */
export const RECENT_LIMIT = 30;

export type GameAction =
  /** Start a new target. Seeds come from the caller so the reducer stays pure. */
  | { type: 'new'; seed: number; difficulty?: Difficulty }
  | { type: 'submitted'; rowId: string; text: string; result: GuessResult }
  | { type: 'hint'; available: number }
  | { type: 'reveal' }
  | { type: 'toggleTarget' };

export function initialGame(
  seed: number,
  difficulty: Difficulty = 1,
  recent: GameState['recent'] = {},
): GameState {
  return { difficulty, seed, attempts: 0, hintsShown: 0, status: 'playing', targetVisible: true, feedback: null, recent };
}

export function gameReducer(state: GameState, action: GameAction): GameState {
  switch (action.type) {
    case 'new': {
      const past = [state.seed, ...(state.recent[state.difficulty] ?? [])].slice(0, RECENT_LIMIT);
      const recent = { ...state.recent, [state.difficulty]: past };
      return { ...initialGame(action.seed, action.difficulty ?? state.difficulty, recent), targetVisible: state.targetVisible };
    }
    case 'submitted': {
      if (state.status !== 'playing') return state;
      const feedback = { rowId: action.rowId, text: action.text, result: action.result };
      const attempts = state.attempts + 1;
      if (action.result.correct) return { ...state, attempts, feedback, status: 'won', targetVisible: true };
      return { ...state, attempts, feedback };
    }
    case 'hint':
      if (state.status !== 'playing') return state;
      return { ...state, hintsShown: Math.min(action.available, state.hintsShown + 1) };
    case 'reveal':
      if (state.status !== 'playing') return state;
      return { ...state, status: 'revealed', targetVisible: true, feedback: null };
    case 'toggleTarget':
      return { ...state, targetVisible: !state.targetVisible };
  }
}
