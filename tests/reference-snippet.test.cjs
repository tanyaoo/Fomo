'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const context={window:{}};vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../dist/markup.js'),'utf8'),context);
const snippet=context.window.MemoMarkup.referenceSnippet;
test('late reference matches retain thirty preceding characters and the full suffix',()=>{
 const prefix='前'.repeat(200),suffix='后'.repeat(140),content=prefix+'命中'+suffix;
 assert.equal(snippet(content,'命中'),'...'+prefix.slice(-30)+'命中'+suffix);
 assert.equal(content,prefix+'命中'+suffix);
});
test('reference context uses a literal case-insensitive whole query',()=>{
 assert.equal(snippet('x'.repeat(70)+'A[.]B tail','a[.]b'),'...'+'x'.repeat(30)+'A[.]B tail');
 assert.equal(snippet('x'.repeat(30)+'命中','命中'),'x'.repeat(30)+'命中');
});
test('separated query terms and empty queries retain the beginning without a ninety-character cap',()=>{
 const content='开头 '+ '前'.repeat(120)+' 第一项 中间 第二项 结尾';
 assert.equal(snippet(content,'第一项 第二项'),content);
 assert.equal(snippet(content,''),content);
 assert.equal(snippet('一\n\n二',''), '一 二');
});
