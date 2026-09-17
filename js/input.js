// Keyboard + gamepad input with per-player virtual buttons and edge detection.
// Two binding modes: 'single' (all common keys drive P1) and 'coop' (split keys).
// Test harness injects raw key events via Input.inject().

const P_BUTTONS = ['left', 'right', 'jump', 'shoot'];
const MENU_KEYS = {
  up: ['ArrowUp', 'KeyW'],
  down: ['ArrowDown', 'KeyS'],
  left: ['ArrowLeft', 'KeyA'],
  right: ['ArrowRight', 'KeyD'],
  confirm: ['Enter', 'Space', 'KeyJ', 'KeyK'],
  back: ['Escape'],
  pause: ['Escape'],
};

const BINDINGS = {
  single: [{
    left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'],
    jump: ['Space', 'ArrowUp', 'KeyW'],
    shoot: ['ControlLeft', 'ControlRight', 'KeyJ', 'KeyK'],
  }, { left: [], right: [], jump: [], shoot: [] }],
  coop: [{
    left: ['KeyA'], right: ['KeyD'], jump: ['KeyW', 'Space'],
    shoot: ['KeyF', 'ControlLeft'],
  }, {
    left: ['ArrowLeft'], right: ['ArrowRight'], jump: ['ArrowUp'],
    shoot: ['Slash', 'ShiftRight'],
  }],
};

const PREVENT = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Slash']);

class InputSystem {
  constructor() {
    this.raw = Object.create(null);
    this.mode = 'single';
    this.cur = [this._blank(), this._blank()];
    this.prev = [this._blank(), this._blank()];
    this.menuCur = {}; this.menuPrev = {};
    this.padCount = 0;
    this.onAny = null;          // first-gesture hook (audio unlock)
  }

  _blank() { return { left: false, right: false, jump: false, shoot: false }; }

  attach(target = window) {
    target.addEventListener('keydown', e => {
      if (PREVENT.has(e.code) || e.code.startsWith('Control')) e.preventDefault();
      if (!e.repeat) this.inject(e.code, true);
    });
    target.addEventListener('keyup', e => this.inject(e.code, false));
    // keys never report their release while the window is unfocused —
    // drop everything on blur or the player auto-runs after refocusing
    target.addEventListener('blur', () => { this.raw = Object.create(null); });
  }

  inject(code, down) {
    this.raw[code] = down;
    if (down && this.onAny) { const f = this.onAny; this.onAny = null; f(); }
  }

  _padState(i) {
    let pads = [];
    try { pads = navigator.getGamepads ? navigator.getGamepads() : []; } catch { pads = []; }
    const p = pads && pads[i];
    if (!p || !p.connected) return null;
    const ax = p.axes[0] || 0;
    const b = j => !!(p.buttons[j] && p.buttons[j].pressed);
    return {
      left: ax < -0.4 || b(14), right: ax > 0.4 || b(15),
      up: (p.axes[1] || 0) < -0.5 || b(12), down: (p.axes[1] || 0) > 0.5 || b(13),
      jump: b(0) || b(3), shoot: b(2) || b(1), start: b(9), back: b(8),
    };
  }

  update() {
    const binds = BINDINGS[this.mode];
    for (let p = 0; p < 2; p++) {
      this.prev[p] = this.cur[p];
      const st = this._blank();
      for (const btn of P_BUTTONS) {
        for (const code of binds[p][btn]) if (this.raw[code]) { st[btn] = true; break; }
      }
      const pad = this._padState(p);
      if (pad) for (const btn of P_BUTTONS) st[btn] = st[btn] || pad[btn];
      this.cur[p] = st;
    }
    // menu / global edges
    this.menuPrev = this.menuCur;
    const m = {};
    for (const [name, codes] of Object.entries(MENU_KEYS)) {
      m[name] = codes.some(c => this.raw[c]);
    }
    const pad0 = this._padState(0), pad1 = this._padState(1);
    for (const pad of [pad0, pad1]) {
      if (!pad) continue;
      m.up = m.up || pad.up; m.down = m.down || pad.down;
      m.left = m.left || pad.left; m.right = m.right || pad.right;
      m.confirm = m.confirm || pad.jump || pad.start;
      m.back = m.back || pad.back;
      m.pause = m.pause || pad.start;
    }
    m.any = m.up || m.down || m.left || m.right || m.confirm ||
      this.cur[0].shoot || this.cur[1].shoot || this.cur[0].jump || this.cur[1].jump;
    this.menuCur = m;
  }

  held(p, btn) { return this.cur[p][btn]; }
  pressed(p, btn) { return this.cur[p][btn] && !this.prev[p][btn]; }
  menuHeld(name) { return !!this.menuCur[name]; }
  menuPressed(name) { return !!this.menuCur[name] && !this.menuPrev[name]; }
}

export const Input = new InputSystem();
