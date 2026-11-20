'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path');
module.exports=async({window:win,open,press,menu,date,label,createdAt,directory,name})=>{
 const ev=code=>win.webContents.executeJavaScript(code,true),pause=ms=>new Promise(r=>setTimeout(r,ms));
 const minimum=win.getMinimumSize(),bounds=win.getContentSize(),original=await ev(`({dark:document.body.classList.contains('dark'),styles:['--memo-font-size','--memo-line-height','--memo-tag-font-size'].map(k=>[k,document.body.style.getPropertyValue(k)])})`);
 try{
  win.setMinimumSize(0,0);win.setContentSize(544,650);
  for(const dark of [false,true]){
   await ev(`document.body.classList.toggle('dark',${dark})`);await open();await pause(240);assert.deepEqual(await ev('[innerWidth,innerHeight]'),[544,650],name+' matched viewport');
   const metrics=await ev(`(()=>{const m=document.querySelector(${JSON.stringify(menu)}),b=m.querySelector('[aria-selected=true]'),d=m.querySelector(${JSON.stringify(date)}),l=m.querySelector(${JSON.stringify(label)}),mark=l?.querySelector('mark');if(!b||!d||!l||!mark)return {missing:{b:!!b,d:!!d,l:!!l,mark:!!mark},hidden:m.hidden,html:m.innerHTML.slice(0,1000)};const s=getComputedStyle(m),bs=getComputedStyle(b),ds=getComputedStyle(d),ls=getComputedStyle(l),ms=getComputedStyle(mark);return {width:m.getBoundingClientRect().width,padding:s.padding,radius:s.borderRadius,border:s.borderColor,background:s.backgroundColor,shadow:s.boxShadow,itemPadding:bs.padding,itemRadius:bs.borderRadius,itemBackground:bs.backgroundColor,itemShadow:bs.boxShadow,dateFont:ds.fontSize,dateColor:ds.color,dateGap:ds.marginBottom,font:ls.fontSize,line:ls.lineHeight,text:ls.color,highlight:ms.backgroundColor,highlightText:ms.color,weight:ms.fontWeight,scroll:s.overscrollBehaviorY};})()`);
   assert.deepEqual(metrics,{width:380,padding:'4px',radius:'12px',border:dark?'rgba(255, 255, 255, 0.12)':'rgba(0, 0, 0, 0.08)',background:dark?'rgb(46, 46, 46)':name==='tray'?'rgb(255, 254, 250)':'rgb(255, 255, 255)',shadow:dark?'rgba(0, 0, 0, 0.36) 0px 18px 42px 0px':'rgba(0, 0, 0, 0.14) 0px 14px 36px 0px',itemPadding:'8px 12px',itemRadius:'8px',itemBackground:dark?'rgba(255, 255, 255, 0.13)':'rgba(0, 0, 0, 0.08)',itemShadow:'none',dateFont:'12px',dateColor:'rgb(148, 148, 148)',dateGap:'6px',font:'14px',line:'22px',text:dark?'rgb(212, 212, 212)':'rgb(46, 46, 46)',highlight:dark?'rgb(128, 121, 108)':'rgb(220, 209, 186)',highlightText:dark?'rgb(217, 217, 217)':'rgb(50, 50, 50)',weight:'700',scroll:'contain'},name+' reference candidate metrics');
   const rect=await ev(`(()=>{const r=document.querySelector(${JSON.stringify(menu)}).getBoundingClientRect();return {x:Math.floor(r.x),y:Math.floor(r.y),width:Math.ceil(r.width),height:Math.ceil(r.height)};})()`);
   fs.writeFileSync(path.join(directory,name+'-reference-'+(dark?'dark':'light')+'.png'),(await win.webContents.capturePage(rect)).toPNG());
  }
  await ev(`document.body.style.setProperty('--memo-font-size','20px');document.body.style.setProperty('--memo-tag-font-size','16px');document.body.style.setProperty('--memo-line-height','2')`);
  assert.deepEqual(await ev(`(()=>{const l=getComputedStyle(document.querySelector(${JSON.stringify(menu+' '+label)})),d=getComputedStyle(document.querySelector(${JSON.stringify(menu+' '+date)}));return [l.fontSize,l.lineHeight,d.fontSize];})()`),['20px','40px','16px']);
  await ev(`for(const [key,value]of ${JSON.stringify(original.styles)}){if(value)document.body.style.setProperty(key,value);else document.body.style.removeProperty(key);}`);
  win.webContents.debugger.attach('1.3');
  try{
   for(const timeZone of ['Asia/Shanghai','America/New_York']){
    await win.webContents.debugger.sendCommand('Emulation.setTimezoneOverride',{timezoneId:timeZone});await open();
    const expected=new Intl.DateTimeFormat('sv-SE',{timeZone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date(createdAt));
    assert.equal(await ev(`document.querySelector(${JSON.stringify(menu+' '+date)}).textContent`),expected,name+' local reference date in '+timeZone);
   }
  }finally{await win.webContents.debugger.sendCommand('Emulation.setTimezoneOverride',{timezoneId:''});win.webContents.debugger.detach();}
  const editor=name==='main'?'#editor':'#composeEditor';
  await open();await press('Escape');
  await ev(`(()=>{const e=document.querySelector(${JSON.stringify(editor)}).memoEditor;e.restoreSelection(e.getSelection());})()`);await pause(280);
  assert.ok(await ev(`document.querySelector(${JSON.stringify(menu)}).hidden`),name+' selection bookkeeping must not reopen an escaped reference query');
  await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.insertText(' 0')`);await pause(280);
  assert.ok(await ev(`!document.querySelector(${JSON.stringify(menu)}).hidden`),name+' changed reference query reopens suggestions');
  await open();await ev(`(()=>{const other=document.createElement('input');other.id='reference-test-focus';document.body.append(other);other.focus();const e=document.querySelector(${JSON.stringify(editor)}).memoEditor;e.restoreSelection(e.getSelection());})()`);await pause(280);
  assert.ok(await ev(`document.querySelector(${JSON.stringify(menu)}).hidden`),name+' focus outside the editor keeps reference suggestions closed');
  await ev(`document.querySelector('#reference-test-focus').remove();document.querySelector(${JSON.stringify(editor)}).memoEditor.focus()`);
  console.log('PASS: '+name+' Escape stays dismissed until input changes and focus outside cannot reopen suggestions');
  await open();await pause(220);
  const draft=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(editor)}).memoEditor;return {html:e.getHTML(),selection:e.getSelection()};})()`);
  await press('Escape');assert.deepEqual(await ev(`(()=>{const e=document.querySelector(${JSON.stringify(editor)}).memoEditor;return {html:e.getHTML(),selection:e.getSelection()};})()`),draft,name+' Escape preserves formatted draft and caret');
  await open();await pause(220);
  const point=await ev(`(()=>{const r=document.querySelector(${JSON.stringify(menu)}).querySelector('button').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  const beforeClick=await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.getText()`);
  for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'right',clickCount:1,...point});await pause(180);
  assert.equal(await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.getText()`),beforeClick,name+' right mouse button must not choose a reference');
  for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,...point});await pause(200);
  const target='fomo://note/'+(name==='main'?'context-0':'search-0');
  assert.equal(await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.getText()`),target+' ',name+' a real mouse click inserts exactly one reference');
  assert.ok(await ev(`document.querySelector(${JSON.stringify(editor)}).contains(document.activeElement)`),name+' mouse selection returns editor focus');
  await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.insertText('继续')`);
  assert.equal(await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.getText()`),target+' 继续',name+' typing continues after the inserted reference');
  console.log('PASS: '+name+' real mouse selection inserts once, ignores right-click and preserves focus; Escape preserves draft and caret');
  for(const modifiers of [{altKey:true},{isComposing:true},{keyCode:229}]){
   await open();
   const result=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(editor)}),before=e.memoEditor.getText(),event=new KeyboardEvent('keydown',${JSON.stringify({key:'Enter',bubbles:true,cancelable:true,...modifiers})});e.dispatchEvent(event);return {refs:e.memoEditor.getReferenceIds(),unchanged:e.memoEditor.getText()===before};})()`);
   assert.deepEqual(result.refs,[],name+' modified or IME Enter must not choose a reference');
   if(modifiers.altKey)assert.ok(result.unchanged,name+' Alt+Enter leaves the query intact');
  }
  await ev(`(()=>{const e=document.querySelector(${JSON.stringify(editor)}).memoEditor;e.setText('');e.insertText('@没有匹配的隔离查询xyz');})()`);await pause(280);
  assert.ok(await ev(`document.querySelector(${JSON.stringify(menu)}).hidden||!!document.querySelector(${JSON.stringify(menu)}+' [role=status]')`),name+' unmatched reference query has no suggestions');
  await ev(`document.querySelector(${JSON.stringify(editor)}).dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`);
  assert.equal(await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.getText()`),'@没有匹配的隔离查询xyz ',name+' unmatched Enter ends the query with one space');
  assert.deepEqual(await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.getReferenceIds()`),[]);
  await open();await ev(`document.querySelector(${JSON.stringify(editor)}).dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}))`);
  assert.deepEqual(await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.getReferenceIds()`),[name==='main'?'context-0':'search-0'],name+' ordinary Enter still chooses the first reference');
  console.log('PASS: '+name+' Alt+Enter and IME Enter do not accept references; ordinary Enter still confirms');
  const prefix='前文 fomo://note/kept ',query='@排序测试 检索词',suffix=' 后文';
  await ev(`(()=>{const e=document.querySelector(${JSON.stringify(editor)}).memoEditor;e.setHTML('<p><strong>前文</strong> fomo://note/kept @排序测试 检索词 后文</p>');e.focusTextBlock(0,${(prefix+query).length});})()`);await pause(300);
  assert.ok(await ev(`!document.querySelector(${JSON.stringify(menu)}).hidden`),name+' query in the middle of rich text opens candidates');
  const beforeReplace=await ev(`(()=>{const e=document.querySelector(${JSON.stringify(editor)}).memoEditor;return {html:e.getHTML(),selection:e.getSelection()};})()`);
  const middlePoint=await ev(`(()=>{const r=document.querySelector(${JSON.stringify(menu)}).querySelector('button').getBoundingClientRect();return {x:Math.round(r.left+r.width/2),y:Math.round(r.top+r.height/2)};})()`);
  for(const type of ['mouseDown','mouseUp'])win.webContents.sendInputEvent({type,button:'left',clickCount:1,...middlePoint});await pause(180);
  assert.equal(await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.getText()`),prefix+target+' '+suffix,name+' replacement preserves both surrounding text segments');
  const afterReplace=await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.getHTML()`);
  assert.match(afterReplace,/<strong>前文<\/strong>/);
  assert.deepEqual(await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.getReferenceIds()`),['kept',name==='main'?'context-0':'search-0']);
  await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.command('undo')`);
  assert.deepEqual(await ev(`(()=>{const e=document.querySelector(${JSON.stringify(editor)}).memoEditor;return {html:e.getHTML(),selection:e.getSelection()};})()`),beforeReplace,name+' undo restores rich query and caret');
  assert.deepEqual(await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.getReferenceIds()`),['kept']);
  await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.command('redo')`);
  assert.equal(await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.getHTML()`),afterReplace,name+' redo restores the same rich draft');
  assert.deepEqual(await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.getReferenceIds()`),['kept',name==='main'?'context-0':'search-0']);
  await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.insertText('继续')`);
  assert.equal(await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.getText()`),prefix+target+' 继续'+suffix,name+' redo restores the insertion caret before the suffix');
  console.log('PASS: '+name+' mouse reference replacement preserves rich surrounding text and existing relationships through undo/redo');
  win.setContentSize(420,360);await open();await pause(240);assert.deepEqual(await ev('[innerWidth,innerHeight]'),[420,360],name+' short viewport');
  const visible=`(()=>{const m=document.querySelector(${JSON.stringify(menu)}),b=m.querySelector('[aria-selected=true]'),r=m.getBoundingClientRect(),v=b.getBoundingClientRect();return r.left>=8&&r.right<=innerWidth-8&&r.top>=8&&r.bottom<=innerHeight-8&&r.height<=innerHeight*.6+2&&v.top>=r.top-1&&v.bottom<=r.bottom+1;})()`;
  if(!await ev(visible)){fs.writeFileSync(path.join(directory,name+'-reference-short-failure.png'),(await win.webContents.capturePage()).toPNG());console.log(JSON.stringify(await ev(`(()=>{const m=document.querySelector(${JSON.stringify(menu)}),b=m.querySelector('[aria-selected=true]');return {viewport:[innerWidth,innerHeight],panel:m.getBoundingClientRect().toJSON(),selected:b?.getBoundingClientRect().toJSON(),style:m.getAttribute('style'),max:getComputedStyle(m).maxHeight};})()`)));}assert.ok(await ev(visible),name+' short viewport keeps the selected result visible');
  for(let i=0;i<23;i++)await press('ArrowDown');assert.ok(await ev(visible),name+' last result stays visible in a short viewport');
  console.log('PASS: '+name+' reference candidates match light/dark geometry, font preferences, two local timezones and short-window scrolling');
  // Preview is an atomic reference; canonical IDs survive saving and re-editing.
  await ev(`(()=>{const e=document.querySelector(${JSON.stringify(editor)}).memoEditor;e.setText('前文');e.focusEnd();e.insertReference({id:'preview-test',created:'2026-01-02T12:00:00.000Z',content:'#阅读 #想法 甲乙丙丁戊己庚辛壬癸一二三四五六七八九十后面继续'});})()`);
  const preview=await ev(`(()=>{const root=document.querySelector(${JSON.stringify(editor)}),e=root.memoEditor,n=root.querySelector('.editor-reference-preview'),label=n?.querySelector('.editor-reference-label');return {text:e.getText(),display:e.getDisplayText(),html:e.getHTML(),label:label?.textContent,arrow:n?.querySelector('.editor-reference-arrow svg')?.getAttribute('class'),faded:getComputedStyle(label).maskImage!=='none',editable:n?.contentEditable};})()`);
  assert.equal(preview.text,'前文fomo://note/preview-test ');assert.ok(preview.label.includes('甲乙丙丁戊己庚辛壬癸一二三四五六七八九十…'));assert.ok(!preview.label.includes('#阅读')&&!preview.label.includes('#想法')&&!preview.label.includes('后面继续'));assert.match(preview.arrow,/arrow-up-left-circle-fill/);assert.equal(preview.faded,true);assert.equal(preview.editable,'false');assert.ok(!preview.display.includes('fomo://note/'));assert.match(preview.html,/data-memo-id="preview-test"/);
  await ev(`(()=>{const e=document.querySelector(${JSON.stringify(editor)}).memoEditor;e.setText('临时内容');e.setHTML(MemoMarkup.clean(${JSON.stringify(preview.html)}));})()`);assert.equal(await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.getText()`),preview.text);assert.equal(await ev(`document.querySelector(${JSON.stringify(editor)}+' .editor-reference-label')?.textContent`),preview.label);
  await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.removeReference('preview-test')`);assert.deepEqual(await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.getReferenceIds()`),[]);await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.command('undo')`);assert.deepEqual(await ev(`document.querySelector(${JSON.stringify(editor)}).memoEditor.getReferenceIds()`),['preview-test']);
  fs.writeFileSync(path.join(directory,name+'-reference-preview.png'),(await win.webContents.capturePage()).toPNG());console.log('PASS: '+name+' reference preview keeps canonical identity through draft round trip, delete and undo');

 }finally{
  win.setMinimumSize(...minimum);win.setContentSize(...bounds);await ev(`document.body.classList.toggle('dark',${original.dark});for(const [key,value]of ${JSON.stringify(original.styles)}){if(value)document.body.style.setProperty(key,value);else document.body.style.removeProperty(key);}`);
 }
};
