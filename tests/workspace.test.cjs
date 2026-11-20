'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const C=require('../dist/core.js'),{FileStore,markdown}=require('../desktop/file-store.cjs');
// Keep revision fixtures within the product's rolling 30-day retention window.
const date=new Date(Date.now()-3600000).toISOString();
const note=(id,content='原笔记')=>({id,content,html:'<p>'+content+'</p>',images:[],created:date,updated:date,deleted:false,starred:false});

test('v2 annotations migrate once into independent notes without destroying their source archive',()=>{
 const original={version:2,memos:[{...note('parent'),annotations:[{id:'one',content:'新的理解 #阅读',created:date},{id:'two',content:'另一条理解',created:date}]}]};
 const input=JSON.stringify(original),state=C.upgrade(original);assert.equal(JSON.stringify(original),input);assert.equal(state.version,4);assert.equal(state.memos.length,3);
 const parent=state.memos[0],children=state.memos.slice(1);assert.equal(parent.content,original.memos[0].content);assert.deepEqual(parent.annotations,original.memos[0].annotations);assert.equal(parent.annotationsMigrated,true);
 assert.deepEqual(children.map(m=>m.references),[['parent'],['parent']]);assert.ok(children.every(m=>m.annotationOf==='parent'));assert.equal(C.relationships(state.memos,'parent').annotations.length,2);
 assert.deepEqual(C.upgrade(state),state);assert.deepEqual(C.upgrade(original),state);assert.equal(C.searchText(parent).includes('新的理解'),false);assert.equal(C.searchText(children[0]).includes('新的理解'),true);
});
test('migration handles occupied IDs, deleted source records and maximum length IDs',()=>{
 const parent={...note('p'.repeat(100)),deleted:true,annotations:[{id:'a'.repeat(100),content:'旧批注',created:date}]};const state=C.upgrade({memos:[parent]}),child=state.memos[1];
 const collided=C.upgrade({memos:[parent,note(child.id,'无关记录')]});assert.equal(collided.memos.length,3);assert.equal(collided.memos[1].content,'无关记录');assert.notEqual(collided.memos[2].id,child.id);assert.equal(collided.memos[2].deleted,true);assert.ok(collided.memos[2].id.length<=100);
 assert.throws(()=>C.validate({version:C.MODEL_VERSION+1,memos:[]}),/版本/);
});
test('an existing v2 editing draft resumes after migration without reverting the archive marker',()=>{
 const old=C.validate({memos:[{...note('parent'),annotations:[{id:'old-comment',content:'旧批注',created:date}]}]}),latest=C.upgrade(old),before=C.clone(latest),desired=C.clone(latest);
 before.memos[0]=C.clone(old.memos[0]);desired.memos[0].content='继续之前未完成的编辑';
 const result=C.merge(before,desired,latest);assert.equal(result.memos[0].content,desired.memos[0].content);assert.equal(result.memos[0].annotationsMigrated,true);assert.equal(result.memos.length,2);assert.deepEqual(C.upgrade(result),result);
});
test('multiple references, annotation provenance and backlinks survive export and trash',()=>{
 const a=note('a'),b=note('b'),c={...note('c'),references:['a','b','a'],annotationOf:'a'};const s=C.validate({memos:[a,b,c]});
 assert.deepEqual(s.memos[2].references,['a','b']);assert.deepEqual(C.relationships(s.memos,'c').outgoing.map(m=>m.id),['a','b']);assert.equal(C.relationships(s.memos,'b').incoming[0].id,'c');
 assert.equal(C.relationships(s.memos,'a').annotations[0].id,'c');assert.match(markdown(s.memos[2]),/annotation_of: "a"/);assert.match(markdown(s.memos[2]),/\[\[b\]\]/);
 s.memos[2].deleted=true;assert.equal(C.relationships(s.memos,'a').incoming.length,0);assert.equal(C.relationships(s.memos,'a').annotations.length,0);assert.equal(C.relationships(s.memos,'c').outgoing.length,2);
 assert.throws(()=>C.validate({memos:[{...a,references:['a']}]}),/引用/);assert.throws(()=>C.validate({memos:[{...a,references:['../x']}]}),/引用/);
});
test('successful document edits preserve old text, formatting and references as text-only history',()=>{
 const original={...note('a'),images:['data:image/png;base64,YQ=='],references:['b']};const base=C.validate({memos:[original,note('b')]}),desired=C.clone(base);desired.memos[0].content='第二版';desired.memos[0].html='<p><strong>第二版</strong></p>';desired.memos[0].references=[];desired.memos[0].images=[];desired.memos[0].updated=new Date(Date.parse(date)+60000).toISOString();
 const saved=C.merge(base,desired,base),m=saved.memos[0];assert.equal(m.history.length,1);const revision=m.history[0];assert.equal(revision.content,'原笔记');assert.deepEqual(revision.references,['b']);assert.deepEqual(revision.images,[]);
 const restored=C.clone(saved);restored.memos[0]=C.restoreVersion(m,revision,new Date(Date.parse(date)+120000).toISOString());const result=C.merge(saved,restored,saved).memos[0];assert.equal(result.content,'原笔记');assert.equal(result.history.length,2);assert.ok(result.history.some(r=>r.content==='第二版'));assert.deepEqual(result.images,[]);
});
test('revision retention excludes expired snapshots and keeps recent snapshots',()=>{
 const oldDate=new Date(Date.now()-31*86400000).toISOString(),recentDate=new Date(Date.now()-29*86400000).toISOString();
 for(const [updated,retained] of [[oldDate,false],[recentDate,true]]){const base=C.validate({memos:[{...note('a'),updated}]}),next=C.clone(base);next.memos[0].content='更新';next.memos[0].updated=new Date().toISOString();const result=C.merge(base,next,base).memos[0];assert.equal(!!result.history?.length,retained);}
});
test('metadata changes do not create revisions; conflicts cannot create a phantom saved version',()=>{
 const base=C.validate({memos:[note('a')]}),star=C.clone(base);star.memos[0].starred=true;assert.equal(C.merge(base,star,base).memos[0].history,undefined);
 const one=C.clone(base),two=C.clone(base);one.memos[0].content='甲';two.memos[0].content='乙';const saved=C.merge(base,one,base);assert.throws(()=>C.merge(base,two,saved),/其他窗口/);assert.equal(saved.memos[0].history.length,1);
});
test('history has a bounded 100-version retention and survives JSON validation',()=>{
 let state=C.validate({memos:[note('a')]});for(let index=1;index<=105;index++){const next=C.clone(state);next.memos[0].content='版本'+index;next.memos[0].updated=new Date(Date.parse(date)+index*1000).toISOString();state=C.merge(state,next,state);}
 assert.equal(state.memos[0].history.length,100);assert.equal(state.memos[0].history[0].content,'版本5');assert.deepEqual(C.validate(JSON.parse(JSON.stringify(state))),state);
});
test('batch tagging deduplicates, preserves formatting, and creates one version per changed record',()=>{
 const base=C.validate({memos:[note('a'),note('b','已有 #阅读'),note('c')]}),desired=C.batch(base,['a','b'],'tag','#阅读');const saved=C.merge(base,desired,base);
 assert.equal(C.tagsOf(saved.memos[0].content).filter(t=>t==='阅读').length,1);assert.match(saved.memos[0].html,/<p>#阅读<\/p>/);assert.equal(saved.memos[0].history.length,1);assert.equal(saved.memos[1].history,undefined);assert.deepEqual(saved.memos[2],base.memos[2]);
 assert.throws(()=>C.batch(base,['a','missing'],'tag','标签'),/状态/);assert.equal(base.memos[0].content,'原笔记');
});
test('batch deletion and undo remain atomic when another window changes a selected note',()=>{
 const base=C.validate({memos:[note('a'),note('b')]}),desired=C.batch(base,['a','b'],'delete'),other=C.clone(base);other.memos[1].content='另一个窗口修改';
 assert.throws(()=>C.merge(base,desired,other),/其他窗口/);assert.equal(other.memos[0].deleted,false);
 const saved=C.merge(base,desired,base),restored=C.merge(saved,base,saved);assert.ok(restored.memos.every(m=>!m.deleted));assert.throws(()=>C.batch(base,['a'],'restore'),/状态/);
});
async function fixture(t,io){const parent=path.resolve(__dirname,'../work');await fs.mkdir(parent,{recursive:true});const directory=await fs.mkdtemp(path.join(parent,'upgrade-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));return {directory,store:new FileStore(directory,{io})};}
test('desktop migration stores the exact pre-upgrade library before committing and is idempotent',async t=>{
 const {directory,store}=await fixture(t),old={version:2,memos:[{...note('p'),annotations:[{id:'x',content:'旧批注',created:date}]}]};await fs.writeFile(store.file,JSON.stringify(old));const state=await store.init();assert.equal(state.memos.length,2);
 const files=await fs.readdir(path.join(directory,'backups')),backup=files.find(name=>name.startsWith('before-v4-'));assert.deepEqual(JSON.parse(await fs.readFile(path.join(directory,'backups',backup),'utf8')),old);
 assert.deepEqual(await new FileStore(directory).init(),state);assert.equal((await fs.readdir(path.join(directory,'backups'))).filter(name=>name.startsWith('before-v4-')).length,1);assert.match(await fs.readFile(path.join(directory,'Memos',state.memos[1].id+'.md'),'utf8'),/annotation_of/);
});
test('failure to back up or commit migration leaves the old library readable and unchanged',async t=>{
 for(const failure of ['backup','state']){
   const io={...fs,rename:async(from,to)=>{if(failure==='backup'?to.includes('before-v4-'):to.endsWith('state.json'))throw Error('模拟迁移写入失败');return fs.rename(from,to);}};
   const {store}=await fixture(t,io),old={version:2,memos:[{...note('p'),annotations:[{id:'x',content:'旧批注',created:date}]}]},bytes=JSON.stringify(old);await fs.writeFile(store.file,bytes);await assert.rejects(store.init(),/迁移/);assert.equal(await fs.readFile(store.file,'utf8'),bytes);assert.equal((await new FileStore(store.directory).init()).memos.length,2);
 }
});
