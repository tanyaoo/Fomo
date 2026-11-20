'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { waitForMainWindow } = require('../scripts/wait-for-main-window.cjs');
function windowAt(url = '') {
  const webContents = new EventEmitter();
  webContents.getURL = () => url;
  return { webContents, isDestroyed: () => false, navigate(value) { url = value; webContents.emit('did-navigate'); } };
}
test('accepts an already navigated main window', async () => {
  const app = new EventEmitter(), win = windowAt('memo-flow://app/index.html');
  assert.equal(await waitForMainWindow(app, { getAllWindows: () => [win] }, 200), win);
  assert.equal(app.listenerCount('browser-window-created'), 0);
});
test('waits for navigation of a new window and removes listeners', async () => {
  const app = new EventEmitter(), win = windowAt();
  const waiting = waitForMainWindow(app, { getAllWindows: () => [] }, 200);
  app.emit('browser-window-created', {}, win);
  win.navigate('memo-flow://app/index.html');
  assert.equal(await waiting, win);
  assert.equal(win.webContents.listenerCount('did-navigate'), 0);
});
test('times out with no main window and removes listeners', async () => {
  const app = new EventEmitter();
  await assert.rejects(waitForMainWindow(app, { getAllWindows: () => [] }, 10), /did not navigate/);
  assert.equal(app.listenerCount('browser-window-created'), 0);
});
