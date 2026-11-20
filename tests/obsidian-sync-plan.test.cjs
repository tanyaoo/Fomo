'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {encode,decode,planSync,contentHash,digest}=require('../desktop/obsidian-sync-plan.cjs');
const memo=(content='原文',extra={})=>({id:'id-1',content,created:'2026-01-01T00:00:00.000Z',updated:'2026-01-01T00:00:00.000Z',deleted:false,...extra});
const setup=()=>{const m=memo(),text=encode(m);return {m,text,base:{'id-1':{fomoHash:contentHash(m),fileHash:digest(text),deleted:false}}};};
test('roundtrips note without altering trailing content',()=>{for(const c of ['简单\n','---\n正文\n\n','']){const m=memo(c);assert.equal(decode(encode(m)).content,c);}});
test('explicit references roundtrip and changes participate in conflict detection',()=>{
 const m=memo('正文',{references:['target']}),text=encode(m),base={'id-1':{fomoHash:contentHash(m),fileHash:digest(text),deleted:false}};
 assert.deepEqual(decode(text).references,['target']);assert.deepEqual(decode(encode(memo())).references,[]);
 const remote=encode({...m,references:['other']});assert.deepEqual(planSync({memos:[m]},[{path:'a.md',text:remote}],base).actions[0].metadata.references,['other']);
 assert.equal(planSync({memos:[{...m,references:['third']}]},[{path:'a.md',text:remote}],base).conflicts[0].reason,'both_changed');
 assert.throws(()=>decode(text.replace('["target"]','["id-1"]')),/引用元数据无效/);
 assert.equal(planSync({memos:[memo('正文',{annotationOf:'target'})]},[],{}).actions[0].type,'export');
});
test('annotation and reflection provenance roundtrip and detect conflicting edits',()=>{
 for(const m of [memo('批注',{annotationOf:'parent',source:'annotation'}),memo('联想',{relatedTo:'parent',source:'reflection'})]){
  const text=encode(m),parsed=decode(text);assert.equal(parsed.annotationOf,m.annotationOf);assert.equal(parsed.relatedTo,m.relatedTo);assert.equal(parsed.source,m.source);
  const base={'id-1':{fomoHash:contentHash(m),fileHash:digest(text),deleted:false}},remote=encode({...m,source:'direct'}),result=planSync({memos:[m]},[{path:'a.md',text:remote}],base);assert.equal(result.actions[0].metadata.source,'direct');
  assert.equal(planSync({memos:[{...m,content:'本地'}]},[{path:'a.md',text:remote}],base).conflicts[0].reason,'both_changed');
 }
 assert.equal(planSync({memos:[memo('旧',{legacyAnnotationId:'legacy'})]},[],{}).conflicts[0].reason,'rich_content_requires_review');
});
test('new note plans import or export without collisions',()=>{const {m,text}=setup();assert.equal(planSync({memos:[m]},[],{}).actions[0].type,'export');assert.equal(planSync({memos:[]},[{path:'a.md',text}],{}).actions[0].type,'import');assert.equal(planSync({memos:[m]},[{path:'a.md',text}],{}).actions[0].type,'adopt');assert.equal(planSync({memos:[memo('不同')]},[{path:'a.md',text}],{}).conflicts[0].reason,'untracked_collision');});
test('edits and deletions synchronize and simultaneous changes conflict',()=>{const {m,text,base}=setup();const file={path:'a.md',text};assert.equal(planSync({memos:[memo('本地更改')]},[file],base).actions[0].type,'export');assert.equal(planSync({memos:[m]},[{...file,text:encode(memo('远端更改'))}],base).actions[0].type,'update_fomo');assert.equal(planSync({memos:[m]},[],base).conflicts[0].reason,'missing_file_requires_confirmation');assert.equal(planSync({memos:[m]},[],base,[{eventId:'00000000-0000-4000-8000-000000000001',id:'id-1',fileHash:digest(text)}]).actions[0].type,'trash_fomo');assert.equal(planSync({memos:[memo('原文',{deleted:true})]},[file],base).actions[0].type,'trash_obsidian');assert.equal(planSync({memos:[memo('本地')]},[{...file,text:encode(memo('远端'))}],base).conflicts[0].reason,'both_changed');});
test('missing files need a receipt bound to the current baseline',()=>{const {m,text,base}=setup();for(const receipts of [['id-1'],[{id:'id-1',fileHash:digest('old')}],[{id:'other',fileHash:digest(text)}],[{id:'id-1',fileHash:'invalid'}]]){const result=planSync({memos:[m]},[],base,receipts);assert.deepEqual(result.actions,[]);assert.equal(result.conflicts[0].reason,'missing_file_requires_confirmation');}assert.throws(()=>planSync({memos:[m]},[],base,null),/删除凭据/);});
test('a consumed deletion event cannot authorize another deletion after restore',()=>{
 const {m,text,base}=setup(),eventId='00000000-0000-4000-8000-000000000001',receipt={eventId,id:m.id,fileHash:digest(text)};
 assert.equal(planSync({memos:[m]},[],base,[receipt],[]).actions[0].type,'trash_fomo');
 const replay=planSync({memos:[m]},[],base,[receipt],[eventId]);assert.deepEqual(replay.actions,[]);assert.equal(replay.conflicts[0].reason,'missing_file_requires_confirmation');
 assert.throws(()=>planSync({memos:[m]},[],base,[receipt],['broken']),/已处理删除记录无效/);
 assert.throws(()=>planSync({memos:[m]},[],base,[receipt],[eventId,eventId]),/已处理删除记录无效/);
});
test('deletion plans retain the exact event and reject ambiguous evidence',()=>{
 const {m,text,base}=setup(),first={eventId:'00000000-0000-4000-8000-000000000001',id:m.id,fileHash:digest(text)},second={...first,eventId:'00000000-0000-4000-8000-000000000002'};
 assert.deepEqual(planSync({memos:[m]},[],base,[first]).actions[0],{type:'trash_fomo',id:m.id,eventId:first.eventId});
 for(const receipts of [[first,first],[first,second],[first,{...first,id:'another'}],[first,{...first,fileHash:digest('different')}]]){const result=planSync({memos:[m]},[],base,receipts);assert.deepEqual(result.actions,[]);assert.equal(result.conflicts[0].reason,'ambiguous_deletion_receipt');}
 const deleted={...m,deleted:true};assert.equal(planSync({memos:[deleted]},[],base,[first]).actions[0].type,'adopt_deleted');for(const receipts of [[],[first,first],[first,second],[first,{...first,id:'another'}]])assert.deepEqual(planSync({memos:[deleted]},[],base,receipts).actions,[]);
});
test('duplicate identity and malformed files never get overwritten',()=>{const {m,text,base}=setup();const result=planSync({memos:[m]},[{path:'a.md',text},{path:'b.md',text},{path:'c.md',text:'other'}],base);assert.equal(result.actions.length,0);assert.deepEqual(result.conflicts.map(c=>c.reason),['duplicate','invalid']);});

test('Obsidian edits to rich Fomo notes require review rather than losing format or media',()=>{const m=memo('原文',{html:'<p>原文</p>',images:['data:image/png;base64,AA==']}),text=encode(m),base={'id-1':{fomoHash:contentHash(m),fileHash:digest(text),deleted:false}},result=planSync({memos:[m]},[{path:'a.md',text:encode({...m,content:'外部修改'})}],base);assert.equal(result.actions.length,0);assert.equal(result.conflicts[0].reason,'rich_content_requires_review');});
test('single-paragraph editor HTML is accepted only when it exactly matches the text',()=>{
 const m=memo('A & <B>',{html:'<p>A &amp; &lt;B&gt;</p>'}),text=encode(m),base={'id-1':{fomoHash:contentHash(m),fileHash:digest(text),deleted:false}};
 assert.equal(planSync({memos:[m]},[],{}).actions[0].type,'export');
 assert.equal(planSync({memos:[m]},[{path:'a.md',text:encode({...m,content:'新内容'})}],base).actions[0].type,'update_fomo');
 for(const unsafe of [{...m,html:'<p><strong>A</strong></p>'},{...m,html:'<p>其他正文</p>'},{...m,images:['attachment']}])assert.equal(planSync({memos:[unsafe]},[],{}).conflicts[0].reason,'rich_content_requires_review');
 assert.equal(planSync({memos:[m]},[{path:'a.md',text:encode({...m,content:'第一行\n第二行'})}],base).actions[0].type,'update_fomo');
 assert.equal(planSync({memos:[m]},[{path:'a.md',text:encode({...m,content:'包含\u0000控制符'})}],base).conflicts[0].reason,'rich_content_requires_review');
});
test('plain multiline modes preserve paragraph and hard-break structure',()=>{
 const {plainHtml,plainHtmlMode,hasUnsupportedDocument}=require('../desktop/obsidian-sync-plan.cjs');
 const text='第一行\n\n末行 & 内容',paragraphs=plainHtml(text,'paragraphs'),breaks=plainHtml(text,'breaks');
 assert.equal(paragraphs,'<p>第一行</p><p></p><p>末行 &amp; 内容</p>');assert.equal(breaks,'<p>第一行<br><br>末行 &amp; 内容</p>');
 assert.equal(plainHtmlMode({content:text,html:paragraphs}),'paragraphs');assert.equal(plainHtmlMode({content:text,html:breaks}),'breaks');assert.equal(hasUnsupportedDocument({content:text,html:'<p><strong>第一行</strong></p>'}),true);
 assert.equal(plainHtml('\n','breaks'),null);assert.equal(plainHtml('a\rb'),null);
});

test('file rename retains note identity and no destructive action',()=>{const {m,text,base}=setup();assert.deepEqual(planSync({memos:[m]},[{path:'renamed.md',text}],base),{actions:[],conflicts:[]});});
test('new rich notes and deleted notes colliding with files require review',()=>{const rich=memo('格式',{html:'<p><strong>格式</strong></p>'});assert.equal(planSync({memos:[rich]},[],{}).conflicts[0].reason,'rich_content_requires_review');assert.equal(planSync({memos:[memo('原文',{deleted:true})]},[{path:'a.md',text:encode(memo())}],{}).conflicts[0].reason,'untracked_collision');});
test('image-bearing metadata blocks synchronization until asset transactions are connected',()=>{const item=require('../desktop/obsidian-image-assets.cjs').imageDescriptor('data:image/png;base64,'+Buffer.from('89504e470d0a1a0a010203','hex').toString('base64')),m=memo(),text=encode(m).replace('fomo_created:', 'fomo_images: '+JSON.stringify([item])+'\nfomo_created:'),parsed=decode(text);assert.deepEqual(parsed.imageAssets,[item]);const plan=planSync({memos:[]},[{path:'a.md',text}],{});assert.equal(plan.conflicts[0].reason,'image_sync_not_ready');assert.equal(plan.actions.length,0);});

test('duplicate Fomo properties are rejected instead of overwritten',()=>{const {m,text,base}=setup();const bad=text.replace('fomo_id:', 'fomo_id: \"other\"\nfomo_id:'),result=planSync({memos:[m]},[{path:'a.md',text:bad}],base);assert.ok(result.conflicts.some(c=>c.reason==='invalid'));assert.equal(result.actions.length,0);});
