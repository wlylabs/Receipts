import type { Recent } from './game';

/** Puts a lookup first in the recent list, keeping eight. */
export function pushRecent(list: Recent[], r: Omit<Recent, 'at'>): Recent[] {
  return [{ ...r, at: Date.now() }, ...list.filter((x) => !(x.kind === r.kind && x.address === r.address))].slice(0, 8);
}
