const test=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const C=require('../dist/core.js');
// Small deterministic IndexedDB adapter with queued transactions and commit/abort.
// The production store is executed unchanged; disk/quota failure is injected here.
function boot(){
 const data={data:new Map(),drafts:new Map()};let tail=Promise.resolve(),failPut=false;
 const db={createObjectStore(){},close(){},transaction(name,mode){
  let release;const ready=tail;tail=new Promise(r=>release=r);
  let aborted=false,working,result;
  const tx={error:null,objectStore(){return {get(key){
   const request={};ready.then(()=>{working=new Map(data[name]);result=working.get(key);request.result=result===undefined?undefined:C.clone(result);request.onsuccess?.();queueMicrotask(()=>{if(!aborted){if(mode==='readwrite')data[name]=working;tx.oncomplete?.();}release();});});return request;
  },put(value,key){
   if(failPut){const e=Error('quota');e.name='QuotaExceededError';tx.error=e;tx.abort();return {};}
   if(!working)working=new Map(data[name]);working.set(key,C.clone(value));
   if(mode==='readwrite'&&name==='drafts')ready.then(()=>queueMicrotask(()=>{if(!aborted){data[name]=working;tx.oncomplete?.();}release();}));return {};
  }};},abort(){if(aborted)return;aborted=true;queueMicrotask(()=>{tx.onabort?.();release();});}};return tx;
 }};
 const ctx={window:{},MemoCore:C,Promise,indexedDB:{open(){const request={result:db};queueMicrotask(()=>request.onsuccess?.());return request;}}};vm.createContext(ctx);vm.runInContext(fs.readFileSync(require.resolve('../dist/store.js'),'utf8'),ctx);
 return {store:ctx.window.MemoStore,fail:()=>failPut=true,data};
}
const memo=id=>({id,content:'test',created:'2026-10-01T00:00:00.000Z',updated:'2026-10-01T00:00:00.000Z',images:[],deleted:false,starred:false,html:''});
test('invalid legacy data aborts initialization and is never replaced',async()=>{
 const {store,data}=boot();await assert.rejects(store.init('{"memos":[{}]}'));assert.equal(data.data.has('state'),false);
});
test('quota failure rejects each kind of mutation and retains stored state',async()=>{
 for(const operation of ['edit','star','delete','restore','settings','tag']){
  const {store,fail}=boot();const base=await store.init(JSON.stringify({...C.blank(),memos:[{...memo('x'),deleted:operation==='restore'}]}));const desired=C.clone(base);
  if(operation==='edit')desired.memos[0].content='changed';if(operation==='star')desired.memos[0].starred=true;if(operation==='delete')desired.memos[0].deleted=true;if(operation==='restore')desired.memos[0].deleted=false;if(operation==='settings')desired.profile='changed';if(operation==='tag')desired.extraTags=['new'];
  fail();await assert.rejects(store.save(base,desired),e=>e.name==='QuotaExceededError');assert.deepEqual(JSON.parse(JSON.stringify(await store.readState())),C.clone(base));
 }
});
test('simultaneous commits serialize and preserve both new notes',async()=>{
 const {store}=boot();const base=await store.init('');const a={...C.clone(base),memos:[memo('a')]},b={...C.clone(base),memos:[memo('b')]};await Promise.all([store.save(base,a),store.save(base,b)]);assert.deepEqual((await store.readState()).memos.map(m=>m.id).sort(),['a','b']);
});
test('draft roundtrip keeps memo identity, original new draft and image bytes',async()=>{
 const {store}=boot();await store.init('');const draft={editing:'x',editingBase:memo('x'),newDraft:{content:'new',html:'<b>new</b>',images:[]},current:{content:'edited',html:'<u>edited</u>',images:['data:image/png;base64,YQ==']}};
 await store.draft('tab',draft);assert.deepEqual(JSON.parse(JSON.stringify(await store.readDraft('tab'))),draft);
});

test('browser migration saves a pre-upgrade copy in the same transaction and runs only once',async()=>{
 const {store,data}=boot(),old={version:2,memos:[{...memo('a'),annotations:[{id:'comment',content:'旧批注',created:memo('a').created}]}]};data.data.set('state',C.clone(old));
 const state=await store.init('');assert.equal(state.version,4);assert.equal(state.memos.length,2);const backups=[...data.data.keys()].filter(key=>key.startsWith('before-v4-'));assert.equal(backups.length,1);assert.deepEqual(data.data.get(backups[0]),old);
 assert.deepEqual(await store.init(''),state);assert.equal([...data.data.keys()].filter(key=>key.startsWith('before-v4-')).length,1);
});

test('a browser upgrade quota error cannot partially replace the old state',async()=>{
 const {store,data,fail}=boot(),old={version:2,memos:[{...memo('a'),annotations:[{id:'comment',content:'旧批注',created:memo('a').created}]}]};data.data.set('state',C.clone(old));fail();await assert.rejects(store.init(''),error=>error.name==='QuotaExceededError');assert.deepEqual(data.data.get('state'),old);
});
