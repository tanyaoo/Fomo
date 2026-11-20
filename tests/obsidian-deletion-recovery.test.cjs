'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const Core=require('../dist/core.js');
const {digest,contentHash}=require('../desktop/obsidian-sync-plan.cjs');
const {makeIntent,classifyIntent}=require('../desktop/obsidian-deletion-recovery.cjs');
test('deletion intent distinguishes precommit and postcommit recovery while preserving the exact event',()=>{
 const now='2026-01-02T03:04:05.000Z',state=Core.blank();state.memos.push({id:'note',content:'正文',html:'',created:now,updated:now,deleted:false,starred:false,images:[]});const before=Core.validate(state),entry={deleted:false,fomoHash:contentHash(before.memos[0]),fileHash:digest('file')},receipt={id:'note',eventId:'00000000-0000-4000-8000-000000000001',fileHash:entry.fileHash},intent=makeIntent(before,entry,receipt,now);
 const classify=(s=before,e=entry,r=[receipt],c=[],present=false)=>classifyIntent(intent,s,e,r,c,present);
 assert.equal(classify(),'apply');const after=Core.batch(before,['note'],'delete','',now);assert.equal(classify(after),'finalize');
 assert.equal(classify(after,entry,[receipt],[],true),'review');assert.equal(classify(after,entry,[],[],false),'review');assert.equal(classify(after,entry,[receipt,receipt]),'review');assert.equal(classify(after,entry,[receipt],[receipt.eventId]),'review');assert.equal(classify(after,{...entry,fileHash:digest('other')}),'review');
 assert.equal(classify(after,entry,[receipt,{...receipt,eventId:'00000000-0000-4000-8000-000000000002'}]),'review');
 const edited=structuredClone(before);edited.memos[0].content='其他窗口的修改';assert.equal(classify(edited),'review');const changedTrash=structuredClone(after);changedTrash.memos[0].content='回收站修改';assert.equal(classify(changedTrash),'review');assert.throws(()=>makeIntent(before,entry,{...receipt,fileHash:digest('old')},now),/无效/);
});
