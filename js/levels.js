// js/levels.js — Bubble Caverns level data (§Levels contract).
// Zero-dependency, pure-data ES module. 12 single-screen cave layouts.
//
// Grid: exactly 20 rows x 30 chars. (col,row) tile coords, 32px tiles.
// Legend: '#' solid · '=' one-way platform · ' ' empty · 'P'/'Q' player spawns
//         '1' Bumbler '2' Hopkin '3' Snoot '4' Wispel '5' Klonk 'K' King Klonk
//         'B' bouncer bubble · '*' fruit spawn spot · '^' spike (sits on the '#' below it)
// Physics respected: jump apex ~4.27 tiles, standable surfaces 3-4 rows apart,
// players jump UP through '='. Row-19 gaps = intentional vertical wrap
// (levels 2, 4, 8, 11). Movers are deadly orbs ping-ponging over open space
// (levels 6, 9, 11). Spikes appear from level 6 onward only.

export const LEGEND = {
  '#': 'solid block (blocks all movement)',
  '=': 'one-way platform (jump up through, land on top)',
  ' ': 'empty space',
  'P': 'player 1 spawn',
  'Q': 'player 2 spawn (adjacent to P)',
  '1': 'Bumbler (round grumpy grub)',
  '2': 'Hopkin (spring-legged frog imp)',
  '3': 'Snoot (long-nosed sniffer)',
  '4': 'Wispel (floating jelly-moth)',
  '5': 'Klonk (armoured beetle)',
  'K': 'King Klonk (boss, level 12 only)',
  'B': 'bouncer bubble (springy vertical boost)',
  '*': 'fruit spawn spot',
  '^': 'spike (rendered sitting on the solid tile below it)',
};

export const LEVELS = [
  // ── Level 1 ──────────────────────────────────────────────
  {
    name: 'Mossglow Nursery',
    theme: 'moss',
    time: 75,
    grid: [
      '##############################',
      '#                            #',
      '#                            #',
      '#                            #',
      '#                            #',
      '#                            #',
      '#                            #',
      '#                            #',
      '#                            #',
      '#                            #',
      '#          *      *          #',
      '#         ==========         #',
      '#                            #',
      '#                            #',
      '#    *  1            1  *    #',
      '#    ====================    #',
      '#                            #',
      '#                            #',
      '#             PQ             #',
      '##############################',
    ],
    movers: [],
    boss: false,
  },

  // ── Level 2 ──────────────────────────────────────────────
  {
    name: 'Dripstone Gaps',
    theme: 'moss',
    time: 75,
    grid: [
      '##############################',
      '#                            #',
      '#                            #',
      '#            *  *            #',
      '#           ======           #',
      '#                            #',
      '#                            #',
      '#      1              *      #',
      '#   ======          ======   #',
      '#                            #',
      '#                            #',
      '#             1              #',
      '#         ==========         #',
      '#                            #',
      '#                            #',
      '#   PQ                 1     #',
      '# =======            ======= #',
      '#                            #',
      '#                            #',
      '#############    #############',
    ],
    movers: [],
    boss: false,
  },

  // ── Level 3 ──────────────────────────────────────────────
  {
    name: 'Sporelight Terraces',
    theme: 'moss',
    time: 75,
    grid: [
      '##############################',
      '#                            #',
      '#                            #',
      '#                   *        #',
      '#               ==========   #',
      '#                            #',
      '#      *            4        #',
      '#  ==========                #',
      '#                            #',
      '#               *            #',
      '#             ==========     #',
      '#                            #',
      '#           2                #',
      '#       ==========           #',
      '#                            #',
      '#   B                 1  *   #',
      '#                 ========== #',
      '#                            #',
      '# PQ      3                  #',
      '##############################',
    ],
    movers: [],
    boss: false,
  },

  // ── Level 4 ──────────────────────────────────────────────
  {
    name: 'Crystal Chimneys',
    theme: 'crystal',
    time: 80,
    grid: [
      '##############################',
      '#                            #',
      '#                            #',
      '#             2              #',
      '#          ========          #',
      '#        #          #        #',
      '#        #    *     #        #',
      '# ====== #  ======  # ====== #',
      '#        #          #        #',
      '#        #    4     #        #',
      '#   *    #          #    *   #',
      '#  ======#  ======  #======  #',
      '#        #          #        #',
      '#        #          #        #',
      '#    2   #          #   3    #',
      '# ====== #  ======  # ====== #',
      '#                            #',
      '#                            #',
      '#          PQ                #',
      '#############    #############',
    ],
    movers: [],
    boss: false,
  },

  // ── Level 5 ──────────────────────────────────────────────
  {
    name: 'Glimmer Rush',
    theme: 'crystal',
    time: 45,
    grid: [
      '##############################',
      '#                            #',
      '#                            #',
      '#                            #',
      '#                            #',
      '#                            #',
      '#      *              *      #',
      '# ===========    =========== #',
      '#                            #',
      '#                            #',
      '#        2    *     2        #',
      '#     ==================     #',
      '#                            #',
      '#                            #',
      '#   1                    1   #',
      '# ===========    =========== #',
      '#             B              #',
      '#                            #',
      '# PQ                  3      #',
      '##############################',
    ],
    movers: [],
    boss: false,
  },

  // ── Level 6 ──────────────────────────────────────────────
  {
    name: 'Shardfall Galleries',
    theme: 'crystal',
    time: 75,
    grid: [
      '##############################',
      '#                            #',
      '#                            #',
      '#             *              #',
      '#           ======           #',
      '#                            #',
      '#    *                  *    #',
      '#  ========        ========  #',
      '#                            #',
      '#             4              #',
      '#         3        3         #',
      '#      ================      #',
      '#                            #',
      '#                            #',
      '#    1                  2    #',
      '#  ==========    ==========  #',
      '#                            #',
      '#                            #',
      '# PQ         ^^^^            #',
      '##############################',
    ],
    movers: [
      { x1: 8, y1: 13, x2: 21, y2: 13, period: 6 },
    ],
    boss: false,
  },

  // ── Level 7 ──────────────────────────────────────────────
  {
    name: 'Golden Hoard Hollow',
    theme: 'gold',
    time: 60,
    grid: [
      '##############################',
      '#                            #',
      '#                            #',
      '#             *              #',
      '#         ==========         #',
      '#                            #',
      '#                            #',
      '#    *        B         *    #',
      '# ========          ======== #',
      '#                            #',
      '#                            #',
      '#       *            *       #',
      '#    ====================    #',
      '#                            #',
      '#                            #',
      '#    1        B         3    #',
      '# ========          ======== #',
      '#                            #',
      '#             PQ             #',
      '##############################',
    ],
    movers: [],
    boss: false,
  },

  // ── Level 8 ──────────────────────────────────────────────
  {
    name: 'Emberdrift Crossing',
    theme: 'ember',
    time: 75,
    grid: [
      '##############################',
      '#                            #',
      '#             4              #',
      '#            *  *            #',
      '#           ======           #',
      '#       4            4       #',
      '#    *                  *    #',
      '#  =======          =======  #',
      '#                            #',
      '#             2              #',
      '#         ==========         #',
      '#                            #',
      '#    2                 2     #',
      '# =======            ======= #',
      '#                            #',
      '#            PQ              #',
      '#          ========          #',
      '#                            #',
      '#   ^         ^          ^   #',
      '#######   ##########   #######',
    ],
    movers: [],
    boss: false,
  },

  // ── Level 9 ──────────────────────────────────────────────
  {
    name: 'Cinder Maze',
    theme: 'ember',
    time: 80,
    grid: [
      '##############################',
      '#                            #',
      '#                            #',
      '#    *                  *    #',
      '#  =======          =======  #',
      '#                            #',
      '#             4              #',
      '#         2   *    2         #',
      '#       ==============       #',
      '#                            #',
      '#                            #',
      '#   3         1          3   #',
      '# ======    ######    ====== #',
      '#                            #',
      '#                            #',
      '#      ^              ^      #',
      '#    #######      #######    #',
      '#                            #',
      '# PQ         ^  ^            #',
      '##############################',
    ],
    movers: [
      { x1: 9, y1: 10, x2: 20, y2: 10, period: 5 },
      { x1: 11, y1: 2, x2: 18, y2: 2, period: 4 },
    ],
    boss: false,
  },

  // ── Level 10 ──────────────────────────────────────────────
  {
    name: 'Basalt Bastion',
    theme: 'abyss',
    time: 80,
    grid: [
      '##############################',
      '#                            #',
      '#                            #',
      '#            *  *            #',
      '#           ======           #',
      '#                            #',
      '#                            #',
      '#       5            5       #',
      '#   #########    #########   #',
      '#                            #',
      '#            3  3            #',
      '#         ==========         #',
      '#                            #',
      '#                            #',
      '#   5 *                * 5   #',
      '# ########          ######## #',
      '#                            #',
      '#                            #',
      '#    ^  ^     PQ     ^  ^    #',
      '##############################',
    ],
    movers: [],
    boss: false,
  },

  // ── Level 11 ──────────────────────────────────────────────
  {
    name: 'Abyssal Tempest',
    theme: 'abyss',
    time: 85,
    grid: [
      '##############################',
      '#                            #',
      '#                            #',
      '#  * 2                  3 *  #',
      '# ========          ======== #',
      '#         4                  #',
      '#                            #',
      '#       5     *     2        #',
      '#     ==================     #',
      '#                            #',
      '#                            #',
      '#   1                   5    #',
      '# ========          ======== #',
      '#             B    4         #',
      '#                            #',
      '#          PQ                #',
      '#       ==============       #',
      '#                            #',
      '#       ^  ^      ^  ^       #',
      '###   ##################   ###',
    ],
    movers: [
      { x1: 10, y1: 10, x2: 19, y2: 10, period: 5 },
      { x1: 14, y1: 2, x2: 14, y2: 6, period: 4 },
    ],
    boss: false,
  },

  // ── Level 12 ──────────────────────────────────────────────
  {
    name: "King Klonk's Crucible",
    theme: 'ember',
    time: 99,
    grid: [
      '##############################',
      '#                            #',
      '#                            #',
      '#                            #',
      '#                            #',
      '#                            #',
      '#         *   3    *         #',
      '#       ==============       #',
      '#                            #',
      '#                            #',
      '#      5              5      #',
      '#   =======        =======   #',
      '#                            #',
      '#                            #',
      '#   PQ                  *    #',
      '# =======            ======= #',
      '#                            #',
      '#   B                    B   #',
      '#             K              #',
      '##############################',
    ],
    movers: [],
    boss: true,
  },
];

const LEGAL_CHARS = new Set(Object.keys(LEGEND));

export function validateLevels() {
  const issues = [];
  if (!Array.isArray(LEVELS) || LEVELS.length !== 12) {
    issues.push(`expected exactly 12 levels, got ${Array.isArray(LEVELS) ? LEVELS.length : typeof LEVELS}`);
  }
  (Array.isArray(LEVELS) ? LEVELS : []).forEach((lv, i) => {
    const id = `L${i + 1} "${lv && lv.name}"`;
    if (!lv || !Array.isArray(lv.grid)) { issues.push(`${id}: grid missing or not an array`); return; }
    const g = lv.grid;

    // row / col counts + legal chars
    if (g.length !== 20) issues.push(`${id}: expected 20 rows, got ${g.length}`);
    g.forEach((row, r) => {
      if (typeof row !== 'string' || row.length !== 30) {
        issues.push(`${id}: row ${r} must be a 30-char string, got length ${row == null ? row : row.length}`);
        return;
      }
      for (let c = 0; c < row.length; c++) {
        if (!LEGAL_CHARS.has(row[c])) issues.push(`${id}: illegal char "${row[c]}" at row ${r}, col ${c}`);
      }
    });

    // borders: row 0 all '#', col 0 and col 29 '#' on every row
    if (typeof g[0] === 'string' && /[^#]/.test(g[0])) issues.push(`${id}: row 0 (ceiling) must be all '#'`);
    g.forEach((row, r) => {
      if (typeof row !== 'string') return;
      if (row[0] !== '#') issues.push(`${id}: col 0 must be '#' (row ${r})`);
      if (row[29] !== '#') issues.push(`${id}: col 29 must be '#' (row ${r})`);
    });

    const all = g.join('');
    const count = (ch) => all.split(ch).length - 1;

    // spawns
    if (count('P') !== 1) issues.push(`${id}: expected exactly one P, got ${count('P')}`);
    if (count('Q') < 1) issues.push(`${id}: Q (player 2 spawn) missing`);

    // at least one enemy or K
    const enemies = count('1') + count('2') + count('3') + count('4') + count('5') + count('K');
    if (enemies < 1) issues.push(`${id}: needs at least one enemy or K`);

    // boss flag only on level 12 (and required there); K only on the boss level
    if (i === 11) {
      if (lv.boss !== true) issues.push(`${id}: level 12 must set boss: true`);
      if (count('K') < 1) issues.push(`${id}: boss level must contain K`);
    } else {
      if (lv.boss) issues.push(`${id}: boss flag is only allowed on level 12`);
      if (count('K') > 0) issues.push(`${id}: K is only allowed on level 12`);
    }

    // fruit spots 2-5
    const fruit = count('*');
    if (fruit < 2 || fruit > 5) issues.push(`${id}: '*' count must be 2-5, got ${fruit}`);

    // spikes must sit directly above a solid '#'
    for (let r = 0; r < g.length; r++) {
      const row = g[r];
      if (typeof row !== 'string') continue;
      for (let c = 0; c < row.length; c++) {
        if (row[c] === '^' && (r + 1 >= g.length || g[r + 1][c] !== '#')) {
          issues.push(`${id}: spike at row ${r}, col ${c} must sit directly above a '#'`);
        }
      }
    }
  });
  return issues;
}
