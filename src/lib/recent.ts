import type { Recent } from './game';

/** Puts a lookup first in the recent list, keeping eight. */
export function pushRecent(list: Recent[], r: Omit<Recent, 'at'>): Recent[] {
  const same = (x: Recent) => x.kind === r.kind && x.address === r.address && x.ca === r.ca;
  return [{ ...r, at: Date.now() }, ...list.filter((x) => !same(x))].slice(0, 8);
}
