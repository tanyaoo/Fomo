'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const Module = require('node:module');
const path = require('node:path');
const Core = require('../dist/core.js');

const handlers = new Map();
let dialogResponse = 0;
const electron = {
  ipcMain: { handle(name, callback) { handlers.set(name, callback); } },
  dialog: { async showMessageBox() { return { response: dialogResponse }; } },
  screen: {
    getPrimaryDisplay() { return { workArea: { x: 0, y: 0, width: 1280, height: 900 } }; },
    getDisplayMatching() { return this.getPrimaryDisplay(); }
  },
  BrowserWindow: class {}
};

function loadComposeWindow() {
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request === 'electron') return electron;
    return original.call(this, request, parent, isMain);
  };
  try {
    delete require.cache[require.resolve('../desktop/compose-window.cjs')];
    return require('../desktop/compose-window.cjs').ComposeWindow;
  } finally {
    Module._load = original;
  }
}

function fixture(getNewNoteCloseAfterPublish) {
  let state = Core.blank();
  const store = {
    async readState() { return structuredClone(state); },
    async save(_base, desired) { state = structuredClone(desired); return state; },
    async composeDraft() {},
    async clearComposeDraftIfMatches() { return true; }
  };
  const ComposeWindow = loadComposeWindow();
  const shown = [];
  const compose = new ComposeWindow({
    root: path.resolve(__dirname, '..'),
    getStore: () => store,
    boundsFile: '',
    getNewNoteCloseAfterPublish,
    onShowPublished: async (id, bounds) => { shown.push({ id, bounds }); return true; }
  });
  const window = {
    closed: false,
    getBounds() { return { x: 120, y: 80, width: 500, height: 620 }; },
    isDestroyed() { return false; },
    close() { this.closed = true; if (compose.window === this) compose.window = null; }
  };
  compose.window = window;
  return { compose, store, shown, window, state: () => state };
}

test('publishing shows the saved note in the same bounds by default', async () => {
  const f = fixture(undefined);
  const id = await f.compose.save({ content: '发布后展示', html: '<p>发布后展示</p>', images: [] });
  assert.match(id, /^[a-zA-Z0-9-]+$/);
  assert.deepEqual(f.shown, [{ id, bounds: { x: 120, y: 80, width: 500, height: 620 } }]);
  assert.equal(f.window.closed, true);
  assert.equal(f.compose.window, null);
  assert.equal(f.state().memos[0].content, '发布后展示');
});

test('publishing closes the compose window when the preference is enabled', async () => {
  const f = fixture(() => true);
  await f.compose.save({ content: '发布后关闭', html: '<p>发布后关闭</p>', images: [] });
  assert.deepEqual(f.shown, []);
  assert.equal(f.window.closed, true);
  assert.equal(f.state().memos[0].content, '发布后关闭');
});

test('a failed show keeps the compose window open and preserves the saved memo', async () => {
  const f = fixture(() => false);
  f.compose.onShowPublished = async () => false;
  await f.compose.save({ content: '展示失败', html: '<p>展示失败</p>', images: [] });
  assert.equal(f.window.closed, false);
  assert.equal(f.state().memos[0].content, '展示失败');
});
test('a draft cleanup failure does not report an already saved note as unsaved', async () => {
  const f=fixture(()=>true),draft={submissionId:'12345678-1234-1234-1234-123456789abc',content:'已提交',html:'<p>已提交</p>',images:[]};f.store.readComposeDraft=async()=>draft;f.store.clearComposeDraftIfMatches=async()=>{throw Error('disk full');};
  const id=await f.compose.save(draft);
  assert.equal(f.state().memos.length,1);assert.equal(f.state().memos[0].id,id);assert.equal(f.window.closed,true);
});
test('repeated submission with the same persisted identity creates only one note', async () => {
  const f=fixture(()=>false),id='12345678-1234-1234-1234-123456789abc';
  const draft={submissionId:id,content:'幂等保存',html:'<p>幂等保存</p>',images:[]};
  f.store.readComposeDraft=async()=>draft;f.compose.onShowPublished=async()=>false;
  assert.equal(await f.compose.save(draft),id);assert.equal(await f.compose.save(draft),id);
  assert.equal(f.state().memos.length,1);assert.equal(f.state().memos[0].id,id);
});
test('a changed persisted draft prevents publishing an outdated editor snapshot', async () => {
  const f=fixture(),id='12345678-1234-1234-1234-123456789abc';
  f.store.readComposeDraft=async()=>({submissionId:id,content:'较新内容',html:'<p>较新内容</p>',images:[]});
  await assert.rejects(f.compose.save({submissionId:id,content:'旧内容',html:'<p>旧内容</p>',images:[]}),/草稿已变化/);
  assert.equal(f.state().memos.length,0);assert.equal(f.window.closed,false);
});
test('a reused submission identity cannot overwrite a different saved note', async () => {
  const f=fixture(),id='12345678-1234-1234-1234-123456789abc';
  const draft={submissionId:id,content:'新草稿',html:'<p>新草稿</p>',images:[]};
  f.store.readComposeDraft=async()=>draft;
  f.store.readState=async()=>({...Core.blank(),memos:[{id,content:'已有笔记',html:'<p>已有笔记</p>',images:[],created:new Date().toISOString(),updated:new Date().toISOString(),deleted:false,starred:false}]});
  await assert.rejects(f.compose.save(draft),/标识冲突/);assert.equal(f.window.closed,false);
});

test('closing the composer leaves its persisted draft untouched', async () => {
  const f = fixture();
  f.window.webContents = {};
  const close = handlers.get('compose:close');
  assert.equal(await close({ sender: f.window.webContents }), true);
  assert.equal(f.window.closed, true);
});

test('an in-progress window open blocks draft transfer and clears its guard on failure', async () => {
  const f = fixture();
  f.compose.window = null;
  let rejectBounds;
  f.compose.readBounds = () => new Promise((_resolve, reject) => { rejectBounds = reject; });
  const opening = f.compose.open();
  assert.equal(f.compose.opening, true);
  assert.deepEqual(await f.compose.detachDraft({content:'draft',html:'',images:[]}), {ok:false,reason:'compose-open'});
  rejectBounds(Error('bounds unavailable'));
  await assert.rejects(opening, /bounds unavailable/);
  assert.equal(f.compose.opening, false);
});
test('reopening a composer reconciles a draft already committed under its submission identity', async () => {
  const f=fixture();f.window.webContents={};
  const draft={submissionId:'12345678-1234-1234-1234-123456789abc',content:'已提交',html:'<p>已提交</p>',images:[]};
  const blank={submissionId:'87654321-4321-4321-4321-cba987654321',content:'',html:'',images:[]};
  let reads=0,cleared=false;
  f.store.ensureComposeDraftId=async()=>++reads===1?draft:blank;
  f.store.readState=async()=>({...Core.blank(),memos:[{...draft,id:draft.submissionId,created:new Date().toISOString(),updated:new Date().toISOString(),deleted:false,starred:false}]});
  f.store.clearComposeDraftIfMatches=async value=>{assert.deepEqual(value,draft);cleared=true;return true;};
  assert.deepEqual(await handlers.get('compose:read-draft')({sender:f.window.webContents}),blank);assert.equal(cleared,true);
});
test('reopening preserves a changed draft when its earlier submission was already saved', async () => {
  const f=fixture();f.window.webContents={};
  const draft={submissionId:'12345678-1234-1234-1234-123456789abc',content:'继续编辑的内容',html:'<p>继续编辑的内容</p>',images:[]};
  f.store.ensureComposeDraftId=async()=>draft;
  f.store.readState=async()=>({...Core.blank(),memos:[{...draft,id:draft.submissionId,content:'先前保存的内容',created:new Date().toISOString(),updated:new Date().toISOString(),deleted:false,starred:false}]});
  let written;f.store.replaceComposeDraftIfMatches=async (expected,value)=>{assert.deepEqual(expected,draft);written=value;return true;};
  const recovered=await handlers.get('compose:read-draft')({sender:f.window.webContents});
  assert.equal(recovered.content,draft.content);assert.notEqual(recovered.submissionId,draft.submissionId);assert.deepEqual(written,recovered);
});
