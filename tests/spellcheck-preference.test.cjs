'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../dist/core.js');

test('spell check is disabled by default and preserves an explicit enable', () => {
  assert.equal(Core.displayPreferences().spellcheck, false);
  assert.equal(Core.displayPreferences({ spellcheck: true }).spellcheck, true);
  assert.equal(Core.displayPreferences({ spellcheck: 'false' }).spellcheck, false);
});
