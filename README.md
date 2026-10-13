# Receipts

Paste a token or a wallet and see what really happened. For a token you get its market right now,
every candle since launch, and the top winners and losers among its latest traders. For a wallet you
get its trades replayed on the chart with the P&L counting up, and the whole thing as a video for X,
TikTok or YouTube.

Receipts runs on free, public data and needs no keys or database. Keys only make it read further
and faster (see [Configuration](#configuration)).

## Run it

```sh
npm ci
cp .env.example .env.local   # optional
npm run dev                  # http://localhost:3000
```

| Script | What it does |
| --- | --- |
| `npm run dev` | Development server |
| `npm run build` / `npm start` | Production build and server |
| `npm test` | Unit tests (Vitest) |
| `npm run lint` / `npm run typecheck` | ESLint and TypeScript |

CI (`.github/workflows/ci.yml`) runs lint, typecheck, tests and a build on every pull request.

## Where the numbers come from

| What | Source |
| --- | --- |
| Token info, picking the pool | [DexScreener](https://docs.dexscreener.com/api/reference) |
| Candles and the latest ~300 trades | [GeckoTerminal](https://www.geckoterminal.com/dex-api) |
| Solana wallet history | Solana JSON-RPC (`getSignaturesForAddress`, `getTransaction`) |
| EVM wallet history | Etherscan-style account API: [Blockscout](https://docs.blockscout.com/devs/apis/rpc/account) (Ethereum, Base, Arbitrum, Optimism, Polygon, Robinhood Chain), [Routescan](https://routescan.io/documentation) (Avalanche), [Etherscan V2](https://docs.etherscan.io/) (BNB Chain, with a key) |
| SOL, ETH, BNB, AVAX, POL in USD over time | [Pyth Benchmarks](https://benchmarks.pyth.network/docs) |

### How a wallet's P&L is worked out

1. **Every move of the token** in or out of the wallet is read off the chain. On Solana that
   includes the wallet's associated token accounts after they are closed, so a wallet that sold out
   and reclaimed its rent still has its history.
2. **Swap or transfer.** If something went the other way in the same transaction (SOL or ETH,
   wrapped or not, or a dollar stablecoin), it was a swap. If tokens moved with nothing paid, it was
   a transfer: a gift, an airdrop, or a move between the owner's own wallets.
3. **Swaps are valued at what was really paid or received.** Stablecoins count at $1, and the native
   coin at its Pyth price at that hour. If the other side couldn't be read, the DEX feed's value for
   the same transaction is used, and failing that the chart's candle. The trade list says which.
4. **Average cost.** Profit is realized on the tokens sold and unrealized on the bag at today's
   price. Tokens received for nothing join the bag at what they were worth then. Tokens sent away
   leave at cost with no profit. Network fees come off the P&L.
5. **Limits are shown, not hidden.** If the history goes back further than was read, the page says
   so, and tokens sold without a visible buy are reported apart.

Every request is rate-limited per caller, and calls to each upstream are paced (a token bucket under
GeckoTerminal's ~30/min), so one heavy user can't use up the free quotas for everyone. The limits
are kept in memory, so each server instance counts on its own.

## Configuration

Every variable is optional; see [`.env.example`](.env.example).

| Variable | Effect |
| --- | --- |
| `PAY_WALLET` + `PAY_SECRET` | Makes each video download paid: the preview stays free, and **Download** asks for USDC or SOL sent to `PAY_WALLET` (a Solana address) from the viewer's wallet or by scanning a Solana Pay code. `PAY_SECRET` is any long random string that signs the price quotes. The payment is checked on chain before the file is made. Unset, downloads are free. |
| `OWNER_KEY` | Lets the owner download free: open `/owner/?key=<OWNER_KEY>` once in a browser and its downloads are never paid (`/owner/?off` signs it out). Use 16+ random characters; changing it signs every browser out. |
| `PAY_PRICE_USD` | The price of one download in dollars (default `1`). SOL is priced from Pyth's SOL/USD (DexScreener if Pyth is out) at the time of the quote. |
| `SOLANA_RPC_URL` | Your own Solana RPC (a free Helius/Triton/QuickNode key). Reads 120 transactions per wallet and token instead of 30, without being throttled, and turns on live replays: the server listens on the RPC's websocket for the wallet's new transactions (`/api/live`, the key stays on the server) and the page reads its trades again as they land. **Recommended in production.** |
| `SOLANA_WS_URL` | The RPC's websocket, when it isn't `SOLANA_RPC_URL` with `wss://`. |
| `ETHERSCAN_API_KEY` | Etherscan V2, used for wallet history on every chain it covers in place of Blockscout and Routescan. Turns on BNB Chain (if your plan covers it). Blockscout sits behind bot protection that can turn away server IPs, so a key is the steadier choice in production. |
| `BSC_EXPLORER_API` | Any other Etherscan-compatible endpoint for BNB Chain. |
| `GECKOTERMINAL_API`, `PYTH_BENCHMARKS_URL` | Use a different endpoint for those sources. |
| `NEXT_PUBLIC_SITE_URL` | Public URL for share links and the sitemap. |
| `NEXT_PUBLIC_FOMO_REFERRAL_URL` | The fomo referral link (default FMath's, `fomo.family/r/willydetrade`, 10% off fees). On token pages and under each receipt on fomo's chains, a card pitches it in the terms of what the page just showed: cheaper exits after selling before the top, "fees ate this one" after a small loss, a cheaper comeback after a big one, cheaper profit-taking on an open bag. `off` hides the card. |
| `NEXT_PUBLIC_FMATH_URL` | FMath's URL (e.g. `fmath.vercel.app`). Adds a second link on that card to FMath's profit calculator with the token, the wallet's average buy and its entry market cap filled in. |

## Layout

```
src/app/api/       route handlers: token, trader, wallet, candles, live, pay
src/lib/upstream   DexScreener + GeckoTerminal
src/lib/solana     Solana RPC: holdings, moves, swap/transfer reading
src/lib/evm        Etherscan-style explorers: holdings, moves, swap/transfer reading
src/lib/quotes     native coin USD history (Pyth)
src/lib/receipts   the maths: pricing moves, positions, leaderboard
src/lib/replayVideo  canvas video renderer (MP4/WebM, in the browser)
```

## License

See [LICENSE](LICENSE).
