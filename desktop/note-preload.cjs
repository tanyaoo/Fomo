'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('memoNote',{
  editState:value=>ipcRenderer.invoke('note-window:edit-state',value),
  compose:()=>ipcRenderer.invoke('note-window:compose'),
  close:()=>ipcRenderer.invoke('note-window:close'),
  read:()=>ipcRenderer.invoke('note-window:read'),
  setFloating:value=>ipcRenderer.invoke('note-window:float',value),
  edit:()=>ipcRenderer.invoke('note-window:edit'),
  save:payload=>ipcRenderer.invoke('note-window:save',payload),
  open:id=>ipcRenderer.invoke('note-window:open',id),
  onChange:callback=>ipcRenderer.on('note-window:changed',()=>callback())
});
