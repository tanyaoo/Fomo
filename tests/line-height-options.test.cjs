'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../dist/core.js');

test('compact line height follows reference 1.6 and the default stays 1.8', () => {
  assert.equal(Core.displayPreferences().lineHeight, 1.8);
  assert.equal(Core.displayPreferences({ lineHeight: 1.6 }).lineHeight, 1.6);
  assert.equal(Core.displayPreferences({ lineHeight: 1.8 }).lineHeight, 1.8);
  assert.equal(Core.displayPreferences({ lineHeight: 2 }).lineHeight, 2);
});

test('an older 1.5 compact value migrates to the official 1.6', () => {
  assert.equal(Core.displayPreferences({ lineHeight: 1.5 }).lineHeight, 1.6);
  assert.equal(Core.displayPreferences({ lineHeight: '1.5' }).lineHeight, 1.6);
});

test('legacy looser spacing and invalid values stay usable', () => {
  assert.equal(Core.displayPreferences({ lineHeight: 2.2 }).lineHeight, 2.2);
  assert.equal(Core.displayPreferences({ lineHeight: 3 }).lineHeight, 1.8);
  assert.equal(Core.displayPreferences({ lineHeight: 'wide' }).lineHeight, 1.8);
});
