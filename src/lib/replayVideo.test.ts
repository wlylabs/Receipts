import { describe, expect, it } from 'vitest';
import { outroAt, playAt, revealAt, SECONDS } from './replayVideo';

describe('replay video timing', () => {
  it('holds the playhead during the hook, then runs it to the end before the reveal', () => {
    expect(playAt(0)).toBe(0);
    expect(playAt(1.2)).toBe(0);
    expect(playAt(3.4)).toBeGreaterThan(0.3);
    expect(playAt(5.6)).toBe(1);
  });
  it('reveals after the replay and closes on the outro', () => {
    expect(revealAt(5)).toBe(0);
    expect(revealAt(6.5)).toBe(1);
    expect(outroAt(7)).toBe(0);
    expect(outroAt(SECONDS)).toBe(1);
  });
});
