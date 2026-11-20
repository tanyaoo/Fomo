'use strict';
const crypto=require('node:crypto');
const {parseDocument,writeDocument}=require('./obsidian-frontmatter.cjs');
const {imageDescriptor,validateImageDescriptors}=require('./obsidian-image-assets.cjs');
const digest=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(id);
function plainHtml(text,mode='paragraphs'){
 if(typeof text!=='string'||/[\r\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)||!['paragraphs','breaks','list'].includes(mode))return null;
 const lines=text.split('\n').map(line=>line.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/\u00a0/g,'&nbsp;'));
 if(mode==='list'){if(lines.length<2||/^\s*- /.test(lines[0])||lines.slice(1).some(line=>!line.startsWith('- ')||line.length===2))return null;return '<p>'+lines[0]+'</p><ul>'+lines.slice(1).map(line=>'<li><p>'+line.slice(2)+'</p></li>').join('')+'</ul>';}
 // The desktop editor treats a lone hard break in an otherwise empty paragraph as empty text.
 if(mode==='breaks'&&text==='\n')return null;
 return mode==='breaks'?'<p>'+lines.join('<br>')+'</p>':lines.map(line=>'<p>'+line+'</p>').join('');
}
function plainHtmlMode(m){if(!m.html)return 'none';if(m.html===plainHtml(m.content,'paragraphs'))return 'paragraphs';if(m.html===plainHtml(m.content,'breaks'))return 'breaks';if(m.html===plainHtml(m.content,'list'))return 'list';return null;}
function hasUnsupportedDocument(m,allowImages=false){if(m.audio||m.video||m.legacyAnnotationId||m.annotations?.length||plainHtmlMode(m)===null)return true;if(m.images?.length){if(!allowImages)return true;try{m.images.map(imageDescriptor);}catch{return true;}}return false;}
function validateRefs(refs,id){if(!Array.isArray(refs)||refs.length>200||refs.some(ref=>!validId(ref)||ref===id)||new Set(refs).size!==refs.length)throw Error('引用元数据无效');return refs;}
function metadata(m){const refs=validateRefs(m.references||[],m.id),result={references:refs};if(m.starred!==undefined&&typeof m.starred!=='boolean')throw Error('收藏元数据无效');result.starred=!!m.starred;for(const key of ['relatedTo','annotationOf'])if(m[key]!==undefined){if(!validId(m[key])||m[key]===m.id)throw Error('关联元数据无效');result[key]=m[key];}if(m.source!==undefined){if(!['direct','annotation','reflection','import'].includes(m.source))throw Error('来源元数据无效');result.source=m.source;}if(m.sourceSlug!==undefined){if(typeof m.sourceSlug!=='string'||!/^[a-zA-Z0-9_-]{1,100}$/.test(m.sourceSlug))throw Error('来源笔记标识无效');result.sourceSlug=m.sourceSlug;}return result;}
function contentHash(m){const meta=metadata(m);return digest({content:m.content,html:m.html||'',images:m.images||[],audio:m.audio||'',video:m.video||'',deleted:!!m.deleted,...(meta.starred?{starred:true}:{}),...(meta.references.length?{references:meta.references}:{}),...(meta.relatedTo?{relatedTo:meta.relatedTo}:{}),...(meta.annotationOf?{annotationOf:meta.annotationOf}:{}),...(meta.source?{source:meta.source}:{}),...(meta.sourceSlug?{sourceSlug:meta.sourceSlug}:{})});}
function encode(m,document,imageAssets=[]){if(!validId(m.id))throw Error('无效笔记 ID');const meta=metadata(m),images=validateImageDescriptors(imageAssets),fields={fomo_id:m.id,fomo_created:m.created,...(meta.starred?{fomo_starred:true}:{}),...(images.length?{fomo_images:images}:{}),...(meta.references.length?{fomo_references:meta.references}:{}),...(meta.relatedTo?{fomo_related_to:meta.relatedTo}:{}),...(meta.annotationOf?{fomo_annotation_of:meta.annotationOf}:{}),...(meta.source?{fomo_source:meta.source}:{}),...(meta.sourceSlug?{fomo_source_slug:meta.sourceSlug}:{})};return writeDocument(document||parseDocument(''),fields,m.content);}
function decode(text){const document=parseDocument(text),fields=document.fields;if(!document.hasFrontmatter||!validId(fields.fomo_id)||!Number.isFinite(Date.parse(fields.fomo_created)))throw Error('无效 Fomo 元数据');const result={id:fields.fomo_id,created:fields.fomo_created,content:document.body,references:fields.fomo_references===undefined?[]:fields.fomo_references,imageAssets:validateImageDescriptors(fields.fomo_images===undefined?[]:fields.fomo_images),document};for(const [name,key] of [['fomo_starred','starred'],['fomo_related_to','relatedTo'],['fomo_annotation_of','annotationOf'],['fomo_source','source'],['fomo_source_slug','sourceSlug']])if(fields[name]!==undefined)result[key]=fields[name];metadata(result);return result;}
const sameRefs=(m,f,imagesEnabled)=>JSON.stringify(metadata(m))===JSON.stringify(metadata(f))&&(!imagesEnabled||JSON.stringify((m.images||[]).map(imageDescriptor))===JSON.stringify(f.imageAssets||[]));
// The planner is pure: callers must persist backups and execute only after a preview.
// Disappearance alone may mean rename, sync delay or a disconnected drive. A
// deletion must be backed by an explicit, validated Obsidian trash event.
function planSync(state,files,manifest={},deletionReceipts=[],consumedDeletions=[],options={}){
 const notes=new Map(state.memos.map(m=>[m.id,m])),byId=new Map(),conflicts=[],actions=[];
 if(!Array.isArray(files)||!manifest||typeof manifest!=='object'||Array.isArray(manifest))throw Error('同步数据格式无效');
 for(const [id,entry] of Object.entries(manifest))if(!validId(id)||!entry||!/^([a-f0-9]{64})$/.test(entry.fomoHash||'')||!/^([a-f0-9]{64})$/.test(entry.fileHash||'')||typeof entry.deleted!=='boolean')throw Error('同步清单无效，原数据已保留');
 if(!Array.isArray(deletionReceipts))throw Error('删除凭据格式无效');
 if(!Array.isArray(consumedDeletions)||consumedDeletions.length>100000||consumedDeletions.some(id=>typeof id!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(id))||new Set(consumedDeletions).size!==consumedDeletions.length)throw Error('已处理删除记录无效');
 const consumed=new Set(consumedDeletions);
 // A bare ID or a receipt for an older file version is not evidence that the
 // current synchronized version was deliberately moved to trash.
 const confirmedDeletes=new Map(),eventOwners=new Map(),ambiguousEvents=new Set();
 for(const r of deletionReceipts){
  if(!r||typeof r.eventId!=='string'||!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(r.eventId)||consumed.has(r.eventId)||!validId(r.id)||typeof r.fileHash!=='string'||!/^[a-f0-9]{64}$/.test(r.fileHash))continue;
  const owner=eventOwners.get(r.eventId),signature=r.id+':'+r.fileHash;if(owner)ambiguousEvents.add(r.eventId);else eventOwners.set(r.eventId,signature);
  if(!manifest[r.id]||manifest[r.id].deleted||manifest[r.id].fileHash!==r.fileHash)continue;
  if(!confirmedDeletes.has(r.id))confirmedDeletes.set(r.id,new Set());confirmedDeletes.get(r.id).add(r.eventId);
 }
 const unsafe=m=>hasUnsupportedDocument(m,options.imagesEnabled===true);
 const assets=m=>options.imagesEnabled?(m.images||[]).map(imageDescriptor):[];
 const remoteMetadata=f=>({...metadata(f),...(options.imagesEnabled?{imageAssets:f.imageAssets}: {})});
 const ordinary=[],imageIds=new Set();
 for(const file of files){try{const parsed=decode(file.text);if(byId.has(parsed.id)){conflicts.push({id:parsed.id,reason:'duplicate'});continue;}byId.set(parsed.id,{...file,...parsed});if(parsed.imageAssets.length&&!options.imagesEnabled){imageIds.add(parsed.id);conflicts.push({id:parsed.id,path:file.path,reason:'image_sync_not_ready'});}}catch(error){let document;try{document=parseDocument(file.text);}catch{}if(options.registerPlain===true&&document&&Object.keys(document.fields).length===0&&Number.isFinite(Date.parse(file.created)))ordinary.push({...file,document});else conflicts.push({path:file.path,reason:'invalid',detail:error.message});}}
 for(const file of ordinary){const id='obs-'+digest([file.path,file.text]).slice(0,32);if(notes.has(id)||byId.has(id)||Object.hasOwn(manifest,id)){conflicts.push({path:file.path,id,reason:'untracked_collision'});continue;}actions.push({type:'register',id,path:file.path,created:file.created,expected:file.text,content:encode({id,created:file.created,content:file.document.body},file.document)});}
 const duplicateIds=new Set(conflicts.filter(c=>c.reason==='duplicate').map(c=>c.id));
 for(const id of new Set([...notes.keys(),...byId.keys(),...Object.keys(manifest)])){
  if(duplicateIds.has(id)||imageIds.has(id))continue;
  const n=notes.get(id),f=byId.get(id),base=manifest[id];
  if(!base){if(n&&f){if(!n.deleted&&!unsafe(n)&&n.created===f.created&&n.content===f.content&&sameRefs(n,f,options.imagesEnabled))actions.push({type:'adopt',id,path:f.path});else conflicts.push({id,reason:'untracked_collision'});continue;}if(n&&!n.deleted){if(unsafe(n)){conflicts.push({id,reason:'rich_content_requires_review'});continue;}actions.push({type:'export',id,content:encode(n,undefined,assets(n))});continue;}if(f&&!n){actions.push({type:'import',id,created:f.created,content:f.content,metadata:remoteMetadata(f),path:f.path});}continue;}
  if(!n){conflicts.push({id,reason:'missing_fomo'});continue;}
  if(f&&!n.deleted&&!unsafe(n)&&f.created===n.created&&f.content===n.content&&sameRefs(n,f,options.imagesEnabled)){if(contentHash(n)!==base.fomoHash||digest(f.text)!==base.fileHash)actions.push({type:'adopt',id,path:f.path});continue;}
  const localChanged=contentHash(n)!==base.fomoHash;
  const remoteChanged=f?digest(f.text)!==base.fileHash:!base.deleted;
  if(n.deleted&&!f&&!base.deleted&&contentHash({...n,deleted:false})===base.fomoHash){const events=confirmedDeletes.get(id);if(events?.size===1&&!ambiguousEvents.has([...events][0])){actions.push({type:'adopt_deleted',id,eventId:[...events][0]});continue;}}
  if(localChanged&&remoteChanged){conflicts.push({id,reason:'both_changed'});continue;}
  if(remoteChanged&&!f){const events=confirmedDeletes.get(id);if(events?.size===1&&!ambiguousEvents.has([...events][0]))actions.push({type:'trash_fomo',id,eventId:[...events][0]});else conflicts.push({id,reason:events?.size?'ambiguous_deletion_receipt':'missing_file_requires_confirmation'});continue;}
  if(remoteChanged&&f){if(n.deleted){conflicts.push({id,reason:'deleted_modified'});continue;}if(f.created!==n.created){conflicts.push({id,reason:'created_changed'});continue;}if(unsafe(n)||(n.html&&plainHtml(f.content,plainHtmlMode(n))===null)){conflicts.push({id,reason:'rich_content_requires_review'});continue;}actions.push({type:'update_fomo',id,content:f.content,metadata:remoteMetadata(f),path:f.path});continue;}
  if(localChanged&&n.deleted&&f){actions.push({type:'trash_obsidian',id,path:f.path});continue;}
  if(localChanged&&!n.deleted){if(unsafe(n)){conflicts.push({id,reason:'rich_content_requires_review'});continue;}actions.push({type:'export',id,path:f?.path,content:encode(n,f?.document,assets(n))});}
 }
 return {actions,conflicts};
}
module.exports={encode,decode,planSync,contentHash,digest,plainHtml,plainHtmlMode,hasUnsupportedDocument};
