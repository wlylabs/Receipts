import { describe, expect, it } from 'vitest';
import { LENGTHS, playAt, recommendLength, soundCues, timeOf, timingOf, zoomAt, type ReplayVideo } from './replayVideo';
import type { Candle } from './candles';

describe('replay video timing', () => {
  for (const l of ['short', 'story', 'long'] as const) {
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
  for (const l of ['short', 'story', 'long'] as const) {
    const T = LENGTHS[l];
    it(`${l}: still runs start to end, only slower at a trade`, () => {
      // the long cut's length follows the run's trades
      const T = timingOf(l, run);
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
  for (const l of ['short', 'story', 'long'] as const) {
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

describe('paced replay video', () => {
  const run = (n: number) => ({ from: 0, to: n * 60, paced: true, candles: Array.from({ length: n }, (_, i) => [i * 60, 1, 1, 1, 1] as Candle) });
  for (const l of ['short', 'story', 'long'] as const) {
    it(`${l}: runs the candles at a steady pace, so a longer market makes a longer video`, () => {
      const few = timingOf(l, run(45));
      const many = timingOf(l, run(90));
      expect(many.play - many.hook).toBeCloseTo(2 * (few.play - few.hook), 5);
      expect(many.seconds).toBeGreaterThan(few.seconds);
      expect(playAt(many.play, l, run(90))).toBe(1);
      expect(zoomAt(many.play, l, run(90))).toBe(0);
    });
    it(`${l}: keeps a tiny market watchable and a huge one a clip`, () => {
      expect(timingOf(l, run(2)).play - LENGTHS[l].hook).toBeGreaterThanOrEqual(2.5);
      expect(timingOf(l, run(10_000)).seconds).toBeLessThan(l === 'long' ? 60 : 30);
    });
    it(`${l}: a run that isn't paced keeps the fixed length`, () => {
      expect(timingOf(l, { ...run(60), paced: false })).toEqual(LENGTHS[l]);
    });
  }
});

describe('long replay video', () => {
  const run = (n: number) => ({ from: 0, to: 10_000, markers: Array.from({ length: n }, (_, i) => ({ ts: ((i + 1) * 10_000) / (n + 1), price: 1, kind: 'buy' as const })) });
  it('gets longer with each trade, never thin and never past a minute', () => {
    const two = timingOf('long', run(2));
    const ten = timingOf('long', run(10));
    expect(ten.seconds).toBeGreaterThan(two.seconds);
    expect(two.play - two.hook).toBeGreaterThanOrEqual(16);
    expect(timingOf('long', run(200)).seconds).toBeLessThan(60);
    // the closing receipt holds after the replay
    expect(two.seconds - two.play).toBeGreaterThanOrEqual(6);
  });
  it('keeps the fixed length for a run with no trades in it', () => {
    expect(timingOf('long', run(0))).toEqual(LENGTHS.long);
  });
  it('lingers longer on a trade than the story cut does', () => {
    const r = run(1);
    const share = (l: 'story' | 'long') => {
      const T = timingOf(l, r);
      const at = timeOf(5000, r, l);
      return (playAt(at + 0.1, l, r) - playAt(at - 0.1, l, r)) * (T.play - T.hook);
    };
    expect(share('long')).toBeLessThan(share('story'));
  });
  it('lands the stamp after the replay when there is a receipt to stamp', () => {
    const video = {
      symbol: 'X', chainName: 'X', series: [[0, 1], [10_000, 2]] as [number, number][], candles: [], step: 10, from: 0, to: 10_000,
      markers: run(3).markers, captions: [], pnlAt: () => 0, pnl: 1, money: String, scale: 1, label: String, date: String,
      outro: { title: 'x', lines: [{ k: 'a', v: 'b' }], stamp: { text: 'CHAD', tone: 'pos' as const } },
    } satisfies ReplayVideo;
    const T = timingOf('long', video);
    const stamp = soundCues(video, 'long').find((c) => c.kind === 'stamp');
    expect(stamp?.t).toBeGreaterThan(T.play);
    expect(stamp!.t).toBeLessThan(T.seconds);
    expect(soundCues(video, 'story').some((c) => c.kind === 'stamp')).toBe(false);
  });
});

describe('recommended length', () => {
  const run = (trades: number, captions: number) => ({
    from: 0,
    to: 10_000,
    markers: Array.from({ length: trades }, (_, i) => ({ ts: ((i + 1) * 10_000) / (trades + 1), price: 1, kind: 'buy' as const })),
    captions: Array.from({ length: captions }, (_, i) => ({ ts: i * 100, text: 'x', tone: null })),
  });
  it('picks the short cut for a moment or two', () => {
    expect(recommendLength(run(1, 1)).length).toBe('short');
    expect(recommendLength(run(0, 2)).length).toBe('short');
  });
  it('picks the story cut for a handful', () => {
    expect(recommendLength(run(2, 3)).length).toBe('story');
  });
  it('picks the long cut for many moments, and says why', () => {
    const r = recommendLength(run(6, 4));
    expect(r.length).toBe('long');
    expect(r.reason).toMatch(/^6 trades and 4 captions/);
  });
  it('counts a market by its captions', () => {
    const market = (captions: number) => ({ ...run(0, captions), paced: true, candles: Array.from({ length: 80 }, (_, i) => [i * 100, 1, 1, 1, 1] as Candle) });
    expect(recommendLength(market(4)).length).toBe('story');
    expect(recommendLength(market(8)).length).toBe('long');
    expect(recommendLength(market(8)).reason).toMatch(/^8 moments/);
  });
});
