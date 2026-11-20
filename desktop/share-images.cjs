'use strict';
const {dialog,app,nativeImage,clipboard,ClipboardItem}=require('electron');
const path=require('node:path');
const {atomicWrite}=require('./file-store.cjs');
async function shareImage(window,request){
  if(!request||!['save','copy'].includes(request.kind)||typeof request.data!=='string'||request.data.length>48000000||!/^data:image\/png;base64,[A-Za-z0-9+/]+=*$/.test(request.data))throw Error('分享图片参数无效');
  const buffer=Buffer.from(request.data.slice(request.data.indexOf(',')+1),'base64');
  if(buffer.length<24||buffer.readUInt32BE(0)!==0x89504e47||buffer.readUInt32BE(4)!==0x0d0a1a0a)throw Error('分享图片格式无效');
  const width=buffer.readUInt32BE(16),height=buffer.readUInt32BE(20);if(!width||!height||width>16000||height>28000||width*height>24000000)throw Error('分享图片尺寸过大');
  const image=nativeImage.createFromBuffer(buffer);if(image.isEmpty())throw Error('分享图片无法读取');
  if(request.kind==='copy'){
    if(typeof clipboard.writeImage==='function'){clipboard.writeImage(image);return true;}
    if(typeof clipboard.write!=='function'||typeof ClipboardItem!=='function')throw Error('当前系统不支持复制图片，请保存图片');
    await clipboard.write([new ClipboardItem({'image/png':new Blob([buffer],{type:'image/png'})})]);
    return true;
  }
  const selected=await dialog.showSaveDialog(window,{title:'保存分享图片',defaultPath:path.join(app.getPath('pictures'),'Fomo-'+new Date().toISOString().slice(0,10)+'.png'),filters:[{name:'PNG 图片',extensions:['png']}]});
  if(selected.canceled||!selected.filePath)return false;await atomicWrite(selected.filePath,buffer);return true;
}
module.exports={shareImage};
