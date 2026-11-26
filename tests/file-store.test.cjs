'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const C = require('../dist/core.js');
const { FileStore } = require('../desktop/file-store.cjs');
async function fixture(t, io) {
  const parent = path.resolve(__dirname, '../work/file-store-tests');
  await fs.mkdir(parent, { recursive: true });
  const dir = await fs.mkdtemp(path.join(parent, 'case-'));
  if (!dir.startsWith(parent + path.sep)) throw Error('测试目录超出预期路径');
  t.after(() => fs.rm(dir, { recursive: true, force: true }));
  return { dir, store: new FileStore(dir, { io }) };
}
const memo = id => ({ id, content: '记录一个想法 #工作/灵感', html: '<b>记录一个想法</b> #工作/灵感', images: [],
  created: '2026-10-11T01:00:00.000Z', updated: '2026-10-11T01:00:00.000Z', deleted: false, starred: false });
test('completed submission clears only its own unchanged composer draft', async t => {
  const {store}=await fixture(t);await store.init();
  const old={submissionId:'12345678-1234-1234-1234-123456789abc',content:'旧草稿',html:'<p>旧草稿</p>',images:[]};
  const newer={submissionId:'87654321-4321-4321-4321-cba987654321',content:'新草稿',html:'<p>新草稿</p>',images:[]};
  await store.composeDraft(old);await store.composeDraft(newer);
  assert.equal(await store.clearComposeDraftIfMatches(old),false);assert.deepEqual(await store.readComposeDraft(),newer);
  assert.equal(await store.clearComposeDraftIfMatches(newer),true);assert.deepEqual(await store.readComposeDraft(),{content:'',html:'',images:[]});
});
test('native save survives restart, retains rich text, and generates searchable Markdown', async t => {
  const { dir, store } = await fixture(t); const base = await store.init();
  const next = await store.save(base, { ...base, memos: [memo('one')] });
  assert.deepEqual(await new FileStore(dir).init(), next);
  const text = await fs.readFile(path.join(dir, 'Memos/one.md'), 'utf8');
  assert.match(text, /tags: \["工作\/灵感"\]/); assert.match(text, /记录一个想法/);
  assert.equal(next.memos[0].html, memo('one').html);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, 'backups/previous-state.json'))), base);
});
test('corrupt JSON, null, and invalid records never get replaced by an empty state', async t => {
  const { dir, store } = await fixture(t);
  for (const raw of ['broken', 'null', '{"memos":[{}]}']) {
    await fs.writeFile(store.file, raw); await assert.rejects(store.init());
    assert.equal(await fs.readFile(store.file, 'utf8'), raw);
  }
});
test('atomic state replacement failure retains saved state and a valid recovery backup', async t => {
  let fail = false;
  const io = { ...fs, rename: async (from, to) => { if (fail && to.endsWith('state.json') && !to.includes('previous-state')) throw Error('disk write failed'); return fs.rename(from, to); } };
  const { store, dir } = await fixture(t, io); const base = await store.init(); fail = true;
  await assert.rejects(store.save(base, { ...base, memos: [memo('x')] }), /disk write failed/);
  assert.deepEqual(await store.readState(), base);
  assert.deepEqual(JSON.parse(await fs.readFile(path.join(dir, 'backups/previous-state.json'))), base);
  assert.equal((await fs.readdir(dir)).filter(p => p.endsWith('.tmp')).length, 0);
});
test('native simultaneous edits preserve unrelated additions and reject conflicts', async t => {
  const { store } = await fixture(t); const base = await store.init();
  await Promise.all([store.save(base, { ...base, memos: [memo('a')] }), store.save(base, { ...base, memos: [memo('b')] })]);
  const before = await store.readState(); assert.equal(before.memos.length, 2);
  const first = C.clone(before), second = C.clone(before); first.memos[0].content = '第一版'; second.memos[0].content = '第二版';
  await store.save(before, first); await assert.rejects(store.save(before, second), /其他窗口修改/);
  assert.equal((await store.readState()).memos[0].content, '第一版');
});
test('trash/restore updates only app-owned Markdown and exports image attachments', async t => {
  const { store, dir } = await fixture(t); const base = await store.init();
  await fs.writeFile(path.join(dir, 'Memos/unmanaged.md'), '独立文件');
  const m = { ...memo('image'), images: ['data:image/png;base64,YQ=='] };
  const saved = await store.save(base, { ...base, memos: [m] });
  assert.equal((await fs.readFile(path.join(dir, 'attachments/image-0.png'))).toString(), 'a');
  const deleted = C.clone(saved); deleted.memos[0].deleted = true;
  const trashed = await store.save(saved, deleted);
  await assert.rejects(fs.access(path.join(dir, 'Memos/image.md')));
  assert.match(await fs.readFile(path.join(dir, 'Trash/image.md'), 'utf8'), /deleted: true/);
  assert.equal(await fs.readFile(path.join(dir, 'Memos/unmanaged.md'), 'utf8'), '独立文件');
  const restored = C.clone(trashed); restored.memos[0].deleted = false; await store.save(trashed, restored);
  await fs.access(path.join(dir, 'Memos/image.md')); await assert.rejects(fs.access(path.join(dir, 'Trash/image.md')));
});
test('unchanged notes and image attachments are not rewritten by later saves', async t => {
  const { store, dir } = await fixture(t); const base = await store.init();
  const first = { ...memo('stable'), images: ['data:image/png;base64,YQ=='] };
  const saved = await store.save(base, { ...base, memos: [first] });
  const markdownFile = path.join(dir, 'Memos/stable.md'), imageFile = path.join(dir, 'attachments/stable-0.png');
  const markdownTime = (await fs.stat(markdownFile)).mtimeMs, imageTime = (await fs.stat(imageFile)).mtimeMs;
  const latest = await store.readState();
  await store.save(latest, { ...latest, memos: [...latest.memos, memo('second')] });
  assert.equal((await fs.stat(markdownFile)).mtimeMs, markdownTime);
  assert.equal((await fs.stat(imageFile)).mtimeMs, imageTime);
  await fs.access(path.join(dir, 'Memos/second.md'));
  assert.equal(saved.memos.length, 1);
});
test('removing or trashing a note cleans up its cached attachments', async t => {
  const { store, dir } = await fixture(t); const base = await store.init();
  const withImage = { ...memo('image'), images: ['data:image/png;base64,YQ=='] };
  const saved = await store.save(base, { ...base, memos: [withImage] });
  const withoutImage = C.clone(saved); withoutImage.memos[0].images = []; withoutImage.memos[0].updated = '2026-10-11T02:00:00.000Z';
  await store.save(saved, withoutImage);
  await assert.rejects(fs.access(path.join(dir, 'attachments/image-0.png')));
  await fs.access(path.join(dir, 'Memos/image.md'));
});
test('permanent purge removes only trashed notes and leaves a protection snapshot', async t => {
  const { store, dir } = await fixture(t); const base = await store.init();
  const trashed = { ...memo('trash-me'), deleted: true, images: ['data:image/png;base64,YQ=='] };
  const saved = await store.save(base, { ...base, memos: [memo('keep-me'), trashed] });
  await fs.writeFile(path.join(dir, 'attachments/orphan-0.png'), 'x');
  const next = await store.purge(['trash-me']);
  assert.deepEqual(next.memos.map(m => m.id), ['keep-me']);
  await assert.rejects(fs.access(path.join(dir, 'Trash/trash-me.md')));
  await assert.rejects(fs.access(path.join(dir, 'attachments/trash-me-0.png')));
  assert.ok((await fs.readdir(path.join(dir, 'backups'))).some(name => name.startsWith('before-restore-')));
  await assert.rejects(store.purge(['keep-me']), /回收站/);
  assert.equal(saved.memos.length, 2);
});
test('storage report and attachment cleanup only remove unreferenced app-owned files', async t => {
  const { store, dir } = await fixture(t); const base = await store.init();
  await store.save(base, { ...base, memos: [{ ...memo('image'), images: ['data:image/png;base64,YQ=='] }] });
  await fs.writeFile(path.join(dir, 'attachments/orphan-0.png'), 'orphan');
  await fs.writeFile(path.join(dir, 'attachments/user-file.txt'), 'keep');
  const usage = await store.storageInfo();
  assert.ok(usage.attachments.bytes >= 2); assert.equal(usage.attachments.files, 3);
  assert.equal(usage.attachments.referencedFiles, 1); assert.equal(usage.attachments.orphanedFiles, 1);
  assert.ok(usage.attachments.orphanedBytes >= 6); assert.ok(usage.misc.files >= 1); assert.ok(usage.total >= usage.state.bytes + usage.attachments.bytes);
  const details = await store.attachmentInfo();
  assert.equal(details.length, 2); assert.equal(details.find(row => row.name === 'image-0.png').referenced, true);
  assert.equal(details.find(row => row.name === 'orphan-0.png').referenced, false);
  const result = await store.cleanupAttachments(['orphan-0.png']);
  assert.equal(result.removed, 1);
  await fs.access(path.join(dir, 'attachments/image-0.png'));
  await fs.access(path.join(dir, 'attachments/user-file.txt'));
  await assert.rejects(fs.access(path.join(dir, 'attachments/orphan-0.png')));
  assert.throws(() => store.cleanupAttachments(['../state.json']), /清理清单无效/);
});
test('selected attachment cleanup rechecks current references and preserves unselected files', async t => {
  const { store, dir } = await fixture(t); const base = await store.init();
  await fs.writeFile(path.join(dir, 'attachments/orphan-0.png'), 'old orphan');
  const listed = await store.attachmentInfo(); assert.equal(listed.find(row => row.name === 'orphan-0.png').referenced, false);
  await store.save(base, { ...base, memos: [{ ...memo('orphan'), images: ['data:image/png;base64,YQ=='] }] });
  await fs.writeFile(path.join(dir, 'attachments/keep-0.png'), 'not selected');
  await fs.writeFile(path.join(dir, 'attachments/chosen-0.png'), 'selected orphan');
  const result = await store.cleanupAttachments(['orphan-0.png', 'chosen-0.png']);
  assert.deepEqual(result, { removed: 1, bytes: 'selected orphan'.length, skipped: 1 });
  await fs.access(path.join(dir, 'attachments/orphan-0.png'));
  await fs.access(path.join(dir, 'attachments/keep-0.png'));
  await assert.rejects(fs.access(path.join(dir, 'attachments/chosen-0.png')));
});
test('Markdown projection failure reports warning while the full state remains committed', async t => {
  let fail = false;
  const io = { ...fs, rename: async (from, to) => { if (fail && to.endsWith('.md')) throw Error('projection failed'); return fs.rename(from, to); } };
  const { store } = await fixture(t, io); const base = await store.init(); fail = true;
  const result = await store.save(base, { ...base, memos: [memo('x')] });
  assert.equal(result.memos.length, 1); assert.equal((await store.readState()).memos.length, 1);
  assert.match(store.warning, /副本生成失败/);
});
test('native draft with editing context and images survives a complete restart', async t => {
  const { store, dir } = await fixture(t); await store.init();
  const draft = { current: { content: '还没写完', html: '<b>还没写完</b>', images: [] }, editing: 'one', editingBase: memo('one'), newDraft: { content: '之前的草稿', images: [] } };
  await store.draft(draft); assert.deepEqual(await new FileStore(dir).readDraft(), draft);
});
test('independent composer draft survives restart and rejects corrupt existing data', async t => {
  const {store,dir}=await fixture(t);await store.init();
  const draft={content:'待续',html:'<p><strong>待续</strong></p>',images:['data:image/png;base64,YQ==']};
  await store.composeDraft(draft);assert.deepEqual(await new FileStore(dir).readComposeDraft(),draft);
  const file=path.join(dir,'compose-draft.json');await fs.writeFile(file,'broken');
  await assert.rejects(store.readComposeDraft());await assert.rejects(store.composeDraft(draft));assert.equal(await fs.readFile(file,'utf8'),'broken');
});
test('failed independent composer draft replacement preserves the previous copy', async t => {
  let fail=false;
  const io={...fs,rename:async(from,to)=>{if(fail&&to.endsWith('compose-draft.json'))throw Error('disk full');return fs.rename(from,to);}};
  const {store,dir}=await fixture(t,io);await store.init();
  const previous={content:'原稿',html:'<p>原稿</p>',images:[]};
  await store.composeDraft(previous);fail=true;
  await assert.rejects(store.composeDraft({content:'新稿',html:'<p>新稿</p>',images:[]}),/disk full/);
  assert.deepEqual(await new FileStore(dir).readComposeDraft(),previous);
});
test('independent composer draft writes are serialized with the latest value retained', async t => {
  const {store,dir}=await fixture(t);await store.init();
  const first={content:'第一版',html:'<p>第一版</p>',images:[]},second={content:'第二版',html:'<p>第二版</p>',images:[]};
  await Promise.all([store.composeDraft(first),store.composeDraft(second)]);
  assert.deepEqual(await new FileStore(dir).readComposeDraft(),second);
});
test('a legacy composer draft receives a stable submission identity without losing content', async t => {
  const {store,dir}=await fixture(t);await store.init();
  await store.composeDraft({content:'原草稿',html:'<p>原草稿</p>',images:[]});
  const first=await store.ensureComposeDraftId(),second=await new FileStore(dir).ensureComposeDraftId();
  assert.match(first.submissionId,/^[a-f0-9-]{36}$/);assert.deepEqual(second,first);assert.equal(first.content,'原草稿');
});
test('independent composer draft rejects malformed attachments without replacing a valid draft', async t => {
  const {store}=await fixture(t);await store.init();
  const previous={content:'保留',html:'<p>保留</p>',images:[]};await store.composeDraft(previous);
  await assert.rejects(store.composeDraft({...previous,images:['file:///private.png']}),/格式无效/);
  assert.deepEqual(await store.readComposeDraft(),previous);
});


test('corrupt and malformed drafts are never overwritten by a fresh empty editor',async t=>{
 const {dir,store}=await fixture(t);await store.init();const file=path.join(dir,'draft.json');
 for(const raw of ['broken','null','{"current":{}}']){
  await fs.writeFile(file,raw);await assert.rejects(store.readDraft());await assert.rejects(store.draft({current:{content:'',images:[]}}));assert.equal(await fs.readFile(file,'utf8'),raw);
 }
 await fs.writeFile(file,JSON.stringify({current:{content:'修复的原草稿',images:[]}}));assert.equal((await store.readDraft()).current.content,'修复的原草稿');
 await store.draft({current:{content:'可继续保存',images:[]}});assert.equal((await store.readDraft()).current.content,'可继续保存');
});
