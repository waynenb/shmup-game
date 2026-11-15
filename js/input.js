// 键盘与手柄输入，以及共享常量和数值工具。
'use strict';

window.NV = {
  W: 480,
  H: 800,
  clamp: (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value)),
  rand: (minimum, maximum) => minimum + Math.random() * (maximum - minimum)
};
NV.input = {
  held: new Set(),
  pressed: new Set(),
  padPrevious: [],
  /* 注册键盘事件，并在窗口失焦时暂停。 */
  init() {
    window.addEventListener('pointerdown', () => NV.sound?.unlock());
    window.addEventListener('keydown', event => {
      NV.sound?.unlock();
      if (event.code === 'KeyM' && !event.repeat && !this.held.has('KeyM')) NV.sound?.toggle();
      if (['Space', 'Enter', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Escape', 'Slash'].includes(event.code)) {
        event.preventDefault();
      }
      if (!this.held.has(event.code)) {
        this.pressed.add(event.code);
      }
      this.held.add(event.code);
    });
    window.addEventListener('keyup', event => this.held.delete(event.code));
    window.addEventListener('blur', () => {
      this.held.clear();
      if (NV.game?.state === 'playing') {
        NV.game.state = 'paused';
      }
    });
  },
  tap(code) {
    return this.pressed.has(code);
  },
  /* 读取手柄状态，记录按钮按下的边沿。 */
  poll() {
    let gamepads = [];
    try {
      gamepads = Array.from(navigator.getGamepads?.() || []).filter(Boolean);
    } catch (event) {}
    this.pads = gamepads;
    if (gamepads.some(pad => pad.buttons.some(button => button.pressed) || pad.axes.some(axis => Math.abs(axis) > .18))) NV.sound?.unlock();
    for (let playerIndex = 0; playerIndex < gamepads.length; playerIndex++) {
      let gamepad = gamepads[playerIndex];
      let previousButtons = this.padPrevious[playerIndex] || [];
      [1, 9].forEach(buttonIndex => {
        if (gamepad.buttons[buttonIndex]?.pressed && !previousButtons[buttonIndex]) {
          this.pressed.add('pad' + playerIndex + 'b' + buttonIndex);
        }
      });
      this.padPrevious[playerIndex] = gamepad.buttons.map(button => button.pressed);
    }
  },
  /* 合并指定玩家的键盘、摇杆与十字键输入。 */
  controls(playerIndex) {
    let held = this.held;
    let gamepad = this.pads?.[playerIndex];
    let buttonPressed = buttonIndex => gamepad?.buttons[buttonIndex]?.pressed;
    let x = (held.has(playerIndex ? 'ArrowRight' : 'KeyD') ? 1 : 0) - (held.has(playerIndex ? 'ArrowLeft' : 'KeyA') ? 1 : 0);
    let y = (held.has(playerIndex ? 'ArrowDown' : 'KeyS') ? 1 : 0) - (held.has(playerIndex ? 'ArrowUp' : 'KeyW') ? 1 : 0);
    if (gamepad) {
      x += Math.abs(gamepad.axes[0]) > .18 ? gamepad.axes[0] : 0;
      y += Math.abs(gamepad.axes[1]) > .18 ? gamepad.axes[1] : 0;
      x += (buttonPressed(15) ? 1 : 0) - (buttonPressed(14) ? 1 : 0);
      y += (buttonPressed(13) ? 1 : 0) - (buttonPressed(12) ? 1 : 0);
    }
    let magnitude = Math.hypot(x, y);
    if (magnitude > 1) {
      x /= magnitude;
      y /= magnitude;
    }
    return {
      x,
      y,
      fire: held.has(playerIndex ? 'Enter' : 'Space') || buttonPressed(0),
      bomb: playerIndex ? this.tap('ShiftRight') || this.tap('Slash') || this.tap('pad1b1') : this.tap('KeyQ') || this.tap('ShiftLeft') || this.tap('pad0b1')
    };
  },
  end() {
    this.pressed.clear();
  }
};
