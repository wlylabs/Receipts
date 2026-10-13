/**
 * Payments made in this browser and not yet spent on a file, kept so a refresh, a crash or a
 * closed tab doesn't lose one. A quote is kept a day past its end, long enough for a late payment.
 */

const KEY = 'receipts:payments';
const KEEP = 86_400;

type Kept = { token: string; exp: number };

function read(): Kept[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Kept[];
    const now = Date.now() / 1000;
    return Array.isArray(list) ? list.filter((k) => typeof k?.token === 'string' && k.exp + KEEP > now) : [];
  } catch {
    return [];
  }
}

function write(list: Kept[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-8)));
  } catch {
    // private mode: the payment then lasts as long as the page
  }
}

/** Keeps a quote that may get paid. */
export const remember = (token: string, exp: number) => write([...read().filter((k) => k.token !== token), { token, exp }]);

/** Drops a quote once its payment has bought a file. */
export const forget = (token: string) => write(read().filter((k) => k.token !== token));

/** The kept quotes, newest first. */
export const kept = () => read().map((k) => k.token).reverse();

/** Whether a quote has been paid on chain. */
export async function isPaid(token: string): Promise<boolean> {
  try {
    const res = await fetch(`/api/pay/status/?token=${encodeURIComponent(token)}`, { cache: 'no-store' });
    return res.ok && ((await res.json()) as { paid: boolean }).paid;
  } catch {
    return false;
  }
}

/** The first kept quote that has been paid and not yet spent, if any. */
export async function unspent(): Promise<string | null> {
  for (const t of kept()) if (await isPaid(t)) return t;
  return null;
}
