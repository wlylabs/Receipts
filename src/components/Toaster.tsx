'use client';

import { useEffect, useState } from 'react';
import { onToast } from '../lib/toast';

export function Toaster() {
  const [msg, setMsg] = useState<{ text: string; id: number } | null>(null);
  useEffect(() => onToast((text) => setMsg({ text, id: Date.now() })), []);
  useEffect(() => {
    if (!msg) return;
    const t = setTimeout(() => setMsg(null), 3000);
    return () => clearTimeout(t);
  }, [msg]);
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(5rem+env(safe-area-inset-bottom))] sm:bottom-[calc(1rem+env(safe-area-inset-bottom))] lg:pl-64 z-[60] flex justify-center px-4" role="status" aria-live="polite">
      {msg && (
        <p key={msg.id} className="rise max-w-sm rounded-xl bg-ink px-4 py-2.5 text-center text-[13.5px] font-medium text-on-ink shadow-lg">
          {msg.text}
        </p>
      )}
    </div>
  );
}
