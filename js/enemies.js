// Enemy AI: five regular types + Grimble (invincible hurry-up reaper) and
// King Klonk (mini-boss). Simple readable state machines in the arcade spirit:
// patrol, hop, chase, float — and everyone gets meaner when angry.

import { ENEMY, PHYS, PLAY_Y, PLAY_H, TILE, WIDTH } from './constants.js';
import { clamp } from './utils.js';
import { moveEntity, solidAtPx, wrapToTop } from './physics.js';
import { sprite } from './sprites.js';
import { Particles } from './particles.js';
import { AudioSys } from './audio.js?v=20260917c';

export class Enemy {
  constructor(type, x, y, rng) {
    this.type = type;
    const stats = ENEMY.STATS[type];
    this.speed = stats.speed;
    this.fruitTier = stats.fruitTier;
    this.hp = stats.hp || 1;
    this.x = x; this.y = y;
    this.w = type === 'boss' ? ENEMY.BOSS_W : ENEMY.W;
    this.h = type === 'boss' ? ENEMY.BOSS_H : ENEMY.H;
    this.vx = 0; this.vy = 0;
    this.dir = rng.chance(0.5) ? 1 : -1;
    this.state = 'spawning';                  // spawning | active | trapped | dead
    this.spawnT = ENEMY.SPAWN_GHOST;
    this.angry = false;
    this.animT = rng.next() * 10;
    this.aiT = rng.range(0.6, 1.6);
    this.stunT = 0;
    this.hopCount = 0;
    this.wavePhase = rng.next() * Math.PI * 2;
    this.chargeT = stats.chargeEvery || 0;    // boss
    this.charging = 0;
    this.minionT = ENEMY.BOSS_MINION_EVERY;
    this.rng = rng;
  }

  get capturable() {
    return this.state === 'active' && this.type !== 'grimble' && this.stunT <= 0;
  }

  effSpeed() { return this.speed * (this.angry ? ENEMY.ANGRY_MULT : 1); }

  trappedSprite() {
    if (this.type === 'klonk' && this.hp <= 1) return 'klonk_cracked_walk';
    if (this.type === 'boss') return this.hp <= 1 ? 'boss_cracked' : 'boss_walk';
    return this.type === 'wispel' ? 'wispel_fly' : `${this.type}_walk`;
  }

  // Bubble hit. Returns 'trapped' | 'cracked' | 'ignore'
  bubbleHit(bubble, game) {
    if (!this.capturable) return 'ignore';
    if (this.type === 'klonk' && this.hp > 1 && !bubble.big) {
      this.hp = 1;
      this.stunT = 0.7;
      this.vx = bubble.dir * 120;
      AudioSys.play('boss_hit', { vol: 0.5 });
      Particles.burst(this.x, this.y, { count: 8, palette: ['#b9a890', '#7a6f5e'], speed: 140, life: 0.5, gravity: 400 });
      return 'cracked';
    }
    this.state = 'trapped';
    this.vx = 0; this.vy = 0;          // Bubble.capture() sets the escape timer
    return 'trapped';
  }

  escapeFrom(bubble) {
    this.state = 'active';
    if (!this.angry) { this.angry = true; }
    this.vy = -200;
    Particles.burst(this.x, this.y, { count: 6, palette: ['#ffffff'], speed: 120, life: 0.4, gravity: 200, glow: true });
  }

  update(game, dt) {
    this.animT += dt;
    if (this.state === 'trapped' || this.state === 'dead') return;

    if (this.state === 'spawning') {
      this.spawnT -= dt;
      moveEntity(game.level, this, dt);
      const landed = this.spawnT <= 0 && (this.onGround || this.type === 'wispel');
      // fallback: never let an enemy stay intangible forever (e.g. wrap gaps)
      if (landed || this.type === 'grimble' || this.spawnT <= -3) {
        this.state = 'active';
      }
      return;
    }

    if (this.stunT > 0) {
      this.stunT -= dt;
      this.vx *= 1 - Math.min(1, dt * 6);
      moveEntity(game.level, this, dt);
      return;
    }

    const player = game.nearestPlayer(this.x, this.y);
    switch (this.type) {
      case 'bumbler': this.aiWalk(game, dt); break;
      case 'hopkin': this.aiHop(game, dt, player); break;
      case 'snoot': this.aiChase(game, dt, player); break;
      case 'wispel': this.aiFloat(game, dt); return;        // handles own motion
      case 'klonk': this.aiWalk(game, dt); break;
      case 'grimble': this.aiGhost(game, dt, player); return;
      case 'boss': this.aiBoss(game, dt, player); break;
    }
    moveEntity(game.level, this, dt);
    if (this.hitWall) this.dir *= -1;
  }

  aiWalk(game, dt) {
    this.vx = this.dir * this.effSpeed();
  }

  aiHop(game, dt, player) {
    if (this.onGround) {
      this.vx = this.dir * this.effSpeed() * 0.6;
      this.aiT -= dt;
      if (this.aiT <= 0) {
        this.hopCount++;
        const stats = ENEMY.STATS.hopkin;
        if (this.hopCount % 3 === 0 && player) {
          this.dir = player.x > this.x ? 1 : -1;            // big leap at player
          this.vy = -stats.leapV;
          this.vx = this.dir * this.effSpeed() * 2.2;
        } else {
          this.vy = -stats.hopV;
        }
        this.aiT = this.rng.range(1.0, 2.0) / (this.angry ? 1.5 : 1);
      }
    } else {
      this.vx = this.dir * this.effSpeed() * 1.4;
    }
  }

  aiChase(game, dt, player) {
    this.aiT -= dt;
    if (this.aiT <= 0 && player) {
      // re-aim with hysteresis so it doesn't jitter on top of the player
      if (Math.abs(player.x - this.x) > 24) this.dir = player.x > this.x ? 1 : -1;
      // hop when the player is clearly above and we feel like it
      if (player.y < this.y - TILE * 2 && this.onGround && this.rng.chance(0.4)) {
        this.vy = -ENEMY.STATS.snoot.jumpV;
      }
      this.aiT = 0.5;
    }
    this.vx = this.dir * this.effSpeed();
  }

  aiFloat(game, dt) {
    const stats = ENEMY.STATS.wispel;
    this.wavePhase += dt * stats.waveHz * (this.angry ? 1.4 : 1);
    this.vx = this.dir * this.effSpeed();
    this.vy = Math.sin(this.wavePhase) * stats.waveAmp;
    // bounce off solids — wispels ignore one-way platforms entirely
    const nx = this.x + this.vx * dt, ny = this.y + this.vy * dt;
    if (solidAtPx(game.level, nx + Math.sign(this.vx) * this.w / 2, this.y)) { this.dir *= -1; this.vx *= -1; }
    else this.x = nx;
    if (solidAtPx(game.level, this.x, ny + Math.sign(this.vy) * this.h / 2)) this.wavePhase += Math.PI;
    else this.y = ny;
    this.y = clamp(this.y, PLAY_Y + this.h, PLAY_Y + PLAY_H - this.h / 2);
  }

  aiGhost(game, dt, player) {
    // drifts through everything, homing with a spectral bob — cannot be stopped
    if (player) {
      const dx = player.x - this.x, dy = player.y - this.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      this.dir = dx >= 0 ? 1 : -1;
      this.x += (dx / d) * this.effSpeed() * dt;
      this.y += (dy / d) * this.effSpeed() * dt + Math.sin(this.animT * 4) * 30 * dt;
    }
    this.x = clamp(this.x, TILE, WIDTH - TILE);
    this.y = clamp(this.y, PLAY_Y + TILE, PLAY_Y + PLAY_H - TILE);
    if (Math.floor(this.animT * 12) % 3 === 0) Particles.sparkle(this.x, this.y + 10, 'rgba(180,140,255,0.8)');
  }

  aiBoss(game, dt, player) {
    const stats = ENEMY.STATS.boss;
    if (this.charging > 0) {
      this.charging -= dt;
      this.vx = this.dir * stats.chargeSpeed;
    } else {
      this.vx = this.dir * this.effSpeed();
      this.chargeT -= dt;
      if (this.chargeT <= 0 && player) {
        this.dir = player.x > this.x ? 1 : -1;
        this.charging = 1.2;
        this.chargeT = stats.chargeEvery;
        game.shakeAdd(0.2);
        AudioSys.play('hurry', { vol: 0.4 });
      }
    }
    // summon minions
    this.minionT -= dt;
    let minions = 0;
    for (const e of game.enemies) if (e !== this && e.state !== 'dead') minions++;
    if (this.minionT <= 0 && minions < ENEMY.BOSS_MAX_MINIONS) {
      game.spawnEnemy('bumbler', this.x, this.y - this.h / 2 - 20);
      this.minionT = ENEMY.BOSS_MINION_EVERY;
      Particles.burst(this.x, this.y - this.h / 2, { count: 10, palette: ['#caa84a', '#8a6f2f'], speed: 160, life: 0.6, gravity: 300 });
    }
  }

  draw(ctx, t) {
    if (this.state === 'dead' || this.state === 'trapped') return;  // trapped drawn inside bubble
    const name = this.type === 'wispel' ? 'wispel_fly'
      : this.type === 'grimble' ? 'grimble_fly'
      : this.type === 'klonk' && this.hp <= 1 ? 'klonk_cracked_walk'
      : this.type === 'boss' ? (this.hp <= 1 ? 'boss_cracked' : 'boss_walk')
      : `${this.type}_walk`;
    const img = sprite(name, Math.floor(this.animT * (this.angry ? 10 : 7)));
    ctx.save();
    if (this.state === 'spawning') ctx.globalAlpha = 0.55;
    if (this.angry) {
      ctx.shadowColor = 'rgba(255,70,90,0.9)';
      ctx.shadowBlur = 14;
    }
    if (this.charging > 0) {
      ctx.shadowColor = 'rgba(255,180,60,0.9)';
      ctx.shadowBlur = 18;
    }
    ctx.translate(this.x, this.y);
    if (this.dir < 0) ctx.scale(-1, 1);
    const pulse = this.angry ? 1 + Math.sin(t * 14) * 0.04 : 1;
    ctx.drawImage(img, -img.width / 2 * pulse, -img.height / 2 * pulse - 4, img.width * pulse, img.height * pulse);
    ctx.restore();
  }
}
