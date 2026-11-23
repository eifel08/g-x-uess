import { describe, expect, it } from 'vitest';
import { generateTarget } from './generator';
import { hashExpression, pickFreshSeed, RECENT_LIMIT, remember } from './recent';

describe('recent targets', () => {
  it('hashes formulas compactly and consistently, without storing them', () => {
    expect(hashExpression('2x + 3')).toBe(hashExpression('2x + 3'));
    expect(hashExpression('2x + 3')).not.toBe(hashExpression('2x + 4'));
    expect(hashExpression('2x + 3')).not.toContain('x');
  });

  it('keeps the last RECENT_LIMIT entries, most recent last, without duplicates', () => {
    let list: string[] = [];
    for (let i = 0; i < 50; i++) list = remember(list, `h${i}`);
    expect(list).toHaveLength(RECENT_LIMIT);
    expect(list[list.length - 1]).toBe('h49');
    list = remember(list, 'h30');
    expect(list.filter((h) => h === 'h30')).toHaveLength(1);
    expect(list[list.length - 1]).toBe('h30');
  });

  it('skips seeds whose target was played recently', () => {
    const generate = (seed: number) => generateTarget(1, seed);
    const recent = [hashExpression(generate(1).expression), hashExpression(generate(2).expression)];
    const seeds = [1, 2, 3, 4];
    let i = 0;
    const chosen = pickFreshSeed(generate, recent, () => seeds[i++]);
    expect(chosen).toBe(3);
  });

  it('gives up after maxTries rather than looping forever', () => {
    const recent = [hashExpression(generateTarget(1, 7).expression)];
    expect(pickFreshSeed((s) => generateTarget(1, s), recent, () => 7, 5)).toBe(7);
  });
});
