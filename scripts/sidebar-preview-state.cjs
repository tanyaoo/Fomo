'use strict';

const Core = require('../dist/core.js');
const equal = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// The preview can be edited, but never commits its changes to the desktop library.
class PreviewState {
  constructor(initial) {
    this.desktop = Core.validate(initial);
    this.state = Core.clone(this.desktop);
    this.desktopChanged = false;
  }
  refresh(latest) {
    latest = Core.validate(latest);
    if (equal(this.state, this.desktop)) {
      this.desktop = latest;
      this.state = Core.clone(latest);
      this.desktopChanged = false;
    } else {
      this.desktopChanged = !equal(latest, this.desktop);
    }
    return this.state;
  }
  save(base, desired) {
    base = Core.validate(base);
    desired = Core.validate(desired);
    if (!equal(base, this.state)) throw Error('其他窗口或桌面端已修改预览数据，请刷新后重试');
    this.state = desired;
    return this.state;
  }
}

module.exports = { PreviewState };
