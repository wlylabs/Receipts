'use client';

import { useEffect, useState } from 'react';
import { onToast } from '../lib/toast';

export function Toaster() {
  const [msg, setMsg] = useState<{ text: string; id: number } | null>(null);
  useEffect(() => onToast((text) => setMsg({ text, id: Date.now() })), []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3200);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(1rem+env(safe-area-inset-bottom))] z-50 flex justify-center px-4" role="status" aria-live="polite">
      {msg && (
        <p key={msg.id} className="pop max-w-sm rounded-2xl bg-ink px-4 py-3 text-center text-sm font-medium text-bg shadow-lg">
          {msg.text}
        </p>
      )}
    </div>
  );
}
