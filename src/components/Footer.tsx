export function Footer() {
  return (
    <footer className="mx-auto mt-16 max-w-6xl px-4 pb-[calc(1.5rem+env(safe-area-inset-bottom))] sm:px-6">
      <div className="flex flex-col gap-1 border-t border-line pt-5 text-[12.5px] leading-relaxed text-muted sm:flex-row sm:justify-between">
        <p>
          Prices from{' '}
          <a href="https://dexscreener.com" className="text-ink-2 hover:text-ink" target="_blank" rel="noreferrer">
            DexScreener
          </a>{' '}
          and{' '}
          <a href="https://www.geckoterminal.com" className="text-ink-2 hover:text-ink" target="_blank" rel="noreferrer">
            GeckoTerminal
          </a>
          , wallets from the chain itself.
        </p>
        <p>Paper money only. Not financial advice.</p>
      </div>
    </footer>
  );
}
