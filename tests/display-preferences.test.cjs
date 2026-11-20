'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { transformSync } = require('esbuild');
const Core = require('../dist/core.js');

const source = fs.readFileSync(path.join(__dirname, '../src/display-preferences.js'), 'utf8');
const moduleCode = transformSync(source, { loader: 'js', format: 'cjs', target: 'node24' }).code;

function loadModule() {
  const module = { exports: {} };
  new Function('require', 'module', 'exports', moduleCode)(require, module, module.exports);
  return module.exports;
}

function fakeBody() {
  const classes = new Set(), properties = new Map();
  return {
    dataset: {},
    classList: {
      toggle(name, force) { if (force) classes.add(name); else classes.delete(name); },
      contains(name) { return classes.has(name); }
    },
    style: {
      setProperty(name, value) { properties.set(name, value); },
      getPropertyValue(name) { return properties.get(name) || ''; }
    }
  };
}

function apply(value, userAgent) {
  const previous = { window: global.window, document: global.document, navigator: global.navigator };
  const body = fakeBody();
  global.window = { MemoCore: Core };
  global.document = { body, querySelectorAll() { return []; } };
  Object.defineProperty(global, 'navigator', { configurable: true, value: { userAgent } });
  try {
    loadModule().applyDisplayPreferences(value);
  } finally {
    Object.defineProperty(global, 'navigator', { configurable: true, value: previous.navigator });
    global.window = previous.window;
    global.document = previous.document;
  }
  return body;
}

const preferences = { font: 'system', fontSize: 16, lineHeight: 2, showHeatmap: false, showSources: true };

test('system font enables sidebar and Windows statistic typography', () => {
  const body = apply(preferences, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
  assert.equal(body.dataset.displayFont, 'system');
  assert.equal(body.classList.contains('system-font-sidebar'), true);
  assert.equal(body.classList.contains('system-font-win'), true);
  assert.equal(body.style.getPropertyValue('--memo-font-size'), '16px');
  assert.equal(body.style.getPropertyValue('--memo-line-height'), '2');
  assert.equal(body.classList.contains('heatmap-hidden'), true);
  assert.equal(body.classList.contains('note-sources-visible'), true);
});

test('system font keeps the non-Windows statistic font path', () => {
  const body = apply(preferences, 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5)');
  assert.equal(body.classList.contains('system-font-sidebar'), true);
  assert.equal(body.classList.contains('system-font-win'), false);
});

test('default font clears system font classes across window types', () => {
  const body = apply({ font: 'default', fontSize: 14, lineHeight: 1.8, showHeatmap: true, showSources: false }, 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)');
  assert.equal(body.dataset.displayFont, 'default');
  assert.equal(body.style.getPropertyValue('--memo-font-family'), 'var(--fl-font-memo)');
  assert.equal(body.style.getPropertyValue('--memo-line-height'), '1.62');
  assert.equal(body.classList.contains('system-font-sidebar'), false);
  assert.equal(body.classList.contains('system-font-win'), false);
  assert.equal(body.classList.contains('heatmap-hidden'), false);
  assert.equal(body.classList.contains('note-sources-visible'), false);
});

test('spellcheck preference updates every structured editor', () => {
  const previous = { window: global.window, document: global.document, navigator: global.navigator };
  const calls = [], body = fakeBody();
  const editor = { setSpellcheck(value) { calls.push(value); } };
  global.window = { MemoCore: Core };
  global.document = {
    body,
    querySelectorAll(selector) { return selector === '[data-structured-editor]' ? [{ memoEditor: editor }] : []; }
  };
  Object.defineProperty(global, 'navigator', { configurable: true, value: { userAgent: 'Windows' } });
  try {
    loadModule().applyDisplayPreferences({ spellcheck: false });
  } finally {
    Object.defineProperty(global, 'navigator', { configurable: true, value: previous.navigator });
    global.window = previous.window;
    global.document = previous.document;
  }
  assert.deepEqual(calls, [false]);
});

test('list indentation follows the reference font-size ladder', () => {
  assert.equal(apply({ fontSize: 14 }).style.getPropertyValue('--memo-ul-padding-left'), '22px');
  assert.equal(apply({ fontSize: 13 }).style.getPropertyValue('--memo-ul-padding-left'), '20px');
  assert.equal(apply({ fontSize: 16 }).style.getPropertyValue('--memo-ul-padding-left'), '26px');
  assert.equal(apply({ fontSize: 20 }).style.getPropertyValue('--memo-ul-padding-left'), '32px');
  assert.equal(apply({ fontSize: 32 }).style.getPropertyValue('--memo-ul-padding-left'), '44px');
  assert.equal(apply({ fontSize: 18 }).style.getPropertyValue('--memo-ul-padding-left'), '22px');
});
