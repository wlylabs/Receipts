import { describe, expect, it } from 'vitest';
import { LENGTHS, playAt, soundCues, timeOf, zoomAt, type ReplayVideo } from './replayVideo';

describe('replay video timing', () => {
  for (const l of ['short', 'story'] as const) {
    const T = LENGTHS[l];
    it(`${l}: holds on the bare chart, then runs the replay`, () => {
      expect(playAt(0, l)).toBe(0);
      expect(playAt(T.hook, l)).toBe(0);
      expect(playAt((T.hook + T.play) / 2, l)).toBeCloseTo(0.5, 1);
      expect(playAt(T.play, l)).toBe(1);
    });
    it(`${l}: finds when the playhead reaches a moment`, () => {
      const v = { from: 1000, to: 2000 };
      expect(timeOf(1000, v, l)).toBeCloseTo(T.hook, 2);
      expect(playAt(timeOf(1500, v, l), l)).toBeCloseTo(0.5, 3);
    });
  }
});

describe('replay video slow motion and camera', () => {
  const run = { from: 0, to: 1000, markers: [{ ts: 500, price: 1, kind: 'buy' as const }] };
  for (const l of ['short', 'story'] as const) {
    const T = LENGTHS[l];
    it(`${l}: still runs start to end, only slower at a trade`, () => {
      expect(playAt(T.hook, l, run)).toBe(0);
      expect(playAt(T.play, l, run)).toBe(1);
      let last = -1;
      for (let t = T.hook; t <= T.play; t += 0.05) {
        const p = playAt(t, l, run);
        expect(p).toBeGreaterThanOrEqual(last);
        last = p;
      }
      // a second of video covers less of the run on the trade than far from it
      const at = timeOf(500, run, l);
      const near = playAt(at + 0.1, l, run) - playAt(at - 0.1, l, run);
      const far = playAt(T.hook + 0.9 * (T.play - T.hook) + 0.1, l, run) - playAt(T.hook + 0.9 * (T.play - T.hook) - 0.1, l, run);
      const plain = playAt(at + 0.1, l) - playAt(at - 0.1, l);
      expect(near).toBeLessThan(plain);
      expect(far).toBeGreaterThan(0);
      expect(playAt(timeOf(500, run, l), l, run)).toBeCloseTo(0.5, 3);
    });
    it(`${l}: the camera stays on the playhead through the replay and is back out on the whole chart at the end`, () => {
      expect(zoomAt(0, l)).toBe(1);
      expect(zoomAt((T.hook + T.play) / 2, l)).toBeCloseTo(1, 5);
      expect(zoomAt(T.play, l)).toBe(0);
    });
  }
});

describe('replay video sound', () => {
  const series = Array.from({ length: 101 }, (_, i) => [i * 10, i < 50 ? 1 + i / 10 : 6] as [number, number]);
  const video = {
    symbol: 'X', chainName: 'X', series, candles: [], step: 10, from: 0, to: 1000,
    markers: [{ ts: 200, price: 3, kind: 'buy' as const }], captions: [],
    pnlAt: () => 0, pnl: 1, money: String, scale: 1, label: String, date: String,
  } satisfies ReplayVideo;
  for (const l of ['short', 'story'] as const) {
    it(`${l}: ticks fast while the price climbs, slowly once it is flat, never too close`, () => {
      const T = LENGTHS[l];
      const ticks = soundCues(video, l).filter((c) => c.kind === 'tick').map((c) => c.t);
      for (let i = 1; i < ticks.length; i++) expect(ticks[i]! - ticks[i - 1]!).toBeGreaterThanOrEqual(0.055 - 1e-9);
      const half = timeOf(500, video, l);
      const climb = ticks.filter((t) => t < half).length / (half - T.hook);
      const flat = ticks.filter((t) => t > half).length / (T.play - half);
      expect(climb).toBeGreaterThan(flat);
    });
  }
});
