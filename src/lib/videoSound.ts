/**
 * The video's sound, made from nothing but oscillators and noise in an OfflineAudioContext, so
 * every sound is our own and no platform can claim it: a whoosh as it starts, a soft tick each
 * time the price steps onto a new note of a pentatonic scale (higher as it climbs), a coin for
 * each buy and a softer fall for each sell, and a sparkling chord or a thud for the result. It all
 * plays in a small room, a short reverb made from the same seeded noise.
 */

export type CueKind = 'hook' | 'tick' | 'buy' | 'sell' | 'win' | 'loss' | 'even';

export interface Cue {
  t: number;
  kind: CueKind;
  /** 0 to 1, for the ticks: where the price sits between its low and its high. */
  pitch?: number;
}

export const SAMPLE_RATE = 48_000;

/** C major pentatonic over two octaves from C5, and the C on top. */
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24].map((st) => 523.25 * 2 ** (st / 12));

/** How many notes the ticks have: the price ticks each time it crosses into another. */
export const TICK_STEPS = SCALE.length;

/** The note a price level (0 to 1) sits on. */
export function tickStep(level: number): number {
  return Math.min(TICK_STEPS - 1, Math.max(0, Math.floor(level * TICK_STEPS)));
}

export async function renderSound(cues: Cue[], seconds: number): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(2, Math.ceil(SAMPLE_RATE * seconds), SAMPLE_RATE);
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -14;
  comp.ratio.value = 4;
  comp.connect(ctx.destination);
  const master = ctx.createGain();
  master.gain.value = 0.9;
  master.connect(comp);
  const room = ctx.createConvolver();
  room.buffer = impulse(ctx, 0.6);
  const wet = ctx.createGain();
  wet.gain.value = 0.16;
  master.connect(room).connect(wet).connect(comp);

  const noise = noiseBuffer(ctx);
  const rand = xorshift(0x9e3779b9);

  for (const c of cues) {
    switch (c.kind) {
      case 'hook':
        whoosh(ctx, master, noise, c.t, 0.55, 0.22);
        tone(ctx, master, c.t + 0.05, 'sine', 220, 330, 0.5, 0.1);
        break;
      case 'tick': {
        // a hair of drift in pitch and level, so a run of ticks never sounds like a machine
        const f = SCALE[tickStep(c.pitch ?? 0.5)]! * (1 + (rand() - 0.5) * 0.03);
        const peak = 0.06 * (0.85 + rand() * 0.3);
        click(ctx, master, noise, c.t, peak * 0.5);
        tone(ctx, master, c.t, 'sine', f * 1.2, f, 0.07, peak);
        break;
      }
      case 'buy':
        // a coin: two quick notes up, B5 then E6, rung like a bell
        click(ctx, master, noise, c.t, 0.08);
        bell(ctx, master, c.t, 987.77, 0.18, 0.12);
        bell(ctx, master, c.t + 0.06, 1318.51, 0.45, 0.16);
        break;
      case 'sell':
        // the coin's two notes the other way, through a darker filter
        click(ctx, master, noise, c.t, 0.06);
        tone(ctx, master, c.t, 'triangle', 1318.51, undefined, 0.12, 0.13, 2400);
        tone(ctx, master, c.t + 0.07, 'triangle', 987.77, 880, 0.3, 0.15, 1800);
        break;
      case 'win':
        [523.25, 659.25, 783.99, 1046.5].forEach((f, i) => {
          const t = c.t + i * 0.07;
          tone(ctx, master, t, 'sine', f * 2 ** (-4 / 1200), undefined, 1.1 - i * 0.1, 0.09);
          tone(ctx, master, t, 'sine', f * 2 ** (4 / 1200), undefined, 1.1 - i * 0.1, 0.09);
          bell(ctx, master, t, f * 2, 0.6, 0.05);
        });
        shimmer(ctx, master, noise, c.t + 0.1, 0.9, 0.05);
        break;
      case 'loss':
        tone(ctx, master, c.t, 'sine', 140, 48, 0.7, 0.45);
        whoosh(ctx, master, noise, c.t, 0.25, 0.18, 600);
        tone(ctx, master, c.t + 0.18, 'sawtooth', 311.13, 233.08, 0.8, 0.06, 2200, 300);
        break;
      case 'even':
        tone(ctx, master, c.t, 'sine', 440, undefined, 0.6, 0.14);
        tone(ctx, master, c.t + 0.12, 'sine', 440, undefined, 0.5, 0.1);
        break;
    }
  }
  return ctx.startRendering();
}

function xorshift(seed: number): () => number {
  let s = seed | 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return (s >>> 0) / 4_294_967_296;
  };
}

function noiseBuffer(ctx: BaseAudioContext): AudioBuffer {
  const b = ctx.createBuffer(1, SAMPLE_RATE, SAMPLE_RATE);
  const d = b.getChannelData(0);
  // a fixed seed: the same video always sounds the same
  const rand = xorshift(0x2545f491);
  for (let i = 0; i < d.length; i++) d[i] = rand() * 2 - 1;
  return b;
}

/** A small room: stereo noise dying away, a little differently on each side. */
function impulse(ctx: BaseAudioContext, dur: number): AudioBuffer {
  const n = Math.ceil(SAMPLE_RATE * dur);
  const b = ctx.createBuffer(2, n, SAMPLE_RATE);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    const rand = xorshift(0x5bd1e995 + ch);
    for (let i = 0; i < n; i++) d[i] = (rand() * 2 - 1) * (1 - i / n) ** 3;
  }
  return b;
}

/** A plain note, optionally through a lowpass that can close as the note dies. */
function tone(
  ctx: BaseAudioContext,
  out: AudioNode,
  t: number,
  type: OscillatorType,
  f0: number,
  f1: number | undefined,
  dur: number,
  peak: number,
  cutoff?: number,
  cutoffTo?: number,
) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur * 0.8);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.005);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  let head: AudioNode = o;
  if (cutoff) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.Q.value = 0.7;
    f.frequency.setValueAtTime(cutoff, t);
    if (cutoffTo) f.frequency.exponentialRampToValueAtTime(cutoffTo, t + dur);
    head = head.connect(f);
  }
  head.connect(g).connect(out);
  o.start(t);
  o.stop(t + dur + 0.02);
}

/** A glassy ding: a sine whose brightness, from an inharmonic modulator, rings off fast. */
function bell(ctx: BaseAudioContext, out: AudioNode, t: number, f: number, dur: number, peak: number) {
  const car = ctx.createOscillator();
  const mod = ctx.createOscillator();
  const depth = ctx.createGain();
  const g = ctx.createGain();
  car.frequency.value = f;
  mod.frequency.value = f * 3.5;
  depth.gain.setValueAtTime(f * 1.6, t);
  depth.gain.exponentialRampToValueAtTime(f * 0.02, t + dur * 0.6);
  mod.connect(depth).connect(car.frequency);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + 0.004);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  car.connect(g).connect(out);
  for (const o of [car, mod]) {
    o.start(t);
    o.stop(t + dur + 0.02);
  }
}

/** The snap at the front of a tick: a few milliseconds of bright noise. */
function click(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, t: number, peak: number) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 3000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(peak, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.006);
  src.connect(f).connect(g).connect(out);
  // a different slice of the noise each time
  src.start(t, (t * 7.31) % 0.9);
  src.stop(t + 0.01);
}

/** Bright noise rising behind the win chord. */
function shimmer(ctx: BaseAudioContext, out: AudioNode, noise: AudioBuffer, t: number, dur: number, peak: number) {
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = 6;
  f.frequency.setValueAtTime(4000, t);
  f.frequency.exponentialRampToValueAtTime(11000, t + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(peak, t + dur * 0.3);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t);
  src.stop(t + dur + 0.02);
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
