'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),Module=require('node:module'),path=require('node:path');
const orig=Module._load;
let lastPicker,lastImageViewer;class ItemView{} class Modal{constructor(app){this.app=app;}open(){lastImageViewer=this;}} class Plugin{set app(value){this._app=value;if(value?.fileManager?.trashFile&&!value.vault.trash)value.vault.trash=(file,system)=>{assert.equal(system,false);return value.fileManager.trashFile(file);};}get app(){return this._app;}} class PluginSettingTab{} class Setting{} class Notice{} class FuzzySuggestModal{constructor(){lastPicker=this;}setPlaceholder(){}open(){}} class TFile{constructor(path){this.path=path;}} class TFolder{constructor(path){this.path=path;}} const markdownRenderer={};
Module._load=function(request,...args){if(request==='obsidian')return {Plugin,ItemView,Modal,PluginSettingTab,Setting,Notice,MarkdownRenderer:markdownRenderer,TFile,TFolder,FuzzySuggestModal};return orig.call(this,request,...args);};
let PluginClass;try{PluginClass=require('../obsidian-plugin/fomo/main.js');}finally{Module._load=orig;}
test('plugin edits preserve imported source identities',()=>{const {encode,parse,updateIfUnchanged}=PluginClass._test,note={id:'a',created:'2026-01-01T00:00:00.000Z',content:'正文',sourceSlug:'source_123'},text=encode(note),parsed=parse(text);assert.equal(parsed.sourceSlug,'source_123');assert.equal(parse(updateIfUnchanged(text,parsed,'新正文')).sourceSlug,'source_123');});
test('imported links resolve unique source identities and reject ambiguous aliases',()=>{
 const {relationsForNotes}=PluginClass._test,source={id:'source',sourceSlug:'legacy_123',content:'原文'},child={id:'child',content:'https://example.invalid/mine/?memo_id=legacy_123 fomo://note/source'},r=relationsForNotes([source,child]);assert.deepEqual(r.out.get('child'),[source]);assert.deepEqual(r.incoming.get('source'),[child]);
 const duplicate={id:'other',sourceSlug:'legacy_123',content:'其他'},onlyLegacy={id:'ref',content:'https://example.invalid/mine/?memo_id=legacy_123'},ambiguous=relationsForNotes([source,duplicate,onlyLegacy]);assert.equal(ambiguous.out.has('ref'),false);assert.equal(ambiguous.incoming.has('source'),false);
});
test('plugin registers its view, commands and lifecycle refresh',async()=>{const plugin=new PluginClass(),calls=[];plugin.app={workspace:{getLeavesOfType:()=>[],getLeaf:()=>({setViewState:async()=>{}}),revealLeaf:()=>{}},vault:{on:(name,cb)=>({name,cb})}};plugin.loadData=async()=>null;plugin.registerView=(name,cb)=>calls.push(['view',name,cb]);plugin.addRibbonIcon=()=>{};plugin.addCommand=x=>calls.push(['command',x.id]);plugin.addSettingTab=()=>{};plugin.registerEvent=x=>calls.push(['event',x.name]);await plugin.onload();assert.equal(plugin.folder(),'Fomo');assert.equal(calls.find(x=>x[0]==='view')[1],'fomo-cards-view');assert.equal(calls.filter(x=>x[0]==='event').length,4);assert.ok(calls.some(x=>x[1]==='open-fomo'));});
test('view refresh ignores startup and unrelated folders, and coalesces scoped changes',async()=>{
 const plugin=new PluginClass();plugin.settings={folder:'Fomo'};let count=0;const workspace={layoutReady:false,getLeavesOfType:()=>[{view:{render:async()=>{count++;}}}]};plugin.app={workspace};const wait=()=>new Promise(resolve=>setTimeout(resolve,170));plugin.scheduleRefresh({path:'Fomo/start.md'});await wait();assert.equal(count,0);workspace.layoutReady=true;plugin.scheduleRefresh({path:'Other/n.md'});await wait();assert.equal(count,0);
 plugin.scheduleRefresh({path:'Fomo/a.md'});plugin.scheduleRefresh({path:'Fomo/b.md'});plugin.scheduleRefresh({path:'Other/moved.md'},'Fomo/moved.md');await wait();assert.equal(count,1);plugin.scheduleRefresh({path:'Fomo/a.md'});plugin.settings.folder='Other';await wait();assert.equal(count,1);plugin.scheduleRefresh({path:'Other/a.md'});await plugin.onunload();await wait();assert.equal(count,1);
});
test('view refreshes once after layout readiness and not after plugin unload',async()=>{
 const plugin=new PluginClass(),handlers={};let ready,count=0;plugin.app={workspace:{layoutReady:false,onLayoutReady:callback=>{ready=callback;},getLeavesOfType:()=>[{view:{render:async()=>{count++;}}}]},vault:{on:(name,callback)=>{handlers[name]=callback;return {name};}}};plugin.loadData=async()=>null;plugin.registerView=()=>{};plugin.addRibbonIcon=()=>{};plugin.addCommand=()=>{};plugin.addSettingTab=()=>{};plugin.registerEvent=()=>{};await plugin.onload();handlers.create({path:'Fomo/first.md'});handlers.create({path:'Fomo/second.md'});assert.equal(count,0);plugin.app.workspace.layoutReady=true;ready();await Promise.resolve();assert.equal(count,1);await plugin.onunload();ready();await Promise.resolve();assert.equal(count,1);
});

test('inline edits reject concurrent changes and preserve draft content',()=>{const {encode,parse,updateIfUnchanged}=PluginClass._test,original={id:'abc',created:'2026-01-01T00:00:00.000Z',content:'原文'},current=encode(original);assert.equal(parse(updateIfUnchanged(current,original,'新稿')).content,'新稿');assert.throws(()=>updateIfUnchanged(encode({...original,content:'另一处修改'}),original,'新稿'),/其他位置修改/);});
test('folding follows rendered height and panel resize',()=>{const {setupBodyFold}=PluginClass._test,old=globalThis.ResizeObserver;let callback,disconnected=false;globalThis.ResizeObserver=class{constructor(fn){callback=fn;}observe(){}disconnect(){disconnected=true;}};try{const classes=new Set(),body={scrollHeight:100,classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);}}},button={setText(value){this.text=value;},setAttribute(name,value){this[name]=value;}},card={createEl(){return button;}},observers=[];setupBodyFold(card,body,observers);assert.equal(button.hidden,true);body.scrollHeight=300;callback();assert.equal(button.hidden,false);assert.ok(classes.has('fomo-body-collapsed'));button.onclick();assert.equal(button.text,'收起');assert.equal(classes.has('fomo-body-collapsed'),false);body.scrollHeight=100;callback();assert.equal(button.hidden,true);observers[0].disconnect();assert.equal(disconnected,true);}finally{if(old===undefined)delete globalThis.ResizeObserver;else globalThis.ResizeObserver=old;}});
test('fold expansion survives a card refresh and remains scoped to its note',()=>{const {setupBodyFold}=PluginClass._test,expanded=new Set(),make=()=>{const classes=new Set(),body={scrollHeight:300,classList:{toggle(name,on){on?classes.add(name):classes.delete(name);}}},button={setText(value){this.text=value;},setAttribute(){}},card={createEl(_tag,options){button.text=options.text;return button;}};setupBodyFold(card,body,[],expanded,'note-a');return {button,classes};};const first=make();first.button.onclick();assert.equal(expanded.has('note-a'),true);const refreshed=make();assert.equal(refreshed.button.text,'收起');assert.equal(refreshed.classes.has('fomo-body-collapsed'),false);refreshed.button.onclick();assert.equal(expanded.has('note-a'),false);});
test('inline edits preserve explicit references and reject concurrent metadata changes',()=>{const {encode,parse,updateIfUnchanged}=PluginClass._test,note={id:'abc',created:'2026-01-01T00:00:00.000Z',content:'原文',references:['target']};assert.deepEqual(parse(updateIfUnchanged(encode(note),note,'新稿')).references,['target']);assert.throws(()=>updateIfUnchanged(encode({...note,references:['other']}),note,'新稿'),/其他位置修改/);});
test('inline drafts remain scoped to vault and folder and do not erase a newer draft',()=>{
 const {inlineDraftKey,readInlineDraft,clearInlineDraft}=PluginClass._test,values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)},vault=base=>({adapter:{getBasePath:()=>base}}),note={id:'same-id',created:'2026-01-01T00:00:00.000Z'},one=inlineDraftKey(vault('/vault-a'),'Fomo',note.id),otherVault=inlineDraftKey(vault('/vault-b'),'Fomo',note.id),otherFolder=inlineDraftKey(vault('/vault-a'),'Other',note.id);
 assert.notEqual(one,otherVault);assert.notEqual(one,otherFolder);assert.equal(inlineDraftKey({getName:()=> '同名知识库'},'Fomo',note.id),null);storage.setItem(one,JSON.stringify({...note,content:'第一份草稿'}));storage.setItem('fomo-cards-draft:'+note.id,JSON.stringify({...note,content:'旧版未限定草稿'}));assert.equal(readInlineDraft(storage,otherVault,note),null);assert.equal(readInlineDraft(storage,otherFolder,note),null);assert.equal(readInlineDraft(storage,one,note),'第一份草稿');storage.setItem(one,JSON.stringify({...note,content:'其他窗口的新草稿'}));clearInlineDraft(storage,one,note,'第一份草稿');assert.equal(readInlineDraft(storage,one,note),'其他窗口的新草稿');clearInlineDraft(storage,one,note,'其他窗口的新草稿');assert.equal(readInlineDraft(storage,one,note),null);assert.equal(readInlineDraft(storage,'fomo-cards-draft:'+note.id,note),'旧版未限定草稿');
});
test('starred metadata remains compatible and protects concurrent edits',()=>{const {encode,parse,updateIfUnchanged}=PluginClass._test,note={id:'abc',created:'2026-01-01T00:00:00.000Z',content:'原文',starred:true};assert.equal(parse(encode(note)).starred,true);assert.equal(parse(encode({...note,starred:false})).starred,undefined);assert.throws(()=>updateIfUnchanged(encode({...note,starred:false}),note,'新稿'),/其他位置修改/);assert.equal(parse(encode(note).replace('fomo_starred: true','fomo_starred: "yes"')),null);});
test('plugin preserves annotation and reflection provenance in edits and relationships',()=>{const {encode,parse,updateIfUnchanged,relationsForNotes}=PluginClass._test,note={id:'child',created:'2026-01-01T00:00:00.000Z',content:'批注',annotationOf:'parent',source:'annotation'},parent={id:'parent',content:'原笔记'};const edited=parse(updateIfUnchanged(encode(note),note,'修改'));assert.equal(edited.annotationOf,'parent');assert.equal(edited.source,'annotation');assert.deepEqual(relationsForNotes([edited,parent]).out.get('child').map(n=>n.id),['parent']);assert.throws(()=>updateIfUnchanged(encode({...note,annotationOf:'other'}),note,'新稿'),/其他位置修改/);});

test('plugin restricts its folder to a visible vault-relative path',()=>{const {validFolder}=PluginClass._test;assert.equal(validFolder('Fomo/子目录'),true);assert.equal(validFolder('Fomo/normal name'),true);for(const path of ['', '../private','.obsidian','Fomo/../private','/Fomo','Fomo\\..\\private','C:/private','Fomo/坏\u0000目录','Fomo/坏\n目录','Fomo/.. /private','Fomo/name.','Fomo/name ','Fomo/CON','Fomo/aux.md','Fomo/file?.md','Fomo/|bad'])assert.equal(validFolder(path),false,path);});
test('creating a note rejects a Windows traversal before accessing the vault',async()=>{const {CardsView}=PluginClass._test;let calls=0;const view=new CardsView({}, {folder:()=> 'Fomo\\..\\private'});view.editor={value:'草稿'};view.app={vault:{getAbstractFileByPath:()=>{calls++;return {};},create:async()=>{calls++;}}};await view.create();assert.equal(calls,0);assert.equal(view.editor.value,'草稿');});
test('vault compare and swap preserves a concurrent Obsidian edit',async()=>{const {encode,replaceIfUnchanged}=PluginClass._test;const note={id:'n',created:'2026-01-01T00:00:00.000Z',content:'旧'},before=encode(note),after=encode({...note,content:'Fomo 新版'});let current=before;const vault={process:async(_file,fn)=>{current=fn(current);}};await replaceIfUnchanged(vault,{},before,after);assert.equal(current,after);current=encode({...note,content:'Obsidian 并发修改'});await assert.rejects(replaceIfUnchanged(vault,{},before,after),/已变化/);assert.match(current,/Obsidian 并发修改/);});
test('scoped replacement rejects traversal, mismatched metadata and concurrent changes',async()=>{
 const {encode,replaceWithinFolder}=PluginClass._test,note={id:'n',created:'2026-01-01T00:00:00.000Z',content:'旧'},old=encode(note),next=encode({...note,content:'新'});
 const file=new TFile('Fomo/nested/n.md');let current=old,calls=0;const vault={getAbstractFileByPath:p=>p===file.path?file:null,process:async(f,fn)=>{assert.equal(f,file);calls++;current=fn(current);}};
 for(const rel of ['../outside.md','nested/../../outside.md','nested\\n.md','C:/x.md','.obsidian/x.md','n.txt'])await assert.rejects(replaceWithinFolder(vault,'Fomo',rel,old,next),/路径无效/);
 await assert.rejects(replaceWithinFolder(vault,'Fomo','nested/n.md',old,encode({...note,created:'2025-01-01T00:00:00.000Z'})),/内容无效/);
 assert.equal(calls,0);await replaceWithinFolder(vault,'Fomo','nested/n.md',old,next);assert.equal(current,next);
 await assert.rejects(replaceWithinFolder(vault,'Fomo','nested/n.md',old,next),/已变化/);assert.equal(current,next);
});
test('atomic replacement and registration refuse a moved file or switched sync folder',async()=>{
 const {encode,replaceWithinFolder,registerMarkdown}=PluginClass._test,created='2026-01-01T00:00:00.000Z',file=new TFile('Fomo/n.md'),old=encode({id:'n',created,content:'旧'}),next=encode({id:'n',created,content:'新'});let current=old,folder='Fomo',moved=false;
 const vault={getAbstractFileByPath:p=>!moved&&p===file.path?file:null,getMarkdownFiles:()=>[file],process:async(_file,fn)=>{moved=true;current=fn(current);}};
 await assert.rejects(replaceWithinFolder(vault,'Fomo','n.md',old,next),/不存在|移动/);assert.equal(current,old);
 moved=false;vault.process=async(_file,fn)=>{folder='Other';current=fn(current);};const guard=()=>{if(folder!=='Fomo')throw Error('同步文件夹已改变');};await assert.rejects(replaceWithinFolder(vault,'Fomo','n.md',old,next,guard),/文件夹已改变/);assert.equal(current,old);
 folder='Fomo';current='普通内容';const registered=encode({id:'new',created,content:current});await assert.rejects(registerMarkdown(vault,'Fomo','n.md',current,registered,guard),/文件夹已改变/);assert.equal(current,'普通内容');
});
test('registering ordinary Markdown preserves content and rejects existing metadata or concurrent edits',async()=>{
 const {registerMarkdown,encode}=PluginClass._test,file=new TFile('Fomo/n.md'),created='2026-01-01T00:00:00.000Z';let text='普通笔记\n第二行',writes=0;
 const vault={getAbstractFileByPath:p=>p===file.path?file:null,getMarkdownFiles:()=>[file],read:async()=>text,process:async(_file,fn)=>{text=fn(text);writes++;}};
 const replacement=encode({id:'new',created,content:text});await registerMarkdown(vault,'Fomo','n.md',text,replacement);assert.equal(text,replacement);assert.equal(writes,1);
 await assert.rejects(registerMarkdown(vault,'Fomo','n.md','---\ntitle: keep\n---\n内容',encode({id:'another',created,content:'---\ntitle: keep\n---\n内容'})),/身份信息无效/);
 await assert.rejects(registerMarkdown(vault,'Fomo','n.md','stale',encode({id:'another',created,content:'stale'})),/已变化/);assert.equal(text,replacement);
 await assert.rejects(registerMarkdown(vault,'Fomo','../n.md','a',encode({id:'another',created,content:'a'})),/路径无效/);
 const duplicate=new TFile('Fomo/duplicate.md');vault.getMarkdownFiles=()=>[file,duplicate];vault.read=async other=>other===duplicate?encode({id:'duplicate',created,content:'other'}):text;
 await assert.rejects(registerMarkdown(vault,'Fomo','n.md','x',encode({id:'duplicate',created,content:'x'})),/ID 已存在/);assert.equal(text,replacement);
});
test('registering and editing a YAML note preserves its custom properties',async()=>{
 const {registerMarkdown,encode,parse,updateIfUnchanged}=PluginClass._test,helper=require('../obsidian-plugin/fomo/frontmatter.cjs'),file=new TFile('Fomo/n.md'),created='2026-01-01T00:00:00.000Z',properties='# 保留\ntitle: 示例\ntags:\n  - 标签',original='---\n'+properties+'\n---\n正文';let current=original;const vault={getAbstractFileByPath:p=>p===file.path?file:null,getMarkdownFiles:()=>[file],read:async()=>current,process:async(_file,fn)=>{current=fn(current);}};
 const replacement=encode({id:'new',created,content:'正文'},helper.parseDocument(original));await registerMarkdown(vault,'Fomo','n.md',original,replacement);assert.ok(current.includes(properties));const note=parse(current);current=updateIfUnchanged(current,note,'新正文');assert.ok(current.includes(properties));assert.equal(parse(current).content,'新正文');
});
test('image asset creation reuses matching bytes and refuses collisions',async()=>{
 const {ensureImageAsset}=PluginClass._test,bytes=Buffer.from('89504e470d0a1a0a010203','hex'),data='data:image/png;base64,'+bytes.toString('base64'),entries=new Map([['Fomo',new TFolder('Fomo')]]),contents=new Map();let creates=0;
 const vault={getAbstractFileByPath:p=>entries.get(p)||null,createFolder:async p=>entries.set(p,new TFolder(p)),createBinary:async(p,array)=>{assert.equal(entries.has(p),false);creates++;const file=new TFile(p);entries.set(p,file);contents.set(p,Buffer.from(array));return file;},readBinary:async file=>contents.get(file.path)};
 const first=await ensureImageAsset(vault,'Fomo',data),second=await ensureImageAsset(vault,'Fomo',data);assert.equal(first.created,true);assert.equal(second.created,false);assert.equal(creates,1);const target='Fomo/'+first.descriptor.path;assert.deepEqual(contents.get(target),bytes);const changed=Buffer.from('89504e470d0a1a0a999999','hex');contents.set(target,changed);await assert.rejects(ensureImageAsset(vault,'Fomo',data),/变化|不匹配/);assert.equal(creates,1);assert.deepEqual(contents.get(target),changed);await assert.rejects(ensureImageAsset(vault,'../outside',data),/专用文件夹无效/);
});
test('attachment operations stop when the dedicated folder changes or the file moves',async()=>{
 const {ensureImageAsset,readImageAsset}=PluginClass._test,bytes=Buffer.from('89504e470d0a1a0a010203','hex'),data='data:image/png;base64,'+bytes.toString('base64'),descriptor=require('../obsidian-plugin/fomo/image-assets.cjs').imageDescriptor(data),root=new TFolder('Fomo'),directory=new TFolder('Fomo/Fomo-assets'),file=new TFile('Fomo/'+descriptor.path),entries=new Map([['Fomo',root]]);let folder='Fomo',writes=0;
 const guard=()=>{if(folder!=='Fomo')throw Error('同步文件夹已改变');},vault={getAbstractFileByPath:p=>entries.get(p)||null,createFolder:async()=>{entries.set(directory.path,directory);folder='Other';},createBinary:async()=>{writes++;},readBinary:async()=>bytes};
 await assert.rejects(ensureImageAsset(vault,'Fomo',data,guard),/文件夹已改变/);assert.equal(writes,0);
 folder='Fomo';entries.set(file.path,file);vault.readBinary=async()=>{folder='Other';return bytes;};await assert.rejects(readImageAsset(vault,'Fomo',descriptor,guard),/文件夹已改变/);
 folder='Fomo';vault.readBinary=async()=>{entries.delete(file.path);file.path='Other/moved.png';return bytes;};await assert.rejects(readImageAsset(vault,'Fomo',descriptor,guard),/附件已移动/);
});
test('image metadata survives edits and cards only render verified files',async()=>{
 const {encode,parse,updateIfUnchanged,renderImageAssets}=PluginClass._test,helper=require('../obsidian-plugin/fomo/image-assets.cjs'),bytes=Buffer.from('89504e470d0a1a0a010203','hex'),data='data:image/png;base64,'+bytes.toString('base64'),descriptor=helper.imageDescriptor(data),note={id:'n',created:'2026-01-01T00:00:00.000Z',content:'正文',imageAssets:[descriptor]};const parsed=parse(encode(note));assert.deepEqual(parsed.imageAssets,[descriptor]);assert.deepEqual(parse(updateIfUnchanged(encode(note),parsed,'修改')).imageAssets,[descriptor]);assert.equal(parse(encode(note).replace(descriptor.sha256,'0'.repeat(64))),null);
 const root=new TFolder('Fomo'),file=new TFile('Fomo/'+descriptor.path),vault={getAbstractFileByPath:p=>p==='Fomo'?root:p===file.path?file:null,readBinary:async()=>bytes},nodes=[],card={createDiv:()=>({createEl:(tag,opts)=>nodes.push({tag,...opts}),createDiv:opts=>nodes.push(opts)})};await renderImageAssets(card,parsed,vault,'Fomo');assert.equal(nodes[0].tag,'img');assert.equal(nodes[0].attr.src,data);vault.readBinary=async()=>Buffer.from('89504e470d0a1a0a998877','hex');nodes.length=0;await renderImageAssets(card,parsed,vault,'Fomo');assert.equal(nodes[0].cls,'fomo-image-unavailable');
});
test('oversized replacement is rejected before reading the attachment',async()=>{const {readImageAsset}=PluginClass._test,bytes=Buffer.from('89504e470d0a1a0a010203','hex'),data='data:image/png;base64,'+bytes.toString('base64'),descriptor=require('../obsidian-plugin/fomo/image-assets.cjs').imageDescriptor(data),root=new TFolder('Fomo'),file=new TFile('Fomo/'+descriptor.path);file.stat={size:100*1024*1024};let reads=0;const vault={getAbstractFileByPath:p=>p==='Fomo'?root:p===file.path?file:null,readBinary:async()=>{reads++;return bytes;}};await assert.rejects(readImageAsset(vault,'Fomo',descriptor),/大小已变化/);assert.equal(reads,0);});
test('verified images open their own position including duplicate attachments',async()=>{
 const {renderImageAssets}=PluginClass._test,bytes=Buffer.from('89504e470d0a1a0a010203','hex'),data='data:image/png;base64,'+bytes.toString('base64'),descriptor=require('../obsidian-plugin/fomo/image-assets.cjs').imageDescriptor(data),root=new TFolder('Fomo'),file=new TFile('Fomo/'+descriptor.path),vault={getAbstractFileByPath:p=>p==='Fomo'?root:p===file.path?file:null,readBinary:async()=>bytes},nodes=[],card={createDiv:()=>({createEl(){const element={setAttribute(){}};nodes.push(element);return element;},createDiv(){}})},app={};
 await renderImageAssets(card,{imageAssets:[descriptor,descriptor]},vault,'Fomo',()=>true,app);assert.equal(nodes.length,2);nodes[1].onclick();assert.equal(lastImageViewer.index,1);assert.deepEqual(lastImageViewer.images,[data,data]);let prevented=false;nodes[0].onkeydown({key:'Enter',preventDefault(){prevented=true;}});assert.equal(lastImageViewer.index,0);assert.equal(prevented,true);let handler,removed=false;lastImageViewer.modalEl={addEventListener(_event,fn){handler=fn;},removeEventListener(_event,fn){removed=fn===handler;}};lastImageViewer.contentEl={addClass(){},empty(){},createEl(){return {};},createDiv(){return {createEl(){return {};}};}};lastImageViewer.onOpen();handler({key:'ArrowLeft',preventDefault(){}});assert.equal(lastImageViewer.index,1);handler({key:'ArrowRight',preventDefault(){}});assert.equal(lastImageViewer.index,0);lastImageViewer.onClose();assert.equal(removed,true);
});
test('references and backlinks use stable identities and reject ambiguous duplicates',()=>{
 const {relationsForNotes}=PluginClass._test;
 const a={id:'a',content:'fomo://note/b writeboom://note/b memo-flow://note/c fomo://note/missing'},b={id:'b',content:'fomo://note/a'},c={id:'c',content:''},duplicate={id:'c',content:'same id'};
 const relations=relationsForNotes([a,b,c,duplicate]);
 assert.deepEqual(relations.out.get('a').map(n=>n.id),['b']);assert.deepEqual(relations.incoming.get('b').map(n=>n.id),['a']);
 assert.deepEqual(relations.incoming.get('a').map(n=>n.id),['b']);assert.equal(relations.out.has('c'),false);
 const metadata=relationsForNotes([{...a,content:'普通文本',references:['b']},b]);assert.deepEqual(metadata.out.get('a').map(n=>n.id),['b']);
});
test('a relation button opens the matching vault file',()=>{
 const {relationsForNotes,renderRelations}=PluginClass._test,a={id:'a',content:'fomo://note/b',created:'2026-01-01T00:00:00.000Z'},b={id:'b',content:'#标签 目标正文',created:'2026-01-02T00:00:00.000Z',file:{path:'Fomo/renamed.md'}};
 const buttons=[],card={createDiv:()=>({createEl:(tag,opts)=>{const node={tag,...opts};if(tag==='button')buttons.push(node);return node;}})};let opened;const app={workspace:{getLeaf:()=>({openFile:file=>{opened=file;}})}};
 renderRelations(card,a,relationsForNotes([a,b]),app);assert.equal(buttons.length,1);assert.match(buttons[0].text,/目标正文/);assert.doesNotMatch(buttons[0].text,/#标签/);buttons[0].onclick();assert.equal(opened,b.file);
});
test('Obsidian links resolve to unique Fomo notes without including outside files',()=>{
 const {relationsForNotes}=PluginClass._test,a={id:'a',content:'[[目标#标题|别名]]',file:{path:'Fomo/a.md'}},b={id:'b',content:'正文',file:{path:'Fomo/目标.md'}},outside={path:'Private/secret.md'},seen=[];
 const getLinks=file=>file===a.file?[{link:'目标#标题'},{link:'目标'},{link:'secret'},{link:'missing'}]:[],resolve=(link,source)=>{seen.push([link,source]);return link==='目标'?b.file:link==='secret'?outside:null;};
 const relations=relationsForNotes([a,b],resolve,getLinks);assert.deepEqual(relations.out.get('a').map(n=>n.id),['b']);assert.deepEqual(relations.incoming.get('b').map(n=>n.id),['a']);assert.deepEqual(seen[0],['目标','Fomo/a.md']);
 const duplicate={...b,file:{path:'Fomo/other.md'}};assert.equal(relationsForNotes([a,b,duplicate],resolve,getLinks).out.has('a'),false);
});
test('inline reference labels omit tags and limit the excerpt by characters',()=>{
 const {referenceLabel}=PluginClass._test,note={created:'2026-01-02T00:00:00.000Z',content:'#标签 正文😀一二三四五六七八九十十一十二十三十四十五十六十七十八十九二十 后续'};const label=referenceLabel(note);assert.match(label,/^↗ /);assert.ok(!label.includes('#标签'));assert.ok(label.includes('正文😀'));assert.equal(Array.from(label.split(' ').slice(2).join(' ')).length,20);
});
test('inline references open only a unique target and preserve unknown links and code',()=>{
 const {renderInlineReferences}=PluginClass._test,target={id:'a',created:'2026-01-02T00:00:00.000Z',content:'#标签 目标正文',file:{path:'Fomo/a.md'}},source={nodeValue:'前 fomo://note/a 后 fomo://note/missing',parentElement:{closest:()=>false},replaceWith(value){this.replacement=value;}},code={nodeValue:'fomo://note/a',parentElement:{closest:()=>true},replaceWith(){throw Error('code must not change');}};let opened;
 const doc={createElement:()=>({setAttribute(){}}),createTextNode:text=>({text}),createDocumentFragment:()=>({children:[],append(...nodes){this.children.push(...nodes);}}),createTreeWalker:()=>{const nodes=[source,code];return {currentNode:null,nextNode(){this.currentNode=nodes.shift();return !!this.currentNode;}};}};
 const body={ownerDocument:doc,querySelectorAll:()=>[]},app={workspace:{getLeaf:()=>({openFile:file=>{opened=file;}})}};renderInlineReferences(body,[target],app);assert.equal(source.replacement.children[0].text,'前 ');const button=source.replacement.children[1];assert.match(button.textContent,/目标正文/);button.onclick();assert.equal(opened,target.file);assert.equal(source.replacement.children[2].text,' 后 fomo://note/missing');
 source.replacement=null;renderInlineReferences(body,[target,{...target,file:{path:'Fomo/duplicate.md'}}],app);assert.equal(source.replacement,null);
});
test('daily review uses the desktop selection for the local calendar day',()=>{
 const {dailyNotes}=PluginClass._test,Core=require('../dist/core.js'),date=new Date(2026,10,7,23,59),notes=Array.from({length:35},(_,i)=>({id:'note-'+i}));
 const selected=dailyNotes(notes,date);assert.equal(selected.length,8);assert.deepEqual(selected,Core.daily(notes,'2026-11-07',8));
 assert.deepEqual(dailyNotes([...notes].reverse(),date),selected);assert.deepEqual(dailyNotes(notes,date,4),selected.slice(0,4));assert.equal(notes[0].id,'note-0');
});
test('daily review excludes today and filters before selecting the daily sample',()=>{
 const {reviewNotes}=PluginClass._test,Core=require('../dist/core.js'),date=new Date(2026,10,7,10,0),old=new Date(2026,10,6,12).toISOString(),today=new Date(2026,10,7,1).toISOString(),future=new Date(2026,10,8,1).toISOString(),notes=Array.from({length:20},(_,i)=>({id:'note-'+i,created:old,content:i%2?'工作 计划':'生活 记录',starred:i%3===0}));notes.push({id:'today',created:today,content:'工作 计划',starred:true},{id:'future',created:future,content:'工作 计划',starred:true});
 const eligible=notes.filter(note=>note.created===old&&note.starred&&note.content.includes('工作')&&note.content.includes('计划'));assert.deepEqual(reviewNotes(notes,date,'计划 工作',true),Core.daily(eligible,'2026-11-07',8));assert.equal(reviewNotes(notes,date,'不存在',false).length,0);assert.equal(reviewNotes(notes,date,'',false).some(note=>note.id==='today'||note.id==='future'),false);
});
test('review scope supports Fomo-style counts, dates, and hierarchical tags',()=>{
 const {reviewNotes,reviewTags,reviewOptions}=PluginClass._test,Core=require('../dist/core.js'),date=new Date(2026,10,7,12),recent=new Date(2026,9,10,12).toISOString(),older=new Date(2026,5,1,12).toISOString(),notes=[{id:'a',created:recent,content:'#工作/项目 已完成'},{id:'b',created:recent,content:'无标签 https://example.com/#fragment'},{id:'c',created:older,content:'#工作/长期'},{id:'d',created:recent,content:'#工作/排除'}];
 for(const note of notes)assert.deepEqual(reviewTags(note.content),Core.tagsOf(note.content));assert.deepEqual(reviewNotes(notes,date,'',false,{period:'3',include:'工作',exclude:'工作/排除'}).map(n=>n.id),['a']);assert.deepEqual(reviewNotes(notes,date,'',false,{noTags:true}).map(n=>n.id),['b']);assert.equal(reviewOptions({count:999,period:'bad'}).count,8);assert.equal(reviewOptions({count:999,period:'bad'}).period,'all');
 const many=Array.from({length:20},(_,i)=>({id:'n-'+i,created:recent,content:'文本'}));assert.equal(reviewNotes(many,date,'',false,{count:4}).length,4);assert.equal(reviewNotes(many,date,'',false,{count:12}).length,12);
});
test('review settings save independently without dropping concurrent options',async()=>{
 const plugin=new PluginClass();plugin.settings={folder:'Fomo'};plugin.settingsWrites=Promise.resolve();plugin.saveData=async()=>{};plugin.app={workspace:{getLeavesOfType:()=>[]}};await Promise.all([plugin.updateReviewOption('count',12),plugin.updateReviewOption('period','3'),plugin.updateReviewOption('include','#工作/项目/')]);assert.equal(plugin.settings.reviewOptions.count,12);assert.equal(plugin.settings.reviewOptions.period,'3');assert.equal(plugin.settings.reviewOptions.include,'工作/项目');await assert.rejects(plugin.updateReviewOption('count',100),/无效/);await assert.rejects(plugin.updateReviewOption('include','工作 invalid'),/无效/);assert.equal(plugin.settings.reviewOptions.count,12);
});
test('review progress persists per dedicated folder without losing concurrent marks',async()=>{
 const {reviewDay,reviewedIds}=PluginClass._test,day=reviewDay(new Date()),plugin=new PluginClass();let persisted;plugin.settings={folder:'Fomo'};plugin.settingsWrites=Promise.resolve();plugin.saveData=async data=>{persisted=structuredClone(data);};
 await Promise.all([plugin.markReviewed('note-1','Fomo',day),plugin.markReviewed('note-2','Fomo',day),plugin.markReviewed('note-1','Fomo',day)]);assert.deepEqual(reviewedIds(persisted,'Fomo',day),['note-1','note-2']);assert.deepEqual(reviewedIds(persisted,'Other',day),[]);assert.deepEqual(reviewedIds(persisted,'Fomo','2000-01-01'),[]);
 await assert.rejects(plugin.markReviewed('note-3','Other',day),/文件夹已变化/);await assert.rejects(plugin.markReviewed('note-3','Fomo','2000-01-01'),/日期或笔记已变化/);assert.deepEqual(reviewedIds(plugin.settings,'Fomo',day),['note-1','note-2']);
 plugin.saveData=async()=>{throw Error('写入失败');};await assert.rejects(plugin.markReviewed('note-3','Fomo',day),/写入失败/);assert.deepEqual(reviewedIds(plugin.settings,'Fomo',day),['note-1','note-2']);
});
test('review snapshots expose only requested unique identities in the dedicated folder',async()=>{
 const {reviewDay,encode}=PluginClass._test,day=reviewDay(new Date()),created='2026-01-01T00:00:00.000Z',a=new TFile('Fomo/a.md'),b=new TFile('Fomo/b.md'),outside=new TFile('Other/c.md'),files=[a,b,outside],content=new Map([[a,encode({id:'a',created,content:'一'})],[b,encode({id:'b',created,content:'二'})],[outside,encode({id:'c',created,content:'外部'})]]),plugin=new PluginClass();plugin.settings={folder:'Fomo'};plugin.settingsWrites=Promise.resolve();plugin.saveData=async()=>{};plugin.app={vault:{getMarkdownFiles:()=>files,getAbstractFileByPath:p=>files.find(file=>file.path===p)||null,read:async file=>content.get(file)}};
 await plugin.markReviewed('a','Fomo',day);await plugin.markReviewed('b','Fomo',day);await plugin.markReviewed('c','Fomo',day);assert.deepEqual(await plugin.reviewSnapshot('Fomo',[{id:'a',created}]),{[day]:['a']});await assert.rejects(plugin.reviewSnapshot('Fomo',[{id:'c',created}]),/身份已变化/);await assert.rejects(plugin.reviewSnapshot('Fomo',[{id:'a',created:'2025-01-01T00:00:00.000Z'}]),/身份已变化/);
 const requested=[{id:'a',created}],progress={'2026-01-02':['a']};await Promise.all([plugin.mergeReviewProgress('Fomo',requested,progress),plugin.markReviewed('b','Fomo',day)]);await plugin.mergeReviewProgress('Fomo',requested,progress);assert.deepEqual(await plugin.reviewSnapshot('Fomo',requested),{ '2026-01-02':['a'],[day]:['a'] });assert.ok(PluginClass._test.reviewedIds(plugin.settings,'Fomo',day).includes('c'));await assert.rejects(plugin.mergeReviewProgress('Fomo',requested,{'2026-01-02':['b']}),/格式无效/);
 const duplicate=new TFile('Fomo/duplicate.md');files.push(duplicate);content.set(duplicate,content.get(a));await assert.rejects(plugin.reviewSnapshot('Fomo',[{id:'a',created}]),/身份已变化/);
});
test('review action shows and saves the per-vault status',async()=>{
 const {reviewDay,renderReviewAction}=PluginClass._test,day=reviewDay(new Date()),plugin=new PluginClass();plugin.settings={folder:'Fomo'};plugin.settingsWrites=Promise.resolve();plugin.saveData=async()=>{};let refreshed=0,buttons=[];const card={createDiv:()=>({createEl:(_tag,options)=>{const button={text:options.text,attrs:options.attr};buttons.push(button);return button;}})},view={plugin,editing:false,render:async()=>{refreshed++;}};
 renderReviewAction(card,{id:'note'},view,day);assert.equal(buttons[0].text,'标记已回顾');assert.equal(buttons[1].text,'写下联想');await buttons[0].onclick();assert.equal(refreshed,1);buttons=[];renderReviewAction(card,{id:'note'},view,day);assert.equal(buttons[0].text,'已回顾');assert.equal(buttons[0].disabled,true);
});
test('review reflections create a linked Fomo note and refuse a moved or replaced source',async()=>{
 const {CardsView,encode,parse}=PluginClass._test,created='2026-01-01T00:00:00.000Z',file=new TFile('Fomo/source.md'),note={id:'source',created,content:'原文',file};let folder='Fomo',text=encode(note),createdFile;
 const view=new CardsView({}, {folder:()=>folder});view.app={vault:{getAbstractFileByPath:p=>p===file.path?file:null,read:async()=>text,create:async(path,content)=>{createdFile={path,content};}}};
 const id=await view.createReflection(note,'Fomo','  新联想  '),saved=parse(createdFile.content),desktopNote=require('../desktop/obsidian-sync-plan.cjs').decode(createdFile.content);assert.equal(createdFile.path,`Fomo/${id}.md`);assert.equal(saved.content,'新联想');assert.equal(saved.relatedTo,'source');assert.equal(saved.source,'reflection');assert.equal(desktopNote.relatedTo,'source');assert.equal(desktopNote.source,'reflection');
 createdFile=null;text=encode({...note,id:'other'});await assert.rejects(view.createReflection(note,'Fomo','草稿'),/来源已变化/);assert.equal(createdFile,null);text=encode(note);view.app.vault.read=async()=>{folder='Other';return text;};await assert.rejects(view.createReflection(note,'Fomo','草稿'),/来源已变化/);assert.equal(createdFile,null);
});
test('a failed reflection save keeps its editor and scoped draft for retry',async()=>{
 const {CardsView}=PluginClass._test,values=new Map(),previous=global.localStorage;global.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};
 try{const note={id:'source',created:'2026-01-01T00:00:00.000Z'},view=new CardsView({}, {folder:()=> 'Fomo'});view.app={vault:{adapter:{getBasePath:()=>'/isolated-vault'}}};view.createReflection=async()=>{throw Error('写入失败');};const elements=[],card={createEl:()=>{const e={value:'',focus:()=>{},remove:()=>{}};elements.push(e);return e;},createDiv:()=>({createEl:(_tag,options)=>{const e={text:options.text};elements.push(e);return e;},remove:()=>{}})};view.openReflection(card,note,'Fomo');const [editor,,save]=elements;editor.value='未保存的联想';editor.oninput();await save.onclick();assert.equal(editor.value,'未保存的联想');assert.equal(editor.readOnly,false);assert.equal(save.disabled,false);assert.ok([...values.values()].some(value=>JSON.parse(value).content==='未保存的联想'));assert.equal(view.editing,true);}finally{global.localStorage=previous;}
});
test('reflection retries reuse the draft identity after a lost create acknowledgement',async()=>{
 const {CardsView,encode}=PluginClass._test,created='2026-01-01T00:00:00.000Z',file=new TFile('Fomo/source.md'),note={id:'source',created,content:'原文',file},identity={id:'reflection-1',created:'2026-01-02T00:00:00.000Z'},records=new Map([[file.path,{file,text:encode(note)}]]);let creates=0;
 const view=new CardsView({}, {folder:()=> 'Fomo'});view.app={vault:{getAbstractFileByPath:p=>records.get(p)?.file||null,read:async item=>records.get(item.path).text,create:async(path,text)=>{creates++;records.set(path,{file:new TFile(path),text});throw Error('回执丢失');}}};
 assert.equal(await view.createReflection(note,'Fomo','新联想',identity),'reflection-1');assert.equal(await view.createReflection(note,'Fomo','新联想',identity),'reflection-1');assert.equal(creates,1);assert.equal(records.size,2);await assert.rejects(view.createReflection(note,'Fomo','不同内容',identity),/内容不一致/);assert.equal(creates,1);
});
test('starred filter combines with search without mutating notes',()=>{const {filterNotes}=PluginClass._test,notes=[{content:'Alpha #工作',starred:true},{content:'alpha 其他',starred:false},{content:'Beta',starred:true}];assert.deepEqual(filterNotes(notes,'ALPHA',true),[notes[0]]);assert.deepEqual(filterNotes(notes,' #工作 ',false),[notes[0]]);assert.equal(notes.length,3);});
test('a stale asynchronous card render cannot overwrite the latest filtered list',async()=>{
 const {CardsView,encode}=PluginClass._test,created='2026-01-01T00:00:00.000Z',file=new TFile('Fomo/n.md'),view=new CardsView({}, {folder:()=> 'Fomo'}),children=[];let release,started;
 const began=new Promise(resolve=>{started=resolve;});markdownRenderer.render=()=>{started();return new Promise(resolve=>{release=resolve;});};
 const makeNode=()=>({createDiv:()=>makeNode(),createEl:()=>({setAttribute(){}})});view.list={empty(){children.length=0;},createDiv(options){children.push(options.cls);return makeNode();}};view.count={setText(){}};view.app={vault:{getMarkdownFiles:()=>[file],cachedRead:async()=>encode({id:'n',created,content:'正文'})}};
 const first=view.render();await began;view.filter='无匹配';await view.render();assert.deepEqual(children,['fomo-empty']);release();await first;assert.deepEqual(children,['fomo-empty']);delete markdownRenderer.render;
});
test('legacy inline drafts require explicit recovery and moved notes cannot be overwritten',async t=>{
 const oldStorage=globalThis.localStorage,oldWindow=globalThis.window,values=new Map(),storage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};globalThis.localStorage=storage;globalThis.window={confirm:()=>true};t.after(()=>{if(oldStorage===undefined)delete globalThis.localStorage;else globalThis.localStorage=oldStorage;if(oldWindow===undefined)delete globalThis.window;else globalThis.window=oldWindow;delete markdownRenderer.render;});
 const {CardsView,encode,inlineDraftKey}=PluginClass._test,created='2026-01-01T00:00:00.000Z',note={id:'n',created,content:'正文'},file=new TFile('Fomo/n.md'),view=new CardsView({}, {folder:()=> 'Fomo'}),nodes=[];storage.setItem('fomo-cards-draft:n',JSON.stringify({...note,content:'旧版草稿'}));markdownRenderer.render=async()=>{};
 const node=()=>({before(){},ownerDocument:{createTreeWalker:()=>({nextNode:()=>false})},querySelectorAll:()=>[],createDiv:()=>node(),createEl:(tag,options={})=>{const item={tag,text:options.text,value:'',setAttribute(){},focus(){},remove(){},after(){}};nodes.push(item);return item;}});view.list={empty(){},createDiv:()=>node()};view.count={setText(){}};const vault={adapter:{getBasePath:()=>'/vault-a'},getMarkdownFiles:()=>[file],getAbstractFileByPath:p=>p===file.path?file:null,cachedRead:async()=>encode(note),process:async(_file,fn)=>fn(encode(note))};view.app={vault};await view.render();nodes.find(n=>n.text==='编辑').onclick();const editor=nodes.find(n=>n.tag==='textarea');assert.equal(editor.value,'正文');nodes.find(n=>n.text==='取回旧草稿').onclick();assert.equal(editor.value,'旧版草稿');assert.ok(storage.getItem(inlineDraftKey(vault,'Fomo','n')));file.path='Other/n.md';await nodes.find(n=>n.text==='保存').onclick();assert.equal(view.editing,true);assert.equal(editor.value,'旧版草稿');assert.equal(editor.readOnly,false);
});
test('reference picker limits targets to unique Fomo notes and inserts at the captured selection',async()=>{
 const {encode,loadReferenceCandidates,insertReference}=PluginClass._test,created='2026-01-01T00:00:00.000Z',files=['Fomo/a.md','Fomo/b.md','Fomo/dup.md','Other/secret.md'].map(path=>({path}));
 const texts={'Fomo/a.md':encode({id:'a',created,content:'first'}),'Fomo/b.md':encode({id:'b',created,content:'second'}),'Fomo/dup.md':encode({id:'b',created,content:'duplicate'}),'Other/secret.md':encode({id:'secret',created,content:'outside'})};
 const candidates=await loadReferenceCandidates({getMarkdownFiles:()=>files,cachedRead:async file=>texts[file.path]},'Fomo');assert.deepEqual(candidates.map(note=>note.id),['a']);
 let emitted=false,focused=false;const editor={value:'hello world',setRangeText(text,start,end){this.value=this.value.slice(0,start)+text+this.value.slice(end);},dispatchEvent(event){emitted=event.type==='input';},focus(){focused=true;}};
 insertReference(editor,candidates[0],{value:'hello world',start:6,end:11});assert.equal(editor.value,'hello fomo://note/a');assert.ok(emitted&&focused);
 assert.throws(()=>insertReference(editor,candidates[0],{value:'hello world',start:0,end:0}),/草稿已变化/);assert.equal(editor.value,'hello fomo://note/a');
});
test('inline reference picker excludes the current note and updates its draft',async()=>{
 const {CardsView,encode}=PluginClass._test,created='2026-01-01T00:00:00.000Z',files=[{path:'Fomo/self.md'},{path:'Fomo/target.md'}],texts={'Fomo/self.md':encode({id:'self',created,content:'self'}),'Fomo/target.md':encode({id:'target',created,content:'目标'})};
 const view=new CardsView({}, {folder:()=> 'Fomo'});view.editing=true;view.app={vault:{getMarkdownFiles:()=>files,cachedRead:async file=>texts[file.path]}};view.editor={};let events=0;
 const editor={value:'草稿',selectionStart:2,selectionEnd:2,isConnected:true,setRangeText(value,start,end){this.value=this.value.slice(0,start)+value+this.value.slice(end);},dispatchEvent(){events++;},focus(){}};
 await view.chooseReference(editor,'self');assert.deepEqual(lastPicker.getItems().map(note=>note.id),['target']);await lastPicker.onSelect(lastPicker.getItems()[0]);assert.equal(editor.value,'草稿fomo://note/target');assert.equal(events,1);
});
test('creating a note preserves typing during save and ignores duplicate submissions',async()=>{
 const {CardsView,parse}=PluginClass._test;let release,writes=0,saved='';const pending=new Promise(resolve=>{release=resolve;});
 const view=new CardsView({}, {folder:()=> 'Fomo'});view.editor={value:'原稿'};view.render=async()=>{};
 view.app={vault:{getAbstractFileByPath:p=>p==='Fomo'?{}:null,create:async(_path,text)=>{writes++;saved=text;await pending;}}};
 const first=view.create();await Promise.resolve();view.editor.value='原稿 后续输入';await view.create();assert.equal(writes,1);release();await first;
 assert.equal(parse(saved).content,'原稿');assert.equal(view.editor.value,'原稿 后续输入');
});
test('composer drafts survive reopening, stay scoped to the vault, and keep typing during save',async t=>{
 const original=globalThis.localStorage,values=new Map();globalThis.localStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value),removeItem:key=>values.delete(key)};t.after(()=>{if(original===undefined)delete globalThis.localStorage;else globalThis.localStorage=original;});
 const {CardsView}=PluginClass._test;let folder='Fomo',release;const vault={adapter:{getBasePath:()=>'/vault-one'},getAbstractFileByPath:p=>p==='Fomo'?{}:null,create:async()=>new Promise(resolve=>{release=resolve;})},view=new CardsView({}, {folder:()=>folder});view.app={vault};view.editor={value:''};view.render=async()=>{};view.loadComposerDraft();view.editor.value='未提交';view.saveComposerDraft();
 const reopened=new CardsView({}, {folder:()=>folder});reopened.app={vault};reopened.editor={value:''};reopened.loadComposerDraft();assert.equal(reopened.editor.value,'未提交');const other=new CardsView({}, {folder:()=>folder});other.app={vault:{adapter:{getBasePath:()=>'/vault-two'}}};other.editor={value:''};other.loadComposerDraft();assert.equal(other.editor.value,'');
 const pending=view.create();await Promise.resolve();view.editor.value='未提交 后续';view.saveComposerDraft();release();await pending;assert.equal(view.editor.value,'未提交 后续');reopened.editor.value='';reopened.loadComposerDraft();assert.equal(reopened.editor.value,'未提交 后续');assert.equal(reopened.composerIdentity.id,view.composerIdentity.id);
 folder='另一个目录';await view.create();assert.equal(view.editor.value,'未提交 后续');assert.equal(values.size,1);
});
test('failed creation keeps the draft and allows a retry',async()=>{
 const {CardsView}=PluginClass._test;let attempts=0;const view=new CardsView({}, {folder:()=> 'Fomo'});view.editor={value:'未保存草稿'};view.render=async()=>{};
 view.app={vault:{getAbstractFileByPath:p=>p==='Fomo'?{}:null,create:async()=>{if(++attempts===1)throw Error('disk error');}}};
 await view.create();assert.equal(view.editor.value,'未保存草稿');assert.equal(view.creating,false);await view.create();assert.equal(attempts,2);assert.equal(view.editor.value,'');
});
test('lost creation acknowledgement reuses the persisted identity after reopening',async t=>{
 const original=globalThis.localStorage,values=new Map();globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};t.after(()=>{if(original===undefined)delete globalThis.localStorage;else globalThis.localStorage=original;});
 const {CardsView}=PluginClass._test;let visible=false,file,text,writes=0;const vault={adapter:{getBasePath:()=>'/vault'},getAbstractFileByPath:p=>p==='Fomo'?{}:visible&&file?.path===p?file:null,read:async()=>text,create:async(p,s)=>{writes++;file=new TFile(p);text=s;throw Error('ack lost');}};
 const make=()=>{const view=new CardsView({}, {folder:()=> 'Fomo'});view.app={vault};view.editor={value:''};view.render=async()=>{};view.loadComposerDraft();return view;};const first=make();first.editor.value='保留内容';await first.create();assert.equal(first.editor.value,'保留内容');visible=true;const reopened=make();assert.equal(reopened.editor.value,'保留内容');await reopened.create();assert.equal(writes,1);assert.equal(reopened.editor.value,'');assert.equal(values.size,0);
});
test('lost acknowledgement preserves both submitted and subsequently typed text across reopening',async t=>{
 const original=globalThis.localStorage,values=new Map();globalThis.localStorage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k)};t.after(()=>{if(original===undefined)delete globalThis.localStorage;else globalThis.localStorage=original;});
 const {CardsView,parse}=PluginClass._test;let visible=false,file,text,writes=0,rejectWrite;const vault={adapter:{getBasePath:()=>'/vault'},getAbstractFileByPath:p=>p==='Fomo'?{}:visible&&file?.path===p?file:null,read:async()=>text,create:async(p,s)=>{writes++;file=new TFile(p);text=s;await new Promise((_,reject)=>{rejectWrite=reject;});}};
 const make=()=>{const view=new CardsView({}, {folder:()=> 'Fomo'});view.app={vault};view.editor={value:''};view.render=async()=>{};view.loadComposerDraft();return view;};const first=make();first.editor.value='原稿';const saving=first.create();await Promise.resolve();first.editor.value='原稿 后续';first.saveComposerDraft();rejectWrite(Error('ack lost'));await saving;visible=true;
 const reopened=make();assert.equal(reopened.editor.value,'原稿 后续');await reopened.create();assert.equal(writes,1);assert.equal(parse(text).content,'原稿');assert.equal(reopened.editor.value,'原稿 后续');const again=make();assert.equal(again.editor.value,'原稿 后续');assert.equal(again.composerPending,null);assert.notEqual(again.composerIdentity.id,parse(text).id);
});
test('sync trash verifies the exact scoped file and keeps a protected copy',async()=>{
 const {encode}=PluginClass._test,created='2026-01-01T00:00:00.000Z',file=new TFile('Fomo/n.md'),original=encode({id:'n',created,content:'正文'});let current=original,calls=0;const plugin=new PluginClass();plugin.settings={folder:'Fomo'};plugin.settingsWrites=Promise.resolve();plugin.saveData=async()=>{};plugin.app={vault:{getAbstractFileByPath:p=>p===file.path?file:null,read:async()=>current},fileManager:{trashFile:async()=>{calls++;}}};
 await assert.rejects(plugin.trashSyncedFile('../outside.md',original),/路径无效/);current=original+'其他编辑';await assert.rejects(plugin.trashSyncedFile('n.md',original),/已变化/);assert.equal(calls,0);assert.equal(plugin.settings.deletionJournal,undefined);
 current=original;await plugin.trashSyncedFile('n.md',original);assert.equal(calls,1);assert.equal(plugin.settings.deletionJournal[0].text,original);assert.equal(plugin.settings.deletionJournal[0].status,'confirmed');
});
test('deletion explicitly uses vault-local trash even when the user setting could permanently delete',async()=>{
 const {encode}=PluginClass._test,created='2026-01-01T00:00:00.000Z',file=new TFile('Fomo/n.md'),note={id:'n',created,content:'正文',file},text=encode(note),plugin=new PluginClass();let local=0;
 plugin.settings={folder:'Fomo'};plugin.settingsWrites=Promise.resolve();plugin.saveData=async()=>{};plugin.app={vault:{getAbstractFileByPath:()=>file,read:async()=>text,trash:async(target,system)=>{assert.equal(target,file);assert.equal(system,false);local++;}},fileManager:{trashFile:async()=>{throw Error('可能永久删除，不能使用');}}};
 await plugin.trashWithJournal(note);assert.equal(local,1);assert.equal(plugin.settings.deletionJournal[0].status,'confirmed');
});
test('a modification reported during trash leaves the deletion unconfirmed',async()=>{
 const {encode}=PluginClass._test,created='2026-01-01T00:00:00.000Z',file=new TFile('Fomo/n.md'),note={id:'n',created,content:'正文',file},text=encode(note),plugin=new PluginClass();let listener,removed=false;
 plugin.settings={folder:'Fomo'};plugin.settingsWrites=Promise.resolve();plugin.saveData=async()=>{};plugin.app={vault:{getAbstractFileByPath:()=>file,read:async()=>text,on:(name,fn)=>{assert.equal(name,'modify');listener=fn;return {id:1};},offref:()=>{removed=true;}},fileManager:{trashFile:async()=>{listener(file);}}};
 await assert.rejects(plugin.trashWithJournal(note),/操作期间笔记发生修改/);assert.equal(plugin.settings.deletionJournal[0].status,'pending');assert.equal(plugin.settings.deletionJournal[0].text,text);assert.deepEqual(plugin.deletionReceipts(),[]);assert.equal(removed,true);
});
test('an editor change during trash is saved separately and never confirms the deletion',async()=>{
 const {encode}=PluginClass._test,created='2026-01-01T00:00:00.000Z',file=new TFile('Fomo/n.md'),note={id:'n',created,content:'正文',file},text=encode(note),plugin=new PluginClass();let listener,removed=false;
 plugin.settings={folder:'Fomo'};plugin.settingsWrites=Promise.resolve();plugin.saveData=async()=>{};plugin.app={vault:{getAbstractFileByPath:()=>file,read:async()=>text},workspace:{getLeavesOfType:()=>[],on:(name,fn)=>{assert.equal(name,'editor-change');listener=fn;return {id:1};},offref:()=>{removed=true;}},fileManager:{trashFile:async()=>{listener({getValue:()=>text+'并发修改'},{file});}}};
 await assert.rejects(plugin.trashWithJournal(note),/期间笔记发生修改/);const record=plugin.settings.deletionJournal[0];assert.equal(record.status,'pending');assert.equal(record.text,text);assert.equal(record.concurrentText,text+'并发修改');assert.deepEqual(plugin.deletionReceipts(),[]);assert.equal(removed,true);
});
test('concurrent edits from distinct editor panes retain the latest text from each',async()=>{
 const {encode}=PluginClass._test,created='2026-01-01T00:00:00.000Z',file=new TFile('Fomo/n.md'),note={id:'n',created,content:'正文',file},text=encode(note),plugin=new PluginClass();let listener,first=text+'窗格一',second=text+'窗格二';const a={getValue:()=>first},b={getValue:()=>second};
 plugin.settings={folder:'Fomo'};plugin.settingsWrites=Promise.resolve();plugin.saveData=async()=>{};plugin.app={vault:{getAbstractFileByPath:()=>file,read:async()=>text,trash:async()=>{listener(a,{file});listener(b,{file});first+='后续';listener(a,{file});}},workspace:{getLeavesOfType:()=>[],on:(_name,fn)=>{listener=fn;return {};},offref:()=>{}}};
 await assert.rejects(plugin.trashWithJournal(note),/期间笔记发生修改/);const record=plugin.settings.deletionJournal[0];assert.equal(record.status,'pending');assert.deepEqual(record.concurrentTexts,[first,second]);assert.equal(record.concurrentText,undefined);assert.deepEqual(plugin.deletionReceipts(),[]);
});
test('a failed editor capture does not discard another pane protected copy',async()=>{
 const {encode}=PluginClass._test,created='2026-01-01T00:00:00.000Z',file=new TFile('Fomo/n.md'),note={id:'n',created,content:'正文',file},text=encode(note),plugin=new PluginClass();let listener;
 plugin.settings={folder:'Fomo'};plugin.settingsWrites=Promise.resolve();plugin.saveData=async()=>{};plugin.app={vault:{getAbstractFileByPath:()=>file,read:async()=>text,trash:async()=>{listener({getValue:()=>text+'可保存'},{file});listener({getValue:()=>{throw Error('editor unavailable');}},{file});}},workspace:{getLeavesOfType:()=>[],on:(_name,fn)=>{listener=fn;return {};},offref:()=>{}}};
 await assert.rejects(plugin.trashWithJournal(note),/部分编辑内容无法保存/);assert.equal(plugin.settings.deletionJournal[0].concurrentText,text+'可保存');assert.equal(plugin.settings.deletionJournal[0].status,'pending');
});
test('an editor change is retained even when the trash operation fails',async()=>{
 const {encode}=PluginClass._test,created='2026-01-01T00:00:00.000Z',file=new TFile('Fomo/n.md'),note={id:'n',created,content:'正文',file},text=encode(note),plugin=new PluginClass();let listener;
 plugin.settings={folder:'Fomo'};plugin.settingsWrites=Promise.resolve();plugin.saveData=async()=>{};plugin.app={vault:{getAbstractFileByPath:()=>file,read:async()=>text},workspace:{getLeavesOfType:()=>[],on:(_name,fn)=>{listener=fn;return {};},offref:()=>{}},fileManager:{trashFile:async()=>{listener({getValue:()=>text+'尚未保存'},{file});throw Error('回收站不可用');}}};
 await assert.rejects(plugin.trashWithJournal(note),/回收站操作未确认/);assert.equal(plugin.settings.deletionJournal[0].status,'pending');assert.equal(plugin.settings.deletionJournal[0].concurrentText,text+'尚未保存');assert.deepEqual(plugin.deletionReceipts(),[]);
});
test('a transient editor change during the final read stops trash even if the buffer is reverted',async()=>{
 const {encode}=PluginClass._test,created='2026-01-01T00:00:00.000Z',file=new TFile('Fomo/n.md'),note={id:'n',created,content:'正文',file},text=encode(note),plugin=new PluginClass();let listener,reads=0,trashCalls=0;
 plugin.settings={folder:'Fomo'};plugin.settingsWrites=Promise.resolve();plugin.saveData=async()=>{};plugin.app={vault:{getAbstractFileByPath:()=>file,read:async()=>{if(++reads===2)listener({getValue:()=>text+'临时编辑'},{file});return text;}},workspace:{getLeavesOfType:()=>[],on:(_name,fn)=>{listener=fn;return {};},offref:()=>{}},fileManager:{trashFile:async()=>{trashCalls++;}}};
 await assert.rejects(plugin.trashWithJournal(note),/笔记已变化/);assert.equal(trashCalls,0);assert.equal(plugin.settings.deletionJournal[0].concurrentText,text+'临时编辑');assert.deepEqual(plugin.deletionReceipts(),[]);
});
test('trash records a protected copy before moving a note and confirms afterwards',async()=>{
 const {encode}=PluginClass._test,created='2026-01-01T00:00:00.000Z',file=new TFile('Fomo/n.md'),note={id:'n',created,content:'正文',file},text=encode(note),saved=[],plugin=new PluginClass();
 plugin.settings={folder:'Fomo'};plugin.settingsWrites=Promise.resolve();plugin.saveData=async data=>saved.push(structuredClone(data));let trashCalls=0;
 plugin.app={vault:{getAbstractFileByPath:()=>file,read:async()=>text},fileManager:{trashFile:async()=>{assert.equal(saved[0].deletionJournal[0].status,'pending');assert.equal(saved[0].deletionJournal[0].text,text);trashCalls++;}}};
 await plugin.trashWithJournal(note);assert.equal(trashCalls,1);assert.equal(saved[1].deletionJournal[0].status,'confirmed');assert.equal(saved[1].deletionJournal[0].fileHash,require('../desktop/obsidian-sync-plan.cjs').digest(text));
 const receipt=plugin.deletionReceipts()[0];assert.deepEqual(Object.keys(receipt).sort(),['eventId','fileHash','id']);assert.equal(JSON.stringify(receipt).includes('正文'),false);
 plugin.settings.deletionJournal[0].text+='篡改';assert.throws(()=>plugin.deletionReceipts(),/无效/);
});
test('trash stops if the protection record fails or the note changes',async()=>{
 const {encode}=PluginClass._test,created='2026-01-01T00:00:00.000Z',file=new TFile('Fomo/n.md'),note={id:'n',created,content:'旧',file},text=encode(note);let reads=0,trashCalls=0;
 const plugin=new PluginClass();plugin.settings={folder:'Fomo'};plugin.settingsWrites=Promise.resolve();plugin.saveData=async()=>{throw Error('保存失败');};plugin.app={vault:{getAbstractFileByPath:()=>file,read:async()=>text},fileManager:{trashFile:async()=>{trashCalls++;}}};
 await assert.rejects(plugin.trashWithJournal(note),/保存失败/);assert.equal(trashCalls,0);
 plugin.saveData=async()=>{};plugin.app.vault.read=async()=>++reads===1?text:encode({...note,content:'其他窗口修改'});
 await assert.rejects(plugin.trashWithJournal(note),/已变化/);assert.equal(trashCalls,0);assert.equal(plugin.settings.deletionJournal[0].status,'pending');
});
test('trash never follows a note moved outside the dedicated folder during either read',async()=>{
 const {encode}=PluginClass._test,created='2026-01-01T00:00:00.000Z';
 for(const moveOnRead of [1,2]){
  const file=new TFile('Fomo/n.md'),note={id:'n',created,content:'正文',file},text=encode(note),plugin=new PluginClass();let reads=0,trashCalls=0;
  plugin.settings={folder:'Fomo'};plugin.settingsWrites=Promise.resolve();plugin.saveData=async()=>{};
  plugin.app={vault:{getAbstractFileByPath:p=>p===file.path?file:null,read:async()=>{if(++reads===moveOnRead)file.path='Other/n.md';return text;}},fileManager:{trashFile:async()=>{trashCalls++;}}};
  await assert.rejects(plugin.trashWithJournal(note),/已移动|已变化/);assert.equal(trashCalls,0);
  if(moveOnRead===2)assert.equal(plugin.settings.deletionJournal[0].status,'pending');else assert.equal(plugin.settings.deletionJournal,undefined);
 }
});
test('trash refuses unsaved changes in an open Obsidian editor',async()=>{
 const {encode}=PluginClass._test,created='2026-01-01T00:00:00.000Z';
 for(const changedOnRead of [1,2]){
  const file=new TFile('Fomo/n.md'),note={id:'n',created,content:'正文',file},text=encode(note),plugin=new PluginClass();let reads=0,trashCalls=0,buffer=text;
  plugin.settings={folder:'Fomo'};plugin.settingsWrites=Promise.resolve();plugin.saveData=async()=>{};
  plugin.app={vault:{getAbstractFileByPath:p=>p===file.path?file:null,read:async()=>{if(++reads===changedOnRead)buffer=text+'未保存';return text;}},workspace:{getLeavesOfType:()=>[{view:{file,editor:{getValue:()=>buffer}}}]},fileManager:{trashFile:async()=>{trashCalls++;}}};
  await assert.rejects(plugin.trashWithJournal(note),/未保存/);assert.equal(trashCalls,0);assert.equal(buffer,text+'未保存');
  if(changedOnRead===2)assert.equal(plugin.settings.deletionJournal[0].status,'pending');else assert.equal(plugin.settings.deletionJournal,undefined);
 }
});
test('a failed trash operation retains pending evidence and blocks a repeated attempt',async()=>{
 const {encode}=PluginClass._test,created='2026-01-01T00:00:00.000Z',file=new TFile('Fomo/n.md'),note={id:'n',created,content:'正文',file},text=encode(note);let calls=0;
 const plugin=new PluginClass();plugin.settings={folder:'Fomo'};plugin.settingsWrites=Promise.resolve();plugin.saveData=async()=>{};
 plugin.app={vault:{getAbstractFileByPath:()=>file,read:async()=>text},fileManager:{trashFile:async()=>{calls++;throw Error('操作中断');}}};
 await assert.rejects(plugin.trashWithJournal(note),/未确认/);assert.equal(plugin.settings.deletionJournal[0].status,'pending');assert.equal(plugin.settings.deletionJournal[0].text,text);
 await assert.rejects(plugin.trashWithJournal(note),/未完成/);assert.equal(calls,1);
});
test('pending deletion can be cancelled only while the original note identity exists',async()=>{
 const {encode}=PluginClass._test,created='2026-01-01T00:00:00.000Z',file=new TFile('Fomo/n.md'),note={id:'n',created,content:'旧',file},original=encode(note);let current=original,exists=true;
 const plugin=new PluginClass();plugin.settings={folder:'Fomo'};plugin.settingsWrites=Promise.resolve();plugin.saveData=async()=>{};plugin.app={vault:{getAbstractFileByPath:()=>exists?file:null,read:async()=>current},fileManager:{trashFile:async()=>{throw Error('未知状态');}}};
 await assert.rejects(plugin.trashWithJournal(note),/未确认/);const eventId=plugin.settings.deletionJournal[0].id;
 exists=false;await assert.rejects(plugin.cancelPendingDeletion(eventId),/回收站/);exists=true;current=encode({...note,id:'other'});await assert.rejects(plugin.cancelPendingDeletion(eventId),/身份不匹配/);
 current=encode({...note,content:'恢复后内容'});await plugin.cancelPendingDeletion(eventId);assert.equal(plugin.settings.deletionJournal[0].status,'cancelled');assert.equal(plugin.settings.deletionJournal[0].text,original);assert.deepEqual(plugin.deletionReceipts(),[]);assert.equal(current,encode({...note,content:'恢复后内容'}));
});

test('Obsidian plugin delegates AI to Claudian instead of advertising a second chat',()=>{
 const fs=require('node:fs');
 const source=fs.readFileSync(path.join(__dirname,'../obsidian-plugin/fomo/main.js'),'utf8');
 const readme=fs.readFileSync(path.join(__dirname,'../obsidian-plugin/README.md'),'utf8');
 assert.match(source,/AI 直接使用 Obsidian 中已安装的 Claudian/);
 assert.match(source,/Fomo Cards 不重复提供 AI 会话/);
 assert.doesNotMatch(source,/双向同步、引用、回顾和 AI 正在开发/);
 assert.match(readme,/@Fomo\//);
 assert.match(readme,/不再重复实现 Fomo AI 会话/);
});
