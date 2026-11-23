/**
 * Game logic for "guess the hidden f(x)": procedural targets by difficulty,
 * guess judging, hints, and round state.
 */
export { compareFunctions, type EquivalenceOptions, type EquivalenceResult } from './equivalence';
export {
  compareFunctionsByIntegral,
  randomIntervals,
  type IntegralEquivalenceOptions,
  type IntegralEquivalenceResult,
  type Interval,
} from './integralEquivalence';
export { compileTarget, DIFFICULTIES, generateTarget, isGoodTarget, type Difficulty, type TargetFunction } from './generator';
export { hintsFor } from './hints';
export { judgeGuess, type GuessResult } from './judge';
export { gameReducer, initialGame, type GameState, type GameStatus } from './state';
export { TARGET_COLOR, TARGET_PLOT_ID } from './style';
export { TargetRow } from './TargetRow';
export { useGame, type Game } from './useGame';
