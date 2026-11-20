'use strict';

// Wait for Electron's actual window/navigation events instead of assuming a
// particular startup speed on a hosted Windows runner.
function waitForMainWindow(app, BrowserWindow, timeoutMs = 20000) {
  return new Promise((resolve, reject) => {
    let settled = false;
    const attached = new Map();
    const cleanup = () => {
      clearTimeout(timer);
      app.removeListener('browser-window-created', onCreated);
      for (const [wc, handler] of attached) {
        wc.removeListener('did-finish-load', handler);
        wc.removeListener('did-navigate', handler);
      }
    };
    const matches = win => !win.isDestroyed() && win.webContents.getURL().includes('app/index.html');
    const inspect = win => {
      if (settled || !matches(win)) return;
      settled = true; cleanup(); resolve(win);
    };
    const attach = win => {
      if (!win || win.isDestroyed()) return;
      const wc = win.webContents;
      if (!attached.has(wc)) {
        const handler = () => inspect(win);
        attached.set(wc, handler);
        wc.on('did-finish-load', handler);
        wc.on('did-navigate', handler);
      }
      inspect(win);
    };
    const onCreated = (_event, win) => attach(win);
    const timer = setTimeout(() => {
      if (settled) return;
      settled = true; cleanup(); reject(Error('Main window did not navigate to app/index.html'));
    }, timeoutMs);
    app.on('browser-window-created', onCreated);
    for (const win of BrowserWindow.getAllWindows()) attach(win);
  });
}
module.exports = { waitForMainWindow };
