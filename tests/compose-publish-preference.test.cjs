'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const Core = require('../dist/core.js');

const electron = {
  ipcMain: { handle() {} },
  screen: {
    getPrimaryDisplay() { return { workArea: { x: 0, y: 0, width: 1280, height: 900 } }; },
    getDisplayMatching() { return this.getPrimaryDisplay(); }
  },
  BrowserWindow: class {}
};

function loadComposeWindow() {
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return electron;
    return original.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('../desktop/compose-window.cjs')];
    return require('../desktop/compose-window.cjs').ComposeWindow;
  } finally {
    Module._load = original;
  }
}

function fixture(getNewNoteCloseAfterPublish) {
  let state = Core.blank();
  const store = {
    async readState() { return structuredClone(state); },
    async save(_base, desired) { state = structuredClone(desired); return state; }
  };
  const ComposeWindow = loadComposeWindow();
  const shown = [];
  const compose = new ComposeWindow({
    root: path.resolve(__dirname, '..'),
    getStore: () => store,
    boundsFile: '',
    getNewNoteCloseAfterPublish,
    onShowPublished: async (id, bounds) => { shown.push({ id, bounds }); return true; }
  });
  const window = {
    closed: false,
    getBounds() { return { x: 120, y: 80, width: 500, height: 620 }; },
    isDestroyed() { return false; },
    close() { this.closed = true; if (compose.window === this) compose.window = null; }
  };
  compose.window = window;
  return { compose, store, shown, window, state: () => state };
}

test('publishing shows the saved note in the same bounds by default', async () => {
  const f = fixture(undefined);
  const id = await f.compose.save({ content: '发布后展示', html: '<p>发布后展示</p>', images: [] });
  assert.match(id, /^[a-zA-Z0-9-]+$/);
  assert.deepEqual(f.shown, [{ id, bounds: { x: 120, y: 80, width: 500, height: 620 } }]);
  assert.equal(f.window.closed, true);
  assert.equal(f.compose.window, null);
  assert.equal(f.state().memos[0].content, '发布后展示');
});

test('publishing closes the compose window when the preference is enabled', async () => {
  const f = fixture(() => true);
  await f.compose.save({ content: '发布后关闭', html: '<p>发布后关闭</p>', images: [] });
  assert.deepEqual(f.shown, []);
  assert.equal(f.window.closed, true);
  assert.equal(f.state().memos[0].content, '发布后关闭');
});

test('a failed show keeps the compose window open and preserves the saved memo', async () => {
  const f = fixture(() => false);
  f.compose.onShowPublished = async () => false;
  await f.compose.save({ content: '展示失败', html: '<p>展示失败</p>', images: [] });
  assert.equal(f.window.closed, false);
  assert.equal(f.state().memos[0].content, '展示失败');
});
