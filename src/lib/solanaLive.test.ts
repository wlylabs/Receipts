import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
const { wsUrl } = await import('./solanaLive');

describe('wsUrl', () => {
  it('turns the RPC URL into its websocket, key and all', () => {
    expect(wsUrl({ SOLANA_RPC_URL: 'https://mainnet.helius-rpc.com/?api-key=abc' })).toBe('wss://mainnet.helius-rpc.com/?api-key=abc');
    expect(wsUrl({ SOLANA_RPC_URL: 'http://localhost:8899' })).toBe('ws://localhost:8899/');
  });

  it('takes its own websocket URL, and none without an RPC', () => {
    expect(wsUrl({ SOLANA_RPC_URL: 'https://a.example', SOLANA_WS_URL: 'wss://b.example' })).toBe('wss://b.example');
    expect(wsUrl({})).toBeNull();
  });
});
