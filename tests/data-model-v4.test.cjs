'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const C=require('../dist/core.js');
const date='2026-10-22T00:00:00.000Z';
const memo=(id,extra={})=>({id,content:'正文',html:'<p>正文</p>',images:[],created:date,updated:date,starred:false,deleted:false,...extra});

test('v4 keeps a stable id, ISO timestamps and semantic source',()=>{
 const input={version:3,memos:[
  memo('direct-note'),
  memo('annotation-note',{annotationOf:'direct-note',source:'annotation',deleted:true,deletedAt:'2026-10-22T01:00:00.000Z'}),
  memo('reflection-note',{relatedTo:'direct-note'})
 ]};
 const state=C.validate(input);
 assert.equal(state.version,4);assert.equal(C.MODEL_VERSION,4);
 assert.equal(state.memos[0].created,date);assert.equal(state.memos[0].updated,date);
 assert.equal(C.sourceOf(state.memos[0]),'direct');
 assert.equal(C.sourceOf(state.memos[1]),'annotation');
 assert.equal(C.sourceOf(state.memos[2]),'reflection');
 assert.equal(state.memos[1].deletedAt,'2026-10-22T01:00:00.000Z');
 assert.throws(()=>C.validate({memos:[memo('bad',{source:'unknown'})]}),/来源/);
 assert.throws(()=>C.validate({memos:[memo('bad',{deletedAt:'not-a-date'})]}),/删除时间/);
});

test('soft delete and restore maintain deletedAt without losing history',()=>{
 const base=C.validate({memos:[memo('a')]});
 const deleted=C.batch(base,['a'],'delete','','2026-10-22T02:00:00.000Z');
 assert.equal(deleted.memos[0].deleted,true);assert.equal(deleted.memos[0].deletedAt,'2026-10-22T02:00:00.000Z');
 const restored=C.batch(deleted,['a'],'restore');
 assert.equal(restored.memos[0].deleted,false);assert.equal(restored.memos[0].deletedAt,undefined);
});

test('references and backlinks are derived from canonical URLs and remain bidirectional',()=>{
 const source=memo('a'),target=memo('b',{content:'看 writeboom://note/a'});
 const list=C.validate({memos:[source,target]}),links=C.relationships(list.memos,'a');
 assert.deepEqual(C.refsOf(target),['a']);
 assert.deepEqual(links.incoming.map(m=>m.id),['b']);
 assert.deepEqual(C.relationships(list.memos,'b').outgoing.map(m=>m.id),['a']);
});

test('local semantic search ranks term hits and preserves tag/relation reasons',()=>{
 const list=[memo('a',{content:'时间管理 是今天的主题 #阅读'}),memo('b',{content:'睡眠和精力 #生活'}),memo('c',{content:'读完一本时间管理的书 #阅读'}),memo('d',{content:'没有直接关键词，但同属阅读 #阅读'})];
 const rows=C.semanticSearch(list,'时间管理');
 assert.deepEqual(rows.map(row=>row.memo.id),['a','c']);
 assert.ok(rows[0].reasons.includes('命中「时间管理」'));
 assert.ok(rows[0].reasons.some(reason=>reason.includes('#阅读')));
 assert.equal(C.semanticSearch(list,'').length,0);
});
test('v1-v3 upgrade to v4 and annotation children carry semantic source',()=>{
 const old={version:2,memos:[{...memo('parent'),annotations:[{id:'legacy-comment',content:'旧批注',created:date}]}]};
 const state=C.upgrade(old),child=state.memos.find(m=>m.annotationOf==='parent');
 assert.equal(state.version,4);assert.equal(child.source,'annotation');assert.equal(child.references[0],'parent');
 assert.equal(C.upgrade(state).version,4);
});
