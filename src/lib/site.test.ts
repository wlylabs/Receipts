import { describe, expect, it } from 'vitest';
import { siteUrl } from './site';

describe('siteUrl', () => {
  it('takes a bare domain, a full URL or nothing', () => {
    expect(siteUrl('receipts-ecru.vercel.app')).toBe('https://receipts-ecru.vercel.app');
    expect(siteUrl(' https://receipts.app/ ')).toBe('https://receipts.app');
    expect(siteUrl('http://localhost:3000')).toBe('http://localhost:3000');
    expect(siteUrl(undefined)).toBe('https://receipts.vercel.app');
    expect(siteUrl('not a url at all')).toBe('https://receipts.vercel.app');
  });
});
