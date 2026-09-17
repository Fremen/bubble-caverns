# Build Plan — Bubble Caverns

Phases (check off as completed):

- [x] Phase 0 — repo init, CONTRACTS.md, spec, plan
- [x] Phase 1 — parallel module agents (audio ✓, levels ✓ [validate []], particles ✓; sprites in flight)
- [x] Phase 2 — core engine written by lead (constants, utils, input, physics,
      player, bubbles, enemies, items, score, levelManager, ui, game, main,
      index.html, css, tests/run.html) — all node --check clean
- [x] Phase 3 — integration: zero console errors on first boot; 25/25 logic
      tests; 23/23 playtest scenarios; visual checks on all screens/themes
- [x] Phase 4 — adversarial review workflow (31 agents, 5 lenses): 38 confirmed
      findings (3 major: boss trap timer clobbered, title music never started
      pre-unlock, fast tempo leaked across tracks) — all fixed; 3 refuted
- [x] Phase 5 — README, final verification (25/25 + 23/23 + timer probes), commit

Key facts (survive context summarization):
- Repository: `bubble-caverns` (branch `main`)
- Contracts: docs/CONTRACTS.md · Spec: docs/superpowers/specs/2026-06-10-bubble-caverns-design.md
- Serve: `python3 -m http.server 8763` → http://localhost:8763
- Test API: ?test=1 disables RAF; window.__game = {step,key,snapshot,loadLevel,setSeed}
- Engine numbers: tile 32, grid 30×20, canvas 960×704, HUD 64, gravity 1500,
  run 220, jumpV 600, dt fixed 1/60
