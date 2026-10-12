export function Logo({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden fill="none">
      <rect width="24" height="24" rx="6" fill="currentColor" />
      <path d="M7.5 5.5h9v13l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1z" fill="var(--bg)" />
      <path d="M9.5 9h5M9.5 11.5h5M9.5 14h3" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
    </svg>
  );
}
