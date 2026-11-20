'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { recoveryPlan } = require('../scripts/release-recovery-plan.cjs');
const a = 'a'.repeat(64), b = 'b'.repeat(64);
const expected = { 'Fomo-1.2.3-x64.exe': a, 'latest.yml': b };

test('draft recovery uploads only missing assets', () => {
  assert.deepEqual(recoveryPlan({ expected, existing: { 'latest.yml': b }, draft: true }), {
    missing: ['Fomo-1.2.3-x64.exe'], complete: false, mayPublish: false
  });
});
test('complete matching draft may be published', () => {
  assert.equal(recoveryPlan({ expected, existing: { ...expected }, draft: true }).mayPublish, true);
});
test('published assets cannot be mutated', () => {
  assert.throws(() => recoveryPlan({ expected, existing: {}, draft: false }), /do not mutate/);
  assert.equal(recoveryPlan({ expected, existing: { ...expected }, draft: false }).mayPublish, false);
});
test('different or unexpected assets fail closed', () => {
  assert.throws(() => recoveryPlan({ expected, existing: { 'latest.yml': a }, draft: true }), /differs/);
  assert.throws(() => recoveryPlan({ expected, existing: { 'extra.zip': a }, draft: true }), /Unexpected/);
});
test('invalid names, hashes and release state fail closed', () => {
  assert.throws(() => recoveryPlan({ expected: { '../escape': a }, existing: {}, draft: true }), /Invalid/);
  assert.throws(() => recoveryPlan({ expected: { 'file.exe': 'short' }, existing: {}, draft: true }), /Invalid/);
  assert.throws(() => recoveryPlan({ expected, existing: {}, draft: null }), /draft state/);
});
