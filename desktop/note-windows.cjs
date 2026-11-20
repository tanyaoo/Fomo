'use strict';
const path=require('node:path');
const {BrowserWindow,ipcMain,shell,dialog,screen}=require('electron');
const Core=require('../dist/core.js');
const {FloatTray}=require('./float-tray.cjs');
const {installEditContextMenu}=require('./edit-context-menu.cjs');
const VIEW='fomo://app/note.html';
class NoteWindows {
  constructor({root,getStore,onEdit,onCompose,onSaved}){
    this.root=root;this.getStore=getStore;this.onEdit=onEdit;this.onCompose=onCompose;this.onSaved=onSaved;this.windows=new Map();this.floatTray=new FloatTray({root,getStore,onOpen:id=>this.open(id,false)});
    const authorize=event=>{const entry=this.windows.get(event.sender.id);if(!entry||event.senderFrame!==entry.window.webContents.mainFrame||event.senderFrame.url!==VIEW)throw Error('拒绝非笔记窗口请求');return entry;};
    ipcMain.handle('note-window:edit-state',(event,value)=>{const entry=authorize(event);entry.dirty=value?.dirty===true;entry.saving=value?.saving===true;return true;});
    ipcMain.handle('note-window:read',async event=>{const entry=authorize(event),floating=entry.window.isAlwaysOnTop();const state=await this.getStore().readState();const memo=state.memos.find(m=>m.id===entry.id);const links=Core.relationships(state.memos,entry.id),summarize=m=>({id:m.id,content:m.content,deleted:!!m.deleted,missing:!!m.missing,...(m.sourceSlug?{sourceSlug:m.sourceSlug}:{})});return {memo:memo||null,links:Object.fromEntries(Object.entries(links).map(([key,rows])=>[key,rows.map(summarize)])),theme:state.theme,display:Core.displayPreferences(state.display),floating};});
    ipcMain.handle('note-window:save',async(event,payload)=>{
      const entry=authorize(event);if(!payload||typeof payload.content!=='string'||typeof payload.html!=='string')throw Error('笔记内容无效');
      if(payload.content.length>1_000_000||payload.html.length>2_000_000)throw Error('笔记内容过长');
      const state=await this.getStore().readState(),target=state.memos.find(m=>m.id===entry.id);
      if(!target||target.deleted)throw Error('原笔记已移除或已放入回收站');
      if(payload.base&&JSON.stringify(Core.validate({memos:[payload.base]}).memos[0])!==JSON.stringify(target))throw Error('原笔记已在其他窗口修改，请保留当前内容后重新打开');
      if(payload.images!==undefined){
        if(!Array.isArray(payload.images)||payload.images.some(src=>typeof src!=='string'||!/^data:image\/(png|jpeg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(src)))throw Error('图片格式无效');
        const original=new Set(target.images||[]),added=payload.images.filter(src=>!original.has(src)),sizes=added.map(src=>Buffer.from(src.slice(src.indexOf(',')+1),'base64').length);
        if(sizes.some(size=>size>8*1024*1024)||sizes.reduce((n,size)=>n+size,0)>32*1024*1024)throw Error('新增图片超出大小限制');
      }
      const desired=JSON.parse(JSON.stringify(state)),memo=desired.memos.find(m=>m.id===entry.id);
      if(payload.images!==undefined)memo.images=[...payload.images];
      const oldInline=new Set([...Core.memoIds(target.content),...Core.memoIds(target.html)]);
      memo.references=(target.references||[]).filter(id=>!oldInline.has(id));
      memo.content=payload.content;memo.html=payload.html;memo.updated=new Date().toISOString();memo.references=Core.refsOf(memo);
      await this.getStore().save(state,desired);this.notify();this.floatTray?.notify();this.onSaved?.(entry.id);return true;
    });
    ipcMain.handle('note-window:open',async(event,id)=>{const entry=authorize(event),state=await this.getStore().readState(),links=Core.relationships(state.memos,entry.id),target=Core.resolveRef(state.memos,id);if(!target||!Object.values(links).flat().some(m=>m.id===target.id&&!m.missing))throw Error('无效的引用');return this.open(target.id,false);});
    ipcMain.handle('note-window:float',(event,value)=>{const entry=authorize(event);if(typeof value!=='boolean')throw Error('浮窗状态无效');entry.window.setAlwaysOnTop(value);entry.window.setSkipTaskbar(value);const actual=entry.window.isAlwaysOnTop();if(actual!==value)throw Error('系统未能更改窗口置顶状态，请稍后重试');return actual;});
    ipcMain.handle('note-window:compose',event=>{authorize(event);this.onCompose?.();return true;});
    ipcMain.handle('note-window:close',event=>{const entry=authorize(event);entry.window.close();});
    ipcMain.handle('note-window:edit',async event=>{const entry=authorize(event),state=await this.getStore().readState();if(!state.memos.some(m=>m.id===entry.id&&!m.deleted))throw Error('原笔记已移除');if(entry.window.isDestroyed())return;entry.window.setAlwaysOnTop(false);this.onEdit(entry.id);});
  }
  safeBounds(bounds){
    if(!bounds||!['x','y','width','height'].every(key=>Number.isFinite(bounds[key])))return null;
    const area=screen.getDisplayMatching(bounds).workArea,width=Math.min(Math.max(360,bounds.width),area.width),height=Math.min(Math.max(420,bounds.height),area.height);
    return {width,height,x:Math.min(Math.max(bounds.x,area.x),area.x+area.width-width),y:Math.min(Math.max(bounds.y,area.y),area.y+area.height-height)};
  }
  async open(id,floating=false,bounds=null,onShown=null){
    if(floating)return this.floatTray.add(id);
    if(typeof id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(id)||typeof floating!=='boolean')throw Error('笔记窗口参数无效');
    const state=await this.getStore().readState();if(!state.memos.some(m=>m.id===id))throw Error('找不到这条笔记');
    const requested=bounds?this.safeBounds(bounds):null;
    const existing=[...this.windows.values()].find(e=>e.id===id);if(existing){if(requested)existing.window.setBounds(requested);existing.window.setAlwaysOnTop(floating);existing.window.webContents.send('note-window:changed');existing.window.show();existing.window.focus();onShown?.(existing.window);return true;}
    const view=new BrowserWindow({...(requested||{width:560,height:720}),frame:false,minWidth:360,minHeight:420,title:'Fomo · 笔记',backgroundColor:'#fafafa',show:false,alwaysOnTop:floating,skipTaskbar:floating,autoHideMenuBar:true,icon:path.join(this.root,'desktop/assets/icon.png'),webPreferences:{preload:path.join(this.root,'desktop/note-preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true}});
    this.windows.set(view.webContents.id,{window:view,id});installEditContextMenu(view);
    view.on('close',event=>{
      const entry=this.windows.get(view.webContents.id);if(!entry||entry.allowClose)return;
      if(entry.saving){event.preventDefault();return;}
      if(!entry.dirty)return;event.preventDefault();if(entry.confirming)return;entry.confirming=true;
      dialog.showMessageBox(view,{type:'question',title:'保留未保存的修改',message:'这条笔记还有未保存的修改。',detail:'继续编辑可保留当前文字和附件；放弃后不会修改已保存的笔记。',buttons:['继续编辑','放弃修改并关闭'],defaultId:0,cancelId:0,noLink:true}).then(result=>{if(view.isDestroyed())return;if(result.response===1){entry.allowClose=true;view.close();}}).catch(()=>{}).finally(()=>{entry.confirming=false;});
    });
    view.setMenu(null);
    view.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url))shell.openExternal(url).catch(()=>{});return {action:'deny'};});
    view.webContents.on('will-navigate',(event,url)=>{if(url!==VIEW)event.preventDefault();});
    view.webContents.on('will-attach-webview',event=>event.preventDefault());
    const contentsId=view.webContents.id;
    // webContents may already be destroyed when the native closed event fires.
    view.once('closed',()=>this.windows.delete(contentsId));
    view.once('ready-to-show',()=>view.show());
    try{await view.loadURL(VIEW);view.show();view.focus();onShown?.(view);return true;}catch(error){view.destroy();throw error;}
  }
  hasPendingEdits(){return [...this.windows.values()].some(entry=>!entry.window.isDestroyed()&&(entry.dirty||entry.saving));}
  focusPending(){const entry=[...this.windows.values()].find(entry=>!entry.window.isDestroyed()&&(entry.dirty||entry.saving));if(entry){if(entry.window.isMinimized())entry.window.restore();entry.window.show();entry.window.focus();}}
  notify(){for(const {window}of this.windows.values())if(!window.isDestroyed())window.webContents.send('note-window:changed');this.floatTray?.notify();}
  close(){this.floatTray?.close();for(const {window}of [...this.windows.values()])if(!window.isDestroyed())window.close();}
}
module.exports={NoteWindows,VIEW};
