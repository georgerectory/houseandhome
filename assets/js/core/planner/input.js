// planner/input.js - how a person drives the walkthrough.
//
// Two schemes, and the page does not choose between them: a phone gets
// the touch one because it has touch, a laptop gets the keyboard one
// because it has a keyboard, and a laptop with a touchscreen gets both.
//
// TOUCH. The left two fifths of the view is a movement stick that
// appears under your thumb wherever you put it down, and anywhere else
// is look. A fixed stick in a corner is a target you have to find; one
// that arrives where your thumb already is never has to be aimed at.
//
// KEYBOARD. Click to take the pointer lock, then WASD or the arrows,
// Shift to hurry, Escape to let go. The lock is not taken on a coarse
// pointer, where there is no cursor to hide and the request just fails.

const MOVE_KEYS = ['w', 'a', 's', 'd', 'shift', 'arrowup', 'arrowdown', 'arrowleft', 'arrowright'];
const STICK_RADIUS = 56;

export class WalkInput {
  /** @param {HTMLCanvasElement} canvas @param {object} handlers */
  constructor(canvas, { onLook, onStick, isWalking }) {
    this.canvas = canvas;
    this.onLook = onLook;
    this.onStick = onStick ?? (() => {});
    this.isWalking = isWalking;
    this.keys = new Set();
    this.move = { forward: 0, strafe: 0 };
    this._movePointer = null;
    this._lookPointer = null;
    this._bound = [];
    this._bind();
  }

  /** The stick and the keys added together, so a keyboard and a thumb
   *  can drive the same walker without one cancelling the other. */
  axes() {
    let forward = this.move.forward;
    let strafe = this.move.strafe;
    if (this.keys.has('w') || this.keys.has('arrowup')) forward += 1;
    if (this.keys.has('s') || this.keys.has('arrowdown')) forward -= 1;
    if (this.keys.has('a') || this.keys.has('arrowleft')) strafe -= 1;
    if (this.keys.has('d') || this.keys.has('arrowright')) strafe += 1;
    return { forward, strafe, hurrying: this.keys.has('shift') };
  }

  coarse() {
    return window.matchMedia?.('(pointer: coarse)').matches ?? false;
  }

  reset() {
    this.keys.clear();
    this._movePointer = null;
    this._lookPointer = null;
    this.move.forward = 0;
    this.move.strafe = 0;
    this.onStick({ active: false });
  }

  release() {
    if (document.pointerLockElement === this.canvas) document.exitPointerLock();
    this.reset();
  }

  _on(target, type, fn, opts) {
    target.addEventListener(type, fn, opts);
    this._bound.push(() => target.removeEventListener(type, fn, opts));
  }

  _bind() {
    const key = (e, down) => {
      const k = e.key.toLowerCase();
      if (!MOVE_KEYS.includes(k)) return;
      if (!this.isWalking()) return;
      // Arrow keys scroll the page, and a walker who scrolls the page
      // while trying to walk has lost the view they were looking at.
      e.preventDefault();
      if (down) this.keys.add(k); else this.keys.delete(k);
    };
    this._on(window, 'keydown', (e) => key(e, true));
    this._on(window, 'keyup', (e) => key(e, false));
    this._on(window, 'blur', () => this.reset());

    this._on(this.canvas, 'click', () => {
      if (!this.isWalking() || this.coarse()) return;
      if (document.pointerLockElement !== this.canvas) this.canvas.requestPointerLock?.();
    });
    this._on(document, 'mousemove', (e) => {
      if (document.pointerLockElement !== this.canvas) return;
      this.onLook(e.movementX, e.movementY, 0.0022);
    });

    this._on(this.canvas, 'pointerdown', (e) => {
      if (!this.isWalking() || e.pointerType === 'mouse') return;
      const r = this.canvas.getBoundingClientRect();
      const localX = e.clientX - r.left;
      if (localX < r.width * 0.4 && this._movePointer === null) {
        this._movePointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
        this.onStick({ active: true, x: localX, y: e.clientY - r.top, dx: 0, dy: 0 });
      } else if (this._lookPointer === null) {
        this._lookPointer = { id: e.pointerId, x: e.clientX, y: e.clientY };
      }
      this.canvas.setPointerCapture?.(e.pointerId);
    });
    this._on(this.canvas, 'pointermove', (e) => {
      if (!this.isWalking()) return;
      const m = this._movePointer;
      if (m && m.id === e.pointerId) {
        const dx = e.clientX - m.x;
        const dy = e.clientY - m.y;
        const len = Math.hypot(dx, dy) || 1;
        const pull = Math.min(len, STICK_RADIUS);
        this.move.strafe = (dx / len) * (pull / STICK_RADIUS);
        this.move.forward = (-dy / len) * (pull / STICK_RADIUS);
        this.onStick({ active: true, dx: (dx / len) * pull, dy: (dy / len) * pull });
        return;
      }
      const l = this._lookPointer;
      if (l && l.id === e.pointerId) {
        this.onLook(e.clientX - l.x, e.clientY - l.y, 0.005);
        l.x = e.clientX;
        l.y = e.clientY;
      }
    });
    const lift = (e) => {
      if (this._movePointer?.id === e.pointerId) {
        this._movePointer = null;
        this.move.forward = 0;
        this.move.strafe = 0;
        this.onStick({ active: false });
      }
      if (this._lookPointer?.id === e.pointerId) this._lookPointer = null;
    };
    this._on(this.canvas, 'pointerup', lift);
    this._on(this.canvas, 'pointercancel', lift);
  }

  dispose() {
    this._bound.forEach((off) => off());
    this._bound = [];
  }
}
