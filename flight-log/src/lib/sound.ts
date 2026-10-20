// Synthesised UI sounds (Web Audio) — no audio files, nothing to download.
// Soft sine/triangle partials with gentle envelopes, tuned to sound like a
// cabin chime rather than a game. Audio only starts after a user gesture.
let ctx: AudioContext | null = null;
let enabled = true;
let volume = 0.5;

export function configureSound(on: boolean, vol: number) {
  enabled = on;
  volume = Math.max(0, Math.min(1, vol));
}

function ac(): AudioContext | null {
  if (!enabled || volume === 0) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(c: AudioContext, freq: number, at: number, dur: number, gain: number, type: OscillatorType = 'sine', bus?: AudioNode) {
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, at);
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(gain * volume, at + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  o.connect(g).connect(bus ?? c.destination);
  o.start(at);
  o.stop(at + dur + 0.05);
}

function bus(c: AudioContext) {
  // a touch of lowpass keeps everything soft
  const f = c.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.value = 4200;
  f.connect(c.destination);
  return f;
}

export const sound = {
  /** Tiny tactile tick for toggles / segmented controls. */
  tap() {
    const c = ac(); if (!c) return;
    const t = c.currentTime, b = bus(c);
    tone(c, 1320, t, 0.05, 0.035, 'triangle', b);
  },
  /** Classic two-tone cabin chime (high–low) — flight logged. */
  logged() {
    const c = ac(); if (!c) return;
    const t = c.currentTime, b = bus(c);
    tone(c, 1046.5, t, 1.1, 0.11, 'sine', b);        // C6
    tone(c, 2093, t, 0.5, 0.025, 'sine', b);         // overtone
    tone(c, 784, t + 0.32, 1.4, 0.11, 'sine', b);    // G5
    tone(c, 1568, t + 0.32, 0.6, 0.02, 'sine', b);
  },
  /** Rising major arpeggio — achievement unlocked. */
  achievement() {
    const c = ac(); if (!c) return;
    const t = c.currentTime, b = bus(c);
    [659.25, 830.6, 987.77, 1318.5].forEach((f, i) => tone(c, f, t + i * 0.085, 0.9 - i * 0.1, 0.07, 'sine', b));
    tone(c, 2637, t + 0.34, 0.6, 0.015, 'sine', b);
  },
  /** Soft confirmation — saved, exported, imported. */
  success() {
    const c = ac(); if (!c) return;
    const t = c.currentTime, b = bus(c);
    tone(c, 880, t, 0.25, 0.05, 'sine', b);
    tone(c, 1318.5, t + 0.07, 0.35, 0.045, 'sine', b);
  },
  /** Low muted thud — delete / error. */
  warn() {
    const c = ac(); if (!c) return;
    const t = c.currentTime, b = bus(c);
    tone(c, 220, t, 0.28, 0.08, 'triangle', b);
    tone(c, 174.6, t + 0.09, 0.3, 0.06, 'triangle', b);
  },
  /** Airy whoosh for opening a sheet. */
  open() {
    const c = ac(); if (!c) return;
    const t = c.currentTime;
    const len = 0.22;
    const buf = c.createBuffer(1, Math.floor(c.sampleRate * len), c.sampleRate);
    const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 2);
    const src = c.createBufferSource();
    src.buffer = buf;
    const f = c.createBiquadFilter();
    f.type = 'bandpass';
    f.Q.value = 0.8;
    f.frequency.setValueAtTime(600, t);
    f.frequency.exponentialRampToValueAtTime(2400, t + len);
    const g = c.createGain();
    g.gain.value = 0.05 * volume;
    src.connect(f).connect(g).connect(c.destination);
    src.start(t);
  },
};
