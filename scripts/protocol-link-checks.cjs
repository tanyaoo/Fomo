'use strict';
const assert=require('node:assert/strict');
const {spawn}=require('node:child_process');
const fs=require('node:fs/promises');
const path=require('node:path');

module.exports=async({app,window,getStore,userDirectory})=>{
  const run=code=>window.webContents.executeJavaScript(code,true);
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const until=async code=>{for(let i=0;i<160;i++){if(await run(code))return;await wait(40);}throw Error('Protocol link timed out: '+code);};
  const invoke=url=>new Promise((resolve,reject)=>{
    const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
    const child=spawn(process.execPath,['--headless','--no-sandbox','--disable-gpu',app.getAppPath(),url],{env,stdio:'ignore',windowsHide:true});
    const timer=setTimeout(()=>{child.kill();reject(Error('Second instance did not exit'));},8000);
    child.on('error',error=>{clearTimeout(timer);reject(error);});
    child.on('exit',()=>{clearTimeout(timer);resolve();});
  });
  const before=await getStore().readState();
  let id=before.memos.find(memo=>!memo.deleted)?.id;
  if(!id){id='protocol-fixture';const now=new Date().toISOString();await getStore().save(before,{...before,memos:[{id,content:'协议链接定位验证',html:'',images:[],created:now,updated:now,deleted:false,starred:false}]});await window.webContents.reload();await until('document.querySelector("#editor")?.isContentEditable');}
  await fs.writeFile(path.join(userDirectory,'protocol-note-id.txt'),id);
  await run('window.__protocolSeen=[];window.memoDesktop.onOpenMemo(id=>window.__protocolSeen.push(id));true');
  await invoke('fomo://note/'+id);
  await until(`window.__protocolSeen.includes(${JSON.stringify(id)})`);
  await until(`document.querySelector('#dialog').open&&document.querySelector('.note-detail')?.dataset.detailId===${JSON.stringify(id)}`);
  await run('document.querySelector("#closeDialog").click()');await until('!document.querySelector("#dialog").open');
  await invoke('fomo://note/missing-link-target');
  await until('document.querySelector("#toast").textContent==="原笔记已移除"');
  await invoke('fomo://note/not%20valid');
  await until('document.querySelector("#toast").textContent.includes("笔记链接无效")');
  console.log('PASS: protocol links open an existing note and report missing or invalid targets');
  app.exit(0);
};
