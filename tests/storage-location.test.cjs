'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const { StorageLocation } = require('../desktop/storage-location.cjs');
async function fixture(t, io) {
  const parent = path.resolve(__dirname, '../work/location-tests');
  await fs.mkdir(parent, { recursive: true });
  const root = await fs.mkdtemp(path.join(parent, 'case-'));
  if (!root.startsWith(parent + path.sep)) throw Error('测试路径异常');
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const profile = path.join(root, 'profile'), target = path.join(root, 'notes');
  await fs.mkdir(profile); await fs.mkdir(target);
  const location = new StorageLocation(profile, { io });
  const store = await location.open(), base = await store.init();
  const memo = { id: 'one', content: '迁移笔记 #测试', html: '<b>迁移笔记</b> #测试', images: ['data:image/png;base64,YQ=='], created: '2026-10-11T01:00:00.000Z', updated: '2026-10-11T01:00:00.000Z', deleted: false, starred: true };
  const state = await store.save(base, { ...base, memos: [memo] });
  await store.draft({ current: { content: '未提交的草稿', images: [] } });
  await fs.writeFile(path.join(store.directory, 'Memos/independent.md'), '用户自己的文件');
  return { root, profile, target, location, store, state };
}
test('migration waits for queued writes, preserves every file and old directory, and persists across restart', async t => {
  const { profile, target, location, store, state } = await fixture(t);
  const pending = store.draft({ current: { content: '最后输入的草稿', images: [] } });
  const result = await location.moveTo(target); await pending;
  assert.equal(result.changed, true);
  assert.deepEqual(await location.store.readState(), state);
  for (const name of ['state.json', 'draft.json', 'backups/previous-state.json', 'Memos/one.md', 'Memos/independent.md', 'attachments/one-0.png', 'markdown-manifest.json']) {
    assert.deepEqual(await fs.readFile(path.join(target, name)), await fs.readFile(path.join(store.directory, name)));
  }
  const restarted = await new StorageLocation(profile).open();
  assert.equal(restarted.directory, await fs.realpath(target));
  assert.equal((await restarted.readDraft()).current.content, '最后输入的草稿');
  const next = await restarted.save(state, { ...state, profile: '迁移后修改' });
  assert.equal(next.profile, '迁移后修改');
  assert.deepEqual(await store.readState(), state);
  assert.equal((await location.moveTo(target)).changed, false);
});
test('nonempty, overlapping, and profile destinations are rejected without overwriting anything', async t => {
  const { root, target, profile, location, store } = await fixture(t);
  await fs.writeFile(path.join(target, 'keep.txt'), '保留');
  await assert.rejects(location.moveTo(target), /不是空/);
  assert.equal(await fs.readFile(path.join(target, 'keep.txt'), 'utf8'), '保留');
  const nested = path.join(store.directory, 'nested'); await fs.mkdir(nested);
  await assert.rejects(location.moveTo(nested), /不能位于/);
  await assert.rejects(location.moveTo(root), /包含/);
  const configChild = path.join(profile, 'cache'); await fs.mkdir(configChild);
  await assert.rejects(location.moveTo(configChild), /配置目录/);
  assert.equal(location.store, store); await assert.rejects(fs.access(location.config));
});
test('copy failures leave the active location and notes unchanged', async t => {
  const io = { ...fs, copyFile: async () => { throw Error('磁盘空间不足'); } };
  const { location, store, target, state } = await fixture(t, io);
  await assert.rejects(location.moveTo(target), /仍使用原目录.*磁盘空间不足/);
  assert.equal(location.store, store); assert.deepEqual(await store.readState(), state);
  await assert.rejects(fs.access(location.config));
});
test('configuration commit failure does not switch even after a complete copy', async t => {
  const io = { ...fs, rename: async (from, to) => { if (to.endsWith('storage-location.json')) throw Error('配置写入失败'); return fs.rename(from, to); } };
  const { location, store, target, state, profile } = await fixture(t, io);
  await assert.rejects(location.moveTo(target), /配置写入失败/);
  assert.equal(location.store, store); assert.deepEqual(await store.readState(), state);
  assert.equal((await new StorageLocation(profile).open()).directory, store.directory);
});
test('byte verification rejects a corrupted copied file without committing the path', async t => {
  const io = { ...fs, copyFile: async (from, to, flags) => { await fs.copyFile(from, to, flags); if (to.endsWith('draft.json')) await fs.writeFile(to, '{}'); } };
  const { location, store, target } = await fixture(t, io);
  await assert.rejects(location.moveTo(target), /校验失败/);
  assert.equal(location.store, store); await assert.rejects(fs.access(location.config));
});
test('missing custom drive, malformed configuration, and corrupt state never initialize an empty replacement', async t => {
  const { root, location, profile, target } = await fixture(t);
  await location.moveTo(target);
  const missing = path.join(root, 'disconnected');
  await fs.writeFile(location.config, JSON.stringify({ version: 1, directory: missing }));
  await assert.rejects(new StorageLocation(profile).open(), /自定义数据目录无法读取/);
  await assert.rejects(fs.access(missing));
  await fs.writeFile(location.config, JSON.stringify({ version: 1, directory: target }));
  await fs.writeFile(path.join(target, 'state.json'), 'broken');
  await assert.rejects(new StorageLocation(profile).open(), /无法读取/);
  assert.equal(await fs.readFile(path.join(target, 'state.json'), 'utf8'), 'broken');
  for (const raw of ['broken', 'null', '0', '{}']) {
    await fs.writeFile(location.config, raw);
    await assert.rejects(new StorageLocation(profile).open(), /配置/);
    assert.equal(await fs.readFile(location.config, 'utf8'), raw);
  }
});
