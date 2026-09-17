# Bubble Caverns — Design Spec (2026-06-10)

An original single-screen arcade platformer inspired by the *feel* of Amiga-era
bubble-trapping platformers. No copyrighted names, characters, sprites, or
music — everything original and procedurally generated. This doc condenses the
founder-supplied PRD into a verifiable requirements checklist plus the design
decisions the PRD left open.

## Decisions made (PRD left these open)

- **Engine:** HTML5 Canvas + vanilla ES modules. No dependencies, no build
  step. Runs from any static file server; verifiable headlessly.
- **Name/theme:** *Bubble Caverns* — magical glowing underground world.
- **Characters:** Puff (P1, mint) & Plop (P2, peach) — round axolotl-dragon
  "pufflings". Enemies: Bumbler (walker), Hopkin (jumper), Snoot (chaser),
  Wispel (floater), Klonk (armoured, 2 hits), Grimble (invincible hurry-up
  reaper), King Klonk (L12 mini-boss, 3 HP).
- **Levels:** 12 (PRD minimum 10), single screen, data-driven char grids.
- **Resolution:** 960×704 logical, DPR-aware scaling (crisp at 1080p/4K).

## Requirements checklist (for the compliance audit)

### Core gameplay
- [ ] Move left/right; jump between platforms (one-way platforms, jump-through)
- [ ] Shoot bubbles horizontally in facing direction
- [ ] Bubble travels forward briefly, then floats up slowly; wobbles; expires ~7 s
- [ ] Bubble hitting enemy while fresh traps it; trapped enemy floats up
- [ ] Trapped enemy escapes after 8 s and becomes angry (faster, red glow)
- [ ] Pop bubbles by player contact; hold-jump on bubble = bounce without pop
- [ ] Chain pops (neighbouring bubbles cascade) → combo scoring
- [ ] Clear stage by defeating all enemies; popped enemies arc out as fruit
- [ ] 3 lives; respawn with ~3 s invulnerability blink; hit by enemy/hazard = death
- [ ] Vertical wraparound where level floor has gaps

### Game feel
- [ ] Coyote time (0.10 s) + jump buffering (0.12 s)
- [ ] Smooth accel/decel, air control
- [ ] Screen shake on pops; hitstop on level-final pop
- [ ] Particles: pops, sparkles, fruit collect, dust, confetti, floating score text
- [ ] Combo scoring with escalating values (1000×2ⁿ, cap 16000)
- [ ] Level-clear celebration (cheer anim, confetti, jingle, time-bonus tally)
- [ ] Music speeds up when time runs low

### Systems
- [ ] 5 enemy types per PRD + hurry-up invincible chaser + mini-boss
- [ ] Power-ups: rapid fire, longer range, big bubbles, invincibility, speed,
      score ×2, extra life, screen-clear bolt, bonus fruit after defeats
- [ ] Scoring: trap 100, pop 1000 (combo doubling), fruit values, time bonus
      (remaining s × 50), extra life at 30k/100k/then each 100k
- [ ] Timer per level: visible bar; <20 s = warning + fast music + angry
      enemies; 0 = Grimble spawns
- [ ] Modes: 1P arcade, 2P local co-op, level select, high-score table
      (localStorage, top 10, 3-letter arcade entry), pause menu, game over,
      restart level
- [ ] Controls: Arrows/AD + Space jump + Ctrl/J/K shoot + Enter start + Esc
      pause; gamepad support (pad 0/1 → P1/P2); co-op split keys documented
- [ ] Audio per CONTRACTS §Audio: full SFX set + 3 original tracks + fast mode
- [ ] HUD: scores, hi-score, lives, level name, timer bar, power-up icons

### Deliverables
- [ ] index.html runnable prototype + clean modular source
- [ ] 12 playable levels · start screen · instructions screen · game over ·
      high-score table · README with build/run instructions
- [ ] Dev preview pages (sprites/audio/levels/particles) + headless test page
- [ ] `?test=1` deterministic harness (`window.__game`: step/key/snapshot)

## Architecture

See `docs/CONTRACTS.md` for the authoritative module interfaces. Core
(game loop, physics, player, bubbles, enemies, items, score, level manager,
UI screens) is written by the lead; leaf modules (sprites, audio, levels,
particles) are built in parallel against the contracts. Integration falls back
soft (placeholder art, warn-once audio) so a contract drift never hard-crashes.

## Testing

- `tests/run.html`: loads modules, runs logic assertions (level validity, jump
  reach math, capture flow simulation, combo/score math, hi-score persistence),
  prints PASS/FAIL lines to DOM + console for headless scraping.
- Headless playtest via browse daemon: load `?test=1`, drive `__game.step()`
  + virtual keys through scripted scenarios (move, jump, trap, pop, clear).
- Adversarial review workflow before final polish.
