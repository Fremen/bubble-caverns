// HUD, banners, and full-screen menus (title / how-to / level select /
// high scores / name entry / pause / game over). Pure draw + menu helpers;
// the Game state machine drives which screen is shown.

import { WIDTH, HEIGHT, PLAY_Y, COLORS, TIMERS } from './constants.js';
import { clamp, fmtScore, easeOutBack } from './utils.js';
import { sprite, drawBackground } from './sprites.js';
import { AudioSys } from './audio.js?v=20260917d';
import { LEVELS } from './levels.js';

const FONT = "'Arial Rounded MT Bold', 'Nunito', 'Trebuchet MS', sans-serif";

export function drawText(ctx, str, x, y, opts = {}) {
  const { size = 18, align = 'center', fill = '#fff', stroke = 'rgba(10,16,38,0.9)', strokeW = Math.max(2, size / 7), glow = null, weight = 800, alpha = 1 } = opts;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.font = `${weight} ${size}px ${FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  if (glow) { ctx.shadowColor = glow; ctx.shadowBlur = size * 0.8; }
  if (stroke) { ctx.lineWidth = strokeW; ctx.strokeStyle = stroke; ctx.lineJoin = 'round'; ctx.strokeText(str, x, y); }
  ctx.fillStyle = fill;
  ctx.fillText(str, x, y);
  ctx.restore();
}

export class Menu {
  constructor(items) { this.items = items; this.idx = 0; }
  update(input) {
    if (input.menuPressed('up')) { this.idx = (this.idx + this.items.length - 1) % this.items.length; AudioSys.play('menu_move'); }
    if (input.menuPressed('down')) { this.idx = (this.idx + 1) % this.items.length; AudioSys.play('menu_move'); }
    if (input.menuPressed('confirm')) { AudioSys.play('menu_select'); return this.idx; }
    return null;
  }
  draw(ctx, x, y, t, opts = {}) {
    const gap = opts.gap || 44;
    this.items.forEach((item, i) => {
      const sel = i === this.idx;
      const wob = sel ? Math.sin(t * 6) * 3 : 0;
      if (sel) {
        const img = sprite('bubble_float', Math.floor(t * 5) % 4);
        ctx.save(); ctx.globalAlpha = 0.85;
        ctx.drawImage(img, x - 150 - 20 + wob, y + i * gap - 20, 40, 40);
        ctx.restore();
      }
      drawText(ctx, item, x, y + i * gap, {
        size: sel ? 28 : 24,
        fill: sel ? COLORS.hi : '#e8ecff',
        glow: sel ? 'rgba(255,215,94,0.7)' : null,
      });
    });
  }
}

// ---------------------------------------------------------------- HUD

let hudGrad = null;  // built once — invariant, and per-frame gradients are pure garbage

export function drawHUD(game, ctx, t) {
  // top bar
  if (!hudGrad) {
    hudGrad = ctx.createLinearGradient(0, 0, 0, PLAY_Y);
    hudGrad.addColorStop(0, 'rgba(12,16,40,0.96)');
    hudGrad.addColorStop(1, 'rgba(12,16,40,0.78)');
  }
  ctx.fillStyle = hudGrad;
  ctx.fillRect(0, 0, WIDTH, PLAY_Y);
  ctx.fillStyle = 'rgba(123,232,200,0.25)';
  ctx.fillRect(0, PLAY_Y - 2, WIDTH, 2);

  // P1
  drawText(ctx, 'PUFF', 80, 14, { size: 13, fill: COLORS.p1, align: 'center' });
  drawText(ctx, game.score.fmt(0), 80, 34, { size: 20, align: 'center' });
  drawLives(ctx, game.players[0], 'life_p1', 30, 52);

  // HI
  drawText(ctx, 'HI-SCORE', WIDTH / 2, 14, { size: 13, fill: COLORS.hi });
  drawText(ctx, fmtScore(game.score.hi), WIDTH / 2, 34, { size: 20, fill: COLORS.hi });
  drawText(ctx, `${game.levelIndex + 1} · ${game.level.name}`, WIDTH / 2, 54, { size: 12, fill: '#aab4e8' });

  // P2
  if (game.mode === 2) {
    drawText(ctx, 'PLOP', WIDTH - 80, 14, { size: 13, fill: COLORS.p2 });
    drawText(ctx, game.score.fmt(1), WIDTH - 80, 34, { size: 20 });
    drawLives(ctx, game.players[1], 'life_p2', WIDTH - 130, 52);
  } else {
    drawText(ctx, 'ROUND ' + (game.levelIndex + 1), WIDTH - 80, 24, { size: 14, fill: '#8a93c4' });
  }

  // timer bar
  const frac = clamp(game.level.time / game.level.timeMax, 0, 1);
  const barW = 280, bx = WIDTH / 2 - barW / 2, by = PLAY_Y - 10;
  ctx.fillStyle = 'rgba(255,255,255,0.12)';
  roundRect(ctx, bx, by, barW, 6, 3); ctx.fill();
  const urgent = game.level.time <= TIMERS.HURRY_AT;
  const pulse = urgent ? 0.6 + 0.4 * Math.sin(t * 10) : 1;
  ctx.fillStyle = urgent ? `rgba(255,84,112,${pulse})` : '#7be8c8';
  roundRect(ctx, bx, by, barW * frac, 6, 3); ctx.fill();

  // active power-up icons (below HUD, right side)
  drawPowerups(game, ctx);
}

function drawLives(ctx, player, icon, x, y) {
  if (!player) return;
  const n = Math.min(player.lives, 6);
  for (let i = 0; i < n; i++) {
    const img = sprite(icon, 0);
    ctx.drawImage(img, x + i * 22, y - 9, 18, 18);
  }
}

const POWERUP_ICONS = [
  ['speed', 'shoe'], ['rapid', 'candy_red'], ['range', 'candy_yellow'],
  ['big', 'candy_purple'], ['star', 'star'], ['multi', 'gem'],
];

function drawPowerups(game, ctx) {
  let y = PLAY_Y + 12;
  for (const p of game.players) {
    if (!p) continue;
    let x = WIDTH - 26;
    for (const [pow, spr] of POWERUP_ICONS) {
      if (p.pow[pow] > 0) {
        const img = sprite(spr, 0);
        ctx.save();
        ctx.globalAlpha = p.pow[pow] < 3 ? 0.4 + 0.4 * Math.sin(p.pow[pow] * 12) : 0.9;
        ctx.drawImage(img, x - 11, y, 22, 22);
        ctx.restore();
        x -= 26;
      }
    }
    y += 26;
  }
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ------------------------------------------------------------- banners

export function drawBanner(ctx, mainStr, subStr, t, opts = {}) {
  const cy = PLAY_Y + 240;
  const pop = easeOutBack(clamp(t / 0.4, 0, 1));
  ctx.save();
  ctx.translate(WIDTH / 2, cy);
  ctx.scale(pop, pop);
  drawText(ctx, mainStr, 0, 0, { size: opts.size || 52, fill: opts.fill || '#fff', glow: opts.glow || 'rgba(123,232,200,0.8)', strokeW: 8 });
  if (subStr) drawText(ctx, subStr, 0, 48, { size: 22, fill: opts.subFill || COLORS.hi });
  ctx.restore();
}

// ------------------------------------------------------------- screens

export function drawTitle(game, ctx, t) {
  drawBackground(ctx, 'moss', t);
  // drifting decorative bubbles
  for (let i = 0; i < 7; i++) {
    const bx = ((i * 149 + t * (14 + i * 5)) % (WIDTH + 80)) - 40;
    const by = HEIGHT - ((i * 97 + t * (22 + i * 7)) % (HEIGHT + 80)) + 40;
    const img = sprite('bubble_float', i % 4);
    const s = 0.4 + (i % 3) * 0.3;
    ctx.save(); ctx.globalAlpha = 0.35;
    ctx.drawImage(img, bx, by, 64 * s, 64 * s);
    ctx.restore();
  }
  const logo = sprite('logo');
  const bob = Math.sin(t * 1.6) * 6;
  ctx.drawImage(logo, WIDTH / 2 - logo.width / 2, 70 + bob);
  game.titleMenu.draw(ctx, WIDTH / 2, 330, t);
  // mascots
  const p1 = sprite('p1_idle', Math.floor(t * 6));
  const p2 = sprite('p2_idle', Math.floor(t * 6 + 2));
  ctx.drawImage(p1, WIDTH / 2 - 200 - 24, HEIGHT - 120);
  ctx.save(); ctx.translate(WIDTH / 2 + 200 + 24, HEIGHT - 120 + 24); ctx.scale(-1, 1); ctx.drawImage(p2, -24, -24); ctx.restore();
  drawText(ctx, 'ARROWS / WASD · SPACE JUMP · CTRL / J SHOOT · M MUTE', WIDTH / 2, HEIGHT - 36, { size: 13, fill: '#8a93c4' });
  drawText(ctx, 'AN ORIGINAL ARCADE TRIBUTE · 100% HANDMADE PIXEL-FREE ART', WIDTH / 2, HEIGHT - 16, { size: 10, fill: '#5a6396' });
}

export function drawHowto(game, ctx, t) {
  drawBackground(ctx, 'crystal', t);
  panel(ctx, 60, 50, WIDTH - 120, HEIGHT - 100);
  drawText(ctx, 'HOW TO PLAY', WIDTH / 2, 90, { size: 34, fill: COLORS.hi, glow: 'rgba(255,215,94,0.6)' });

  const lx = 110, rx = WIDTH / 2 + 40;
  drawText(ctx, 'TRAP critters in bubbles, then POP them!', WIDTH / 2, 126, { size: 20, fill: '#7be8c8' });
  let y = 176;
  const lines = [
    ['MOVE', 'Arrows or A / D'],
    ['JUMP', 'Space (hold for higher, buffered)'],
    ['SHOOT', 'Ctrl, J or K'],
    ['PAUSE', 'Esc · START Enter · MUTE M'],
    ['CO-OP P1', 'A D move · W jump · F shoot'],
    ['CO-OP P2', 'Arrows move · Up jump · / shoot'],
    ['GAMEPAD', 'Stick move · A jump · X shoot'],
  ];
  for (const [k, v] of lines) {
    drawText(ctx, k, lx, y, { size: 16, fill: COLORS.hi, align: 'left' });
    drawText(ctx, v, lx + 130, y, { size: 16, align: 'left', fill: '#dde3ff' });
    y += 30;
  }
  // tips with little pictures
  let ty = 176;
  const tip = (img, frame, str) => {
    ctx.drawImage(sprite(img, frame), rx, ty - 16, 32, 32);
    drawText(ctx, str, rx + 44, ty, { size: 14, align: 'left', fill: '#dde3ff' });
    ty += 40;
  };
  tip('bubble_float', Math.floor(t * 4), 'Bubbles drift up — pop by touch');
  tip('bouncer', 0, 'Hold JUMP on a bubble to bounce');
  tip('cherry', 0, 'Popped critters drop tasty snacks');
  tip('star', Math.floor(t * 4), 'Power-ups: speed, rapid, big, star…');
  tip('klonk_walk', Math.floor(t * 4), 'Armoured Klonks need two hits');
  tip('grimble_fly', Math.floor(t * 4), "Don't dawdle — Grimble is coming!");
  drawText(ctx, 'Chain pops for combo points ×2 ×4 ×8…', WIDTH / 2, HEIGHT - 110, { size: 18, fill: COLORS.combo });
  drawText(ctx, 'ESC TO RETURN', WIDTH / 2, HEIGHT - 72, { size: 14, fill: '#8a93c4' });
}

export function drawSelect(game, ctx, t) {
  drawBackground(ctx, 'abyss', t);
  panel(ctx, 80, 60, WIDTH - 160, HEIGHT - 130);
  drawText(ctx, 'LEVEL SELECT', WIDTH / 2, 100, { size: 32, fill: COLORS.hi });
  const cols = 3, cw = (WIDTH - 200) / cols;
  LEVELS.forEach((lv, i) => {
    const cx = 100 + (i % cols) * cw + cw / 2;
    const cy = 160 + Math.floor(i / cols) * 64;
    const sel = i === game.selectIdx;
    if (sel) {
      ctx.save(); ctx.globalAlpha = 0.25; ctx.fillStyle = '#7be8c8';
      roundRect(ctx, cx - cw / 2 + 14, cy - 22, cw - 28, 48, 10); ctx.fill();
      ctx.restore();
    }
    drawText(ctx, `${i + 1}. ${lv.name}`, cx, cy - 6, { size: sel ? 19 : 17, fill: sel ? '#fff' : '#aab4e8' });
    drawText(ctx, lv.theme.toUpperCase() + (lv.boss ? ' · BOSS' : ''), cx, cy + 14, { size: 11, fill: sel ? COLORS.hi : '#5a6396' });
  });
  drawText(ctx, 'ENTER TO PLAY · ESC TO RETURN', WIDTH / 2, HEIGHT - 60, { size: 14, fill: '#8a93c4' });
}

export function drawScores(game, ctx, t) {
  drawBackground(ctx, 'gold', t);
  panel(ctx, 200, 60, WIDTH - 400, HEIGHT - 120);
  drawText(ctx, 'HALL OF BUBBLES', WIDTH / 2, 104, { size: 30, fill: COLORS.hi, glow: 'rgba(255,215,94,0.7)' });
  game.score.table.forEach((e, i) => {
    const y = 160 + i * 42;
    const hl = game.lastEntryRank === i;
    const fill = hl ? '#fff' : i === 0 ? COLORS.hi : '#dde3ff';
    if (hl) drawText(ctx, '▶', 240, y, { size: 18, fill: COLORS.p1 });
    drawText(ctx, String(i + 1).padStart(2, ' '), 280, y, { size: 20, fill, align: 'right' });
    drawText(ctx, e.ini, 340, y, { size: 20, fill, align: 'left' });
    drawText(ctx, fmtScore(e.score), 560, y, { size: 20, fill, align: 'right' });
    drawText(ctx, 'L' + e.level, 640, y, { size: 16, fill: '#8a93c4', align: 'right' });
  });
  drawText(ctx, 'ENTER / ESC TO RETURN', WIDTH / 2, HEIGHT - 50, { size: 14, fill: '#8a93c4' });
}

const ENTRY_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789·';

export function drawEntry(game, ctx, t) {
  drawBackground(ctx, 'crystal', t);
  panel(ctx, 240, 160, WIDTH - 480, 320);
  const e = game.entry;
  const who = e.player === 0 ? 'PUFF' : 'PLOP';
  drawText(ctx, 'NEW HIGH SCORE!', WIDTH / 2, 210, { size: 30, fill: COLORS.hi, glow: 'rgba(255,215,94,0.8)' });
  drawText(ctx, `${who} · ${fmtScore(game.score.scores[e.player])}`, WIDTH / 2, 252, { size: 20, fill: e.player === 0 ? COLORS.p1 : COLORS.p2 });
  for (let i = 0; i < 3; i++) {
    const x = WIDTH / 2 + (i - 1) * 60;
    const ch = ENTRY_CHARS[e.ini[i]];
    const sel = i === e.slot;
    if (sel) {
      drawText(ctx, '▲', x, 300, { size: 16, fill: '#7be8c8', alpha: 0.5 + 0.5 * Math.sin(t * 8) });
      drawText(ctx, '▼', x, 388, { size: 16, fill: '#7be8c8', alpha: 0.5 + 0.5 * Math.sin(t * 8) });
    }
    drawText(ctx, ch, x, 344, { size: 48, fill: sel ? '#fff' : '#aab4e8', glow: sel ? 'rgba(123,232,200,0.8)' : null });
  }
  drawText(ctx, 'UP/DOWN CHANGE · LEFT/RIGHT MOVE · ENTER OK', WIDTH / 2, 440, { size: 13, fill: '#8a93c4' });
}

export function updateEntry(game, input) {
  const e = game.entry;
  if (input.menuPressed('up')) { e.ini[e.slot] = (e.ini[e.slot] + 1) % ENTRY_CHARS.length; AudioSys.play('menu_move'); }
  if (input.menuPressed('down')) { e.ini[e.slot] = (e.ini[e.slot] + ENTRY_CHARS.length - 1) % ENTRY_CHARS.length; AudioSys.play('menu_move'); }
  if (input.menuPressed('left')) { e.slot = Math.max(0, e.slot - 1); AudioSys.play('menu_move'); }
  if (input.menuPressed('right')) { e.slot = Math.min(2, e.slot + 1); AudioSys.play('menu_move'); }
  if (input.menuPressed('confirm')) {
    if (e.slot < 2) { e.slot++; AudioSys.play('menu_move'); return null; }
    AudioSys.play('menu_select');
    return e.ini.map(i => ENTRY_CHARS[i]).join('');
  }
  return null;
}

export function drawPauseOverlay(game, ctx, t) {
  ctx.fillStyle = 'rgba(8,10,28,0.72)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  panel(ctx, WIDTH / 2 - 170, 230, 340, 240);
  drawText(ctx, 'PAUSED', WIDTH / 2, 274, { size: 30, fill: '#fff' });
  game.pauseMenu.draw(ctx, WIDTH / 2, 330, t, { gap: 42 });
}

export function drawGameOver(game, ctx, t) {
  ctx.fillStyle = 'rgba(8,10,28,0.6)';
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  drawBanner(ctx, 'GAME OVER', `SCORE ${fmtScore(Math.max(...game.score.scores))}`, Math.min(t, 1), { fill: COLORS.danger, glow: 'rgba(255,84,112,0.8)' });
}

export function drawVictory(game, ctx, t) {
  drawBanner(ctx, 'CAVERNS SAVED!', 'PUFF & PLOP THANK YOU FOR PLAYING', Math.min(t, 1), { fill: COLORS.hi, glow: 'rgba(255,215,94,0.9)' });
}

function panel(ctx, x, y, w, h) {
  ctx.save();
  ctx.fillStyle = 'rgba(10,14,36,0.82)';
  ctx.strokeStyle = 'rgba(123,232,200,0.35)';
  ctx.lineWidth = 2;
  roundRect(ctx, x, y, w, h, 18);
  ctx.fill(); ctx.stroke();
  ctx.restore();
}
