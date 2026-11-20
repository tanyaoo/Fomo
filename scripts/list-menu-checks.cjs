'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
module.exports=async({window,getStore,userDirectory})=>{
 const evaluate=code=>window.webContents.executeJavaScript(code,true);
 const until=async code=>{for(let i=0;i<150;i++){if(await evaluate(code))return;await new Promise(r=>setTimeout(r,40));}throw Error('List menu timeout: '+code);};
 const click=selector=>evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);
 await until(`!!document.querySelector('#multiSelect') && !!document.querySelector('#editor')?.memoEditor`);
 const state=await getStore().readState();state.memos=[
  {id:'direct-fixture',content:'直接记录测试',html:'<p>直接记录<strong>测试</strong></p>',images:[],created:'2026-10-20T00:00:00Z',updated:'2026-10-22T00:00:00Z'},
  {id:'annotation-fixture',content:'批注测试',images:[],annotationOf:'direct-fixture',created:'2026-10-21T00:00:00Z',updated:'2026-10-21T00:00:00Z'},
  {id:'reflection-fixture',content:'关联测试',images:[],relatedTo:'direct-fixture',created:'2026-10-22T00:00:00Z',updated:'2026-10-20T00:00:00Z'}];
 await getStore().save(await getStore().readState(),state);await click('#refresh');await until(`document.querySelectorAll('.memo').length===3`);
 await click('#sortButton');assert.deepEqual(await evaluate(`[...document.querySelectorAll('#sortMenu .list-menu-main button span')].map(e=>e.firstChild.textContent)`),['排序方式','笔记来源','多选笔记','导出']);
 assert.equal(await evaluate(`getComputedStyle(document.querySelector('#multiSelect')).display`),'none');
 await evaluate(`document.querySelector('#sortMenu [data-panel="sort"]').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowRight',bubbles:true,cancelable:true}))`);
 // Open through click as well, so keyboard focus enters the submenu.
 await click('#sortMenu [data-panel="sort"]');assert.equal(await evaluate(`document.activeElement.dataset.order`),'created');
 await click('#sortMenu [data-order="updated"]');assert.equal(await evaluate(`document.querySelector('.memo').dataset.id`),'direct-fixture');
 await click('#sortButton');await click('#sortMenu [data-panel="sort"]');await click('#sortMenu [data-ascending="true"]');assert.equal(await evaluate(`document.querySelector('.memo').dataset.id`),'reflection-fixture');
 await click('#sortButton');await click('#sortMenu [data-panel="source"]');await click('#sortMenu [data-source="annotation"]');assert.equal(await evaluate(`document.querySelectorAll('.memo').length`),1);assert.equal(await evaluate(`document.querySelector('.memo').dataset.id`),'annotation-fixture');
 const {dialog}=require('electron'),original=dialog.showSaveDialog,target=path.join(userDirectory,'filtered-export.md');dialog.showSaveDialog=async()=>({canceled:false,filePath:target});
 try{await click('#sortButton');await click('#sortMenu [data-list-action="export"]');for(let i=0;i<100;i++){try{await fs.access(target);break;}catch{await new Promise(r=>setTimeout(r,40));}}const markdown=await fs.readFile(target,'utf8');assert.ok(markdown.includes('批注测试'));assert.ok(!markdown.includes('直接记录测试'));}finally{dialog.showSaveDialog=original;}
 await click('#sortButton');await click('#sortMenu [data-list-action="select"]');assert.equal(await evaluate(`document.querySelector('#bulkBar').hidden`),false);await click('#bulkExit');
 await click('#sortButton');await click('#sortMenu [data-panel="source"]');await click('#sortMenu [data-source="all"]');assert.equal(await evaluate(`document.querySelectorAll('.memo').length`),3);
 await click('[data-id="annotation-fixture"] .memo-menu-button');
 const annotationCount=await evaluate(`Number(document.querySelector('.memo-menu .menu-meta span').textContent.split(':')[1])`);
 await click('.memo-menu [data-action="edit"]');
 assert.equal(Number(await evaluate(`document.querySelector('#charCount').textContent`)),annotationCount,'annotation menu and editor count the same visible source URL');
 await click('#cancelEdit');
 await click('#sortButton');await evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);await fs.writeFile(path.join(userDirectory,'list-menu.png'),(await window.webContents.capturePage()).toPNG());
 await evaluate(`document.querySelector('#sortMenu').dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}))`);assert.equal(await evaluate(`document.activeElement.id`),'sortButton');assert.equal(await evaluate(`document.querySelector('#sortMenu').matches(':popover-open')`),false);
 await click('[data-id="direct-fixture"] .memo-menu-button');
 assert.equal(await evaluate(`document.querySelector('.memo-menu .menu-meta span').textContent`),'字数统计: 6','a note without references retains its existing count');
 assert.deepEqual(await evaluate(`[...document.querySelectorAll('.memo-menu>button span')].map(e=>e.textContent)`),['分享','编辑','复制','新窗口打开','置顶','加入浮窗','AI 洞察','相关笔记','复制链接','批注','更多','删除']);
 await evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);await fs.writeFile(path.join(userDirectory,'note-menu.png'),(await window.webContents.capturePage()).toPNG());
 await click('.memo-menu [data-action="more"]');assert.equal(await evaluate(`document.querySelector('.memo-more-menu').hidden`),false);
 await evaluate(`document.querySelector('.memo-more-menu button').focus();document.activeElement.dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true,cancelable:true}))`);assert.equal(await evaluate(`document.querySelector('.memo-more-menu').hidden`),true);
 // Keep test notes out of the user's OS clipboard; inspect the clipboard payload.
 await evaluate(`Object.defineProperty(navigator,'clipboard',{configurable:true,value:{writeText:async text=>window.testCopyText=text,write:async items=>{window.testCopyText=await(await items[0].getType('text/plain')).text();window.testCopyHTML=await(await items[0].getType('text/html')).text();}}})`);
 await click('.memo-menu [data-action="copy"]');await until(`window.testCopyText==='直接记录测试' && !!window.testCopyHTML`);assert.equal(await evaluate(`window.testCopyText`),'直接记录测试');assert.match(await evaluate(`window.testCopyHTML`),/<strong>测试<\/strong>/);assert.doesNotMatch(await evaluate(`window.testCopyHTML`),/contenteditable|class=|javascript:/i);
 await click('.memo-menu [data-action="share"]');assert.equal(await evaluate(`document.querySelector('#dialogTitle').textContent`),'生成分享图片');await until(`document.querySelector('#sharePreview')?.naturalWidth===720 && !document.querySelector('#shareSave').disabled`);assert.equal(await evaluate(`document.querySelectorAll('[data-share-template]').length`),12);await click('#closeDialog');
 await click('[data-id="direct-fixture"] .memo-menu-button');await click('.memo-menu [data-action="copy-link"]');await until(`window.testCopyText==='fomo://note/direct-fixture' && !!window.testCopyHTML`);assert.ok((await evaluate(`window.testCopyHTML`)).includes('data-memo-id="direct-fixture"'));
 await click('#search');await click('[data-id="direct-fixture"] .memo-menu-button');await click('.memo-menu [data-action="more"]');await click('.memo-menu [data-action="history"]');assert.equal(await evaluate(`document.querySelector('#dialogTitle').textContent`),'历史版本');await click('#closeDialog');
 await click('[data-id="direct-fixture"] .memo-menu-button');await click('.memo-menu [data-action="more"]');assert.deepEqual(await evaluate(`[...document.querySelectorAll('.memo-more-menu button')].map(b=>b.textContent.trim())`),['历史版本','修改日期']);await evaluate(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);await fs.writeFile(path.join(userDirectory,'note-more-menu.png'),(await window.webContents.capturePage()).toPNG());await click('.memo-menu [data-action="change-date"]');await until(`document.querySelector('#detailDatePicker')?.matches(':popover-open')`);await click('#detailDatePicker [data-detail-date="2026-10-01"]');await evaluate(`document.querySelector('#detailDateTime').value='12:34';document.querySelector('#detailDateTime').dispatchEvent(new Event('input',{bubbles:true}))`);await click('#detailDateSave');await until(`!document.querySelector('#detailDatePicker')`);const changed=(await getStore().readState()).memos.find(m=>m.id==='direct-fixture');assert.equal(new Date(changed.created).getDate(),1);assert.equal(changed.content,'直接记录测试');
 await click('[data-id="direct-fixture"] .memo-content');await new Promise(resolve=>setTimeout(resolve,350));assert.equal(await evaluate('document.querySelector("#dialog").open'),false);
 await click('[data-id="direct-fixture"] .memo-menu-button');await click('.memo-menu [data-action="related"]');await until('document.querySelector("#dialog").open && !!document.querySelector(".note-detail")');await click('#closeDialog');await until('!document.querySelector("#dialog").open');
  const edge=await evaluate(`(async()=>{const list=document.querySelector('#memos');list.scrollTop=list.scrollHeight;await new Promise(r=>requestAnimationFrame(r));const card=[...document.querySelectorAll('#memos .memo')].at(-1);card.querySelector('.memo-menu-button').click();await new Promise(r=>requestAnimationFrame(r));const menu=document.querySelector('.memo-menu');const rect=menu.getBoundingClientRect();const out={top:rect.top,bottom:rect.bottom,left:rect.left,right:rect.right,ih:innerHeight,iw:innerWidth};document.dispatchEvent(new KeyboardEvent('keydown',{key:'Escape',bubbles:true}));return out;})()`);
  assert.ok(edge.top>=8&&edge.bottom<=edge.ih-8,'menu stays inside the viewport vertically: '+JSON.stringify(edge));
  assert.ok(edge.left>=8&&edge.right<=edge.iw-8,'menu stays inside the viewport horizontally: '+JSON.stringify(edge));
 console.log('PASS: list-menu — sorting, filtering, export, share/copy reference, more submenu, date editing, body-click isolation, detail close and keyboard navigation');window.close();
};
