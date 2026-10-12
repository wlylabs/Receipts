const LOCALE = 'en-US';
const cache = new Map<string, Intl.NumberFormat>();

function nf(opts: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = JSON.stringify(opts);
  let f = cache.get(key);
  if (!f) {
    f = new Intl.NumberFormat(LOCALE, opts);
    cache.set(key, f);
  }
  return f;
}

export function usd(n: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  return nf({
    style: 'currency',
    currency: 'USD',
    currencyDisplay: 'narrowSymbol',
    notation: abs >= 100_000 ? 'compact' : 'standard',
    minimumFractionDigits: abs >= 1000 ? 0 : 2,
    maximumFractionDigits: abs >= 100_000 ? 2 : abs >= 1000 ? 0 : abs >= 1 ? 2 : 4,
    signDisplay: opts.signed ? 'exceptZero' : 'auto',
  }).format(n);
}

/** A market cap, short: $812, $45.2K, $2.44M. */
export function mcap(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n) || n <= 0) return '-';
  return nf({ style: 'currency', currency: 'USD', currencyDisplay: 'narrowSymbol', notation: 'compact', maximumSignificantDigits: 3 }).format(n);
}

export function compact(n: number): string {
  if (!Number.isFinite(n)) return '-';
  return nf({ notation: 'compact', maximumFractionDigits: 2 }).format(n);
}

export function pct(n: number | null | undefined, opts: { signed?: boolean } = {}): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '-';
  const abs = Math.abs(n);
  return nf({ style: 'percent', maximumFractionDigits: abs >= 10 ? 0 : 1, signDisplay: opts.signed ? 'exceptZero' : 'auto' }).format(n);
}

/** A token price in dollars, tiny ones with a zero count. */
export function price(n: number): string {
  return Number.isFinite(n) && n > 0 ? `$${tinyPrice(n)}` : '-';
}

/** Tiny memecoin prices: 0.0000412 -> "0.0₄412". */
export function tinyPrice(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '-';
  if (n >= 0.001) return nf({ maximumSignificantDigits: 4 }).format(n);
  const zeros = Math.floor(-Math.log10(n));
  const digits = Math.round(n * 10 ** (zeros + 3)).toString().replace(/0+$/, '') || '0';
  const sub = String(zeros).replace(/\d/g, (d) => '₀₁₂₃₄₅₆₇₈₉'[Number(d)]!);
  return `0.0${sub}${digits}`;
}

export function short(a: string): string {
  return a.length > 12 ? `${a.slice(0, 4)}…${a.slice(-4)}` : a;
}

export function dateTime(ts: number): string {
  return new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(ts * 1000);
}

export function day(ts: number): string {
  return new Intl.DateTimeFormat(LOCALE, { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', hour12: false }).format(ts * 1000);
}

/** A span of seconds as "3d 4h", "5h 12m" or "40m". */
export function span(sec: number): string {
  const s = Math.max(0, Math.round(sec));
  const d = Math.floor(s / 86_400);
  const h = Math.floor((s % 86_400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (d > 0) return `${d}d ${h}h`;
  if (h > 0) return `${h}h ${m}m`;
  return `${Math.max(1, m)}m`;
}

/** Reads typed amounts: "1,5" and "1.5" are both one and a half. */
export function parseAmount(raw: string): number {
  const s = raw.replace(/[\s_]/g, '').replace(/,(?=\d{1,2}$)/, '.').replace(/,/g, '');
  if (!/^\d*\.?\d*$/.test(s) || s === '' || s === '.') return NaN;
  return Number(s);
}
