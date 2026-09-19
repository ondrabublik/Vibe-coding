// Keyboard, mouse (free look) and gamepad.
const BLOCK = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab']);

export class Input {
  constructor(el) {
    this.keys = new Set();
    this.pressed = new Set();
    this.look = { dx: 0, dy: 0, dragging: false };
    this.pad = null;
    this.padPrev = [];
    window.addEventListener('keydown', (e) => {
      if (BLOCK.has(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
    el.addEventListener('contextmenu', (e) => e.preventDefault());
    el.addEventListener('mousedown', (e) => {
      this.look.dragging = true;
      e.preventDefault();
    });
    window.addEventListener('mouseup', () => (this.look.dragging = false));
    window.addEventListener('mousemove', (e) => {
      if (!this.look.dragging) return;
      this.look.dx += e.movementX;
      this.look.dy += e.movementY;
    });
  }

  down(...codes) {
    return codes.some((c) => this.keys.has(c));
  }

  hit(...codes) {
    return codes.some((c) => this.pressed.has(c));
  }

  /** Reads the first connected gamepad; returns null when there is none. */
  pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    const p = [...pads].find((x) => x && x.connected);
    if (!p) return (this.pad = null);
    const dz = (v) => (Math.abs(v) < 0.12 ? 0 : (v - Math.sign(v) * 0.12) / 0.88);
    const b = (i) => !!(p.buttons[i] && p.buttons[i].pressed);
    const bv = (i) => (p.buttons[i] ? p.buttons[i].value : 0);
    const edge = (i) => b(i) && !this.padPrev[i];
    this.pad = {
      roll: dz(p.axes[0] || 0),
      pitch: dz(p.axes[1] || 0), // stick back = positive = nose up
      yaw: dz(p.axes[2] || 0),
      throttleUp: bv(7),
      throttleDown: bv(6),
      gun: b(0),
      missile: edge(1),
      flares: edge(2),
      view: edge(3),
      target: edge(4),
      gear: edge(5),
      pause: edge(9),
    };
    this.padPrev = p.buttons.map((x) => x.pressed);
    return this.pad;
  }

  endFrame() {
    this.pressed.clear();
    this.look.dx = this.look.dy = 0;
  }
}
