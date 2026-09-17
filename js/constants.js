// Bubble Caverns — authoritative tuning constants.
// Every gameplay number lives here so feel can be tuned in one place.

export const TILE = 32;
export const COLS = 30;
export const ROWS = 20;
export const HUD_H = 64;
export const WIDTH = COLS * TILE;            // 960
export const PLAY_H = ROWS * TILE;           // 640
export const HEIGHT = HUD_H + PLAY_H;        // 704
export const PLAY_Y = HUD_H;

export const STEP = 1 / 60;                  // fixed update timestep

export const PHYS = {
  GRAVITY: 1500,
  MAX_FALL: 700,
  RUN_SPEED: 220,
  RUN_ACCEL: 2200,
  RUN_DECEL: 2600,
  AIR_CONTROL: 0.75,
  JUMP_V: 640,                               // apex = 136.5px = 4.27 tiles; clears four-row platform gaps
  JUMP_CUT: 0.55,                            // velocity multiplier on early release
  COYOTE: 0.10,
  JUMP_BUFFER: 0.12,
};

export const PLAYER = {
  W: 28, H: 38,
  LIVES: 3,
  SHOOT_CD: 0.38,
  SHOOT_CD_RAPID: 0.16,
  RESPAWN_DELAY: 1.6,
  SPAWN_INVULN: 3.0,
  MAX_BUBBLES: 8,
  SPEED_MULT: 1.4,                           // shoe power-up
  STAR_TIME: 8, SPEED_TIME: 12, RAPID_TIME: 12,
  RANGE_TIME: 12, BIG_TIME: 12, MULTI_TIME: 20,
};

export const BUBBLE = {
  R: 22, R_BIG: 30,
  SHOOT_SPEED: 420,
  SHOOT_DECAY: 0.45,                         // seconds of forward travel
  RANGE_MULT: 1.6,                           // candy_yellow power-up
  FLOAT_VY: -42,                             // terminal upward drift
  LIFETIME: 7.0,
  STRAIN_AT: 5.5,                            // visual warning age
  ESCAPE_TIME: 8.0,                          // trapped enemy breaks free
  CHAIN_RADIUS: 26,                          // extra reach for chain pops
  CHAIN_DELAY: 0.06,
  OWNER_GRACE: 0.22,                         // owner can't pop own fresh bubble
  BOUNCE_V: 620,
  BOUNCER_V: 760,                            // static golden bouncer launch
};

export const ENEMY = {
  W: 30, H: 34,
  ANGRY_MULT: 1.45,
  SPAWN_GHOST: 0.6,                          // intangible drop-in time
  STATS: {
    bumbler: { speed: 70,  fruitTier: 0 },
    hopkin:  { speed: 55,  fruitTier: 1, hopV: 360, leapV: 600 },
    snoot:   { speed: 62,  fruitTier: 1, jumpV: 600 },
    wispel:  { speed: 90,  fruitTier: 2, waveAmp: 60, waveHz: 2.6 },
    klonk:   { speed: 50,  fruitTier: 2, hp: 2 },
    grimble: { speed: 135, fruitTier: 0 },
    boss:    { speed: 60,  fruitTier: 5, hp: 3, chargeSpeed: 230, chargeEvery: 5 },
  },
  BOSS_W: 80, BOSS_H: 78,
  BOSS_TRAP_TIME: 2.5,
  BOSS_MINION_EVERY: 8,
  BOSS_MAX_MINIONS: 2,
};

export const SCORING = {
  TRAP: 100,
  POP_BASE: 1000,                            // doubles per combo step
  POP_CAP: 16000,
  COMBO_WINDOW: 1.2,
  KLONK_CRACK: 200,
  BOSS_HIT: 3000,
  TIME_BONUS_PER_SEC: 50,
  EXTRA_LIFE_FIRST: 30000,
  EXTRA_LIFE_SECOND: 100000,
  EXTRA_LIFE_STEP: 100000,
};

// kind -> {value} for fruit, or {powerup} applied on pickup
export const ITEMS = {
  cherry:        { value: 100 },
  blueberry:     { value: 300 },
  banana:        { value: 500 },
  melon:         { value: 1000 },
  crystal_fruit: { value: 2000 },
  rainbow_fruit: { value: 5000 },
  shoe:          { value: 500, powerup: 'speed' },
  candy_red:     { value: 500, powerup: 'rapid' },
  candy_yellow:  { value: 500, powerup: 'range' },
  candy_purple:  { value: 500, powerup: 'big' },
  star:          { value: 1000, powerup: 'star' },
  gem:           { value: 1000, powerup: 'multi' },
  heart:         { value: 1000, powerup: 'life' },
  bolt:          { value: 2000, powerup: 'clear' },
};
export const FRUIT_TIERS = ['cherry', 'blueberry', 'banana', 'melon', 'crystal_fruit', 'rainbow_fruit'];
export const POWERUP_WEIGHTS = [
  ['shoe', 18], ['candy_red', 18], ['candy_yellow', 14], ['candy_purple', 12],
  ['star', 10], ['gem', 12], ['heart', 6], ['bolt', 4],
];
export const ITEM_LIFETIME = 12;
export const FRUIT_SPOT_EVERY = 9;           // ambient fruit spawn cadence
export const POWERUP_DROP_CHANCE = 0.10;     // on enemy defeat without combo

export const TIMERS = {
  HURRY_AT: 20,                              // seconds remaining
  INTRO: 2.0,
  CLEAR_LINGER: 4.0,                         // fruit-collection window after clear
  GAMEOVER_WAIT: 3.5,
};

export const COLORS = {
  p1: '#7be8c8', p2: '#ffb3a0',
  score: '#ffffff', hi: '#ffd75e',
  combo: '#ffd75e', danger: '#ff5470',
  powerup: '#c9a0ff',
};
