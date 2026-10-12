'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * A playhead from 0 to 1 over `ms`, driven by animation frames. `play` starts it from the
 * beginning, `skip` jumps to the end; `done` is true once it has reached it. With `autoplay` it
 * starts playing on mount.
 */
export function useReplay(ms: number, autoplay = false) {
  const [t, setT] = useState(autoplay ? 0 : 1);
  const [playing, setPlaying] = useState(autoplay);
  const start = useRef(0);
  const frame = useRef(0);

  useEffect(() => {
    if (!playing) return;
    const tick = (now: number) => {
      if (!start.current) start.current = now;
      const p = reducedMotion() ? 1 : Math.min(1, (now - start.current) / ms);
      setT(p);
      if (p < 1) frame.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    frame.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame.current);
  }, [playing, ms]);

  const play = useCallback(() => {
    start.current = 0;
    if (reducedMotion()) {
      setT(1);
      return;
    }
    setT(0);
    setPlaying(true);
  }, []);

  const skip = useCallback(() => {
    cancelAnimationFrame(frame.current);
    setPlaying(false);
    setT(1);
  }, []);

  return { t, playing, play, skip };
}

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;
