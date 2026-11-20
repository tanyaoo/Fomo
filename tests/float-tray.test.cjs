'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const FloatState = require('../desktop/float-state.cjs');

test('float window keeps at most seven notes like reference', () => {
  let ids = [];
  for (let index = 0; index < FloatState.FLOAT_LIMIT; index += 1) ids = FloatState.addId(ids, 'note-' + index);
  assert.equal(ids.length, FloatState.FLOAT_LIMIT);
  assert.throws(() => FloatState.addId(ids, 'note-over-limit'), /浮窗内笔记已满/);
  assert.equal(ids.length, FloatState.FLOAT_LIMIT, 'a rejected add leaves the pinned list untouched');
});

test('adding a note already in the float window is idempotent', () => {
  const ids = FloatState.addId(['a', 'b'], 'a');
  assert.deepEqual(ids, ['a', 'b']);
  assert.notEqual(ids, FloatState.addId(['a', 'b'], 'a'), 'returns a copy so callers cannot mutate shared state');
});

test('clearing keeps the previous notes so the action can be undone', () => {
  const result = FloatState.clearWithUndo(['a', 'b', 'c']);
  assert.deepEqual(result.ids, []);
  assert.equal(result.count, 3);
  assert.deepEqual(FloatState.restoreUndo(result.undo), ['a', 'b', 'c']);
});

test('restoring without a saved list stays empty and ignores junk entries', () => {
  assert.deepEqual(FloatState.restoreUndo(null), []);
  assert.deepEqual(FloatState.restoreUndo('a'), []);
  assert.deepEqual(FloatState.restoreUndo(['a', 3, '', null, 'b']), ['a', 'b']);
});
