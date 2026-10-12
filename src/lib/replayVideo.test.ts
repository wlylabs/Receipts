import { describe, expect, it } from 'vitest';
import { LENGTHS, playAt, revealAt, timeOf } from './replayVideo';

describe('replay video timing', () => {
  for (const l of ['short', 'story'] as const) {
    const T = LENGTHS[l];
    it(`${l}: holds on the bare chart, runs the replay, then reveals to the end`, () => {
      expect(playAt(0, l)).toBe(0);
      expect(playAt(T.hook, l)).toBe(0);
      expect(playAt((T.hook + T.play) / 2, l)).toBeCloseTo(0.5, 1);
      expect(playAt(T.play, l)).toBe(1);
      expect(revealAt(T.play, l)).toBe(0);
      expect(revealAt(T.play + 1, l)).toBe(1);
      expect(revealAt(T.seconds, l)).toBe(1);
    });
    it(`${l}: finds when the playhead reaches a moment`, () => {
      const v = { from: 1000, to: 2000 };
      expect(timeOf(1000, v, l)).toBeCloseTo(T.hook, 2);
      expect(playAt(timeOf(1500, v, l), l)).toBeCloseTo(0.5, 3);
    });
  }
});
