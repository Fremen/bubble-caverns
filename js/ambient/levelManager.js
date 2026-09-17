// Parses the data-driven level grids into runtime state: collision maps,
// spawn points, item spots, hazards, and a pre-rendered tile layer.

import { TILE, COLS, ROWS, PLAY_Y, WIDTH, HEIGHT } from './constants.js';
import { lerp } from './utils.js';
import { sprite } from './sprites.js';

const ENEMY_CHARS = { '1': 'bumbler', '2': 'hopkin', '3': 'snoot', '4': 'wispel', '5': 'klonk', 'K': 'boss' };

const cellX = col => col * TILE + TILE / 2;
const cellY = row => PLAY_Y + row * TILE + TILE / 2;

export function parseLevel(def, index, opts = {}) {
  const level = {
    index, def,
    name: def.name, theme: def.theme, boss: !!def.boss,
    timeMax: def.time, time: def.time,
    solid: [], plat: [],
    spikes: [],
    spawns: { p1: null, p2: null },
    enemySpawns: [],
    fruitSpots: [],
    bouncers: [],
    movers: (def.movers || []).map(m => ({ ...m, t: 0 })),
    tileLayer: null,
  };

  for (let r = 0; r < ROWS; r++) {
    const row = def.grid[r] || '';
    level.solid.push(new Uint8Array(COLS));
    level.plat.push(new Uint8Array(COLS));
    for (let c = 0; c < COLS; c++) {
      const ch = row[c] || ' ';
      switch (ch) {
        case '#': level.solid[r][c] = 1; break;
        case '=': level.plat[r][c] = 1; break;
        case 'P': level.spawns.p1 = { x: cellX(c), y: cellY(r) }; break;
        case 'Q': level.spawns.p2 = { x: cellX(c), y: cellY(r) }; break;
        case 'B': level.bouncers.push({ x: cellX(c), y: cellY(r) }); break;
        case '*': level.fruitSpots.push({ x: cellX(c), y: cellY(r) }); break;
        case '^': level.spikes.push({ x: cellX(c), y: cellY(r) + 4, w: 24, h: 20 }); break;
        default:
          if (ENEMY_CHARS[ch]) level.enemySpawns.push({ type: ENEMY_CHARS[ch], x: cellX(c), y: cellY(r) });
      }
    }
  }

  if (!level.spawns.p1) {
    console.warn(`Level ${index + 1} missing P spawn; defaulting to center`);
    level.spawns.p1 = { x: WIDTH / 2, y: PLAY_Y + (ROWS - 2) * TILE };
  }
  if (!level.spawns.p2) level.spawns.p2 = { x: level.spawns.p1.x + TILE, y: level.spawns.p1.y };

  if (opts.render !== false) level.tileLayer = renderTileLayer(level);
  return level;
}

function renderTileLayer(level) {
  const cv = document.createElement('canvas');
  cv.width = WIDTH; cv.height = HEIGHT;
  const ctx = cv.getContext('2d');
  const solidImg = safeSprite(`tile_solid_${level.theme}`);
  const platImg = safeSprite(`tile_plat_${level.theme}`);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      if (level.solid[r][c]) ctx.drawImage(solidImg, c * TILE, PLAY_Y + r * TILE, TILE, TILE);
      else if (level.plat[r][c]) ctx.drawImage(platImg, c * TILE, PLAY_Y + r * TILE, TILE, TILE);
    }
  }
  const spikeImg = safeSprite('spike');
  for (const s of level.spikes) ctx.drawImage(spikeImg, s.x - TILE / 2, s.y - 4 + TILE / 2 - spikeImg.height, TILE, TILE);
  return cv;
}

function safeSprite(name) {
  try { return sprite(name); } catch {
    const cv = document.createElement('canvas');
    cv.width = cv.height = TILE;
    const ctx = cv.getContext('2d');
    ctx.fillStyle = '#f0f';
    ctx.fillRect(0, 0, TILE, TILE);
    return cv;
  }
}

export function updateMovers(level, dt) {
  for (const m of level.movers) {
    m.t += dt;
    const phase = (Math.cos((m.t / m.period) * Math.PI * 2) + 1) / 2;  // smooth ping-pong
    m.x = lerp(cellX(m.x1), cellX(m.x2), phase);
    m.y = lerp(cellY(m.y1), cellY(m.y2), phase);
  }
}

export function drawMovers(level, ctx, t) {
  for (const m of level.movers) {
    if (m.x === undefined) continue;
    // faint path line so the hazard reads as fair
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#ff9a5e';
    ctx.setLineDash([4, 8]);
    ctx.beginPath();
    ctx.moveTo(cellX(m.x1), cellY(m.y1));
    ctx.lineTo(cellX(m.x2), cellY(m.y2));
    ctx.stroke();
    ctx.restore();
    const frame = sprite('orb', Math.floor(t * 6));   // fails soft via placeholder
    ctx.save();
    ctx.shadowColor = 'rgba(255,120,60,0.9)';
    ctx.shadowBlur = 16;
    ctx.drawImage(frame, m.x - frame.width / 2, m.y - frame.height / 2);
    ctx.restore();
  }
}
