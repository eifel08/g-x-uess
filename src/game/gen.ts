import { mulberry32 } from './random';

/** Seeded parameter picker shared by the 2D and 3D target generators. */
export interface Gen {
  /** Integer in [lo, hi]. */
  int(lo: number, hi: number, opts?: { nonZero?: boolean }): number;
  /** Multiple of 0.5 in [lo, hi]: …, −1, −0.5, 0, 0.5, 1, … */
  half(lo: number, hi: number, opts?: { nonZero?: boolean }): number;
  pick<T>(items: readonly T[]): T;
  /** Two distinct values from `items`, in ascending order. */
  pair(items: readonly number[]): [number, number];
}

export function makeGen(seed: number): Gen {
  const rng = mulberry32(seed);
  const int = (lo: number, hi: number, opts?: { nonZero?: boolean }) => {
    for (;;) {
      const v = lo + Math.floor(rng() * (hi - lo + 1));
      if (!opts?.nonZero || v !== 0) return v;
    }
  };
  const pick = <T,>(items: readonly T[]) => items[Math.floor(rng() * items.length)];
  return {
    int,
    half: (lo, hi, opts) => int(lo * 2, hi * 2, opts) / 2,
    pick,
    pair(items) {
      const a = pick(items);
      let b = pick(items);
      while (b === a) b = pick(items);
      return a < b ? [a, b] : [b, a];
    },
  };
}

/** ±values, e.g. signed([1, 2]) → [1, 2, −1, −2]. */
export const signed = (values: readonly number[]) => [...values, ...values.map((v) => -v)];
