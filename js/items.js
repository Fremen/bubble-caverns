// Collectible items: fruit launched from popped enemies and arcade power-ups.
// Items arc with bounces, settle into an idle bob, and blink out if ignored.

import { ITEMS, ITEM_LIFETIME, PLAY_Y, PLAY_H } from './constants.js';
import { moveEntity } from './physics.js';
import { sprite } from './sprites.js';
import { Particles } from './particles.js';
import { AudioSys } from './audio.js?v=20260917d';
import { COLORS } from './constants.js';

export class Item {
  constructor(kind, x, y, vx = 0, vy = 0) {
    this.kind = kind;
    this.def = ITEMS[kind] || { value: 100 };
    this.x = x; this.y = y;
    this.vx = vx; this.vy = vy;
    this.w = 26; this.h = 26;
    this.age = 0; this.bob = x * 0.05;
    this.settled = false;
    this.dead = false;
  }

  get isPowerup() { return !!this.def.powerup; }

  update(game, dt) {
    this.age += dt;
    this.bob += dt;
    if (!this.settled) {
      const vyBefore = this.vy;
      this.vx *= 1 - Math.min(1, dt * 1.2);
      moveEntity(game.level, this, dt);
      if (this.onGround) {
        if (Math.abs(vyBefore) > 140) {
          this.vy = -vyBefore * 0.45;          // bouncy landing
        } else {
          this.settled = true; this.vx = 0;
        }
      }
    }
    if (this.age > ITEM_LIFETIME) this.dead = true;
  }

  collect(game, player) {
    this.dead = true;
    const pts = this.def.value;
    game.score.addPoints(player.idx, pts, this.x, this.y, game);
    if (this.isPowerup) {
      player.applyPowerup(this.def.powerup, game);
      AudioSys.play('powerup');
      Particles.collect(this.x, this.y, COLORS.powerup);
      if (this.def.powerup !== 'life' && this.def.powerup !== 'clear') {
        Particles.text(this.x, this.y - 22, this.def.powerup.toUpperCase() + '!', { color: COLORS.powerup, size: 16 });
      }
    } else {
      AudioSys.play('pickup');
      Particles.collect(this.x, this.y, '#ffd75e');
    }
  }

  draw(ctx) {
    if (this.dead) return;
    // blink before despawning
    if (this.age > ITEM_LIFETIME - 3 && Math.floor(this.age * 8) % 2 === 0) return;
    const frames = (this.kind === 'star' || this.kind === 'gem' || this.kind === 'heart' || this.kind === 'bolt') ? 2 : 1;
    const img = sprite(this.kind, frames > 1 ? Math.floor(this.bob * 4) % 2 : 0);
    const bobY = this.settled ? Math.sin(this.bob * 3) * 3 : 0;
    ctx.save();
    if (this.isPowerup) {
      ctx.shadowColor = 'rgba(201,160,255,0.8)';
      ctx.shadowBlur = 10;
    }
    ctx.translate(this.x, this.y + bobY);
    ctx.drawImage(img, -img.width / 2, -img.height / 2);
    ctx.restore();
  }
}
