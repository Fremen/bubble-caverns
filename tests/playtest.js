// Headless playtest driven through window.__game (?test=1 harness).
// Run via the browse daemon's `eval` against http://localhost:8763/?test=1&mute=1&seed=42
// Returns a JSON report of scenario outcomes.
(() => {
  const g = window.__game;
  if (!g) return JSON.stringify({ fatal: 'no __game harness — did you load ?test=1?' });
  const R = [];
  const ok = (name, cond, info = '') => R.push({ name, ok: !!cond, info: String(info) });

  try {
    // 1. title renders, menu starts a game
    ok('boot: title state', g.snapshot().state === 'title', g.snapshot().state);
    g.start(1, 0);
    let s = g.step(1);
    ok('start: play state on level 1', s.state === 'play' && s.level === 0);

    // 2. intro (2s) + stagger + ghost-drop, then enemies are live
    s = g.step(300);
    ok('spawn: enemies active', s.enemies.length === 2 && s.enemies.every(e => e.state === 'active'), JSON.stringify(s.enemies));

    // 3. movement: hold right, player x increases
    const x0 = s.players[0].x;
    g.key('ArrowRight', true); s = g.step(45); g.key('ArrowRight', false);
    ok('move: runs right', s.players[0].x > x0 + 60, `${x0} -> ${s.players[0].x}`);

    // 4. jump: leaves ground
    g.key('Space', true); s = g.step(12); g.key('Space', false);
    ok('jump: airborne', !s.players[0].onGround, JSON.stringify({ y: s.players[0].y, og: s.players[0].onGround }));
    s = g.step(60);
    ok('jump: lands again', s.players[0].onGround);

    // 5. shoot: bubble exists
    g.key('KeyJ', true); s = g.step(3); g.key('KeyJ', false);
    ok('shoot: bubble spawned', s.bubbles.length >= 1, JSON.stringify(s.bubbles));

    // 6. trap: teleport enemy onto a fresh bubble path
    const game = g.game;
    const p = game.players[0];
    p.invuln = 999;
    g.key('KeyK', true); g.step(2); g.key('KeyK', false);
    const e = game.enemies[0];
    let trapped = false;
    for (let i = 0; i < 50 && !trapped; i++) {
      if (e.state === 'active') { e.x = p.x + p.dir * 60; e.y = p.y; e.vx = 0; e.vy = 0; }
      g.step(1);
      trapped = e.state === 'trapped';
    }
    ok('trap: enemy bubbled', trapped, e.state);

    // 7. pop: touch the bubble (not holding jump)
    const bub = game.bubbles.find(b => b.captured === e);
    let popped = false;
    if (bub) {
      for (let i = 0; i < 90 && !popped; i++) {
        p.x = bub.x; p.y = bub.y + 10; p.vy = 0;
        g.step(1);
        popped = !game.enemies.includes(e);
      }
    }
    ok('pop: enemy defeated by touch', popped);
    ok('pop: scored >= 1100', game.score.scores[0] >= 1100, game.score.scores[0]);
    ok('pop: snack dropped', game.items.length >= 1, game.items.length);

    // 8. collect the snack
    const it = game.items[0];
    let collected = false;
    for (let i = 0; i < 120 && !collected; i++) {
      if (game.items[0]) { p.x = game.items[0].x; p.y = game.items[0].y; }
      g.step(1);
      collected = game.items.length === 0;
    }
    ok('collect: snack eaten', collected);

    // 9. clear the level: defeat remaining, expect clear -> next round
    for (let guard = 0; guard < 10 && game.enemies.filter(x => x.type !== 'grimble').length; guard++) {
      game.enemyDefeated(game.enemies.find(x => x.type !== 'grimble'), 0);
      g.step(2);
    }
    g.step(40);
    ok('clear: state reached', game.state === 'clear', game.state);
    g.step(60 * 5);
    s = g.snapshot();
    ok('clear: advanced to round 2', s.level === 1 && s.state === 'play', JSON.stringify({ level: s.level, state: s.state }));

    // 10. hurry + grimble
    game.level.time = 20.5; g.step(60);
    ok('hurry: triggered', game.hurry === true);
    game.level.time = 0.01; g.step(20);
    ok('grimble: spawned at timeout', game.enemies.some(x => x.type === 'grimble'));

    // 11. pause
    g.key('Escape', true); g.step(2); g.key('Escape', false);
    ok('pause: opens', game.state === 'pause', game.state);
    g.key('Enter', true); g.step(2); g.key('Enter', false);   // RESUME selected
    ok('pause: resumes', game.state === 'play', game.state);

    // 12. death + respawn
    p.invuln = 0; p.pow.star = 0;
    const lives = p.lives;
    p.hit(game);
    ok('death: life lost', p.lives === lives - 1 && p.state === 'dead');
    g.step(150);
    ok('death: respawned w/ invuln', p.state === 'play' && p.invuln > 0, JSON.stringify({ st: p.state, inv: p.invuln }));

    // 13. boss level sanity
    g.loadLevel(11);
    g.step(240);
    const boss = game.enemies.find(x => x.type === 'boss');
    ok('boss: present on level 12', !!boss && game.level.boss === true);
    if (boss) {
      game.enemyDefeated(boss, 0); g.step(5);
      ok('boss: survives first hit', boss.hp === 2 && boss.state === 'active', `hp=${boss.hp}`);
      game.enemyDefeated(boss, 0); g.step(5);
      game.enemyDefeated(boss, 0); g.step(20);     // outlast death hitstop
      ok('boss: dies on third hit', !game.enemies.includes(boss), `hp=${boss.hp}`);
    }
  } catch (err) {
    R.push({ name: 'CRASH', ok: false, info: String(err && err.stack || err) });
  }

  const passed = R.filter(r => r.ok).length;
  return JSON.stringify({ passed, total: R.length, results: R.filter(r => !r.ok).length ? R : R.map(r => r.name) }, null, 1);
})()
