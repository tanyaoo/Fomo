'use strict';
const path=require('node:path');
const fs=require('node:fs/promises');
const fsSync=require('node:fs');
const {BrowserWindow,ipcMain,screen,dialog}=require('electron');
const Core=require('../dist/core.js');
const {installEditContextMenu}=require('./edit-context-menu.cjs');
const {randomUUID}=require('node:crypto');
class ComposeWindow {
  constructor({root,getStore,onSaved,onShowPublished,boundsFile,getNewNoteCloseAfterPublish,canOpen}){
    this.root=root;this.getStore=getStore;this.onSaved=onSaved;this.onShowPublished=onShowPublished;this.boundsFile=boundsFile;this.getNewNoteCloseAfterPublish=getNewNoteCloseAfterPublish;this.window=null;this.opening=false;this.saveTimer=null;this.restoring=false;this.pendingDetach=null;
    this.canOpen=canOpen||(()=>true);this.detaching=false;
    const authorize=event=>{if(!this.window||event.sender!==this.window.webContents)throw Error('拒绝非新建窗口请求');};
    ipcMain.handle('compose:save',async(event,payload)=>{authorize(event);return this.save(payload);});
    ipcMain.handle('compose:read-draft',async event=>{authorize(event);const store=this.getStore(),draft=await store.ensureComposeDraftId();if(!draft.content.trim()&&!draft.images.length)return draft;const state=await store.readState(),saved=state.memos.find(item=>item.id===draft.submissionId);if(!saved)return draft;if(saved.content!==draft.content.trim()||saved.html!==draft.html||JSON.stringify(saved.images)!==JSON.stringify(draft.images)){const recovered={...draft,submissionId:randomUUID()};if(!await store.replaceComposeDraftIfMatches(draft,recovered))throw Error('草稿已变化，请重新打开新建窗口');return recovered;}if(!await store.clearComposeDraftIfMatches(draft))throw Error('草稿已变化，请重新打开新建窗口');return store.ensureComposeDraftId();});
    ipcMain.handle('compose:write-draft',async(event,value)=>{authorize(event);return this.getStore().composeDraft(value);});
    ipcMain.handle('compose:close',event=>{authorize(event);this.close();return true;});
    ipcMain.handle('compose:pin',(event,value)=>{authorize(event);if(!this.window)return false;this.window.setAlwaysOnTop(value===true,'floating');return this.window.isAlwaysOnTop();});
    ipcMain.handle('compose:tags',async event=>{
      authorize(event);const state=await this.getStore().readState(),tags=new Set(state.extraTags||[]),recent=Core.recentTagSuggestions(state.memos);
      for(const memo of state.memos){if(memo.deleted)continue;for(const tag of Core.tagsOf(memo.content))tags.add(tag);}
      const all=[...new Set([...tags].flatMap(tag=>tag.split('/').map((_,i)=>tag.split('/').slice(0,i+1).join('/'))))];
      return all.map(tag=>({tag,recentIndex:recent.indexOf(tag)})).sort((a,b)=>a.tag.localeCompare(b.tag,'zh-CN'));
    });
    ipcMain.handle('compose:references',async(event,query)=>{
      authorize(event);if(typeof query!=='string'||query.length>200)throw Error('引用搜索无效');
      const state=await this.getStore().readState(),active=state.memos.filter(m=>!m.deleted).sort((a,b)=>Date.parse(b.created)-Date.parse(a.created)),matches=query.trim()?active.filter(m=>m.content&&Core.matches(m.content,query)):active.slice(0,10).filter(m=>m.content);return matches.map(m=>({id:m.id,content:m.content,created:m.created}));
    });
    ipcMain.handle('compose:preferences',async event=>{authorize(event);const state=await this.getStore().readState();return {theme:state.theme,display:Core.displayPreferences(state.display)};});
    ipcMain.handle('compose:take-draft',(event,token)=>{authorize(event);const pending=this.pendingDetach;if(!pending||pending.token!==token)throw Error('草稿已失效');return {...pending.payload,images:[...pending.payload.images]};});
    ipcMain.handle('compose:draft-loaded',async(event,token)=>{authorize(event);const pending=this.pendingDetach;if(!pending||pending.token!==token)return false;await this.getStore().composeDraft(pending.payload);if(this.pendingDetach!==pending)return false;this.pendingDetach=null;clearTimeout(pending.timer);pending.resolve({ok:true});return true;});

  }
  notifyPreferences(){if(this.window&&!this.window.isDestroyed())this.window.webContents.send('compose:preferences-changed');}
  async readBounds(){
    let saved=null;try{saved=JSON.parse(await fs.readFile(this.boundsFile,'utf8'));}catch{}
    const area=screen.getPrimaryDisplay().workArea,fallback={x:area.x+Math.round((area.width-544)/2),y:area.y+Math.round((area.height-774)/2),width:Math.min(544,area.width),height:Math.min(774,area.height)};
    if(!saved||!Number.isFinite(saved.width)||!Number.isFinite(saved.height)||!Number.isFinite(saved.x)||!Number.isFinite(saved.y))return fallback;
    const display=screen.getDisplayMatching({x:saved.x,y:saved.y,width:saved.width,height:saved.height}),work=display.workArea;
    const width=Math.min(Math.max(420,saved.width),work.width),height=Math.min(Math.max(420,saved.height),work.height);
    return {width,height,x:Math.min(Math.max(saved.x,work.x),work.x+work.width-width),y:Math.min(Math.max(saved.y,work.y),work.y+work.height-height)};
  }
  scheduleBounds(){
    if(this.restoring||!this.window||this.window.isDestroyed()||this.window.isMaximized()||this.window.isMinimized())return;
    clearTimeout(this.saveTimer);this.saveTimer=setTimeout(()=>this.writeBounds(),250);
  }
  writeBounds(){
    if(!this.boundsFile||!this.window||this.window.isDestroyed()||this.window.isMaximized()||this.window.isMinimized())return;
    try{fsSync.writeFileSync(this.boundsFile,JSON.stringify(this.window.getBounds()));}catch(error){console.error('保存新建窗口位置失败：'+error.message);}
  }
  async open(draft=null){
    if(!this.canOpen())return false;
    if(this.window&&!this.window.isDestroyed()){if(this.window.isMinimized())this.window.restore();this.window.show();this.window.focus();return true;}
    if(this.opening)return false;
    this.opening=true;
    try{
    const bounds=await this.readBounds();this.restoring=true;
    const window=new BrowserWindow({...bounds,frame:false,resizable:true,minWidth:420,minHeight:420,backgroundColor:'#ffffff',show:false,title:'Fomo · 新建',webPreferences:{preload:path.join(this.root,'desktop/compose-preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true}});
    this.window=window;installEditContextMenu(window);window.setMenu(null);window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    window.on('resize',()=>this.scheduleBounds());window.on('move',()=>this.scheduleBounds());
    window.on('close',event=>{if(!window.__fomoAllowClose){event.preventDefault();window.webContents.send('compose:request-close');return;}clearTimeout(this.saveTimer);this.writeBounds();});
    window.once('closed',()=>{if(this.window!==window)return;this.window=null;const pending=this.pendingDetach;if(pending){this.pendingDetach=null;clearTimeout(pending.timer);pending.reject(Error('新窗口在接收草稿前已关闭'));}});
    await window.loadFile(path.join(this.root,'dist/compose.html'),draft?.token?{query:{draft:draft.token}}:undefined);this.restoring=false;if(this.window!==window||window.isDestroyed())throw Error('新建窗口已关闭');window.show();window.focus();return true;
    }finally{this.opening=false;this.restoring=false;}
  }
  toggle(){
    if(this.window&&!this.window.isDestroyed()&&this.window.isMinimized()){this.window.restore();this.window.show();this.window.focus();return true;}
    if(this.window&&!this.window.isDestroyed()&&this.window.isVisible()){this.window.hide();return false;}
    this.open();return true;
  }
  async detachDraft(payload){
    if(!this.canOpen())return {ok:false,reason:'busy'};
    if(this.detaching||this.opening||(this.window&&!this.window.isDestroyed()))return {ok:false,reason:'compose-open'};
    this.detaching=true;
    try{
    const existing=await this.getStore().readComposeDraft();
    if(existing&&(existing.content.trim()||existing.images.length)){const opened=await this.open();return {ok:false,reason:opened?'compose-draft':'busy'};}
    if(this.opening||(this.window&&!this.window.isDestroyed()))return {ok:false,reason:'compose-open'};
    const content=String(payload?.content||''),html=String(payload?.html||''),images=Array.isArray(payload?.images)?payload.images:[];
    if(content.length>1_000_000||html.length>2_000_000)throw Error('草稿内容过长');
    if(images.some(src=>typeof src!=='string'||src.length>12_000_000||!/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(src)))throw Error('图片格式无效');
    const token=randomUUID();let resolveReady,rejectReady;
    const ready=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
    this.pendingDetach={token,payload:{content,html,images,submissionId:randomUUID()},resolve:resolveReady,reject:rejectReady,timer:null};
    this.pendingDetach.timer=setTimeout(()=>{const pending=this.pendingDetach;if(!pending||pending.token!==token)return;this.pendingDetach=null;pending.reject(Error('新窗口接收草稿超时'));this.close();},8000);
    try{
      await this.open({token});
      return await ready;
    }catch(error){
      const pending=this.pendingDetach;if(pending?.token===token){this.pendingDetach=null;clearTimeout(pending.timer);}
      this.close();throw error;
    }
    }finally{this.detaching=false;}
  }
  async save(payload){
    const owner=this.window;
    if(!payload||typeof payload.content!=='string'||typeof payload.html!=='string')throw Error('笔记内容无效');
    const content=payload.content.trim(),images=Array.isArray(payload.images)?payload.images:[];if(!content&&!images.length)throw Error('还没有内容');
    if(content.length>1_000_000||payload.html.length>2_000_000)throw Error('笔记内容过长');
    if(images.some(src=>typeof src!=='string'||src.length>12_000_000||!/^data:image\/(jpeg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(src)))throw Error('图片格式无效');
    const sizes=images.map(src=>{const data=src.slice(src.indexOf(',')+1);return data.length*3/4-(data.endsWith('==')?2:data.endsWith('=')?1:0);});
    if(sizes.some(size=>size>8*1024*1024))throw Error('单张图片请不超过 8 MB');
    if(sizes.reduce((sum,size)=>sum+size,0)>32*1024*1024)throw Error('图片总大小请不超过 32 MB');
    const store=this.getStore(),submissionId=payload.submissionId||randomUUID();
    if(payload.submissionId){const draft=await store.readComposeDraft();if(!draft||draft.submissionId!==submissionId||draft.content.trim()!==content||draft.html!==payload.html||JSON.stringify(draft.images)!==JSON.stringify(images))throw Error('草稿已变化，请重新保存');}
    const state=await store.readState(),desired=JSON.parse(JSON.stringify(state)),now=new Date().toISOString(),existing=state.memos.find(item=>item.id===submissionId);
    if(existing&&(existing.content!==content||existing.html!==payload.html||JSON.stringify(existing.images)!==JSON.stringify(images)))throw Error('笔记标识冲突，草稿已保留。请关闭并重新打开新建窗口后继续保存');
    const memo=existing||{id:submissionId,content,html:payload.html,created:now,updated:now,starred:false,deleted:false,images,references:[]};
    if(!existing){memo.references=Core.refsOf(memo);desired.memos.unshift(memo);await store.save(state,desired);}
    try{if(payload.submissionId)await store.clearComposeDraftIfMatches({submissionId,content,html:payload.html,images});}
    catch(error){await dialog.showMessageBox(owner,{type:'warning',title:'笔记已保存',message:'笔记已保存，但旧草稿未能清除。',detail:'下次打开新建窗口时可能再次看到旧草稿，请勿重复保存。'});}
    const closeAfterPublish=this.getNewNoteCloseAfterPublish?.()===true;
    if(this.window===owner){
      if(closeAfterPublish)this.close();
      else if(this.onShowPublished){
        try{const bounds=owner&&!owner.isDestroyed()?owner.getBounds():null;const shown=await this.onShowPublished(memo.id,bounds);if(shown)this.close();}
        catch(error){console.error('发布后展示笔记失败：'+error.message);}
      }else this.close();
    }
    this.onSaved?.(memo.id);return memo.id;
  }
  close(){if(this.window&&!this.window.isDestroyed()){this.window.__fomoAllowClose=true;this.window.close();}else this.window=null;}
}
module.exports={ComposeWindow};
