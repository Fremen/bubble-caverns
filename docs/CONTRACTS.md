# Bubble Caverns — Module Contracts

Single source of truth for module interfaces. Every module is a zero-dependency
browser ES module under `js/`. No external libraries, no network fetches, no
binary assets — all art and audio are generated procedurally at runtime.
All content must be 100% original (no copyrighted names, sprites, or melodies).

## Global conventions

- Logical canvas: **960 × 704** px. HUD occupies the top **64** px; the playfield
  is 960 × 640 below it (`PLAY_Y = 64`).
- Tile grid: **32 px** tiles, **30 cols × 20 rows**. Grid (col,row) → pixels:
  `x = col*32`, `y = 64 + row*32`.
- Entities use center-anchored positions: `{x, y}` is the hitbox center;
  `{w, h}` is the hitbox size. Sprites draw centered on `(x, y)`.
- Coordinate facing: sprites are authored **facing right**; the renderer flips
  horizontally for left.
- Fixed timestep: 60 updates/sec, `dt` in seconds.
- Visual style: hand-painted modern cartoon (radial gradients, soft rim light,
  subtle dark outlines, glow) — **not** pixel art. Cute, bright, rounded.

Files owned by the core team (do not touch): `index.html`, `css/style.css`,
`js/main.js`, `js/game.js`, `js/constants.js`, `js/utils.js`, `js/input.js`,
`js/physics.js`, `js/player.js`, `js/bubbles.js`, `js/enemies.js`,
`js/items.js`, `js/score.js`, `js/levelManager.js`, `js/ui.js`.

Module-owned files (one owner each): `js/sprites.js`, `js/audio.js`,
`js/levels.js`, `js/particles.js` (+ that owner's `dev/*.html` preview page).

---

## §Sprites — `js/sprites.js`

```js
export function initSprites()                  // pre-render everything; call once at boot
export function sprite(name, frame = 0)        // -> HTMLCanvasElement (frame wraps modulo count)
export function drawBackground(ctx, theme, t)  // paint full 960x704 animated background
export const SPRITE_LIST                       // { name: { frames, w, h } } for validation
```

Rules:
- `sprite()` must be an O(1) lookup of pre-rendered offscreen canvases.
  Unknown name → return a magenta 32×32 placeholder and `console.warn` once.
- `initSprites()` target budget ≈150 ms. `drawBackground` must cache its static
  layers per theme in offscreen canvases; per-frame work is only cheap dynamic
  accents (glow pulse, drifting motes, water shimmer) driven by `t` (seconds).
- Themes: `'moss' | 'crystal' | 'ember' | 'abyss' | 'gold'` — glowing cave
  worlds (mushrooms, crystals, embers, deep gloom, treasure shimmer) with
  layered silhouettes, parallax-style depth, and a soft vignette.

Required sprites (name → frames @ canvas size; characters fill ~80% of the box):

| Name | Frames | Size | Notes |
|---|---|---|---|
| `p1_idle` | 4 | 48×48 | Puff: round mint axolotl-dragon, big eyes, frilly gills; breathing bob |
| `p1_run` | 6 | 48×48 | bouncy run cycle |
| `p1_jump` | 2 | 48×48 | up pose |
| `p1_fall` | 2 | 48×48 | flailing fall |
| `p1_shoot` | 3 | 48×48 | puffed cheeks → blow |
| `p1_hit` | 2 | 48×48 | dizzy/ouch |
| `p1_cheer` | 4 | 48×48 | victory hop |
| `p1_death` | 4 | 48×48 | dramatic spin-faint |
| `p2_*` | same | 48×48 | Plop: identical set, peach/coral palette, lidded eyes |
| `bumbler_walk` | 4 | 48×48 | round grumpy grub, stubby feet |
| `hopkin_walk` | 4 | 48×48 | spring-legged frog imp (incl. crouch + airborne poses) |
| `snoot_walk` | 4 | 48×48 | long-nosed sniffer, leans forward |
| `wispel_fly` | 4 | 48×48 | jelly-moth, translucent glow wings |
| `klonk_walk` | 4 | 48×48 | rocky armoured beetle, visible plates |
| `klonk_cracked_walk` | 4 | 48×48 | same but cracked/chipped armor |
| `grimble_fly` | 4 | 56×56 | spectral reaper-wisp, ominous violet glow |
| `boss_walk` | 4 | 96×96 | King Klonk: huge crowned armoured beetle |
| `boss_cracked` | 4 | 96×96 | battle-damaged variant |
| `bubble_float` | 4 | 64×64 | glossy soap bubble: rainbow rim, twin highlights, wobble squash |
| `bubble_pop` | 3 | 64×64 | pop flash/shards |
| `bouncer` | 2 | 48×48 | springy golden bubble (squash on frame 1) |
| `cherry` `blueberry` `banana` `melon` `crystal_fruit` `rainbow_fruit` | 1 each | 36×36 | juicy glossy fruit/gem snacks |
| `shoe` | 1 | 36×36 | winged sneaker (speed) |
| `candy_red` `candy_yellow` `candy_purple` | 1 each | 36×36 | wrapped candies (rapid / range / big bubbles) |
| `star` | 2 | 36×36 | invincibility star, twinkle |
| `gem` | 2 | 36×36 | score ×2 gem, sparkle |
| `heart` | 2 | 36×36 | extra life, pulse |
| `bolt` | 2 | 36×36 | screen-clear lightning bottle |
| `tile_solid_<theme>` | 1 each | 32×32 | chunky soft-bevel block per theme (5 themes) |
| `tile_plat_<theme>` | 1 each | 32×32 | thinner one-way platform top per theme |
| `spike` | 1 | 32×32 | crystal spike hazard, sits on tile floor |
| `orb` | 2 | 40×40 | deadly patrol orb, hot glow |
| `life_p1` `life_p2` | 1 each | 28×28 | chibi head icons for lives HUD |
| `logo` | 1 | 520×200 | "BUBBLE CAVERNS" bubbly painted logo with shine |
| `spark` | 1 | 12×12 | soft glow dot |

Also write `dev/sprites.html`: standalone gallery (loads the module, draws every
sprite frame labeled on a dark grid + theme background previews animating).

## §Audio — `js/audio.js`

```js
export const AudioSys = {
  init(),                 // safe to call early; creates nothing audible yet
  unlock(),               // call on first user gesture; creates/resumes AudioContext
  play(name, opts = {}),  // fire-and-forget SFX; silent no-op before unlock
  music: {
    play(track),          // 'title' | 'main' | 'boss'  (restarts if different track)
    setFast(fast),        // bool; tempo ×1.35, switch cleanly at next bar
    stop(),
  },
  setMuted(m), muted,     // master mute (persist not required)
}
export const SFX_LIST     // array of valid names
```

SFX names: `jump`, `shoot`, `trap`, `pop`, `enemy_down`, `pickup`, `powerup`,
`extra_life`, `hurt`, `death`, `bounce`, `menu_move`, `menu_select`,
`level_clear`, `game_over`, `hurry`, `boss_hit`, `boss_down`, `count`.

- All synthesized with WebAudio (oscillators/noise buffers/envelopes); no samples.
- `opts.pitch` (0..7): combo escalation — `pop` should rise in pitch per step.
  `opts.vol` (0..1) optional.
- Music: original chiptune compositions via a lookahead step-sequencer
  (square lead, triangle bass, soft noise hats; light delay ok). `title` =
  bouncy 8 bars, `main` = catchy 16-bar earworm, `boss` = driving minor.
- Master chain: gain → DynamicsCompressor → destination. Modest overall volume.
- Must never throw if called before init/unlock or after tab suspend.

Also write `dev/audio.html`: buttons for every SFX + music track controls + fast toggle.

## §Levels — `js/levels.js`

```js
export const LEVELS    // array of 12 level objects
export const LEGEND    // documented char map (object)
export function validateLevels()  // -> [] when ok, else array of issue strings
```

Level object:

```js
{
  name: 'Mossy Hollow',        // short original cave name
  theme: 'moss',               // moss|crystal|ember|abyss|gold
  time: 75,                    // seconds before hurry-up escalation chain
  grid: [ /* exactly 20 strings, each exactly 30 chars */ ],
  movers: [ {x1,y1,x2,y2, period} ],  // optional deadly orbs; tile coords, ping-pong
  boss: false,                 // true only on level 12
}
```

Grid legend:
- `#` solid block · `=` one-way platform (jump up through, land on top)
- ` ` empty · `P` player1 spawn · `Q` player2 spawn (place adjacent to P)
- `1` Bumbler `2` Hopkin `3` Snoot `4` Wispel `5` Klonk `K` King Klonk (boss)
- `B` bouncer bubble · `*` fruit spawn spot · `^` spike (sits on the tile below it)

Design constraints (the physics these must respect):
- Jump apex ≈ **3.75 tiles**; place platform rows **3–4 rows apart** so every
  platform is reachable by jumping up through `=` platforms.
- Col 0 and col 29 are `#` for all rows. Row 0 is `#` across (ceiling).
  Row 19 is mostly `#` floor; leaving gaps in row 19 enables vertical wrap
  (fall out the bottom → reappear at top). Use wrap intentionally on some levels.
- Spawns (`P`,`Q`, digits) must sit on empty cells with support below
  (solid/platform within a few rows). Don't bury anything in walls.
- 2–5 `*` spots per level, on platforms. Spikes from L6 onward, sparingly.
- Difficulty arc per the spec: L1 two-platform tutorial (2 Bumblers) →
  L2 gaps → L3 mixed types → L4 narrow vertical shafts → L5 tight timer (set
  `time: 45`) → L6 movers debut → L7 bonus-fruit feast (gold theme, many `*`,
  few enemies) → L8 fast crowd (Hopkins/Wispels) → L9 dense maze →
  L10 armoured push (Klonks) → L11 everything-mix → L12 boss arena (`K`,
  open center, `boss: true`, theme ember or abyss).
- Themes flow in groups (1–3 moss, 4–6 crystal, 7 gold, 8–9 ember, 10–11 abyss,
  12 your pick of ember/gold).

Also write `dev/levels.html`: renders each grid as labeled monospace ASCII and
prints `validateLevels()` output.

## §Particles — `js/particles.js`

```js
export const Particles = {
  clear(), update(dt), draw(ctx),
  pop(x, y, { big = false, hue } = {}),     // bubble pop: expanding ring + droplets + star glints
  burst(x, y, opts),                        // generic radial burst {count,palette,speed,life,gravity,glow}
  sparkle(x, y, color),                     // small twinkle
  collect(x, y, color),                     // pickup swirl rising glints
  confetti(x, y),                           // celebration shower (flutter physics)
  trailDust(x, y, dir),                     // little run/land dust puff
  text(x, y, str, { color, size } = {}),    // floating score text, chunky outlined, pop-in scale + drift up + fade
  ambient(theme, dt, w, h),                 // spawn sparse theme motes (spores/embers/glints); call once per frame
}
export const Shake = {
  add(mag),            // accumulate trauma (0..1-ish per hit)
  update(dt),          // decay
  x, y,                // current pixel offset, clamped to ±10
}
```

- Object-pooled, hard cap ~800 live particles, zero per-frame allocations in
  steady state. Single `draw(ctx)` pass; use additive compositing for glows
  (save/restore). `text` particles render via canvas text with dark outline.

Also write `dev/particles.html`: dark page, buttons triggering each effect at
the mouse position.

---

## Shared gameplay numbers (authoritative, live in `js/constants.js`)

Gravity 1500 px/s² · run 220 px/s · jump velocity 600 (apex ≈120 px = 3.75 tiles)
· max fall 700 · coyote 0.10 s · jump buffer 0.12 s · bubble shoot speed 420
decaying to float in 0.45 s · bubble lifetime ≈7 s · trapped escape 8 s ·
level timer per level def; hurry warning at 20 s left; Grimble at 0.

## Integration safety

- Core code calls only the exports above. Every module must also fail soft:
  missing sprite → placeholder; unknown SFX → warn once; bad level → reported by
  `validateLevels()`.
- A test harness runs the game headless via `?test=1` (no RAF; manual stepping).
  Modules must not require user gestures except `AudioSys.unlock()`.
