/**
 * The video's sound, made from nothing but oscillators and noise in an OfflineAudioContext, so
 * every sound is our own and no platform can claim it: a whoosh as it starts, soft ticks while
 * the price runs (higher as it climbs), a blip for each buy and sell, and a chord or a thud for
 * the result.
 */

export type CueKind = 'hook' | 'tick' | 'buy' | 'sell' | 'win' | 'loss' | 'even';

export interface Cue {
  t: number;
  kind: CueKind;
  /** 0 to 1, for the ticks: where the price sits between its low and its high. */
  pitch?: number;
}

export const SAMPLE_RATE = 48_000;

export async function renderSound(cues: Cue[], seconds: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(SAMPLE_RATE * seconds), SAMPLE_RATE);
  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  master.connect(comp).connect(ctx.destination);
  const noise = noiseBuffer(ctx);

  for (const c of cues) {
    switch (c.kind) {
      case 'hook':
        whoosh(ctx, master, noise, c.t, 0.55, 0.22);
        tone(ctx, master, c.t + 0.05, 'sine', 220, 330, 0.5, 0.1);
        break;
      case 'tick':
        tone(ctx, master, c.t, 'triangle', 520 + (c.pitch ?? 0.5) * 900, undefined, 0.045, 0.045);
        break;
      case 'buy':
        tone(ctx, master, c.t, 'triangle', 660, 990, 0.14, 0.2);
        tone(ctx, master, c.t + 0.06, 'sine', 1320, undefined, 0.12, 0.08);
        break;
      case 'sell':
        tone(ctx, master, c.t, 'triangle', 880, 560, 0.16, 0.2);
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          tone(ctx, master, c.t + i * 0.07, 'sine', f, undefined, 1.1 - i * 0.1, 0.16);
          tone(ctx, master, c.t + i * 0.07, 'triangle', f * 2, undefined, 0.4, 0.04);
        });
        break;
      case 'loss':
        tone(ctx, master, c.t, 'sine', 140, 48, 0.7, 0.45);
        whoosh(ctx, master, noise, c.t, 0.25, 0.18, 600);
        tone(ctx, master, c.t + 0.18, 'triangle', 311.13, 233.08, 0.8, 0.08);
        break;
      case 'even':
        tone(ctx, master, c.t, 'sine', 440, undefined, 0.6, 0.14);
        tone(ctx, master, c.t + 0.12, 'sine', 440, undefined, 0.5, 0.1);
        break;
    }
  }
  return ctx.startRendering();
}

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const b = ctx.createBuffer(1, SAMPLE_RATE, SAMPLE_RATE);
  const d = b.getChannelData(0);
  // a fixed seed: the same video always sounds the same
  let s = 0x2545f491;
  for (let i = 0; i < d.length; i++) {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    d[i] = ((s >>> 0) / 4_294_967_296) * 2 - 1;
  }
  return b;
}

function tone(ctx: BaseAudioContext, out: AudioNode, t: number, type: OscillatorType, f0: number, f1: number | undefined, dur: number, peak: number) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function whoosh(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, t: number, dur: number, peak: number, to = 4000) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 0.9;
  f.frequency.setValueAtTime(300, t);
  f.frequency.exponentialRampToValueAtTime(to, t + dur * 0.7);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.35);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t);
  src.stop(t + dur + 0.02);
}
