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
const MUSIC_VOL = 0.58;  // clearly audible, while still below gameplay SFX

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

// 'title' — "Quarter Past Pixel": syncopated 8 bars, A minor, 116 bpm.
const TITLE_LEAD = [
  [0, 0, 76, 1], [0, 3, 79, 1], [0, 6, 81, 2], [0, 10, 84, 1], [0, 12, 83, 1], [0, 14, 79, 2],
  [1, 0, 76, 2], [1, 5, 74, 1], [1, 7, 76, 1], [1, 9, 79, 2], [1, 13, 71, 3],
  [2, 0, 72, 1], [2, 2, 76, 1], [2, 5, 79, 1], [2, 8, 84, 2], [2, 11, 81, 1], [2, 14, 79, 2],
  [3, 0, 77, 2], [3, 4, 76, 1], [3, 6, 74, 1], [3, 9, 72, 2], [3, 13, 71, 3],
  [4, 0, 81, 1], [4, 3, 84, 1], [4, 6, 88, 2], [4, 10, 86, 1], [4, 12, 84, 1], [4, 14, 81, 2],
  [5, 0, 79, 2], [5, 5, 76, 1], [5, 7, 79, 1], [5, 9, 81, 2], [5, 13, 83, 3],
  [6, 0, 84, 1], [6, 2, 83, 1], [6, 4, 81, 1], [6, 7, 79, 1], [6, 10, 76, 2], [6, 14, 74, 2],
  [7, 0, 76, 1], [7, 3, 79, 1], [7, 6, 72, 2], [7, 10, 71, 1], [7, 12, 69, 4],
];
const TITLE_HARM = [
  [1, 0, 69, 2], [1, 9, 72, 2], [1, 13, 67, 3],
  [3, 0, 69, 2], [3, 9, 65, 2], [3, 13, 67, 3],
  [5, 0, 76, 2], [5, 9, 77, 2], [5, 13, 79, 3],
  [7, 0, 72, 1], [7, 3, 76, 1], [7, 6, 69, 2], [7, 10, 67, 1], [7, 12, 64, 4],
];
const TITLE_ROOTS = [45, 43, 48, 41, 45, 43, 40, 45]; // Am G C F Am G Em Am

// Gameplay — "Pocket Reactor": an entirely new 8-bar E-minor tracker hook.
// It deliberately uses short off-beat cells and rests rather than the old
// continuous G-major scale runs. The phrase repeats with an octave lift.
const MAIN_PHRASE = [
  [0, 0, 71, 1], [0, 3, 74, 1], [0, 5, 76, 2], [0, 9, 74, 1], [0, 11, 71, 1], [0, 14, 67, 2],
  [1, 0, 64, 2], [1, 4, 67, 1], [1, 6, 71, 1], [1, 8, 74, 2], [1, 12, 76, 1], [1, 14, 74, 2],
  [2, 0, 79, 1], [2, 2, 78, 1], [2, 5, 76, 1], [2, 7, 74, 1], [2, 10, 71, 2], [2, 14, 74, 2],
  [3, 0, 76, 2], [3, 4, 71, 1], [3, 6, 69, 1], [3, 9, 67, 2], [3, 13, 66, 3],
  [4, 0, 71, 1], [4, 3, 74, 1], [4, 5, 79, 2], [4, 9, 78, 1], [4, 11, 74, 1], [4, 14, 71, 2],
  [5, 0, 69, 2], [5, 4, 72, 1], [5, 6, 76, 1], [5, 8, 81, 2], [5, 12, 79, 1], [5, 14, 76, 2],
  [6, 0, 83, 1], [6, 2, 81, 1], [6, 4, 79, 1], [6, 7, 76, 1], [6, 10, 74, 2], [6, 14, 71, 2],
  [7, 0, 74, 1], [7, 3, 71, 1], [7, 6, 67, 2], [7, 10, 66, 1], [7, 12, 64, 4],
];
const MAIN_HARM_PHRASE = [
  [1, 0, 59, 2], [1, 8, 67, 2], [1, 12, 69, 1], [1, 14, 67, 2],
  [3, 0, 64, 2], [3, 9, 59, 2], [3, 13, 57, 3],
  [5, 0, 60, 2], [5, 8, 69, 2], [5, 12, 67, 1], [5, 14, 64, 2],
  [7, 0, 67, 1], [7, 3, 64, 1], [7, 6, 59, 2], [7, 10, 57, 1], [7, 12, 59, 4],
];
const MAIN_LEAD = [
  ...MAIN_PHRASE,
  ...MAIN_PHRASE.map(([bar, step, midi, dur]) => [bar + 8, step, midi + (bar >= 4 ? 12 : 0), dur]),
];
const MAIN_HARM = [
  ...MAIN_HARM_PHRASE,
  ...MAIN_HARM_PHRASE.map(([bar, step, midi, dur]) => [bar + 8, step, midi, dur]),
];
const MAIN_ROOTS = [40, 43, 45, 47, 40, 48, 43, 47, 40, 43, 45, 47, 40, 48, 43, 40];

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

// Sound colours used by both the legacy sequencer helpers and the atmospheric
// score. Gameplay uses the ambient volumes: slow pads, a low drone and sparse
// bell-like echoes, leaving space for the effects that matter to play.
const MUSIC_STYLES = {
  title:   { lead: 'triangle', bass: 'sine', leadVol: 0.08, bassVol: 0.11, arpVol: 0.018, padVol: 0.060, droneVol: 0.095, bellVol: 0.065 },
  moss:    { lead: 'triangle', bass: 'sine', leadVol: 0.08, bassVol: 0.11, arpVol: 0.018, padVol: 0.066, droneVol: 0.105, bellVol: 0.056 },
  crystal: { lead: 'sine', bass: 'sine', leadVol: 0.08, bassVol: 0.10, arpVol: 0.020, padVol: 0.055, droneVol: 0.085, bellVol: 0.078 },
  gold:    { lead: 'triangle', bass: 'sine', leadVol: 0.08, bassVol: 0.11, arpVol: 0.020, padVol: 0.064, droneVol: 0.095, bellVol: 0.068 },
  ember:   { lead: 'triangle', bass: 'sine', leadVol: 0.08, bassVol: 0.12, arpVol: 0.018, padVol: 0.058, droneVol: 0.115, bellVol: 0.052 },
  abyss:   { lead: 'sine', bass: 'sine', leadVol: 0.07, bassVol: 0.12, arpVol: 0.016, padVol: 0.052, droneVol: 0.125, bellVol: 0.045 },
  boss:    { lead: 'triangle', bass: 'sine', leadVol: 0.08, bassVol: 0.13, arpVol: 0.018, padVol: 0.060, droneVol: 0.135, bellVol: 0.055 },
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

// Ambient score: one chord per slow bar, with a sustained sub-root and only
// two high echoes per bar. Chords are arrays of MIDI notes; the first note is
// also used for the drone. There is deliberately no percussion or repeating
// lead melody during normal play.
function compileAmbientTrack(bpm, chords, style, bossPulse = false) {
  const total = chords.length * STEPS_PER_BAR;
  const ev = Array.from({ length: total }, () => []);
  chords.forEach((chord, bar) => {
    const base = bar * STEPS_PER_BAR;
    const root = chord[0];
    ev[base].push({ k: 'drone', m: root - 12, d: 15.5 });
    for (const note of chord) ev[base].push({ k: 'pad', m: note, d: 15.5 });
    ev[base + 6].push({ k: 'bell', m: chord[2] + 12, d: 5 });
    ev[base + 13].push({ k: 'bell', m: chord[1] + 12, d: 3 });
    if (bossPulse) {
      for (const step of [0, 4, 8, 12]) ev[base + step].push({ k: 'pulse', m: root - 12, d: 2.3 });
    }
  });
  return { bpm, total, ev, style };
}

const TRACKS = {
  title: compileAmbientTrack(54, [[57, 60, 64], [53, 57, 60], [55, 59, 62], [52, 55, 59]], MUSIC_STYLES.title),
  main: compileAmbientTrack(50, [[52, 55, 59], [48, 52, 55], [50, 53, 57], [47, 50, 54]], MUSIC_STYLES.moss),
  moss: compileAmbientTrack(50, [[52, 55, 59], [48, 52, 55], [50, 53, 57], [47, 50, 54]], MUSIC_STYLES.moss),
  crystal: compileAmbientTrack(46, [[57, 60, 64], [55, 59, 62], [60, 64, 67], [52, 57, 60]], MUSIC_STYLES.crystal),
  gold: compileAmbientTrack(52, [[53, 57, 60], [48, 53, 57], [55, 59, 62], [52, 55, 60]], MUSIC_STYLES.gold),
  ember: compileAmbientTrack(48, [[52, 55, 58], [49, 52, 56], [50, 53, 57], [47, 52, 55]], MUSIC_STYLES.ember),
  abyss: compileAmbientTrack(42, [[47, 50, 54], [43, 47, 50], [45, 48, 52], [42, 47, 49]], MUSIC_STYLES.abyss),
  boss: compileAmbientTrack(58, [[45, 48, 52], [44, 47, 51], [41, 45, 48], [40, 44, 47]], MUSIC_STYLES.boss, true),
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
  let vol, type, send = false, attack = 0.006, release = 0.035;
  const style = song.track.style || MUSIC_STYLES.moss;
  if (kind === 'pad') { type = 'triangle'; vol = style.padVol; attack = 0.65; release = 0.8; send = true; }
  else if (kind === 'drone') { type = 'sine'; vol = style.droneVol; attack = 0.9; release = 1.0; }
  else if (kind === 'bell') { type = 'sine'; vol = style.bellVol; attack = 0.025; release = Math.min(0.9, durSec * 0.7); send = true; }
  else if (kind === 'pulse') { type = 'sine'; vol = style.droneVol * 0.7; attack = 0.04; release = durSec * 0.65; }
  else if (kind === 'lead') { type = style.lead; vol = style.leadVol; send = true; }
  else if (kind === 'harm') { type = 'square'; vol = style.leadVol * 0.38; }
  else if (kind === 'arp') { type = 'square'; vol = style.arpVol; durSec *= 0.52; }
  else { type = style.bass; vol = style.bassVol; durSec *= 0.78; } // tracker-staccato bass
  o.type = type;
  o.frequency.value = mtof(midi);
  if (kind === 'harm') o.detune.value = 5; // gentle chorus against the lead
  const sus = Math.max(attack + 0.02, durSec - release);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + Math.min(attack, durSec * 0.4));
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
      unlocked = true;
      // Create and schedule the requested track during the user gesture. This
      // is important on iOS Safari, where waiting for a timer after resume can
      // leave an otherwise valid AudioContext silent.
      if (wantTrack && !song) startSong(wantTrack);
      if (ctx.state !== 'running') {
        const p = ctx.resume();
        if (p && p.then) p.then(() => seqTick()).catch(() => {});
      }
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

  // Read-only diagnostics used by the test harness.
  debugState() {
    return {
      unlocked,
      contextState: ctx ? ctx.state : 'missing',
      track: song ? song.name : wantTrack,
      scheduled: !!song,
      muted: this.muted,
      masterVolume: MASTER_VOL,
      musicVolume: MUSIC_VOL,
    };
  },
};

export default AudioSys;
