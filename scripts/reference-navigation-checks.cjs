'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
module.exports=async({window,getStore,userDirectory})=>{
 const ev=async code=>{try{return await window.webContents.executeJavaScript(code);}catch(error){throw Error('引用导航测试脚本失败：'+code.slice(0,500)+'；'+error.message);}},delay=ms=>new Promise(r=>setTimeout(r,ms));
 const until=async code=>{for(let i=0;i<180;i++){if(await ev(code))return;await delay(40);}throw Error('Navigation timed out: '+code);};
 const frames=()=>ev('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
 const click=selector=>ev(`document.querySelector(${JSON.stringify(selector)}).click()`);
 const choose=async key=>{await click('#detailSwitch');await click('#detailTabs [data-detail-tab="'+key+'"]');};
 const detail=async id=>{await until(`document.querySelector('.note-detail')?.dataset.detailId === '${id}'`);await frames();};
 const scrolls=()=>ev(`({primary:document.querySelector('.detail-primary-scroll').scrollTop,links:document.querySelector('#detailTabContent').scrollTop,body:document.querySelector('#dialogBody').scrollTop,tab:document.querySelector('.note-detail').dataset.relationView})`);
 await until('!!window.MemoInteractions && document.querySelectorAll("#memos>.memo").length===24');
 // Use generated audio and a fixed synthetic video; never read a personal attachment.
 window.webContents.setBackgroundThrottling(false);
 const media=await ev(`(async()=>{
   const bytes=new ArrayBuffer(16044),wav=new DataView(bytes),label=(at,text)=>[...text].forEach((c,i)=>wav.setUint8(at+i,c.charCodeAt(0)));
   label(0,'RIFF');wav.setUint32(4,16036,true);label(8,'WAVE');label(12,'fmt ');wav.setUint32(16,16,true);wav.setUint16(20,1,true);wav.setUint16(22,1,true);wav.setUint32(24,8000,true);wav.setUint32(28,16000,true);wav.setUint16(32,2,true);wav.setUint16(34,16,true);label(36,'data');wav.setUint32(40,16000,true);
   const data=blob=>new Promise(resolve=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.readAsDataURL(blob);});
   return {audio:await data(new Blob([bytes],{type:'audio/wav'}))};
 })()`);
 media.video='data:video/webm;base64,'+(await fs.readFile(path.join(__dirname,'../tests/fixtures/synthetic-reference.webm'))).toString('base64');
 const fixture=await getStore().readState(),desired=JSON.parse(JSON.stringify(fixture));
 desired.memos.find(m=>m.id==='incoming-18').audio=media.audio;
 desired.memos.find(m=>m.id==='incoming-17').video=media.video;
 const mixed=desired.memos.find(m=>m.id==='incoming-16');mixed.images=['data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='];mixed.audio=media.audio;mixed.video=media.video;
 await getStore().save(fixture,desired);await click('#refresh');
 await until(`!!document.querySelector('[data-id="incoming-18"] audio') && !!document.querySelector('[data-id="incoming-17"] video')`);
 const original=await getStore().readState();
 // A source link follows the incoming edge even if the target also has outgoing references.
 for(const selector of ['.annotation-parent','.annotation-source']){
   await click('[data-id="annotation"] '+selector);await detail('a');
   assert.equal(await ev(`document.querySelector('.note-detail').dataset.relationView`),'quoted','annotation source enters the original note on incoming references');
   assert.ok(await ev(`!!document.querySelector('#detailTabContent [data-relation-id="annotation"]')`),'incoming list contains the originating annotation');
   await click('#closeDialog');await until('!document.querySelector("#dialog").open');await frames();
 }
 console.log('PASS: annotation source links open the incoming reference view');
 // A filtered, scrolled list must survive nested references and closing the sheet.
 await ev(`document.querySelector('#search').value='导航';document.querySelector('#search').dispatchEvent(new Event('input',{bubbles:true}));`);
 await until('document.querySelectorAll("#memos>.memo").length===24 && document.querySelector("#clearSearch").hidden===false');
 await ev(`document.querySelector('[data-id="a"] .memo-menu-button').focus({preventScroll:true});document.querySelector('#memos').scrollTop=350;`);
 const origin=await ev(`({search:document.querySelector('#search').value,scroll:document.querySelector('#memos').scrollTop,ids:[...document.querySelectorAll('#memos>.memo')].map(m=>m.dataset.id)})`);assert.ok(origin.scroll>0);
 await ev(`window.MemoInteractions.openDetail('a','quoted')`);await detail('a');
 assert.deepEqual(await ev(`[...document.querySelectorAll('#detailTabs button')].map(b=>b.textContent)`),['引用','被引用']);
 assert.equal(await ev(`document.querySelector('#detailTabs [aria-selected="true"]').dataset.detailTab`),'quoted');
 // The switch menu uses arrow keys for focus without changing the current relation.
 const tabKey=async key=>{await ev(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:${JSON.stringify(key)},bubbles:true,cancelable:true}))`);};
 await click('#detailSwitch');
 await ev(`document.querySelector('#detailTabs [aria-selected="true"]').focus()`);
 for(const [key,expected] of [['ArrowDown','quote'],['ArrowUp','quoted'],['Home','quote'],['End','quoted']]){
   await tabKey(key);
   assert.equal(await ev('document.activeElement.dataset.detailTab'),expected);
   assert.equal(await ev(`document.querySelector('.note-detail').dataset.relationView`),'quoted');
   assert.equal(await ev(`document.activeElement.getAttribute('aria-controls')`),'detailTabContent');
 }
 await tabKey('Escape');assert.equal(await ev('document.activeElement.id'),'detailSwitch');
 if(!process.env.CI)await fs.writeFile(path.join(userDirectory,'relation-tabs-keyboard.png'),(await window.webContents.capturePage()).toPNG());
 assert.equal(await ev(`document.querySelectorAll('#detailTabContent [data-relation-id="annotation"]').length`),1,'annotation appears once in incoming references');
 for(const [id,tag] of [['incoming-18','audio'],['incoming-17','video'],['incoming-16','audio'],['incoming-16','video']]){
   const selector='#detailTabContent [data-relation-id="'+id+'"] '+tag;
   try{await until(`document.querySelector(${JSON.stringify(selector)})?.readyState >= 1`);}catch(error){console.error('媒体加载诊断',JSON.stringify(await ev(`(()=>{const m=document.querySelector(${JSON.stringify(selector)});return m?{ready:m.readyState,network:m.networkState,error:m.error?.code,srcLength:m.src.length,preload:m.preload}:null})()`)));throw error;}
   assert.equal(await ev(`document.querySelector(${JSON.stringify(selector)}).controls`),true);
   assert.equal(await ev(`document.querySelector(${JSON.stringify(selector)}).error`),null);
   await ev(`(async()=>{const media=document.querySelector(${JSON.stringify(selector)});media.muted=true;await media.play();})()`);
   await until(`document.querySelector(${JSON.stringify(selector)}).currentTime > 0`);
   await ev(`document.querySelector(${JSON.stringify(selector)}).pause()`);
 }
 // A corrupt source exposes a real error; retry uses the existing element without rewriting the note.
 await ev(`(()=>{const media=document.querySelector('#detailTabContent [data-relation-id="incoming-18"] audio');window.__validAudio=media.src;media.src='data:audio/wav;base64,AAAA';media.load();})()`);
 await until(`!!document.querySelector('#detailTabContent [data-relation-id="incoming-18"] .media-load-feedback button')`);
 assert.ok(await ev(`document.querySelector('#detailTabContent [data-relation-id="incoming-18"] .media-load-feedback').textContent.includes('原附件仍保留')`));
 await ev(`(()=>{const media=document.querySelector('#detailTabContent [data-relation-id="incoming-18"] audio'),button=media.nextElementSibling.querySelector('button');media.src=window.__validAudio;button.click();})()`);
 await until(`document.querySelector('#detailTabContent [data-relation-id="incoming-18"] audio').readyState>=1 && !document.querySelector('#detailTabContent [data-relation-id="incoming-18"] .media-load-feedback')`);
 assert.equal(await ev(`document.querySelectorAll('#detailTabContent [data-relation-id="incoming-18"] img').length`),0);
 assert.equal(await ev(`document.querySelectorAll('#detailTabContent [data-relation-id="incoming-17"] img').length`),0);
 assert.equal(await ev(`document.querySelector('#detailTabContent [data-relation-id="incoming-19"] .relation-parent').disabled`),true);
 assert.ok(await ev(`document.querySelector('#detailTabContent [data-relation-id="incoming-19"] .relation-parent').textContent.includes('原笔记暂不可用')`));
 await ev(`document.querySelector('#detailTabContent [data-relation-id="annotation"] [data-relation-open]').focus({preventScroll:true})`);
 await ev(`document.querySelector('.detail-primary-scroll').scrollTop=210;document.querySelector('#detailTabContent').scrollTop=170;`);
 const first=await scrolls();assert.ok(first.primary>0);assert.ok(first.links>0);
 assert.equal((await scrolls()).links,first.links,'relation pane retains its reading position');
 await ev(`document.querySelector('#detailTabContent [data-relation-open="b"]').focus({preventScroll:true})`);
 // Relation directions retain independent list/card positions.
 await choose('quote');assert.equal((await scrolls()).links,0);
 await choose('quoted');
 assert.equal((await scrolls()).links,first.links);
 assert.equal(await ev(`(()=>{const overflow=getComputedStyle(document.querySelector('#detailTabContent [data-relation-id="b"] .relation-body')).overflowY;return overflow!=='auto'&&overflow!=='scroll'})()`),true,'relation cards scroll with the shared pane instead of separately');
 await ev(`window.__relationCard=document.querySelector('#detailTabContent [data-relation-id="b"]')`);
 await choose('quoted');
 assert.equal(await ev(`window.__relationCard===document.querySelector('#detailTabContent [data-relation-id="b"]')`),true);
 await ev(`document.querySelector('#detailTabContent [data-relation-open="b"]').focus({preventScroll:true})`);
 await click('#detailTabContent [data-relation-open="b"]');await detail('b');
 assert.equal((await scrolls()).primary,0,'new destination starts at top');
 await ev(`document.querySelector('.detail-primary-scroll').scrollTop=120;document.querySelector('#detailTabContent').scrollTop=95;`);const second=await scrolls();
 await click('.detail-primary [data-memo-id="c"]');await detail('c');
 await click('#detailBack');await detail('b');assert.deepEqual(await scrolls(),second,'first back restores child tab and both scroll columns');
 await click('#detailBack');await detail('a');assert.deepEqual(await scrolls(),first,'second back restores root tab and both scroll columns');
 assert.equal(await ev(`(()=>{const overflow=getComputedStyle(document.querySelector('#detailTabContent [data-relation-id="b"] .relation-body')).overflowY;return overflow!=='auto'&&overflow!=='scroll'})()`),true,'relation cards scroll with the shared pane instead of separately');
 assert.equal(await ev(`document.activeElement.dataset.relationOpen`),'b');
 assert.equal(await ev('!!document.querySelector("#detailBack")'),false);
 if(!process.env.CI)await fs.writeFile(path.join(userDirectory,'reference-navigation.png'),(await window.webContents.capturePage()).toPNG());
 await click('#closeDialog');await until('!document.querySelector("#dialog").open');await frames();
 assert.deepEqual(await ev(`({search:document.querySelector('#search').value,scroll:document.querySelector('#memos').scrollTop,ids:[...document.querySelectorAll('#memos>.memo')].map(m=>m.dataset.id)})`),origin,'close returns to the unchanged filtered list');
 assert.equal(await ev(`document.activeElement===document.querySelector('[data-id="a"] .memo-menu-button')`),true);
  // Each relation direction has its own tab; missing sources stay visible while trash targets are omitted.
 await ev(`window.MemoInteractions.openDetail('a','quoted')`);await detail('a');
 assert.equal(await ev(`document.querySelectorAll('#detailTabContent [data-relation-id="annotation"]').length`),1);
 assert.equal(await ev(`document.querySelectorAll('#detailTabContent [data-relation-id="annotation"] .relation-parent[data-relation-open="a"]').length`),1);
 await choose('quote');
 assert.equal(await ev(`document.querySelectorAll('#detailTabContent article.is-missing').length`),1);
 assert.ok(await ev(`document.querySelector('#detailTabContent article.is-missing').textContent.includes('原笔记暂不可用')`));
 assert.equal(await ev(`document.querySelectorAll('#detailTabContent article.is-missing [data-relation-open]').length`),0);
 assert.ok(await ev(`document.querySelector('#detailTabContent [data-missing-source="missing-source"]').textContent.includes('引用关系仍保留')`));
  assert.equal(await ev(`document.querySelectorAll('#detailTabContent article[data-relation-id]').length`),1);
  assert.equal(await ev(`document.querySelectorAll('#detailTabContent [data-relation-id="trash"]').length`),0);
  await ev(`window.MemoInteractions.openDetail('trash')`);await detail('trash');
 assert.ok((await ev('document.querySelector(".detail-meta").textContent')).includes('回收站'));assert.equal(await ev('!!document.querySelector("#detailEdit")'),false);
 assert.ok(await ev(`document.querySelector('#detailTrashStatus').textContent.includes('恢复后可继续编辑')`));
 await click('#detailBack');await detail('a');
 assert.equal(await ev(`document.querySelector('.note-detail').dataset.relationView`),'quote','back restores the explicitly selected outgoing tab');
 assert.equal(await ev(`document.querySelectorAll('#detailTabs [aria-selected="true"]').length`),1);
 assert.equal(await ev(`document.querySelector('#detailTabs [aria-selected="true"]').dataset.detailTab`),'quote');
 await click('#closeDialog');await frames();
 // A compact window scrolls the whole sheet; restore that independently of desktop column positions.
 window.setMinimumSize(360,480);window.setSize(580,760);await until('innerWidth<760');
 await ev(`window.MemoInteractions.openDetail('a','quoted')`);await detail('a');await ev(`document.querySelector('#dialogBody').scrollTop=310;`);const narrow=await scrolls();assert.ok(narrow.body>0);
 await choose('quote');await ev(`document.querySelector('#dialogBody').scrollTop=180`);
 await choose('quoted');assert.equal((await scrolls()).body,narrow.body,'narrow tabs retain separate whole-sheet positions');
 await click('#detailTabContent [data-relation-open="b"]');await detail('b');await click('#detailBack');await detail('a');assert.equal((await scrolls()).body,narrow.body,'narrow detail body returns to its previous position');
 assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth'),true);
 await click('#closeDialog');await frames();
 await ev(`window.MemoInteractions.openDetail('incoming-19')`);await detail('incoming-19');
 assert.equal(await ev(`document.querySelector('#detailProvenance button').disabled`),true);
 assert.ok(await ev(`document.querySelector('#detailProvenance').textContent.includes('原笔记暂不可用')`));
 assert.ok(await ev(`document.querySelector('.detail-primary .memo-content').textContent.includes('导航引用 19')`),'missing provenance never hides the current note');
 await click('#closeDialog');await frames();
 // An intentional tag navigation replaces the context instead of restoring old filters.
 await ev(`window.MemoInteractions.openDetail('a')`);await detail('a');assert.equal(await ev('!!document.querySelector("#detailBack")'),false);
 await click('.detail-primary .tag-link');await until('!document.querySelector("#dialog").open && document.querySelector("#viewTitle").textContent.includes("导航")');await frames();
 assert.equal(await ev('document.querySelector("#search").value'),'');assert.equal(await ev('document.querySelector("#memos").scrollTop'),0);
 // Opening a detail while an annotation is pending restores the composer and cursor on return.
 await ev(`window.MemoInteractions.action('annotate',{id:'a'})`);await until('!!document.querySelector("#referenceComposerSlot #editor")');
 await ev(`document.querySelector('#editor').memoEditor.setText('等待继续的批注');document.querySelector('#editor').memoEditor.restoreSelection({anchor:3,head:3})`);
 await ev('window.MemoInteractions.openDetail("a")');await detail('a');await click('#closeDialog');await until('document.querySelector("#dialog").open && !!document.querySelector("#referenceComposerSlot #editor") && document.querySelector("#editor").memoEditor.getSelection().anchor===3');
 assert.equal(await ev('document.querySelector("#editor").value'),'等待继续的批注');assert.deepEqual(await ev('document.querySelector("#editor").memoEditor.getSelection()'),{anchor:3,head:3});
 await click('#cancelEdit');await until('!document.querySelector("#dialog").open');assert.equal(await ev('document.querySelector("#editor").value'),'尚未提交的原草稿');
 // Opening a referenced note in a separate window must leave both reading position and the main draft intact.
 await ev(`document.querySelector('#editor').memoEditor.focus();document.querySelector('#editor').memoEditor.restoreSelection({anchor:3,head:3})`);
 const mainDraft=await ev(`({text:document.querySelector('#editor').memoEditor.getText(),html:document.querySelector('#editor').memoEditor.getHTML(),selection:document.querySelector('#editor').memoEditor.getSelection()})`);
 await ev(`window.memoDesktop.openNote('b',false)`);
 const browsers=require('electron').BrowserWindow;
 const parent=browsers.getAllWindows().find(w=>w!==window&&w.webContents.getURL()==='fomo://app/note.html');assert.ok(parent);
 const parentEv=code=>parent.webContents.executeJavaScript(code);
 for(let i=0;i<180&&!await parentEv(`!!document.querySelector('#noteContent [data-memo-id="c"]')`);i++)await delay(40);
 assert.ok(await parentEv(`!!document.querySelector('#noteContent [data-memo-id="c"]')`));
 await parentEv(`(()=>{const box=document.querySelector('.note-window-content'),link=document.querySelector('#noteContent [data-memo-id="c"]');box.scrollTop=box.scrollHeight;link.focus({preventScroll:true});})()`);
 const parentScroll=await parentEv(`document.querySelector('.note-window-content').scrollTop`);assert.ok(parentScroll>0);
 await parentEv(`document.querySelector('#noteContent [data-memo-id="c"]').click()`);
 let child,childReady=false;for(let i=0;i<180;i++){child=browsers.getAllWindows().find(w=>w!==window&&w!==parent&&w.webContents.getURL()==='fomo://app/note.html');if(child&&await child.webContents.executeJavaScript(`window.memoNote.read().then(x=>x.memo?.id==='c')`)){childReady=true;break;}await delay(40);}assert.ok(childReady,'referenced note opens in another window');
 child.close();await delay(100);assert.equal(await parentEv(`document.querySelector('.note-window-content').scrollTop`),parentScroll,'opening and closing a referenced window preserves parent reading position');assert.equal(await parentEv(`document.activeElement===document.querySelector('#noteContent [data-memo-id="c"]')`),true,'return retains the reference link focus');
 assert.deepEqual(await ev(`({text:document.querySelector('#editor').memoEditor.getText(),html:document.querySelector('#editor').memoEditor.getHTML(),selection:document.querySelector('#editor').memoEditor.getSelection()})`),mainDraft,'independent windows preserve the main draft and selection');
 await parentEv(`document.querySelector('#noteContent').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`);
 for(let i=0;i<180&&!await parentEv(`document.body.classList.contains('note-editing')`);i++)await delay(40);
 assert.equal(await parentEv(`document.body.classList.contains('note-editing')`),true);
 await parentEv(`document.querySelector('#noteEditor').memoEditor.setHTML('<p><strong>独立窗口未保存内容</strong></p>');document.querySelector('#noteEditor').memoEditor.restoreSelection({anchor:3,head:3})`);
 const independentDraft=await parentEv(`({html:document.querySelector('#noteEditor').memoEditor.getHTML(),selection:document.querySelector('#noteEditor').memoEditor.getSelection()})`);
 await ev(`window.MemoInteractions.openDetail('a','quoted')`);await detail('a');await click('#closeDialog');await until('!document.querySelector("#dialog").open');assert.deepEqual(await parentEv(`({html:document.querySelector("#noteEditor").memoEditor.getHTML(),selection:document.querySelector("#noteEditor").memoEditor.getSelection()})`),independentDraft,'main detail round trip preserves independent unsaved edit');await parentEv(`document.querySelector("#cancelNote").click()`);for(let i=0;i<180&&await parentEv(`document.body.classList.contains("note-editing")`);i++)await delay(40);assert.equal(await parentEv(`document.body.classList.contains("note-editing")`),false);
 parent.close();await delay(100);assert.deepEqual(await ev(`({text:document.querySelector('#editor').memoEditor.getText(),html:document.querySelector('#editor').memoEditor.getHTML(),selection:document.querySelector('#editor').memoEditor.getSelection()})`),mainDraft);
 console.log('PASS: independent reference windows preserve parent scroll and main draft selection');
 // The same image-free media decodes in the primary detail and isolated native reader.
 for(const [id,tag] of [['incoming-18','audio'],['incoming-17','video']]){
   await ev(`window.MemoInteractions.openDetail(${JSON.stringify(id)})`);await detail(id);
   await until(`document.querySelector('.detail-primary ${tag}')?.readyState >= 1`);
   assert.equal(await ev(`document.querySelector('.detail-primary ${tag}').error`),null);
   await click('#closeDialog');await frames();
   await ev(`window.memoDesktop.openNote(${JSON.stringify(id)},false)`);
   const viewer=require('electron').BrowserWindow.getAllWindows().find(w=>w!==window&&w.webContents.getURL()==='fomo://app/note.html');assert.ok(viewer);
   let ready=false;for(let i=0;i<180;i++){if(await viewer.webContents.executeJavaScript(`document.querySelector('#noteImages ${tag}')?.readyState >= 1`)){ready=true;break;}await delay(40);}
   assert.ok(ready,'native reader decodes image-free '+tag);
   assert.equal(await viewer.webContents.executeJavaScript(`document.querySelector('#noteImages ${tag}').error`),null);
   await viewer.webContents.executeJavaScript(`(()=>{const media=document.querySelector('#noteImages ${tag}');window.__validMedia=media.src;media.src='data:${tag==='audio'?'audio/wav':'video/webm'};base64,AAAA';media.load();})()`);
   let failed=false;for(let i=0;i<180;i++){if(await viewer.webContents.executeJavaScript(`!!document.querySelector('#noteImages .media-load-feedback button')`)){failed=true;break;}await delay(40);}assert.ok(failed,'native '+tag+' exposes retry');
   await viewer.webContents.executeJavaScript(`(()=>{const media=document.querySelector('#noteImages ${tag}'),button=media.nextElementSibling.querySelector('button');media.src=window.__validMedia;button.focus();button.click();})()`);
   let recovered=false;for(let i=0;i<180;i++){if(await viewer.webContents.executeJavaScript(`document.querySelector('#noteImages ${tag}').readyState>=1 && !document.querySelector('#noteImages .media-load-feedback')`)){recovered=true;break;}await delay(40);}assert.ok(recovered,'native '+tag+' retry recovers');
   let focused=false;for(let i=0;i<180;i++){if(await viewer.webContents.executeJavaScript(`document.activeElement===document.querySelector('#noteImages ${tag}')`)){focused=true;break;}await delay(40);}assert.ok(focused,'retry restores focus to player');
   viewer.close();
 }
 assert.deepEqual(await getStore().readState(),original,'navigation never modifies notes');
 console.log('PASS: reference-navigation — nested back/tab/scroll/focus, filtered list return, extra/missing/deleted sources and narrow layout');window.close();
};
