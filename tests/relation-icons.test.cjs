'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');

test('outgoing and incoming memo references use opposite arrow directions', () => {
  const context = { window: {} };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../dist/icons.js'), 'utf8'), context);
  assert.match(context.window.memoIcons.linkedMemo, /bi-arrow-up-left-circle-fill/);
  assert.match(context.window.memoIcons.backlinkedMemo, /bi-arrow-down-right-circle-fill/);
});
