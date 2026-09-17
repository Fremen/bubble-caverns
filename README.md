# 🫧 Bubble Caverns

An original single-screen arcade platformer in the spirit of beloved Amiga-era
bubble-trapping games — rebuilt from scratch with modern hand-painted canvas
art, synthesized chiptune audio, and juicy game feel. Every character, name,
sprite, sound, and melody here is original.

**Trap critters in bubbles. Pop them. Chain combos. Eat the snacks. Don't dawdle.**

[Play Bubble Caverns](https://fremen.github.io/bubble-caverns/)

## Run it

No build step, no dependencies — it's vanilla ES modules. Serve the folder
over HTTP (modules don't load from `file://`):

```bash
cd bubble-caverns
python3 -m http.server 8763
# then open http://localhost:8763
```

(or `npx serve`, or any static file server.)

## Controls

| Action | Keyboard | Gamepad |
|---|---|---|
| Move | Arrows or A / D | Stick / D-pad |
| Jump | Space (W / ↑ also work) | A / Cross |
| Shoot bubble | Ctrl, J or K | X / Square |
| Start / confirm | Enter | Start |
| Pause | Esc | Start |
| Mute | M | — |

**Two-player co-op** (select TWO PLAYERS on the title screen):
- **Puff (P1):** A/D move · W or Space jump · F or Left-Ctrl shoot
- **Plop (P2):** Arrows move · ↑ jump · / or Right-Shift shoot
- Gamepads 1 and 2 map to players 1 and 2.

## How to play

- Shoot bubbles to trap critters; pop the bubble (touch it) before they
  wriggle free angrier and faster.
- **Hold jump while landing on a bubble to bounce** off it instead of popping.
- Chain pops within a heartbeat for combo points: 1000 → 2000 → 4000 → … 16000.
- Defeated critters drop snacks; combos can drop **power-ups**: winged shoe
  (speed), red candy (rapid fire), yellow candy (long range), purple candy
  (big bubbles — traps armoured Klonks in one hit), star (invincibility),
  gem (score ×2), heart (extra life), lightning bottle (bubble storm —
  bubbles *every* critter on screen).
- Each cave has a timer: low time means faster music and enraged critters,
  and if you dawdle past zero, **Grimble** — an unstoppable reaper-wisp —
  comes for you. Clear the cave to banish it.
- Golden bouncer bubbles launch you sky-high. Falling out the bottom of some
  caves wraps you to the top.
- Extra life at 30,000 points, 100,000, then every 100,000.

## The cast

| Who | Role |
|---|---|
| **Puff & Plop** | Heroic pufflings (you) |
| **Bumbler** | Grumpy patrolling grub |
| **Hopkin** | Spring-legged leaper |
| **Snoot** | Long-nosed sniffer that hunts you |
| **Wispel** | Jelly-moth that flies in waves |
| **Klonk** | Armoured beetle — needs two bubbles |
| **Grimble** | Invincible hurry-up reaper. Run. |
| **King Klonk** | Crowned mini-boss of cave 12 (3 hits) |

## Project structure

```
index.html            game shell
css/style.css         page chrome
js/
  main.js             boot, fixed-timestep loop, DPR scaling, test harness
  constants.js        every tuning number in one place
  game.js             state machine, collisions, combos, hurry-up pressure
  player.js           controller: coyote time, jump buffer, power-ups
  bubbles.js          bubble physics, capture, chain pops, bouncers
  enemies.js          5 enemy AIs + Grimble + boss
  items.js            fruit & power-up pickups
  levels.js           12 data-driven level grids (validateLevels())
  levelManager.js     grid parsing, tile pre-render, moving hazards
  physics.js          tile collision, one-way platforms, vertical wrap
  score.js            scores, combos, extra lives, localStorage hi-scores
  ui.js               HUD + all menu screens
  input.js            keyboard + gamepad, edge detection, co-op bindings
  sprites.js          ALL art, procedurally painted at boot (no asset files)
  audio.js            ALL audio, synthesized WebAudio (SFX + 3 original tracks)
  particles.js        pooled VFX + screen shake
dev/                  standalone preview pages per module (sprites/audio/levels/particles)
tests/run.html        logic + integration test page (PASS/FAIL output)
docs/CONTRACTS.md     module interface contracts
```

## Testing & debugging

- **Logic tests:** open `http://localhost:8763/tests/run.html` — runs level
  validation, physics math, scoring, persistence, and a scripted
  trap→pop→clear integration playthrough.
- **Deterministic harness:** open the game with `?test=1&seed=42&mute=1` —
  disables the RAF loop and exposes `window.__game`
  (`start(mode, level)`, `step(frames)`, `key(code, down)`, `snapshot()`).
- **Module previews:** `dev/sprites.html`, `dev/audio.html`,
  `dev/levels.html`, `dev/particles.html`.
- Handy URL params: `?level=N` (with test), `?mute=1`, `?seed=N`.

## License / originality

All code, art, audio, characters, and level designs are original works
created for this project. The game pays homage to a classic *genre* —
single-screen bubble-trapping arcade platformers — without using any
copyrighted assets, names, or music.

Released under the [MIT License](LICENSE).


## Touch controls

On touchscreen devices, controls appear below the game. Use the direction pad for movement and menus, Jump to jump, and Bubble to shoot. Start confirms menus; Pause opens the pause menu. Touch controls operate player one. Multiple controls can be held together. Inputs release on cancelled touches or when switching away from the app. Landscape gives more horizontal room.

The game viewport reserves space for the control panel and its safe-area padding. Mobile input lifecycle checks pass; physical iPhone Safari performance and playability still need device testing.
