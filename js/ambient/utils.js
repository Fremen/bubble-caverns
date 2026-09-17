// Small shared helpers. Deterministic RNG so the test harness can replay runs.

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };

export function aabb(ax, ay, aw, ah, bx, by, bw, bh) {
  return Math.abs(ax - bx) * 2 < aw + bw && Math.abs(ay - by) * 2 < ah + bh;
}

// mulberry32 — tiny seedable PRNG
export class RNG {
  constructor(seed = 0x9e3779b9) { this.s = seed >>> 0; }
  next() {
    let t = (this.s += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) { return a + this.next() * (b - a); }
  int(a, b) { return Math.floor(this.range(a, b + 1)); }
  pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
  chance(p) { return this.next() < p; }
  weighted(pairs) { // [[value, weight], ...]
    let total = 0;
    for (const [, w] of pairs) total += w;
    let r = this.next() * total;
    for (const [v, w] of pairs) { r -= w; if (r <= 0) return v; }
    return pairs[pairs.length - 1][0];
  }
}

export const easeOutBack = t => { const c = 1.70158; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
export const easeOutCubic = t => 1 - Math.pow(1 - t, 3);

export function fmtScore(n) { return String(n).padStart(7, '0'); }
