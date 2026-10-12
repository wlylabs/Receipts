export function Footer() {
  return (
    <footer className="mx-auto max-w-6xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-10 text-[13px] leading-relaxed text-muted sm:px-6">
      <div className="border-t border-line pt-5">
        <p>
          Token data from{' '}
          <a href="https://dexscreener.com" className="underline underline-offset-2 hover:text-ink" target="_blank" rel="noreferrer">
            DexScreener
          </a>
          , charts and trades from{' '}
          <a href="https://www.geckoterminal.com" className="underline underline-offset-2 hover:text-ink" target="_blank" rel="noreferrer">
            GeckoTerminal
          </a>
          , refreshed every minute. Receipts is a game, not financial advice.
        </p>
      </div>
    </footer>
  );
}
