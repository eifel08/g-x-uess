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
export {
  compileTarget,
  DIFFICULTIES,
  freshSeed,
  generateTarget,
  isGoodTarget,
  type Difficulty,
  type TargetFunction,
} from './generator';
export { hintsFor } from './hints';
export { judgeGuess, type GuessResult } from './judge';
export { gameReducer, initialGame, RECENT_LIMIT, type GameState, type GameStatus } from './state';
export { TARGET_COLOR, TARGET_PLOT_ID } from './style';
export { TargetRow } from './TargetRow';
export { GAME_2D, GAME_3D, useGame, useGame3D, useGameWith, type Game, type GameControls, type GameKit } from './useGame';
export { compileTarget3D, generateTarget3D, isGoodTarget3D, VIEW3D } from './generator3d';
export { hintsFor3D } from './hints3d';
export { judgeGuess3D } from './judge3d';
