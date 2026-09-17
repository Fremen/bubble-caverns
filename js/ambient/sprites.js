// js/sprites.js — Bubble Caverns: procedurally painted sprite atlas + animated backgrounds.
// Zero-dependency browser ES module. Everything is painted once at init into
// offscreen canvases. Style: modern hand-painted cartoon — radial-gradient
// bodies, soft rim light, subtle dark outlines, big glossy eyes, glow on
// magical things. NOT pixel art. 100% original characters.
//
// Contract (docs/CONTRACTS.md §Sprites):
//   initSprites()                — pre-render everything; call once at boot
//   sprite(name, frame = 0)      — O(1) -> HTMLCanvasElement (frame wraps)
//   drawBackground(ctx, theme, t)— full 960x704 animated cave background
//   SPRITE_LIST                  — { name: { frames, w, h } }

const TAU = Math.PI * 2;
const W = 960, H = 704;

// ---------------------------------------------------------------------------
// SPRITE_LIST — exact contract table
// ---------------------------------------------------------------------------
export const SPRITE_LIST = (() => {
  const L = {};
  const S48 = (n) => ({ frames: n, w: 48, h: 48 });
  for (const p of ['p1', 'p2']) {
    L[`${p}_idle`] = S48(4); L[`${p}_run`] = S48(6); L[`${p}_jump`] = S48(2);
    L[`${p}_fall`] = S48(2); L[`${p}_shoot`] = S48(3); L[`${p}_hit`] = S48(2);
    L[`${p}_cheer`] = S48(4); L[`${p}_death`] = S48(4);
  }
  L.bumbler_walk = S48(4); L.hopkin_walk = S48(4); L.snoot_walk = S48(4);
  L.wispel_fly = S48(4); L.klonk_walk = S48(4); L.klonk_cracked_walk = S48(4);
  L.grimble_fly = { frames: 4, w: 56, h: 56 };
  L.boss_walk = { frames: 4, w: 96, h: 96 };
  L.boss_cracked = { frames: 4, w: 96, h: 96 };
  L.bubble_float = { frames: 4, w: 64, h: 64 };
  L.bubble_pop = { frames: 3, w: 64, h: 64 };
  L.bouncer = S48(2);
  const I = (n) => ({ frames: n, w: 36, h: 36 });
  for (const f of ['cherry', 'blueberry', 'banana', 'melon', 'crystal_fruit',
    'rainbow_fruit', 'shoe', 'candy_red', 'candy_yellow', 'candy_purple']) L[f] = I(1);
  L.star = I(2); L.gem = I(2); L.heart = I(2); L.bolt = I(2);
  for (const th of ['moss', 'crystal', 'ember', 'abyss', 'gold']) {
    L[`tile_solid_${th}`] = { frames: 1, w: 32, h: 32 };
    L[`tile_plat_${th}`] = { frames: 1, w: 32, h: 32 };
  }
  L.spike = { frames: 1, w: 32, h: 32 };
  L.orb = { frames: 2, w: 40, h: 40 };
  L.life_p1 = { frames: 1, w: 28, h: 28 };
  L.life_p2 = { frames: 1, w: 28, h: 28 };
  L.logo = { frames: 1, w: 520, h: 200 };
  L.spark = { frames: 1, w: 12, h: 12 };
  return L;
})();

// ---------------------------------------------------------------------------
// Core store / API
// ---------------------------------------------------------------------------
const store = new Map();      // name -> [canvas, ...]
const warned = new Set();
let placeholderCanvas = null;
let inited = false;

function mk(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return c;
}

function getPlaceholder() {
  if (!placeholderCanvas) {
    placeholderCanvas = mk(32, 32);
    const g = placeholderCanvas.getContext('2d');
    g.fillStyle = '#ff00ff'; g.fillRect(0, 0, 32, 32);
    g.fillStyle = '#220022'; g.fillRect(0, 0, 16, 16); g.fillRect(16, 16, 16, 16);
  }
  return placeholderCanvas;
}

export function sprite(name, frame = 0) {
  const arr = store.get(name);
  if (!arr) {
    if (!warned.has(name)) {
      warned.add(name);
      console.warn(`[sprites] unknown sprite "${name}" — returning placeholder`);
    }
    return getPlaceholder();
  }
  const n = arr.length;
  return arr[(((frame | 0) % n) + n) % n];
}

export function initSprites() {
  if (inited) return;
  inited = true;
  for (const name of Object.keys(SPRITE_LIST)) {
    const meta = SPRITE_LIST[name];
    const painter = PAINTERS[name];
    const frames = [];
    for (let f = 0; f < meta.frames; f++) {
      const c = mk(meta.w, meta.h);
      if (painter) painter(c.getContext('2d'), f, meta.w, meta.h);
      else { const g = c.getContext('2d'); g.fillStyle = '#ff00ff'; g.fillRect(0, 0, meta.w, meta.h); }
      frames.push(c);
    }
    store.set(name, frames);
  }
}

// ---------------------------------------------------------------------------
// Painting helpers
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function rr(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

// Hand-painted ball: radial-gradient fill + soft outline + rim light arc.
function blob(g, cx, cy, rx, ry, pal, opts = {}) {
  const R = Math.max(rx, ry);
  const grad = g.createRadialGradient(
    cx - rx * 0.35, cy - ry * 0.45, R * 0.08,
    cx - rx * 0.08, cy + ry * 0.05, R * 1.22);
  grad.addColorStop(0, pal.lite);
  grad.addColorStop(0.55, pal.base);
  grad.addColorStop(1, pal.dark);
  g.beginPath(); g.ellipse(cx, cy, rx, ry, opts.rot || 0, 0, TAU);
  g.fillStyle = grad; g.fill();
  if (pal.line) {
    g.lineWidth = opts.lw || 1.8; g.strokeStyle = pal.line; g.stroke();
  }
  if (!opts.noRim) {
    g.save();
    g.beginPath(); g.ellipse(cx, cy, rx * 0.8, ry * 0.8, opts.rot || 0, -2.5, -1.05);
    g.lineWidth = Math.max(1.4, R * 0.14); g.lineCap = 'round';
    g.globalAlpha = 0.5;
    g.strokeStyle = opts.rim || 'rgba(255,255,255,0.85)';
    g.stroke();
    g.restore();
  }
}

function limb(g, x1, y1, x2, y2, wd, col, line) {
  g.lineCap = 'round';
  if (line) {
    g.lineWidth = wd + 2.4; g.strokeStyle = line;
    g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
  }
  g.lineWidth = wd; g.strokeStyle = col;
  g.beginPath(); g.moveTo(x1, y1); g.lineTo(x2, y2); g.stroke();
}

// Big expressive cartoon eye.
function eye(g, x, y, r, o = {}) {
  const ink = o.ink || '#2c2046';
  if (o.dead) {
    g.strokeStyle = ink; g.lineWidth = r * 0.5; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(x - r * 0.7, y - r * 0.7); g.lineTo(x + r * 0.7, y + r * 0.7);
    g.moveTo(x + r * 0.7, y - r * 0.7); g.lineTo(x - r * 0.7, y + r * 0.7);
    g.stroke();
    return;
  }
  if (o.dizzy) {
    g.strokeStyle = ink; g.lineWidth = r * 0.32; g.lineCap = 'round';
    g.beginPath(); g.arc(x, y, r * 0.32, 0, Math.PI * 1.5);
    g.stroke();
    g.beginPath(); g.arc(x, y, r * 0.68, Math.PI, Math.PI * 2.6);
    g.stroke();
    return;
  }
  if (o.happy) {
    g.strokeStyle = ink; g.lineWidth = r * 0.45; g.lineCap = 'round';
    g.beginPath(); g.arc(x, y + r * 0.25, r * 0.8, Math.PI * 1.12, Math.PI * 1.88);
    g.stroke();
    return;
  }
  const wide = o.wide || 1;
  const rx = r * wide, ry = r * 1.12 * wide;
  g.fillStyle = '#ffffff';
  g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fill();
  g.lineWidth = 1; g.strokeStyle = 'rgba(40,28,60,0.4)'; g.stroke();
  const px = x + (o.look || 0) * r * 0.35, py = y + r * 0.1;
  g.fillStyle = o.iris || '#3f8c74';
  g.beginPath(); g.arc(px, py, r * 0.64, 0, TAU); g.fill();
  g.fillStyle = '#1c1230';
  g.beginPath(); g.arc(px, py, r * 0.36, 0, TAU); g.fill();
  g.fillStyle = '#ffffff';
  g.beginPath(); g.arc(px - r * 0.2, py - r * 0.28, r * 0.22, 0, TAU); g.fill();
  g.beginPath(); g.arc(px + r * 0.24, py + r * 0.26, r * 0.1, 0, TAU); g.fill();
  const lid = o.lid || 0;
  if (lid > 0) {
    g.save();
    g.beginPath(); g.ellipse(x, y, rx + 0.8, ry + 0.8, 0, 0, TAU); g.clip();
    g.fillStyle = o.lidCol || '#88d8c0';
    g.fillRect(x - rx - 1, y - ry - 1, rx * 2 + 2, lid * ry * 2);
    g.strokeStyle = 'rgba(40,28,60,0.5)'; g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(x - rx, y - ry - 1 + lid * ry * 2);
    g.lineTo(x + rx, y - ry - 1 + lid * ry * 2); g.stroke();
    g.restore();
  }
}

function blush(g, x, y, r, col = 'rgba(255,110,150,0.4)') {
  g.fillStyle = col;
  g.beginPath(); g.ellipse(x, y, r, r * 0.6, 0, 0, TAU); g.fill();
}

function starPath(g, cx, cy, R, r, n, rot = -Math.PI / 2) {
  g.beginPath();
  for (let i = 0; i < n * 2; i++) {
    const a = rot + (i / (n * 2)) * TAU;
    const rad = (i % 2 === 0) ? R : r;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    if (i === 0) g.moveTo(x, y); else g.lineTo(x, y);
  }
  g.closePath();
}

function glowDot(g, x, y, r, col) {
  const grad = g.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0, col);
  grad.addColorStop(1, 'rgba(0,0,0,0)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
}

function sparkle4(g, x, y, r, col = 'rgba(255,255,255,0.9)') {
  g.strokeStyle = col; g.lineCap = 'round'; g.lineWidth = Math.max(1, r * 0.22);
  g.beginPath();
  g.moveTo(x - r, y); g.lineTo(x + r, y);
  g.moveTo(x, y - r); g.lineTo(x, y + r);
  g.stroke();
  g.lineWidth = Math.max(0.8, r * 0.14);
  g.beginPath();
  g.moveTo(x - r * 0.5, y - r * 0.5); g.lineTo(x + r * 0.5, y + r * 0.5);
  g.moveTo(x + r * 0.5, y - r * 0.5); g.lineTo(x - r * 0.5, y + r * 0.5);
  g.stroke();
}

// ---------------------------------------------------------------------------
// Players — Puff (mint) & Plop (peach): round axolotl-dragons, frilly gills.
// Authored facing right; the renderer mirrors for left.
// ---------------------------------------------------------------------------
const P1PAL = {
  base: '#7ce6c0', lite: '#d6fff1', dark: '#37a07f',
  line: 'rgba(18,72,55,0.55)', belly: '#f0fff9', bellyDark: '#bdeeda',
  frill: '#ff9db8', frillDark: '#e06a8e', iris: '#2f7d68', lid: '#5fcaa6',
  baseLid: 0,
};
const P2PAL = {
  base: '#ffb289', lite: '#ffead4', dark: '#d96f45',
  line: 'rgba(110,45,18,0.5)', belly: '#fff5e8', bellyDark: '#ffd9b6',
  frill: '#7bd8ea', frillDark: '#3fa8c2', iris: '#a05530', lid: '#f59b6c',
  baseLid: 0.32,
};

function frond(g, x, y, ang, len, pal) {
  g.save(); g.translate(x, y); g.rotate(ang);
  const gr = g.createLinearGradient(0, 0, len, 0);
  gr.addColorStop(0, pal.frill); gr.addColorStop(1, pal.frillDark);
  g.beginPath(); g.ellipse(len / 2, 0, len / 2, len * 0.24, 0, 0, TAU);
  g.fillStyle = gr; g.fill();
  g.lineWidth = 1.3; g.strokeStyle = pal.line; g.stroke();
  g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(len * 0.18, 0); g.lineTo(len * 0.78, 0); g.stroke();
  g.restore();
}

function drawDragon(g, pal, p = {}) {
  const e = p.eyes || {};
  const lid = e.lid != null ? e.lid : pal.baseLid;
  g.save();
  g.translate(24, 25 + (p.bob || 0));
  if (p.rot) g.rotate(p.rot);
  g.scale(p.sx || 1, p.sy || 1);

  const wag = p.wag || 0;
  const tpal = { lite: pal.base, base: pal.base, dark: pal.dark, line: pal.line };

  // tail — curling pads trailing left
  blob(g, -15, 6, 4.6, 4.2, tpal, { noRim: true });
  blob(g, -19.5, 8.5 + wag, 3.4, 3.1, tpal, { noRim: true });
  blob(g, -23, 10 + wag * 1.7, 2.3, 2.1, tpal, { noRim: true });

  // legs + feet
  const lL = p.legL || [-1, 5], lR = p.legR || [1, 5];
  const fL = [-7.5 + lL[0], 13 + lL[1] * 0.9], fR = [7.5 + lR[0], 13 + lR[1] * 0.9];
  limb(g, -6.5, 9, fL[0], fL[1], 4.6, pal.base, pal.line);
  limb(g, 6.5, 9, fR[0], fR[1], 4.6, pal.base, pal.line);
  blob(g, fL[0], fL[1] + 1, 3.4, 2.2, tpal, { noRim: true, lw: 1.3 });
  blob(g, fR[0], fR[1] + 1, 3.4, 2.2, tpal, { noRim: true, lw: 1.3 });

  // dorsal fin
  g.beginPath();
  g.moveTo(-6, -12.5);
  g.quadraticCurveTo(-3, -19.5, 1, -13.5);
  g.quadraticCurveTo(-2.5, -14.5, -6, -12.5);
  g.closePath();
  g.fillStyle = pal.frill; g.fill();
  g.lineWidth = 1.3; g.strokeStyle = pal.line; g.stroke();

  // gill frills (axolotl fronds), three per side
  const spread = (p.frillUp || 0) * 0.3;
  frond(g, -12.5, -9, Math.PI + 0.6 + spread, 9.5, pal);
  frond(g, -13.8, -4.5, Math.PI + 0.18 + spread, 10.5, pal);
  frond(g, -12.8, 0, Math.PI - 0.3 + spread, 9, pal);
  frond(g, 12.5, -9.5, -0.6 - spread, 9.5, pal);
  frond(g, 13.8, -5, -0.18 - spread, 10.5, pal);
  frond(g, 12.8, -0.5, 0.3 + spread, 9, pal);

  // body (head+body chibi ball)
  blob(g, 0, 0, 15.5, 14.5, pal, { lw: 2 });

  // belly
  const bg2 = g.createRadialGradient(1, 2, 1, 1.5, 5.5, 11);
  bg2.addColorStop(0, pal.belly); bg2.addColorStop(1, pal.bellyDark);
  g.beginPath(); g.ellipse(1.5, 5.8, 9.2, 7.6, 0, 0, TAU);
  g.fillStyle = bg2; g.fill();
  g.globalAlpha = 0.35; g.lineWidth = 1.2; g.strokeStyle = pal.line; g.stroke();
  g.globalAlpha = 1;

  // arms (drawn over body, stubby)
  const aL = p.armL || [-3, 5], aR = p.armR || [3, 5];
  const hL = [-11 + aL[0], 2 + aL[1]], hR = [11 + aR[0], 2 + aR[1]];
  limb(g, -10.5, 1.5, hL[0], hL[1], 4.2, pal.base, pal.line);
  limb(g, 10.5, 1.5, hR[0], hR[1], 4.2, pal.base, pal.line);
  blob(g, hL[0], hL[1], 2.6, 2.4, tpal, { noRim: true, lw: 1.2 });
  blob(g, hR[0], hR[1], 2.6, 2.4, tpal, { noRim: true, lw: 1.2 });

  // puffed cheeks for shooting
  const ch = p.cheek || 0;
  if (ch > 0) {
    const cpal = { lite: pal.lite, base: pal.base, dark: pal.dark, line: pal.line };
    blob(g, 9, 2.5, 4 + 3.2 * ch, 3.6 + 2.8 * ch, cpal, { noRim: true, lw: 1.4 });
    blob(g, 0.5, 3.5, 3.4 + 2.4 * ch, 3 + 2 * ch, cpal, { noRim: true, lw: 1.4 });
  }

  // face — eyes big & glossy
  const eo = {
    look: e.look != null ? e.look : 0.25, lid, lidCol: pal.lid, iris: pal.iris,
    wide: e.wide, happy: e.happy, dead: e.dead, dizzy: e.dizzy,
  };
  eye(g, 0.5, -5.5, 3.9, eo);
  eye(g, 9.5, -4.8, 4.1, eo);

  // blush spots
  blush(g, 13, 0.8, 2.6);
  blush(g, -2.5, 0.2, 2.4);

  // nostril
  g.fillStyle = 'rgba(30,20,50,0.55)';
  g.beginPath(); g.arc(14.6, -1.5, 0.8, 0, TAU); g.fill();

  // mouth
  const ink = 'rgba(44,32,70,0.85)';
  g.strokeStyle = ink; g.lineCap = 'round'; g.lineWidth = 1.6;
  const m = p.mouth || 'smile';
  if (m === 'smile') {
    g.beginPath(); g.arc(10.5, 1.6, 3.2, 0.35, Math.PI - 0.6); g.stroke();
  } else if (m === 'grin') {
    g.beginPath(); g.arc(10, 1.2, 4.4, 0.2, Math.PI - 0.35);
    g.fillStyle = '#5e2b47'; g.fill(); g.stroke();
    g.fillStyle = '#ff8fa3';
    g.beginPath(); g.ellipse(10, 4.6, 2.4, 1.4, 0, Math.PI, TAU); g.fill();
  } else if (m === 'o') {
    g.fillStyle = '#5e2b47';
    g.beginPath(); g.ellipse(11.5, 3, 2.2, 2.8, 0, 0, TAU); g.fill();
    g.stroke();
  } else if (m === 'puff') {
    g.beginPath(); g.moveTo(11, 4.2); g.lineTo(13.5, 3.8); g.stroke();
  } else if (m === 'ouch') {
    g.beginPath();
    g.moveTo(7.5, 3.5); g.lineTo(9.5, 2.3); g.lineTo(11.5, 3.7); g.lineTo(13.5, 2.5);
    g.stroke();
  }

  // blow gust
  if (p.blow) {
    g.strokeStyle = 'rgba(255,255,255,0.65)'; g.lineWidth = 1.6;
    g.beginPath(); g.arc(17.5, 3, 3, -0.8, 0.8); g.stroke();
    g.beginPath(); g.arc(20.5, 3, 4.5, -0.7, 0.7); g.stroke();
    g.globalAlpha = 0.5;
    g.beginPath(); g.arc(23.5, 3, 6, -0.6, 0.6); g.stroke();
    g.globalAlpha = 1;
  }
  g.restore();
}

// pose tables ---------------------------------------------------------------
const RUN_POSES = Array.from({ length: 6 }, (_, f) => {
  const ph = (f / 6) * TAU;
  return {
    bob: -Math.abs(Math.sin(ph)) * 2.6, rot: 0.07, wag: Math.sin(ph) * 1.6,
    legL: [Math.cos(ph) * 6 - 1, 5 - Math.max(0, Math.sin(ph)) * 5],
    legR: [Math.cos(ph + Math.PI) * 6 + 1, 5 - Math.max(0, Math.sin(ph + Math.PI)) * 5],
    armL: [Math.cos(ph + Math.PI) * 4 - 2, 3 + Math.sin(ph + Math.PI) * 2],
    armR: [Math.cos(ph) * 4 + 2, 3 + Math.sin(ph) * 2],
    mouth: 'grin', eyes: { look: 0.55 },
  };
});

const CHEER_POSES = [
  { bob: 0.5, sy: 0.97, armL: [-6, -8], armR: [6, -9], mouth: 'grin', eyes: { happy: 1 }, wag: 1.5, frillUp: 0.5 },
  { bob: -3.5, sy: 1.03, armL: [-7, -10], armR: [7, -10], legL: [-3, 2], legR: [3, 2], mouth: 'grin', eyes: { happy: 1 }, wag: -1.5, frillUp: 1 },
  { bob: -6.5, sy: 1.06, armL: [-8, -11], armR: [8, -12], legL: [-4, 1], legR: [4, 1], mouth: 'grin', eyes: { happy: 1 }, wag: 2, frillUp: 1 },
  { bob: -2, sy: 1.0, armL: [-7, -9], armR: [7, -10], mouth: 'grin', eyes: { happy: 1 }, wag: -1, frillUp: 0.7 },
];

const POSES = {
  idle: [
    { bob: 0, sy: 1, wag: 0, mouth: 'smile' },
    { bob: 0.9, sy: 0.988, wag: 0.8, mouth: 'smile' },
    { bob: 1.6, sy: 0.974, wag: 1.4, mouth: 'smile', eyes: { lid: 0.85 } },
    { bob: 0.9, sy: 0.988, wag: 0.8, mouth: 'smile' },
  ],
  run: RUN_POSES,
  jump: [
    { bob: -1.5, sx: 0.95, sy: 1.08, legL: [-4, 1], legR: [2, 0], armL: [-6, -9], armR: [6, -10], mouth: 'grin', wag: 2.2, eyes: { wide: 1.05, look: 0.4 }, frillUp: 1 },
    { bob: -0.5, sx: 0.97, sy: 1.04, legL: [-3, 2], legR: [3, 1], armL: [-7, -7], armR: [7, -8], mouth: 'grin', wag: 1.2, eyes: { wide: 1.05, look: 0.4 }, frillUp: 0.7 },
  ],
  fall: [
    { bob: 0.5, sx: 1.05, sy: 0.95, legL: [-6, 2], legR: [6, 1], armL: [-8, -6], armR: [8, -3], mouth: 'o', wag: -2.5, eyes: { wide: 1.15 } },
    { bob: 1.3, sx: 1.02, sy: 0.985, legL: [-5, 3], legR: [7, 2], armL: [-8, -2], armR: [8, -7], mouth: 'o', wag: -3.5, eyes: { wide: 1.15 } },
  ],
  shoot: [
    { bob: 0, cheek: 0.55, mouth: 'puff', eyes: { lid: 0.3 }, armL: [-4, 3], armR: [5, 1] },
    { bob: 0.6, rot: -0.07, sx: 1.05, cheek: 1, mouth: 'puff', eyes: { lid: 0.5 }, armL: [-5, 2], armR: [6, 0] },
    { bob: 0, rot: 0.05, cheek: 0, mouth: 'o', blow: true, armL: [-4, 4], armR: [7, 2], eyes: { wide: 1.05 }, frillUp: 0.8 },
  ],
  hit: [
    { rot: -0.2, bob: 1, sx: 1.05, sy: 0.93, mouth: 'ouch', eyes: { dizzy: 1 }, armL: [-8, -2], armR: [8, -1], wag: 2.5 },
    { rot: 0.18, bob: 1.6, sx: 1.04, sy: 0.94, mouth: 'ouch', eyes: { dizzy: 1 }, armL: [-7, -4], armR: [7, -3], wag: -2.5 },
  ],
  cheer: CHEER_POSES,
  death: [
    { rot: 0.5, mouth: 'ouch', eyes: { dead: 1 }, armL: [-8, -4], armR: [8, -4], wag: 2.5, frillUp: 1 },
    { rot: 1.9, mouth: 'ouch', eyes: { dead: 1 }, armL: [-8, -2], armR: [8, -2], wag: -2 },
    { rot: 3.3, mouth: 'ouch', eyes: { dead: 1 }, armL: [-7, 0], armR: [7, 0], wag: 2 },
    { rot: 4.7, sy: 0.94, mouth: 'ouch', eyes: { dead: 1 }, armL: [-6, 2], armR: [6, 2], wag: -1.5 },
  ],
};

// ---------------------------------------------------------------------------
// Enemies — distinct silhouettes, hand-painted
// ---------------------------------------------------------------------------
function paintBumbler(g, f) {
  const ph = (f / 4) * TAU;
  const pal = { lite: '#ffe9a8', base: '#e3b04a', dark: '#94681f', line: 'rgba(85,55,8,0.55)' };
  const bob = Math.sin(ph) * 1.1;
  const cx = 24, cy = 26 + bob * 0.5;
  // stubby feet (alternate shuffle)
  const fpal = { lite: pal.base, base: pal.dark, dark: pal.dark, line: pal.line };
  blob(g, cx - 8 + Math.cos(ph) * 3, 41, 4.5, 3, fpal, { noRim: true, lw: 1.3 });
  blob(g, cx + 8 + Math.cos(ph + Math.PI) * 3, 41, 4.5, 3, fpal, { noRim: true, lw: 1.3 });
  // antenna nubs
  limb(g, cx - 6, cy - 13, cx - 9, cy - 18 - bob, 2.6, pal.base, pal.line);
  limb(g, cx + 6, cy - 13, cx + 9, cy - 18 + bob, 2.6, pal.base, pal.line);
  g.fillStyle = pal.dark;
  g.beginPath(); g.arc(cx - 9, cy - 18 - bob, 2, 0, TAU); g.fill();
  g.beginPath(); g.arc(cx + 9, cy - 18 + bob, 2, 0, TAU); g.fill();
  // round grub body
  blob(g, cx, cy, 16, 14.5 - bob * 0.3, pal, { lw: 2 });
  // belly segment lines
  g.strokeStyle = 'rgba(85,55,8,0.35)'; g.lineWidth = 1.8; g.lineCap = 'round';
  g.beginPath(); g.arc(cx, cy - 4, 14, 0.5, Math.PI - 0.5); g.stroke();
  g.beginPath(); g.arc(cx, cy + 1, 12.5, 0.55, Math.PI - 0.55); g.stroke();
  // grumpy brows
  g.strokeStyle = '#4a3308'; g.lineWidth = 2.6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(cx - 9.5, cy - 9.5); g.lineTo(cx - 3.5, cy - 6.5); g.stroke();
  g.beginPath(); g.moveTo(cx + 9.5, cy - 9.5); g.lineTo(cx + 3.5, cy - 6.5); g.stroke();
  // cross eyes
  eye(g, cx - 6, cy - 3.5, 3.2, { iris: '#7a4d12', look: 0.2 });
  eye(g, cx + 6, cy - 3.5, 3.2, { iris: '#7a4d12', look: -0.2 });
  // frown
  g.strokeStyle = 'rgba(60,40,8,0.85)'; g.lineWidth = 1.8;
  g.beginPath(); g.arc(cx, cy + 7.5, 3.6, Math.PI + 0.5, TAU - 0.5); g.stroke();
}

function paintHopkin(g, f) {
  const pal = { lite: '#dcf7ab', base: '#8fd34d', dark: '#477f1e', line: 'rgba(35,70,10,0.55)' };
  // pose per frame: crouch -> push -> airborne -> land
  const P = [
    { cy: 30, sx: 1.14, sy: 0.8, knee: 7, foot: 9, fy: 40, arms: 4 },
    { cy: 26, sx: 1.0, sy: 1.04, knee: 9, foot: 8, fy: 41, arms: 0 },
    { cy: 20, sx: 0.9, sy: 1.16, knee: 12, foot: 6, fy: 40, arms: -7 },
    { cy: 27, sx: 1.06, sy: 0.92, knee: 8, foot: 9, fy: 41, arms: 2 },
  ][f];
  const cx = 24, cy = P.cy;
  // spring legs (zigzag: hip -> knee out -> big foot)
  for (const s of [-1, 1]) {
    const hip = [cx + s * 6, cy + 7 * P.sy];
    const knee = [cx + s * P.knee, cy + 12];
    const foot = [cx + s * P.foot, P.fy];
    limb(g, hip[0], hip[1], knee[0], knee[1], 4, pal.base, pal.line);
    limb(g, knee[0], knee[1], foot[0], foot[1], 3.6, pal.base, pal.line);
    blob(g, foot[0] + s * 2, foot[1] + 0.5, 5, 2.6, { lite: pal.lite, base: pal.base, dark: pal.dark, line: pal.line }, { noRim: true, lw: 1.3 });
  }
  g.save();
  g.translate(cx, cy); g.scale(P.sx, P.sy); g.translate(-cx, -cy);
  // imp ears
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + s * 7, cy - 10);
    g.quadraticCurveTo(cx + s * 15, cy - 19, cx + s * 10.5, cy - 8);
    g.closePath();
    g.fillStyle = pal.base; g.fill();
    g.lineWidth = 1.5; g.strokeStyle = pal.line; g.stroke();
  }
  // body
  blob(g, cx, cy, 13.5, 12.5, pal, { lw: 2 });
  // belly
  g.fillStyle = '#edffd2';
  g.beginPath(); g.ellipse(cx + 1, cy + 4.5, 7.5, 6, 0, 0, TAU); g.fill();
  g.globalAlpha = 0.3; g.lineWidth = 1.1; g.strokeStyle = pal.line; g.stroke();
  g.globalAlpha = 1;
  // arms
  limb(g, cx - 9, cy + 1, cx - 12, cy + 5 + P.arms, 3.4, pal.base, pal.line);
  limb(g, cx + 9, cy + 1, cx + 12, cy + 5 + P.arms, 3.4, pal.base, pal.line);
  // mischievous eyes + smirk
  eye(g, cx - 4, cy - 4, 3.4, { iris: '#b06a18', look: 0.5, lid: 0.25, lidCol: pal.base });
  eye(g, cx + 5, cy - 4, 3.4, { iris: '#b06a18', look: 0.5, lid: 0.25, lidCol: pal.base });
  g.strokeStyle = 'rgba(35,70,10,0.85)'; g.lineWidth = 1.7; g.lineCap = 'round';
  g.beginPath(); g.arc(cx + 2, cy + 1.5, 4, 0.3, Math.PI * 0.75); g.stroke();
  blush(g, cx - 8.5, cy + 0.5, 2, 'rgba(120,200,70,0.5)');
  g.restore();
}

function paintSnoot(g, f) {
  const ph = (f / 4) * TAU;
  const pal = { lite: '#f4cfe6', base: '#c585b0', dark: '#7c4870', line: 'rgba(70,28,60,0.55)' };
  const bob = Math.sin(ph) * 1.2;
  const sniff = Math.sin(ph * 2) * 1.6;
  const cx = 22, cy = 27 + bob * 0.4;
  // shuffling feet
  const fpal = { lite: pal.base, base: pal.dark, dark: pal.dark, line: pal.line };
  blob(g, cx - 5 + Math.cos(ph) * 3.5, 41.5, 4.4, 2.8, fpal, { noRim: true, lw: 1.3 });
  blob(g, cx + 6 + Math.cos(ph + Math.PI) * 3.5, 41.5, 4.4, 2.8, fpal, { noRim: true, lw: 1.3 });
  // droopy ears (behind body)
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx - 2 + s * 4, cy - 11);
    g.quadraticCurveTo(cx - 8 + s * 3, cy - 4 + bob, cx - 5 + s * 3, cy + 2);
    g.quadraticCurveTo(cx - 1 + s * 3, cy - 3, cx + s * 4, cy - 9);
    g.closePath();
    g.fillStyle = pal.dark; g.fill();
    g.lineWidth = 1.4; g.strokeStyle = pal.line; g.stroke();
  }
  // teardrop body leaning forward (right)
  blob(g, cx, cy, 14, 13, pal, { lw: 2, rot: 0.22 });
  // belly
  g.fillStyle = '#fae6f2';
  g.beginPath(); g.ellipse(cx + 1.5, cy + 4.5, 8, 6.5, 0.2, 0, TAU); g.fill();
  g.globalAlpha = 0.3; g.lineWidth = 1.1; g.strokeStyle = pal.line; g.stroke();
  g.globalAlpha = 1;
  // long sniffer snout, leaning forward + bobbing tip
  const tipX = cx + 21, tipY = cy + 1 + sniff;
  g.beginPath();
  g.moveTo(cx + 8, cy - 7);
  g.quadraticCurveTo(cx + 17, cy - 6 + sniff * 0.5, tipX, tipY);
  g.quadraticCurveTo(cx + 16, cy + 4 + sniff * 0.5, cx + 8, cy + 3);
  g.closePath();
  const sg = g.createLinearGradient(cx + 8, cy - 6, tipX, tipY);
  sg.addColorStop(0, pal.base); sg.addColorStop(1, pal.lite);
  g.fillStyle = sg; g.fill();
  g.lineWidth = 1.7; g.strokeStyle = pal.line; g.stroke();
  // nostril + sniff puffs
  g.fillStyle = 'rgba(70,28,60,0.7)';
  g.beginPath(); g.ellipse(tipX - 1.5, tipY - 0.5, 1.4, 1, 0, 0, TAU); g.fill();
  if (f % 2 === 1) {
    g.strokeStyle = 'rgba(255,255,255,0.45)'; g.lineWidth = 1.3;
    g.beginPath(); g.arc(tipX + 3, tipY - 2, 2.2, -1.2, 0.6); g.stroke();
  }
  // curious lidded eyes
  eye(g, cx + 1, cy - 7, 3.1, { iris: '#5e3354', look: 0.6, lid: 0.35, lidCol: pal.base });
  eye(g, cx + 8.5, cy - 6.5, 3.1, { iris: '#5e3354', look: 0.6, lid: 0.35, lidCol: pal.base });
  blush(g, cx - 3, cy - 1, 2.2, 'rgba(255,120,170,0.4)');
}

function paintWispel(g, f) {
  const flap = Math.sin((f / 4) * TAU);
  const cx = 24, cy = 25 - flap * 1.5;
  const pal = { lite: '#e7fbff', base: '#9adcf2', dark: '#4d8fb8', line: 'rgba(30,70,100,0.5)' };
  g.save();
  g.shadowColor = 'rgba(140,230,255,0.8)'; g.shadowBlur = 7;
  // translucent glow wings, flapping
  for (const s of [-1, 1]) {
    const a = s * (-0.45 - flap * 0.55);
    g.save();
    g.translate(cx + s * 7, cy - 3);
    g.rotate(a);
    // upper wing
    g.beginPath();
    g.moveTo(0, 0);
    g.quadraticCurveTo(s * 17, -16, s * 19, -3);
    g.quadraticCurveTo(s * 13, 3, 0, 0);
    g.closePath();
    g.fillStyle = 'rgba(180,240,255,0.45)'; g.fill();
    g.lineWidth = 1.4; g.strokeStyle = 'rgba(225,250,255,0.85)'; g.stroke();
    // lower winglet
    g.beginPath();
    g.moveTo(0, 2);
    g.quadraticCurveTo(s * 12, 9, s * 12, 1);
    g.quadraticCurveTo(s * 7, -1, 0, 2);
    g.closePath();
    g.fillStyle = 'rgba(200,235,255,0.35)'; g.fill();
    g.stroke();
    g.restore();
  }
  g.restore();
  // antennae with glow tips
  limb(g, cx - 3, cy - 10, cx - 7, cy - 16 + flap, 1.8, pal.base, pal.line);
  limb(g, cx + 3, cy - 10, cx + 7, cy - 16 - flap, 1.8, pal.base, pal.line);
  glowDot(g, cx - 7, cy - 16 + flap, 3.5, 'rgba(170,255,255,0.9)');
  glowDot(g, cx + 7, cy - 16 - flap, 3.5, 'rgba(170,255,255,0.9)');
  // jelly body
  blob(g, cx, cy, 10.5, 11.5, pal, { lw: 1.8 });
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath(); g.ellipse(cx + 1, cy + 4, 6, 4.5, 0, 0, TAU); g.fill();
  // dangly feet
  limb(g, cx - 3.5, cy + 10, cx - 4, cy + 14 + flap * 1.5, 2.2, pal.base, pal.line);
  limb(g, cx + 3.5, cy + 10, cx + 4, cy + 14 - flap * 1.5, 2.2, pal.base, pal.line);
  // sweet face
  eye(g, cx - 3.5, cy - 2, 3.2, { iris: '#3a6f96', look: 0 });
  eye(g, cx + 3.5, cy - 2, 3.2, { iris: '#3a6f96', look: 0 });
  g.strokeStyle = 'rgba(30,70,100,0.8)'; g.lineWidth = 1.5; g.lineCap = 'round';
  g.beginPath(); g.arc(cx, cy + 3.5, 2.2, 0.4, Math.PI - 0.4); g.stroke();
  blush(g, cx - 7, cy + 1.5, 1.8); blush(g, cx + 7, cy + 1.5, 1.8);
}

function paintKlonkBody(g, f, cracked, scale, ox, oy, boss) {
  const ph = (f / 4) * TAU;
  const pal = { lite: '#cdd2e4', base: '#9aa0b4', dark: '#535869', line: 'rgba(30,32,48,0.6)' };
  g.save();
  g.translate(ox, oy); g.scale(scale, scale);
  const cx = 24, cy = 26;
  const bob = Math.sin(ph) * 1.1;
  if (boss) g.rotate(Math.sin(ph) * 0.025);
  // legs — three per side, alternating
  for (let i = 0; i < 3; i++) {
    const lx = cx - 8 + i * 8;
    const step = Math.sin(ph + i * 2.1) * 2.5;
    limb(g, lx, cy + 8, lx - 2 + step, 41, 3.4, pal.dark, pal.line);
    g.fillStyle = '#3c404f';
    g.beginPath(); g.ellipse(lx - 2 + step, 41.5, 3, 2, 0, 0, TAU); g.fill();
  }
  // armoured dome
  blob(g, cx, cy - bob * 0.4, 17, 14.5, pal, { lw: 2 });
  // plate seams
  g.strokeStyle = 'rgba(30,32,48,0.5)'; g.lineWidth = 2; g.lineCap = 'round';
  g.beginPath(); g.arc(cx, cy + 7, 16.5, Math.PI + 0.45, TAU - 0.45); g.stroke();
  g.beginPath(); g.arc(cx, cy + 12, 18, Math.PI + 0.6, TAU - 0.6); g.stroke();
  // rivet studs
  g.fillStyle = '#41465a';
  for (const [sx, sy] of [[-9, -7], [0, -10.5], [9, -7], [-12, 0], [12, 0]]) {
    g.beginPath(); g.arc(cx + sx, cy + sy, 1.7, 0, TAU); g.fill();
  }
  g.fillStyle = 'rgba(255,255,255,0.35)';
  for (const [sx, sy] of [[-9, -7], [0, -10.5], [9, -7]]) {
    g.beginPath(); g.arc(cx + sx - 0.5, cy + sy - 0.5, 0.7, 0, TAU); g.fill();
  }
  // helmet rim + glowing eyes in the shadow slot
  g.fillStyle = '#3a3e50';
  rr(g, cx - 12, cy + 1, 24, 7.5, 4); g.fill();
  g.lineWidth = 1.6; g.strokeStyle = pal.line; g.stroke();
  const lookX = Math.cos(ph) * 1.2;
  for (const s of [-1, 1]) {
    glowDot(g, cx + s * 5.5 + lookX, cy + 4.7, 4.2, 'rgba(255,160,60,0.95)');
    g.fillStyle = '#fff3c8';
    g.beginPath(); g.arc(cx + s * 5.5 + lookX, cy + 4.7, 1.5, 0, TAU); g.fill();
  }
  if (boss) {
    // tusks
    for (const s of [-1, 1]) {
      g.beginPath();
      g.moveTo(cx + s * 11, cy + 8);
      g.quadraticCurveTo(cx + s * 16, cy + 7, cx + s * 14.5, cy + 1.5);
      g.quadraticCurveTo(cx + s * 13, cy + 6, cx + s * 9.5, cy + 7);
      g.closePath();
      g.fillStyle = '#f3ead2'; g.fill();
      g.lineWidth = 1.3; g.strokeStyle = pal.line; g.stroke();
    }
    // crown
    g.save();
    g.translate(cx, cy - 14.5); g.rotate(-0.06);
    const cg = g.createLinearGradient(0, -10, 0, 2);
    cg.addColorStop(0, '#ffe9a0'); cg.addColorStop(0.6, '#f2bf45'); cg.addColorStop(1, '#b3801c');
    g.beginPath();
    g.moveTo(-10, 2); g.lineTo(-10, -4); g.lineTo(-5.5, 0); g.lineTo(-1.5, -7);
    g.lineTo(3, 0); g.lineTo(8, -5); g.lineTo(8.5, 2);
    g.closePath();
    g.fillStyle = cg; g.fill();
    g.lineWidth = 1.6; g.strokeStyle = 'rgba(90,55,10,0.7)'; g.stroke();
    g.fillStyle = '#ff5a7e';
    g.beginPath(); g.arc(-1, -1.5, 1.6, 0, TAU); g.fill();
    g.fillStyle = '#5ad8ff';
    g.beginPath(); g.arc(-7.5, 0.2, 1.2, 0, TAU); g.fill();
    g.beginPath(); g.arc(6, -0.5, 1.2, 0, TAU); g.fill();
    g.restore();
  }
  if (cracked) {
    // jagged cracks
    g.strokeStyle = 'rgba(18,20,30,0.85)'; g.lineWidth = 1.7; g.lineCap = 'round';
    g.beginPath();
    g.moveTo(cx - 4, cy - 13.5); g.lineTo(cx - 1, cy - 8); g.lineTo(cx - 6, cy - 4);
    g.moveTo(cx - 1, cy - 8); g.lineTo(cx + 3, cy - 5);
    g.moveTo(cx + 10, cy - 11); g.lineTo(cx + 8, cy - 6.5); g.lineTo(cx + 12.5, cy - 3);
    g.stroke();
    if (boss) {
      g.strokeStyle = 'rgba(255,110,60,0.8)'; g.lineWidth = 0.9;
      g.beginPath();
      g.moveTo(cx - 4, cy - 13.5); g.lineTo(cx - 1, cy - 8); g.lineTo(cx - 6, cy - 4);
      g.stroke();
    }
    // chipped notches (erase)
    g.globalCompositeOperation = 'destination-out';
    g.beginPath();
    g.moveTo(cx - 17.5, cy - 4); g.lineTo(cx - 12.5, cy - 5.5); g.lineTo(cx - 14, cy - 0.5);
    g.closePath(); g.fill();
    g.beginPath();
    g.moveTo(cx + 8, cy - 14.8); g.lineTo(cx + 12.5, cy - 13.5); g.lineTo(cx + 9, cy - 10.5);
    g.closePath(); g.fill();
    g.globalCompositeOperation = 'source-over';
    g.strokeStyle = 'rgba(30,32,48,0.7)'; g.lineWidth = 1.3;
    g.beginPath();
    g.moveTo(cx - 12.5, cy - 5.5); g.lineTo(cx - 14, cy - 0.5); g.stroke();
    g.beginPath();
    g.moveTo(cx + 12.5, cy - 13.5); g.lineTo(cx + 9, cy - 10.5); g.stroke();
  }
  g.restore();
}

const paintKlonk = (g, f) => paintKlonkBody(g, f, false, 1, 0, 0, false);
const paintKlonkCracked = (g, f) => paintKlonkBody(g, f, true, 1, 0, 0, false);
const paintBoss = (g, f) => paintKlonkBody(g, f, false, 1.92, 1.5, 4, true);
const paintBossCracked = (g, f) => paintKlonkBody(g, f, true, 1.92, 1.5, 4, true);

function paintGrimble(g, f) {
  const ph = (f / 4) * TAU;
  const cx = 28, cy = 27 + Math.sin(ph) * 1.6;
  // ominous violet aura
  glowDot(g, cx, cy, 26, 'rgba(140,80,255,0.30)');
  g.save();
  g.shadowColor = 'rgba(160,100,255,0.9)'; g.shadowBlur = 11;
  // hooded wisp body with tattered waving hem
  const hem = (i) => Math.sin(ph + i * 1.9) * 2.2;
  g.beginPath();
  g.moveTo(cx - 13, cy + 2);
  g.quadraticCurveTo(cx - 14, cy - 14, cx, cy - 16);
  g.quadraticCurveTo(cx + 14, cy - 14, cx + 13, cy + 2);
  // tattered bottom: four trailing points
  g.quadraticCurveTo(cx + 12, cy + 9 + hem(0), cx + 8, cy + 15 + hem(1));
  g.quadraticCurveTo(cx + 6, cy + 9, cx + 3, cy + 16 + hem(2));
  g.quadraticCurveTo(cx, cy + 9, cx - 3.5, cy + 15 + hem(3));
  g.quadraticCurveTo(cx - 7, cy + 9, cx - 10, cy + 14 + hem(0));
  g.quadraticCurveTo(cx - 13, cy + 8, cx - 13, cy + 2);
  g.closePath();
  const bgrad = g.createRadialGradient(cx - 4, cy - 10, 2, cx, cy, 22);
  bgrad.addColorStop(0, '#574080'); bgrad.addColorStop(0.6, '#3c2b5e'); bgrad.addColorStop(1, '#221540');
  g.fillStyle = bgrad; g.fill();
  g.lineWidth = 1.6; g.strokeStyle = 'rgba(170,120,255,0.7)'; g.stroke();
  g.restore();
  // hood shadow / face void
  g.fillStyle = '#120a26';
  g.beginPath(); g.ellipse(cx + 1, cy - 6.5, 8.6, 7, 0, 0, TAU); g.fill();
  // glowing eyes (flicker per frame)
  const ea = 0.75 + 0.25 * Math.sin(ph * 2 + 1);
  g.globalAlpha = ea;
  glowDot(g, cx - 2.5, cy - 7, 4.6, 'rgba(200,160,255,0.95)');
  glowDot(g, cx + 5, cy - 6.5, 4.6, 'rgba(200,160,255,0.95)');
  g.globalAlpha = 1;
  g.fillStyle = '#f4ecff';
  g.beginPath(); g.ellipse(cx - 2.5, cy - 7, 1.9, 2.5, 0.12, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(cx + 5, cy - 6.5, 1.9, 2.5, -0.12, 0, TAU); g.fill();
  // ghostly nub hands
  for (const s of [-1, 1]) {
    g.fillStyle = 'rgba(90,65,150,0.9)';
    g.beginPath();
    g.ellipse(cx + s * 14, cy + 1 + Math.sin(ph + s) * 1.5, 3.4, 2.4, s * 0.5, 0, TAU);
    g.fill();
    g.lineWidth = 1.2; g.strokeStyle = 'rgba(170,120,255,0.6)'; g.stroke();
  }
  // trailing wisp sparks
  g.globalAlpha = 0.7;
  glowDot(g, cx - 16 + Math.sin(ph) * 2, cy + 16, 2.6, 'rgba(170,120,255,0.8)');
  glowDot(g, cx + 14, cy + 18 + Math.cos(ph) * 2, 2.2, 'rgba(170,120,255,0.7)');
  g.globalAlpha = 1;
}

// ---------------------------------------------------------------------------
// Bubbles — glassy, rainbow rim, twin speculars, wobble squash
// ---------------------------------------------------------------------------
function paintBubbleBody(g, cx, cy, rx, ry, hueShift) {
  // soft outer glow
  g.save();
  g.shadowColor = 'rgba(150,200,255,0.6)'; g.shadowBlur = 7;
  const grad = g.createRadialGradient(cx - rx * 0.3, cy - ry * 0.4, 2, cx, cy, Math.max(rx, ry));
  grad.addColorStop(0, 'rgba(225,242,255,0.17)');
  grad.addColorStop(0.7, 'rgba(175,212,255,0.10)');
  grad.addColorStop(0.92, 'rgba(175,216,255,0.30)');
  grad.addColorStop(1, 'rgba(195,228,255,0.45)');
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  g.fillStyle = grad; g.fill();
  g.restore();
  // rainbow-tinted rim (segmented hues)
  const SEG = 14;
  g.lineCap = 'butt';
  for (let i = 0; i < SEG; i++) {
    const a0 = (i / SEG) * TAU + hueShift * 0.013;
    const a1 = a0 + TAU / SEG + 0.03;
    const hue = (i * (360 / SEG) + hueShift) % 360;
    g.strokeStyle = `hsla(${hue},85%,72%,0.55)`;
    g.lineWidth = 2.6;
    g.beginPath(); g.ellipse(cx, cy, rx - 1.4, ry - 1.4, 0, a0, a1); g.stroke();
  }
  // faint inner ring
  g.strokeStyle = 'rgba(255,255,255,0.14)'; g.lineWidth = 2.6;
  g.beginPath(); g.ellipse(cx, cy, rx - 5, ry - 5, 0, 0, TAU); g.stroke();
  // twin speculars
  g.save();
  g.translate(cx - rx * 0.4, cy - ry * 0.44); g.rotate(-0.65);
  const hg = g.createRadialGradient(0, 0, 0.5, 0, 0, rx * 0.32);
  hg.addColorStop(0, 'rgba(255,255,255,0.95)');
  hg.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = hg;
  g.beginPath(); g.ellipse(0, 0, rx * 0.3, ry * 0.16, 0, 0, TAU); g.fill();
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.55)';
  g.beginPath(); g.ellipse(cx + rx * 0.36, cy + ry * 0.42, rx * 0.1, ry * 0.07, 0.7, 0, TAU); g.fill();
}

function paintBubbleFloat(g, f) {
  const sq = [[1.06, 0.94], [0.99, 1.04], [0.94, 1.06], [1.04, 0.97]][f];
  paintBubbleBody(g, 32, 32, 24 * sq[0], 24 * sq[1], f * 26);
}

function paintBubblePop(g, f) {
  const cx = 32, cy = 32;
  if (f === 0) {
    g.save();
    g.shadowColor = 'rgba(190,225,255,0.9)'; g.shadowBlur = 10;
    g.strokeStyle = 'rgba(235,248,255,0.95)'; g.lineWidth = 4.5;
    g.beginPath(); g.arc(cx, cy, 24, 0, TAU); g.stroke();
    g.restore();
    glowDot(g, cx, cy, 13, 'rgba(255,255,255,0.85)');
    sparkle4(g, cx, cy, 9, 'rgba(255,255,255,0.95)');
    return;
  }
  const R = f === 1 ? 28 : 31;
  const segs = 8;
  g.strokeStyle = `rgba(220,240,255,${f === 1 ? 0.8 : 0.4})`;
  g.lineWidth = f === 1 ? 3 : 2; g.lineCap = 'round';
  for (let i = 0; i < segs; i++) {
    const a = (i / segs) * TAU + 0.25;
    g.beginPath(); g.arc(cx, cy, R, a, a + 0.34); g.stroke();
  }
  // flying droplets
  const dn = f === 1 ? 6 : 8;
  for (let i = 0; i < dn; i++) {
    const a = (i / dn) * TAU + f * 0.4;
    const rad = f === 1 ? 21 : 27;
    const x = cx + Math.cos(a) * rad, y = cy + Math.sin(a) * rad;
    const dr = (f === 1 ? 2.6 : 1.8) * (0.7 + ((i * 7) % 3) * 0.25);
    g.fillStyle = `rgba(205,235,255,${f === 1 ? 0.9 : 0.55})`;
    g.beginPath(); g.arc(x, y, dr, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.beginPath(); g.arc(x - dr * 0.3, y - dr * 0.3, dr * 0.35, 0, TAU); g.fill();
  }
  if (f === 2) {
    sparkle4(g, cx - 14, cy - 10, 4, 'rgba(255,255,255,0.7)');
    sparkle4(g, cx + 12, cy + 8, 3.4, 'rgba(255,255,255,0.6)');
  }
}

function paintBouncer(g, f) {
  const cx = 24, cy = f === 1 ? 28 : 24;
  const rx = f === 1 ? 21 : 18, ry = f === 1 ? 14 : 18;
  g.save();
  g.shadowColor = 'rgba(255,210,90,0.85)'; g.shadowBlur = 9;
  const grad = g.createRadialGradient(cx - rx * 0.3, cy - ry * 0.4, 2, cx, cy, Math.max(rx, ry));
  grad.addColorStop(0, 'rgba(255,250,220,0.5)');
  grad.addColorStop(0.65, 'rgba(255,215,110,0.30)');
  grad.addColorStop(1, 'rgba(255,185,55,0.65)');
  g.beginPath(); g.ellipse(cx, cy, rx, ry, 0, 0, TAU);
  g.fillStyle = grad; g.fill();
  g.lineWidth = 2.6; g.strokeStyle = 'rgba(255,225,140,0.95)'; g.stroke();
  g.restore();
  g.strokeStyle = 'rgba(255,255,255,0.4)'; g.lineWidth = 1.8;
  g.beginPath(); g.ellipse(cx, cy, rx - 4.5, ry - 4.5, 0, 0, TAU); g.stroke();
  // spring sheen arcs at the base
  g.strokeStyle = 'rgba(255,240,180,0.8)'; g.lineWidth = 2;
  g.beginPath(); g.ellipse(cx, cy + ry * 0.45, rx * 0.6, ry * 0.22, 0, 0.3, Math.PI - 0.3); g.stroke();
  // speculars + star glint
  g.fillStyle = 'rgba(255,255,255,0.9)';
  g.beginPath(); g.ellipse(cx - rx * 0.4, cy - ry * 0.42, rx * 0.22, ry * 0.13, -0.6, 0, TAU); g.fill();
  starPath(g, cx + rx * 0.3, cy - ry * 0.25, 4.6, 1.9, 4);
  g.fillStyle = 'rgba(255,255,235,0.95)'; g.fill();
}

// ---------------------------------------------------------------------------
// Items — juicy glossy snacks & glowing power-ups (36x36, center 18,18)
// ---------------------------------------------------------------------------
function leafSprig(g, x, y, ang) {
  g.save(); g.translate(x, y); g.rotate(ang);
  g.beginPath(); g.ellipse(4, 0, 4.4, 2.1, 0, 0, TAU);
  const lg = g.createLinearGradient(0, 0, 8, 0);
  lg.addColorStop(0, '#7ed957'); lg.addColorStop(1, '#3f9428');
  g.fillStyle = lg; g.fill();
  g.lineWidth = 1.1; g.strokeStyle = 'rgba(30,80,20,0.6)'; g.stroke();
  g.restore();
}

function paintCherry(g) {
  g.strokeStyle = '#7a5a2c'; g.lineWidth = 2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(18, 5); g.quadraticCurveTo(14, 11, 12.5, 19); g.stroke();
  g.beginPath(); g.moveTo(18, 5); g.quadraticCurveTo(23, 11, 24.5, 18); g.stroke();
  leafSprig(g, 18.5, 5.5, -0.5);
  const pal = { lite: '#ffb9c0', base: '#ff4a5e', dark: '#9c1028', line: 'rgba(110,10,35,0.55)' };
  blob(g, 12, 24.5, 6.8, 6.5, pal, { lw: 1.6 });
  blob(g, 24, 23.5, 6.4, 6.1, pal, { lw: 1.6 });
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.arc(9.8, 21.8, 1.7, 0, TAU); g.fill();
  g.beginPath(); g.arc(21.9, 21, 1.6, 0, TAU); g.fill();
}

function paintBlueberry(g) {
  leafSprig(g, 17, 8, -2.6);
  const pal = { lite: '#cdd9ff', base: '#5d7bf0', dark: '#27379b', line: 'rgba(20,28,95,0.55)' };
  blob(g, 18, 20.5, 9.6, 9.2, pal, { lw: 1.8 });
  // star calyx
  g.save(); g.translate(18, 14.5);
  starPath(g, 0, 0, 3.4, 1.4, 5, -Math.PI / 2);
  g.fillStyle = '#27379b'; g.fill();
  g.restore();
  // frosty bloom sheen
  g.strokeStyle = 'rgba(220,235,255,0.55)'; g.lineWidth = 1.8; g.lineCap = 'round';
  g.beginPath(); g.arc(18, 21, 6.4, Math.PI * 0.75, Math.PI * 1.2); g.stroke();
}

function paintBanana(g) {
  g.save(); g.translate(18, 18); g.rotate(0.35);
  g.beginPath();
  g.moveTo(-11, -5);
  g.quadraticCurveTo(0, 12, 11.5, -6.5);
  g.quadraticCurveTo(10, -1, 4, 4.5);
  g.quadraticCurveTo(-3, 9.5, -10, -1);
  g.closePath();
  const bg2 = g.createLinearGradient(-10, -6, 8, 8);
  bg2.addColorStop(0, '#ffefa8'); bg2.addColorStop(0.5, '#ffd84e'); bg2.addColorStop(1, '#e8a91f');
  g.fillStyle = bg2; g.fill();
  g.lineWidth = 1.7; g.strokeStyle = 'rgba(140,95,10,0.6)'; g.stroke();
  g.fillStyle = '#7a521a';
  g.beginPath(); g.ellipse(-11, -5.2, 1.8, 1.3, 0.6, 0, TAU); g.fill();
  g.beginPath(); g.ellipse(11.6, -6.6, 1.7, 1.2, -0.6, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(255,255,255,0.65)'; g.lineWidth = 1.6; g.lineCap = 'round';
  g.beginPath(); g.moveTo(-7, -2.5); g.quadraticCurveTo(0, 6.5, 7, -2.5); g.stroke();
  g.restore();
}

function paintMelon(g) {
  g.strokeStyle = '#6e4f24'; g.lineWidth = 2.2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(18, 9); g.quadraticCurveTo(20, 5.5, 23, 5); g.stroke();
  const pal = { lite: '#cdf7a4', base: '#6cc94e', dark: '#226e1f', line: 'rgba(18,70,15,0.6)' };
  blob(g, 18, 21, 10.4, 9.8, pal, { lw: 1.8 });
  // melon stripes
  g.strokeStyle = 'rgba(20,90,18,0.6)'; g.lineWidth = 2.4; g.lineCap = 'round';
  for (const dx of [-6, 0, 6]) {
    g.beginPath();
    g.moveTo(18 + dx, 12);
    g.quadraticCurveTo(18 + dx * 1.55, 21, 18 + dx, 30);
    g.stroke();
  }
  g.fillStyle = 'rgba(255,255,255,0.7)';
  g.beginPath(); g.ellipse(13, 15.5, 2.6, 1.6, -0.5, 0, TAU); g.fill();
}

function paintCrystalFruit(g) {
  g.save();
  g.shadowColor = 'rgba(90,255,230,0.9)'; g.shadowBlur = 8;
  g.beginPath();
  g.moveTo(18, 5.5); g.lineTo(26.5, 12); g.lineTo(25, 26); g.lineTo(18, 31.5);
  g.lineTo(11, 26); g.lineTo(9.5, 12);
  g.closePath();
  const cg = g.createLinearGradient(10, 6, 26, 31);
  cg.addColorStop(0, '#d6fff6'); cg.addColorStop(0.45, '#4fe0c8'); cg.addColorStop(1, '#1b8aa0');
  g.fillStyle = cg; g.fill();
  g.lineWidth = 1.6; g.strokeStyle = 'rgba(10,80,90,0.65)'; g.stroke();
  g.restore();
  // facets
  g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 1.1;
  g.beginPath();
  g.moveTo(18, 5.5); g.lineTo(15, 18); g.lineTo(18, 31.5);
  g.moveTo(15, 18); g.lineTo(9.5, 12);
  g.moveTo(15, 18); g.lineTo(25, 26);
  g.stroke();
  // magenta heart-glint
  glowDot(g, 20, 15, 4.5, 'rgba(255,130,220,0.75)');
  sparkle4(g, 13.5, 10.5, 3.6);
}

function paintRainbowFruit(g) {
  g.strokeStyle = '#6e4f24'; g.lineWidth = 2; g.lineCap = 'round';
  g.beginPath(); g.moveTo(18, 8.5); g.lineTo(19.5, 4.5); g.stroke();
  g.save();
  g.shadowColor = 'rgba(255,230,160,0.9)'; g.shadowBlur = 8;
  g.beginPath(); g.arc(18, 20, 10, 0, TAU);
  const rg2 = g.createLinearGradient(8, 10, 28, 30);
  rg2.addColorStop(0, '#ff6a7e'); rg2.addColorStop(0.25, '#ffb84e');
  rg2.addColorStop(0.5, '#ffe95e'); rg2.addColorStop(0.72, '#5fe87a');
  rg2.addColorStop(1, '#5aa8ff');
  g.fillStyle = rg2; g.fill();
  g.lineWidth = 1.7; g.strokeStyle = 'rgba(80,40,90,0.55)'; g.stroke();
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.ellipse(14, 14.5, 3, 1.9, -0.5, 0, TAU); g.fill();
  sparkle4(g, 24, 25, 3.2);
  leafSprig(g, 19.5, 5, -0.9);
}

function paintShoe(g) {
  // winged sneaker, side view facing right
  // sole
  rr(g, 4, 24, 28, 6.5, 3.2);
  const sg = g.createLinearGradient(0, 24, 0, 31);
  sg.addColorStop(0, '#ffffff'); sg.addColorStop(1, '#b9c2d8');
  g.fillStyle = sg; g.fill();
  g.lineWidth = 1.5; g.strokeStyle = 'rgba(50,55,80,0.6)'; g.stroke();
  // body
  g.beginPath();
  g.moveTo(6, 25);
  g.lineTo(6.5, 14.5);
  g.quadraticCurveTo(7, 10.5, 11, 10.5);
  g.lineTo(16, 10.5);
  g.quadraticCurveTo(22, 10.5, 26, 17);
  g.quadraticCurveTo(29.5, 21.5, 31, 25);
  g.closePath();
  const bg3 = g.createLinearGradient(6, 10, 26, 26);
  bg3.addColorStop(0, '#ff8d8d'); bg3.addColorStop(0.5, '#ff5a5a'); bg3.addColorStop(1, '#c22f3e');
  g.fillStyle = bg3; g.fill();
  g.strokeStyle = 'rgba(110,20,35,0.6)'; g.lineWidth = 1.6; g.stroke();
  // toe cap
  g.beginPath();
  g.moveTo(24, 25); g.quadraticCurveTo(26.5, 18.5, 31, 25);
  g.closePath();
  g.fillStyle = '#f2f4fa'; g.fill(); g.stroke();
  // laces
  g.strokeStyle = '#fff'; g.lineWidth = 1.8; g.lineCap = 'round';
  g.beginPath(); g.moveTo(10, 14.5); g.lineTo(15.5, 16.5); g.stroke();
  g.beginPath(); g.moveTo(10, 18); g.lineTo(16.5, 20); g.stroke();
  // heel wing
  g.save();
  g.shadowColor = 'rgba(255,255,255,0.7)'; g.shadowBlur = 4;
  g.beginPath();
  g.moveTo(7, 16);
  g.quadraticCurveTo(-2, 8, 3.5, 5.5);
  g.quadraticCurveTo(4.5, 9.5, 8, 9.5);
  g.quadraticCurveTo(11, 12, 7, 16);
  g.closePath();
  g.fillStyle = '#ffffff'; g.fill();
  g.lineWidth = 1.2; g.strokeStyle = 'rgba(120,140,190,0.7)'; g.stroke();
  g.restore();
  g.strokeStyle = 'rgba(120,140,190,0.55)'; g.lineWidth = 1;
  g.beginPath(); g.moveTo(6, 13); g.quadraticCurveTo(2.5, 10, 4, 7.5); g.stroke();
}

function paintCandy(g, lite, base, dark, line) {
  const cx = 18, cy = 18;
  // wrapper twists
  for (const s of [-1, 1]) {
    g.beginPath();
    g.moveTo(cx + s * 7.5, cy - 2.5);
    g.lineTo(cx + s * 14.5, cy - 6);
    g.quadraticCurveTo(cx + s * 16, cy, cx + s * 14.5, cy + 6);
    g.lineTo(cx + s * 7.5, cy + 2.5);
    g.closePath();
    const wg = g.createLinearGradient(cx + s * 7, cy - 5, cx + s * 15, cy + 5);
    wg.addColorStop(0, lite); wg.addColorStop(1, dark);
    g.fillStyle = wg; g.fill();
    g.lineWidth = 1.4; g.strokeStyle = line; g.stroke();
    g.strokeStyle = 'rgba(0,0,0,0.18)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(cx + s * 9, cy - 1.5); g.lineTo(cx + s * 13, cy - 4); g.stroke();
    g.beginPath(); g.moveTo(cx + s * 9, cy + 1.5); g.lineTo(cx + s * 13, cy + 4); g.stroke();
  }
  // candy body
  blob(g, cx, cy, 8.4, 7, { lite, base, dark, line }, { lw: 1.6 });
  // sheen stripe
  g.strokeStyle = 'rgba(255,255,255,0.65)'; g.lineWidth = 2.4; g.lineCap = 'round';
  g.beginPath(); g.arc(cx, cy + 1.5, 5.6, Math.PI * 1.15, Math.PI * 1.6); g.stroke();
  sparkle4(g, cx + 4.5, cy - 4, 2.4, 'rgba(255,255,255,0.8)');
}

const paintCandyRed = (g) => paintCandy(g, '#ffb9b9', '#ff4d5e', '#a3122c', 'rgba(110,10,30,0.6)');
const paintCandyYellow = (g) => paintCandy(g, '#fff3b0', '#ffce3d', '#c08a12', 'rgba(130,90,8,0.6)');
const paintCandyPurple = (g) => paintCandy(g, '#e3c3ff', '#a85ce8', '#5f2a99', 'rgba(70,20,110,0.6)');

function paintStar(g, f) {
  const cx = 18, cy = 18.5;
  const R = f === 1 ? 13.5 : 12.3, r = R * 0.44;
  g.save();
  g.shadowColor = 'rgba(255,220,90,0.95)'; g.shadowBlur = f === 1 ? 11 : 7;
  starPath(g, cx, cy, R, r, 5);
  const sg = g.createRadialGradient(cx - 3, cy - 4, 1, cx, cy, R);
  sg.addColorStop(0, '#fffbe0'); sg.addColorStop(0.55, '#ffd84e'); sg.addColorStop(1, '#f0a51e');
  g.fillStyle = sg; g.fill();
  g.lineWidth = 1.7; g.strokeStyle = 'rgba(150,95,10,0.65)'; g.stroke();
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.ellipse(cx - 3.4, cy - 4, 2.6, 1.6, -0.6, 0, TAU); g.fill();
  if (f === 1) {
    sparkle4(g, cx + 10, cy - 9, 4.4);
    sparkle4(g, cx - 10.5, cy + 8, 3.4, 'rgba(255,255,255,0.75)');
  }
}

function paintGem(g, f) {
  const cx = 18, cy = 18;
  g.save();
  g.shadowColor = 'rgba(90,220,255,0.9)'; g.shadowBlur = f === 1 ? 10 : 6;
  g.beginPath();
  g.moveTo(9, 13); g.lineTo(13.5, 7.5); g.lineTo(22.5, 7.5); g.lineTo(27, 13);
  g.lineTo(18, 28.5);
  g.closePath();
  const gg = g.createLinearGradient(9, 8, 26, 28);
  gg.addColorStop(0, '#e2fbff'); gg.addColorStop(0.45, '#5fd2f5'); gg.addColorStop(1, '#1f6fc0');
  g.fillStyle = gg; g.fill();
  g.lineWidth = 1.6; g.strokeStyle = 'rgba(15,60,110,0.7)'; g.stroke();
  g.restore();
  // facets
  g.strokeStyle = 'rgba(255,255,255,0.6)'; g.lineWidth = 1.1;
  g.beginPath();
  g.moveTo(9, 13); g.lineTo(27, 13);
  g.moveTo(13.5, 7.5); g.lineTo(14.5, 13); g.lineTo(18, 28.5);
  g.moveTo(22.5, 7.5); g.lineTo(21.5, 13); g.lineTo(18, 28.5);
  g.stroke();
  if (f === 0) {
    sparkle4(g, 13, 10.5, 2.8);
  } else {
    sparkle4(g, 24.5, 9.5, 4);
    sparkle4(g, 12, 19, 3, 'rgba(255,255,255,0.75)');
  }
}

function paintHeart(g, f) {
  const s = f === 1 ? 1.1 : 1;
  const cx = 18, cy = 18.5;
  g.save();
  g.translate(cx, cy); g.scale(s, s); g.translate(-cx, -cy);
  g.shadowColor = 'rgba(255,110,150,0.9)'; g.shadowBlur = f === 1 ? 11 : 7;
  g.beginPath();
  g.moveTo(cx, cy + 10.5);
  g.bezierCurveTo(cx - 13, cy + 1, cx - 10.5, cy - 10.5, cx - 4.5, cy - 8.5);
  g.bezierCurveTo(cx - 1.5, cy - 7.5, cx, cy - 5, cx, cy - 4);
  g.bezierCurveTo(cx, cy - 5, cx + 1.5, cy - 7.5, cx + 4.5, cy - 8.5);
  g.bezierCurveTo(cx + 10.5, cy - 10.5, cx + 13, cy + 1, cx, cy + 10.5);
  g.closePath();
  const hg = g.createRadialGradient(cx - 4, cy - 5, 1, cx, cy, 14);
  hg.addColorStop(0, '#ffd4de'); hg.addColorStop(0.5, '#ff5a7e'); hg.addColorStop(1, '#bb1340');
  g.fillStyle = hg; g.fill();
  g.lineWidth = 1.7; g.strokeStyle = 'rgba(130,8,50,0.6)'; g.stroke();
  g.restore();
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.beginPath(); g.ellipse(cx - 4.5 * s, cy - 4.5 * s, 2.8 * s, 1.8 * s, -0.5, 0, TAU); g.fill();
  if (f === 1) sparkle4(g, cx + 9, cy - 8, 3.4);
}

function paintBolt(g, f) {
  const cx = 18;
  // cork
  rr(g, 14.5, 4, 7, 5, 1.6);
  const kg = g.createLinearGradient(14, 4, 21, 9);
  kg.addColorStop(0, '#c89058'); kg.addColorStop(1, '#8a5c2c');
  g.fillStyle = kg; g.fill();
  g.lineWidth = 1.3; g.strokeStyle = 'rgba(80,50,15,0.7)'; g.stroke();
  // glass flask
  g.save();
  g.beginPath();
  g.moveTo(15.5, 9); g.lineTo(15.5, 13);
  g.quadraticCurveTo(8, 17, 8, 23.5);
  g.quadraticCurveTo(8, 31.5, 18, 31.5);
  g.quadraticCurveTo(28, 31.5, 28, 23.5);
  g.quadraticCurveTo(28, 17, 20.5, 13);
  g.lineTo(20.5, 9);
  g.closePath();
  const fg = g.createLinearGradient(8, 10, 28, 31);
  fg.addColorStop(0, 'rgba(225,242,255,0.75)');
  fg.addColorStop(0.5, 'rgba(170,212,245,0.55)');
  fg.addColorStop(1, 'rgba(130,175,225,0.7)');
  g.fillStyle = fg; g.fill();
  g.lineWidth = 1.6; g.strokeStyle = 'rgba(60,95,150,0.7)'; g.stroke();
  g.restore();
  // lightning bolt inside
  g.save();
  g.shadowColor = 'rgba(255,235,100,1)'; g.shadowBlur = f === 1 ? 9 : 5;
  g.beginPath();
  g.moveTo(19.5, 14.5); g.lineTo(14, 22.5); g.lineTo(17.5, 23); g.lineTo(15.5, 29);
  g.lineTo(22.5, 21.5); g.lineTo(19, 21); g.lineTo(21.5, 14.5);
  g.closePath();
  const bg4 = g.createLinearGradient(14, 14, 22, 29);
  bg4.addColorStop(0, '#fffbd0'); bg4.addColorStop(1, '#ffce2e');
  g.fillStyle = bg4; g.fill();
  g.lineWidth = 1; g.strokeStyle = 'rgba(180,120,0,0.7)'; g.stroke();
  g.restore();
  // glass shine
  g.strokeStyle = 'rgba(255,255,255,0.7)'; g.lineWidth = 1.7; g.lineCap = 'round';
  g.beginPath(); g.arc(18, 23, 7.2, Math.PI * 0.85, Math.PI * 1.25); g.stroke();
  if (f === 1) {
    sparkle4(g, 26, 14, 3.4);
    sparkle4(g, 10.5, 27, 2.6, 'rgba(255,250,200,0.85)');
  }
}

// ---------------------------------------------------------------------------
// Tiles, hazards, HUD, logo, spark
// ---------------------------------------------------------------------------
const TILE_PAL = {
  moss:    { lite: '#8fbf72', base: '#55804b', dark: '#2c4a2c', edge: '#b5e08e', fleck: '#1e3520' },
  crystal: { lite: '#9fb4ea', base: '#5d6fae', dark: '#323c70', edge: '#cfe0ff', fleck: '#8fe8ff' },
  ember:   { lite: '#b07a5e', base: '#7c4a38', dark: '#46251d', edge: '#d89a70', fleck: '#ff8c42' },
  abyss:   { lite: '#6b72a8', base: '#414a7c', dark: '#23284e', edge: '#9aa2d8', fleck: '#aab8ff' },
  gold:    { lite: '#e0bb6e', base: '#a8823c', dark: '#64481c', edge: '#ffe9a8', fleck: '#fff3c0' },
};

const TILE_FLECKS = [[8, 10], [22, 8], [14, 19], [25, 22], [7, 24]];

function paintTileSolid(g, pal) {
  rr(g, 1, 1, 30, 30, 7);
  const tg = g.createLinearGradient(2, 2, 30, 30);
  tg.addColorStop(0, pal.lite); tg.addColorStop(0.5, pal.base); tg.addColorStop(1, pal.dark);
  g.fillStyle = tg; g.fill();
  g.lineWidth = 1.8; g.strokeStyle = 'rgba(0,0,0,0.42)'; g.stroke();
  // top bevel highlight
  rr(g, 3.5, 3.5, 25, 8.5, 4.5);
  g.fillStyle = 'rgba(255,255,255,0.20)'; g.fill();
  g.strokeStyle = pal.edge; g.globalAlpha = 0.65; g.lineWidth = 1.4;
  g.beginPath(); g.moveTo(6, 4); g.lineTo(26, 4); g.stroke();
  g.globalAlpha = 1;
  // bottom inner shadow
  rr(g, 3.5, 20, 25, 8.5, 4.5);
  g.fillStyle = 'rgba(0,0,0,0.20)'; g.fill();
  // flecks
  for (let i = 0; i < TILE_FLECKS.length; i++) {
    const [fx, fy] = TILE_FLECKS[i];
    g.fillStyle = i % 2 === 0 ? pal.fleck : pal.edge;
    g.globalAlpha = 0.55;
    g.beginPath(); g.arc(fx, fy, i % 2 === 0 ? 1.5 : 1.1, 0, TAU); g.fill();
  }
  g.globalAlpha = 1;
}

function paintTilePlat(g, pal) {
  rr(g, 1, 2.5, 30, 10.5, 5);
  const tg = g.createLinearGradient(0, 2, 0, 13);
  tg.addColorStop(0, pal.lite); tg.addColorStop(0.55, pal.base); tg.addColorStop(1, pal.dark);
  g.fillStyle = tg; g.fill();
  g.lineWidth = 1.7; g.strokeStyle = 'rgba(0,0,0,0.42)'; g.stroke();
  g.strokeStyle = pal.edge; g.globalAlpha = 0.7; g.lineWidth = 1.3;
  g.beginPath(); g.moveTo(5, 4.5); g.lineTo(27, 4.5); g.stroke();
  g.globalAlpha = 1;
  // little hanging nubs
  for (const nx of [7, 21]) {
    rr(g, nx, 12, 5, 4.5, 2);
    g.fillStyle = pal.dark; g.fill();
    g.lineWidth = 1.2; g.strokeStyle = 'rgba(0,0,0,0.4)'; g.stroke();
  }
  g.fillStyle = pal.fleck; g.globalAlpha = 0.6;
  g.beginPath(); g.arc(11, 8.5, 1.2, 0, TAU); g.fill();
  g.beginPath(); g.arc(24, 7.5, 1, 0, TAU); g.fill();
  g.globalAlpha = 1;
}

function paintSpike(g) {
  const spikes = [[16, 5, 6.5], [7.5, 14, 4.6], [25, 15.5, 4.4]];
  g.save();
  g.shadowColor = 'rgba(150,220,255,0.6)'; g.shadowBlur = 4;
  for (const [sx, topY, hw] of spikes) {
    g.beginPath();
    g.moveTo(sx - hw, 32);
    g.quadraticCurveTo(sx - hw * 0.5, topY + (32 - topY) * 0.45, sx, topY);
    g.quadraticCurveTo(sx + hw * 0.5, topY + (32 - topY) * 0.45, sx + hw, 32);
    g.closePath();
    const sg = g.createLinearGradient(sx - hw, topY, sx + hw, 32);
    sg.addColorStop(0, '#eafbff'); sg.addColorStop(0.5, '#9fd4ec'); sg.addColorStop(1, '#4a7fb0');
    g.fillStyle = sg; g.fill();
    g.lineWidth = 1.4; g.strokeStyle = 'rgba(25,55,95,0.6)'; g.stroke();
    // edge highlight
    g.strokeStyle = 'rgba(255,255,255,0.75)'; g.lineWidth = 1.1;
    g.beginPath();
    g.moveTo(sx - hw * 0.55, 31);
    g.quadraticCurveTo(sx - hw * 0.32, topY + (32 - topY) * 0.5, sx - 0.5, topY + 1.5);
    g.stroke();
  }
  g.restore();
}

function paintOrb(g, f) {
  const cx = 20, cy = 20;
  const R = f === 1 ? 17.5 : 16;
  // spiky corona
  g.save();
  g.shadowColor = 'rgba(255,90,30,0.9)'; g.shadowBlur = 8;
  starPath(g, cx, cy, R, R * 0.62, 8, f === 1 ? 0.42 : 0);
  g.fillStyle = 'rgba(255,95,35,0.4)'; g.fill();
  g.restore();
  // hot core
  const og = g.createRadialGradient(cx, cy, 0.5, cx, cy, R * 0.78);
  og.addColorStop(0, '#fff8d8');
  og.addColorStop(0.35, '#ffc24a');
  og.addColorStop(0.7, '#ff5e1f');
  og.addColorStop(1, 'rgba(255,45,10,0.15)');
  g.fillStyle = og;
  g.beginPath(); g.arc(cx, cy, R * 0.78, 0, TAU); g.fill();
  g.strokeStyle = 'rgba(255,170,90,0.85)'; g.lineWidth = 1.6;
  g.beginPath(); g.arc(cx, cy, R * 0.62, 0, TAU); g.stroke();
  g.fillStyle = 'rgba(255,255,240,0.9)';
  g.beginPath(); g.ellipse(cx - 4, cy - 4.5, 2.6, 1.7, -0.6, 0, TAU); g.fill();
}

function paintLife(g, pal) {
  const cx = 14, cy = 15;
  frond(g, cx - 9, cy - 6, Math.PI + 0.5, 6.5, pal);
  frond(g, cx - 10, cy - 1.5, Math.PI - 0.15, 7, pal);
  frond(g, cx + 9, cy - 6, -0.5, 6.5, pal);
  frond(g, cx + 10, cy - 1.5, 0.15, 7, pal);
  blob(g, cx, cy, 10.5, 10, pal, { lw: 1.7 });
  const eo = { lid: pal.baseLid, lidCol: pal.lid, iris: pal.iris, look: 0 };
  eye(g, cx - 4, cy - 1.5, 2.9, eo);
  eye(g, cx + 4, cy - 1.5, 2.9, eo);
  blush(g, cx - 7.5, cy + 2.5, 1.7); blush(g, cx + 7.5, cy + 2.5, 1.7);
  g.strokeStyle = 'rgba(44,32,70,0.85)'; g.lineWidth = 1.3; g.lineCap = 'round';
  g.beginPath(); g.arc(cx, cy + 3.5, 2.4, 0.35, Math.PI - 0.35); g.stroke();
}

function paintLogo(g) {
  const drawLine = (txt, cy, size) => {
    const c = mk(520, 120);
    const lg = c.getContext('2d');
    lg.font = `900 ${size}px "Arial Rounded MT Bold", Verdana, sans-serif`;
    lg.textAlign = 'center'; lg.textBaseline = 'middle';
    const widths = [...txt].map((ch) => lg.measureText(ch).width);
    const track = 3;
    const total = widths.reduce((a, b) => a + b, 0) + track * (txt.length - 1);
    let x = 260 - total / 2;
    for (let i = 0; i < txt.length; i++) {
      const lx = x + widths[i] / 2;
      const ly = 60 + Math.sin(i * 1.15 + 0.4) * 4.5;
      lg.save();
      lg.translate(lx, ly); lg.rotate(Math.sin(i * 1.4 + 0.8) * 0.05);
      lg.lineJoin = 'round';
      lg.lineWidth = 13; lg.strokeStyle = '#13204a'; lg.strokeText(txt[i], 0, 0);
      lg.lineWidth = 6.5; lg.strokeStyle = '#2a3f7e'; lg.strokeText(txt[i], 0, 0);
      const tg = lg.createLinearGradient(0, -size * 0.5, 0, size * 0.5);
      tg.addColorStop(0, '#eaffff'); tg.addColorStop(0.35, '#9fe8ff');
      tg.addColorStop(0.72, '#41b4ee'); tg.addColorStop(1, '#2f7fd6');
      lg.fillStyle = tg; lg.fillText(txt[i], 0, 0);
      lg.restore();
      x += widths[i] + track;
    }
    // gloss band clipped to the letters
    lg.globalCompositeOperation = 'source-atop';
    lg.fillStyle = 'rgba(255,255,255,0.30)';
    lg.beginPath(); lg.ellipse(260, 32, 252, 21, -0.025, 0, TAU); lg.fill();
    lg.globalCompositeOperation = 'source-over';
    g.save();
    g.shadowColor = 'rgba(90,200,255,0.55)'; g.shadowBlur = 14;
    g.drawImage(c, 0, cy - 60);
    g.restore();
  };
  drawLine('BUBBLE', 56, 74);
  drawLine('CAVERNS', 142, 74);
  // floating mini-bubbles
  const minis = [[36, 38, 11], [488, 50, 9], [62, 160, 7], [470, 152, 12], [250, 102, 6]];
  for (const [bx, by, br] of minis) {
    const grad = g.createRadialGradient(bx - br * 0.3, by - br * 0.4, 0.5, bx, by, br);
    grad.addColorStop(0, 'rgba(220,242,255,0.25)');
    grad.addColorStop(0.9, 'rgba(170,215,255,0.30)');
    grad.addColorStop(1, 'rgba(195,230,255,0.55)');
    g.fillStyle = grad;
    g.beginPath(); g.arc(bx, by, br, 0, TAU); g.fill();
    g.strokeStyle = 'rgba(200,235,255,0.7)'; g.lineWidth = 1.4; g.stroke();
    g.fillStyle = 'rgba(255,255,255,0.85)';
    g.beginPath(); g.arc(bx - br * 0.35, by - br * 0.38, br * 0.22, 0, TAU); g.fill();
  }
  sparkle4(g, 122, 26, 7);
  sparkle4(g, 420, 178, 6, 'rgba(255,255,255,0.8)');
}

function paintSpark(g) {
  const grad = g.createRadialGradient(6, 6, 0.3, 6, 6, 6);
  grad.addColorStop(0, 'rgba(255,255,255,0.95)');
  grad.addColorStop(0.4, 'rgba(220,240,255,0.55)');
  grad.addColorStop(1, 'rgba(190,225,255,0)');
  g.fillStyle = grad;
  g.beginPath(); g.arc(6, 6, 6, 0, TAU); g.fill();
}

// ---------------------------------------------------------------------------
// Backgrounds — layered cave scenes, static layers cached per theme
// ---------------------------------------------------------------------------
const BG_THEMES = {
  moss: {
    seed: 101, sky: ['#2b5a3c', '#16301f', '#091509'],
    far: '#33684a', mid: '#1e4630', near: '#0c2114',
    mote: '142,255,205', moteMode: 'rise', moteN: 34,
  },
  crystal: {
    seed: 202, sky: ['#27407c', '#15224a', '#080d22'],
    far: '#33518f', mid: '#1d3162', near: '#0b1330',
    mote: '160,230,255', moteMode: 'twinkle', moteN: 44,
  },
  ember: {
    seed: 303, sky: ['#54231a', '#2e100c', '#150504'],
    far: '#633020', mid: '#3c1812', near: '#1c0806',
    mote: '255,170,90', moteMode: 'rise', moteN: 40,
  },
  abyss: {
    seed: 404, sky: ['#1d2250', '#10142e', '#040510'],
    far: '#272f63', mid: '#161b40', near: '#070a1d',
    mote: '160,175,255', moteMode: 'drift', moteN: 26, shaft: '190,205,255',
  },
  gold: {
    seed: 505, sky: ['#5e4318', '#33230c', '#150d04'],
    far: '#6e5224', mid: '#41300f', near: '#1d1404',
    mote: '255,233,160', moteMode: 'twinkle', moteN: 48, shaft: '255,225,150',
  },
};

const bgCache = Object.create(null);
let vignetteCanvas = null;

function getVignette() {
  if (vignetteCanvas) return vignetteCanvas;
  vignetteCanvas = mk(W, H);
  const g = vignetteCanvas.getContext('2d');
  const vg = g.createRadialGradient(W / 2, H / 2 - 30, 240, W / 2, H / 2, 640);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(0.6, 'rgba(0,0,0,0.08)');
  vg.addColorStop(1, 'rgba(0,0,0,0.42)');
  g.fillStyle = vg; g.fillRect(0, 0, W, H);
  return vignetteCanvas;
}

// silhouetted stalactite/stalagmite band
function stalBand(g, rnd, color, yBase, down, hMin, hMax, wMin, wMax) {
  g.fillStyle = color;
  g.beginPath();
  if (down) g.rect(-12, -12, W + 24, yBase + 12);
  else g.rect(-12, yBase, W + 24, H - yBase + 12);
  let x = -10;
  const dir = down ? 1 : -1;
  while (x < W + 10) {
    const w2 = wMin + rnd() * (wMax - wMin);
    const h2 = hMin + rnd() * (hMax - hMin);
    g.moveTo(x, yBase);
    g.quadraticCurveTo(x + w2 * 0.22, yBase + dir * h2 * 0.72, x + w2 * 0.5, yBase + dir * h2);
    g.quadraticCurveTo(x + w2 * 0.78, yBase + dir * h2 * 0.72, x + w2, yBase);
    x += w2 * (0.55 + rnd() * 0.45);
  }
  g.fill();
}

function paintMushroom(g, glow, x, y, s, col, glowCol) {
  // stem
  g.fillStyle = 'rgba(225,240,225,0.75)';
  g.beginPath();
  g.moveTo(x - 2.4 * s, y);
  g.quadraticCurveTo(x - 1.6 * s, y - 7 * s, x - 1.2 * s, y - 9 * s);
  g.lineTo(x + 1.2 * s, y - 9 * s);
  g.quadraticCurveTo(x + 1.6 * s, y - 7 * s, x + 2.4 * s, y);
  g.closePath(); g.fill();
  // cap
  const cg = g.createRadialGradient(x - 2 * s, y - 12 * s, s, x, y - 9.5 * s, 8 * s);
  cg.addColorStop(0, col[0]); cg.addColorStop(1, col[1]);
  g.fillStyle = cg;
  g.beginPath(); g.ellipse(x, y - 9 * s, 7 * s, 4.6 * s, 0, Math.PI, TAU); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.beginPath(); g.ellipse(x - 2.4 * s, y - 11.4 * s, 2 * s, 1 * s, -0.4, 0, TAU); g.fill();
  const gg = glow.getContext('2d');
  const gd = gg.createRadialGradient(x, y - 9 * s, 1, x, y - 9 * s, 22 * s);
  gd.addColorStop(0, glowCol); gd.addColorStop(1, 'rgba(0,0,0,0)');
  gg.fillStyle = gd;
  gg.beginPath(); gg.arc(x, y - 9 * s, 22 * s, 0, TAU); gg.fill();
}

function paintCrystalCluster(g, glow, x, y, s, hueA, hueB, up = true) {
  const dir = up ? -1 : 1;
  const shards = [[-6, 16, -0.35], [0, 24, 0], [7, 14, 0.4]];
  for (let i = 0; i < shards.length; i++) {
    const [dx, len, ang] = shards[i];
    const col = i % 2 === 0 ? hueA : hueB;
    g.save();
    g.translate(x + dx * s, y); g.rotate(ang);
    const lg = g.createLinearGradient(0, 0, 0, dir * len * s);
    lg.addColorStop(0, col[1]); lg.addColorStop(1, col[0]);
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(-3.4 * s, 0); g.lineTo(-1.8 * s, dir * len * s * 0.92);
    g.lineTo(0, dir * len * s); g.lineTo(2 * s, dir * len * s * 0.85); g.lineTo(3.4 * s, 0);
    g.closePath(); g.fill();
    g.strokeStyle = 'rgba(255,255,255,0.30)'; g.lineWidth = 1;
    g.beginPath(); g.moveTo(-1.2 * s, 0); g.lineTo(-0.4 * s, dir * len * s * 0.9); g.stroke();
    g.restore();
  }
  const gg = glow.getContext('2d');
  const gd = gg.createRadialGradient(x, y + dir * 10 * s, 1, x, y + dir * 10 * s, 30 * s);
  gd.addColorStop(0, 'rgba(140,225,255,0.5)'); gd.addColorStop(1, 'rgba(0,0,0,0)');
  gg.fillStyle = gd;
  gg.beginPath(); gg.arc(x, y + dir * 10 * s, 30 * s, 0, TAU); gg.fill();
}

function buildShaft(tint) {
  const c = mk(W, H);
  const g = c.getContext('2d');
  const beams = [[150, 90], [430, 130], [700, 80], [880, 60]];
  for (const [bx, bw] of beams) {
    g.save();
    g.translate(bx, 0); g.rotate(0.16);
    const lg = g.createLinearGradient(0, 0, 0, 560);
    lg.addColorStop(0, `rgba(${tint},0.20)`);
    lg.addColorStop(0.55, `rgba(${tint},0.07)`);
    lg.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = lg;
    g.beginPath();
    g.moveTo(-bw * 0.32, 0); g.lineTo(bw * 0.32, 0);
    g.lineTo(bw * 0.62, 560); g.lineTo(-bw * 0.62, 560);
    g.closePath(); g.fill();
    g.restore();
  }
  return c;
}

function buildTheme(name) {
  const T = BG_THEMES[name];
  const rnd = mulberry32(T.seed);
  const base = mk(W, H);
  const glow = mk(W, H);
  const g = base.getContext('2d');

  // depth-layered gradient walls
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, T.sky[0]); sky.addColorStop(0.45, T.sky[1]); sky.addColorStop(1, T.sky[2]);
  g.fillStyle = sky; g.fillRect(0, 0, W, H);
  // faint wall texture blotches
  for (let i = 0; i < 26; i++) {
    const bx = rnd() * W, by = rnd() * H, br = 40 + rnd() * 110;
    const bg5 = g.createRadialGradient(bx, by, 1, bx, by, br);
    bg5.addColorStop(0, 'rgba(255,255,255,0.030)');
    bg5.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = bg5;
    g.beginPath(); g.arc(bx, by, br, 0, TAU); g.fill();
  }

  // three parallax depths of stalactites / stalagmites
  stalBand(g, rnd, T.far, 96, true, 30, 80, 60, 130);
  stalBand(g, rnd, T.far, 612, false, 26, 70, 70, 140);
  stalBand(g, rnd, T.mid, 58, true, 40, 120, 50, 110);
  stalBand(g, rnd, T.mid, 648, false, 34, 95, 55, 120);
  stalBand(g, rnd, T.near, 24, true, 50, 150, 45, 100);
  stalBand(g, rnd, T.near, 682, false, 40, 120, 50, 110);
  // side rock columns
  for (const [cx2, flip] of [[0, 1], [W, -1]]) {
    g.fillStyle = T.near;
    g.beginPath();
    g.moveTo(cx2, 0);
    g.quadraticCurveTo(cx2 + flip * (50 + rnd() * 30), H * 0.3, cx2 + flip * 26, H * 0.55);
    g.quadraticCurveTo(cx2 + flip * (60 + rnd() * 30), H * 0.8, cx2, H);
    g.closePath(); g.fill();
  }

  // theme accents
  if (name === 'moss') {
    const cols = [['#7dffce', '#1f9a72'], ['#c9ff8e', '#4f9a2e']];
    for (let i = 0; i < 7; i++) {
      const mx = 70 + rnd() * 820, my = 640 + rnd() * 40, s = 0.8 + rnd() * 1.7;
      paintMushroom(g, glow, mx, my, s, cols[i % 2],
        i % 2 === 0 ? 'rgba(90,255,200,0.40)' : 'rgba(170,255,120,0.32)');
    }
    // hanging vines
    g.strokeStyle = 'rgba(60,140,80,0.5)'; g.lineWidth = 2; g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      const vx = 40 + rnd() * 880, vl = 30 + rnd() * 90;
      g.beginPath(); g.moveTo(vx, 30 + rnd() * 60);
      g.quadraticCurveTo(vx + 8, 60 + vl * 0.5, vx - 4 + rnd() * 8, 60 + vl);
      g.stroke();
    }
  } else if (name === 'crystal') {
    const cyan = ['#5fe0ff', '#1b6fa8'], pink = ['#ff9fe0', '#9c2f86'];
    for (let i = 0; i < 6; i++) {
      const cx2 = 80 + rnd() * 800;
      paintCrystalCluster(g, glow, cx2, 660 + rnd() * 25, 0.9 + rnd() * 1.4,
        i % 2 ? pink : cyan, i % 2 ? cyan : pink, true);
    }
    for (let i = 0; i < 4; i++) {
      paintCrystalCluster(g, glow, 120 + rnd() * 720, 40 + rnd() * 35,
        0.7 + rnd() * 0.9, i % 2 ? cyan : pink, i % 2 ? pink : cyan, false);
    }
  } else if (name === 'ember') {
    // lava pool
    const ly = 668;
    const lava = g.createLinearGradient(0, ly, 0, H);
    lava.addColorStop(0, '#ffb24e'); lava.addColorStop(0.35, '#ff5a1c'); lava.addColorStop(1, '#9c1c08');
    g.fillStyle = lava; g.fillRect(0, ly, W, H - ly);
    g.fillStyle = 'rgba(255,235,160,0.65)';
    for (let i = 0; i < 14; i++) {
      g.beginPath();
      g.ellipse(rnd() * W, ly + 6 + rnd() * 22, 14 + rnd() * 34, 2.4, 0, 0, TAU);
      g.fill();
    }
    const gg = glow.getContext('2d');
    const gl = gg.createLinearGradient(0, ly - 130, 0, H);
    gl.addColorStop(0, 'rgba(0,0,0,0)');
    gl.addColorStop(1, 'rgba(255,120,40,0.55)');
    gg.fillStyle = gl; gg.fillRect(0, ly - 130, W, H - ly + 130);
    // glowing rock cracks
    for (let i = 0; i < 6; i++) {
      const kx = 60 + rnd() * 840, ky = 380 + rnd() * 220;
      gg.strokeStyle = 'rgba(255,140,60,0.55)'; gg.lineWidth = 2; gg.lineCap = 'round';
      gg.beginPath(); gg.moveTo(kx, ky);
      gg.lineTo(kx + 10 + rnd() * 14, ky + 8 + rnd() * 8);
      gg.lineTo(kx + 4 + rnd() * 10, ky + 20 + rnd() * 10);
      gg.stroke();
    }
  } else if (name === 'abyss') {
    // distant arch silhouettes
    g.strokeStyle = 'rgba(120,130,200,0.14)'; g.lineWidth = 14; g.lineCap = 'round';
    for (let i = 0; i < 3; i++) {
      const ax = 140 + i * 300 + rnd() * 80;
      g.beginPath(); g.arc(ax, 540, 110 + rnd() * 60, Math.PI, TAU); g.stroke();
    }
    // tiny watcher eyes in the dark
    const gg = glow.getContext('2d');
    for (let i = 0; i < 3; i++) {
      const ex = 90 + rnd() * 780, ey = 200 + rnd() * 300;
      for (const s of [-1, 1]) {
        const gd = gg.createRadialGradient(ex + s * 6, ey, 0.4, ex + s * 6, ey, 5);
        gd.addColorStop(0, 'rgba(190,205,255,0.85)'); gd.addColorStop(1, 'rgba(0,0,0,0)');
        gg.fillStyle = gd;
        gg.beginPath(); gg.arc(ex + s * 6, ey, 5, 0, TAU); gg.fill();
      }
    }
  } else if (name === 'gold') {
    // treasure mounds with coins & gems
    for (let i = 0; i < 4; i++) {
      const tx = 90 + rnd() * 760, ty = 686, ts = 0.8 + rnd() * 1.4;
      const mg = g.createRadialGradient(tx, ty - 18 * ts, 2, tx, ty, 60 * ts);
      mg.addColorStop(0, '#ffe9a0'); mg.addColorStop(0.55, '#d9a93f'); mg.addColorStop(1, '#7a5516');
      g.fillStyle = mg;
      g.beginPath(); g.ellipse(tx, ty, 54 * ts, 24 * ts, 0, Math.PI, TAU); g.fill();
      for (let j = 0; j < 10; j++) {
        const ca = rnd() * Math.PI, cr = rnd() * 42 * ts;
        const cxx = tx + Math.cos(ca + Math.PI) * cr, cyy = ty - Math.abs(Math.sin(ca)) * 18 * ts;
        g.fillStyle = j % 4 === 0 ? '#ffd23e' : (j % 4 === 1 ? '#ffeaa0' : (j % 4 === 2 ? '#6fe8ff' : '#ff8fd0'));
        g.beginPath(); g.ellipse(cxx, cyy, 3.4, 2.2, rnd() * 1, 0, TAU); g.fill();
      }
      const gg = glow.getContext('2d');
      const gd = gg.createRadialGradient(tx, ty - 14 * ts, 2, tx, ty - 8 * ts, 70 * ts);
      gd.addColorStop(0, 'rgba(255,220,110,0.40)'); gd.addColorStop(1, 'rgba(0,0,0,0)');
      gg.fillStyle = gd;
      gg.beginPath(); gg.arc(tx, ty - 8 * ts, 70 * ts, 0, TAU); gg.fill();
    }
  }

  // motes — typed arrays, zero per-frame allocation
  const n = T.moteN;
  const motes = {
    n,
    x: new Float32Array(n), y: new Float32Array(n), r: new Float32Array(n),
    ph: new Float32Array(n), sp: new Float32Array(n),
  };
  for (let i = 0; i < n; i++) {
    motes.x[i] = rnd() * W;
    motes.y[i] = rnd() * H;
    motes.r[i] = T.moteMode === 'twinkle' ? 2 + rnd() * 4 : 2.5 + rnd() * 5;
    motes.ph[i] = rnd() * TAU;
    motes.sp[i] = T.moteMode === 'rise' ? 14 + rnd() * 30
      : T.moteMode === 'drift' ? 0.6 + rnd() * 1.6
      : 0.7 + rnd() * 1.8;
  }
  // tinted mote sprite
  const mote = mk(24, 24);
  {
    const mg = mote.getContext('2d');
    const md = mg.createRadialGradient(12, 12, 0.5, 12, 12, 12);
    md.addColorStop(0, `rgba(${T.mote},0.95)`);
    md.addColorStop(0.35, `rgba(${T.mote},0.45)`);
    md.addColorStop(1, `rgba(${T.mote},0)`);
    mg.fillStyle = md;
    mg.beginPath(); mg.arc(12, 12, 12, 0, TAU); mg.fill();
  }

  return {
    base, glow, motes, mote,
    mode: T.moteMode,
    seed: T.seed * 0.013,
    shaft: T.shaft ? buildShaft(T.shaft) : null,
  };
}

export function drawBackground(ctx, theme, t) {
  const key = BG_THEMES[theme] ? theme : 'moss';
  const C = bgCache[key] || (bgCache[key] = buildTheme(key));
  ctx.drawImage(C.base, 0, 0);
  // animated ghost-light / treasure shafts
  if (C.shaft) {
    ctx.globalAlpha = 0.55 + 0.30 * Math.sin(t * 0.45 + C.seed);
    ctx.drawImage(C.shaft, (Math.sin(t * 0.12 + C.seed) * 26) | 0, 0);
    ctx.globalAlpha = 1;
  }
  // pulsing accent glow
  ctx.globalAlpha = 0.62 + 0.30 * Math.sin(t * 1.6 + C.seed);
  ctx.drawImage(C.glow, 0, 0);
  ctx.globalAlpha = 1;
  // drifting / twinkling motes (additive)
  const M = C.motes, n = M.n, img = C.mote;
  const prevOp = ctx.globalCompositeOperation;
  ctx.globalCompositeOperation = 'lighter';
  if (C.mode === 'rise') {
    for (let i = 0; i < n; i++) {
      let y = (M.y[i] - t * M.sp[i]) % H; if (y < 0) y += H;
      const x = M.x[i] + Math.sin(t * 0.7 + M.ph[i]) * 14;
      ctx.globalAlpha = 0.28 + 0.24 * Math.sin(t * 2.1 + M.ph[i]);
      const r = M.r[i];
      ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    }
  } else if (C.mode === 'twinkle') {
    for (let i = 0; i < n; i++) {
      const s = Math.sin(t * M.sp[i] + M.ph[i]);
      if (s <= 0.05) continue;
      ctx.globalAlpha = s * s * 0.85;
      const r = M.r[i] * (0.75 + 0.45 * s);
      ctx.drawImage(img, M.x[i] - r, M.y[i] - r, r * 2, r * 2);
    }
  } else { // drift
    for (let i = 0; i < n; i++) {
      let x = (M.x[i] + t * M.sp[i] * 9) % W; if (x < 0) x += W;
      const y = M.y[i] + Math.sin(t * 0.5 + M.ph[i]) * 12;
      ctx.globalAlpha = 0.22 + 0.18 * Math.sin(t * 1.4 + M.ph[i]);
      const r = M.r[i];
      ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
    }
  }
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = prevOp;
  // soft vignette
  ctx.drawImage(getVignette(), 0, 0);
}

// ---------------------------------------------------------------------------
// Painter registry
// ---------------------------------------------------------------------------
const PAINTERS = {};
for (const [pre, pal] of [['p1', P1PAL], ['p2', P2PAL]]) {
  for (const anim of ['idle', 'run', 'jump', 'fall', 'shoot', 'hit', 'cheer', 'death']) {
    PAINTERS[`${pre}_${anim}`] = (g, f) => drawDragon(g, pal, POSES[anim][f]);
  }
}
PAINTERS.bumbler_walk = paintBumbler;
PAINTERS.hopkin_walk = paintHopkin;
PAINTERS.snoot_walk = paintSnoot;
PAINTERS.wispel_fly = paintWispel;
PAINTERS.klonk_walk = paintKlonk;
PAINTERS.klonk_cracked_walk = paintKlonkCracked;
PAINTERS.grimble_fly = paintGrimble;
PAINTERS.boss_walk = paintBoss;
PAINTERS.boss_cracked = paintBossCracked;
PAINTERS.bubble_float = paintBubbleFloat;
PAINTERS.bubble_pop = paintBubblePop;
PAINTERS.bouncer = paintBouncer;
PAINTERS.cherry = paintCherry;
PAINTERS.blueberry = paintBlueberry;
PAINTERS.banana = paintBanana;
PAINTERS.melon = paintMelon;
PAINTERS.crystal_fruit = paintCrystalFruit;
PAINTERS.rainbow_fruit = paintRainbowFruit;
PAINTERS.shoe = paintShoe;
PAINTERS.candy_red = paintCandyRed;
PAINTERS.candy_yellow = paintCandyYellow;
PAINTERS.candy_purple = paintCandyPurple;
PAINTERS.star = paintStar;
PAINTERS.gem = paintGem;
PAINTERS.heart = paintHeart;
PAINTERS.bolt = paintBolt;
for (const th of ['moss', 'crystal', 'ember', 'abyss', 'gold']) {
  PAINTERS[`tile_solid_${th}`] = (g) => paintTileSolid(g, TILE_PAL[th]);
  PAINTERS[`tile_plat_${th}`] = (g) => paintTilePlat(g, TILE_PAL[th]);
}
PAINTERS.spike = paintSpike;
PAINTERS.orb = paintOrb;
PAINTERS.life_p1 = (g) => paintLife(g, P1PAL);
PAINTERS.life_p2 = (g) => paintLife(g, P2PAL);
PAINTERS.logo = paintLogo;
PAINTERS.spark = paintSpark;
