import { describe, expect, it } from 'vitest';
import { parseAmount, sol, span, tinyPrice } from './format';

describe('format', () => {
  it('writes tiny prices with a zero count', () => {
    expect(tinyPrice(0.0000412)).toBe('0.0₄412');
    expect(tinyPrice(0.5)).toBe('0.5');
  });
  it('signs SOL', () => {
    expect(sol(1.5, { signed: true })).toBe('+1.50 SOL');
    expect(sol(-0.25, { signed: true })).toBe('-0.25 SOL');
  });
  it('reads amounts', () => {
    expect(parseAmount('1,5')).toBe(1.5);
    expect(parseAmount('1,000')).toBe(1000);
    expect(parseAmount('abc')).toBeNaN();
  });
  it('spans', () => {
    expect(span(90_000)).toBe('1d 1h');
    expect(span(30)).toBe('1m');
  });
});
