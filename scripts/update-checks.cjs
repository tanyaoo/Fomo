'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
module.exports=async({app,window,getStore,userDirectory})=>{
 const evaluate=code=>window.webContents.executeJavaScript(code).catch(error=>{console.error('Updater test expression:',code);throw error;});
 window.webContents.on('console-message',details=>{if(details.level==='error'&&!details.message.includes('Content Security Policy'))console.error('Updater renderer:',details.message);});
 const until=async code=>{for(let i=0;i<160;i++){if(await evaluate(code))return;await new Promise(r=>setTimeout(r,50));}const status=await evaluate('window.memoDesktop.updateStatus()').catch(error=>({error:error.message}));throw Error('Updater UI timeout: '+code+' status='+JSON.stringify(status));};
 await until('!!document.querySelector("#editor")?.memoEditor && !!document.querySelector("#multiSelect") && !!document.querySelector("#settings")?.onclick');
 if(process.env.MEMOFLOW_TEST_PHASE==='updates-restart'){
   await until(`document.querySelector('#dialog').open && !!document.querySelector('#referenceComposerSlot #editor')`);
   const expected=JSON.parse(await fs.readFile(path.join(userDirectory,'expected-update.json'),'utf8'));
   assert.equal(getStore().directory,expected.directory);assert.deepEqual(await getStore().readState(),expected.state);
   assert.equal(await evaluate(`window.MemoShell.pinned('阅读')`),true);assert.equal(await evaluate(`document.querySelector('#editor').value`),expected.draft.current.content);assert.equal(await evaluate(`document.querySelectorAll('#attachments img').length`),1);
   await evaluate(`document.querySelector('#cancelEdit').click()`);assert.equal(await evaluate(`document.querySelector('#editor').value`),'顶部未提交的原草稿');
   await evaluate(`window.MemoInteractions.action('annotate',{id:'b'})`);await until(`document.querySelector('#dialog').open && !!document.querySelector('#referenceComposerSlot #editor')`);assert.equal(await evaluate(`document.querySelector('#editor').value`),'另一份独立批注');
   assert.equal((await getStore().readDraft()).newDraft.content,'顶部未提交的原草稿');
   console.log('PASS: updater restart — custom directory, notes, pending annotation/image, independent drafts and preferences survive');window.close();return;
 }
 const now=new Date().toISOString(),initial=await getStore().readState();await getStore().save(initial,{...initial,theme:'dark',memos:['a','b'].map(id=>({id,content:'参考笔记 '+id+' #阅读/摘录',html:'',images:[],created:now,updated:now,deleted:false,starred:false}))});
 await evaluate(`document.querySelector('#refresh').click()`);await until(`document.querySelectorAll('#memos>.memo').length===2`);
 await evaluate(`window.MemoShell.togglePin('阅读');document.querySelector('#editor').memoEditor.setText('顶部未提交的原草稿');document.querySelector('#settings').click()`);
 await until(`!!document.querySelector('#changeDataDirectory')`);await evaluate(`document.querySelector('#tabStorage').click();document.querySelector('#changeDataDirectory').click()`);await until(`document.querySelector('#migrationStatus').textContent.startsWith('已切换到新位置')`);
 await evaluate(`document.querySelector('#tabAbout').click()`);
 await fs.writeFile(path.join(userDirectory,'corrupt-download'),'test');
 await evaluate('window.memoDesktop.checkUpdates()');assert.equal((await evaluate('window.memoDesktop.updateStatus()')).phase,'error');
 await assert.rejects(fs.access(path.join(userDirectory,'install-request.json')));
 await fs.unlink(path.join(userDirectory,'corrupt-download'));
 await evaluate('window.memoDesktop.checkUpdates()');await until(`document.querySelector('#installUpdate').hidden===false && document.querySelector('#installUpdate').disabled===false`);
 assert.equal((await evaluate('window.memoDesktop.updateStatus()')).phase,'ready');
 await assert.rejects(fs.access(path.join(userDirectory,'install-request.json')));
 await evaluate(`document.querySelector('#closeDialog').click();window.MemoInteractions.action('annotate',{id:'b'})`);await evaluate(`document.querySelector('#editor').memoEditor.setText('另一份独立批注');document.querySelector('#cancelEdit').click()`);
 await evaluate(`window.MemoInteractions.action('annotate',{id:'a'})`);await evaluate(`document.querySelector('#editor').memoEditor.setHTML('<p><strong>自动更新前尚未保存的批注</strong></p>');window.__updateIds=[];window.memoDesktop.onPrepareUpdate(id=>window.__updateIds.push(id));void 0;`);
 // Hold image decoding so an update cannot start its final flush too early.
 await evaluate(`(()=>{const read=FileReader.prototype.readAsDataURL;FileReader.prototype.readAsDataURL=function(file){window.__releaseImage=()=>{FileReader.prototype.readAsDataURL=read;read.call(this,file);};};const data=new DataTransfer(),bytes=Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='),c=>c.charCodeAt(0));data.items.add(new File([bytes],'fixture.gif',{type:'image/gif'}));document.querySelector('#editor').dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));})()`);
 const store=getStore(),originalDraft=store.draft.bind(store);store.draft=async()=>{throw Error('Synthetic disk full');};
 await evaluate(`window.memoDesktop.installUpdate()`);await until(`window.__updateIds.length===1`);
 assert.equal((await evaluate('window.memoDesktop.updateStatus()')).phase,'preparing');assert.equal(await evaluate(`window.memoDesktop.updatePrepared(true,'stale-attempt')`),false);await assert.rejects(fs.access(path.join(userDirectory,'install-request.json')));
 await evaluate(`window.__releaseImage()`);await until(`document.querySelector('#toast').textContent.includes('更新已暂停') && document.querySelector('#editor').isContentEditable`);await assert.rejects(fs.access(path.join(userDirectory,'install-request.json')));assert.equal(await evaluate(`document.querySelectorAll('#attachments img').length`),1);
 // Cancel an attempt with a delayed write, edit again, and retry. Its late acknowledgement must not approve the new attempt.
 let release;store.draft=async value=>{await new Promise(resolve=>release=resolve);return originalDraft(value);};
 await evaluate(`window.memoDesktop.installUpdate()`);await until(`window.__updateIds.length===2 && !document.querySelector('#editor').isContentEditable`);
 for(let i=0;i<160&&!release;i++)await new Promise(r=>setTimeout(r,20));assert.ok(release);
 await evaluate(`window.memoDesktop.updatePrepared(false,window.__updateIds[1])`);await until(`document.querySelector('#editor').isContentEditable`);
 await evaluate(`document.querySelector('#editor').memoEditor.insertText('重试前继续输入：')`);store.draft=originalDraft;await evaluate(`window.memoDesktop.installUpdate()`);await until(`window.__updateIds.length===3`);
 assert.equal(await evaluate(`window.memoDesktop.updatePrepared(true,window.__updateIds[1])`),false);await assert.rejects(fs.access(path.join(userDirectory,'install-request.json')));release();
 for(let i=0;i<160;i++){try{await fs.access(path.join(userDirectory,'install-request.json'));break;}catch{await new Promise(r=>setTimeout(r,40));}}
 const marker=JSON.parse(await fs.readFile(path.join(userDirectory,'install-request.json'),'utf8'));assert.equal(marker.silent,true);assert.equal(marker.reopen,true);assert.ok(marker.installerPath.endsWith('.exe'));
 const downloaded=await fs.readFile(marker.installerPath,'utf8');assert.match(downloaded,/never execute/);
 const draft=await getStore().readDraft(),state=await getStore().readState();assert.ok(draft.current.content.includes('重试前继续输入：'));assert.equal(draft.current.annotationOf,'a');assert.equal(draft.current.images.length,1);assert.equal(draft.newDraft.content,'顶部未提交的原草稿');assert.equal(draft.annotationDrafts.b.content,'另一份独立批注');assert.equal(state.memos.length,2);
 await fs.writeFile(path.join(userDirectory,'expected-update.json'),JSON.stringify({directory:getStore().directory,state,draft}));
 await window.webContents.capturePage().then(image=>fs.writeFile(path.join(userDirectory,'updater.png'),image.toPNG()));
 console.log('PASS: updater real download/checksum, UI, draft failure blocks install, retry saves draft before install; isolated '+userDirectory);app.exit(0);
};
