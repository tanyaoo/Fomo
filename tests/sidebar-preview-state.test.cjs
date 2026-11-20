'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Core = require('../dist/core.js');
const { PreviewState } = require('../scripts/sidebar-preview-state.cjs');

const memo = (id, content) => ({ id, content, html: '', created: '2026-10-01T00:00:00.000Z', updated: '2026-10-01T00:00:00.000Z', starred: false, deleted: false, images: [] });
const initial = () => Core.validate({ memos: [memo('a', '原始')] });

test('desktop updates reach an untouched preview', () => {
  const sandbox = new PreviewState(initial());
  const latest = initial(); latest.memos.push(memo('b', '桌面新增'));
  assert.deepEqual(sandbox.refresh(latest), latest);
  assert.equal(sandbox.desktopChanged, false);
});

test('desktop updates do not overwrite sandbox edits and stale saves are rejected', () => {
  const base = initial(), sandbox = new PreviewState(base);
  const edited = Core.clone(base); edited.memos[0].content = '预览修改';
  sandbox.save(base, edited);
  const latest = initial(); latest.memos.push(memo('b', '桌面新增'));
  assert.deepEqual(sandbox.refresh(latest), edited);
  assert.equal(sandbox.desktopChanged, true);
  assert.throws(() => sandbox.save(base, base), /其他窗口/);
  sandbox.save(edited, base);
  assert.deepEqual(sandbox.refresh(latest), latest);
  assert.equal(sandbox.desktopChanged, false);
});
