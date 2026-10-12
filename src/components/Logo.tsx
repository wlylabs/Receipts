export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 32 32" className={className} aria-hidden>
      <rect width="32" height="32" rx="8" fill="#ffd23f" />
      <path d="M9 6h14v20l-2.33-1.6L18.33 26 16 24.4 13.67 26l-2.34-1.6L9 26z" fill="#fbf8f1" stroke="#141414" strokeWidth="1.6" strokeLinejoin="round" />
      <path d="M12 11h8M12 14.5h8M12 18h5" stroke="#141414" strokeWidth="1.6" strokeLinecap="round" />
    </svg>
  );
}
