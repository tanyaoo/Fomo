'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const Core=require('../dist/core.js');

test('link detection includes rich-text hrefs and local references without counting plain markup',()=>{
 assert.equal(Core.hasLinks({content:'网站',html:'<p><a href="https://example.com">网站</a></p>'}),true);
 assert.equal(Core.hasLinks({content:'普通文字',html:'<p>普通文字</p>',references:['b']}),true);
 assert.equal(Core.hasLinks({content:'普通文字',html:'<p>普通文字</p>'}),false);
});

test('parses internal and reference memo URLs',()=>{
 assert.equal(Core.memoIdFromToken('writeboom://note/abc-123'),'abc-123');
 assert.equal(Core.memoIdFromToken('memo-flow://note/legacy-1'),'legacy-1');
 assert.equal(Core.memoIdFromToken('https://v.legacy.invalid/mine/?memo_id=NDM4ODIzODU'),'NDM4ODIzODU');
 assert.equal(Core.memoIdFromToken('https://legacy.invalid/mine/?from=app&memo_id=NTI1ODk5NA'),'NTI1ODk5NA');
 assert.equal(Core.memoIdFromToken('https://v.legacy.invalid/mine/?memo_id=abc。'),'abc');
 assert.equal(Core.memoIdFromToken('writeboom://note/tail）'),'tail');
 assert.equal(Core.memoIdFromToken('https://example.com/elsewhere/?memo_id=no'),'');
});

test('derives references from body URLs as well as the legacy references field',()=>{
 const memo={id:'a',content:'看这里 writeboom://note/b 和 https://legacy.invalid/mine/?memo_id=c',html:'',references:['d']};
 assert.deepEqual(Core.refsOf(memo).sort(),['b','c','d']);
 assert.deepEqual(Core.memoIds(memo.content).sort(),['b','c']);
});

test('internal memo URLs are tokenized before generic URLs',()=>{
 const tokens=Core.tokens('前 writeboom://note/a 中 https://example.com 后');
 assert.equal(tokens[0][0],'writeboom://note/a');
 assert.equal(tokens[1][0],'https://example.com');
});

test('a tag after an editor line break is tokenized after the preceding URL',()=>{
 const placeholder=String.fromCharCode(0xFFFC);
 const tokens=Core.tokens(`https://example.com/#片段${placeholder}#阅读`).map(match=>match[0]);
 assert.deepEqual(tokens,['https://example.com/#片段','#阅读']);
});
