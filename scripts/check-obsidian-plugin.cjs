'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),folder=path.join(root,'obsidian-plugin','fomo');
const expected=['LICENSE-js-yaml.txt','frontmatter.cjs','image-assets.cjs','main.js','manifest.json','styles.css','sync-bridge.cjs'].sort();
const actual=fs.readdirSync(folder,{withFileTypes:true});assert.ok(actual.every(item=>item.isFile()),'插件目录不能包含额外目录或链接');assert.deepEqual(actual.map(item=>item.name).sort(),expected,'插件文件缺失或含有额外内容，请检查是否包含用户数据');
const manifest=JSON.parse(fs.readFileSync(path.join(folder,'manifest.json'),'utf8'));assert.equal(manifest.id,'fomo-cards');assert.match(manifest.version,/^\d+\.\d+\.\d+$/);assert.equal(manifest.isDesktopOnly,true);
for(const name of ['main.js','frontmatter.cjs','image-assets.cjs','sync-bridge.cjs']){const checked=spawnSync(process.execPath,['--check',path.join(folder,name)],{encoding:'utf8'});assert.equal(checked.status,0,name+' 语法检查失败：'+checked.stderr);}
assert.equal(fs.readFileSync(path.join(folder,'image-assets.cjs'),'utf8'),fs.readFileSync(path.join(root,'desktop','obsidian-image-assets.cjs'),'utf8'),'图片模块未更新，请运行 npm run pretest:desktop');
const frontmatter=require(path.join(folder,'frontmatter.cjs')),sample='---\ntitle: 测试\n---\n正文',document=frontmatter.parseDocument(sample);assert.equal(document.body,'正文');assert.equal(frontmatter.parseDocument(frontmatter.writeDocument(document,{fomo_id:'test'},document.body)).fields.fomo_id,'test');
console.log('PASS: Obsidian plugin contains the expected runtime files and no extra data; syntax and bundled modules verified.');
