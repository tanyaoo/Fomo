'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseNoteLink, findNoteLink } = require('../desktop/protocol-links.cjs');

test('note protocol links accept current and legacy schemes', () => {
  assert.deepEqual(parseNoteLink('fomo://note/abc-123'), { matched: true, id: 'abc-123', scheme: 'fomo' });
  assert.equal(parseNoteLink('writeboom://note/abc_123').id, '');
  assert.equal(parseNoteLink('memo-flow://note/abc123/').id, 'abc123');
  assert.equal(parseNoteLink('"fomo://note/a1"').id, 'a1');
});

test('protocol parsing rejects unrelated and malformed commands', () => {
  assert.equal(parseNoteLink('https://example.com/note/a1').matched, false);
  assert.deepEqual(parseNoteLink('fomo://app/index.html'), { matched: true, id: '', scheme: 'fomo' });
  assert.deepEqual(parseNoteLink('fomo://note/not%20valid'), { matched: true, id: '', scheme: 'fomo' });
  assert.deepEqual(parseNoteLink('fomo://note/a1?edit=1'), { matched: true, id: '', scheme: 'fomo' });
});

test('the final protocol argument wins over unrelated startup arguments', () => {
  assert.deepEqual(findNoteLink(['Fomo.exe', '--self-test', 'fomo://note/first', 'memo-flow://note/second']), { matched: true, id: 'second', scheme: 'memo-flow' });
  assert.deepEqual(findNoteLink(['Fomo.exe', '--self-test']), { matched: false, id: '' });
});
