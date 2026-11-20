'use strict';
const path=require('node:path');
const {BrowserWindow,ipcMain,screen,clipboard}=require('electron');
const Core=require('../dist/core.js');
const FloatState=require('./float-state.cjs');
const VIEW='fomo://app/float.html';
class FloatTray {
  constructor({root,getStore,onOpen}){
    this.root=root;this.getStore=getStore;this.onOpen=onOpen;this.window=null;this.ids=[];this.undoIds=[];this.expanded=false;
    const authorize=event=>{if(!this.window||event.sender!==this.window.webContents)throw Error('拒绝非浮窗请求');};
    ipcMain.handle('float:read',async event=>{authorize(event);return this.read();});
    ipcMain.handle('float:expand',async event=>{authorize(event);this.show(true);return true;});
    ipcMain.handle('float:collapse',async event=>{authorize(event);this.show(false);return true;});
    ipcMain.handle('float:open',async(event,id)=>{authorize(event);if(!this.ids.includes(id))throw Error('浮窗笔记不存在');this.onOpen?.(id);return true;});
    ipcMain.handle('float:remove',async(event,id)=>{authorize(event);await this.remove(id);return true;});
    ipcMain.handle('float:clear',async event=>{authorize(event);return this.clear();});
    ipcMain.handle('float:restore',async event=>{authorize(event);return this.restore();});
    ipcMain.handle('float:copy',async event=>{authorize(event);const items=await this.read();clipboard.writeText(items.items.map(x=>x.content).join('\n\n---\n\n'));return true;});
  }
  async read(){
    if(!this.window||!this.window.isDestroyed()){const state=await this.getStore().readState();const items=[];for(const id of this.ids){const memo=state.memos.find(m=>m.id===id&&!m.deleted);if(memo)items.push({id:memo.id,content:memo.content,created:memo.created,updated:memo.updated});}return {expanded:this.expanded,theme:state.theme,items};}
    return {expanded:false,theme:'light',items:[]};
  }
  async add(id){
    if(typeof id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(id))throw Error('浮窗笔记参数无效');
    const state=await this.getStore().readState();if(!state.memos.some(m=>m.id===id&&!m.deleted))throw Error('找不到这条笔记');
    this.ids=FloatState.addId(this.ids,id);this.undoIds=[];
    this.show(true);this.send();
  }
  async remove(id){this.ids=this.ids.filter(x=>x!==id);if(!this.ids.length){this.close();return;}this.show(this.expanded);this.send();}
  async clear(){const next=FloatState.clearWithUndo(this.ids);if(!next.count){this.ids=[];this.undoIds=[];this.send();return 0;}this.ids=next.ids;this.undoIds=next.undo;this.show(true);return next.count;}
  async restore(){const ids=FloatState.restoreUndo(this.undoIds);if(!ids.length)return 0;this.ids=ids;this.undoIds=[];this.show(true);return ids.length;}
  async open(id){if(!this.ids.includes(id))throw Error('浮窗笔记不存在');this.onOpen?.(id);}
  create(){
    if(this.window&&!this.window.isDestroyed())return;
    this.window=new BrowserWindow({width:56,height:56,frame:false,transparent:true,backgroundColor:'#00000000',resizable:false,minimizable:false,maximizable:false,alwaysOnTop:true,skipTaskbar:true,hasShadow:false,show:false,title:'Fomo · 浮窗',webPreferences:{preload:path.join(this.root,'desktop/float-preload.cjs'),contextIsolation:true,sandbox:true,nodeIntegration:false,webSecurity:true}});
    this.window.setAlwaysOnTop(true,'floating');this.window.loadFile(path.join(this.root,'dist/float.html'));
    this.window.webContents.setWindowOpenHandler(()=>({action:'deny'}));
    this.window.webContents.on('will-navigate',(event,url)=>{if(url!==VIEW)event.preventDefault();});
    this.window.once('closed',()=>{this.window=null;});
    this.window.once('ready-to-show',()=>{this.position();if(this.expanded){this.window.show();this.window.focus();}else this.window.showInactive();this.send();});
    this.window.on('blur',()=>{setTimeout(()=>{if(this.expanded&&this.window&&!this.window.isDestroyed()&&!this.window.isFocused())this.show(false);},120);});
  }
  position(){
    if(!this.window||this.window.isDestroyed())return;
    const area=screen.getPrimaryDisplay().workArea,width=this.expanded?536:56,height=this.expanded?Math.min(620,120+Math.max(1,this.ids.length)*90):56;
    const x=area.x+area.width-width-8,y=area.y+area.height-height-16;
    this.window.setBounds({x,y,width,height});this.window.setSkipTaskbar(true);
  }
  show(expanded){
    this.expanded=!!expanded;this.create();
    if(this.window.isDestroyed())return;
    this.position();
    if(this.expanded){this.window.show();this.window.focus();}else if(!this.window.isVisible())this.window.showInactive();else this.window.showInactive();
    this.send();
  }
  send(){if(this.window&&!this.window.isDestroyed())this.window.webContents.send('float:state');}
  notify(){this.send();}
  close(){if(this.window&&!this.window.isDestroyed())this.window.close();this.window=null;this.ids=[];this.undoIds=[];this.expanded=false;}
}
module.exports={FloatTray,VIEW};
