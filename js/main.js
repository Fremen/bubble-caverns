// Boot: canvas/DPR setup, fixed-timestep loop, audio unlock, global keys,
// and the deterministic test harness (?test=1&seed=N&level=N&mute=1).

import { WIDTH, HEIGHT, STEP } from './constants.js';
import { initSprites } from './sprites.js';
import { AudioSys } from './audio.js?v=20260917b';
import { Input } from './input.js';
import { Game } from './game.js';
import { validateLevels } from './levels.js';

const params = new URLSearchParams(location.search);
const TEST = params.get('test') === '1';
const SEED = parseInt(params.get('seed') || '0', 10) || undefined;

const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
let dpr = 0;

function fit() {
  // pick up devicePixelRatio changes (monitor moves, zoom) as well as resizes
  const want = Math.min(2, window.devicePixelRatio || 1);
  if (want !== dpr) {
    dpr = want;
    canvas.width = WIDTH * dpr;
    canvas.height = HEIGHT * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
  }
  const scale = Math.min(window.innerWidth / WIDTH, window.innerHeight / HEIGHT) * 0.98;
  canvas.style.width = `${WIDTH * scale}px`;
  canvas.style.height = `${HEIGHT * scale}px`;
}
window.addEventListener('resize', fit);
fit();

// boot
const issues = validateLevels();
if (issues.length) console.warn('Level validation issues:', issues);
try {
  initSprites();
} catch (err) {
  console.error('Sprite init failed:', err);
  ctx.fillStyle = '#fff';
  ctx.font = '20px sans-serif';
  ctx.fillText('Asset init failed — see console', 40, 60);
  throw err;
}
AudioSys.init();
if (params.get('mute') === '1') AudioSys.setMuted(true);

Input.attach(window);
// unlock is idempotent — keep re-arming it so audio recovers if the
// AudioContext gets suspended (tab switches, OS interruptions)
window.addEventListener('pointerdown', () => AudioSys.unlock());
document.addEventListener('visibilitychange', () => { if (!document.hidden) AudioSys.unlock(); });

window.addEventListener('keydown', e => {
  AudioSys.unlock();
  if (e.code === 'KeyM' && !e.repeat) AudioSys.setMuted(!AudioSys.muted);
});

const game = new Game({ seed: SEED });
game.enterState('title');

// auto-pause when the tab loses focus mid-game
window.addEventListener('blur', () => {
  if (game.stateT > 2) game.requestPause();
});

if (TEST) {
  // deterministic harness: no RAF — callers advance time manually
  const startLevel = parseInt(params.get('level') || '0', 10) || 0;
  window.__game = {
    game,
    start(mode = 1, level = startLevel) { game.startGame(mode, level); },
    step(frames = 1) {
      for (let i = 0; i < frames; i++) game.update(STEP);
      game.draw(ctx);
      return game.snapshot();
    },
    key(code, down) { Input.inject(code, down); },
    tap(code, frames = 2) {
      Input.inject(code, true);
      this.step(frames);
      Input.inject(code, false);
    },
    snapshot() { return game.snapshot(); },
    loadLevel(i) { game.loadLevel(i); game.enterState('play'); },
  };
  game.draw(ctx);
  console.log('[test] harness ready — window.__game');
} else {
  let last = performance.now();
  let acc = 0;
  function frame(now) {
    acc += Math.min(0.1, (now - last) / 1000);
    last = now;
    let n = 0;
    while (acc >= STEP && n < 5) { game.update(STEP); acc -= STEP; n++; }
    game.draw(ctx);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
}
