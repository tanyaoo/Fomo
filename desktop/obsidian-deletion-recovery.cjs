'use strict';
const Core=require('../dist/core.js');
const {digest,contentHash}=require('./obsidian-sync-plan.cjs');
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const hash=/^[0-9a-f]{64}$/;

// An intent describes one specific transition, including its exact trash time.
// It must be persisted before touching the authoritative state.
function makeIntent(state,entry,receipt,deletedAt){
 if(!receipt||!uuid.test(receipt.eventId||'')||!/^[a-zA-Z0-9-]{1,100}$/.test(receipt.id||'')||!hash.test(receipt.fileHash||'')||!entry||entry.deleted||entry.fileHash!==receipt.fileHash||!hash.test(entry.fomoHash||'')||!Number.isFinite(Date.parse(deletedAt)))throw Error('删除意图无效');
 const before=state.memos.find(m=>m.id===receipt.id);if(!before||before.deleted||contentHash(before)!==entry.fomoHash)throw Error('待删除笔记状态无效');
 const after=Core.batch(state,[receipt.id],'delete','',deletedAt).memos.find(m=>m.id===receipt.id);
 return {version:1,id:receipt.id,eventId:receipt.eventId,fileHash:receipt.fileHash,baselineFomoHash:entry.fomoHash,beforeHash:digest(before),afterHash:digest(after),deletedAt:new Date(deletedAt).toISOString()};
}

// Do not infer success from a missing file, a changed note, or a different
// deletion event. A restored/replaced file always requires human review.
function classifyIntent(intent,state,entry,receipts,consumed,filePresent){
 if(!intent||intent.version!==1||!/^[a-zA-Z0-9-]{1,100}$/.test(intent.id||'')||!uuid.test(intent.eventId||'')||![intent.fileHash,intent.baselineFomoHash,intent.beforeHash,intent.afterHash].every(x=>typeof x==='string'&&hash.test(x))||!Number.isFinite(Date.parse(intent.deletedAt))||!Array.isArray(receipts)||!Array.isArray(consumed)||typeof filePresent!=='boolean')throw Error('删除意图无效');
 if(filePresent||!entry||entry.deleted||entry.fileHash!==intent.fileHash||entry.fomoHash!==intent.baselineFomoHash||consumed.includes(intent.eventId))return 'review';
 const matches=receipts.filter(r=>r?.eventId===intent.eventId);if(matches.length!==1||matches[0].id!==intent.id||matches[0].fileHash!==intent.fileHash)return 'review';
 if(receipts.some(r=>r?.id===intent.id&&r.fileHash===intent.fileHash&&r.eventId!==intent.eventId&&!consumed.includes(r.eventId)))return 'review';
 const memo=state.memos.find(m=>m.id===intent.id);if(!memo)return 'review';
 if(!memo.deleted&&digest(memo)===intent.beforeHash)return 'apply';
 if(memo.deleted&&digest(memo)===intent.afterHash)return 'finalize';
 return 'review';
}
module.exports={makeIntent,classifyIntent};
