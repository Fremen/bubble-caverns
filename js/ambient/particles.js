/* particles.js — Bubble Caverns particle system + trauma screen shake.
 *
 * Zero-dependency browser ES module. Implements docs/CONTRACTS.md §Particles.
 *
 * Object-pooled: a fixed pool of CAP (800) particle objects is pre-allocated
 * at module load. The pool array is partitioned — indices [0, count) are live,
 * [count, CAP) are the free list. Spawning takes the first free slot; death
 * swap-removes back into the free tail. Steady-state update()/draw() perform
 * zero allocations (no strings, arrays, objects, or closures are created).
 *
 * All animation is driven by an internal clock T advanced only by update(dt);
 * wall-clock time is never read in the hot path.
 */

const CAP = 800;
const TAU = Math.PI * 2;

/* ---------------------------------------------------------------- kinds */
const K_RING = 0;     // pop: expanding glossy ring (glow)
const K_DROP = 1;     // pop: glossy droplet with gravity
const K_GLINT = 2;    // pop: star glint cross (glow)
const K_BURST = 3;    // generic radial burst dot (glow optional)
const K_SPARK = 4;    // sparkle: tiny twinkle cross (glow)
const K_COLLECT = 5;  // pickup: glint swirling inward/upward (glow)
const K_CONFETTI = 6; // fluttering colored rect
const K_DUST = 7;     // soft gray expanding puff
const K_TEXT = 8;     // floating outlined score text
const K_MOTE = 9;     // ambient theme mote (glow)

/* ------------------------------------------------------------- palettes */
const CONFETTI_COLORS = ['#ff5d73', '#ffd166', '#7ae582', '#4cc9f0', '#c77dff', '#ff9e6d', '#ffffff'];
const BURST_DEFAULT = ['#ffffff', '#cfe9ff'];
const MOSS_COLORS = ['#56e0b8', '#8df0d0', '#3fc9a0'];
const CRYSTAL_COLORS = ['#86f0ff', '#ffa8e8', '#c8f7ff'];
const EMBER_COLORS = ['#ffb14e', '#ff7b3a', '#ffd98a'];
const ABYSS_COLORS = ['#aab6cc', '#cdd6e6'];
const GOLD_COLORS = ['#ffe26b', '#fff6c0', '#ffc94d'];
const MOTE_RATE = { moss: 4, crystal: 5, ember: 6, abyss: 3, gold: 5 };

/* ----------------------------------------------------------------- pool */
class P {
  constructor() {
    this.kind = 0; this.glow = false;
    this.x = 0; this.y = 0; this.vx = 0; this.vy = 0;
    this.g = 0; this.drag = 0;
    this.life = 0; this.maxLife = 1;
    this.size = 1; this.grow = 0; this.size2 = 0;
    this.rot = 0; this.vr = 0;
    this.phase = 0; this.freq = 0; this.amp = 0;
    this.ox = 0; this.oy = 0;
    this.color = '#ffffff';
    this.str = ''; this.font = '';
  }
}

const pool = new Array(CAP);
for (let i = 0; i < CAP; i++) pool[i] = new P();
let count = 0;       // live particles occupy pool[0..count)
let T = 0;           // internal clock (seconds), advanced only in update()
let ambientAcc = 0;  // fractional ambient-spawn accumulator

function rand(a, b) { return a + Math.random() * (b - a); }
function irand(a, b) { return (a + Math.random() * (b - a + 1)) | 0; }
function pick(arr) { return arr[(Math.random() * arr.length) | 0]; }

/** Take a particle from the free tail; null when the pool is exhausted. */
function spawn(kind, glow) {
  if (count >= CAP) return null;
  const p = pool[count++];
  p.kind = kind; p.glow = glow;
  p.vx = 0; p.vy = 0; p.g = 0; p.drag = 0;
  p.grow = 0; p.size2 = 0; p.rot = 0; p.vr = 0;
  p.phase = 0; p.freq = 0; p.amp = 0;
  p.ox = 0; p.oy = 0; p.str = ''; p.font = '';
  return p;
}

/* --------------------------------------------------------------- update */
function updateOne(p, dt) {
  switch (p.kind) {
    case K_RING:
      p.size += p.grow * dt;
      break;
    case K_DROP:
    case K_BURST:
    case K_GLINT: {
      p.vy += p.g * dt;
      const d = 1 - p.drag * dt;
      if (d > 0) { p.vx *= d; p.vy *= d; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      break;
    }
    case K_SPARK:
      p.x += p.vx * dt; p.y += p.vy * dt;
      break;
    case K_COLLECT:
      p.oy -= p.vy * dt;                       // swirl center rises
      p.size2 -= p.grow * dt;                  // orbit radius shrinks inward
      if (p.size2 < 0) p.size2 = 0;
      p.phase += p.vr * dt;                    // spiral
      p.x = p.ox + Math.cos(p.phase) * p.size2;
      p.y = p.oy + Math.sin(p.phase) * p.size2 * 0.6;
      break;
    case K_CONFETTI: {
      p.vy += p.g * dt;
      if (p.vy > 170) p.vy = 170;              // fluttery terminal fall
      const d = 1 - p.drag * dt;
      if (d > 0) p.vx *= d;
      p.x += (p.vx + Math.sin(T * p.freq + p.phase) * p.amp) * dt; // sway
      p.y += p.vy * dt;
      p.rot += p.vr * dt;
      break;
    }
    case K_DUST: {
      const d = 1 - 2.4 * dt;
      if (d > 0) { p.vx *= d; p.vy *= d; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.size += p.grow * dt;                   // puff expands
      break;
    }
    case K_TEXT: {
      const d = 1 - 1.6 * dt;
      if (d > 0) p.vy *= d;                    // drift eases out
      p.y += p.vy * dt;
      break;
    }
    case K_MOTE:
      p.x += (p.vx + Math.sin(T * p.freq + p.phase) * p.amp) * dt;
      p.y += p.vy * dt;
      break;
  }
}

/* ----------------------------------------------------------------- draw */
function drawOne(ctx, p) {
  const f = p.life / p.maxLife; // 1 -> 0
  switch (p.kind) {
    case K_RING: {
      ctx.globalAlpha = f * 0.9;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = Math.max(1, p.size2 * f);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.stroke();
      // glossy highlight arc (upper-left)
      ctx.globalAlpha = f;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = Math.max(1, p.size2 * f * 0.55);
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, -2.4, -1.2); ctx.stroke();
      break;
    }
    case K_DROP: {
      ctx.globalAlpha = f;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      ctx.globalAlpha = f * 0.8;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(p.x - p.size * 0.3, p.y - p.size * 0.3, p.size * 0.35, 0, TAU);
      ctx.fill();
      break;
    }
    case K_GLINT:
    case K_SPARK: {
      const tw = 0.55 + 0.45 * Math.sin(T * p.freq + p.phase);
      const r = p.size * (0.5 + f * 0.5) * tw + 0.5;
      ctx.globalAlpha = f * tw;
      ctx.strokeStyle = p.color;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(p.x - r, p.y); ctx.lineTo(p.x + r, p.y);
      ctx.moveTo(p.x, p.y - r); ctx.lineTo(p.x, p.y + r);
      if (p.kind === K_GLINT) {
        const d = r * 0.45;
        ctx.moveTo(p.x - d, p.y - d); ctx.lineTo(p.x + d, p.y + d);
        ctx.moveTo(p.x + d, p.y - d); ctx.lineTo(p.x - d, p.y + d);
      }
      ctx.stroke();
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, r * 0.3, 0, TAU); ctx.fill();
      break;
    }
    case K_BURST: {
      const r = p.size * (0.45 + 0.55 * f);
      if (p.glow) {
        ctx.globalAlpha = f * 0.35;
        ctx.fillStyle = p.color;
        ctx.beginPath(); ctx.arc(p.x, p.y, r * 2.4, 0, TAU); ctx.fill();
      }
      ctx.globalAlpha = f;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, r, 0, TAU); ctx.fill();
      break;
    }
    case K_COLLECT: {
      const tw = 0.6 + 0.4 * Math.sin(T * p.freq + p.phase * 2.3);
      ctx.fillStyle = p.color;
      ctx.globalAlpha = f * tw * 0.45;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2.4, 0, TAU); ctx.fill();
      ctx.globalAlpha = f * tw;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      break;
    }
    case K_CONFETTI: {
      ctx.globalAlpha = f < 0.3 ? f / 0.3 : 1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.rotate(p.rot);
      // tumbling foreshorten on the short axis
      const h = p.size * 0.55 * (0.35 + 0.65 * Math.abs(Math.sin(T * p.freq * 0.7 + p.phase)));
      ctx.fillStyle = p.color;
      ctx.fillRect(-p.size * 0.5, -h * 0.5, p.size, h);
      ctx.restore();
      break;
    }
    case K_DUST: {
      ctx.globalAlpha = f * 0.45;
      ctx.fillStyle = p.color;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      break;
    }
    case K_TEXT: {
      const age = p.maxLife - p.life;
      // pop-in with overshoot (easeOutBack over first 0.16 s)
      let s = 1;
      const t = age / 0.16;
      if (t < 1) {
        const u = t - 1;
        s = 1 + 3.55 * u * u * u + 2.55 * u * u;
      }
      ctx.globalAlpha = f < 0.45 ? f / 0.45 : 1;
      ctx.save();
      ctx.translate(p.x, p.y);
      ctx.scale(s, s);
      ctx.font = p.font;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.lineWidth = Math.max(2, p.size * 0.16);
      ctx.strokeStyle = '#141022';
      ctx.strokeText(p.str, 0, 0);
      ctx.fillStyle = p.color;
      ctx.fillText(p.str, 0, 0);
      ctx.restore();
      break;
    }
    case K_MOTE: {
      const age = p.maxLife - p.life;
      let a = age < 0.4 ? age / 0.4 : 1;              // fade in
      if (p.life < 0.6) a *= p.life / 0.6;            // fade out
      const tw = p.vr > 0 ? 0.55 + 0.45 * Math.sin(T * p.vr + p.phase * 1.7) : 1;
      a *= tw * p.size2;                               // size2 = base alpha
      ctx.fillStyle = p.color;
      ctx.globalAlpha = a * 0.35;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size * 2.6, 0, TAU); ctx.fill();
      ctx.globalAlpha = a;
      ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, TAU); ctx.fill();
      break;
    }
  }
}

/* ----------------------------------------------------- ambient spawning */
function spawnMote(theme, w, h) {
  const p = spawn(K_MOTE, true);
  if (!p) return;
  p.x = rand(0, w);
  switch (theme) {
    case 'moss': // teal spores drifting up
      p.y = rand(h * 0.35, h * 1.02);
      p.vy = -rand(10, 26); p.vx = rand(-4, 4);
      p.amp = rand(4, 10); p.freq = rand(0.8, 1.6); p.phase = rand(0, TAU);
      p.vr = rand(2, 5);
      p.maxLife = p.life = rand(3, 5.5);
      p.size = rand(1.4, 2.8); p.size2 = rand(0.5, 0.85);
      p.color = pick(MOSS_COLORS);
      break;
    case 'crystal': // cyan/pink glints, near-stationary twinkle
      p.y = rand(0, h);
      p.vy = rand(-8, 8); p.vx = rand(-5, 5);
      p.vr = rand(8, 14); p.phase = rand(0, TAU);
      p.maxLife = p.life = rand(1.6, 3);
      p.size = rand(1.5, 3); p.size2 = rand(0.6, 1);
      p.color = pick(CRYSTAL_COLORS);
      break;
    case 'ember': // rising orange embers with flickery sway
      p.y = rand(h * 0.75, h * 1.05);
      p.vy = -rand(45, 95); p.vx = rand(-6, 6);
      p.amp = rand(8, 18); p.freq = rand(2, 4); p.phase = rand(0, TAU);
      p.vr = rand(6, 11);
      p.maxLife = p.life = rand(1.8, 3.2);
      p.size = rand(1.4, 2.6); p.size2 = rand(0.7, 1);
      p.color = pick(EMBER_COLORS);
      break;
    case 'abyss': // pale slow dust sinking
      p.y = rand(0, h);
      p.vy = rand(4, 12); p.vx = rand(-6, 6);
      p.amp = rand(2, 5); p.freq = rand(0.5, 1); p.phase = rand(0, TAU);
      p.maxLife = p.life = rand(4, 6.5);
      p.size = rand(1.3, 2.6); p.size2 = rand(0.3, 0.5);
      p.color = pick(ABYSS_COLORS);
      break;
    case 'gold': // golden sparkles drifting gently up
      p.y = rand(0, h);
      p.vy = -rand(5, 18); p.vx = rand(-4, 4);
      p.vr = rand(10, 18); p.phase = rand(0, TAU);
      p.maxLife = p.life = rand(2, 3.5);
      p.size = rand(1.4, 2.8); p.size2 = rand(0.6, 0.95);
      p.color = pick(GOLD_COLORS);
      break;
    default: // fail soft: faint neutral dust
      p.y = rand(0, h);
      p.vy = rand(-8, 8); p.vx = rand(-4, 4);
      p.maxLife = p.life = rand(2, 4);
      p.size = rand(1.4, 2.4); p.size2 = 0.4;
      p.color = '#c8cdd6';
      break;
  }
}

/* ============================================================ Particles */
export const Particles = {
  /** Live particle count (read-only; handy for dev/debug HUDs). */
  get count() { return count; },

  clear() {
    count = 0;
    ambientAcc = 0;
  },

  update(dt) {
    T += dt;
    for (let i = 0; i < count; ) {
      const p = pool[i];
      p.life -= dt;
      if (p.life <= 0) {
        // swap-remove: dead particle returns to the free tail
        count--;
        pool[i] = pool[count];
        pool[count] = p;
        continue; // re-process the particle swapped into slot i
      }
      updateOne(p, dt);
      i++;
    }
  },

  /** Single pass: normal-composite particles first, then all glow
   *  particles grouped under 'lighter' to minimize state changes. */
  draw(ctx) {
    if (count === 0) return;
    ctx.save();
    let anyGlow = false;
    for (let i = 0; i < count; i++) {
      const p = pool[i];
      if (p.glow) { anyGlow = true; continue; }
      drawOne(ctx, p);
    }
    if (anyGlow) {
      ctx.globalCompositeOperation = 'lighter';
      for (let i = 0; i < count; i++) {
        const p = pool[i];
        if (p.glow) drawOne(ctx, p);
      }
    }
    ctx.restore();
  },

  /** Bubble pop: expanding glossy ring + droplets + star glints. */
  pop(x, y, { big = false, hue } = {}) {
    const h = hue == null ? 197 : hue;
    const main = 'hsl(' + h + ', 90%, 72%)';
    const lite = 'hsl(' + h + ', 95%, 85%)';

    let p = spawn(K_RING, true);
    if (p) {
      p.x = x; p.y = y;
      p.maxLife = p.life = big ? 0.5 : 0.34;
      p.size = big ? 10 : 6;
      p.grow = big ? 230 : 150;
      p.size2 = big ? 7 : 4.5; // base line width
      p.color = main;
    }

    const nd = big ? irand(12, 14) : irand(8, 11);
    for (let i = 0; i < nd; i++) {
      p = spawn(K_DROP, false);
      if (!p) break;
      const a = rand(0, TAU);
      const sp = rand(60, big ? 260 : 170);
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp - rand(20, 80);
      p.g = 720; p.drag = 1.1;
      p.maxLife = p.life = rand(0.38, 0.65);
      p.size = rand(1.8, big ? 4.2 : 3.2);
      p.color = Math.random() < 0.5 ? main : lite;
    }

    const ng = irand(3, 5) + (big ? 2 : 0);
    const spread = big ? 22 : 14;
    for (let i = 0; i < ng; i++) {
      p = spawn(K_GLINT, true);
      if (!p) break;
      p.x = x + rand(-spread, spread);
      p.y = y + rand(-spread, spread);
      p.vx = rand(-25, 25); p.vy = rand(-45, -8);
      p.g = 60;
      p.maxLife = p.life = rand(0.3, 0.55);
      p.size = rand(2.5, big ? 5 : 4);
      p.freq = rand(14, 22); p.phase = rand(0, TAU);
      p.color = '#ffffff';
    }
  },

  /** Generic radial burst. */
  burst(x, y, opts = {}) {
    const {
      count: n = 12,
      palette = BURST_DEFAULT,
      speed = 150,
      life = 0.6,
      gravity = 0,
      glow = false,
    } = opts;
    for (let i = 0; i < n; i++) {
      const p = spawn(K_BURST, glow);
      if (!p) break;
      const a = rand(0, TAU);
      const sp = speed * rand(0.35, 1);
      p.x = x; p.y = y;
      p.vx = Math.cos(a) * sp;
      p.vy = Math.sin(a) * sp;
      p.g = gravity; p.drag = 1.0;
      p.maxLife = p.life = life * rand(0.7, 1.15);
      p.size = rand(2, 4.5);
      p.color = pick(palette);
    }
  },

  /** Small twinkle: 2-3 tiny crosses. */
  sparkle(x, y, color) {
    const n = irand(2, 3);
    for (let i = 0; i < n; i++) {
      const p = spawn(K_SPARK, true);
      if (!p) break;
      p.x = x + rand(-8, 8);
      p.y = y + rand(-8, 8);
      p.vy = -rand(5, 15);
      p.maxLife = p.life = rand(0.25, 0.45);
      p.size = rand(2, 3.6);
      p.freq = rand(16, 26); p.phase = rand(0, TAU);
      p.color = color || '#ffffff';
    }
  },

  /** Pickup: 6-10 glints swirling inward/upward with a slight spiral. */
  collect(x, y, color) {
    const n = irand(6, 10);
    const dir = Math.random() < 0.5 ? -1 : 1;
    for (let i = 0; i < n; i++) {
      const p = spawn(K_COLLECT, true);
      if (!p) break;
      p.ox = x; p.oy = y;
      p.maxLife = p.life = rand(0.5, 0.8);
      p.phase = rand(0, TAU);
      p.size2 = rand(14, 26);                       // orbit radius
      p.grow = (p.size2 / p.maxLife) * rand(0.9, 1.2); // inward shrink rate
      p.vr = dir * rand(6, 10);                     // angular speed
      p.vy = rand(40, 75);                          // center rise speed
      p.size = rand(1.6, 2.8);
      p.freq = rand(12, 20);
      p.color = color || '#ffe9a0';
      p.x = p.ox + Math.cos(p.phase) * p.size2;
      p.y = p.oy + Math.sin(p.phase) * p.size2 * 0.6;
    }
  },

  /** Celebration shower: 16-24 fluttering colored rects. */
  confetti(x, y) {
    const n = irand(16, 24);
    for (let i = 0; i < n; i++) {
      const p = spawn(K_CONFETTI, false);
      if (!p) break;
      p.x = x + rand(-10, 10);
      p.y = y + rand(-8, 8);
      p.vx = rand(-70, 70);
      p.vy = rand(-260, -90);
      p.g = 430; p.drag = 0.6;
      p.amp = rand(26, 60); p.freq = rand(3.5, 7.5); p.phase = rand(0, TAU);
      p.rot = rand(0, TAU); p.vr = rand(-7, 7);
      p.maxLife = p.life = rand(1.5, 2.6);
      p.size = rand(5, 8.5);
      p.color = pick(CONFETTI_COLORS);
    }
  },

  /** Run/land dust: 2-3 soft gray puffs drifting opposite `dir`. */
  trailDust(x, y, dir) {
    const d = dir || 1;
    const n = irand(2, 3);
    for (let i = 0; i < n; i++) {
      const p = spawn(K_DUST, false);
      if (!p) break;
      p.x = x + rand(-4, 4);
      p.y = y + rand(-2, 3);
      p.vx = -d * rand(25, 60) + rand(-8, 8);
      p.vy = -rand(6, 26);
      p.maxLife = p.life = rand(0.28, 0.5);
      p.size = rand(2.5, 4.5);
      p.grow = rand(10, 22);
      p.color = '#c3c9cf';
    }
  },

  /** Floating score text: chunky bold, dark outline, pop-in then drift up. */
  text(x, y, str, { color, size } = {}) {
    const p = spawn(K_TEXT, false);
    if (!p) return;
    const px = size || 18;
    p.x = x; p.y = y;
    p.vy = -70;
    p.maxLife = p.life = 1.0;
    p.size = px;
    p.color = color || '#ffffff';
    p.str = String(str);
    p.font = '900 ' + px + 'px "Arial Black", "Trebuchet MS", sans-serif';
  },

  /** Sparse theme motes; call once per frame with the frame dt. */
  ambient(theme, dt, w, h) {
    const rate = MOTE_RATE[theme] || 4; // ~3-6 spawns/sec
    ambientAcc += dt * rate;
    if (count > CAP - 80) {
      // pool nearly full: skip ambient, keep headroom for gameplay effects
      if (ambientAcc > 1) ambientAcc = 1;
      return;
    }
    while (ambientAcc >= 1) {
      ambientAcc -= 1;
      spawnMote(theme, w, h);
    }
  },
};

/* ================================================================ Shake */
/* Trauma-based screen shake: add() accumulates trauma (clamped to 1),
 * update() decays it exponentially; offsets are trauma² scaled smooth
 * value-noise, clamped to ±10 px. */

const NOISE = new Float32Array(256);
for (let i = 0; i < 256; i++) NOISE[i] = Math.random() * 2 - 1;

function noise1(t) {
  const i = Math.floor(t);
  const f = t - i;
  const u = f * f * (3 - 2 * f); // smoothstep
  const a = NOISE[i & 255];
  const b = NOISE[(i + 1) & 255];
  return a + (b - a) * u;
}

export const Shake = {
  x: 0,
  y: 0,
  _trauma: 0,
  _t: 0,

  add(mag) {
    this._trauma = Math.min(1, this._trauma + mag);
  },

  update(dt) {
    this._t += dt;
    this._trauma *= Math.exp(-2.8 * dt);
    if (this._trauma < 0.002) this._trauma = 0;
    const s = this._trauma * this._trauma * 12;
    const ox = s * noise1(this._t * 24);
    const oy = s * noise1(this._t * 24 + 131.7);
    this.x = ox < -10 ? -10 : ox > 10 ? 10 : ox;
    this.y = oy < -10 ? -10 : oy > 10 ? 10 : oy;
  },
};
