'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const {matchTagSuggestions,recentTagSuggestions}=require('../dist/core.js');

test('tag suggestions prioritize full and final segment prefixes, ignoring case',()=>{
  const tags=['笔记/交易复盘','交易计划','工作/交易','我的交易','TRADE/日志','工作/TradeIdeas'];
  assert.deepEqual(matchTagSuggestions(tags,'交易'),['笔记/交易复盘','交易计划','工作/交易','我的交易']);
  assert.deepEqual(matchTagSuggestions(tags,'trade'),['TRADE/日志','工作/TradeIdeas']);
  assert.deepEqual(matchTagSuggestions(tags,'不存在'),[]);
  assert.deepEqual(tags,['笔记/交易复盘','交易计划','工作/交易','我的交易','TRADE/日志','工作/TradeIdeas']);
});

test('recent suggestions use active notes, exclude ancestors, and limit the candidate set',()=>{
  const note=(content,day,deleted=false)=>({content,created:`2026-10-${String(day).padStart(2,'0')}T00:00:00Z`,updated:`2026-10-${String(day).padStart(2,'0')}T00:00:00Z`,deleted});
  const notes=[note('#工作',1),note('#工作/计划',3),note('#生活',2),note('#不显示',4,true)];
  assert.deepEqual(recentTagSuggestions(notes),['工作/计划','生活']);
  assert.equal(recentTagSuggestions(Array.from({length:15},(_,i)=>note(`#标签${i}`,i+1))).length,10);
  assert.deepEqual(recentTagSuggestions([]),[]);
});
