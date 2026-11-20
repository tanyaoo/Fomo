'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
module.exports=async({window,getStore,userDirectory})=>{
 const ev=code=>window.webContents.executeJavaScript(code);
 const wait=async predicate=>{for(let i=0;i<180;i++){if(await predicate())return;await new Promise(r=>setTimeout(r,40));}console.error(await ev(`({active:document.activeElement.id,suggestions:!document.querySelector('#tagSuggestions').hidden,dialog:document.querySelector('#dialog').open,innerWidth,innerHeight})`));throw Error('annotation draft condition timed out');};
 const until=code=>wait(()=>ev(code));
 const disk=predicate=>wait(async()=>predicate(await getStore().readDraft()));
 const open=async id=>{await ev(`window.MemoInteractions.action('annotate',{id:'${id}'})`);await until('document.querySelector("#dialog").open && !!document.querySelector("#referenceComposerSlot #editor")');};
 const close=()=>ev('document.querySelector("#closeDialog").click()');
 const snapshot=()=>ev(`({content:document.querySelector('#editor').value,html:document.querySelector('#editor').memoEditor.getHTML(),images:[...document.querySelectorAll('#attachments img')].map(i=>i.src),selection:document.querySelector('#editor').memoEditor.getSelection()})`);
 const resize=async(width,height)=>{window.setMinimumSize(360,600);window.setContentSize(width,height);await until(`innerWidth===${width} && Math.abs(innerHeight-${height})<=2`);await ev('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve)))');};
 const annotationStyles=()=>ev(`(()=>{const dialog=document.querySelector('#dialog'),composer=document.querySelector('#composer'),editor=document.querySelector('#editor'),ds=getComputedStyle(dialog),cs=getComputedStyle(composer),es=getComputedStyle(editor),dr=dialog.getBoundingClientRect();return {dialog:{width:dr.width,height:dr.height,paddingTop:ds.paddingTop,paddingRight:ds.paddingRight,paddingBottom:ds.paddingBottom,paddingLeft:ds.paddingLeft,borderRadius:ds.borderRadius,maxHeight:ds.maxHeight,background:ds.backgroundColor},composer:{borderColor:cs.borderColor,boxShadow:cs.boxShadow},editor:{minHeight:es.minHeight,maxHeight:es.maxHeight,overflowY:es.overflowY,color:es.color}}})()`);
 await until('!!document.querySelector("#editor")?.memoEditor && !!window.MemoInteractions && !!document.querySelector("#multiSelect")');
 if(process.env.MEMOFLOW_TEST_PHASE==='annotation-drafts-first'){
   await open('c');
   await resize(1100,820);await new Promise(r=>setTimeout(r,240));let styles=await annotationStyles();
   assert.equal(Math.round(styles.dialog.width),640,'annotation sheet uses reference desktop width');assert.equal(styles.dialog.maxHeight,'560px');assert.deepEqual([styles.dialog.paddingTop,styles.dialog.paddingRight,styles.dialog.paddingBottom,styles.dialog.paddingLeft],['0px','30px','30px','30px']);assert.equal(styles.dialog.borderRadius,'18px');assert.equal(styles.composer.borderColor,'rgba(0, 0, 0, 0)');assert.match(styles.composer.boxShadow,/rgb\(78, 142, 101\) 0px 0px 0px 1px/);assert.match(styles.composer.boxShadow,/10px/);assert.equal(styles.editor.minHeight,'104px');assert.equal(styles.editor.maxHeight,'300px');assert.equal(styles.editor.overflowY,'auto');
   await ev(`document.querySelector('#editor').blur()`);await new Promise(r=>setTimeout(r,240));styles=await annotationStyles();assert.match(styles.composer.boxShadow,/rgb\(232, 229, 223\) 0px 0px 0px 1px/,'unfocused annotation editor uses the warm light ring');await ev(`document.querySelector('#editor').focus()`);await new Promise(r=>setTimeout(r,240));
   const draftBeforeLong=await snapshot();await ev(`document.querySelector('#editor').memoEditor.setText(Array.from({length:40},(_,i)=>'批注长正文 '+(i+1)).join('\\n'))`);const scrollHeight=await ev(`(()=>{const editor=document.querySelector('#editor');return {client:editor.clientHeight,scroll:editor.scrollHeight}})()`);assert.ok(scrollHeight.scroll>scrollHeight.client,'long annotation text scrolls inside the 300px editor');assert.ok(scrollHeight.client<=301,'long annotation text keeps the reference height cap');await ev(`document.querySelector('#editor').memoEditor.setText(${JSON.stringify(draftBeforeLong.content)})`);
   await resize(501,800);styles=await annotationStyles();assert.equal(Math.round(styles.dialog.width),453,'501px remains in the floating sheet layout');assert.equal(styles.dialog.borderRadius,'18px');assert.equal(styles.dialog.paddingRight,'16px');
   await resize(500,800);styles=await annotationStyles();const viewportHeight=await ev('innerHeight');assert.equal(Math.round(styles.dialog.width),500);assert.equal(Math.round(styles.dialog.height),viewportHeight);assert.equal(styles.dialog.borderRadius,'0px');assert.deepEqual([styles.dialog.paddingTop,styles.dialog.paddingRight,styles.dialog.paddingBottom,styles.dialog.paddingLeft],['0px','10px','16px','10px']);assert.equal(styles.editor.maxHeight,(viewportHeight-220)+'px');
   await resize(1100,820);await ev('document.body.classList.add("dark")');await new Promise(r=>setTimeout(r,320));styles=await annotationStyles();assert.equal(styles.dialog.background,'rgb(18, 18, 18)');assert.equal(styles.editor.color,'rgb(212, 212, 212)');assert.match(styles.composer.boxShadow,/rgba\(0, 0, 0, 0\.2(?:0)?\)/);await ev('document.body.classList.remove("dark")');
   assert.equal((await snapshot()).content,'关联自：fomo://note/c\n旧版批注草稿');await close();
   await open('a');
   assert.ok((await snapshot()).content.startsWith('关联自：fomo://note/a'),'annotation editor shows the source on its first text line');assert.equal(await ev('document.querySelectorAll("#editor .memo-reference").length'),0);
   assert.equal(await ev('document.querySelectorAll("#editor .editor-reference-preview").length'),1,'annotation source uses the reference preview');assert.ok(await ev('!document.querySelector("#editor .editor-reference-label").textContent.includes("#")'));
   assert.equal(await ev('document.querySelector("#saveMemo").disabled'),true,'source alone cannot be saved as an annotation');
   assert.equal(await ev('document.querySelector("#charCount").textContent.trim()'),'','source address is excluded from the character count');
   await ev('document.querySelector("#saveMemo").click()');assert.equal((await getStore().readState()).memos.length,3,'empty annotation does not create a note');
   assert.equal(await ev('document.querySelector("#reflectionBanner").hidden && !document.querySelector("#reflectionBanner").textContent.trim()'),true,'annotation source is not duplicated in a separate banner');
   await ev(`document.querySelector('#editor').memoEditor.setHTML('<p>关联自：writeboom://note/a</p><p><strong>批注正文</strong></p><ul><li><p>列表内容</p></li></ul>');document.querySelector('#editor').memoEditor.focusTextBlock(2,4);document.querySelector('#editor').memoEditor.insertReference({id:'b',content:'第二条参考笔记'});`);
   await ev(`(()=>{const bytes=Uint8Array.from(atob('R0lGODlhAQABAIAAAAAAAP///ywAAAAAAQABAAACAUwAOw=='),c=>c.charCodeAt(0)),data=new DataTransfer();data.items.add(new File([bytes],'fixture.gif',{type:'image/gif'}));data.items.add(new File([bytes],'second.png',{type:'image/png'}));document.querySelector('#editor').dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));})()`);
   await until('document.querySelectorAll("#attachments img").length===2 && !document.querySelector("#saveMemo").disabled');
   const imagesBefore=await ev(`[...document.querySelectorAll('#attachments img')].map(img=>img.src)`);await ev(`(()=>{const items=[...document.querySelectorAll('#attachments .attachment')],data=new DataTransfer(),fire=(node,type)=>{const event=new Event(type,{bubbles:true,cancelable:true});Object.defineProperty(event,'dataTransfer',{value:data});node.dispatchEvent(event);};fire(items[0],'dragstart');fire(items[1],'dragover');fire(items[1],'drop');fire(items[0],'dragend');})()`);await new Promise(r=>setTimeout(r,40));const imagesAfter=await ev(`[...document.querySelectorAll('#attachments img')].map(img=>img.src)`);assert.deepEqual(imagesAfter,[imagesBefore[1],imagesBefore[0]],'dragging reorders annotation images');assert.equal(await ev(`document.querySelectorAll('#attachments .image-order').length`),0,'annotation attachments do not show the old arrow row');assert.ok(await ev(`document.activeElement.classList.contains('attachment') && document.activeElement.dataset.imageIndex==='1'`),'dragging focuses the moved annotation image');await ev(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',altKey:true,bubbles:true,cancelable:true}))`);await new Promise(r=>setTimeout(r,40));assert.deepEqual(await ev(`[...document.querySelectorAll('#attachments img')].map(img=>img.src)`),imagesBefore,'Alt+Left restores annotation image order');await ev(`document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',altKey:true,bubbles:true,cancelable:true}))`);await new Promise(r=>setTimeout(r,40));assert.deepEqual(await ev(`[...document.querySelectorAll('#attachments img')].map(img=>img.src)`),imagesAfter,'Alt+Right reapplies annotation image order');
   await ev('document.querySelector("#editor").memoEditor.restoreSelection({anchor:3,head:3})');
   const expected=await snapshot();await fs.writeFile(path.join(userDirectory,'expected-annotation.json'),JSON.stringify(expected));
   await close();await until('!document.querySelector("#dialog").open');
   assert.ok((await ev('document.querySelector("#toast").textContent')).includes('批注草稿已保留'),'closing explains that the annotation draft can be resumed');
   assert.equal(await ev('document.querySelector("#editor").value'),'尚未提交的原草稿');
   await open('a');assert.deepEqual(await snapshot(),expected,'closing must preserve all editor data');
   window.focus();await ev('document.querySelector("#editor").focus()');await new Promise(r=>setTimeout(r,100));
   window.webContents.sendInputEvent({type:'keyDown',keyCode:'Escape'});window.webContents.sendInputEvent({type:'keyUp',keyCode:'Escape'});await until('!document.querySelector("#dialog").open');
   await open('b');await ev('document.querySelector("#editor").memoEditor.setText("独立的第二份批注")');await close();
   await disk(d=>d?.annotationDrafts?.b?.content==='独立的第二份批注');await open('a');assert.deepEqual(await snapshot(),expected);
   await disk(d=>d?.current?.annotationOf==='a'&&d.current.images.length===2);
   assert.equal((await getStore().readDraft()).newDraft.content,'尚未提交的原草稿');
 }else{
   const expected=JSON.parse(await fs.readFile(path.join(userDirectory,'expected-annotation.json'),'utf8'));
   await until('document.querySelector("#dialog").open && !!document.querySelector("#referenceComposerSlot #editor")');
   assert.deepEqual(await snapshot(),expected,'native restart must restore the active annotation modal and cursor');
   await close();assert.equal(await ev('document.querySelector("#editor").value'),'尚未提交的原草稿');
   await open('b');assert.equal((await snapshot()).content,'独立的第二份批注');await close();await open('a');
   const io=getStore().io;getStore().io={...io,rename:async(from,to)=>{if(to===getStore().file)throw Error('isolated annotation save failure');return io.rename(from,to);}};
   await ev('document.querySelector("#saveMemo").click()');await until('document.querySelector("#noteStatus").textContent.includes("笔记未保存")');
   assert.deepEqual((await snapshot()).images,expected.images);assert.equal((await getStore().readState()).memos.length,3);
   getStore().io=io;await ev('document.querySelector("#saveMemo").click()');await until('!document.querySelector("#dialog").open && document.querySelector("#editor").value==="尚未提交的原草稿"');
   await disk(d=>!d.annotationDrafts.a&&d.annotationDrafts.b.content==='独立的第二份批注');
   const saved=(await getStore().readState()).memos.find(m=>m.annotationOf==='a');assert.ok(saved.html.includes('<strong>'));assert.deepEqual(saved.images,expected.images);assert.deepEqual(new Set(saved.references),new Set(['b']));assert.ok(saved.content.startsWith('关联自：writeboom://note/a'),'the edited source address is preserved after restart and retry');
   // Editing an existing annotation must never populate the pending-new-annotation map.
   // The regular card action handles editing; drive its menu for the integration path.
   await ev(`document.querySelector('[data-id="${saved.id}"] .memo-menu-button').click();document.querySelector('.memo-menu [data-action="edit"]').click()`);
   await ev('document.querySelector("#editor").memoEditor.insertText("未提交修改");document.querySelector("#cancelEdit").click()');
   await disk(d=>!d.editing&&!d.annotationDrafts.a);
   await open('a');assert.equal((await snapshot()).content,'关联自：fomo://note/a\n');assert.equal(await ev('document.querySelector("#reflectionBanner").hidden'),true);assert.equal((await snapshot()).images.length,0);await close();
 }
 console.log('PASS: '+process.env.MEMOFLOW_TEST_PHASE+' — formatted/image/reference/caret drafts, per-note isolation, restart, save failure/retry, main draft protection');window.close();
};
