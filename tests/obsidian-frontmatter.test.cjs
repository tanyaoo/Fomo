'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {parseDocument,writeDocument}=require('../src/obsidian-frontmatter.cjs');
test('desktop and Obsidian bundles expose the same frontmatter implementation',()=>{const desktop=require('../desktop/obsidian-frontmatter.cjs'),plugin=require('../obsidian-plugin/fomo/frontmatter.cjs'),source='---\ntitle: 保留\n---\n正文';assert.deepEqual(desktop.parseDocument(source),plugin.parseDocument(source));assert.equal(desktop.writeDocument(desktop.parseDocument(source),{fomo_id:'x'}),plugin.writeDocument(plugin.parseDocument(source),{fomo_id:'x'}));});
test('standalone plugin includes the bundled YAML parser license',()=>{const fs=require('node:fs'),path=require('node:path'),license=fs.readFileSync(path.join(__dirname,'../obsidian-plugin/fomo/LICENSE-js-yaml.txt'),'utf8');assert.match(license,/Vitaly Puzrin/);assert.match(license,/Permission is hereby granted/);});
test('YAML registration and updates retain custom attributes, comments and body',()=>{
 const source='---\r\n# 原样保留\r\ntitle: "标题"\r\ntags:\r\n  - 生活\r\n  - 工作\r\nnested:\r\n  text: |\r\n    第一行\r\n    第二行\r\n---\r\n正文\r\n第二行\r\n';
 const initial=parseDocument(source),registered=writeDocument(initial,{fomo_id:'id-1',fomo_created:'2026-01-01T00:00:00.000Z'});assert.ok(registered.includes(initial.userLines.join('\r\n')));assert.equal(parseDocument(registered).body,initial.body);
 const updated=writeDocument(parseDocument(registered),{fomo_id:'id-1',fomo_created:'2026-01-01T00:00:00.000Z',fomo_starred:true},'修改正文');const result=parseDocument(updated);assert.deepEqual(result.userLines,initial.userLines);assert.equal(result.fields.fomo_starred,true);assert.equal(result.body,'修改正文');
});
test('frontmatter rejects ambiguous reserved keys, duplicates and malformed input',()=>{
 for(const input of ['---\nfomo_id: "a"\nfomo_id: "b"\n---\n正文','---\n"fomo_id": "a"\n---\n正文','---\nfomo_unknown: 1\n---\n正文','---\nfomo_id: unquoted\n---\n正文','---\ntitle: [broken\n---\n正文','---\n{title: hello}\n---\n正文','---\n未结束'])assert.throws(()=>parseDocument(input));
 const plain=parseDocument('普通笔记\n');assert.equal(plain.hasFrontmatter,false);assert.equal(parseDocument(writeDocument(plain,{fomo_id:'n'})).body,'普通笔记\n');assert.equal(parseDocument('---\n---\n正文').body,'正文');
});
