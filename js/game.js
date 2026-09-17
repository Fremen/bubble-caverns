// Game orchestrator: the state machine (title → play → clear/game over →
// high scores), entity lifecycles, collisions, combos, hurry-up pressure,
// and all the glue between modules.

import { WIDTH, HEIGHT, PLAY_Y, TILE, BUBBLE, ENEMY, SCORING, TIMERS, COLORS, FRUIT_TIERS, POWERUP_WEIGHTS, POWERUP_DROP_CHANCE, FRUIT_SPOT_EVERY, PLAYER } from './constants.js';
import { RNG, aabb, dist2, fmtScore } from './utils.js';
import { Input } from './input.js';
import { Player } from './player.js';
import { Bubble, Bouncer } from './bubbles.js';
import { Enemy } from './enemies.js';
import { Item } from './items.js';
import { ScoreSystem, comboPoints } from './score.js';
import { parseLevel, updateMovers, drawMovers } from './levelManager.js';
import { LEVELS } from './levels.js';
import { sprite, drawBackground } from './sprites.js';
import { AudioSys } from './audio.js';
import { Particles, Shake } from './particles.js';
import * as UI from './ui.js';

export class Game {
  constructor(opts = {}) {
    this.input = Input;
    this.rng = new RNG(opts.seed || 1234567);
    this.score = new ScoreSystem();
    this.render = opts.render !== false;
    this.t = 0;                       // global clock for animation
    this.state = 'title';
    this.stateT = 0;
    this.mode = 1;
    this.levelIndex = 0;
    this.level = null;
    this.players = [];
    this.bubbles = [];
    this.bouncers = [];
    this.enemies = [];
    this.items = [];
    this.combo = { count: 0, t: 0, powerGiven: false };
    this.hitstop = 0;
    this.hurry = false;
    this.hurryBannerT = 0;
    this.grimbleOut = false;
    this.fruitSpotT = FRUIT_SPOT_EVERY;
    this.clear = { bonusAwarded: false, victory: false };
    this.entry = null;
    this.lastEntryRank = -1;
    this.titleMenu = new UI.Menu(['START GAME', 'TWO PLAYERS', 'LEVEL SELECT', 'HOW TO PLAY', 'HIGH SCORES']);
    this.pauseMenu = new UI.Menu(['RESUME', 'RESTART LEVEL', 'QUIT TO TITLE']);
    this.selectIdx = 0;
  }

  // ------------------------------------------------------------ state

  enterState(s) {
    this.state = s;
    this.stateT = 0;
    if (s === 'title') { AudioSys.music.play('title'); this.lastEntryRank = -1; }
    if (s === 'gameover') { AudioSys.music.stop(); AudioSys.play('game_over'); }
    if (s === 'victory') {
      AudioSys.music.stop(); AudioSys.play('boss_down');
      for (let i = 0; i < 5; i++) Particles.confetti(WIDTH / 2 + (i - 2) * 150, PLAY_Y + 180);
    }
  }

  startGame(mode, startLevel = 0) {
    this.mode = mode;
    this.input.mode = mode === 2 ? 'coop' : 'single';
    this.score = new ScoreSystem();
    this.players = [];
    this.loadLevel(startLevel, true);
    this.enterState('play');
  }

  loadLevel(i, fresh = false) {
    this.levelIndex = i;
    this.level = parseLevel(LEVELS[i], i, { render: this.render });
    this.bubbles = [];
    this.items = [];
    this.bouncers = this.level.bouncers.map(b => new Bouncer(b.x, b.y));
    this.enemies = this.level.enemySpawns.map((s, idx) => {
      const e = new Enemy(s.type, s.x, s.y, this.rng);
      e.spawnDelay = idx * 0.35;          // intro freeze already gates updates
      return e;
    });
    this.combo = { count: 0, t: 0, powerGiven: false };
    this.hurry = false; this.hurryBannerT = 0; this.grimbleOut = false;
    this.fruitSpotT = FRUIT_SPOT_EVERY;
    this.clear = { bonusAwarded: false, victory: false };
    this.hitstop = 0;

    updateMovers(this.level, 0);        // place hazard orbs before the intro shows them

    const spawns = [this.level.spawns.p1, this.level.spawns.p2];
    for (let p = 0; p < this.mode; p++) {
      if (fresh || !this.players[p]) {
        this.players[p] = new Player(p, spawns[p]);
      } else if (this.players[p].state !== 'gone') {
        const pl = this.players[p];
        pl.spawn = spawns[p];
        pl.reset(spawns[p]);
        pl.state = 'play';
        pl.invuln = PLAYER.SPAWN_INVULN * 0.6;
        pl.cheer = false;
      }
    }
    AudioSys.music.play(this.level.boss ? 'boss' : this.level.theme);
    AudioSys.music.setFast(false);
  }

  // ------------------------------------------------------------ update

  update(dt) {
    this.t += dt;
    this.input.update();
    Shake.update(dt);
    Particles.update(dt);

    switch (this.state) {
      case 'title': this.updateTitle(); break;
      case 'howto':
      case 'scores':
        this.stateT += dt;
        if (this.input.menuPressed('back') || this.input.menuPressed('confirm')) this.enterState('title');
        break;
      case 'select': this.updateSelect(); break;
      case 'entry': this.updateEntryState(); break;
      case 'play': this.updatePlay(dt); break;
      case 'pause': this.updatePause(); break;
      case 'clear': this.updateClear(dt); break;
      case 'gameover':
        this.stateT += dt;
        if (this.stateT > TIMERS.GAMEOVER_WAIT || (this.stateT > 1 && this.input.menuPressed('confirm'))) this.finishRun();
        break;
      case 'victory':
        this.stateT += dt;
        if (this.stateT > 5 || (this.stateT > 1.5 && this.input.menuPressed('confirm'))) this.finishRun();
        break;
    }
  }

  updateTitle() {
    this.stateT += 1 / 60;
    const sel = this.titleMenu.update(this.input);
    if (sel === null) return;
    switch (sel) {
      case 0: this.startGame(1); break;
      case 1: this.startGame(2); break;
      case 2: this.enterState('select'); break;
      case 3: this.enterState('howto'); break;
      case 4: this.enterState('scores'); break;
    }
  }

  updateSelect() {
    const n = LEVELS.length, cols = 3;
    if (this.input.menuPressed('left')) { this.selectIdx = (this.selectIdx + n - 1) % n; AudioSys.play('menu_move'); }
    if (this.input.menuPressed('right')) { this.selectIdx = (this.selectIdx + 1) % n; AudioSys.play('menu_move'); }
    if (this.input.menuPressed('up')) { this.selectIdx = (this.selectIdx + n - cols) % n; AudioSys.play('menu_move'); }
    if (this.input.menuPressed('down')) { this.selectIdx = (this.selectIdx + cols) % n; AudioSys.play('menu_move'); }
    if (this.input.menuPressed('confirm')) { AudioSys.play('menu_select'); this.startGame(1, this.selectIdx); }
    if (this.input.menuPressed('back')) this.enterState('title');
  }

  updateEntryState() {
    this.stateT += 1 / 60;
    if (this.stateT < 0.5) return;       // lockout: don't let death-mashing commit initials
    const result = UI.updateEntry(this, this.input);
    if (result !== null) {
      this.score.insert(result, this.score.scores[this.entry.player], this.levelIndex + 1);
      this.lastEntryRank = this.score.table.findIndex(e => e.ini === result && e.score === this.score.scores[this.entry.player]);
      // re-check the rest of the queue — the insert may have raised the bar
      const queue = this.entry.queue.filter(p => this.score.qualifies(this.score.scores[p]));
      if (queue.length) {
        this.entry = { queue: queue.slice(1), player: queue[0], ini: [0, 0, 0], slot: 0 };
        this.stateT = 0;
      } else {
        this.entry = null;
        this.enterState('scores');
      }
    }
  }

  finishRun() {
    // queue hi-score entries for qualifying players, then show the table
    const queue = [];
    for (let p = 0; p < this.mode; p++) {
      if (this.score.qualifies(this.score.scores[p])) queue.push(p);
    }
    if (queue.length) {
      this.entry = { queue: queue.slice(1), player: queue[0], ini: [0, 0, 0], slot: 0 };
      this.enterState('entry');
    } else {
      this.lastEntryRank = -1;
      this.enterState('scores');
    }
  }

  requestPause() {
    if (this.state !== 'play') return;
    this.pauseMenu.idx = 0;
    this.state = 'pause';                // keep stateT (intro already passed)
  }

  updatePause() {
    if (this.input.menuPressed('pause')) { this.enterState('play'); this.stateT = TIMERS.INTRO + 999; return; }
    const sel = this.pauseMenu.update(this.input);
    if (sel === 0) { this.state = 'play'; }
    if (sel === 1) { this.loadLevel(this.levelIndex); this.enterState('play'); }
    if (sel === 2) this.enterState('title');
  }

  updatePlay(dt) {
    this.stateT += dt;
    const inIntro = this.stateT < TIMERS.INTRO;

    if (!inIntro && this.input.menuPressed('pause')) {
      this.requestPause();
      return;
    }
    if (this.hitstop > 0) {
      this.hitstop -= dt;
      // keep presses alive through the freeze — buffered, not eaten
      for (const p of this.players) if (p && p.state === 'play') p.bufferInputs(this.input);
      return;
    }
    if (inIntro) return;

    // pressure timer
    this.level.time -= dt;
    this.hurryBannerT = Math.max(0, this.hurryBannerT - dt);
    if (!this.hurry && this.level.time <= TIMERS.HURRY_AT) {
      this.hurry = true;
      this.hurryBannerT = 2.2;
      AudioSys.play('hurry');
      AudioSys.music.setFast(true);
      for (const e of this.enemies) e.angry = true;
    }
    if (!this.grimbleOut && this.level.time <= 0) {
      this.grimbleOut = true;
      this.spawnEnemy('grimble', WIDTH / 2, PLAY_Y + TILE * 2);
      this.hurryBannerT = 2.2;
      AudioSys.play('hurry');
      Shake.add(0.3);
    }

    // ambient fruit from level spots
    this.fruitSpotT -= dt;
    if (this.fruitSpotT <= 0 && this.level.fruitSpots.length && this.items.length < 4) {
      const spot = this.rng.pick(this.level.fruitSpots);
      const kind = FRUIT_TIERS[this.rng.int(0, Math.min(2, this.levelIndex / 4 | 0) + 1)];
      this.items.push(new Item(kind, spot.x, spot.y - 6));
      Particles.sparkle(spot.x, spot.y, '#ffd75e');
      this.fruitSpotT = FRUIT_SPOT_EVERY;
    }

    // combo window
    if (this.combo.t > 0) {
      this.combo.t -= dt;
      if (this.combo.t <= 0) { this.combo.count = 0; this.combo.powerGiven = false; }
    }

    updateMovers(this.level, dt);
    for (const b of this.bouncers) b.update(dt);
    for (const p of this.players) if (p) p.update(this, dt);
    for (const e of this.enemies) {
      if (e.spawnDelay > 0) { e.spawnDelay -= dt; continue; }
      e.update(this, dt);
    }
    for (const b of this.bubbles) b.update(this, dt);
    for (const it of this.items) it.update(this, dt);
    Particles.ambient(this.level.theme, dt, WIDTH, HEIGHT);

    this.handleCollisions();

    // sweep the fallen (only allocate when something actually died)
    if (this.bubbles.some(b => b.state === 'dead')) this.bubbles = this.bubbles.filter(b => b.state !== 'dead');
    if (this.enemies.some(e => e.state === 'dead')) this.enemies = this.enemies.filter(e => e.state !== 'dead');
    if (this.items.some(i => i.dead)) this.items = this.items.filter(i => !i.dead);

    // end conditions
    if (this.players.every(p => !p || p.state === 'gone')) {
      this.enterState('gameover');
      return;
    }
    if (!this.enemies.some(e => e.type !== 'grimble')) this.levelCleared();
  }

  handleCollisions() {
    // fresh bubbles capture enemies
    for (const b of this.bubbles) {
      if (!b.fresh) continue;
      for (const e of this.enemies) {
        if (!e.capturable || e.spawnDelay > 0) continue;
        if (Math.abs(b.x - e.x) < b.r + e.w / 2 && Math.abs(b.y - e.y) < b.r + e.h / 2) {
          const res = e.bubbleHit(b, this);
          if (res === 'trapped') {
            b.capture(e);
            this.score.addPoints(b.owner, SCORING.TRAP, e.x, e.y, this, { size: 13 });
            AudioSys.play('trap');
            Particles.sparkle(b.x, b.y, '#bfe9ff');
          } else if (res === 'cracked') {
            this.score.addPoints(b.owner, SCORING.KLONK_CRACK, e.x, e.y, this, { size: 13 });
            Particles.pop(b.x, b.y, { big: false });
            b.startPop();
          }
          break;
        }
      }
    }

    for (const p of this.players) {
      if (!p || p.state !== 'play') continue;

      // bubbles: bounce or pop
      for (const b of this.bubbles) {
        if (b.state === 'pop' || b.state === 'dead') continue;
        if (b.owner === p.idx && !b.captured && b.age < BUBBLE.OWNER_GRACE) continue;
        if (Math.abs(b.x - p.x) < b.r + p.w / 2 - 4 && Math.abs(b.y - p.y) < b.r + p.h / 2 - 4) {
          const falling = p.vy > 40 && p.y + p.h / 4 < b.y;
          if (falling && this.input.held(p.idx, 'jump')) {
            p.vy = -BUBBLE.BOUNCE_V;
            p.jumpCut = true;                       // full bounce, no cut
            b.squash = 1;
            AudioSys.play('bounce');
          } else {
            this.popBubble(b, p.idx);
          }
        }
      }

      // golden bouncers
      for (const bo of this.bouncers) {
        if (p.vy > 0 && Math.abs(bo.x - p.x) < 30 && Math.abs(bo.y - p.y) < 34 && p.y < bo.y) {
          p.vy = -BUBBLE.BOUNCER_V;
          p.jumpCut = true;
          bo.trigger();
          AudioSys.play('bounce');
          Particles.sparkle(bo.x, bo.y - 10, '#ffd75e');
        }
      }

      // enemies
      for (const e of this.enemies) {
        if (e.spawnDelay > 0 || e.state !== 'active') continue;
        if (aabb(p.x, p.y, p.w, p.h, e.x, e.y, e.w * 0.8, e.h * 0.8)) {
          if (p.pow.star > 0 && e.type !== 'grimble' && e.type !== 'boss') {
            this.enemyDefeated(e, p.idx);
          } else {
            p.hit(this);
          }
        }
      }

      // hazards
      for (const s of this.level.spikes) {
        if (aabb(p.x, p.y, p.w, p.h, s.x, s.y, s.w, s.h)) p.hit(this);
      }
      for (const m of this.level.movers) {
        if (m.x !== undefined && dist2(p.x, p.y, m.x, m.y) < 28 * 28) p.hit(this);
      }

      // items (grace period so launched fruit arcs away before it's grabbable)
      for (const it of this.items) {
        if (!it.dead && it.age > 0.45 && aabb(p.x, p.y, p.w + 10, p.h + 10, it.x, it.y, it.w, it.h)) it.collect(this, p);
      }
    }
  }

  // --------------------------------------------------------- mechanics

  spawnBubble(player) {
    const mine = this.bubbles.filter(b => b.owner === player.idx && b.state !== 'dead').length;
    if (mine >= PLAYER.MAX_BUBBLES) return false;
    this.bubbles.push(new Bubble(
      player.x + player.dir * 26, player.y - 4, player.dir, player.idx,
      { big: player.pow.big > 0, range: player.pow.range > 0 ? BUBBLE.RANGE_MULT : 1 },
    ));
    return true;
  }

  spawnEnemy(type, x, y) {
    const e = new Enemy(type, x, y, this.rng);
    e.spawnDelay = 0;
    if (this.hurry) e.angry = true;
    this.enemies.push(e);
  }

  popBubble(b, playerIdx, isChain = false) {
    if (b.state === 'pop' || b.state === 'dead') return;
    b.startPop();
    Particles.pop(b.x, b.y, { big: b.big });
    Shake.add(b.captured ? 0.18 : 0.08);
    AudioSys.play('pop', { pitch: Math.min(7, this.combo.count) });
    if (b.captured) {
      const enemy = b.captured;
      b.captured = null;
      this.enemyDefeated(enemy, playerIdx);
    }
    // chain reaction: neighbours pop a beat later
    for (const o of this.bubbles) {
      if (o === b || o.state !== 'float' && o.state !== 'shot') continue;
      if (o.chainDelay >= 0) continue;
      if (dist2(b.x, b.y, o.x, o.y) < Math.pow(b.r + o.r + BUBBLE.CHAIN_RADIUS, 2)) {
        o.chainDelay = BUBBLE.CHAIN_DELAY;
        o.owner = playerIdx;                       // chain credit goes to the popper
      }
    }
  }

  enemyDefeated(enemy, playerIdx) {
    if (enemy.type === 'boss') return this.bossHit(enemy, playerIdx);

    enemy.state = 'dead';
    this.combo.count++;
    this.combo.t = SCORING.COMBO_WINDOW;
    const pts = comboPoints(this.combo.count);
    this.score.addPoints(playerIdx, pts, enemy.x, enemy.y, this, {
      color: this.combo.count > 1 ? COLORS.combo : COLORS.score,
      size: this.combo.count > 1 ? 22 : 16,
    });
    if (this.combo.count > 1) {
      Particles.text(enemy.x, enemy.y - 38, `COMBO x${this.combo.count}`, { color: COLORS.combo, size: 15 });
    }
    AudioSys.play('enemy_down');
    Particles.burst(enemy.x, enemy.y, { count: 12, palette: ['#ffffff', '#ffd75e', '#7be8c8'], speed: 200, life: 0.6, gravity: 350, glow: true });
    this.hitstop = Math.max(this.hitstop, 0.045);
    Shake.add(0.15);

    // launch a snack (or a power-up)
    let kind = FRUIT_TIERS[Math.min(FRUIT_TIERS.length - 1, enemy.fruitTier + this.combo.count - 1)];
    const giveCombo = this.combo.count >= 2 && !this.combo.powerGiven;
    if (giveCombo || this.rng.chance(POWERUP_DROP_CHANCE)) {
      kind = this.rng.weighted(POWERUP_WEIGHTS);
      if (giveCombo) this.combo.powerGiven = true;
    }
    this.items.push(new Item(kind, enemy.x, enemy.y, this.rng.range(-130, 130), -this.rng.range(260, 400)));
  }

  bossHit(boss, playerIdx) {
    boss.hp--;
    this.score.addPoints(playerIdx, SCORING.BOSS_HIT, boss.x, boss.y, this, { color: COLORS.combo, size: 24 });
    Shake.add(0.35);
    if (boss.hp > 0) {
      boss.state = 'active';
      boss.angry = true;
      boss.stunT = 0.8;
      boss.vy = -250;
      AudioSys.play('boss_hit');
      Particles.burst(boss.x, boss.y, { count: 16, palette: ['#caa84a', '#fff'], speed: 240, life: 0.7, gravity: 380 });
    } else {
      boss.state = 'dead';
      AudioSys.play('boss_down');
      this.hitstop = 0.12;
      Shake.add(0.6);
      Particles.confetti(boss.x, boss.y);
      for (let i = 0; i < 3; i++) {
        this.items.push(new Item('rainbow_fruit', boss.x, boss.y, (i - 1) * 130, -this.rng.range(300, 430)));
      }
    }
  }

  screenClear(playerIdx) {
    // the bolt: every regular enemy gets instantly bubbled (even stunned Klonks)
    let n = 0;
    for (const e of this.enemies) {
      const stunnedOk = e.state === 'active' && e.stunT > 0 && e.type !== 'grimble';
      if ((!e.capturable && !stunnedOk) || e.type === 'boss' || e.spawnDelay > 0) continue;
      if (e.type === 'klonk') e.hp = 1;
      e.stunT = 0;
      const b = new Bubble(e.x, e.y, 1, playerIdx, {});
      b.capture(e);
      b.vx = 0;                         // hang in place — no uniform drift
      e.state = 'trapped';
      this.bubbles.push(b);
      n++;
    }
    if (n) {
      AudioSys.play('trap');
      Shake.add(0.4);
      Particles.burst(WIDTH / 2, PLAY_Y + 320, { count: 30, palette: ['#fff', '#bfe9ff', '#ffd75e'], speed: 420, life: 0.8, gravity: 0, glow: true });
      Particles.text(WIDTH / 2, PLAY_Y + 200, 'BUBBLE STORM!', { color: '#bfe9ff', size: 30 });
    }
  }

  levelCleared() {
    AudioSys.music.stop();
    AudioSys.play('level_clear');
    this.hitstop = Math.max(this.hitstop, 0.09);   // savor the final pop
    for (const p of this.players) if (p && p.state === 'play') p.cheer = true;
    for (let i = 0; i < 4; i++) Particles.confetti(160 + i * 220, PLAY_Y + 200);
    this.clear = { bonusAwarded: false, victory: this.levelIndex + 1 >= LEVELS.length };
    // pop leftover empty bubbles in a sparkly wave
    this.bubbles.forEach((b, i) => { if (b.state !== 'pop') b.chainDelay = 0.05 * i; });
    this.enemies = [];
    this.enterState('clear');
  }

  updateClear(dt) {
    if (this.hitstop > 0) { this.hitstop -= dt; return; }
    this.stateT += dt;
    // if the last life was lost on the clearing frame, it's still game over
    if (this.players.every(p => !p || p.state === 'gone')) {
      this.enterState('gameover');
      return;
    }
    if (this.stateT > 1.5) for (const p of this.players) if (p) p.cheer = false;  // free to grab snacks
    for (const p of this.players) if (p) p.update(this, dt);
    for (const b of this.bubbles) b.update(this, dt);
    for (const it of this.items) it.update(this, dt);
    this.bubbles = this.bubbles.filter(b => b.state !== 'dead');
    this.items = this.items.filter(i => !i.dead);

    // collect during the linger window
    for (const p of this.players) {
      if (!p || p.state !== 'play') continue;
      for (const it of this.items) {
        if (!it.dead && aabb(p.x, p.y, p.w + 10, p.h + 10, it.x, it.y, it.w, it.h)) it.collect(this, p);
      }
    }

    if (!this.clear.bonusAwarded && this.stateT > 1.2) {
      this.clear.bonusAwarded = true;
      const bonus = Math.max(0, Math.ceil(this.level.time)) * SCORING.TIME_BONUS_PER_SEC;
      this.clear.bonus = bonus;
      for (const p of this.players) {
        if (p && p.state !== 'gone' && bonus > 0) {
          this.score.addPoints(p.idx, bonus, p.x, p.y - 30, this, { color: COLORS.hi, size: 18 });
        }
      }
      AudioSys.play('count');
    }

    if (this.stateT >= TIMERS.CLEAR_LINGER) {
      if (this.clear.victory) this.enterState('victory');
      else { this.loadLevel(this.levelIndex + 1); this.enterState('play'); }
    }
  }

  // ------------------------------------------------------------ helpers

  nearestPlayer(x, y) {
    let best = null, bd = Infinity;
    for (const p of this.players) {
      if (!p || p.state !== 'play') continue;
      const d = dist2(x, y, p.x, p.y);
      if (d < bd) { bd = d; best = p; }
    }
    return best;
  }

  shakeAdd(m) { Shake.add(m); }

  // -------------------------------------------------------------- draw

  draw(ctx) {
    switch (this.state) {
      case 'title': UI.drawTitle(this, ctx, this.t); return;
      case 'howto': UI.drawHowto(this, ctx, this.t); return;
      case 'select': UI.drawSelect(this, ctx, this.t); return;
      case 'scores': UI.drawScores(this, ctx, this.t); return;
      case 'entry': UI.drawEntry(this, ctx, this.t); return;
    }

    // world (play / pause / clear / gameover / victory)
    ctx.fillStyle = '#0a0e24';                 // backdrop so shake offsets never smear
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.save();
    ctx.translate(Shake.x, Shake.y);
    drawBackground(ctx, this.level.theme, this.t);
    if (this.level.tileLayer) ctx.drawImage(this.level.tileLayer, 0, 0);
    for (const bo of this.bouncers) bo.draw(ctx);
    drawMovers(this.level, ctx, this.t);
    for (const it of this.items) it.draw(ctx);
    for (const e of this.enemies) if (!(e.spawnDelay > 0)) e.draw(ctx, this.t);
    for (const b of this.bubbles) b.draw(ctx, this.t);
    for (const p of this.players) if (p) p.draw(ctx);
    Particles.draw(ctx);
    ctx.restore();

    UI.drawHUD(this, ctx, this.t);

    // banners
    if (this.state === 'play' && this.stateT < TIMERS.INTRO) {
      UI.drawBanner(ctx, `ROUND ${this.levelIndex + 1}`, `${this.level.name} — READY!`, this.stateT);
    }
    if (this.hurryBannerT > 0 && Math.floor(this.t * 6) % 2 === 0) {
      UI.drawText(ctx, this.grimbleOut ? 'RUN!!' : 'HURRY UP!', WIDTH / 2, PLAY_Y + 120, { size: 36, fill: COLORS.danger, glow: 'rgba(255,84,112,0.9)' });
    }
    if (this.state === 'clear' && !this.clear.victory) {
      UI.drawBanner(ctx, 'CAVE CLEAR!', this.clear.bonusAwarded && this.clear.bonus ? `TIME BONUS ${this.clear.bonus}` : '', Math.min(this.stateT, 1), { fill: '#7be8c8', glow: 'rgba(123,232,200,0.9)' });
    }
    if (this.state === 'gameover') UI.drawGameOver(this, ctx, this.stateT);
    if (this.state === 'victory') UI.drawVictory(this, ctx, this.stateT);
    if (this.state === 'pause') UI.drawPauseOverlay(this, ctx, this.t);
  }

  // ---------------------------------------------------------- test API

  snapshot() {
    return {
      state: this.state,
      level: this.levelIndex,
      levelName: this.level ? this.level.name : null,
      time: this.level ? Math.round(this.level.time * 10) / 10 : null,
      players: this.players.map(p => p && {
        x: Math.round(p.x), y: Math.round(p.y), state: p.state, lives: p.lives,
        dir: p.dir, onGround: p.onGround, pow: { ...p.pow },
      }),
      scores: [...this.score.scores],
      enemies: this.enemies.map(e => ({ type: e.type, state: e.state, x: Math.round(e.x), y: Math.round(e.y), angry: e.angry, hp: e.hp })),
      bubbles: this.bubbles.map(b => ({ state: b.state, x: Math.round(b.x), y: Math.round(b.y), captured: b.captured ? b.captured.type : null })),
      items: this.items.map(i => ({ kind: i.kind, x: Math.round(i.x), y: Math.round(i.y) })),
      combo: this.combo.count,
      hurry: this.hurry,
    };
  }
}
