'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('memoFloat',{
  read:()=>ipcRenderer.invoke('float:read'),
  expand:()=>ipcRenderer.invoke('float:expand'),
  collapse:()=>ipcRenderer.invoke('float:collapse'),
  open:id=>ipcRenderer.invoke('float:open',id),
  remove:id=>ipcRenderer.invoke('float:remove',id),
  clear:()=>ipcRenderer.invoke('float:clear'),
  restore:()=>ipcRenderer.invoke('float:restore'),
  copy:()=>ipcRenderer.invoke('float:copy'),
  onState:callback=>ipcRenderer.on('float:state',()=>callback())
});
