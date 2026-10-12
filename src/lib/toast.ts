type Listener = (message: string) => void;
const listeners = new Set<Listener>();

export function toast(message: string) {
  for (const l of listeners) l(message);
}

export function onToast(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}
