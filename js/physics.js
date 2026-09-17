// Tile collision for center-anchored AABB entities on the 30x20 grid.
// Solids block all sides; one-way platforms catch feet crossing their top edge.
// Falling out the bottom wraps to just below the ceiling (classic arcade wrap).

import { TILE, COLS, ROWS, PLAY_Y, PLAY_H, PHYS } from './constants.js';

export const colAt = px => Math.floor(px / TILE);
export const rowAt = py => Math.floor((py - PLAY_Y) / TILE);

export function solidAt(level, col, row) {
  if (col < 0 || col >= COLS) return true;
  if (row < 0) return true;                 // above ceiling
  if (row >= ROWS) return false;            // below floor: open (wrap)
  return level.solid[row][col] === 1;
}

export function platAt(level, col, row) {
  if (col < 0 || col >= COLS || row < 0 || row >= ROWS) return false;
  return level.plat[row][col] === 1;
}

export const solidAtPx = (level, px, py) => solidAt(level, colAt(px), rowAt(py));

// sample points spanning [a, b] every <=24px including both ends — written
// into a reused scratch buffer to keep the per-frame hot path allocation-free
const scratch = new Float64Array(16);
function samplesAcross(a, b) {
  const n = Math.min(16, Math.max(2, Math.ceil((b - a) / 24) + 1));
  for (let i = 0; i < n; i++) scratch[i] = a + ((b - a) * i) / (n - 1);
  return n;
}

// Integrates gravity + velocity and resolves tile collisions.
// Sets e.onGround / e.hitWall / e.hitCeil. opts: {gravity, maxFall, oneWay, wrap}
export function moveEntity(level, e, dt, opts = {}) {
  const gravity = opts.gravity !== undefined ? opts.gravity : PHYS.GRAVITY;
  const maxFall = opts.maxFall !== undefined ? opts.maxFall : PHYS.MAX_FALL;
  const oneWay = opts.oneWay !== undefined ? opts.oneWay : true;
  const wrap = opts.wrap !== undefined ? opts.wrap : true;

  e.vy = Math.min(e.vy + gravity * dt, maxFall);
  e.hitWall = false; e.hitCeil = false;
  const hw = e.w / 2, hh = e.h / 2;

  // --- horizontal ---
  let nx = e.x + e.vx * dt;
  if (e.vx !== 0) {
    const dir = Math.sign(e.vx);
    const edge = nx + dir * hw;
    const ny0 = samplesAcross(e.y - hh + 3, e.y + hh - 3);
    for (let i = 0; i < ny0; i++) {
      const sy = scratch[i];
      if (solidAt(level, colAt(edge), rowAt(sy))) {
        nx = (dir > 0 ? colAt(edge) * TILE - hw : (colAt(edge) + 1) * TILE + hw) - dir * 0.01;
        e.vx = 0; e.hitWall = true;
        break;
      }
    }
  }
  e.x = nx;

  // --- vertical ---
  const oldFeet = e.y + hh;
  let ny = e.y + e.vy * dt;
  e.onGround = false;
  const nx0 = samplesAcross(e.x - hw + 3, e.x + hw - 3);
  if (e.vy > 0) {
    const feet = ny + hh;
    const row = rowAt(feet);
    for (let i = 0; i < nx0; i++) {
      const sx = scratch[i];
      const col = colAt(sx);
      const top = PLAY_Y + row * TILE;
      const solid = solidAt(level, col, row);
      const plat = oneWay && platAt(level, col, row) && oldFeet <= top + 0.5;
      if (solid || plat) {
        ny = top - hh - 0.01;
        e.vy = 0; e.onGround = true;
        break;
      }
    }
  } else if (e.vy < 0) {
    const head = ny - hh;
    for (let i = 0; i < nx0; i++) {
      const sx = scratch[i];
      if (solidAt(level, colAt(sx), rowAt(head))) {
        ny = (rowAt(head) + 1) * TILE + PLAY_Y + hh + 0.01;
        e.vy = 0; e.hitCeil = true;
        break;
      }
    }
  }
  e.y = ny;

  if (wrap && e.y - hh > PLAY_Y + PLAY_H) wrapToTop(level, e);
}

// Reappear just below the ceiling at the same column, skipping any solid rows.
export function wrapToTop(level, e) {
  const col = colAt(e.x);
  let row = 1;
  while (row < 5 && solidAt(level, col, row)) row++;
  e.y = PLAY_Y + row * TILE + e.h / 2 + 1;
  e.vy = Math.min(e.vy, 200);
}

// Is there standable support directly under this point within `rows` tiles?
export function supportBelow(level, px, py, rows = 1) {
  const col = colAt(px), row = rowAt(py);
  for (let r = row + 1; r <= row + rows; r++) {
    if (solidAt(level, col, r) || platAt(level, col, r)) return true;
  }
  return false;
}
