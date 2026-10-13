/** FMath's mark in its own marigold, as on its icon: a percent sign whose slash cuts through both discs. */
export function FmathLogo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" aria-hidden className={className}>
      <rect width="64" height="64" rx="16" fill="#ffb23f" />
      <circle cx="21" cy="23" r="12" fill="#1a1206" />
      <circle cx="43" cy="41" r="12" fill="#1a1206" />
      <path d="M20 55H31L44 9H33Z" fill="#1a1206" stroke="#ffb23f" strokeWidth="5" paintOrder="stroke" />
    </svg>
  );
}
