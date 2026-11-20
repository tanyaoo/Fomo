'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {orderedTags, compareTagNames: compareByName} = require('../dist/core.js');

test('sorts unsaved tag groups by their displayed first character', () => {
  const tags = ['中文', 'apple', 'Alpha', '01数字', '🌱信号'];
  assert.deepEqual(orderedTags(tags), ['🌱信号', '01数字', 'Alpha', 'apple', '中文']);
});

test('keeps manual order between known tags and puts new tags before them', () => {
  const tags = ['中文', 'apple', 'Alpha', '01数字'];
  assert.deepEqual(orderedTags(tags, ['Alpha', '中文']), ['01数字', 'apple', 'Alpha', '中文']);
  assert.deepEqual(orderedTags(tags, ['中文', 'Alpha']), ['01数字', 'apple', '中文', 'Alpha']);
});

test('inserts children directly after their parent and sorts by the visible segment', () => {
  const tags = ['阅读/中文', '阅读/apple', '阅读/01数字', '阅读/摘录', '工作/项目', '工作'];
  assert.deepEqual(orderedTags(tags), ['工作', '工作/项目', '阅读', '阅读/01数字', '阅读/apple', '阅读/摘录', '阅读/中文']);
  assert.equal(compareByName('阅读/阿', '阅读/中') < 0, true);
});

test('does not duplicate tags and leaves manual comparisons stable', () => {
  const tags = ['A', 'A', 'B', 'B/child'];
  assert.deepEqual(orderedTags(tags, ['B', 'A']), ['B', 'B/child', 'A']);
  assert.equal(compareByName('01数字', 'Alpha') < 0, true);
  assert.equal(compareByName('apple', '中文') < 0, true);
});

test('reconstructs missing ancestors without duplicating provided parents', () => {
  assert.deepEqual(orderedTags(['项目/子/项', '项目']), ['项目', '项目/子', '项目/子/项']);
});
