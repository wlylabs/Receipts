export function Footer() {
  return (
    <footer className="mx-auto max-w-6xl px-4 pb-[calc(2rem+env(safe-area-inset-bottom))] pt-10 text-[13px] leading-relaxed text-muted sm:px-6">
      <div className="border-t border-line pt-5">
        <p>
          Every number is read live from{' '}
          <a href="https://bordrless.app" className="underline underline-offset-2 hover:text-ink" target="_blank" rel="noreferrer">
            bordrless.app
          </a>
          ’s public trade feed and refreshed every minute. Receipts is a game, not financial advice.
        </p>
      </div>
    </footer>
  );
}
