// Keyboard → abstract actions. Game code only ever asks about actions,
// so gamepad / touch sources can be added later without touching entities.
const KEYMAP = {
  ArrowLeft: 'left', KeyA: 'left',
  ArrowRight: 'right', KeyD: 'right',
  ArrowUp: 'up', KeyW: 'up',
  ArrowDown: 'down', KeyS: 'down',
  KeyJ: 'attack', KeyK: 'jump', Space: 'jump', KeyL: 'magic',
  Enter: 'start', Escape: 'pause', KeyP: 'pause',
};

// Fallback by e.key for environments that don't report e.code.
const KEY_FALLBACK = {
  arrowleft: 'left', a: 'left', arrowright: 'right', d: 'right',
  arrowup: 'up', w: 'up', arrowdown: 'down', s: 'down',
  j: 'attack', k: 'jump', ' ': 'jump', l: 'magic',
  enter: 'start', escape: 'pause', p: 'pause',
};
const actionOf = (e) => KEYMAP[e.code] || KEY_FALLBACK[(e.key || '').toLowerCase()];

const DOUBLE_TAP = 0.28; // seconds

export class Input {
  constructor() {
    this.held = new Set();
    this.pressedSet = new Set();
    this.lastTap = { left: -1, right: -1 };
    this.runDir = 0;

    window.addEventListener('keydown', (e) => {
      const action = actionOf(e);
      if (!action) return;
      e.preventDefault();
      if (e.repeat) return;
      if (!this.held.has(action)) this.pressedSet.add(action);
      this.held.add(action);

      if (action === 'left' || action === 'right') {
        const now = performance.now() / 1000;
        const dir = action === 'left' ? -1 : 1;
        this.runDir = now - this.lastTap[action] < DOUBLE_TAP ? dir : 0;
        this.lastTap[action] = now;
      }
    });

    window.addEventListener('keyup', (e) => {
      const action = actionOf(e);
      if (!action) return;
      this.held.delete(action);
      if ((action === 'left' && this.runDir < 0) || (action === 'right' && this.runDir > 0)) this.runDir = 0;
    });

    window.addEventListener('blur', () => {
      this.held.clear();
      this.runDir = 0;
    });
  }

  down(action) { return this.held.has(action); }
  pressed(action) { return this.pressedSet.has(action); }

  axisX() { return (this.down('right') ? 1 : 0) - (this.down('left') ? 1 : 0); }
  // Up = into the screen (negative z).
  axisZ() { return (this.down('down') ? 1 : 0) - (this.down('up') ? 1 : 0); }

  // Called after each simulation step that consumed input.
  endStep() { this.pressedSet.clear(); }
}
