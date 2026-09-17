// Player controller: tight accel/decel, coyote time, jump buffering, variable
// jump height, bubble shooting, power-up timers, death/respawn with invuln.

import { PHYS, PLAYER, PLAY_Y, PLAY_H, COLORS } from './constants.js';
import { clamp } from './utils.js';
import { moveEntity } from './physics.js';
import { sprite } from './sprites.js';
import { AudioSys } from './audio.js?v=20260917b';
import { Particles } from './particles.js';

export class Player {
  constructor(idx, spawn) {
    this.idx = idx;                       // 0 = Puff, 1 = Plop
    this.w = PLAYER.W; this.h = PLAYER.H;
    this.lives = PLAYER.LIVES;
    this.spawn = spawn;
    this.state = 'play';                  // play | dead | gone
    this.cheer = false;
    this.reset(spawn);
    this.invuln = PLAYER.SPAWN_INVULN * 0.6;
    this.pow = { speed: 0, rapid: 0, range: 0, big: 0, star: 0, multi: 0 };
  }

  reset(spawn) {
    this.x = spawn.x; this.y = spawn.y;
    this.vx = 0; this.vy = 0; this.dir = this.idx === 0 ? 1 : -1;
    this.onGround = false;
    this.coyote = 0; this.jumpBuf = 0; this.jumpCut = false;
    this.shootCd = 0; this.shootAnim = 0; this.shootBuf = 0;
    this.animT = 0; this.deathT = 0; this.deathCried = false;
  }

  // called while the world is frozen (hitstop) so presses aren't eaten
  bufferInputs(input) {
    if (input.pressed(this.idx, 'jump')) this.jumpBuf = PHYS.JUMP_BUFFER;
    if (input.pressed(this.idx, 'shoot')) this.shootBuf = 0.12;
  }

  get alive() { return this.state === 'play'; }

  hit(game) {
    if (this.state !== 'play' || this.invuln > 0 || this.pow.star > 0) return false;
    this.state = 'dead';
    this.deathT = 0; this.deathCried = false;
    this.vy = -420; this.vx = 0;
    this.lives--;
    AudioSys.play('hurt');
    Particles.burst(this.x, this.y, { count: 14, palette: [COLORS[this.idx ? 'p2' : 'p1'], '#ffffff'], speed: 180, life: 0.7, gravity: 300 });
    game.shakeAdd(0.35);
    return true;
  }

  applyPowerup(name, game) {
    switch (name) {
      case 'speed': this.pow.speed = PLAYER.SPEED_TIME; break;
      case 'rapid': this.pow.rapid = PLAYER.RAPID_TIME; break;
      case 'range': this.pow.range = PLAYER.RANGE_TIME; break;
      case 'big': this.pow.big = PLAYER.BIG_TIME; break;
      case 'star': this.pow.star = PLAYER.STAR_TIME; break;
      case 'multi': this.pow.multi = PLAYER.MULTI_TIME; break;
      case 'life': this.lives++; AudioSys.play('extra_life'); break;
      case 'clear': game.screenClear(this.idx); break;
    }
  }

  update(game, dt) {
    this.animT += dt;
    for (const k of Object.keys(this.pow)) this.pow[k] = Math.max(0, this.pow[k] - dt);

    if (this.state === 'dead') {
      this.deathT += dt;
      if (!this.deathCried && this.deathT > 0.45) {
        this.deathCried = true;
        AudioSys.play('death');           // the sad gliss lands as the fall begins
      }
      this.vy = Math.min(this.vy + PHYS.GRAVITY * 0.7 * dt, PHYS.MAX_FALL);
      this.y += this.vy * dt;               // ghost fall through everything
      if (this.deathT >= PLAYER.RESPAWN_DELAY) {
        if (this.lives > 0) {
          this.reset(this.spawn);
          this.state = 'play';
          this.invuln = PLAYER.SPAWN_INVULN;
          Particles.sparkle(this.x, this.y, '#ffffff');
        } else {
          this.state = 'gone';
        }
      }
      return;
    }
    if (this.state !== 'play') return;

    this.invuln = Math.max(0, this.invuln - dt);
    this.shootCd = Math.max(0, this.shootCd - dt);
    this.shootAnim = Math.max(0, this.shootAnim - dt);

    const input = game.input;
    const frozen = this.cheer;             // celebration: no control
    const moveDir = frozen ? 0 : (input.held(this.idx, 'right') ? 1 : 0) - (input.held(this.idx, 'left') ? 1 : 0);
    const speedMax = PHYS.RUN_SPEED * (this.pow.speed > 0 ? PLAYER.SPEED_MULT : 1);
    const accel = (this.onGround ? PHYS.RUN_ACCEL : PHYS.RUN_ACCEL * PHYS.AIR_CONTROL) * dt;
    const decel = (this.onGround ? PHYS.RUN_DECEL : PHYS.RUN_DECEL * PHYS.AIR_CONTROL) * dt;

    if (moveDir !== 0) {
      this.dir = moveDir;
      this.vx = clamp(this.vx + moveDir * accel, -speedMax, speedMax);
      if (this.onGround && Math.abs(this.vx) > 60 && Math.floor(this.animT * 8) % 4 === 0) {
        Particles.trailDust(this.x, this.y + this.h / 2, this.dir);
      }
    } else {
      this.vx = this.vx > 0 ? Math.max(0, this.vx - decel) : Math.min(0, this.vx + decel);
    }

    // jumping: buffer + coyote
    this.coyote = this.onGround ? PHYS.COYOTE : Math.max(0, this.coyote - dt);
    this.jumpBuf = Math.max(0, this.jumpBuf - dt);
    if (!frozen && input.pressed(this.idx, 'jump')) this.jumpBuf = PHYS.JUMP_BUFFER;
    if (this.jumpBuf > 0 && this.coyote > 0) {
      this.vy = -PHYS.JUMP_V;
      this.jumpBuf = 0; this.coyote = 0; this.jumpCut = false;
      AudioSys.play('jump');
    }
    if (!input.held(this.idx, 'jump') && this.vy < 0 && !this.jumpCut) {
      this.vy *= PHYS.JUMP_CUT;
      this.jumpCut = true;
    }

    const wasAirborne = !this.onGround;
    moveEntity(game.level, this, dt);
    if (wasAirborne && this.onGround) Particles.trailDust(this.x, this.y + this.h / 2, 0);

    // shooting (pressed now, or buffered through a hitstop freeze)
    this.shootBuf = Math.max(0, this.shootBuf - dt);
    if (!frozen && (input.pressed(this.idx, 'shoot') || this.shootBuf > 0) && this.shootCd <= 0) {
      this.shootBuf = 0;
      const ok = game.spawnBubble(this);
      if (ok) {
        this.shootCd = this.pow.rapid > 0 ? PLAYER.SHOOT_CD_RAPID : PLAYER.SHOOT_CD;
        this.shootAnim = 0.25;
        AudioSys.play('shoot');
      }
    }

    // star trail
    if (this.pow.star > 0 && Math.floor(this.animT * 20) % 2 === 0) {
      Particles.sparkle(this.x + (game.rng.next() - 0.5) * 20, this.y + (game.rng.next() - 0.5) * 24, `hsl(${(this.animT * 360) % 360} 90% 70%)`);
    }
  }

  spriteName() {
    const p = this.idx === 0 ? 'p1' : 'p2';
    if (this.state === 'dead') return this.deathT < 0.45 ? `${p}_hit` : `${p}_death`;
    if (this.cheer) return `${p}_cheer`;
    if (this.shootAnim > 0) return `${p}_shoot`;
    if (!this.onGround) return this.vy < 0 ? `${p}_jump` : `${p}_fall`;
    if (Math.abs(this.vx) > 15) return `${p}_run`;
    return `${p}_idle`;
  }

  draw(ctx) {
    if (this.state === 'gone') return;
    // invulnerability blink
    if (this.invuln > 0 && this.state === 'play' && Math.floor(this.invuln * 10) % 2 === 0) return;
    const name = this.spriteName();
    const rate = name.endsWith('_run') ? 12 : 7;
    const img = sprite(name, Math.floor(this.animT * rate));
    ctx.save();
    if (this.pow.star > 0) {
      ctx.shadowColor = `hsl(${(this.animT * 480) % 360} 95% 65%)`;
      ctx.shadowBlur = 18;
    }
    ctx.translate(this.x, this.y);
    if (this.dir < 0) ctx.scale(-1, 1);
    if (this.state === 'dead' && this.deathT > 0.45) ctx.rotate((this.deathT - 0.45) * 9);  // ouch pose first, then the spin-faint
    ctx.drawImage(img, -img.width / 2, -img.height / 2 - 4);
    ctx.restore();
    // soft contact shadow
    if (this.onGround && this.state === 'play') {
      ctx.save();
      ctx.globalAlpha = 0.18; ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.ellipse(this.x, Math.min(this.y + this.h / 2 + 3, PLAY_Y + PLAY_H), 14, 4, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }
}
