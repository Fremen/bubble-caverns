// Scoring: per-player totals, combo math, extra-life milestones, and a
// localStorage-backed arcade high-score table.

import { SCORING, COLORS } from './constants.js';
import { fmtScore } from './utils.js';
import { Particles } from './particles.js';
import { AudioSys } from './audio.js?v=20260917c';

const STORE_KEY = 'bubbleCaverns.scores.v1';
const DEFAULT_TABLE = [
  ['PUF', 50000], ['PLP', 42000], ['BUM', 35000], ['HOP', 30000], ['SNT', 25000],
  ['WSP', 20000], ['KLK', 15000], ['GRM', 10000], ['CAV', 7500], ['BUB', 5000],
].map(([ini, score], i) => ({ ini, score, level: Math.max(1, 9 - i) }));

export function comboPoints(comboCount) {
  return Math.min(SCORING.POP_BASE * Math.pow(2, Math.max(0, comboCount - 1)), SCORING.POP_CAP);
}

export class ScoreSystem {
  constructor() {
    this.scores = [0, 0];
    this.nextLife = [SCORING.EXTRA_LIFE_FIRST, SCORING.EXTRA_LIFE_FIRST];
    this.table = loadTable();
    this.hi = this.table.length ? this.table[0].score : 0;
  }

  addPoints(idx, pts, x, y, game, opts = {}) {
    const p = game.players[idx];
    const mult = p && p.pow.multi > 0 ? 2 : 1;
    const total = pts * mult;
    this.scores[idx] += total;
    if (this.scores[idx] > this.hi) this.hi = this.scores[idx];
    if (x !== undefined) {
      Particles.text(x, y - 14, String(total), {
        color: opts.color || (mult > 1 ? COLORS.hi : COLORS.score),
        size: opts.size || (total >= 4000 ? 22 : 16),
      });
    }
    // extra-life milestones: 30k, 100k, then every 100k
    while (this.scores[idx] >= this.nextLife[idx]) {
      if (p && p.state !== 'gone') {
        p.lives++;
        AudioSys.play('extra_life');
        Particles.text(p.x, p.y - 30, 'EXTRA LIFE!', { color: COLORS.danger, size: 20 });
      }
      this.nextLife[idx] = this.nextLife[idx] < SCORING.EXTRA_LIFE_SECOND
        ? SCORING.EXTRA_LIFE_SECOND
        : this.nextLife[idx] + SCORING.EXTRA_LIFE_STEP;
    }
    return total;
  }

  qualifies(score) {
    return score > 0 && (this.table.length < 10 || score > this.table[this.table.length - 1].score);
  }

  insert(ini, score, level) {
    this.table.push({ ini, score, level });
    this.table.sort((a, b) => b.score - a.score);
    this.table = this.table.slice(0, 10);
    saveTable(this.table);
    this.hi = this.table[0].score;
  }

  fmt(idx) { return fmtScore(this.scores[idx]); }
}

function loadTable() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) {
      const t = JSON.parse(raw);
      if (Array.isArray(t) && t.every(e => e && typeof e.score === 'number')) return t.slice(0, 10);
    }
  } catch { /* private mode etc. */ }
  return DEFAULT_TABLE.slice();
}

function saveTable(table) {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(table)); } catch { /* ignore */ }
}
