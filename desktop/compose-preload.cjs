'use strict';
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('memoCompose',{
  save:payload=>ipcRenderer.invoke('compose:save',payload),
  readDraft:()=>ipcRenderer.invoke('compose:read-draft'),
  writeDraft:value=>ipcRenderer.invoke('compose:write-draft',value),
  close:hasDraft=>ipcRenderer.invoke('compose:close',hasDraft),
  onRequestClose:callback=>{const listener=()=>callback();ipcRenderer.on('compose:request-close',listener);return ()=>ipcRenderer.removeListener('compose:request-close',listener);},
  pin:value=>ipcRenderer.invoke('compose:pin',value),
  tags:()=>ipcRenderer.invoke('compose:tags'),
  references:query=>ipcRenderer.invoke('compose:references',query),
  preferences:()=>ipcRenderer.invoke('compose:preferences'),
  takeDraft:token=>ipcRenderer.invoke('compose:take-draft',token),
  draftLoaded:token=>ipcRenderer.invoke('compose:draft-loaded',token),
  onPreferencesChanged:callback=>{const listener=()=>callback();ipcRenderer.on('compose:preferences-changed',listener);return ()=>ipcRenderer.removeListener('compose:preferences-changed',listener);}
});
