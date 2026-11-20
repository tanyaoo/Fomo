'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const Core=require('../dist/core.js');
const created='2026-01-02T00:00:00.000Z';
const note=(id,content,extra={})=>({id,content,created,updated:created,images:[],...extra});

test('explicit reference slugs resolve original URLs and backlinks without changing content',()=>{
 const state=Core.validate({memos:[note('local-source','source',{sourceSlug:'reference_123'}),note('local-child','关联自：https://v.legacy.invalid/mine/?memo_id=reference_123')]});
 assert.equal(Core.resolveRef(state.memos,'reference_123').id,'local-source');
 assert.equal(Core.relationships(state.memos,'local-child').outgoing[0].id,'local-source');
 assert.equal(Core.relationships(state.memos,'local-source').incoming[0].id,'local-child');
 assert.equal(Core.related(state.memos,'local-child')[0].direct,true);
 assert.equal(Core.validate(JSON.parse(JSON.stringify(state))).memos[0].sourceSlug,'reference_123');
 assert.match(state.memos[1].content,/memo_id=reference_123/);
});

test('legacy slug fields migrate to sourceSlug without losing links',()=>{
 const legacyField=['flo','moSlug'].join('');
 const state=Core.validate({memos:[note('local-source','source',{[legacyField]:'legacy_123'}),note('local-child','关联自：https://v.legacy.invalid/mine/?memo_id=legacy_123')]});
 assert.equal(state.memos[0].sourceSlug,'legacy_123');
 assert.equal(Object.hasOwn(state.memos[0],legacyField),false);
 assert.equal(Core.relationships(state.memos,'local-child').outgoing[0].id,'local-source');
});

test('conflicting slugs stay unresolved rather than opening a wrong note',()=>{
 const state=Core.validate({memos:[note('a','first',{sourceSlug:'same'}),note('b','second',{sourceSlug:'same'}),note('c','https://v.legacy.invalid/mine/?memo_id=same')]});
 assert.equal(Core.resolveRef(state.memos,'same'),null);
 assert.equal(Core.relationships(state.memos,'c').outgoing[0].missing,true);
 assert.throws(()=>Core.validate({memos:[note('a','x',{sourceSlug:'bad slug'})]}),/标识无效/);
});
