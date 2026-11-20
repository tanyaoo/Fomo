'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');

const electron = {
  ipcMain: { handle() {} },
  BrowserWindow: class {},
  screen: { getDisplayMatching() { return { workArea: { x: 0, y: 0, width: 1280, height: 900 } }; } },
  clipboard: {},
  shell: {},
  dialog: {}
};

function loadNoteWindows() {
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return electron;
    return original.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('../desktop/note-windows.cjs')];
    return require('../desktop/note-windows.cjs').NoteWindows;
  } finally {
    Module._load = original;
  }
}

test('published note windows keep the compose bounds inside the display work area', () => {
  const NoteWindows = loadNoteWindows();
  const windows = new NoteWindows({ root: path.resolve(__dirname, '..'), getStore: () => null });
  assert.deepEqual(windows.safeBounds({ x: -100, y: 850, width: 2000, height: 100 }), {
    width: 1280, height: 420, x: 0, y: 480
  });
  assert.deepEqual(windows.safeBounds({ x: 1000, y: 700, width: 500, height: 600 }), {
    width: 500, height: 600, x: 780, y: 300
  });
  assert.equal(windows.safeBounds(null), null);
  assert.equal(windows.safeBounds({ x: NaN, y: 40, width: 500, height: 600 }), null);
});
