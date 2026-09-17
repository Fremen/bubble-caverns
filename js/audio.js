// Bubble Caverns — audio module (§Audio contract, docs/CONTRACTS.md)
// Zero-dependency browser ES module. Everything synthesized with WebAudio:
// oscillators, noise buffers, envelopes. No samples, no fetches.
//
// Master chain: gain -> DynamicsCompressor -> destination.
// AudioContext is created/resumed ONLY in unlock() (autoplay policy).
// Every public entry point is wrapped so nothing ever throws.

export const SFX_LIST = [
  'jump', 'shoot', 'trap', 'pop', 'enemy_down', 'pickup', 'powerup',
  'extra_life', 'hurt', 'death', 'bounce', 'menu_move', 'menu_select',
  'level_clear', 'game_over', 'hurry', 'boss_hit', 'boss_down', 'count',
];

export const MUSIC_TRACKS = ['title', 'moss', 'crystal', 'gold', 'ember', 'abyss', 'boss'];

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

let ctx = null;          // AudioContext — exists only after unlock()
let master = null;       // master gain (mute target)
let compressor = null;
let sfxBus = null;
let musicBus = null;
let delaySend = null;    // feedback delay send for music lead
let noiseBuf = null;     // shared white-noise buffer
let unlocked = false;

const MASTER_VOL = 0.55;
const SFX_VOL = 0.85;
const MUSIC_VOL = 0.30;  // music sits under the SFX

const warned = new Set();

function ready() {
  return !!(ctx && unlocked && ctx.state === 'running' && master);
}

function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
function mtof(m) { return 440 * Math.pow(2, (m - 69) / 12); }

// ---------------------------------------------------------------------------
// Graph construction (called from unlock only)
// ---------------------------------------------------------------------------

function buildGraph() {
  master = ctx.createGain();
  master.gain.value = AudioSys.muted ? 0 : MASTER_VOL;

  compressor = ctx.createDynamicsCompressor();
  compressor.threshold.value = -18;
  compressor.knee.value = 14;
  compressor.ratio.value = 5;
  compressor.attack.value = 0.003;
  compressor.release.value = 0.22;

  master.connect(compressor);
  compressor.connect(ctx.destination);

  sfxBus = ctx.createGain();
  sfxBus.gain.value = SFX_VOL;
  sfxBus.connect(master);

  musicBus = ctx.createGain();
  musicBus.gain.value = MUSIC_VOL;
  musicBus.connect(master);

  // Light feedback delay for the music lead (dotted-eighth-ish shimmer).
  delaySend = ctx.createGain();
  delaySend.gain.value = 0.16;
  const delay = ctx.createDelay(1.0);
  delay.delayTime.value = 0.27;
  const fb = ctx.createGain();
  fb.gain.value = 0.28;
  const wet = ctx.createGain();
  wet.gain.value = 0.5;
  delaySend.connect(delay);
  delay.connect(fb);
  fb.connect(delay);
  delay.connect(wet);
  wet.connect(musicBus);

  // 1.2s of white noise, reused by every noisy voice.
  const len = Math.floor(ctx.sampleRate * 1.2);
  noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = noiseBuf.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

  if (AudioSys.muted) applyMute(true);
}

function applyMute(m) {
  if (!master) return;
  try {
    master.gain.cancelScheduledValues(0);
    if (m) {
      master.gain.value = 0;
      master.disconnect();
    } else {
      master.gain.value = MASTER_VOL;
      master.connect(compressor);
    }
  } catch (e) { /* never throw */ }
}

// ---------------------------------------------------------------------------
// Synth toolkit
// ---------------------------------------------------------------------------

// One oscillator voice with attack/decay envelope and optional pitch glide.
function tone(t, o) {
  const osc = ctx.createOscillator();
  osc.type = o.type || 'square';
  osc.frequency.setValueAtTime(Math.max(20, o.f0), t);
  if (o.f1 != null) {
    osc.frequency.exponentialRampToValueAtTime(
      Math.max(20, o.f1), t + (o.slide != null ? o.slide : o.dur));
  }
  const g = ctx.createGain();
  const vol = o.vol != null ? o.vol : 0.2;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + (o.attack || 0.006));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g);
  let head = g;
  if (o.filter) {
    const f = ctx.createBiquadFilter();
    f.type = o.filter.type || 'lowpass';
    f.Q.value = o.filter.q != null ? o.filter.q : 0.8;
    f.frequency.setValueAtTime(o.filter.f0, t);
    if (o.filter.f1 != null) {
      f.frequency.exponentialRampToValueAtTime(Math.max(40, o.filter.f1), t + o.dur);
    }
    g.connect(f);
    head = f;
  }
  head.connect(o.dest || sfxBus);
  osc.start(t);
  osc.stop(t + o.dur + 0.06);
  return osc;
}

// Filtered noise burst from the shared buffer.
function noise(t, o) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  src.playbackRate.value = o.rate || 1;
  const f = ctx.createBiquadFilter();
  f.type = o.type || 'highpass';
  f.Q.value = o.q != null ? o.q : 0.7;
  f.frequency.setValueAtTime(o.f0 || 2000, t);
  if (o.f1 != null) {
    f.frequency.exponentialRampToValueAtTime(Math.max(40, o.f1), t + o.dur);
  }
  const g = ctx.createGain();
  const vol = o.vol != null ? o.vol : 0.15;
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + (o.attack || 0.005));
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  src.connect(f).connect(g).connect(o.dest || sfxBus);
  src.start(t);
  src.stop(t + o.dur + 0.06);
}

// Springy "boing": oscillator whose pitch dips then rebounds, with a decaying
// wobble LFO for extra rubberiness.
function boing(t, o) {
  const osc = ctx.createOscillator();
  osc.type = o.type || 'sine';
  osc.frequency.setValueAtTime(o.f0, t);
  osc.frequency.exponentialRampToValueAtTime(o.fDip, t + o.dipT);
  osc.frequency.exponentialRampToValueAtTime(o.fUp, t + o.dur * 0.9);
  const lfo = ctx.createOscillator();
  lfo.type = 'sine';
  lfo.frequency.value = o.wobbleHz || 16;
  const lfoG = ctx.createGain();
  lfoG.gain.setValueAtTime(o.wobble || 40, t);
  lfoG.gain.exponentialRampToValueAtTime(1, t + o.dur);
  lfo.connect(lfoG).connect(osc.frequency);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(o.vol, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + o.dur);
  osc.connect(g).connect(o.dest || sfxBus);
  osc.start(t); lfo.start(t);
  osc.stop(t + o.dur + 0.05); lfo.stop(t + o.dur + 0.05);
}

// Tiny helper for jingles: melody note (square + envelope) into the SFX bus.
function jnote(t, midi, dur, vol, type) {
  tone(t, { type: type || 'square', f0: mtof(midi), dur, vol, attack: 0.005 });
}

// ---------------------------------------------------------------------------
// SFX recipes — every name in SFX_LIST. v = overall volume scalar (opts.vol).
// ---------------------------------------------------------------------------

const SYNTH = {
  jump(t, v) {
    tone(t, { type: 'triangle', f0: 260, f1: 540, dur: 0.13, vol: 0.2 * v });
    noise(t, { type: 'bandpass', f0: 1200, f1: 2400, dur: 0.08, vol: 0.04 * v, q: 1.2 });
  },

  // Airy upward blip + breath noise.
  shoot(t, v) {
    tone(t, { type: 'triangle', f0: 360, f1: 980, dur: 0.09, vol: 0.16 * v });
    tone(t, { type: 'square', f0: 720, f1: 1400, dur: 0.06, vol: 0.05 * v });
    noise(t, { type: 'bandpass', f0: 1600, f1: 3200, dur: 0.14, vol: 0.1 * v, q: 0.9, attack: 0.01 });
  },

  // Boingy wrap when a bubble swallows an enemy.
  trap(t, v) {
    boing(t, { type: 'sine', f0: 540, fDip: 180, fUp: 430, dipT: 0.07, dur: 0.26,
               vol: 0.22 * v, wobble: 30, wobbleHz: 14 });
    noise(t, { type: 'bandpass', f0: 900, f1: 400, dur: 0.12, vol: 0.05 * v, q: 1 });
  },

  // Bright "plock" + noise splash; rises along a pentatonic ladder with
  // opts.pitch (0..7) for combo escalation.
  pop(t, v, opts) {
    const p = clamp(Math.floor(opts.pitch || 0), 0, 7);
    const semis = [0, 2, 4, 7, 9, 12, 14, 16][p];
    const f = 620 * Math.pow(2, semis / 12);
    tone(t, { type: 'triangle', f0: f, f1: f * 1.6, dur: 0.09, vol: 0.26 * v, slide: 0.05 });
    tone(t, { type: 'square', f0: f * 2, f1: f * 2.7, dur: 0.05, vol: 0.07 * v });
    noise(t, { type: 'highpass', f0: 2800 + p * 250, dur: 0.06, vol: 0.12 * v });
  },

  // Descending wah.
  enemy_down(t, v) {
    tone(t, { type: 'square', f0: 660, f1: 130, dur: 0.34, vol: 0.16 * v,
              filter: { type: 'lowpass', f0: 2200, f1: 280, q: 4 } });
    tone(t, { type: 'triangle', f0: 330, f1: 80, dur: 0.3, vol: 0.1 * v });
  },

  // Sweet two-note ding (bell-ish sine pairs).
  pickup(t, v) {
    jnote(t, 83, 0.14, 0.14 * v, 'sine');           // B5
    tone(t, { type: 'sine', f0: mtof(83) * 2, dur: 0.1, vol: 0.04 * v });
    jnote(t + 0.09, 88, 0.3, 0.16 * v, 'sine');     // E6
    tone(t + 0.09, { type: 'sine', f0: mtof(88) * 2, dur: 0.18, vol: 0.05 * v });
  },

  // Ascending arpeggio.
  powerup(t, v) {
    const arp = [67, 72, 76, 79, 84, 88]; // G C E G C E
    for (let i = 0; i < arp.length; i++) {
      jnote(t + i * 0.055, arp[i], i === arp.length - 1 ? 0.3 : 0.1, 0.13 * v);
    }
  },

  // Fanfare arp.
  extra_life(t, v) {
    const arp = [72, 76, 79, 84, 88, 91]; // C E G C E G — up the major triad
    for (let i = 0; i < arp.length; i++) {
      const dur = i === arp.length - 1 ? 0.55 : 0.12;
      jnote(t + i * 0.09, arp[i], dur, 0.14 * v);
      jnote(t + i * 0.09, arp[i] - 12, dur, 0.06 * v, 'triangle');
    }
  },

  // Dissonant thud.
  hurt(t, v) {
    tone(t, { type: 'square', f0: 105, dur: 0.2, vol: 0.2 * v });
    tone(t, { type: 'square', f0: 112, dur: 0.2, vol: 0.16 * v }); // beats against 105
    noise(t, { type: 'lowpass', f0: 500, f1: 120, dur: 0.14, vol: 0.2 * v });
  },

  // Sad downward gliss.
  death(t, v) {
    const osc = tone(t, { type: 'triangle', f0: 640, f1: 95, dur: 0.85, vol: 0.2 * v });
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 7;
    const lg = ctx.createGain();
    lg.gain.setValueAtTime(4, t);
    lg.gain.linearRampToValueAtTime(26, t + 0.8);
    lfo.connect(lg).connect(osc.frequency);
    lfo.start(t); lfo.stop(t + 0.9);
    tone(t + 0.05, { type: 'sine', f0: 320, f1: 60, dur: 0.8, vol: 0.08 * v });
  },

  // Spring boing.
  bounce(t, v) {
    boing(t, { type: 'sine', f0: 170, fDip: 90, fUp: 440, dipT: 0.05, dur: 0.3,
               vol: 0.22 * v, wobble: 60, wobbleHz: 18 });
    boing(t, { type: 'triangle', f0: 340, fDip: 180, fUp: 880, dipT: 0.05, dur: 0.22,
               vol: 0.07 * v, wobble: 40, wobbleHz: 18 });
  },

  menu_move(t, v) {
    tone(t, { type: 'square', f0: 1500, dur: 0.035, vol: 0.1 * v });
    noise(t, { type: 'highpass', f0: 4000, dur: 0.02, vol: 0.05 * v });
  },

  menu_select(t, v) {
    tone(t, { type: 'square', f0: 660, dur: 0.06, vol: 0.13 * v });
    tone(t + 0.07, { type: 'square', f0: 990, dur: 0.12, vol: 0.13 * v });
  },

  // Short happy jingle, ~1.7 s.
  level_clear(t, v) {
    const L = [ // [offset, midi, dur]
      [0.00, 72, 0.11], [0.12, 76, 0.11], [0.24, 79, 0.11], [0.36, 84, 0.17],
      [0.56, 83, 0.11], [0.68, 81, 0.11], [0.80, 79, 0.15],
      [0.98, 84, 0.72],
    ];
    for (const [o, m, d] of L) jnote(t + o, m, d, 0.15 * v);
    // closing chord + bass
    jnote(t + 0.98, 76, 0.7, 0.06 * v);
    jnote(t + 0.98, 79, 0.7, 0.06 * v);
    jnote(t + 0.00, 48, 0.5, 0.16 * v, 'triangle');
    jnote(t + 0.56, 43, 0.4, 0.14 * v, 'triangle');
    jnote(t + 0.98, 48, 0.7, 0.16 * v, 'triangle');
    noise(t + 0.98, { type: 'highpass', f0: 5000, dur: 0.25, vol: 0.05 * v });
  },

  // Somber cadence, ~2 s.
  game_over(t, v) {
    const L = [
      [0.00, 76, 0.26], [0.30, 74, 0.26], [0.60, 72, 0.26], [0.90, 71, 0.26],
      [1.20, 69, 0.85],
    ];
    for (const [o, m, d] of L) jnote(t + o, m, d, 0.13 * v, 'triangle');
    jnote(t + 0.00, 45, 0.85, 0.15 * v, 'triangle'); // A2
    jnote(t + 0.90, 40, 0.28, 0.14 * v, 'triangle'); // E2
    jnote(t + 1.20, 45, 0.9, 0.15 * v, 'triangle');
    jnote(t + 1.20, 60, 0.9, 0.05 * v);              // quiet C over the final A minor
    jnote(t + 1.20, 64, 0.9, 0.05 * v);
  },

  // Urgent alarm motif.
  hurry(t, v) {
    for (let i = 0; i < 6; i++) {
      const hi = i % 2 === 0;
      tone(t + i * 0.09, { type: 'square', f0: hi ? 880 : 660, dur: 0.07,
                           vol: (hi ? 0.14 : 0.11) * v });
    }
    tone(t + 0.54, { type: 'square', f0: 988, dur: 0.16, vol: 0.14 * v });
  },

  // Metallic clang: inharmonic partials + bright noise.
  boss_hit(t, v) {
    const f = 420;
    for (const [ratio, g, d] of [[1, 0.16, 0.18], [1.83, 0.1, 0.14], [2.91, 0.07, 0.1]]) {
      tone(t, { type: 'square', f0: f * ratio, f1: f * ratio * 0.96, dur: d, vol: g * v });
    }
    noise(t, { type: 'highpass', f0: 3500, dur: 0.08, vol: 0.14 * v, q: 2 });
  },

  // Big triumphant hit.
  boss_down(t, v) {
    tone(t, { type: 'sine', f0: 220, f1: 52, dur: 0.5, vol: 0.3 * v });           // impact drop
    noise(t, { type: 'lowpass', f0: 6000, f1: 300, dur: 0.6, vol: 0.22 * v });    // crash
    const chord = [[0.3, 72], [0.3, 76], [0.3, 79], [0.45, 84]];                  // C major stab
    for (const [o, m] of chord) {
      jnote(t + o, m, 0.55, 0.1 * v);
      jnote(t + o, m - 12, 0.55, 0.05 * v, 'triangle');
    }
    noise(t + 0.45, { type: 'highpass', f0: 4500, dur: 0.3, vol: 0.06 * v });
  },

  // Score-tally tick.
  count(t, v) {
    tone(t, { type: 'square', f0: 1320, f1: 1480, dur: 0.04, vol: 0.11 * v });
    noise(t, { type: 'highpass', f0: 6000, dur: 0.02, vol: 0.04 * v });
  },
};

// ---------------------------------------------------------------------------
// Music — original chiptune compositions, lookahead step-sequencer.
// 16 steps per bar (16th notes, 4/4). Note data: [bar, step, midi, durSteps].
// All melodies below are original compositions for Bubble Caverns.
// ---------------------------------------------------------------------------

const STEPS_PER_BAR = 16;
const LOOKAHEAD = 0.12;   // seconds scheduled ahead
const TICK_MS = 25;       // sequencer timer
const FAST_MULT = 1.35;

// 'title' — "Cavern Lights": bouncy 8 bars, C major, 112 bpm.
const TITLE_LEAD = [
  [0, 0, 72, 2], [0, 4, 76, 2], [0, 8, 79, 2], [0, 12, 76, 2],
  [1, 0, 81, 2], [1, 4, 79, 2], [1, 8, 76, 2], [1, 12, 74, 2],
  [2, 0, 72, 2], [2, 4, 76, 2], [2, 8, 79, 2], [2, 12, 84, 2],
  [3, 0, 83, 2], [3, 4, 81, 2], [3, 8, 79, 5],
  [4, 0, 77, 2], [4, 4, 81, 2], [4, 8, 84, 2], [4, 12, 81, 2],
  [5, 0, 79, 2], [5, 4, 76, 2], [5, 8, 72, 2], [5, 12, 76, 2],
  [6, 0, 74, 2], [6, 4, 77, 2], [6, 8, 81, 2], [6, 12, 79, 2],
  [7, 0, 76, 2], [7, 4, 74, 2], [7, 8, 72, 6],
];
const TITLE_HARM = [
  [3, 0, 79, 2], [3, 4, 77, 2], [3, 8, 74, 5],
  [7, 0, 72, 2], [7, 4, 71, 2], [7, 8, 67, 6],
];
const TITLE_ROOTS = [48, 45, 48, 43, 41, 48, 43, 48]; // C Am C G F C G C

// 'main' — "Bubble Up!": catchy 16-bar call-and-response, G major, 126 bpm.
const MAIN_LEAD = [
  // A: call...
  [0, 0, 67, 2], [0, 2, 71, 2], [0, 4, 74, 2], [0, 6, 79, 2], [0, 8, 78, 2], [0, 10, 74, 2], [0, 12, 76, 4],
  // ...and response
  [1, 0, 74, 2], [1, 2, 72, 2], [1, 4, 71, 3], [1, 8, 69, 2], [1, 10, 71, 2], [1, 12, 72, 2], [1, 14, 69, 2],
  [2, 0, 67, 2], [2, 2, 71, 2], [2, 4, 74, 2], [2, 6, 79, 2], [2, 8, 81, 2], [2, 10, 79, 2], [2, 12, 78, 4],
  [3, 0, 76, 3], [3, 4, 74, 3], [3, 8, 71, 3], [3, 12, 67, 4],
  [4, 0, 69, 2], [4, 2, 72, 2], [4, 4, 76, 2], [4, 6, 81, 2], [4, 8, 79, 2], [4, 10, 76, 2], [4, 12, 74, 4],
  [5, 0, 72, 2], [5, 2, 71, 2], [5, 4, 69, 3], [5, 8, 67, 2], [5, 10, 69, 2], [5, 12, 71, 4],
  [6, 0, 74, 2], [6, 2, 78, 2], [6, 4, 81, 2], [6, 6, 83, 2], [6, 8, 81, 2], [6, 10, 78, 2], [6, 12, 79, 4],
  [7, 0, 76, 3], [7, 4, 72, 3], [7, 8, 69, 3], [7, 12, 74, 4],
  // B: lift
  [8, 0, 79, 1], [8, 2, 79, 1], [8, 4, 83, 3], [8, 8, 81, 2], [8, 10, 79, 2], [8, 12, 81, 2], [8, 14, 83, 2],
  [9, 0, 86, 3], [9, 4, 83, 3], [9, 8, 81, 2], [9, 10, 79, 2], [9, 12, 78, 4],
  [10, 0, 76, 1], [10, 2, 76, 1], [10, 4, 79, 3], [10, 8, 78, 2], [10, 10, 76, 2], [10, 12, 74, 2], [10, 14, 76, 2],
  [11, 0, 78, 3], [11, 4, 81, 3], [11, 8, 74, 3], [11, 12, 78, 4],
  // A': call returns, big cadence
  [12, 0, 67, 2], [12, 2, 71, 2], [12, 4, 74, 2], [12, 6, 79, 2], [12, 8, 78, 2], [12, 10, 74, 2], [12, 12, 76, 4],
  [13, 0, 74, 2], [13, 2, 72, 2], [13, 4, 71, 3], [13, 8, 69, 2], [13, 10, 71, 2], [13, 12, 72, 2], [13, 14, 69, 2],
  [14, 0, 76, 2], [14, 2, 78, 2], [14, 4, 79, 2], [14, 6, 81, 2], [14, 8, 83, 2], [14, 10, 81, 2], [14, 12, 79, 2], [14, 14, 74, 2],
  [15, 0, 71, 3], [15, 4, 72, 3], [15, 8, 67, 7],
];
const MAIN_HARM = [
  [1, 0, 71, 2], [1, 2, 69, 2], [1, 4, 67, 3], [1, 8, 66, 2], [1, 10, 67, 2], [1, 12, 69, 2], [1, 14, 66, 2],
  [3, 0, 72, 3], [3, 4, 71, 3], [3, 8, 67, 3], [3, 12, 62, 4],
  [7, 0, 72, 3], [7, 4, 69, 3], [7, 8, 66, 3], [7, 12, 71, 4],
  [9, 0, 79, 6], [9, 8, 74, 6],
  [11, 0, 69, 14],
  [13, 0, 71, 2], [13, 2, 69, 2], [13, 4, 67, 3], [13, 8, 66, 2], [13, 10, 67, 2], [13, 12, 69, 2], [13, 14, 66, 2],
  [15, 0, 67, 3], [15, 4, 69, 3], [15, 8, 62, 7],
];
const MAIN_ROOTS = [43, 40, 48, 50, 45, 40, 48, 50, 48, 43, 45, 50, 43, 40, 48, 43];

// 'boss' — "King Klonk's March": driving 8 bars, A minor, 140 bpm.
const BOSS_LEAD = [
  [0, 0, 69, 1], [0, 2, 69, 1], [0, 4, 72, 2], [0, 6, 71, 2], [0, 8, 69, 1], [0, 10, 69, 1], [0, 12, 76, 2], [0, 14, 75, 2],
  [1, 0, 74, 1], [1, 2, 74, 1], [1, 4, 77, 2], [1, 6, 76, 2], [1, 8, 74, 2], [1, 10, 72, 2], [1, 12, 71, 4],
  [2, 0, 69, 1], [2, 2, 69, 1], [2, 4, 72, 2], [2, 6, 71, 2], [2, 8, 69, 1], [2, 10, 69, 1], [2, 12, 76, 2], [2, 14, 77, 2],
  [3, 0, 76, 2], [3, 2, 75, 2], [3, 4, 74, 2], [3, 6, 72, 2], [3, 8, 71, 2], [3, 10, 69, 2], [3, 12, 68, 4],
  [4, 0, 81, 1], [4, 2, 81, 1], [4, 4, 84, 2], [4, 6, 83, 2], [4, 8, 81, 2], [4, 10, 79, 2], [4, 12, 77, 4],
  [5, 0, 76, 2], [5, 2, 77, 2], [5, 4, 76, 2], [5, 6, 74, 2], [5, 8, 72, 2], [5, 10, 71, 2], [5, 12, 72, 4],
  [6, 0, 69, 1], [6, 2, 69, 1], [6, 4, 72, 2], [6, 6, 71, 2], [6, 8, 69, 1], [6, 10, 69, 1], [6, 12, 76, 2], [6, 14, 77, 2],
  [7, 0, 76, 2], [7, 2, 75, 2], [7, 4, 74, 2], [7, 6, 73, 2], [7, 8, 72, 2], [7, 10, 71, 2], [7, 12, 69, 4],
];
// Boss harmony: low octave doubling of the riff bars for weight.
const BOSS_HARM = [];
for (const [b, s, m, d] of BOSS_LEAD) {
  if (b === 0 || b === 2 || b === 4 || b === 6) BOSS_HARM.push([b, s, m - 12, d]);
}
const BOSS_ROOTS = [45, 38, 45, 40, 41, 40, 45, 40]; // A D A E F E A E

// Bass figure generators: given a bar's root midi, return [step, midi, durSteps].
function bassOomPah(r) {
  return [[0, r, 2], [4, r + 7, 2], [8, r, 2], [12, r + 7, 2]];
}
function bassDriving(r) {
  const seq = [r, r, r + 12, r, r, r + 12, r, r + 7];
  return seq.map((m, i) => [i * 2, m, 1]);
}
function bassPound(r) {
  const seq = [r, r, r, r + 12, r, r, r + 12, r];
  return seq.map((m, i) => [i * 2, m, 1]);
}

function transpose(notes, semitones) {
  return notes.map(([bar, step, midi, dur]) => [bar, step, midi + semitones, dur]);
}

function transposeRoots(roots, semitones) {
  return roots.map(root => root + semitones);
}

// Four-channel tracker character: lead, bass, fast fifth/octave arpeggio and
// compact synthesized drums. Styles revoice the same hook for each cave set.
const MUSIC_STYLES = {
  title:   { lead: 'square',   bass: 'triangle', leadVol: 0.11, bassVol: 0.22, arpVol: 0.025 },
  moss:    { lead: 'square',   bass: 'triangle', leadVol: 0.12, bassVol: 0.25, arpVol: 0.035 },
  crystal: { lead: 'triangle', bass: 'square',   leadVol: 0.12, bassVol: 0.16, arpVol: 0.045 },
  gold:    { lead: 'square',   bass: 'triangle', leadVol: 0.13, bassVol: 0.27, arpVol: 0.05 },
  ember:   { lead: 'sawtooth', bass: 'square',   leadVol: 0.095, bassVol: 0.16, arpVol: 0.035 },
  abyss:   { lead: 'triangle', bass: 'sine',     leadVol: 0.12, bassVol: 0.28, arpVol: 0.025 },
  boss:    { lead: 'sawtooth', bass: 'square',   leadVol: 0.105, bassVol: 0.19, arpVol: 0.035 },
};

function drumsTitle(s) {
  if (s === 0 || s === 8) return ['kick'];
  if (s === 4 || s === 12) return ['snare'];
  return [];
}

function drumsArcade(s) {
  const hits = [];
  if (s === 0 || s === 8 || s === 10) hits.push('kick');
  if (s === 4 || s === 12) hits.push('snare');
  return hits;
}

function drumsBoss(s) {
  const hits = [];
  if (s === 0 || s === 3 || s === 8 || s === 10) hits.push('kick');
  if (s === 4 || s === 12) hits.push('snare');
  return hits;
}

// Hat figure: per step in a bar return [vol, durSec] or null.
function hatTitle(s) {
  if (s % 2 !== 0) return null;
  return s % 4 === 2 ? [0.2, 0.03] : [0.09, 0.025];
}
function hatMain(s) {
  if (s === 14) return [0.16, 0.07];                       // open-ish lift
  if (s % 4 === 0) return [0.18, 0.03];
  return s % 2 === 0 ? [0.1, 0.025] : [0.05, 0.02];
}
function hatBoss(s) {
  if (s === 6 || s === 14) return [0.18, 0.06];
  return s % 2 === 0 ? [0.22, 0.03] : [0.08, 0.02];
}

function compileTrack(bpm, bars, lead, harm, roots, bassFig, hatFig, drumFig, style) {
  const total = bars * STEPS_PER_BAR;
  const ev = [];
  for (let i = 0; i < total; i++) ev.push([]);
  for (const [b, s, m, d] of lead) ev[b * STEPS_PER_BAR + s].push({ k: 'lead', m, d });
  for (const [b, s, m, d] of harm) ev[b * STEPS_PER_BAR + s].push({ k: 'harm', m, d });
  for (let b = 0; b < bars; b++) {
    for (const [s, m, d] of bassFig(roots[b % roots.length])) {
      ev[b * STEPS_PER_BAR + s].push({ k: 'bass', m, d });
    }
    const root = roots[b % roots.length];
    for (let s = 0; s < STEPS_PER_BAR; s++) {
      const h = hatFig(s);
      if (h) ev[b * STEPS_PER_BAR + s].push({ k: 'hat', vol: h[0], dur: h[1] });
      if (s % 2 === 1) {
        const arp = [root + 12, root + 19, root + 24, root + 19][Math.floor(s / 2) % 4];
        ev[b * STEPS_PER_BAR + s].push({ k: 'arp', m: arp, d: 1 });
      }
      for (const drum of drumFig(s)) ev[b * STEPS_PER_BAR + s].push({ k: drum });
    }
  }
  return { bpm, total, ev, style };
}

const MOSS_TRACK = compileTrack(128, 16, MAIN_LEAD, MAIN_HARM, MAIN_ROOTS, bassDriving, hatMain, drumsArcade, MUSIC_STYLES.moss);
const TRACKS = {
  title: compileTrack(116, 8, TITLE_LEAD, TITLE_HARM, TITLE_ROOTS, bassOomPah, hatTitle, drumsTitle, MUSIC_STYLES.title),
  main: MOSS_TRACK, // backwards-compatible alias
  moss: MOSS_TRACK,
  crystal: compileTrack(134, 16, transpose(MAIN_LEAD, 5), transpose(MAIN_HARM, 5), transposeRoots(MAIN_ROOTS, 5), bassDriving, hatMain, drumsArcade, MUSIC_STYLES.crystal),
  gold: compileTrack(124, 16, transpose(MAIN_LEAD, 2), transpose(MAIN_HARM, 2), transposeRoots(MAIN_ROOTS, 2), bassOomPah, hatMain, drumsArcade, MUSIC_STYLES.gold),
  ember: compileTrack(138, 16, transpose(MAIN_LEAD, -2), transpose(MAIN_HARM, -2), transposeRoots(MAIN_ROOTS, -2), bassDriving, hatBoss, drumsArcade, MUSIC_STYLES.ember),
  abyss: compileTrack(118, 16, transpose(MAIN_LEAD, -5), transpose(MAIN_HARM, -5), transposeRoots(MAIN_ROOTS, -5), bassOomPah, hatTitle, drumsArcade, MUSIC_STYLES.abyss),
  boss: compileTrack(144, 8, BOSS_LEAD, BOSS_HARM, BOSS_ROOTS, bassPound, hatBoss, drumsBoss, MUSIC_STYLES.boss),
};

// --- sequencer state ---
let song = null;        // { name, track, step, nextTime, gain, timer }
let fastMode = false;   // current tempo multiplier active?
let pendingFast = null; // requested change, applied at next bar boundary
let wantTrack = null;   // track requested before unlock — started on unlock

function stepDur(track) {
  return 15 / (track.bpm * (fastMode ? FAST_MULT : 1)); // 60/bpm/4
}

function musicNote(t, midi, durSec, kind) {
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  let vol, type, send = false;
  const style = song.track.style || MUSIC_STYLES.moss;
  if (kind === 'lead') { type = style.lead; vol = style.leadVol; send = true; }
  else if (kind === 'harm') { type = 'square'; vol = style.leadVol * 0.38; }
  else if (kind === 'arp') { type = 'square'; vol = style.arpVol; durSec *= 0.52; }
  else { type = style.bass; vol = style.bassVol; durSec *= 0.78; } // tracker-staccato bass
  o.type = type;
  o.frequency.value = mtof(midi);
  if (kind === 'harm') o.detune.value = 5; // gentle chorus against the lead
  const sus = Math.max(0.02, durSec - 0.035);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.006);
  g.gain.setValueAtTime(vol, t + sus);
  g.gain.exponentialRampToValueAtTime(0.0001, t + durSec);
  o.connect(g).connect(song.gain);
  if (send && delaySend) g.connect(delaySend);
  o.start(t);
  o.stop(t + durSec + 0.03);
}

function musicKick(t) {
  tone(t, { type: 'sine', f0: 125, f1: 42, slide: 0.11, dur: 0.14, vol: 0.26, dest: song.gain });
}

function musicSnare(t) {
  noise(t, { type: 'highpass', f0: 1800, f1: 5200, dur: 0.09, vol: 0.12, dest: song.gain });
  tone(t, { type: 'triangle', f0: 185, f1: 120, dur: 0.08, vol: 0.07, dest: song.gain });
}

function musicHat(t, vol, dur) {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuf;
  src.loop = true;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 6500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f).connect(g).connect(song.gain);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function scheduleStep(track, step, t, sd) {
  for (const e of track.ev[step]) {
    if (e.k === 'hat') musicHat(t, e.vol, e.dur);
    else if (e.k === 'kick') musicKick(t);
    else if (e.k === 'snare') musicSnare(t);
    else musicNote(t, e.m, e.d * sd, e.k);
  }
}

function seqTick() {
  try {
    if (!song || !ctx) return;
    if (ctx.state !== 'running') return;
    // If the tab was suspended, jump forward instead of bursting catch-up notes.
    if (song.nextTime < ctx.currentTime - 0.05) {
      song.nextTime = ctx.currentTime + 0.02;
    }
    const track = song.track;
    while (song.nextTime < ctx.currentTime + LOOKAHEAD) {
      if (song.step % STEPS_PER_BAR === 0 && pendingFast !== null) {
        fastMode = pendingFast;       // clean tempo switch at the bar line
        pendingFast = null;
      }
      const sd = stepDur(track);
      scheduleStep(track, song.step, song.nextTime, sd);
      song.nextTime += sd;
      song.step = (song.step + 1) % track.total;
    }
  } catch (e) { /* never throw */ }
}

function startSong(name) {
  fastMode = false;       // every track starts at normal tempo
  pendingFast = null;
  const g = ctx.createGain();
  g.gain.value = 1;
  g.connect(musicBus);
  song = {
    name,
    track: TRACKS[name],
    step: 0,
    nextTime: ctx.currentTime + 0.06,
    gain: g,
    timer: setInterval(seqTick, TICK_MS),
  };
  seqTick();
}

function stopSong() {
  if (!song) return;
  const s = song;
  song = null;
  pendingFast = null;
  try { clearInterval(s.timer); } catch (e) {}
  try {
    if (ctx) {
      const t = ctx.currentTime;
      s.gain.gain.cancelScheduledValues(t);
      s.gain.gain.setValueAtTime(s.gain.gain.value, t);
      s.gain.gain.linearRampToValueAtTime(0.0001, t + 0.05);
      setTimeout(() => { try { s.gain.disconnect(); } catch (e) {} }, 250);
    } else {
      s.gain.disconnect();
    }
  } catch (e) {}
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export const AudioSys = {
  muted: false,

  // Safe to call early; creates nothing audible (no AudioContext yet).
  init() { /* all data is prebuilt at module load; nothing to do */ },

  // Call on first user gesture. Creates/resumes the AudioContext.
  unlock() {
    try {
      if (!ctx) {
        const AC = (typeof window !== 'undefined') &&
          (window.AudioContext || window.webkitAudioContext);
        if (!AC) return;
        ctx = new AC();
        buildGraph();
      }
      if (ctx.state !== 'running') {
        const p = ctx.resume();
        if (p && p.catch) p.catch(() => {});
      }
      unlocked = true;
      // a track requested before unlock starts now (e.g. title music at boot)
      if (wantTrack && !song) startSong(wantTrack);
    } catch (e) { /* never throw */ }
  },

  // Fire-and-forget SFX. Silent no-op before unlock; never throws.
  play(name, opts = {}) {
    try {
      const fn = SYNTH[name];
      if (!fn) {
        if (!warned.has(name)) {
          warned.add(name);
          console.warn(`AudioSys: unknown SFX '${name}'`);
        }
        return;
      }
      if (!ready()) return;
      const vol = clamp(opts.vol != null ? opts.vol : 1, 0, 1);
      fn(ctx.currentTime + 0.001, vol, opts);
    } catch (e) { /* never throw */ }
  },

  music: {
    // title, five cave themes, or boss — restarts only if different.
    play(track) {
      try {
        if (!TRACKS[track]) {
          if (!warned.has('music:' + track)) {
            warned.add('music:' + track);
            console.warn(`AudioSys: unknown music track '${track}'`);
          }
          return;
        }
        wantTrack = track;             // remembered so unlock can start it
        if (!ctx || !unlocked) return; // silent no-op before unlock
        if (song && song.name === track) return;
        stopSong();
        startSong(track);
      } catch (e) { /* never throw */ }
    },

    // Tempo ×1.35; switches cleanly at the next bar boundary while playing.
    setFast(fast) {
      try {
        const f = !!fast;
        if (song && ctx) {
          if (f !== fastMode) pendingFast = f;
          else pendingFast = null;
        } else {
          fastMode = f;
          pendingFast = null;
        }
      } catch (e) { /* never throw */ }
    },

    stop() {
      try { wantTrack = null; stopSong(); } catch (e) { /* never throw */ }
    },
  },

  // Master mute: zeroes AND disconnects the master gain.
  setMuted(m) {
    try {
      this.muted = !!m;
      applyMute(this.muted);
    } catch (e) { /* never throw */ }
  },
};

export default AudioSys;
