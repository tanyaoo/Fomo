'use strict';
const {Plugin,ItemView,Notice,MarkdownRenderer,PluginSettingTab,Setting,TFile,TFolder,FuzzySuggestModal,Modal}=require('obsidian');
const path=require('node:path'),nodeCrypto=require('node:crypto'),{startBridge}=require('./sync-bridge.cjs');
const {parseDocument,writeDocument}=require('./frontmatter.cjs');
const {imageDescriptor,validateImageDescriptors,recoverImage}=require('./image-assets.cjs');
const VIEW='fomo-cards-view';
const validFolder=value=>typeof value==='string'&&value.length>0&&!/[\\:*?"<>|\u0000-\u001f\u007f]/.test(value)&&value.split('/').every(part=>part&&!part.startsWith('.')&&!/[ .]$/.test(part)&&!/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9]|conin\$|conout\$)(?:\..*)?$/i.test(part));
function composerDraftKey(vault,folder){const base=typeof vault.adapter?.getBasePath==='function'?vault.adapter.getBasePath():null;if(typeof base!=='string'||!base||!validFolder(folder))return null;return 'fomo-cards-compose:'+nodeCrypto.createHash('sha256').update(JSON.stringify([base,folder])).digest('hex');}
function reflectionDraftKey(vault,folder,id){const scope=composerDraftKey(vault,folder);return scope&&validId(id)?scope+':reflection:'+id:null;}
function inlineDraftKey(vault,folder,id){const scope=composerDraftKey(vault,folder);return scope&&validId(id)?scope+':inline:'+id:null;}
function readInlineDraft(storage,key,note){if(!key)return null;try{const draft=JSON.parse(storage.getItem(key)||'null');return draft?.id===note.id&&draft.created===note.created&&typeof draft.content==='string'?draft.content:null;}catch{return null;}}
function clearInlineDraft(storage,key,note,expected){if(!key)return;try{if(readInlineDraft(storage,key,note)===expected)storage.removeItem(key);}catch{}}
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(id);
const validRefs=(refs,id)=>Array.isArray(refs)&&refs.length<=200&&refs.every(ref=>validId(ref)&&ref!==id)&&new Set(refs).size===refs.length;
const reviewDay=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
const reviewFolderKey=folder=>nodeCrypto.createHash('sha256').update(folder).digest('hex');
function reviewedIds(settings,folder,day){const all=settings.reviewProgress;if(all===undefined)return [];if(!all||typeof all!=='object'||Array.isArray(all))throw Error('回顾进度无法读取');const group=all[reviewFolderKey(folder)];if(group===undefined)return [];if(!group||typeof group!=='object'||Array.isArray(group))throw Error('回顾进度无法读取');const ids=group[day];if(ids===undefined)return [];if(!Array.isArray(ids)||ids.some(id=>!validId(id))||new Set(ids).size!==ids.length)throw Error('回顾进度无法读取');return ids;}
function renderReviewAction(card,note,view,day){const folder=view.plugin.folder(),done=reviewedIds(view.plugin.settings,folder,day).includes(note.id),row=card.createDiv({cls:'fomo-review-actions'}),button=row.createEl('button',{text:done?'已回顾':'标记已回顾',attr:{'aria-pressed':String(done)}});button.disabled=done;button.onclick=async()=>{if(view.editing){new Notice('请先保存或取消当前编辑');return;}button.disabled=true;try{await view.plugin.markReviewed(note.id,folder,day);await view.render();}catch(error){new Notice('回顾进度未保存：'+error.message);button.disabled=false;}};const reflect=row.createEl('button',{text:'写下联想'});reflect.onclick=()=>view.openReflection(card,note,folder);}
function noteMetadata(n){const refs=n.references||[];if(!validId(n.id)||!validRefs(refs,n.id))throw Error('引用元数据无效');const result={references:refs,imageAssets:validateImageDescriptors(n.imageAssets||[])};if(n.starred!==undefined&&typeof n.starred!=='boolean')throw Error('收藏元数据无效');result.starred=!!n.starred;for(const key of ['relatedTo','annotationOf'])if(n[key]!==undefined){if(!validId(n[key])||n[key]===n.id)throw Error('关联元数据无效');result[key]=n[key];}if(n.source!==undefined){if(!['direct','annotation','reflection','import'].includes(n.source))throw Error('来源元数据无效');result.source=n.source;}if(n.sourceSlug!==undefined){if(typeof n.sourceSlug!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(n.sourceSlug))throw Error('来源笔记标识无效');result.sourceSlug=n.sourceSlug;}return result;}
const parse=text=>{try{const document=parseDocument(text),fields=document.fields;if(!document.hasFrontmatter||!validId(fields.fomo_id)||!Number.isFinite(Date.parse(fields.fomo_created)))return null;const note={id:fields.fomo_id,created:fields.fomo_created,content:document.body,references:fields.fomo_references===undefined?[]:fields.fomo_references,imageAssets:validateImageDescriptors(fields.fomo_images===undefined?[]:fields.fomo_images),document};for(const [name,key] of [['fomo_starred','starred'],['fomo_related_to','relatedTo'],['fomo_annotation_of','annotationOf'],['fomo_source','source'],['fomo_source_slug','sourceSlug']])if(fields[name]!==undefined)note[key]=fields[name];noteMetadata(note);return note;}catch{return null;}};
const encode=(n,document=n.document)=>{const meta=noteMetadata(n),fields={fomo_id:n.id,fomo_created:n.created,...(meta.starred?{fomo_starred:true}:{}),...(meta.imageAssets.length?{fomo_images:meta.imageAssets}:{}),...(meta.references.length?{fomo_references:meta.references}:{}),...(meta.relatedTo?{fomo_related_to:meta.relatedTo}:{}),...(meta.annotationOf?{fomo_annotation_of:meta.annotationOf}:{}),...(meta.source?{fomo_source:meta.source}:{}),...(meta.sourceSlug?{fomo_source_slug:meta.sourceSlug}:{})};return writeDocument(document||parseDocument(''),fields,n.content);};
function dailyNotes(notes,date=new Date(),count=8){
 const day=reviewDay(date);
 const hash=s=>{let h=2166136261;for(const c of s)h=Math.imul(h^c.charCodeAt(0),16777619);return h>>>0;};
 return [...notes].sort((a,b)=>hash(day+a.id)-hash(day+b.id)||a.id.localeCompare(b.id)).slice(0,count);
}
function filterNotes(notes,query,starredOnly){const terms=query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);return notes.filter(note=>(!starredOnly||note.starred)&&terms.every(term=>note.content.toLocaleLowerCase().includes(term)));}
function reviewOptions(value={}){if(!value||typeof value!=='object'||Array.isArray(value))value={};return {count:[4,8,12,16,20,24].includes(value.count)?value.count:8,period:['all','12','6','3','1'].includes(value.period)?value.period:'all',include:typeof value.include==='string'?value.include:'',exclude:typeof value.exclude==='string'?value.exclude:'',noTags:value.noTags===true};}
function reviewTags(text){return [...new Set([...text.matchAll(/(?:fomo|writeboom|memo-flow):\/\/note\/[a-zA-Z0-9-]+|https?:\/\/[^\s<>\uFFFC]+|(?<![\p{L}\p{N}_/#])#[\p{L}\p{N}\p{Extended_Pictographic}\p{Emoji_Component}\u200D\uFE0F_\-/]+/gu)].filter(m=>m[0][0]==='#').map(m=>m[0].slice(1).replace(/\/+$/g,'').replace(/\/{2,}/g,'/')).filter(tag=>/^[\p{L}\p{N}\p{Extended_Pictographic}\p{Emoji_Component}\u200D\uFE0F_\-/]+(?:\/[\p{L}\p{N}\p{Extended_Pictographic}\p{Emoji_Component}\u200D\uFE0F_\-/]+)*$/u.test(tag)))];}
function reviewNotes(notes,date,query,starredOnly,options={}){const today=reviewDay(date),config=reviewOptions(options),from=new Date(date);if(config.period!=='all')from.setMonth(from.getMonth()-Number(config.period));const eligible=notes.filter(note=>{if(!Number.isFinite(Date.parse(note.created))||reviewDay(new Date(note.created))>=today||(config.period!=='all'&&new Date(note.created)<from))return false;const tags=reviewTags(note.content),matches=tag=>tags.some(item=>item===tag||item.startsWith(tag+'/'));return (!config.noTags||!tags.length)&&(!config.include||matches(config.include))&&(!config.exclude||!matches(config.exclude));});return dailyNotes(filterNotes(eligible,query,starredOnly),date,config.count);}
function relationsForNotes(notes,resolveLink,getLinks){
 const byId=new Map(),byKey=new Map(),byPath=new Map(),out=new Map(),incoming=new Map();
 for(const note of notes){if(byId.has(note.id))byId.set(note.id,null);else byId.set(note.id,note);for(const key of new Set([note.id,note.sourceSlug].filter(Boolean))){if(byKey.has(key)&&byKey.get(key)!==note)byKey.set(key,null);else if(!byKey.has(key))byKey.set(key,note);}if(note.file?.path)byPath.set(note.file.path,note);}
 for(const note of notes){
  if(byId.get(note.id)!==note)continue;
  const ids=new Set([...(note.references||[]),note.relatedTo,note.annotationOf,...Array.from(note.content.matchAll(/(?:fomo|writeboom|memo-flow):\/\/note\/([a-zA-Z0-9-]{1,100})(?![a-zA-Z0-9-])/g),m=>m[1])].filter(Boolean));
  for(const token of note.content.match(/https?:\/\/[^\s<>]+/g)||[]){const clean=token.replace(/[.,!?;:，。！？；：)）\]】}]+$/,''),match=/^https?:\/\/[^/\s]+\/mine\/\?(?:[^\s#]*&)?memo_id=([a-zA-Z0-9_-]{1,100})/.exec(clean);if(match)ids.add(match[1]);}
  if(typeof resolveLink==='function'&&typeof getLinks==='function'&&note.file?.path)for(const link of getLinks(note.file)||[]){if(typeof link?.link!=='string')continue;const linkpath=link.link.split('#',1)[0];if(!linkpath)continue;const resolved=resolveLink(linkpath,note.file.path),target=resolved&&byPath.get(resolved.path);if(target&&byId.get(target.id)===target)ids.add(target.id);}
  const targets=new Set();for(const id of ids){const target=byKey.get(id);if(!target||byId.get(target.id)!==target||target.id===note.id||targets.has(target.id))continue;targets.add(target.id);if(!out.has(note.id))out.set(note.id,[]);out.get(note.id).push(target);if(!incoming.has(target.id))incoming.set(target.id,[]);incoming.get(target.id).push(note);}
 }
 return {out,incoming};
}
function renderRelations(card,note,relations,app){
 for(const [label,items] of [['引用',relations.out.get(note.id)||[]],['被引用',relations.incoming.get(note.id)||[]]]){
  if(!items.length)continue;const group=card.createDiv({cls:'fomo-relations'});group.createEl('span',{text:label+' · '+items.length,cls:'fomo-relations-label'});
  for(const item of items){const button=group.createEl('button',{cls:'fomo-relation',text:referenceLabel(item),attr:{'aria-label':'打开关联笔记 '+referenceLabel(item)}});button.onclick=()=>app.workspace.getLeaf(false).openFile(item.file);}
 }
}
function referenceLabel(note){
 const excerpt=note.content.replace(/(?:fomo|writeboom|memo-flow):\/\/note\/[a-zA-Z0-9-]+/g,'').replace(/(^|\s)#[^\s#]+/g,'$1').replace(/\s+/g,' ').trim();
 return '↗ '+new Date(note.created).toLocaleDateString('zh-CN')+' '+Array.from(excerpt).slice(0,20).join('');
}
function setupBodyFold(card,body,observers,expandedIds=new Set(),id=''){
 if(!body.classList)return;
 let expanded=expandedIds.has(id);const button=card.createEl('button',{cls:'fomo-expand',text:expanded?'收起':'展开',attr:{'aria-expanded':String(expanded)}});
 const update=()=>{const overflow=body.scrollHeight>161;button.hidden=!overflow;body.classList.toggle('fomo-body-collapsed',overflow&&!expanded);};
 button.onclick=()=>{expanded=!expanded;if(expanded)expandedIds.add(id);else expandedIds.delete(id);button.setText(expanded?'收起':'展开');button.setAttribute('aria-expanded',String(expanded));update();};
 update();if(typeof ResizeObserver==='function'){const observer=new ResizeObserver(update);observer.observe(body);observers.push(observer);}
}
function renderInlineReferences(body,notes,app){
 const byId=new Map();for(const note of notes)byId.set(note.id,byId.has(note.id)?null:note);
 const doc=body.ownerDocument,pattern=/(?:fomo|writeboom|memo-flow):\/\/note\/([a-zA-Z0-9-]{1,100})(?![a-zA-Z0-9-])/g;
 const buttonFor=note=>{const button=doc.createElement('button');button.type='button';button.className='fomo-inline-reference';button.textContent=referenceLabel(note);button.setAttribute('aria-label','打开引用笔记 '+referenceLabel(note));button.onclick=()=>app.workspace.getLeaf(false).openFile(note.file);return button;};
 for(const anchor of body.querySelectorAll('a[href]')){const href=anchor.getAttribute('href'),match=/^(?:fomo|writeboom|memo-flow):\/\/note\/([a-zA-Z0-9-]{1,100})$/.exec(href),note=match&&byId.get(match[1]);if(note)anchor.replaceWith(buttonFor(note));}
 const walker=doc.createTreeWalker(body,4),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
 for(const node of nodes){if(node.parentElement?.closest('a,button,code,pre'))continue;const text=node.nodeValue;pattern.lastIndex=0;let match,last=0,fragment=null;while((match=pattern.exec(text))){const note=byId.get(match[1]);if(!note)continue;if(!fragment)fragment=doc.createDocumentFragment();fragment.append(doc.createTextNode(text.slice(last,match.index)),buttonFor(note));last=match.index+match[0].length;}if(fragment){fragment.append(doc.createTextNode(text.slice(last)));node.replaceWith(fragment);}}
}
function updateIfUnchanged(current,original,content){const latest=parse(current);if(!latest||latest.id!==original.id||latest.content!==original.content||latest.created!==original.created||JSON.stringify(noteMetadata(latest))!==JSON.stringify(noteMetadata(original)))throw Error('笔记已在其他位置修改，请复制草稿后重新打开');return encode({...latest,content});}
async function replaceIfUnchanged(vault,file,expected,replacement,guard=()=>{}){
 const before=typeof expected==='string'&&parse(expected),after=typeof replacement==='string'&&parse(replacement);
 if(!before||!after||before.id!==after.id||before.created!==after.created)throw Error('同步内容无效');
 await vault.process(file,current=>{guard();if(current!==expected)throw Error('Obsidian 笔记已变化，请重新预览');return replacement;});
}
function scopedFile(vault,folder,relative){
 if(!validFolder(folder)||/[\\:]/.test(folder)||typeof relative!=='string'||!validFolder(relative)||/[\\:]/.test(relative)||!relative.toLowerCase().endsWith('.md'))throw Error('同步文件路径无效');
 const target=folder+'/'+relative,file=vault.getAbstractFileByPath(target);
 if(!(file instanceof TFile)||file.path!==target)throw Error('同步文件不存在或不在专用文件夹中');
 return file;
}
async function replaceWithinFolder(vault,folder,relative,expected,replacement,guard=()=>{}){
 const file=scopedFile(vault,folder,relative);
 await replaceIfUnchanged(vault,file,expected,replacement,()=>{guard();if(scopedFile(vault,folder,relative)!==file)throw Error('同步文件已移动，请重新检查');});
}
async function registerMarkdown(vault,folder,relative,expected,replacement,guard=()=>{}){
 const file=scopedFile(vault,folder,relative),note=typeof replacement==='string'&&parse(replacement);let document;try{document=parseDocument(expected);}catch{throw Error('普通笔记属性无效');}
 if(!note||Object.keys(document.fields).length||note.content!==document.body||note.references.length||note.imageAssets.length||note.starred||note.relatedTo||note.annotationOf||note.source||note.sourceSlug||encode(note,document)!==replacement)throw Error('普通笔记身份信息无效');
 for(const candidate of vault.getMarkdownFiles()){
  if(!candidate.path.startsWith(folder+'/')||candidate.path===file.path)continue;
  const other=parse(await vault.read(candidate));if(other?.id===note.id)throw Error('笔记 ID 已存在，请重新检查');
 }
 await vault.process(file,current=>{guard();if(scopedFile(vault,folder,relative)!==file)throw Error('同步文件已移动，请重新检查');if(current!==expected)throw Error('Obsidian 笔记已变化，请重新预览');return replacement;});
}
// Internal building block; not connected to sync until attachment transactions
// and recovery are available in both directions.
async function ensureImageAsset(vault,folder,data,guard=()=>{}){
 guard();
 if(!validFolder(folder)||!(vault.getAbstractFileByPath(folder) instanceof TFolder))throw Error('Fomo 专用文件夹无效');
 const descriptor=imageDescriptor(data),directory=folder+'/Fomo-assets',target=folder+'/'+descriptor.path;
 let parent=vault.getAbstractFileByPath(directory);if(!parent){try{await vault.createFolder(directory);}catch(error){parent=vault.getAbstractFileByPath(directory);if(!(parent instanceof TFolder))throw error;}parent=vault.getAbstractFileByPath(directory);}
 guard();if(!(parent instanceof TFolder)||parent.path!==directory||vault.getAbstractFileByPath(directory)!==parent)throw Error('附件目录不可用');
 let file=vault.getAbstractFileByPath(target),created=false;
 if(!file){const bytes=Buffer.from(data.slice(data.indexOf(',')+1),'base64'),array=bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength);try{file=await vault.createBinary(target,array);created=true;}catch(error){file=vault.getAbstractFileByPath(target);if(!file)throw error;}}
 guard();if(!(file instanceof TFile)||file.path!==target||vault.getAbstractFileByPath(target)!==file)throw Error('附件位置已被其他文件占用');
 if(Number.isFinite(file.stat?.size)&&file.stat.size!==descriptor.size)throw Error('附件大小已变化，未覆盖已有文件');
 const actual=Buffer.from(await vault.readBinary(file));guard();if(file.path!==target||vault.getAbstractFileByPath(target)!==file)throw Error('附件已移动，请重新检查');if(recoverImage(descriptor,actual)!==data)throw Error('附件内容不匹配，未覆盖已有文件');
 return {descriptor,created};
}
async function readImageAsset(vault,folder,descriptor,guard=()=>{}){
 guard();
 if(!validFolder(folder)||!(vault.getAbstractFileByPath(folder) instanceof TFolder))throw Error('Fomo 专用文件夹无效');
 const match=typeof descriptor?.path==='string'&&/^Fomo-assets\/([a-f0-9]{64})\.(png|jpg|gif|webp)$/.exec(descriptor.path),types={png:'image/png',jpg:'image/jpeg',gif:'image/gif',webp:'image/webp'};
 if(!match||descriptor.sha256!==match[1]||descriptor.mime!==types[match[2]]||!Number.isSafeInteger(descriptor.size)||descriptor.size<=0||descriptor.size>32*1024*1024)throw Error('图片记录无效');
 const target=folder+'/'+descriptor.path,file=vault.getAbstractFileByPath(target);if(!(file instanceof TFile)||file.path!==target)throw Error('附件不存在或不在专用文件夹中');
 if(Number.isFinite(file.stat?.size)&&file.stat.size!==descriptor.size)throw Error('图片内容或大小已变化');
 const raw=await vault.readBinary(file);guard();if(file.path!==target||vault.getAbstractFileByPath(target)!==file)throw Error('附件已移动，请重新检查');if(raw.byteLength!==descriptor.size)throw Error('图片内容或大小已变化');return recoverImage(descriptor,Buffer.from(raw));
}
class ImageViewer extends Modal{
 constructor(app,images,index){super(app);this.images=images;this.index=index;}
 onOpen(){this.contentEl.addClass('fomo-image-viewer');this.onViewerKey=event=>{if(this.images.length<2||!['ArrowLeft','ArrowRight'].includes(event.key))return;event.preventDefault();this.move(event.key==='ArrowLeft'?-1:1);};this.modalEl.addEventListener('keydown',this.onViewerKey);this.draw();}
 move(step){this.index=(this.index+step+this.images.length)%this.images.length;this.draw();}
 draw(){this.contentEl.empty();const image=this.images[this.index];if(!image)return;this.contentEl.createEl('img',{attr:{src:image,alt:`笔记图片 ${this.index+1}`}});if(this.images.length>1){const controls=this.contentEl.createDiv({cls:'fomo-image-viewer-controls'});for(const [label,step] of [['上一张',-1],['下一张',1]]){const button=controls.createEl('button',{text:label});button.onclick=()=>this.move(step);}controls.createEl('span',{text:`${this.index+1} / ${this.images.length}`});}}
 onClose(){if(this.onViewerKey)this.modalEl.removeEventListener('keydown',this.onViewerKey);this.contentEl.empty();}
}
async function renderImageAssets(card,note,vault,folder,isCurrent=()=>true,app=null){
 if(!note.imageAssets?.length)return;const images=[];
 for(const descriptor of note.imageAssets){try{images.push(await readImageAsset(vault,folder,descriptor));}catch{images.push(null);}if(!isCurrent())return;}
 const group=card.createDiv({cls:'fomo-images'}),available=images.filter(Boolean);let index=0;for(const image of images){if(image){const imageIndex=index++;const element=group.createEl('img',{attr:{src:image,alt:'笔记图片',loading:'lazy'}});if(app&&element){element.tabIndex=0;element.setAttribute('role','button');element.setAttribute('aria-label','查看笔记图片');const open=()=>new ImageViewer(app,available,imageIndex).open();element.onclick=open;element.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();open();}};}}else group.createDiv({cls:'fomo-image-unavailable',text:'图片不可用或内容已变化'});}
}
async function loadReferenceCandidates(vault,folder){
 if(!validFolder(folder)||/[\\:]/.test(folder))throw Error('请先设置有效的 Fomo 专用文件夹');
 const files=vault.getMarkdownFiles().filter(file=>file.path.startsWith(folder+'/')),notes=[];
 for(const file of files){const parsed=parse(await vault.cachedRead(file));if(parsed)notes.push({...parsed,file});}
 const counts=new Map();for(const note of notes)counts.set(note.id,(counts.get(note.id)||0)+1);
 return notes.filter(note=>counts.get(note.id)===1).sort((a,b)=>b.created.localeCompare(a.created));
}
function insertReference(editor,note,selection){
 if(!validId(note?.id)||editor.value!==selection.value)throw Error('草稿已变化，请重新选择引用');
 const token='fomo://note/'+note.id,from=selection.start,to=selection.end;
 editor.setRangeText(token,from,to,'end');editor.dispatchEvent(new Event('input',{bubbles:true}));editor.focus();
}
class ReferencePicker extends FuzzySuggestModal{
 constructor(app,notes,onSelect){super(app);this.notes=notes;this.onSelect=onSelect;this.setPlaceholder('搜索需要引用的笔记');}
 getItems(){return this.notes;}
 getItemText(note){return new Date(note.created).toLocaleDateString('zh-CN')+' '+note.content.replace(/\s+/g,' ').trim().slice(0,120);}
 onChooseItem(note){this.onSelect(note);}
}
class CardsView extends ItemView {
 constructor(leaf,plugin){super(leaf);this.plugin=plugin;this.filter='';this.starredOnly=false;this.renderVersion=0;this.editing=false;this.review=false;this.creating=false;this.foldObservers=[];this.expandedNotes=new Set();}
 getViewType(){return VIEW;}getDisplayText(){return 'Fomo';}getIcon(){return 'notebook-pen';}
 async onOpen(){this.containerEl.addClass('fomo-obsidian-container');this.drawShell();await this.render();}
 async onClose(){this.renderVersion++;for(const observer of this.foldObservers)observer.disconnect();this.foldObservers=[];}
 async createReflection(note,folder,content,identity={id:crypto.randomUUID(),created:new Date().toISOString()}){
  if(!validFolder(folder)||this.plugin.folder()!==folder||!validId(note.id)||typeof content!=='string'||!content.trim())throw Error('联想内容或专用文件夹无效');
  if(!validId(identity?.id)||identity.id===note.id||!Number.isFinite(Date.parse(identity.created)))throw Error('联想草稿身份无效');
  const vault=this.app.vault,file=note.file,originalPath=file?.path;if(!(file instanceof TFile)||!originalPath.startsWith(folder+'/')||vault.getAbstractFileByPath(originalPath)!==file)throw Error('联想来源已移动或不存在');
  const source=parse(await vault.read(file));if(this.plugin.folder()!==folder||file.path!==originalPath||vault.getAbstractFileByPath(originalPath)!==file||!source||source.id!==note.id||source.created!==note.created)throw Error('联想来源已变化，请重新打开');
  const {id,created}=identity,target=`${folder}/${id}.md`,expected=encode({id,created,content:content.trim(),relatedTo:note.id,source:'reflection'});
  const existing=async()=>{const item=vault.getAbstractFileByPath(target);if(!item)return false;if(!(item instanceof TFile)||item.path!==target)throw Error('联想文件位置已被占用，请检查草稿');const actual=await vault.read(item);if(this.plugin.folder()!==folder||item.path!==target||vault.getAbstractFileByPath(target)!==item||actual!==expected)throw Error('同名联想内容不一致，请检查草稿');return true;};
  if(await existing())return id;if(this.plugin.folder()!==folder||file.path!==originalPath||vault.getAbstractFileByPath(originalPath)!==file)throw Error('联想来源已变化，请重新打开');try{await vault.create(target,expected);}catch(error){if(await existing())return id;throw error;}return id;
 }
 openReflection(card,note,folder){
  if(this.editing){new Notice('请先保存或取消当前编辑');return;}if(this.plugin.folder()!==folder){new Notice('专用文件夹已改变，请重新打开');return;}this.editing=true;
  const key=reflectionDraftKey(this.app.vault,folder,note.id),editor=card.createEl('textarea',{cls:'fomo-inline-editor',attr:{placeholder:'写下此刻的联想…','aria-label':'回顾联想'}});let identity={id:crypto.randomUUID(),created:new Date().toISOString()};if(!key)new Notice('无法确认知识库位置，联想草稿不会自动保存');try{const draft=key&&JSON.parse(localStorage.getItem(key)||'null');if(draft?.created===note.created&&typeof draft.content==='string'){editor.value=draft.content;if(validId(draft.identity?.id)&&draft.identity.id!==note.id&&Number.isFinite(Date.parse(draft.identity.created)))identity=draft.identity;}}catch{}editor.oninput=()=>{try{if(key)localStorage.setItem(key,JSON.stringify({created:note.created,content:editor.value,identity}));}catch{}};
  const controls=card.createDiv({cls:'fomo-inline-actions'}),cancel=controls.createEl('button',{text:'取消'}),save=controls.createEl('button',{text:'记录联想',cls:'mod-cta'});cancel.onclick=()=>{if(editor.value&&!window.confirm('放弃这条未保存的联想？'))return;try{if(key)localStorage.removeItem(key);}catch{}this.editing=false;editor.remove();controls.remove();this.render();};
  save.onclick=async()=>{if(!editor.value.trim())return;editor.oninput();save.disabled=true;cancel.disabled=true;editor.readOnly=true;try{await this.createReflection(note,folder,editor.value,identity);try{if(key)localStorage.removeItem(key);}catch{}this.editing=false;try{await this.render();}catch{new Notice('联想已保存，列表刷新失败');}}catch(error){new Notice('联想未保存：'+error.message);save.disabled=false;cancel.disabled=false;editor.readOnly=false;}};editor.focus();
 }
 loadComposerDraft(){this.composerFolder=this.plugin.folder();this.composerIdentity={id:crypto.randomUUID(),created:new Date().toISOString()};this.composerPending=null;this.composerKey=composerDraftKey(this.app.vault,this.composerFolder);if(!this.composerKey){new Notice('无法确认知识库位置，草稿不会自动保存');return;}try{const draft=JSON.parse(localStorage.getItem(this.composerKey)||'null');if(draft?.version===1&&typeof draft.content==='string'){this.editor.value=draft.content;if(validId(draft.identity?.id)&&Number.isFinite(Date.parse(draft.identity.created)))this.composerIdentity=draft.identity;if(typeof draft.pending?.content==='string'&&draft.pending.content.trim()&&validId(draft.pending.identity?.id)&&Number.isFinite(Date.parse(draft.pending.identity.created)))this.composerPending=draft.pending;}}catch{}}
 saveComposerDraft(){if(!this.composerKey)return;try{localStorage.setItem(this.composerKey,JSON.stringify({version:1,content:this.editor.value,identity:this.composerIdentity,pending:this.composerPending||null}));}catch{new Notice('草稿暂时无法自动保存，请先复制内容');}}
 clearComposerDraft(submitted,identity){if(!this.composerKey)return;try{const draft=JSON.parse(localStorage.getItem(this.composerKey)||'null');if(draft?.version===1&&draft.content===submitted&&draft.identity?.id===identity.id)localStorage.removeItem(this.composerKey);}catch{}}
 async chooseReference(editor=this.editor,excludeId=''){
  if(editor===this.editor&&this.editing){new Notice('请先保存或取消当前编辑');return;}
  if(editor.readOnly||editor.isConnected===false){new Notice('编辑器不可用，请重新打开');return;}
  const selection={value:editor.value,start:editor.selectionStart,end:editor.selectionEnd};
  try{const folder=this.plugin.folder(),notes=(await loadReferenceCandidates(this.app.vault,folder)).filter(note=>note.id!==excludeId);if(!notes.length){new Notice('Fomo 专用文件夹中没有可引用的笔记');return;}new ReferencePicker(this.app,notes,async note=>{try{if(editor.readOnly||editor.isConnected===false)throw Error('编辑器已关闭，请重新打开');if(this.plugin.folder()!==folder)throw Error('专用文件夹已改变，请重新选择引用');const current=await loadReferenceCandidates(this.app.vault,folder);if(!current.some(item=>item.id===note.id&&item.file.path===note.file.path))throw Error('目标笔记已变化，请重新选择引用');if(editor.readOnly||editor.isConnected===false)throw Error('编辑器已关闭，请重新打开');insertReference(editor,note,selection);}catch(error){new Notice(error.message);}}).open();}catch(error){new Notice('无法读取引用笔记：'+error.message);}
 }
 drawShell(){
  const root=this.contentEl;root.empty();root.addClass('fomo-obsidian');
  const head=root.createDiv({cls:'fomo-head'});head.createEl('strong',{text:'全部笔记',cls:'fomo-title'});
  this.search=head.createEl('input',{cls:'fomo-search',attr:{placeholder:'搜索笔记或标签','aria-label':'搜索笔记'}});this.search.oninput=()=>{this.filter=this.search.value.trim().toLowerCase();this.render();};
  const composer=root.createDiv({cls:'fomo-composer'});this.editor=composer.createEl('textarea',{cls:'fomo-editor',attr:{placeholder:'记录此刻的想法…','aria-label':'新建笔记'}});this.loadComposerDraft();
  const bar=composer.createDiv({cls:'fomo-bar'}),reference=bar.createEl('button',{text:'@',cls:'fomo-reference-button',attr:{'aria-label':'引用笔记',title:'引用笔记'}});reference.onmousedown=event=>event.preventDefault();reference.onclick=()=>this.chooseReference();
  const spacer=bar.createSpan({cls:'fomo-bar-spacer'});this.charCount=bar.createSpan({cls:'fomo-char-count'});const updateCount=()=>this.charCount.setText(`${Array.from(this.editor.value).length} 字`);this.editor.oninput=()=>{this.saveComposerDraft();updateCount();};updateCount();
  const save=bar.createEl('button',{text:'➤',cls:'fomo-save-button',attr:{'aria-label':'记录',title:'记录'}});save.onclick=()=>this.create();
  const controls=root.createDiv({cls:'fomo-controls'});this.count=controls.createSpan({cls:'fomo-count'});const actions=controls.createDiv({cls:'fomo-controls-actions'});
  this.reviewButton=actions.createEl('button',{text:'每日回顾',attr:{'aria-pressed':'false'}});this.reviewButton.onclick=()=>{if(this.editing){new Notice('请先保存或取消当前编辑');return;}this.review=!this.review;this.reviewButton.setText(this.review?'返回全部':'每日回顾');this.reviewButton.setAttribute('aria-pressed',String(this.review));this.render();};
  this.starFilter=actions.createEl('button',{text:'只看收藏',attr:{'aria-pressed':'false'}});this.starFilter.onclick=()=>{if(this.editing){new Notice('请先保存或取消当前编辑');return;}this.starredOnly=!this.starredOnly;this.starFilter.setAttribute('aria-pressed',String(this.starredOnly));this.render();};this.list=root.createDiv({cls:'fomo-list'});
 }
 async create(){
  if(this.creating)return;if(this.editing){new Notice('请先保存或取消当前编辑');return;}
  const submitted=this.composerPending?.content??this.editor.value,content=submitted.trim();if(!content)return;
  const folder=this.plugin.folder();
  if(this.composerFolder!==undefined&&this.composerFolder!==folder){new Notice('专用文件夹已更改，请重新打开卡片流后再记录');return;}
  if(!validFolder(folder)||!this.app.vault.getAbstractFileByPath(folder)){new Notice('请先在设置中选择已存在的 Fomo 专用文件夹');return;}
  this.creating=true;try{
   const identity=this.composerPending?.identity||this.composerIdentity||(this.composerIdentity={id:crypto.randomUUID(),created:new Date().toISOString()}),{id,created}=identity,vault=this.app.vault,target=`${folder}/${id}.md`,expected=encode({id,created,content});this.composerPending={identity,content:submitted};this.saveComposerDraft();
   const existing=async()=>{const item=vault.getAbstractFileByPath(target);if(!item)return false;if(!(item instanceof TFile)||item.path!==target)throw Error('笔记文件位置已被占用，请保留草稿并检查');const actual=await vault.read(item);if(this.plugin.folder()!==folder||item.path!==target||vault.getAbstractFileByPath(target)!==item||actual!==expected)throw Error('同名笔记内容不一致，请保留草稿并检查');return true;};
   try{if(!await existing()){if(this.plugin.folder()!==folder||!vault.getAbstractFileByPath(folder))throw Error('专用文件夹已变化');try{await vault.create(target,expected);}catch(error){if(!await existing())throw error;}}}catch(error){new Notice('保存失败：'+error.message);return;}
   const changed=this.editor.value!==submitted;this.composerPending=null;this.composerIdentity={id:crypto.randomUUID(),created:new Date().toISOString()};if(!changed){this.editor.value='';this.charCount?.setText('0 字');this.clearComposerDraft(submitted,identity);}else{try{const draft=this.composerKey&&JSON.parse(localStorage.getItem(this.composerKey)||'null');if(draft?.pending?.identity?.id===identity.id&&draft.content===this.editor.value)this.saveComposerDraft();}catch{}}
   try{await this.render();}catch{new Notice('笔记已保存，列表刷新失败');return;}
   new Notice(changed?'已记录提交的内容，编辑框中的后续更改已保留':'已记录');
  }finally{this.creating=false;}
 }
 async render(){if(this.editing)return;for(const observer of this.foldObservers)observer.disconnect();this.foldObservers=[];const version=++this.renderVersion,folder=this.plugin.folder(),reviewDate=new Date(),day=reviewDay(reviewDate);if(!validFolder(folder)){this.count.setText('');this.list.empty();this.list.createDiv({cls:'fomo-empty',text:'请在设置中填写有效的 Fomo 专用文件夹'});return;}const files=this.app.vault.getMarkdownFiles().filter(f=>f.path.startsWith(folder+'/'));const notes=[];for(const file of files){const note=parse(await this.app.vault.cachedRead(file));if(note)notes.push({...note,file});}if(version!==this.renderVersion||this.editing||folder!==this.plugin.folder())return;const cache=this.app.metadataCache,relations=relationsForNotes(notes,cache?(link,source)=>cache.getFirstLinkpathDest(link,source):undefined,cache?file=>cache.getFileCache(file)?.links:undefined),visible=this.review?reviewNotes(notes,reviewDate,this.filter,this.starredOnly,this.plugin.settings?.reviewOptions):filterNotes(notes,this.filter,this.starredOnly);visible.sort((a,b)=>b.created.localeCompare(a.created));const reviewed=this.review?reviewedIds(this.plugin.settings,folder,day):[];this.count.setText(this.review?`${visible.length} 条 · 已回顾 ${visible.filter(note=>reviewed.includes(note.id)).length}（仅 Obsidian）`:`${visible.length} 条`);this.list.empty();if(!visible.length){this.list.createDiv({cls:'fomo-empty',text:this.review?'今日暂无匹配的回顾笔记':'暂无匹配的笔记'});return;}for(const note of visible){if(version!==this.renderVersion||this.editing||folder!==this.plugin.folder())return;const card=this.list.createDiv({cls:'fomo-card'}),top=card.createDiv({cls:'fomo-card-head'});top.createEl('time',{text:new Date(note.created).toLocaleString('zh-CN')});const star=top.createEl('button',{text:note.starred?'取消收藏':'收藏',attr:{'aria-pressed':String(!!note.starred)}});star.onclick=async()=>{if(this.editing){new Notice('请先保存或取消当前编辑');return;}star.disabled=true;const starPath=note.file.path;try{await this.app.vault.process(note.file,current=>{if(this.plugin.folder()!==folder||note.file.path!==starPath||this.app.vault.getAbstractFileByPath(starPath)!==note.file)throw Error('笔记或专用文件夹已变化');const checked=parse(updateIfUnchanged(current,note,note.content));return encode({...checked,starred:!checked.starred});});await this.render();}catch(error){new Notice('收藏操作失败：'+error.message);star.disabled=false;}};const open=top.createEl('button',{text:'打开'});open.onclick=()=>this.app.workspace.getLeaf(false).openFile(note.file);const copy=top.createEl('button',{text:'复制',attr:{'aria-label':'复制笔记正文'}});copy.onclick=async()=>{try{await navigator.clipboard.writeText(note.content);new Notice('已复制正文');}catch{new Notice('复制失败，请检查剪贴板权限');}};const edit=top.createEl('button',{text:'编辑'});edit.onclick=()=>{if(this.editing){new Notice('请先保存或取消当前编辑');return;}this.editing=true;const editPath=note.file.path,editDraftKey=inlineDraftKey(this.app.vault,folder,note.id),editor=card.createEl('textarea',{cls:'fomo-inline-editor',attr:{'aria-label':'编辑笔记'}});let saved=null,legacy=null;if(!editDraftKey)new Notice('无法确认知识库位置，草稿不会自动保存');try{saved=readInlineDraft(localStorage,editDraftKey,note);legacy=readInlineDraft(localStorage,'fomo-cards-draft:'+note.id,note);}catch{}editor.value=typeof saved==='string'?saved:note.content;const originalHeight=body.getBoundingClientRect?.().height||0;body.hidden=true;const expandControl=card.querySelector?.('.fomo-expand');if(expandControl)expandControl.hidden=true;body.before(editor);const resizeEditor=()=>{if(!editor.style)return;editor.style.height='auto';editor.style.height=Math.max(100,originalHeight,editor.scrollHeight||0)+'px';};resizeEditor();editor.oninput=()=>{resizeEditor();try{if(editDraftKey)localStorage.setItem(editDraftKey,JSON.stringify({id:note.id,created:note.created,content:editor.value}));}catch{new Notice('草稿暂时无法自动保存，请先复制内容');}};const controls=card.createDiv({cls:'fomo-inline-actions'});editor.after(controls);const reference=controls.createEl('button',{text:'@ 引用笔记'}),cancel=controls.createEl('button',{text:'取消'}),save=controls.createEl('button',{text:'保存',cls:'mod-cta'});let recover;if(legacy!==null){recover=controls.createEl('button',{text:'取回旧草稿'});recover.onclick=()=>{if(!window.confirm('旧草稿没有记录所属知识库，确认它属于当前笔记并替换编辑框内容？'))return;editor.value=legacy;editor.oninput();};}reference.onmousedown=event=>event.preventDefault();reference.onclick=()=>this.chooseReference(editor,note.id);cancel.onclick=()=>{if(editor.value!==note.content&&!window.confirm('放弃本条未保存的编辑？'))return;try{clearInlineDraft(localStorage,editDraftKey,note,editor.value);}catch{}this.editing=false;body.hidden=false;editor.remove();controls.remove();this.render();};save.onclick=async()=>{save.disabled=true;cancel.disabled=true;reference.disabled=true;if(recover)recover.disabled=true;editor.readOnly=true;const submitted=editor.value;try{await this.app.vault.process(note.file,current=>{if(this.plugin.folder()!==folder||note.file.path!==editPath||this.app.vault.getAbstractFileByPath(editPath)!==note.file)throw Error('笔记或专用文件夹已变化');return updateIfUnchanged(current,note,submitted);});}catch(error){new Notice('保存失败：'+error.message);save.disabled=false;cancel.disabled=false;reference.disabled=false;if(recover)recover.disabled=false;editor.readOnly=false;return;}try{clearInlineDraft(localStorage,editDraftKey,note,submitted);}catch{}this.editing=false;try{await this.render();}catch{new Notice('笔记已保存，列表刷新失败');}};editor.onkeydown=event=>{if(event.isComposing||event.keyCode===229)return;if((event.ctrlKey||event.metaKey)&&event.key==='Enter'){event.preventDefault();save.click();}else if(event.key==='Escape'){event.preventDefault();cancel.click();}};editor.focus();};const remove=top.createEl('button',{text:'删除'});remove.onclick=async()=>{if(this.editing){new Notice('请先保存或取消当前编辑');return;}if(!window.confirm('将这条笔记移入 Obsidian 回收站？'))return;remove.disabled=true;try{await this.plugin.trashWithJournal(note);await this.render();}catch(e){new Notice('删除未完成：'+e.message);remove.disabled=false;}};const body=card.createDiv({cls:'fomo-card-body'});body.ondblclick=event=>{if(this.editing||event.target.closest?.('a,button,input,textarea,select,[contenteditable]'))return;event.preventDefault();edit.onclick();};await MarkdownRenderer.render(this.app,note.content,body,note.file.path,this);if(version!==this.renderVersion||this.editing||folder!==this.plugin.folder())return;renderInlineReferences(body,notes,this.app);if(!this.review)setupBodyFold(card,body,this.foldObservers,this.expandedNotes,note.id);await renderImageAssets(card,note,this.app.vault,folder,()=>version===this.renderVersion&&!this.editing&&folder===this.plugin.folder(),this.app);if(version!==this.renderVersion||this.editing||folder!==this.plugin.folder())return;renderRelations(card,note,relations,this.app);if(this.review)renderReviewAction(card,note,this,day);}}
}
function showPendingDeletions(container,plugin,refresh){
 const journal=plugin.settings.deletionJournal;if(!Array.isArray(journal))return;
 const pending=journal.filter(row=>row?.folder===plugin.folder()&&(row.status==='pending'||typeof row.concurrentText==='string'||Array.isArray(row.concurrentTexts)));if(!pending.length)return;
 const section=container.createDiv({cls:'fomo-pending-deletions'});section.createEl('h3',{text:'待确认的删除'});section.createEl('p',{text:'原位置仍有同一笔记时，可取消待确认状态；原始保护副本会保留。'});
 for(const record of pending.slice(0,50)){const row=section.createDiv({cls:'fomo-pending-row'});row.createEl('span',{text:typeof record.path==='string'?record.path:'路径无效'});const copies=Array.isArray(record.concurrentTexts)?record.concurrentTexts.filter(text=>typeof text==='string'):typeof record.concurrentText==='string'?[record.concurrentText]:[];if(copies.length){row.createEl('p',{text:'删除期间检测到编辑，以下是各编辑器的保护副本，请检查并复制需要的内容：'});for(const [index,text] of copies.entries()){const copy=row.createEl('textarea',{attr:{readonly:'readonly','aria-label':'删除期间编辑的保护副本 '+(index+1)}});copy.value=text;}}if(record.status==='pending'){const button=row.createEl('button',{text:'确认笔记仍在'});button.onclick=async()=>{if(!window.confirm('确认检查原位置，并取消这条待确认删除？不会删除文件，保护副本会保留。'))return;button.disabled=true;try{await plugin.cancelPendingDeletion(record.id);new Notice('待确认状态已取消，保护副本仍保留');refresh();}catch(error){new Notice('无法确认：'+error.message);button.disabled=false;}};}}
 if(pending.length>50)section.createEl('p',{text:'仅显示前 50 条，请处理后重新打开设置。'});
}
function addReviewSettings(container,plugin){
 const current=reviewOptions(plugin.settings.reviewOptions);container.createEl('h3',{text:'每日回顾'});container.createEl('p',{text:'以下范围仅在 Obsidian 中生效，回顾标记可在 Fomo 同步设置中手动合并。'});
 const change=(key,value)=>plugin.updateReviewOption(key,value).catch(error=>new Notice('回顾设置未保存：'+error.message));
 new Setting(container).setName('回顾数量').addDropdown(drop=>{for(const n of [4,8,12,16,20,24])drop.addOption(String(n),String(n)+' 条');drop.setValue(String(current.count)).onChange(value=>change('count',Number(value)));});
 new Setting(container).setName('时间范围').addDropdown(drop=>{for(const [value,label] of [['all','全部时间'],['12','最近 12 个月'],['6','最近 6 个月'],['3','最近 3 个月'],['1','最近 1 个月']])drop.addOption(value,label);drop.setValue(current.period).onChange(value=>change('period',value));});
 new Setting(container).setName('包含标签').setDesc('填写标签名，包含其子标签。').addText(text=>text.setValue(current.include).onChange(value=>change('include',value)));
 new Setting(container).setName('排除标签').setDesc('填写标签名，排除其子标签。').addText(text=>text.setValue(current.exclude).onChange(value=>change('exclude',value)));
 new Setting(container).setName('仅无标签笔记').addToggle(toggle=>toggle.setValue(current.noTags).onChange(value=>change('noTags',value)));
}
class Settings extends PluginSettingTab {constructor(app,plugin){super(app,plugin);this.plugin=plugin;}display(){this.containerEl.empty();this.containerEl.createEl('h2',{text:'Fomo Cards'});new Setting(this.containerEl).setName('Fomo 专用文件夹').setDesc('填写库中的相对文件夹路径；请使用已存在的专用文件夹。').addText(t=>t.setValue(this.plugin.settings.folder).onChange(async value=>{await this.plugin.updateSettings(settings=>{settings.folder=value.trim().replace(/^\/+|\/+$/g,'');});this.plugin.refreshViews();}));this.containerEl.createEl('p',{text:'提供卡片流、快速记录、引用关系与每日回顾。桌面端同步仍为实验性功能，部分格式和删除场景尚未完成。'});const bridgeRow=this.containerEl.createDiv({cls:'fomo-bridge'}),bridgeButton=bridgeRow.createEl('button',{text:this.plugin.bridge?'关闭同步连接':'开启同步连接'}),code=bridgeRow.createEl('input',{attr:{type:'text',readonly:'readonly','aria-label':'临时配对码',placeholder:'开启后生成临时配对码'}});if(this.plugin.bridge)code.value=this.plugin.bridge.port+':'+this.plugin.bridge.secret;bridgeButton.onclick=async()=>{bridgeButton.disabled=true;try{if(this.plugin.bridge){await this.plugin.stopSyncBridge();code.value='';bridgeButton.setText('开启同步连接');}else{code.value=await this.plugin.startSyncBridge();bridgeButton.setText('关闭同步连接');} }catch(error){new Notice('同步连接失败：'+error.message);}finally{bridgeButton.disabled=false;}};this.containerEl.createEl('p',{text:'开启后将临时配对码粘贴到 Fomo；关闭 Obsidian 后连接失效。请勿分享配对码。'});addReviewSettings(this.containerEl,this.plugin);showPendingDeletions(this.containerEl,this.plugin,()=>this.display());this.containerEl.createEl('p',{text:'AI 直接使用 Obsidian 中已安装的 Claudian：可在 Claudian 中引用 Fomo 文件夹、单条笔记或当前笔记；Fomo Cards 不重复提供 AI 会话。'});}}
module.exports=class FomoPlugin extends Plugin {
 async onload(){this.unloaded=false;this.settings=Object.assign({folder:'Fomo'},await this.loadData());this.settingsWrites=Promise.resolve();this.registerView(VIEW,leaf=>new CardsView(leaf,this));this.addRibbonIcon('notebook-pen','打开 Fomo',()=>this.open());this.addCommand({id:'open-fomo',name:'打开 Fomo 卡片流',callback:()=>this.open()});this.addSettingTab(new Settings(this.app,this));const refresh=(file,oldPath)=>this.scheduleRefresh(file,oldPath);for(const event of ['create','modify','delete','rename'])this.registerEvent(this.app.vault.on(event,refresh));if(this.app.metadataCache)this.registerEvent(this.app.metadataCache.on('changed',file=>this.scheduleRefresh(file)));this.app.workspace.onLayoutReady?.(()=>{if(!this.unloaded)this.refreshViews();});}
 refreshViews(){for(const leaf of this.app.workspace?.getLeavesOfType?.(VIEW)||[])Promise.resolve().then(()=>leaf.view.render()).catch(()=>{});}
 scheduleRefresh(file,oldPath){const folder=this.folder();if(this.unloaded||this.app.workspace?.layoutReady===false||!validFolder(folder))return;const inside=value=>typeof value==='string'&&(value===folder||value.startsWith(folder+'/'));if(!inside(file?.path)&&!inside(oldPath))return;clearTimeout(this.refreshTimer);this.refreshTimer=setTimeout(()=>{this.refreshTimer=null;if(this.folder()===folder)this.refreshViews();},120);}
 updateSettings(change){const operation=this.settingsWrites.then(async()=>{const next=structuredClone(this.settings);change(next);await this.saveData(next);this.settings=next;});this.settingsWrites=operation.catch(()=>{});return operation;}
 async updateReviewOption(key,value){
  if(key==='count'&&![4,8,12,16,20,24].includes(value))throw Error('回顾数量无效');if(key==='period'&&!['all','12','6','3','1'].includes(value))throw Error('回顾时间范围无效');if(key==='noTags'&&typeof value!=='boolean')throw Error('回顾筛选无效');
  if(key==='include'||key==='exclude'){if(typeof value!=='string')throw Error('标签无效');value=value.trim().replace(/^#/,'').replace(/\/+$/g,'').replace(/\/{2,}/g,'/');if(value&&(value.length>200||reviewTags('#'+value)[0]!==value))throw Error('标签无效');}else if(!['count','period','noTags'].includes(key))throw Error('回顾设置无效');
  await this.updateSettings(settings=>{settings.reviewOptions={...reviewOptions(settings.reviewOptions),[key]:value};});for(const leaf of this.app?.workspace?.getLeavesOfType?.(VIEW)||[])Promise.resolve().then(()=>leaf.view.render()).catch(()=>{});
 }
 async markReviewed(id,folder,day){if(!validId(id)||!validFolder(folder)||day!==reviewDay(new Date()))throw Error('回顾日期或笔记已变化，请重新打开');await this.updateSettings(settings=>{if(settings.folder!==folder||day!==reviewDay(new Date()))throw Error('回顾日期或文件夹已变化，请重新打开');const ids=reviewedIds(settings,folder,day);if(ids.includes(id))return;if(ids.length>=10000)throw Error('今日回顾记录已满');const key=reviewFolderKey(folder);settings.reviewProgress||={};settings.reviewProgress[key]||={};settings.reviewProgress[key][day]=[...ids,id];});}
 async reviewSnapshot(folder,requested){
  if(!validFolder(folder)||this.folder()!==folder||!Array.isArray(requested)||requested.length>10000||requested.some(n=>!validId(n?.id)||typeof n.created!=='string'||!Number.isFinite(Date.parse(n.created)))||new Set(requested.map(n=>n.id)).size!==requested.length)throw Error('回顾同步身份无效');
  const vault=this.app.vault,files=vault.getMarkdownFiles().filter(f=>f.path.startsWith(folder+'/'));if(files.length>10000)throw Error('同步文件夹过大');const seen=new Map();
  for(const file of files){const originalPath=file.path,text=await vault.read(file);if(this.folder()!==folder||file.path!==originalPath||vault.getAbstractFileByPath(originalPath)!==file)throw Error('同步文件夹或笔记已变化');const note=parse(text);if(note){if(seen.has(note.id))seen.set(note.id,null);else seen.set(note.id,note.created);}}
  if(requested.some(n=>seen.get(n.id)!==n.created))throw Error('回顾同步笔记身份已变化，请重新检查');await this.settingsWrites;if(this.folder()!==folder)throw Error('同步文件夹已改变，请重新连接');
  const all=this.settings.reviewProgress;if(all!==undefined&&(!all||typeof all!=='object'||Array.isArray(all)))throw Error('回顾进度无法读取');const saved=all?.[reviewFolderKey(folder)],group=saved===undefined?{}:saved;if(!group||typeof group!=='object'||Array.isArray(group)||Object.keys(group).length>10000)throw Error('回顾进度无法读取');const allowed=new Set(requested.map(n=>n.id)),result={};let total=0;
  for(const day of Object.keys(group).sort()){if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('回顾进度无法读取');const ids=reviewedIds(this.settings,folder,day);total+=ids.length;if(total>100000)throw Error('回顾进度过大');const selected=ids.filter(id=>allowed.has(id));if(selected.length)result[day]=selected;}
  return result;
 }
 async mergeReviewProgress(folder,requested,progress){
  if(!progress||typeof progress!=='object'||Array.isArray(progress)||Object.keys(progress).length>10000)throw Error('回顾进度格式无效');
  if(!Array.isArray(requested))throw Error('回顾同步身份无效');const allowed=new Set(requested.map(n=>n?.id));let total=0;
  for(const [day,ids] of Object.entries(progress)){if(!/^\d{4}-\d{2}-\d{2}$/.test(day)||!Array.isArray(ids)||ids.some(id=>!validId(id)||!allowed.has(id))||new Set(ids).size!==ids.length)throw Error('回顾进度格式无效');total+=ids.length;if(total>100000)throw Error('回顾进度过大');}
  await this.reviewSnapshot(folder,requested);
  await this.updateSettings(settings=>{if(settings.folder!==folder)throw Error('同步文件夹已改变，请重新连接');const key=reviewFolderKey(folder),all=settings.reviewProgress;if(all!==undefined&&(!all||typeof all!=='object'||Array.isArray(all)))throw Error('回顾进度无法读取');const existing=all?.[key],group=existing===undefined?{}:existing;if(!group||typeof group!=='object'||Array.isArray(group))throw Error('回顾进度无法读取');const days=new Set([...Object.keys(group),...Object.keys(progress)]);if(days.size>10000)throw Error('回顾进度过大');let count=0;const merged={};for(const day of days){if(!/^\d{4}-\d{2}-\d{2}$/.test(day))throw Error('回顾进度无法读取');const ids=[...new Set([...reviewedIds(settings,folder,day),...(progress[day]||[])])];count+=ids.length;if(ids.length>10000||count>100000)throw Error('回顾进度过大');merged[day]=ids;}settings.reviewProgress||={};settings.reviewProgress[key]=merged;});for(const leaf of this.app.workspace?.getLeavesOfType?.(VIEW)||[])Promise.resolve().then(()=>leaf.view.render()).catch(()=>{});return true;
 }
 async trashWithJournal(note,expectedText){
  const folder=this.folder(),file=note.file,originalPath=file?.path;
  if(!validFolder(folder)||/[\\:]/.test(folder)||!(file instanceof TFile)||!file.path.startsWith(folder+'/')||this.app.vault.getAbstractFileByPath(file.path)!==file)throw Error('笔记已移动或不在专用文件夹中');
  const text=await this.app.vault.read(file),parsed=parse(text);if(this.folder()!==folder||file.path!==originalPath||this.app.vault.getAbstractFileByPath(originalPath)!==file)throw Error('笔记已移动或不在专用文件夹中');if(expectedText!==undefined&&text!==expectedText)throw Error('笔记已变化，请重新预览');
  const checkEditors=()=>{for(const leaf of this.app.workspace?.getLeavesOfType?.('markdown')||[]){const view=leaf.view;if(view?.file===file&&view.editor&&view.editor.getValue()!==text)throw Error('笔记在 Obsidian 编辑器中有未保存的修改，请先保存');}};checkEditors();
  if(!parsed||parsed.id!==note.id||parsed.created!==note.created||parsed.content!==note.content||JSON.stringify(noteMetadata(parsed))!==JSON.stringify(noteMetadata(note)))throw Error('笔记已变化，请重新打开后再删除');
  if(Buffer.byteLength(text,'utf8')>2*1024*1024)throw Error('笔记过大，无法创建删除保护记录');
  const id=nodeCrypto.randomUUID(),event={id,noteId:note.id,folder,path:file.path,created:note.created,fileHash:nodeCrypto.createHash('sha256').update(JSON.stringify(text)).digest('hex'),text,status:'pending'};
  await this.updateSettings(settings=>{if(settings.deletionJournal!==undefined&&!Array.isArray(settings.deletionJournal))throw Error('删除记录无法读取，已停止删除');const journal=settings.deletionJournal||[];if(journal.length>=1000)throw Error('删除保护记录已满，已停止删除');if(journal.some(row=>row?.noteId===note.id&&row.status==='pending'))throw Error('此笔记有未完成的删除记录，请先检查');settings.deletionJournal=[...journal,event];});
  let changed=false,editorChanged=false,captureFailed=false;const editorCopies=new Map(),watchedPath=file.path,vault=this.app.vault,workspace=this.app.workspace,watch=typeof vault.on==='function'?vault.on('modify',item=>{if(item===file||item?.path===watchedPath)changed=true;}):null,editorWatch=typeof workspace?.on==='function'?workspace.on('editor-change',(editor,info)=>{if(info?.file===file||info?.file?.path===watchedPath){editorChanged=true;try{const text=editor.getValue();if(typeof text!=='string'||Buffer.byteLength(text,'utf8')>2*1024*1024||(!editorCopies.has(editor)&&editorCopies.size>=16)){captureFailed=true;return;}editorCopies.set(editor,text);}catch{captureFailed=true;}}}):null;let failure;
  try{
   const current=await vault.read(file);if(this.folder()!==folder||file.path!==watchedPath||vault.getAbstractFileByPath(watchedPath)!==file||current!==text||changed||editorChanged)throw Error('笔记已变化，未删除；保护记录已保留');checkEditors();
   // Use the vault-local trash explicitly: the user's general deletion setting
   // can be permanent deletion, which cannot satisfy the sync contract.
   try{await vault.trash(file,false);}catch(error){throw Error('回收站操作未确认，保护记录已保留：'+error.message);}
   if(changed||editorChanged)throw Error('回收站操作期间笔记发生修改，删除状态未确认；请检查回收站和保护记录');
  }catch(error){failure=error;}finally{if(watch&&typeof vault.offref==='function')vault.offref(watch);if(editorWatch&&typeof workspace.offref==='function')workspace.offref(editorWatch);}
  if(editorChanged){const copies=[...editorCopies.values()];if(copies.length)try{await this.updateSettings(settings=>{const saved=settings.deletionJournal?.find(row=>row.id===id);if(!saved||saved.status!=='pending')throw Error('删除保护记录无效');if(copies.length===1)saved.concurrentText=copies[0];else saved.concurrentTexts=copies;});}catch{captureFailed=true;}if(captureFailed||!copies.length)throw Error('删除期间部分编辑内容无法保存保护副本，请立即检查打开的编辑器和回收站');if(!failure)failure=Error('删除期间笔记发生修改，请检查回收站和保护记录');}
  if(failure)throw failure;
  try{await this.updateSettings(settings=>{const event=settings.deletionJournal?.find(row=>row.id===id);if(!event||event.status!=='pending')throw Error('删除保护记录无效');event.status='confirmed';});}catch(error){throw Error('笔记已移入回收站，但删除记录未确认：'+error.message);}
 }
 async cancelPendingDeletion(eventId){
  const journal=this.settings.deletionJournal;if(!Array.isArray(journal))throw Error('删除保护记录无法读取');
  const record=journal.find(row=>row?.id===eventId&&row.status==='pending');if(!record)throw Error('待确认记录不存在或已处理');
  const folder=this.folder();if(!validFolder(folder)||/[\\:]/.test(folder)||record.folder!==folder||typeof record.path!=='string'||!record.path.startsWith(folder+'/'))throw Error('记录不属于当前专用文件夹');
  const file=this.app.vault.getAbstractFileByPath(record.path);if(!(file instanceof TFile)||file.path!==record.path)throw Error('原位置没有找到笔记，请先检查 Obsidian 回收站');
  const current=parse(await this.app.vault.read(file));if(!current||current.id!==record.noteId||current.created!==record.created)throw Error('原位置的笔记身份不匹配，请先人工检查');
  const snapshot=JSON.stringify(record);await this.updateSettings(settings=>{const saved=settings.deletionJournal?.find(row=>row?.id===eventId);if(!saved||saved.status!=='pending'||JSON.stringify(saved)!==snapshot||settings.folder!==folder)throw Error('删除记录已变化，请重新检查');saved.status='cancelled';});
 }
 deletionReceipts(){
  const journal=this.settings.deletionJournal;if(journal===undefined)return [];if(!Array.isArray(journal))throw Error('删除保护记录无法读取');
  const folder=this.folder(),receipts=[];
  for(const record of journal){
   if(record?.status!=='confirmed'||record.folder!==folder)continue;
   const note=typeof record.text==='string'&&parse(record.text),hash=typeof record.text==='string'&&nodeCrypto.createHash('sha256').update(JSON.stringify(record.text)).digest('hex');
   if(!note||note.id!==record.noteId||note.created!==record.created||hash!==record.fileHash||typeof record.id!=='string'||!/^[0-9a-f-]{36}$/.test(record.id)||typeof record.path!=='string'||!record.path.startsWith(folder+'/'))throw Error('删除保护记录无效');
   receipts.push({eventId:record.id,id:note.id,fileHash:record.fileHash});
  }
  return receipts;
 }
 folder(){return this.settings.folder.replace(/^\/+|\/+$/g,'');}
 async startSyncBridge(){
  if(this.bridge||this.bridgeStarting)throw Error('同步连接已经开启');
  const bridgeFolder=this.folder();
  const getRoot=()=>{const folder=this.folder();if(!validFolder(folder)||/[\\:]/.test(folder)||typeof this.app.vault.adapter.getBasePath!=='function')throw Error('Fomo 专用文件夹无效');return path.join(this.app.vault.adapter.getBasePath(),...folder.split('/'));};
  const guard=()=>{if(this.folder()!==bridgeFolder)throw Error('同步文件夹已改变，请重新连接');};
  let queue=Promise.resolve(),queued=0;const schedule=operation=>{if(queued>=32)throw Error('同步请求过多，请稍后重试');queued++;const task=queue.then(()=>{guard();return operation();});queue=task.catch(()=>{});return task.finally(()=>{queued--;});};
  this.bridgeStarting=startBridge({getRoot,replaceFile:(relative,expected,replacement)=>schedule(()=>replaceWithinFolder(this.app.vault,bridgeFolder,relative,expected,replacement,guard)),registerFile:(relative,expected,replacement)=>schedule(()=>registerMarkdown(this.app.vault,bridgeFolder,relative,expected,replacement,guard)),trashFile:(relative,expected)=>schedule(()=>this.trashSyncedFile(relative,expected)),putAsset:data=>schedule(()=>ensureImageAsset(this.app.vault,bridgeFolder,data,guard)),getAsset:descriptor=>schedule(()=>readImageAsset(this.app.vault,bridgeFolder,descriptor,guard)),getDeletions:()=>schedule(()=>this.deletionReceipts()),getReviews:notes=>schedule(()=>this.reviewSnapshot(bridgeFolder,notes)),mergeReviews:(notes,progress)=>schedule(()=>this.mergeReviewProgress(bridgeFolder,notes,progress))});
  try{this.bridge=await this.bridgeStarting;return this.bridge.port+':'+this.bridge.secret;}finally{this.bridgeStarting=null;}
 }
 async stopSyncBridge(){if(this.bridgeStarting)await this.bridgeStarting.catch(()=>{});const bridge=this.bridge;this.bridge=null;if(bridge)await bridge.close();}
 async onunload(){this.unloaded=true;clearTimeout(this.refreshTimer);this.refreshTimer=null;await this.stopSyncBridge();}
 async replaceSyncedFile(relative,expected,replacement){return replaceWithinFolder(this.app.vault,this.folder(),relative,expected,replacement);}
 async trashSyncedFile(relative,expected){
  const folder=this.folder(),file=scopedFile(this.app.vault,folder,relative);
  if(typeof expected!=='string'||await this.app.vault.read(file)!==expected)throw Error('Obsidian 笔记已变化，请重新预览');
  if(this.folder()!==folder||scopedFile(this.app.vault,folder,relative)!==file)throw Error('同步文件夹或笔记已改变，请重新连接');
  const note=parse(expected);if(!note)throw Error('同步笔记身份无效');
  await this.trashWithJournal({...note,file},expected);
 }
 async open(){let leaf=this.app.workspace.getLeavesOfType(VIEW)[0];if(!leaf){leaf=this.app.workspace.getLeaf('tab');await leaf.setViewState({type:VIEW,active:true});}this.app.workspace.revealLeaf(leaf);}
};

module.exports._test={setupBodyFold,parse,encode,updateIfUnchanged,validFolder,composerDraftKey,inlineDraftKey,readInlineDraft,clearInlineDraft,replaceIfUnchanged,replaceWithinFolder,registerMarkdown,ensureImageAsset,readImageAsset,renderImageAssets,relationsForNotes,renderRelations,referenceLabel,renderInlineReferences,dailyNotes,reviewDay,reviewedIds,renderReviewAction,filterNotes,reviewNotes,reviewOptions,reviewTags,loadReferenceCandidates,insertReference,CardsView};
