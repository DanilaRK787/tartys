// Tiny synthesized sound kit (WebAudio) — no audio files, no licences.
import { settings } from './store.js';

let ctx = null;
function ac() {
  if (!settings().sound) return null;
  try {
    if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch { return null; }
}

function tone(freq, dur, { type = 'sine', vol = 0.18, slide = 0, delay = 0 } = {}) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + delay;
  const o = c.createOscillator(); const g = c.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t0);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.05);
}

function noise(dur, { vol = 0.25, freq = 900, q = 0.8, delay = 0 } = {}) {
  const c = ac(); if (!c) return;
  const t0 = c.currentTime + delay;
  const buf = c.createBuffer(1, Math.ceil(c.sampleRate * dur), c.sampleRate);
  const d = buf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / d.length);
  const src = c.createBufferSource(); src.buffer = buf;
  const f = c.createBiquadFilter(); f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q;
  const g = c.createGain(); g.gain.value = vol;
  src.connect(f).connect(g).connect(c.destination); src.start(t0);
}

export const sfx = {
  unlock() { ac(); },
  tick() { tone(660, 0.12, { type: 'square', vol: 0.08 }); },
  go() { tone(880, 0.35, { type: 'sawtooth', vol: 0.12 }); tone(1320, 0.3, { type: 'triangle', vol: 0.08, delay: 0.05 }); },
  burst() { noise(0.22, { vol: 0.35, freq: 500 }); tone(180, 0.2, { type: 'triangle', vol: 0.15, slide: -80 }); },
  perfect() { noise(0.25, { vol: 0.35, freq: 700 }); [660, 880, 1175].forEach((f, i) => tone(f, 0.18, { type: 'triangle', vol: 0.12, delay: i * 0.06 })); },
  blocked() { tone(140, 0.2, { type: 'square', vol: 0.08, slide: -40 }); },
  slip() { noise(0.35, { vol: 0.3, freq: 250, q: 0.5 }); tone(220, 0.4, { type: 'sine', vol: 0.12, slide: -150 }); },
  quiz() { tone(990, 0.1, { vol: 0.1 }); tone(1320, 0.12, { vol: 0.1, delay: 0.1 }); },
  right() { tone(784, 0.12, { type: 'triangle', vol: 0.12 }); tone(1046, 0.2, { type: 'triangle', vol: 0.12, delay: 0.1 }); },
  wrong() { tone(200, 0.25, { type: 'square', vol: 0.07 }); },
  win() { [523, 659, 784, 1046].forEach((f, i) => tone(f, 0.3, { type: 'triangle', vol: 0.14, delay: i * 0.11 })); },
  lose() { [392, 330, 262].forEach((f, i) => tone(f, 0.35, { type: 'sine', vol: 0.12, delay: i * 0.16 })); },
  draw() { tone(440, 0.3, { vol: 0.1 }); tone(440, 0.3, { vol: 0.1, delay: 0.2 }); }
};

export function buzz(pattern) { try { if (settings().vibrate && navigator.vibrate) navigator.vibrate(pattern); } catch { /* not supported */ } }
