// The bubble system: shooting, capture, floating, ceiling clustering, chain
// pops, bounce-on-top, expiry — plus static golden bouncer bubbles.

import { BUBBLE, ENEMY, PLAY_Y, PLAY_H, TILE } from './constants.js';
import { clamp, dist2 } from './utils.js';
import { solidAtPx } from './physics.js';
import { sprite } from './sprites.js';
import { Particles } from './particles.js';

export class Bubble {
  constructor(x, y, dir, owner, opts = {}) {
    this.x = x; this.y = y;
    this.dir = dir;
    this.owner = owner;                        // player idx
    this.big = !!opts.big;
    this.r = this.big ? BUBBLE.R_BIG : BUBBLE.R;
    this.range = opts.range || 1;
    this.vx = dir * BUBBLE.SHOOT_SPEED;
    this.vy = 0;
    this.state = 'shot';                       // shot | float | pop | dead
    this.age = 0; this.shotT = 0; this.popT = 0;
    this.wobble = (x * 0.7 + y * 1.3) % (Math.PI * 2);
    this.captured = null;                      // Enemy ref
    this.escapeT = 0;
    this.chainDelay = -1;                      // >=0: scheduled chain pop
    this.chainCombo = 0;
    this.squash = 0;                           // bounce feedback
  }

  get fresh() { return this.state === 'shot'; }

  capture(enemy) {
    this.captured = enemy;
    this.state = 'float';
    this.vx *= 0.15;
    // escapeT owns a captured bubble's lifetime (bosses break out much sooner)
    this.escapeT = enemy.type === 'boss' ? ENEMY.BOSS_TRAP_TIME : BUBBLE.ESCAPE_TIME;
  }

  startPop() {
    if (this.state === 'pop' || this.state === 'dead') return;
    this.state = 'pop';
    this.popT = 0;
  }

  update(game, dt) {
    this.age += dt;
    this.wobble += dt * (this.age > BUBBLE.STRAIN_AT ? 9 : 4);
    this.squash = Math.max(0, this.squash - dt * 4);

    if (this.state === 'pop') {
      this.popT += dt;
      if (this.popT > 0.14) this.state = 'dead';
      return;
    }
    if (this.chainDelay >= 0) {
      this.chainDelay -= dt;
      if (this.chainDelay <= 0) { game.popBubble(this, this.owner, true); return; }
    }

    if (this.state === 'shot') {
      this.shotT += dt;
      const decay = this.shotT / (BUBBLE.SHOOT_DECAY * this.range);
      this.vx = this.dir * BUBBLE.SHOOT_SPEED * Math.max(0, 1 - decay);
      // wall stops the dash early
      if (solidAtPx(game.level, this.x + this.dir * (this.r + 2), this.y)) this.vx = 0;
      this.x += this.vx * dt;
      if (decay >= 1 || this.vx === 0) { this.state = 'float'; this.vx = 0; }
    } else {
      // float upward, wobble, cluster under ceiling
      this.vy = Math.max(this.vy - 120 * dt, BUBBLE.FLOAT_VY);
      const ceilBlocked = solidAtPx(game.level, this.x, this.y - this.r - 4);
      if (ceilBlocked && this.vy < 0) this.vy = 0;
      this.x += Math.sin(this.wobble) * 14 * dt + this.vx * dt;
      this.vx *= 1 - Math.min(1, dt * 3);
      this.y += this.vy * dt;
      // gentle separation from neighbours so clusters breathe
      for (const o of game.bubbles) {
        if (o === this || o.state === 'pop' || o.state === 'dead') continue;
        const d2 = dist2(this.x, this.y, o.x, o.y);
        const min = (this.r + o.r) * 0.82;
        if (d2 > 1 && d2 < min * min) {
          const d = Math.sqrt(d2);
          const push = ((min - d) / min) * 40 * dt;
          this.x += ((this.x - o.x) / d) * push;
          this.y += ((this.y - o.y) / d) * push;
        }
      }
      // keep inside walls
      if (solidAtPx(game.level, this.x - this.r, this.y)) this.x += 60 * dt;
      if (solidAtPx(game.level, this.x + this.r, this.y)) this.x -= 60 * dt;
      this.y = clamp(this.y, PLAY_Y + this.r, PLAY_Y + PLAY_H - this.r);

      if (this.captured) {
        this.captured.x = this.x; this.captured.y = this.y;
        this.escapeT -= dt;
        if (this.escapeT <= 0) {
          this.captured.escapeFrom(this);
          this.captured = null;
          this.startPop();                      // bursts, no reward
        }
      }
    }

    // empty bubbles expire by age; captured bubbles live until escapeT fires
    if (!this.captured && this.age > BUBBLE.LIFETIME && this.state !== 'pop') {
      Particles.pop(this.x, this.y, { big: this.big });
      this.startPop();
    }
  }

  draw(ctx, t) {
    if (this.state === 'dead') return;
    const scale = (this.big ? 1.28 : 1) * (1 - this.squash * 0.18);
    ctx.save();
    ctx.translate(this.x, this.y);
    if (this.state === 'pop') {
      const f = Math.min(2, Math.floor(this.popT / 0.05));
      const img = sprite('bubble_pop', f);
      ctx.drawImage(img, -img.width / 2 * scale, -img.height / 2 * scale, img.width * scale, img.height * scale);
      ctx.restore();
      return;
    }
    // captured enemy peeks through the glass
    if (this.captured) {
      const e = this.captured;
      const img = sprite(e.trappedSprite(), Math.floor(t * 4) % 2);
      const s = (this.r * 1.5) / Math.max(img.width, img.height);
      ctx.save();
      ctx.globalAlpha = 0.95;
      ctx.rotate(Math.sin(this.wobble * 1.7) * 0.18);
      ctx.drawImage(img, -img.width * s / 2, -img.height * s / 2, img.width * s, img.height * s);
      ctx.restore();
    }
    const frame = Math.floor(this.wobble * 1.2) % 4;
    const img = sprite('bubble_float', frame);
    // straining bubble flushes warm before bursting / before escape
    const strain = this.captured
      ? this.escapeT < 2 ? (2 - this.escapeT) / 2 : 0
      : this.age > BUBBLE.STRAIN_AT ? (this.age - BUBBLE.STRAIN_AT) / (BUBBLE.LIFETIME - BUBBLE.STRAIN_AT) : 0;
    ctx.globalAlpha = 0.92;
    ctx.drawImage(img, -img.width / 2 * scale, -img.height / 2 * scale, img.width * scale, img.height * scale);
    if (strain > 0) {
      ctx.globalAlpha = strain * (0.35 + 0.2 * Math.sin(this.wobble * 6));
      ctx.fillStyle = '#ff5470';
      ctx.beginPath();
      ctx.arc(0, 0, this.r * scale * 0.9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

// Static golden spring bubble placed by levels ('B'); launches anything upward.
export class Bouncer {
  constructor(x, y) { this.x = x; this.y = y; this.squash = 0; this.phase = x * 0.1; }
  update(dt) { this.squash = Math.max(0, this.squash - dt * 3); this.phase += dt; }
  trigger() { this.squash = 1; }
  draw(ctx) {
    const img = sprite('bouncer', this.squash > 0.4 ? 1 : 0);
    const bob = Math.sin(this.phase * 2) * 3;
    const s = 1 + this.squash * 0.12;
    ctx.save();
    ctx.translate(this.x, this.y + bob);
    ctx.drawImage(img, -img.width / 2 * s, -img.height / 2 * s, img.width * s, img.height * s);
    ctx.restore();
  }
}
