/**
 * A till roll unspooling into a lowercase r: the roll (with its core) is the r's shoulder, the
 * paper hanging from it is the stem, torn off at the foot like a receipt.
 */
export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="currentColor">
      <path d="M4.5 21.5V12c0-4.4 3.2-7.5 7.5-7.5h1.5v5.2H12c-1.4 0-2.3.9-2.3 2.3v9.5l-1.3-1.15-1.3 1.15-1.3-1.15z" />
      <path fillRule="evenodd" d="M16.3 3a4.1 4.1 0 1 1 0 8.2 4.1 4.1 0 0 1 0-8.2zm0 2.6a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3z" />
    </svg>
  );
}
