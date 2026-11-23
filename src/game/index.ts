/**
 * Game logic for "guess the hidden f(x)". Phase 1 only ships the pieces the
 * graphing calculator needs to stay compatible with; puzzles, scoring and
 * rounds arrive in Phase 2.
 */
export { compareFunctions, type EquivalenceOptions, type EquivalenceResult } from './equivalence';
export {
  compareFunctionsByIntegral,
  randomIntervals,
  type IntegralEquivalenceOptions,
  type IntegralEquivalenceResult,
  type Interval,
} from './integralEquivalence';
