'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { Clapperboard, Download, Loader2 } from 'lucide-react';
import { drawFrame, FORMATS, SECONDS, type ReplayVideo, type VideoFormat } from '../lib/replayVideo';
import { saveFile } from '../lib/clipboard';
import { toast } from '../lib/toast';
import { cx } from '../lib/cx';
import { Sheet } from './Sheet';

/** A button that opens the video maker: pick a size, watch it loop, download it. */
export function VideoExport({ video, fileBase, className }: { video: ReplayVideo; fileBase: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={cx('btn btn-quiet', className)}>
        <Clapperboard className="size-4" aria-hidden /> Video
      </button>
      <Sheet open={open} onClose={close} title="Make a video" wide>
        {open && <Maker video={video} fileBase={fileBase} />}
      </Sheet>
    </>
  );
}

function Maker({ video, fileBase }: { video: ReplayVideo; fileBase: string }) {
  const [format, setFormat] = useState<VideoFormat>('landscape');
  const [progress, setProgress] = useState<number | null>(null);
  const canvas = useRef<HTMLCanvasElement>(null);
  const { width, height } = FORMATS[format];

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
      const t = reduced ? 6.6 : ((now - start) / 1000) % SECONDS;
      g.setTransform(scale, 0, 0, scale, 0, 0);
      drawFrame(g, t, video, format);
      if (!reduced) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [video, format, width]);

  const make = async () => {
    if (progress !== null) return;
    setProgress(0);
    try {
      const { renderReplayVideo } = await import('../lib/replayVideo');
      const out = await renderReplayVideo(video, format, setProgress);
      const name = `${fileBase}-${FORMATS[format].ratio.replace(':', 'x')}.${out.extension}`;
      const res = await saveFile(new File([out.blob], name, { type: out.blob.type }));
      if (res === 'saved') toast('Video saved.');
    } catch {
      toast('This browser can’t make videos. Try Chrome or Safari.');
    } finally {
      setProgress(null);
    }
  };

  const previewW = format === 'landscape' ? 640 : 480;
  return (
    <div>
      <div role="radiogroup" aria-label="Size" className="grid grid-cols-2 gap-2">
        {(Object.keys(FORMATS) as VideoFormat[]).map((f) => {
          const on = f === format;
          return (
            <button
              key={f}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={progress !== null}
              onClick={() => setFormat(f)}
              className={cx('flex items-center gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors', on ? 'border-ink bg-subtle' : 'border-line hover:bg-hover')}
            >
              <span className={cx('shrink-0 rounded-[4px] border-2', on ? 'border-ink' : 'border-line-strong', f === 'landscape' ? 'h-5 w-9' : 'size-7')} aria-hidden />
              <span>
                <span className="block text-[13.5px] font-semibold">{FORMATS[f].label}</span>
                <span className="num block text-[12px] text-muted">
                  {FORMATS[f].ratio} · {FORMATS[f].width}×{FORMATS[f].height}
                </span>
              </span>
            </button>
          );
        })}
      </div>

      <div className="mt-4 overflow-hidden rounded-xl border border-line bg-white">
        <canvas key={format} ref={canvas} width={previewW} height={Math.round((previewW * height) / width)} className="block h-auto w-full" aria-label="Video preview" />
      </div>
      <p className="mt-2 text-[12.5px] text-muted">
        {SECONDS} seconds, 30 fps, MP4. Made on your device — nothing is uploaded.
      </p>

      <button type="button" onClick={make} disabled={progress !== null} className="btn btn-primary mt-4 h-11 w-full">
        {progress === null ? <Download className="size-4" aria-hidden /> : <Loader2 className="size-4 animate-spin" aria-hidden />}
        {progress === null ? `Download ${FORMATS[format].ratio} video` : `Rendering ${Math.round(progress * 100)}%`}
      </button>
      {progress !== null && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-subtle" aria-hidden>
          <div className="h-full bg-ink transition-[width]" style={{ width: `${progress * 100}%` }} />
        </div>
      )}
    </div>
  );
}
