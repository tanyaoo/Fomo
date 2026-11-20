'use strict';
const path=require('node:path'),fs=require('node:fs/promises'),crypto=require('node:crypto');
const {planSync,digest,contentHash,encode,decode,plainHtml,plainHtmlMode,hasUnsupportedDocument}=require('./obsidian-sync-plan.cjs');
const {randomUUID}=require('node:crypto');
const {atomicWrite}=require('./file-store.cjs');
const Core=require('../dist/core.js');
const {makeIntent,classifyIntent}=require('./obsidian-deletion-recovery.cjs');
const {imageDescriptor}=require('./obsidian-image-assets.cjs');
const {planReviewSync}=require('./obsidian-review-sync.cjs');
const key=folder=>crypto.createHash('sha256').update(path.resolve(folder)).digest('hex').slice(0,24);
const memoDigest=state=>digest(state);
const contained=(parent,child)=>{const relative=path.relative(parent,child);return relative===''||(!path.isAbsolute(relative)&&relative!=='..'&&!relative.startsWith('..'+path.sep));};
const sameAsset=(a,b)=>!!a&&!!b&&['path','mime','size','sha256'].every(k=>a[k]===b[k]);
async function checkedAsset(options,root,descriptor){const data=await options.getAsset({root,descriptor});if(!sameAsset(imageDescriptor(data),descriptor))throw Error('图片内容已变化');return data;}
async function inspect(store,folder,options={}){
 const root=await fs.realpath(folder),st=await fs.stat(root);if(!st.isDirectory())throw Error('请选择已有的专用文件夹');
 const dataRoot=await fs.realpath(store.directory);if(contained(dataRoot,root)||contained(root,dataRoot))throw Error('同步文件夹不能与 Fomo 数据目录重叠');
 const files=[];let totalBytes=0;
 async function scan(dir,relative=''){for(const e of await fs.readdir(dir,{withFileTypes:true})){if(e.isSymbolicLink())throw Error('同步文件夹包含链接，请先移除');const item=path.join(dir,e.name),name=relative?path.join(relative,e.name):e.name;if(e.isDirectory()){if(e.name==='.trash'||e.name==='.obsidian')continue;await scan(item,name);}else if(e.isFile()&&e.name.toLowerCase().endsWith('.md')){const stat=await fs.stat(item);if(stat.size>2*1024*1024)throw Error('Markdown 文件过大：'+name);const bytes=await fs.readFile(item),text=bytes.toString('utf8');if(bytes.length>2*1024*1024||!Buffer.from(text,'utf8').equals(bytes))throw Error('Markdown 文件编码无效或文件过大：'+name);totalBytes+=bytes.length;if(files.length>=10000||totalBytes>50*1024*1024)throw Error('同步文件夹过大，请缩小范围');files.push({path:name.split(path.sep).join('/'),text,created:stat.birthtime.toISOString()});}}}
 await scan(root);files.sort((a,b)=>a.path.localeCompare(b.path));
 const state=await store.readState(),manifestFile=path.join(store.directory,'obsidian-sync-'+key(root)+'.json'),manifest=await store.readJSON(manifestFile)||{version:1,entries:{}};if(manifest.version!==1||!manifest.entries||typeof manifest.entries!=='object')throw Error('同步清单无效，原数据已保留');
 if(manifest.pendingObsidianTrash&&!options.recoverObsidianTrash)throw Error('存在未完成的 Obsidian 删除同步，请先检查');
 let deletionReceipts=typeof options.getDeletionReceipts==='function'?await options.getDeletionReceipts(root):(options.deletionReceipts||[]);
 if(manifest.pendingDeletion?.manualConfirmation===true){const intent=manifest.pendingDeletion;if(!Array.isArray(deletionReceipts))throw Error('删除凭据格式无效');deletionReceipts=[...deletionReceipts,{id:intent.id,eventId:intent.eventId,fileHash:intent.fileHash}];}
 const imagesEnabled=typeof options.putAsset==='function'&&typeof options.getAsset==='function';
 let plan=planSync(state,files,manifest.entries,deletionReceipts,manifest.consumedDeletions===undefined?[]:manifest.consumedDeletions,{registerPlain:typeof options.registerFile==='function',imagesEnabled});
 const assetChecks=[];if(imagesEnabled){const checked=new Map();for(const file of files){let note;try{note=decode(file.text);}catch{continue;}let invalid=false;for(const descriptor of note.imageAssets){const key=digest(descriptor);if(!checked.has(key)){try{await checkedAsset(options,root,descriptor);checked.set(key,true);}catch{checked.set(key,false);}}const valid=checked.get(key);assetChecks.push({id:note.id,key,valid});if(!valid)invalid=true;}if(invalid)plan.conflicts.push({id:note.id,path:file.path,reason:'image_asset_invalid'});}}
 if(manifest.pendingDeletion){const intent=manifest.pendingDeletion,present=files.some(file=>{try{return decode(file.text).id===intent.id;}catch{return true;}}),stage=classifyIntent(intent,state,manifest.entries[intent.id],deletionReceipts,manifest.consumedDeletions||[],present),conflicts=plan.conflicts.filter(c=>c.id!==intent.id);if(stage==='review')conflicts.push({id:intent.id,reason:'pending_deletion_requires_review'});plan={actions:stage==='review'?[]:[{type:'trash_fomo',id:intent.id,eventId:intent.eventId}],conflicts};}
 return {root,state,files,manifest,manifestFile,deletionReceipts,assetChecks,plan};
}
const snapshotToken=snap=>digest({state:memoDigest(snap.state),files:snap.files,manifest:snap.manifest,deletionReceipts:snap.deletionReceipts,assetChecks:snap.assetChecks});
function eligibleReviewIds(snap){
 const seen=new Map();for(const file of snap.files){let note;try{note=decode(file.text);}catch{continue;}if(seen.has(note.id))seen.set(note.id,null);else seen.set(note.id,note);}
 return snap.state.memos.filter(note=>!note.deleted&&snap.manifest.entries[note.id]?.deleted===false&&seen.get(note.id)?.created===note.created).map(note=>note.id).sort();
}
async function inspectReviewProgress(store,folder,options={}){
 if(typeof options.getReviews!=='function'||typeof options.mergeReviews!=='function')throw Error('请连接支持回顾进度同步的 Obsidian 插件');
 const snap=await inspect(store,folder,options);if(snap.manifest.pendingDeletion||snap.plan.actions.length||snap.plan.conflicts.length)throw Error('请先完成笔记同步并处理冲突');
 const ids=eligibleReviewIds(snap),eligible=new Set(ids),notes=snap.state.memos.filter(note=>eligible.has(note.id)).map(({id,created})=>({id,created})).sort((a,b)=>a.id.localeCompare(b.id)),progress=await options.getReviews({root:snap.root,notes});
 const plan=planReviewSync(snap.state.reviewed,progress,ids),token=digest({snapshot:snapshotToken(snap),progress});return {snap,notes,progress,plan,token};
}
async function previewReviewProgress(store,folder,options={}){const result=await inspectReviewProgress(store,folder,options),count=group=>Object.values(group).reduce((sum,ids)=>sum+ids.length,0);return {root:result.snap.root,token:result.token,notes:result.notes.length,toFomo:count(result.plan.toFomo),toObsidian:count(result.plan.toObsidian)};}
async function applyReviewProgress(store,folder,token,options={}){return withFolderLock(folder,async()=>{
 const initial=await inspectReviewProgress(store,folder,options);if(initial.token!==token)throw Error('回顾进度预览已过期，请重新检查');const count=group=>Object.values(group).reduce((sum,ids)=>sum+ids.length,0),toFomo=count(initial.plan.toFomo),toObsidian=count(initial.plan.toObsidian);if(!toFomo&&!toObsidian)return {toFomo:0,toObsidian:0};
 await store.backupNow();const last=await inspectReviewProgress(store,folder,options);if(last.token!==token)throw Error('回顾进度预览已过期，请重新检查');
 if(toObsidian)await options.mergeReviews({root:last.snap.root,notes:last.notes,progress:last.plan.toObsidian});
 if(toFomo){const fresh=await inspect(store,folder,options);if(snapshotToken(fresh)!==snapshotToken(last.snap))throw Error('笔记或回顾状态已变化，请重新检查');const desired=Core.clone(fresh.state);for(const [day,ids] of Object.entries(last.plan.toFomo))desired.reviewed[day]=[...new Set([...(desired.reviewed[day]||[]),...ids])];await store.saveIfUnchanged(fresh.state,desired);}
 return {toFomo,toObsidian};
 });}
const operations=new Map();
async function withFolderLock(folder,fn){const id=(await fs.realpath(folder)).toLocaleLowerCase();if(operations.has(id))throw Error('该文件夹正在同步，请稍候');operations.set(id,true);try{return await fn();}finally{operations.delete(id);}}
function nextBatch(plan){
 const pending=plan.actions.filter(a=>!['register','adopt','import','update_fomo','export'].includes(a.type));if(pending.length)return pending.slice(0,1);
 const group=plan.actions.some(a=>a.type==='register')?['register']:plan.actions.some(a=>a.type==='adopt')?['adopt']:plan.actions.some(a=>a.type==='import'||a.type==='update_fomo')?['import','update_fomo']:['export'];
 return plan.actions.filter(a=>group.includes(a.type));
}
function executionBlocker(plan,options={}){
 const batch=nextBatch(plan),safeExports=batch.length>0&&batch.every(action=>action.type==='export')&&plan.conflicts.every(conflict=>conflict.reason==='rich_content_requires_review');
 if(plan.conflicts.length&&!safeExports&&!(batch[0]?.type==='trash_fomo'&&plan.conflicts.every(conflict=>conflict.reason==='missing_file_requires_confirmation')))return '存在冲突，请先处理';
 if(plan.actions.some(a=>!['register','import','update_fomo','export','adopt','adopt_deleted','trash_fomo',...(options.enableObsidianTrash===true?['trash_obsidian']:[])].includes(a.type)))return '此操作需要尚未完成的双向同步协调器，未修改任何文件';
 if(nextBatch(plan).some(a=>a.type==='trash_obsidian')&&(typeof options.getDeletionReceipts!=='function'||typeof options.trashFile!=='function'))return '需要先连接支持回收站保护的 Obsidian 插件';
 if(nextBatch(plan).some(a=>a.type==='trash_fomo')&&typeof options.getDeletionReceipts!=='function')return '需要先连接 Obsidian 插件才能处理删除';
 if(nextBatch(plan).some(a=>a.type==='adopt_deleted')&&typeof options.getDeletionReceipts!=='function')return '需要先连接 Obsidian 插件才能核对删除记录';
 if(nextBatch(plan).some(a=>a.type==='register')&&typeof options.registerFile!=='function')return '需要先连接 Obsidian 插件才能登记普通笔记';
 if(nextBatch(plan).some(a=>a.type==='export'&&a.path)&&typeof options.replaceFile!=='function')return 'Obsidian 原子文件操作不可用，未修改任何文件';
 return null;
}
function conflictComparison(snap,options){
 if(snap.manifest.pendingDeletion||!snap.plan.conflicts.length||snap.plan.conflicts.some(c=>c.reason!=='both_changed'))return null;
 for(const conflict of snap.plan.conflicts){const id=conflict.id,memo=snap.state.memos.find(m=>m.id===id),files=snap.files.filter(f=>{try{return decode(f.text).id===id;}catch{return false;}}),file=files[0],remote=file&&decode(file.text);
  const imagesEnabled=typeof options.putAsset==='function'&&typeof options.getAsset==='function';
  if(files.length!==1||!memo||memo.deleted||hasUnsupportedDocument(memo,imagesEnabled)||remote.created!==memo.created||(memo.html&&plainHtml(remote.content,plainHtmlMode(memo))===null))continue;
  if((memo.images?.length||remote.imageAssets.length)&&(!imagesEnabled||JSON.stringify((memo.images||[]).map(imageDescriptor))!==JSON.stringify(remote.imageAssets)))continue;
  const fields=m=>({starred:!!m.starred,images:m.imageAssets?.length??m.images?.length??0,references:m.references||[],relatedTo:m.relatedTo||null,annotationOf:m.annotationOf||null,source:m.source||null,sourceSlug:m.sourceSlug||null});
  return {id,path:file.path,remaining:snap.plan.conflicts.length-1,fomo:{content:memo.content,metadata:fields(memo)},obsidian:{content:remote.content,metadata:fields(remote)},canKeepFomo:typeof options.replaceFile==='function'};
 }
 return null;
}
function missingDeletionComparison(snap,options){
 if(typeof options.getDeletionReceipts!=='function'||snap.manifest.pendingDeletion||snap.manifest.pendingObsidianTrash||!snap.plan.conflicts.length||snap.plan.conflicts.some(conflict=>conflict.reason!=='missing_file_requires_confirmation'))return null;
 const id=snap.plan.conflicts[0].id,note=snap.state.memos.find(item=>item.id===id),entry=snap.manifest.entries[id];if(!note||note.deleted||!entry||entry.deleted||contentHash(note)!==entry.fomoHash)return null;
 return {id,created:note.created,content:note.content.slice(0,1000),truncated:note.content.length>1000,images:note.images?.length||0,remaining:snap.plan.conflicts.length-1};
}
async function preview(store,folder,options={}){const snap=await inspect(store,folder,{...options,recoverObsidianTrash:true}),pending=snap.manifest.pendingObsidianTrash;if(pending){const linked=typeof options.getDeletionReceipts==='function',present=snap.files.some(f=>{try{return decode(f.text).id===pending.id;}catch{return true;}});return {root:snap.root,token:snapshotToken(snap),actions:[],remaining:0,conflicts:[],comparison:null,canApply:false,blocker:'存在未完成的 Obsidian 删除同步，请检查保护记录。',pendingObsidianTrash:{id:typeof pending.id==='string'?pending.id:'',path:typeof pending.path==='string'?pending.path:'',canCancel:linked&&present,canFinalize:linked&&!present}};}const blocker=executionBlocker(snap.plan,options),batch=nextBatch(snap.plan);return {root:snap.root,token:snapshotToken(snap),actions:batch.map(({type,id,path,eventId})=>({type,id,path,...(eventId?{eventId}:{})})),remaining:snap.plan.actions.length-batch.length,conflicts:snap.plan.conflicts,comparison:conflictComparison(snap,options),missingDeletion:blocker?missingDeletionComparison(snap,options):null,canApply:!blocker,blocker};}
// Existing vault files are updated only through a caller-provided atomic
// compare-and-swap; protected trash is handled one note at a time.
async function applyUnlocked(store,folder,token,options={}){
 const snap=await inspect(store,folder,options),actual=snapshotToken(snap);
 if(token!==actual)throw Error('同步预览已过期，请重新检查');
 const blocker=executionBlocker(snap.plan,options);if(blocker)throw Error(blocker);
 snap.plan={...snap.plan,actions:nextBatch(snap.plan)};
 if(!snap.plan.actions.length)return {ready:true,exported:0};
 if(snap.plan.actions[0].type==='trash_fomo'){const action=snap.plan.actions[0],receipt=snap.deletionReceipts.find(r=>r.id===action.id&&r.eventId===action.eventId);return recoverDeletionUnlocked(store,folder,receipt,options,token);}
 if(snap.plan.actions[0].type==='trash_obsidian')return recoverObsidianTrashUnlocked(store,folder,snap.plan.actions[0].id,options,token);
 if(snap.plan.actions[0].type==='adopt_deleted'){
  const action=snap.plan.actions[0];await store.backupNow();const fresh=await inspect(store,folder,options);if(snapshotToken(fresh)!==token)throw Error('同步预览已过期，请重新检查');
  const memo=fresh.state.memos.find(m=>m.id===action.id),entry=fresh.manifest.entries[action.id],consumed=fresh.manifest.consumedDeletions||[];if(!memo?.deleted||!entry||entry.deleted||consumed.length>=100000||!fresh.plan.actions.some(a=>a.type==='adopt_deleted'&&a.id===action.id&&a.eventId===action.eventId))throw Error('删除状态已变化，请重新检查');
  const manifest={...fresh.manifest,entries:{...fresh.manifest.entries,[action.id]:{...entry,fomoHash:contentHash(memo),deleted:true}},consumedDeletions:[...consumed,action.eventId]};
  await store.serialize(async()=>{const current=Core.validate(await store.readJSON(store.file)),currentManifest=await store.readJSON(fresh.manifestFile);if(digest(current)!==digest(fresh.state)||digest(currentManifest)!==digest(fresh.manifest))throw Error('删除状态已变化，请重新检查');await atomicWrite(fresh.manifestFile,JSON.stringify(manifest),store.io);});return {adoptedDeleted:1,id:action.id};
 }
 await store.backupNow();
 const outcomes=[];
 if(snap.plan.actions.every(a=>a.type==='register')){
  for(const action of snap.plan.actions){
   const fresh=await inspect(store,folder,options);if(fresh.plan.conflicts.length)throw Error('同步中发现冲突，请重新预览；已完成的笔记保留');
   const planned=fresh.plan.actions.find(a=>a.type==='register'&&a.path===action.path);
   if(!planned||planned.id!==action.id||planned.expected!==action.expected||planned.content!==action.content)throw Error('笔记已变化，请重新预览');
   const archive=path.join(store.directory,'backups','obsidian-before-register-'+randomUUID()+'.json');await atomicWrite(archive,JSON.stringify({version:1,root:fresh.root,path:action.path,text:action.expected}),store.io);
   const last=await inspect(store,folder,options);if(snapshotToken(last)!==snapshotToken(fresh))throw Error('同步期间笔记已变化，请重新预览；已完成的笔记保留');
   await options.registerFile({root:fresh.root,path:action.path,expected:action.expected,replacement:action.content});outcomes.push(action.id);
  }
  return {ready:true,registered:outcomes.length,ids:outcomes};
 }
 if(snap.plan.actions.every(a=>a.type==='adopt')){
  const last=await inspect(store,folder,options);if(snapshotToken(last)!==token)throw Error('同步预览已过期，请重新检查');
  const batch=nextBatch(last.plan),entries={...last.manifest.entries};for(const action of batch){const m=last.state.memos.find(x=>x.id===action.id),file=last.files.find(x=>x.path===action.path);entries[action.id]={fomoHash:contentHash(m),fileHash:digest(file.text),deleted:false};}
  await atomicWrite(last.manifestFile,JSON.stringify({...last.manifest,entries}),store.io);return {ready:true,adopted:batch.length};
 }
 if(snap.plan.actions.every(a=>a.type==='import'||a.type==='update_fomo')){
  const desired=JSON.parse(JSON.stringify(snap.state)),now=new Date().toISOString();
  const imagesEnabled=typeof options.putAsset==='function'&&typeof options.getAsset==='function';
  for(const action of snap.plan.actions){const images=[];for(const descriptor of action.metadata.imageAssets||[])images.push(await checkedAsset(options,snap.root,descriptor));const existing=desired.memos.find(m=>m.id===action.id);if(action.type==='import'){if(existing)throw Error('Fomo 已存在同一笔记');desired.memos.push({id:action.id,content:action.content,html:'',created:action.created,updated:now,deleted:false,starred:action.metadata.starred,images,...(action.metadata.references.length?{references:action.metadata.references}:{}),...(action.metadata.relatedTo?{relatedTo:action.metadata.relatedTo}:{}),...(action.metadata.annotationOf?{annotationOf:action.metadata.annotationOf}:{}),...(action.metadata.source?{source:action.metadata.source}:{}),...(action.metadata.sourceSlug?{sourceSlug:action.metadata.sourceSlug}:{})});}else{const mode=existing&&plainHtmlMode(existing);if(!existing||existing.deleted||hasUnsupportedDocument(existing,imagesEnabled)||(existing.html&&plainHtml(action.content,mode)===null))throw Error('笔记格式已变化，请重新检查');if(existing.html)existing.html=plainHtml(action.content,mode);existing.content=action.content;if(imagesEnabled)existing.images=images;existing.starred=action.metadata.starred;for(const key of ['references','relatedTo','annotationOf','source','sourceSlug'])delete existing[key];if(action.metadata.references.length)existing.references=action.metadata.references;for(const key of ['relatedTo','annotationOf','source','sourceSlug'])if(action.metadata[key]!==undefined)existing[key]=action.metadata[key];existing.updated=now;}}
  // Snapshot the imported Obsidian files before changing Fomo data.
  const archive=path.join(store.directory,'backups','obsidian-import-'+randomUUID()+'.json');await atomicWrite(archive,JSON.stringify({version:1,created:now,root:snap.root,files:snap.files}),store.io);
  const last=await inspect(store,folder,options);if(snapshotToken(last)!==token)throw Error('同步预览已过期，请重新检查');
  const saved=await store.saveIfUnchanged(snap.state,desired),entries={...snap.manifest.entries};
  for(const action of snap.plan.actions){const m=saved.memos.find(x=>x.id===action.id),file=snap.files.find(x=>x.path===action.path);entries[action.id]={fomoHash:contentHash(m),fileHash:digest(file.text),deleted:false};}
  try{await atomicWrite(snap.manifestFile,JSON.stringify({...snap.manifest,entries}),store.io);}catch(error){throw Error('笔记已导入，但同步清单未写入；保护副本已保留，请人工检查：'+error.message);}
  return {ready:true,imported:snap.plan.actions.filter(a=>a.type==='import').length,updated:snap.plan.actions.filter(a=>a.type==='update_fomo').length};
 }
 if(snap.plan.actions.some(a=>a.type!=='export'))throw Error('此操作需要尚未完成的双向同步协调器，未修改任何文件');
 for(const action of snap.plan.actions){
  const fresh=await inspect(store,folder,options),memo=fresh.state.memos.find(m=>m.id===action.id);
  if(fresh.plan.conflicts.some(conflict=>conflict.reason!=='rich_content_requires_review'))throw Error('同步中发现冲突，请重新预览；已完成的笔记保留');
  const planned=fresh.plan.actions.find(a=>a.id===action.id);if(!planned||planned.type!=='export'||planned.path!==action.path||planned.content!==action.content)throw Error('同步计划已变化，请重新预览');
  if(!memo||memo.deleted||contentHash(memo)!==contentHash(snap.state.memos.find(m=>m.id===action.id)))throw Error('Fomo 笔记已变化，请重新预览；已完成的笔记保留');
  if(memo.images?.length){for(const data of memo.images){const result=await options.putAsset({root:fresh.root,data});if(!sameAsset(result?.descriptor,imageDescriptor(data)))throw Error('图片写入结果无效，请重新检查');}const last=await inspect(store,folder,options);if(snapshotToken(last)!==snapshotToken(fresh))throw Error('同步期间笔记已变化，请重新预览');}
  if(action.path){
   const old=snap.files.find(file=>file.path===action.path),current=fresh.files.find(file=>file.path===action.path);
   if(!old||!current||current.text!==old.text||decode(current.text).id!==action.id)throw Error('Obsidian 笔记已变化，请重新预览');
   const archive=path.join(store.directory,'backups','obsidian-before-write-'+randomUUID()+'.json');await atomicWrite(archive,JSON.stringify({version:1,root:fresh.root,path:action.path,text:old.text}),store.io);
   const latest=await store.readState(),currentMemo=latest.memos.find(m=>m.id===action.id);if(!currentMemo||contentHash(currentMemo)!==contentHash(memo))throw Error('Fomo 笔记已变化，请重新预览');
   await options.replaceFile({root:fresh.root,path:action.path,expected:old.text,replacement:action.content});
  }else{
   if(fresh.files.some(file=>{try{return decode(file.text).id===action.id;}catch{return false;}}))throw Error('Obsidian 中已出现同一笔记，请重新预览');
   const target=path.join(fresh.root,action.id+'.md');let handle;
   try{handle=await fs.open(target,'wx');await handle.writeFile(action.content,'utf8');await handle.sync();}finally{await handle?.close();}
  }
  const manifest={...fresh.manifest,entries:{...fresh.manifest.entries,[action.id]:{fomoHash:contentHash(memo),fileHash:digest(action.content),deleted:false}}};
  try{await atomicWrite(fresh.manifestFile,JSON.stringify(manifest),store.io);}catch(error){throw Error('文件已写入但同步清单未更新；保护副本已保留，请重新预览 '+action.id+'：'+error.message);}
  outcomes.push(action.id);
 }
 return {ready:true,exported:outcomes.length,ids:outcomes};
}
async function apply(store,folder,token,options={}){return withFolderLock(folder,()=>applyUnlocked(store,folder,token,options));}
// Explicit conflict choices are internal until the comparison UI is available.
async function resolveConflict(store,folder,token,id,choice,options={}){return withFolderLock(folder,async()=>{
 if(!['fomo','obsidian'].includes(choice))throw Error('冲突处理选择无效');
 const snap=await inspect(store,folder,options);if(snapshotToken(snap)!==token)throw Error('同步预览已过期，请重新检查');
 if(conflictComparison(snap,options)?.id!==id)throw Error('冲突状态已变化，请重新检查');
 const memo=snap.state.memos.find(m=>m.id===id),matches=snap.files.filter(f=>{try{return decode(f.text).id===id;}catch{return false;}}),file=matches[0],remote=file&&decode(file.text);
 if(matches.length!==1||!memo||memo.deleted||hasUnsupportedDocument(memo,typeof options.putAsset==='function'&&typeof options.getAsset==='function')||remote.created!==memo.created||(memo.html&&plainHtml(remote.content,plainHtmlMode(memo))===null))throw Error('笔记格式或身份需要人工检查');
 if(choice==='fomo'&&typeof options.replaceFile!=='function')throw Error('需要连接 Obsidian 插件');
 await store.backupNow();const archive=path.join(store.directory,'backups','obsidian-conflict-'+randomUUID()+'.json');await atomicWrite(archive,JSON.stringify({version:1,root:snap.root,path:file.path,obsidian:file.text,fomo:memo}),store.io);
 const last=await inspect(store,folder,options);if(snapshotToken(last)!==token)throw Error('同步预览已过期，请重新检查');
 let saved=snap.state,written=file.text;
 if(choice==='fomo'){
  written=encode(memo,remote.document,remote.imageAssets);await options.replaceFile({root:snap.root,path:file.path,expected:file.text,replacement:written});
 }else{
  const desired=structuredClone(snap.state),target=desired.memos.find(m=>m.id===id);if(target.html)target.html=plainHtml(remote.content,plainHtmlMode(target));target.content=remote.content;target.starred=!!remote.starred;
  for(const key of ['references','relatedTo','annotationOf','source','sourceSlug'])delete target[key];if(remote.references.length)target.references=remote.references;for(const key of ['relatedTo','annotationOf','source','sourceSlug'])if(remote[key]!==undefined)target[key]=remote[key];target.updated=new Date().toISOString();
  saved=await store.saveIfUnchanged(snap.state,desired);
 }
 for(const descriptor of remote.imageAssets){try{await checkedAsset(options,snap.root,descriptor);}catch{throw Error('冲突处理后图片已变化，保护副本已保留，请重新检查');}}
 const updated=saved.memos.find(m=>m.id===id),manifest={...snap.manifest,entries:{...snap.manifest.entries,[id]:{fomoHash:contentHash(updated),fileHash:digest(written),deleted:false}}};
 await store.serialize(async()=>{const current=Core.validate(await store.readJSON(store.file)),currentManifest=await store.readJSON(snap.manifestFile);if(digest(current)!==digest(saved)||digest(currentManifest)!==digest(snap.manifest)||await fs.readFile(path.join(snap.root,...file.path.split('/')),'utf8')!==written)throw Error('冲突处理后状态已变化，请重新检查');await atomicWrite(snap.manifestFile,JSON.stringify(manifest),store.io);});
 return {resolved:1,id,choice};
 });}
async function recoverDeletionUnlocked(store,folder,receipt,options={},expectedToken){
 const opts={...options,recoverDeletion:true};let snap=await inspect(store,folder,opts),intent=snap.manifest.pendingDeletion;
 if(expectedToken&&snapshotToken(snap)!==expectedToken)throw Error('同步预览已过期，请重新检查');
 if(!intent){
  const planned=snap.plan.actions.find(a=>a.type==='trash_fomo'&&a.id===receipt?.id&&a.eventId===receipt?.eventId);
  if(!planned||snap.plan.conflicts.some(conflict=>conflict.reason!=='missing_file_requires_confirmation'))throw Error('删除计划已变化，请重新预览');
  await store.backupNow();const fresh=await inspect(store,folder,opts);if(snapshotToken(fresh)!==snapshotToken(snap))throw Error('同步预览已过期，请重新检查');
  intent=makeIntent(fresh.state,fresh.manifest.entries[receipt.id],receipt,new Date().toISOString());
  await atomicWrite(fresh.manifestFile,JSON.stringify({...fresh.manifest,pendingDeletion:intent}),store.io);
 }
 snap=await inspect(store,folder,opts);
 const present=snap.files.some(file=>{try{return decode(file.text).id===intent.id;}catch{return true;}});
 const stage=classifyIntent(intent,snap.state,snap.manifest.entries[intent.id],snap.deletionReceipts,snap.manifest.consumedDeletions||[],present);
 if(stage==='review')throw Error('删除状态已变化，请人工检查');
 if(stage==='apply'){
  const desired=Core.batch(snap.state,[intent.id],'delete','',intent.deletedAt),last=await inspect(store,folder,opts);
  if(snapshotToken(last)!==snapshotToken(snap))throw Error('删除状态已变化，请人工检查');
  await store.saveIfUnchanged(snap.state,desired);snap=await inspect(store,folder,opts);
 }
 const stillPresent=snap.files.some(file=>{try{return decode(file.text).id===intent.id;}catch{return true;}});
 if(classifyIntent(intent,snap.state,snap.manifest.entries[intent.id],snap.deletionReceipts,snap.manifest.consumedDeletions||[],stillPresent)!=='finalize')throw Error('删除状态已变化，请人工检查');
 const memo=snap.state.memos.find(m=>m.id===intent.id),entries={...snap.manifest.entries,[intent.id]:{...snap.manifest.entries[intent.id],fomoHash:contentHash(memo),deleted:true}},manifest={...snap.manifest,entries,consumedDeletions:[...(snap.manifest.consumedDeletions||[]),intent.eventId]};delete manifest.pendingDeletion;
 await store.serialize(async()=>{
  const current=Core.validate(await store.readJSON(store.file)),currentManifest=await store.readJSON(snap.manifestFile);
  if(digest(current)!==digest(snap.state)||digest(currentManifest)!==digest(snap.manifest))throw Error('删除状态已变化，请人工检查');
  await atomicWrite(snap.manifestFile,JSON.stringify(manifest),store.io);
 });return {trashed:1,id:intent.id};
 }
async function recoverDeletion(store,folder,receipt,options={}){return withFolderLock(folder,()=>recoverDeletionUnlocked(store,folder,receipt,options));}
// Call only after the user has explicitly confirmed that this missing file was
// intentionally deleted in Obsidian. Missing files alone are never receipts.
async function confirmMissingDeletion(store,folder,token,id,options={}){return withFolderLock(folder,async()=>{
 if(typeof options.getDeletionReceipts!=='function')throw Error('请先连接 Obsidian 插件');
 const snap=await inspect(store,folder,options);if(snapshotToken(snap)!==token)throw Error('同步预览已过期，请重新检查');
 if(snap.manifest.pendingDeletion||!snap.plan.conflicts.some(conflict=>conflict.id===id&&conflict.reason==='missing_file_requires_confirmation')||snap.plan.conflicts.some(conflict=>conflict.reason!=='missing_file_requires_confirmation'))throw Error('删除状态已变化，请重新检查');
 const memo=snap.state.memos.find(item=>item.id===id),entry=snap.manifest.entries[id];if(!memo||memo.deleted||!entry||entry.deleted||contentHash(memo)!==entry.fomoHash)throw Error('笔记已变化，请重新检查');
 await store.backupNow();const last=await inspect(store,folder,options);if(snapshotToken(last)!==token)throw Error('同步预览已过期，请重新检查');
 const receipt={id,eventId:randomUUID(),fileHash:entry.fileHash},intent={...makeIntent(last.state,entry,receipt,new Date().toISOString()),manualConfirmation:true};
 await atomicWrite(last.manifestFile,JSON.stringify({...last.manifest,pendingDeletion:intent}),store.io);
 return recoverDeletionUnlocked(store,folder,receipt,options);
 });}
// Isolated coordinator under development; not connected to the desktop UI.
async function recoverObsidianTrashUnlocked(store,folder,id,options={},previewToken){
 if(typeof options.getDeletionReceipts!=='function'||(!options.onlyFinalize&&typeof options.trashFile!=='function'))throw Error('需要连接支持回收站保护的 Obsidian 插件');
 const opts={...options,recoverObsidianTrash:true};let snap=await inspect(store,folder,opts),intent=snap.manifest.pendingObsidianTrash;
 if(previewToken!==undefined&&snapshotToken(snap)!==previewToken)throw Error('同步预览已过期，请重新检查');
 if(!intent){
  if(options.onlyFinalize)throw Error('没有待确认的删除记录，请重新检查');
  const action=snap.plan.actions.find(a=>a.type==='trash_obsidian'&&a.id===id),memo=snap.state.memos.find(m=>m.id===id),file=action&&snap.files.find(f=>f.path===action.path);
  if(!action||!memo?.deleted||!file||snap.plan.conflicts.length||snap.manifest.pendingDeletion)throw Error('删除计划已变化，请重新预览');
  await store.backupNow();const fresh=await inspect(store,folder,opts);if(snapshotToken(fresh)!==snapshotToken(snap))throw Error('同步预览已过期，请重新检查');
  const archive=path.join(store.directory,'backups','obsidian-before-trash-'+randomUUID()+'.json');await atomicWrite(archive,JSON.stringify({version:1,root:snap.root,path:file.path,text:file.text}),store.io);
  const last=await inspect(store,folder,opts);if(snapshotToken(last)!==snapshotToken(snap))throw Error('同步预览已过期，请重新检查');
  intent={version:1,id,path:file.path,fileHash:digest(file.text),memoHash:digest(memo),baselineHash:digest(snap.manifest.entries[id]),priorEvents:snap.deletionReceipts.map(r=>r.eventId)};
  await atomicWrite(snap.manifestFile,JSON.stringify({...snap.manifest,pendingObsidianTrash:intent}),store.io);
 }
 if(intent.version!==1||intent.id!==id||typeof intent.path!=='string'||!Array.isArray(intent.priorEvents)||!intent.priorEvents.every(x=>typeof x==='string')||![intent.fileHash,intent.memoHash,intent.baselineHash].every(x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)))throw Error('删除意图无效，请人工检查');
 snap=await inspect(store,folder,opts);let memo=snap.state.memos.find(m=>m.id===id),entry=snap.manifest.entries[id];
 if(!memo?.deleted||digest(memo)!==intent.memoHash||digest(entry)!==intent.baselineHash||snap.manifest.pendingDeletion)throw Error('删除状态已变化，请人工检查');
 const matchingFiles=snap.files.filter(f=>{try{return decode(f.text).id===id;}catch{return true;}}),file=matchingFiles.length===1&&matchingFiles[0];
 if(options.onlyFinalize&&matchingFiles.length)throw Error('原文件仍存在，未执行删除；请重新检查');
 if(matchingFiles.length){if(snap.deletionReceipts.some(r=>r.id===id&&!intent.priorEvents.includes(r.eventId)))throw Error('笔记已删除后重新出现，请人工检查');if(!file||file.path!==intent.path||digest(file.text)!==intent.fileHash)throw Error('Obsidian 笔记已变化，请人工检查');const last=await inspect(store,folder,opts);if(snapshotToken(last)!==snapshotToken(snap))throw Error('删除状态已变化，请人工检查');await options.trashFile({root:snap.root,path:file.path,expected:file.text});snap=await inspect(store,folder,opts);}
 if(snap.files.some(f=>{try{return decode(f.text).id===id;}catch{return true;}}))throw Error('Obsidian 文件仍存在，请人工检查');
 memo=snap.state.memos.find(m=>m.id===id);entry=snap.manifest.entries[id];if(!memo?.deleted||digest(memo)!==intent.memoHash||digest(entry)!==intent.baselineHash)throw Error('删除状态已变化，请人工检查');
 const consumed=snap.manifest.consumedDeletions||[],receipts=snap.deletionReceipts.filter(r=>r.id===id&&r.fileHash===intent.fileHash&&!intent.priorEvents.includes(r.eventId)&&!consumed.includes(r.eventId));if(receipts.length!==1)throw Error('删除保护记录未确认，请人工检查');
 const event=receipts[0].eventId;if(!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(event)||snap.deletionReceipts.filter(r=>r.eventId===event).length!==1||consumed.length>=100000)throw Error('删除保护记录无效，请人工检查');
 const manifest={...snap.manifest,entries:{...snap.manifest.entries,[id]:{...entry,fomoHash:contentHash(memo),deleted:true}},consumedDeletions:[...consumed,event]};delete manifest.pendingObsidianTrash;
 await store.serialize(async()=>{const current=Core.validate(await store.readJSON(store.file)),currentManifest=await store.readJSON(snap.manifestFile);if(digest(current)!==digest(snap.state)||digest(currentManifest)!==digest(snap.manifest))throw Error('删除状态已变化，请人工检查');await atomicWrite(snap.manifestFile,JSON.stringify(manifest),store.io);});return {trashedObsidian:1,id};
 }
async function recoverObsidianTrash(store,folder,id,options={}){return withFolderLock(folder,()=>recoverObsidianTrashUnlocked(store,folder,id,options));}
async function finalizeObsidianTrash(store,folder,id,token,options={}){return withFolderLock(folder,()=>recoverObsidianTrashUnlocked(store,folder,id,{...options,onlyFinalize:true},token));}
// Cancel only when the exact file and deletion baseline still exist and no new
// trash receipt was issued. This changes the journal, never either note.
async function cancelObsidianTrash(store,folder,id,options={}){return withFolderLock(folder,async()=>{
 if(typeof options.getDeletionReceipts!=='function')throw Error('需要连接 Obsidian 插件检查删除记录');
 const opts={...options,recoverObsidianTrash:true},snap=await inspect(store,folder,opts),intent=snap.manifest.pendingObsidianTrash;
 if(options.previewToken!==undefined&&options.previewToken!==snapshotToken(snap))throw Error('同步预览已过期，请重新检查');
 if(!intent||intent.version!==1||intent.id!==id||typeof intent.path!=='string'||!Array.isArray(intent.priorEvents)||!intent.priorEvents.every(x=>typeof x==='string')||![intent.fileHash,intent.memoHash,intent.baselineHash].every(x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)))throw Error('删除意图无效，请人工检查');
 const memo=snap.state.memos.find(m=>m.id===id),entry=snap.manifest.entries[id],matches=snap.files.filter(f=>{try{return decode(f.text).id===id;}catch{return true;}});
 if(snap.manifest.pendingDeletion||!memo?.deleted||digest(memo)!==intent.memoHash||digest(entry)!==intent.baselineHash||matches.length!==1||matches[0].path!==intent.path||digest(matches[0].text)!==intent.fileHash||snap.deletionReceipts.some(r=>r.id===id&&!intent.priorEvents.includes(r.eventId)))throw Error('删除状态已变化，请人工检查');
 const last=await inspect(store,folder,opts);if(snapshotToken(last)!==snapshotToken(snap))throw Error('删除状态已变化，请人工检查');
 await store.serialize(async()=>{const current=Core.validate(await store.readJSON(store.file)),manifest=await store.readJSON(snap.manifestFile);if(digest(current)!==digest(snap.state)||digest(manifest)!==digest(snap.manifest))throw Error('删除状态已变化，请人工检查');delete manifest.pendingObsidianTrash;await atomicWrite(snap.manifestFile,JSON.stringify(manifest),store.io);});
 return {cancelledObsidianTrash:1,id};
 });}
module.exports={inspect,preview,apply,executionBlocker,resolveConflict,recoverDeletion,confirmMissingDeletion,recoverObsidianTrash,finalizeObsidianTrash,cancelObsidianTrash,eligibleReviewIds,previewReviewProgress,applyReviewProgress};
