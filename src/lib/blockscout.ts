import 'server-only';

/**
 * Blockscout, the open-source explorer, runs free keyless instances for these chains. They give
 * a wallet's token transfers and holdings, which DexScreener and GeckoTerminal do not.
 */
export const BLOCKSCOUT: Record<string, string> = {
  ethereum: 'https://eth.blockscout.com',
  base: 'https://base.blockscout.com',
  optimism: 'https://optimism.blockscout.com',
  arbitrum: 'https://arbitrum.blockscout.com',
  polygon: 'https://polygon.blockscout.com',
  robinhood: 'https://robinhoodchain.blockscout.com',
};

const PAGES = 4;

async function get<T>(url: string): Promise<T> {
  const res = await fetch(url, { headers: { accept: 'application/json' }, next: { revalidate: 60 }, signal: AbortSignal.timeout(10_000) });
  if (!res.ok) throw new Error(`blockscout ${res.status} ${url}`);
  return (await res.json()) as T;
}

interface TokenRef {
  address?: string;
  address_hash?: string;
  symbol?: string | null;
  decimals?: string | null;
}

const addressOf = (t: TokenRef | undefined) => (t?.address_hash ?? t?.address ?? '').toLowerCase();

interface Transfer {
  from: { hash: string };
  to: { hash: string };
  timestamp: string;
  transaction_hash: string;
  total: { value: string; decimals: string | null };
  token?: TokenRef;
}

/** The wallet's transfers of one token, oldest first: positive in, negative out. */
export async function tokenMoves(chain: string, owner: string, token: string): Promise<{ moves: { tx: string; ts: number; delta: number }[]; complete: boolean } | null> {
  const base = BLOCKSCOUT[chain];
  if (!base) return null;
  const me = owner.toLowerCase();
  const out: { tx: string; ts: number; delta: number }[] = [];
  let params = '';
  let complete = false;
  for (let page = 0; page < PAGES; page++) {
    const body = await get<{ items: Transfer[]; next_page_params: Record<string, string | number> | null }>(
      `${base}/api/v2/addresses/${owner}/token-transfers?type=ERC-20&token=${token}${params}`,
    );
    for (const t of body.items ?? []) {
      if (t.token && addressOf(t.token) && addressOf(t.token) !== token.toLowerCase()) continue;
      const amount = Number(t.total.value) / 10 ** Number(t.total.decimals ?? t.token?.decimals ?? 18);
      const into = t.to.hash.toLowerCase() === me;
      const from = t.from.hash.toLowerCase() === me;
      if (into === from || !(amount > 0)) continue;
      out.push({ tx: t.transaction_hash, ts: Math.floor(Date.parse(t.timestamp) / 1000), delta: into ? amount : -amount });
    }
    if (!body.next_page_params) {
      complete = true;
      break;
    }
    params = '&' + new URLSearchParams(Object.entries(body.next_page_params).map(([k, v]) => [k, String(v)])).toString();
  }
  return { moves: out.sort((a, b) => a.ts - b.ts), complete };
}

/** The wallet's ERC-20 balances on one chain. */
export async function holdings(chain: string, owner: string): Promise<{ address: string; amount: number }[]> {
  const base = BLOCKSCOUT[chain];
  if (!base) return [];
  const body = await get<{ items: { token: TokenRef; value: string }[] }>(`${base}/api/v2/addresses/${owner}/tokens?type=ERC-20`);
  return (body.items ?? [])
    .map((i) => ({ address: addressOf(i.token), amount: Number(i.value) / 10 ** Number(i.token.decimals ?? 18) }))
    .filter((h) => h.address && h.amount > 0);
}
