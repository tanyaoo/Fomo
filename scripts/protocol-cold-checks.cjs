'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const path=require('node:path');

module.exports=async({app,window,userDirectory})=>{
  const id=(await fs.readFile(path.join(userDirectory,'protocol-note-id.txt'),'utf8')).trim();
  const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  for(let i=0;i<160;i++){
    const ready=await window.webContents.executeJavaScript(`document.querySelector('#dialog').open&&document.querySelector('.note-detail')?.dataset.detailId===${JSON.stringify(id)}`,true).catch(()=>false);
    if(ready){console.log('PASS: cold protocol link opens the requested note');app.exit(0);return;}
    await wait(40);
  }
  assert.fail('cold protocol link did not open the requested note');
};
