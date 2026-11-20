'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),sync=require('node:fs'),path=require('node:path'),{dialog}=require('electron');
module.exports=async({window,getStore,userDirectory,quitApp})=>{
 const ev=s=>window.webContents.executeJavaScript(s,true),delay=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async s=>{for(let i=0;i<180;i++){if(await ev(s))return;await delay(40);}throw Error('Lifecycle condition timed out: '+s)};
 const phase=process.env.MEMOFLOW_TEST_PHASE,file=path.join(getStore().directory,'draft.json');
 await until('!!document.querySelector("#editor")?.memoEditor && !!window.MemoInteractions');
 const original=await getStore().readState();
 if(phase==='lifecycle-tray-quit'){
  await ev('window.memoDesktop.setCloseToTray(true)');
  await ev('document.querySelector("#editor").memoEditor.setText("托盘退出前的草稿")');
  window.on('close',event=>{if(event.defaultPrevented)return;const draft=JSON.parse(sync.readFileSync(file,'utf8'));assert.equal(draft.current.content,'托盘退出前的草稿');console.log('PASS: lifecycle-tray-quit — explicit quit flushes draft with close-to-tray enabled');});
  quitApp();return;
 }
 if(phase==='lifecycle-corrupt'||phase.startsWith('lifecycle-invalid')){
  const raw=await fs.readFile(file,'utf8');await until('!!document.querySelector("#draftRecoveryNotice")');await delay(750);
  assert.equal(await ev('document.querySelector("#editor").isContentEditable'),false);assert.equal(await ev('document.querySelector("#composer").inert'),true);assert.equal(await ev('document.querySelectorAll("#memos>.memo").length'),2);assert.equal(await fs.readFile(file,'utf8'),raw);
  if(!process.env.CI&&phase==='lifecycle-corrupt')await fs.writeFile(path.join(userDirectory,'draft-recovery.png'),(await window.webContents.capturePage()).toPNG());
  if(phase.startsWith('lifecycle-invalid')){window.on('close',event=>{if(event.defaultPrevented)return;assert.equal(sync.readFileSync(file,'utf8'),raw);console.log('PASS: '+phase+' — malformed draft preserved and safe exit remains available');});window.close();return;}
  await ev('document.querySelector("#retryDraftRecovery").click()');await until('!!document.querySelector("#draftRecoveryNotice")');await delay(450);assert.equal(await fs.readFile(file,'utf8'),raw);
  await fs.copyFile(path.join(userDirectory,'valid-draft.json'),file);await ev('document.querySelector("#retryDraftRecovery").click()');await until('!!document.querySelector("#editor")?.memoEditor && !document.querySelector("#draftRecoveryNotice") && document.querySelector("#editor").isContentEditable && document.querySelector("#editor").value=== "顶部独立草稿"');
  assert.equal(await ev('document.querySelector("#editor").value'),'顶部独立草稿');assert.deepEqual(await getStore().readState(),original);
  console.log('PASS: '+phase+' — original draft bytes retained, persistent recovery notice, saved notes readable and explicit retry recovers');window.close();return;
 }
 if(phase==='lifecycle-restart'){
  await until('document.querySelector("#composer").closest(".memo")?.dataset.id==="a"');
  const draft=await getStore().readDraft();assert.equal(draft.editing,'a');assert.equal(draft.current.images.length,1);assert.ok(draft.current.html.includes('<strong>'));assert.equal(draft.newDraft.content,'顶部独立草稿');assert.equal(draft.annotationDrafts.b.content,'待续批注');assert.ok((draft.current.history||[]).length);
  await ev('document.querySelector("#cancelEdit").click()');assert.equal(await ev('document.querySelector("#editor").value'),'顶部独立草稿');
  await ev(`window.MemoInteractions.action('annotate',{id:'b'})`);assert.equal(await ev('document.querySelector("#editor").value'),'待续批注');await ev('document.querySelector("#cancelEdit").click()');
  assert.equal((await getStore().readState()).memos.find(m=>m.id==='a').content,'原笔记 a #阅读');
  console.log('PASS: lifecycle-restart — inline rich/image/history draft, independent annotation and main draft restored without publishing');window.close();return;
 }
 await ev(`document.querySelector('#editor').memoEditor.setText('顶部独立草稿');window.MemoInteractions.action('annotate',{id:'b'})`);await ev(`document.querySelector('#editor').memoEditor.setText('待续批注');document.querySelector('#cancelEdit').click();document.querySelector('[data-id="a"] [data-action="edit"]').click()`);
 await until('document.querySelector("#composer").closest(".memo")?.dataset.id==="a"');await ev(`document.querySelector('#editor').memoEditor.setHTML('<p><strong>退出前未提交的修改</strong></p>')`);
 const store=getStore(),write=store.draft.bind(store);let warnings=0;dialog.showMessageBox=async()=>{warnings++;return {response:0}};
 store.draft=async()=>{throw Error('Synthetic close draft write failed')};window.close();for(let i=0;i<180&&!warnings;i++)await delay(25);assert.equal(warnings,1);await until('document.querySelector("#editor").isContentEditable');assert.equal(window.isDestroyed(),false);assert.deepEqual(await store.readState(),original);store.draft=write;
 await ev(`(()=>{const read=FileReader.prototype.readAsDataURL;FileReader.prototype.readAsDataURL=function(file){window.__releaseImage=()=>{FileReader.prototype.readAsDataURL=read;read.call(this,file)}};const data=new DataTransfer(),bytes=Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='),c=>c.charCodeAt(0));data.items.add(new File([bytes],'fixture.gif',{type:'image/gif'}));document.querySelector('#editor').dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));})()`);
 let release;store.draft=async value=>{await new Promise(r=>release=r);store.draft=write;return write(value)};
 // Verify disk contents synchronously on the allowed native close before app.quit can finish.
 window.on('close',event=>{if(event.defaultPrevented)return;const draft=JSON.parse(sync.readFileSync(file,'utf8'));assert.equal(draft.current.images.length,1);assert.ok(draft.current.html.includes('<strong>'));assert.equal(draft.newDraft.content,'顶部独立草稿');assert.equal(draft.annotationDrafts.b.content,'待续批注');assert.ok(!draft.current.content.includes('不应进入'));console.log('PASS: lifecycle-first — failed close stays open, image decoding completes, final flush freezes editing and preserves all draft contexts');});
 window.close();await delay(100);assert.equal(window.isDestroyed(),false);assert.equal(release,undefined,'close must wait for image reading');await ev('window.__releaseImage()');await until('!document.querySelector("#editor").isContentEditable');for(let i=0;i<180&&!release;i++)await delay(20);assert.ok(release);await ev(`document.querySelector('#editor').memoEditor.insertText('不应进入')`);release();
};
