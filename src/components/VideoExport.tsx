'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Download, Loader2, Play, Volume2, VolumeX } from 'lucide-react';
import { drawFrame, FORMATS, LENGTHS, soundCues, timingOf, type ReplayVideo, type VideoFormat, type VideoLength } from '../lib/replayVideo';
import { saveFile } from '../lib/clipboard';
import { toast } from '../lib/toast';
import { cx } from '../lib/cx';
import { Sheet } from './Sheet';
import { useChartStyle } from '../hooks/useChartStyle';
import { ChartStylePicker } from './ChartStylePicker';
import { Paywall } from './Paywall';
import type { PayInfo } from '../lib/types';

/** A button that opens the video maker: pick a size and a length, watch it, download it. */
export function VideoExport({ video, fileBase, className, title }: { video: ReplayVideo; fileBase: string; className?: string; title?: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx('btn', className ?? 'btn-quiet')}>
        <Clapperboard className="size-4" aria-hidden /> Video
      </button>
      <VideoSheet video={video} fileBase={fileBase} open={open} onClose={close} title={title} />
    </>
  );
}

/** The video maker on its own, for a button that has to fetch the run before it can open. */
export function VideoSheet({ video, fileBase, open, onClose, title = 'Make a video' }: { video: ReplayVideo | null; fileBase: string; open: boolean; onClose: () => void; title?: string }) {
  return (
    <Sheet open={open && !!video} onClose={onClose} title={title} wide>
      {open && video && <Maker video={video} fileBase={fileBase} />}
    </Sheet>
  );
}

function Maker({ video: run, fileBase }: { video: ReplayVideo; fileBase: string }) {
  // the video draws its candles the way the page's charts do
  const [style] = useChartStyle();
  const video = useMemo(() => ({ ...run, candleStyle: style }), [run, style]);
  const [format, setFormat] = useState<VideoFormat>('square');
  const [length, setLength] = useState<VideoLength>('short');
  const [sound, setSound] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [restart, setRestart] = useState(0);
  // a paid download: the price, the paywall showing, and a payment not yet spent on a file
  const [pay, setPay] = useState<PayInfo | null>(null);
  const [paying, setPaying] = useState(false);
  const [unlocked, setUnlocked] = useState(false);
  const canvas = useRef<HTMLCanvasElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const { width, height } = FORMATS[format];
  const { seconds, play } = timingOf(length, video);

  // the preview loops the real frames, drawn small
  useEffect(() => {
    const c = canvas.current;
    const g = c?.getContext('2d');
    if (!c || !g) return;
    const scale = c.width / width;
    let frame = 0;
    const start = performance.now();
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const tick = (now: number) => {
      const t = reduced ? play + 1.5 : ((now - start) / 1000) % seconds;
      g.setTransform(scale, 0, 0, scale, 0, 0);
      drawFrame(g, t, video, format, length);
      if (!reduced) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [video, format, length, width, seconds, play, restart]);

  useEffect(() => () => void audio.current?.close().catch(() => undefined), []);

  useEffect(() => {
    let live = true;
    fetch('/api/pay/', { cache: 'no-store' })
      .then((r) => r.json() as Promise<PayInfo>)
      .then((p) => live && setPay(p))
      .catch(() => live && setPay({ paid: false }));
    return () => {
      live = false;
    };
  }, []);

  // plays the sound once from the top, with the preview restarted under it
  const listen = async () => {
    try {
      const { renderSound } = await import('../lib/videoSound');
      const buffer = await renderSound(soundCues(video, length), seconds);
      await audio.current?.close().catch(() => undefined);
      const ctx = new AudioContext();
      audio.current = ctx;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      setRestart((n) => n + 1);
      src.start();
    } catch {
      toast('This browser can’t play the preview sound.');
    }
  };

  const locked = pay?.paid && !unlocked;
  const make = async (paidNow = false) => {
    if (progress !== null) return;
    if (locked && !paidNow) return setPaying(true);
    setPaying(false);
    setProgress(0);
    try {
      const { renderReplayVideo } = await import('../lib/replayVideo');
      const out = await renderReplayVideo(video, format, length, { sound }, setProgress);
      const name = `${fileBase}-${FORMATS[format].ratio.replace(':', 'x')}-${Math.round(seconds)}s.${out.extension}`;
      const res = await saveFile(new File([out.blob], name, { type: out.blob.type }));
      // the payment buys one file: the next one is paid again
      if (res !== 'cancelled') setUnlocked(false);
      if (out.extension !== 'mp4') toast('Saved as WebM: X and Instagram need MP4. Chrome or Safari make MP4.');
      else if (sound && !out.sound) toast('Saved without sound: this browser can’t encode audio.');
      else if (res === 'saved') toast('Video saved.');
    } catch {
      toast('This browser can’t make videos. Try Chrome or Safari.');
    } finally {
      setProgress(null);
    }
  };

  const busy = progress !== null;
  const previewW = format === 'landscape' ? 640 : format === 'square' ? 480 : 300;
  return (
    <div>
      <p className="eyebrow">Size</p>
      <div role="radiogroup" aria-label="Size" className="mt-1.5 grid grid-cols-3 gap-2">
        {(Object.keys(FORMATS) as VideoFormat[]).map((f) => {
          const on = f === format;
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={busy}
              onClick={() => setFormat(f)}
              className={cx('flex flex-col items-start gap-1.5 rounded-xl border px-3 py-2.5 text-left transition-colors', on ? 'border-ink bg-subtle' : 'border-line hover:bg-hover')}
            >
              <span className={cx('rounded-[3px] border-2', on ? 'border-ink' : 'border-line-strong', f === 'landscape' ? 'h-4 w-7' : f === 'square' ? 'size-5' : 'h-6 w-3.5')} aria-hidden />
              <span className="text-[13px] font-semibold leading-tight">
                {FORMATS[f].label} <span className="num font-normal text-muted">{FORMATS[f].ratio}</span>
              </span>
              <span className="text-[11.5px] leading-tight text-muted">{FORMATS[f].hint}</span>
            </button>
          );
        })}
      </div>

      <p className="eyebrow mt-3">Candles</p>
      <ChartStylePicker inline className="mt-1.5" />

      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-0 flex-1">
          <p className="eyebrow">Length</p>
          <div role="radiogroup" aria-label="Length" className="mt-1.5 flex rounded-lg bg-subtle p-0.5">
            {(Object.keys(LENGTHS) as VideoLength[]).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={l === length}
                disabled={busy}
                onClick={() => setLength(l)}
                className={cx('h-9 flex-1 rounded-md px-2 text-[12.5px] font-medium', l === length ? 'bg-surface text-ink shadow-sm' : 'text-muted')}
              >
                {LENGTHS[l].label} <span className="text-muted">· {Math.round(timingOf(l, video).seconds)} s</span>
              </button>
            ))}
          </div>
        </div>
        <button type="button" onClick={() => setSound((s) => !s)} disabled={busy} aria-pressed={sound} className="btn btn-quiet h-10 px-3">
          {sound ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
          {sound ? 'Sound on' : 'Sound off'}
        </button>
      </div>

      <div className="mt-4 flex justify-center rounded-xl border border-line bg-subtle p-2">
        <canvas key={`${format}`} ref={canvas} width={previewW} height={Math.round((previewW * height) / width)} className={cx('block h-auto rounded-md bg-white', format === 'portrait' ? 'w-[46%] sm:w-[34%]' : format === 'square' ? 'w-[78%] sm:w-[62%]' : 'w-full')} aria-label="Video preview" />
      </div>
      <div className="mt-2 flex items-center justify-between gap-3">
        <p className="text-[12.5px] text-muted">
          {Math.round(seconds)} s · {FORMATS[format].width}×{FORMATS[format].height}
        </p>
        {sound && (
          <button type="button" onClick={listen} disabled={busy} className="btn btn-quiet h-8 min-h-0 shrink-0 px-2.5 text-[12.5px]">
            <Play className="size-3.5" aria-hidden /> Hear it
          </button>
        )}
      </div>

      {paying && pay?.paid ? (
        <Paywall
          priceUsd={pay.priceUsd}
          onCancel={() => setPaying(false)}
          onPaid={() => {
            setUnlocked(true);
            void make(true);
          }}
        />
      ) : (
        <button type="button" onClick={() => make()} disabled={busy || !pay} className="btn btn-primary mt-4 h-11 w-full">
          {busy || !pay ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
          {busy ? `Rendering ${Math.round(progress * 100)}%` : `Download ${FORMATS[format].ratio} · ${Math.round(seconds)} s${locked ? ` · $${pay.priceUsd.toFixed(pay.priceUsd % 1 ? 2 : 0)}` : ''}`}
        </button>
      )}
      {busy && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-subtle" aria-hidden>
          <div className="h-full bg-ink transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </div>
  );
}
