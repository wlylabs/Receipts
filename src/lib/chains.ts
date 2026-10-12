export interface Chain {
  name: string;
  /** GeckoTerminal's network id. */
  gt: string;
  tx: (hash: string) => string;
  account: (address: string) => string;
}

const evm = (name: string, gt: string, explorer: string): Chain => ({
  name,
  gt,
  tx: (h) => `${explorer}/tx/${h}`,
  account: (a) => `${explorer}/address/${a}`,
});

/** The chains Receipts plays, by DexScreener chain id. */
export const CHAINS: Record<string, Chain> = {
  solana: { name: 'Solana', gt: 'solana', tx: (h) => `https://solscan.io/tx/${h}`, account: (a) => `https://solscan.io/account/${a}` },
  ethereum: evm('Ethereum', 'eth', 'https://etherscan.io'),
  base: evm('Base', 'base', 'https://basescan.org'),
  bsc: evm('BNB Chain', 'bsc', 'https://bscscan.com'),
  arbitrum: evm('Arbitrum', 'arbitrum', 'https://arbiscan.io'),
  polygon: evm('Polygon', 'polygon_pos', 'https://polygonscan.com'),
  avalanche: evm('Avalanche', 'avax', 'https://snowtrace.io'),
  optimism: evm('Optimism', 'optimism', 'https://optimistic.etherscan.io'),
  robinhood: evm('Robinhood Chain', 'robinhood', 'https://robinhoodchain.blockscout.com'),
};

export const SUPPORTED = Object.values(CHAINS).map((c) => c.name);
