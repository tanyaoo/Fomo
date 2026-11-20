'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({window,getStore,userDirectory})=>{
  const ev=code=>window.webContents.executeJavaScript(code,true);
  const until=async code=>{for(let i=0;i<180;i++){if(await ev(code))return;await new Promise(r=>setTimeout(r,40));}throw Error('History alignment timeout: '+code);};
  const click=selector=>ev(`document.querySelector(${JSON.stringify(selector)}).click()`);
  await until(`!!document.querySelector('#editor')?.memoEditor && !!document.querySelector('#multiSelect')`);
  const minute=Math.floor(Date.now()/60000)*60000-8*60000;
  const image='data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw==';
  const state=await getStore().readState();
  const next=structuredClone(state);
  next.memos=[{
    id:'history-fixture',content:'当前正文 #测试',html:'<p>当前正文 <strong>#测试</strong></p>',images:[image],created:new Date(minute-3600000).toISOString(),updated:new Date(minute+20000).toISOString(),deleted:false,starred:false,
    history:[
      {id:'hist-old',content:'较早版本',html:'<p>较早版本</p>',images:[],references:[],created:new Date(minute-60000).toISOString()},
      {id:'hist-same-a',content:'同分钟较早',html:'<p>同分钟较早</p>',images:[],references:[],created:new Date(minute+1000).toISOString()},
      {id:'hist-same-b',content:'同分钟较晚',html:'<p>同分钟较晚</p>',images:[],references:[],created:new Date(minute+20000).toISOString()}
    ]
  },{id:'history-empty-note',content:'没有历史版本',html:'',images:[],created:new Date(minute).toISOString(),updated:new Date(minute).toISOString(),deleted:false,starred:false},{id:'history-conflict-note',content:'并发前正文',html:'<p>并发前正文</p>',images:[],created:new Date(minute-3600000).toISOString(),updated:new Date(minute).toISOString(),deleted:false,starred:false,history:[{id:'conflict-old',content:'待恢复历史',html:'<p>待恢复历史</p>',images:[],references:[],created:new Date(minute-60000).toISOString()}]}];
  await getStore().save(state,next);await click('#refresh');await until(`document.querySelectorAll('.memo').length===3`);
  await ev(`document.querySelector('#editor').memoEditor.setText('保护中的顶部草稿')`);
  await ev(`window.MemoInteractions.showHistory('history-fixture')`);await until(`document.querySelectorAll('.history-version').length===2`);
  assert.equal(await ev(`document.querySelectorAll('.history-version').length`),2,'versions from the same minute are grouped');
  assert.match(await ev(`document.querySelector('#historyVersions').textContent`),/今日 \d{2}:\d{2}:\d{2}/);
  assert.match(await ev(`document.querySelector('#historyVersions').textContent`),/正文变化/);
  assert.equal(await ev(`document.querySelector('#historyVersions .history-version span').textContent`),'正文变化','reference shows the change label instead of appending a word count');
  assert.equal((await ev(`document.querySelector('#historyVersions').textContent`)).includes('当前笔记'),false,'the current note is not listed as a history revision');
  assert.equal(await ev(`!!document.querySelector('#historyDiff')||!!document.querySelector('#historyCompare')||!!document.querySelector('#historySummary')`),false,'official history has no text-diff or summary controls');
  const geometry=await ev(`(()=>{const d=document.querySelector('#dialog').getBoundingClientRect(),s=document.querySelector('.history-sidebar').getBoundingClientRect(),l=document.querySelector('#historyLabel').getBoundingClientRect(),r=document.querySelector('#loadHistory').getBoundingClientRect();return {dialog:d.width,sidebar:s.width,labelLeft:l.left,restoreRight:r.right};})()`);
  assert.ok(geometry.dialog>=1090&&geometry.dialog<=1102,'history sheet uses the official 1100px desktop width');assert.ok(Math.abs(geometry.sidebar-360)<2,'history list uses the official 360px width');assert.ok(geometry.restoreRight>geometry.labelLeft,'restore sits at the top-right of the preview');
  assert.match(await ev(`document.querySelector('#historyLabel').textContent`),/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/);
  assert.match(await ev(`document.querySelector('#historyPreview').textContent`),/同分钟较晚/);
  assert.equal(await ev(`document.querySelector('#loadHistory').textContent.trim()`),'恢复');
  window.setMinimumSize(360,480);window.setContentSize(390,700);await new Promise(r=>setTimeout(r,200));
  assert.equal(await ev(`getComputedStyle(document.querySelector('.history-sidebar')).display!=='none' && getComputedStyle(document.querySelector('.history-document')).display==='none'`),true,'narrow history opens on the list');
  await click('#historyVersions button');assert.equal(await ev(`getComputedStyle(document.querySelector('.history-sidebar')).display==='none' && getComputedStyle(document.querySelector('.history-document')).display!=='none' && !document.querySelector('.history-back').hidden`),true,'selecting a version opens the narrow detail');
  assert.match(await ev(`document.querySelector('#historyPreview').textContent`),/同分钟较晚/);
  await click('.history-back');assert.equal(await ev(`getComputedStyle(document.querySelector('.history-sidebar')).display!=='none' && document.activeElement.matches('#historyVersions button')`),true,'back returns to the selected list entry');
  window.setContentSize(1100,800);await new Promise(r=>setTimeout(r,200));
  await ev(`new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))`);await new Promise(r=>setTimeout(r,120));
  try{fs.writeFileSync(path.join(userDirectory,'history-alignment-populated.png'),(await window.webContents.capturePage()).toPNG());}catch{}
  const store=getStore(),io=store.io;
  store.io={...io,rename:async(from,to)=>{if(to===store.file)throw Error('模拟历史恢复写入失败');return io.rename(from,to);}};
  await click('#loadHistory');await click('#historyRestoreContinue');await until(`document.querySelector('#historyStatus')?.textContent.includes('恢复未完成')`);
  assert.equal(await ev(`document.querySelector('#dialog').open && !document.querySelector('#loadHistory').disabled`),true,'failure leaves the history dialog open with retry available');
  assert.equal((await store.readState()).memos.find(m=>m.id==='history-fixture').content,'当前正文 #测试','failed restore leaves persisted note unchanged');
  assert.equal(await ev(`document.querySelector('#editor').value`),'同分钟较晚','failed restore keeps the requested version in the editor');
  store.io=io;
  await click('#loadHistory');await until(`!document.querySelector('#historyRestoreConfirm').hidden`);assert.match(await ev(`document.querySelector('#historyRestoreText').textContent`),/^恢复到此版本？/);await click('#historyRestoreContinue');await until(`!document.querySelector('#dialog').open`);
  const restored=(await getStore().readState()).memos.find(m=>m.id==='history-fixture');
  assert.equal(restored.content,'同分钟较晚');assert.deepEqual(restored.images,[image]);assert.ok(restored.history.length>=3);assert.equal(await ev(`document.querySelector('#editor').value`),'保护中的顶部草稿');
  await ev(`window.MemoInteractions.showHistory('history-conflict-note')`);await until(`document.querySelector('#historyPreview')?.textContent.includes('待恢复历史')`);
  await ev(`memoDesktop.openNote('history-conflict-note')`);
  const {BrowserWindow}=require('electron');let native;
  for(let i=0;i<160;i++){native=BrowserWindow.getAllWindows().find(w=>w!==window&&w.webContents.getURL().endsWith('/note.html'));if(native&&await native.webContents.executeJavaScript(`document.querySelector('#noteContent')?.textContent.includes('并发前正文')`))break;await new Promise(r=>setTimeout(r,40));}
  assert.ok(native,'independent note window opens');const nev=code=>native.webContents.executeJavaScript(code,true);
  await nev(`document.querySelector('#noteContent').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
  for(let i=0;i<160;i++){if(await nev(`document.body.classList.contains('note-editing') && !!document.querySelector('#noteEditor')?.memoEditor`))break;await new Promise(r=>setTimeout(r,40));}
  await nev(`document.querySelector('#noteEditor').memoEditor.setText('另一窗口的新正文');document.querySelector('#saveNote').click()`);
  for(let i=0;i<160;i++){if((await store.readState()).memos.find(m=>m.id==='history-conflict-note').content==='另一窗口的新正文')break;await new Promise(r=>setTimeout(r,40));}
  await until(`document.querySelector('[data-id="history-conflict-note"] .memo-content')?.textContent.includes('另一窗口的新正文')`);
  await click('#loadHistory');await click('#historyRestoreContinue');await until(`document.querySelector('#dialogTitle')?.textContent==='比较笔记版本'`);
  assert.equal((await store.readState()).memos.find(m=>m.id==='history-conflict-note').content,'另一窗口的新正文','conflicting restore does not overwrite newer text');
  assert.equal(await ev(`document.querySelector('#editor').value`),'待恢复历史','conflicting restore preserves the requested revision as draft');
  assert.ok(await ev(`document.querySelector('#dialogBody').textContent.includes('另一窗口的新正文') && document.querySelector('#dialogBody').textContent.includes('待恢复历史')`),'comparison shows both versions');
  await click('#keepDraft');await until(`!document.querySelector('#dialog').open`);await click('#cancelEdit');assert.equal(await ev(`document.querySelector('#editor').value`),'保护中的顶部草稿','cancel returns to the original top draft');
  native.close();
  await click('[data-id="history-fixture"] [data-action="edit"]');await ev(`document.querySelector('#editor').memoEditor.setHTML('<p><strong>未保存的原位草稿</strong></p>')`);
  await ev(`window.MemoInteractions.showHistory('history-fixture')`);
  assert.equal(await ev(`document.querySelector('#dialog').open && document.querySelector('#loadHistory').disabled`),true,'history remains viewable but restore is disabled for an active edit');
  assert.match(await ev(`document.querySelector('#historyStatus').textContent`),/先保存或取消当前编辑/);
  assert.match(await ev(`document.querySelector('#editor').innerHTML`),/<strong>未保存的原位草稿<\/strong>/,'active rich draft remains intact');
  assert.equal((await store.readState()).memos.find(m=>m.id==='history-fixture').content,'同分钟较晚','guard does not write the note');
  await click('#closeDialog');await click('#cancelEdit');assert.equal(await ev(`document.querySelector('#editor').value`),'保护中的顶部草稿');
  await ev(`window.MemoInteractions.showHistory('history-empty-note')`);await until(`!document.querySelector('#historyEmpty').hidden`);assert.equal(await ev(`document.querySelectorAll('.history-version').length`),0);assert.equal(await ev(`document.querySelector('#loadHistory').disabled`),true);assert.match(await ev(`document.querySelector('#historyEmpty').textContent`),/暂无历史版本/);
  try{fs.writeFileSync(path.join(userDirectory,'history-alignment.png'),(await window.webContents.capturePage()).toPNG());}catch{}
  console.log('PASS: history-alignment — minute grouping, relative seconds, 360px list, immediate restore, attachment preservation and empty state');
  window.close();
};
