'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Clapperboard, Download, Loader2, Play, Volume2, VolumeX } from 'lucide-react';
import { drawFrame, FORMATS, LENGTHS, recommendLength, soundCues, timingOf, type ReplayVideo, type VideoFormat, type VideoLength } from '../lib/replayVideo';
import { saveFile } from '../lib/clipboard';
import { toast } from '../lib/toast';
import { cx } from '../lib/cx';
import { Sheet } from './Sheet';
import { useChartStyle } from '../hooks/useChartStyle';
import { ChartStylePicker } from './ChartStylePicker';
import { Paywall } from './Paywall';
import { forget, unspent } from '../lib/paidDownloads';
import type { PayInfo } from '../lib/types';

/** A button that opens the video maker: pick a size and a length, watch it, download it. */
export function VideoExport({ video, fileBase, className, title, label = 'Video' }: { video: ReplayVideo; fileBase: string; className?: string; title?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx('btn', className ?? 'btn-quiet')}>
        <Clapperboard className="size-4" aria-hidden /> {label}
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
  // the cut that suits this run is picked to start with, and marked
  const pick = useMemo(() => recommendLength(run), [run]);
  const [length, setLength] = useState<VideoLength>(pick.length);
  const [sound, setSound] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [restart, setRestart] = useState(0);
  // a paid download: the price, the paywall showing, and a payment not yet spent on a file
  const [pay, setPay] = useState<PayInfo | null>(null);
  const [paying, setPaying] = useState(false);
  /** The paid quote this download spends; kept in the browser until the file is saved. */
  const [paidToken, setPaidToken] = useState<string | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const audio = useRef<AudioContext | null>(null);
  const { width, height } = FORMATS[format];
  const { seconds, play } = timingOf(length, video);
  const locked = !!pay?.paid && !paidToken;

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
      // until it's paid, the preview is marked, so recording the screen isn't the download
      if (locked) watermark(g, width, height);
      if (!reduced) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [video, format, length, width, height, seconds, play, restart, locked]);

  useEffect(() => () => void audio.current?.close().catch(() => undefined), []);

  useEffect(() => {
    let live = true;
    fetch('/api/pay/', { cache: 'no-store' })
      .then((r) => r.json() as Promise<PayInfo>)
      .then(async (p) => {
        if (!live) return;
        setPay(p);
        // a payment from before a refresh still buys its download
        const t = p.paid ? await unspent() : null;
        if (live && t) setPaidToken(t);
      })
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

  const make = async (paidNow = false, spend = paidToken) => {
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
      if (res !== 'cancelled' && spend) {
        forget(spend);
        setPaidToken(null);
      }
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
      <p className="label flex items-center gap-2"><span className="step min-w-5 h-5 text-[10px]">1</span> Size</p>
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
              className={cx('flex flex-col items-start gap-1.5 rounded-[10px] border px-3 py-2.5 text-left transition-colors', on ? 'border-ink bg-surface shadow-[0_2px_0_var(--ink)]' : 'border-line hover:bg-hover')}
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

      <p className="label mt-4 flex items-center gap-2"><span className="step min-w-5 h-5 text-[10px]">2</span> Candles</p>
      <ChartStylePicker inline className="mt-1.5" />

      <div className="mt-4 flex flex-wrap items-end gap-2 sm:gap-3">
        <div className="min-w-0 basis-full sm:basis-0 sm:flex-1">
          <p className="label flex items-center gap-2"><span className="step min-w-5 h-5 text-[10px]">3</span> Length</p>
          <div role="radiogroup" aria-label="Length" className="mt-1.5 flex rounded-lg bg-subtle p-0.5">
            {(Object.keys(LENGTHS) as VideoLength[]).map((l) => (
              <button
                key={l}
                type="button"
                role="radio"
                aria-checked={l === length}
                disabled={busy}
                onClick={() => setLength(l)}
                className={cx('flex min-h-11 flex-1 flex-col items-center justify-center rounded-md px-2 py-1 text-[12.5px] font-medium', l === length ? 'bg-surface text-ink shadow-sm' : 'text-muted')}
              >
                <span className="whitespace-nowrap">
                  {LENGTHS[l].label} <span className="text-muted">· {Math.round(timingOf(l, video).seconds)} s</span>
                </span>
                {l === pick.length && <span className="mono mt-0.5 rounded bg-accent px-1 text-[9px] font-bold uppercase tracking-wide text-on-accent">Recommended</span>}
              </button>
            ))}
          </div>
        </div>
        <button type="button" onClick={() => setSound((s) => !s)} disabled={busy} aria-pressed={sound} className="btn btn-quiet h-11 px-3">
          {sound ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
          {sound ? 'Sound on' : 'Sound off'}
        </button>
      </div>
      <p className="mt-1.5 text-[12px] leading-snug text-muted">
        {length === pick.length ? pick.reason : `Recommended: ${LENGTHS[pick.length].label}. ${pick.reason}`}
      </p>

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
          onPaid={(token) => {
            setPaidToken(token);
            void make(true, token);
          }}
        />
      ) : (
        <button type="button" onClick={() => make()} disabled={busy || !pay} className="btn btn-primary mt-4 h-12 w-full text-[15px]">
          {busy || !pay ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Download className="size-4" aria-hidden />}
          {busy ? `Rendering ${Math.round(progress * 100)}%` : `Download ${FORMATS[format].ratio} · ${Math.round(seconds)} s${locked ? ` · $${pay.priceUsd.toFixed(pay.priceUsd % 1 ? 2 : 0)}` : ''}`}
        </button>
      )}
      {paidToken && !busy && <p className="mt-2 text-center text-[12px] text-muted">Paid: your download is ready.</p>}
      {pay && !pay.paid && pay.owner && !paying && <p className="mt-2 text-center text-[12px] text-muted">Free for you: this browser is signed in as the owner.</p>}
      {busy && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-subtle" aria-hidden>
          <div className="h-full bg-ink transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </div>
  );
}

/** "Preview" across the frame, faint enough to judge the video by, plain enough to spoil a copy. */
function watermark(g: CanvasRenderingContext2D, width: number, height: number) {
  g.save();
  g.translate(width / 2, height / 2);
  g.rotate(-Math.PI / 7);
  const size = Math.round(Math.min(width, height) * 0.075);
  g.font = `800 ${size}px Inter, system-ui, sans-serif`;
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = 'rgba(15, 20, 25, 0.10)';
  const reach = Math.hypot(width, height) / 2;
  for (let y = -reach; y <= reach; y += size * 3.2) {
    const shift = (Math.round(y / (size * 3.2)) % 2) * size * 3;
    for (let x = -reach - shift; x <= reach; x += size * 6.5) g.fillText('PREVIEW', x, y);
  }
  g.restore();
}
