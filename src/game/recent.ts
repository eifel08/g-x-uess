import type { Difficulty, TargetFunction } from './generator';

/** How many recent targets per difficulty a new round avoids. */
export const RECENT_LIMIT = 30;

/** Recent target hashes per difficulty, oldest first. */
export type RecentTargets = Partial<Record<Difficulty, string[]>>;

/**
 * Short FNV-1a hash of a formula. Recent targets are stored as hashes, so
 * the list in localStorage never spoils the answer of a round in progress.
 */
export function hashExpression(expression: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < expression.length; i++) {
    h ^= expression.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36);
}

/** Adds a hash to the end of a recent list (moving it if present), keeping the last `limit`. */
export function remember(recent: readonly string[], hash: string, limit = RECENT_LIMIT): string[] {
  return [...recent.filter((h) => h !== hash), hash].slice(-limit);
}

/**
 * Draws seeds until the generated target isn't in `recent` (up to
 * `maxTries`; the last draw is used if every one repeats). Choosing the
 * seed, rather than changing the generator, keeps targets deterministic per
 * (difficulty, seed) so a saved round can always be restored.
 */
export function pickFreshSeed(
  generate: (seed: number) => TargetFunction,
  recent: readonly string[],
  nextSeed: () => number,
  maxTries = 60,
): number {
  const avoid = new Set(recent);
  let seed = nextSeed();
  for (let i = 1; i < maxTries && avoid.has(hashExpression(generate(seed).expression)); i++) seed = nextSeed();
  return seed;
}
