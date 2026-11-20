'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),electron=require('electron'),root=path.resolve(__dirname,'..');
if(typeof electron==='string'){
 const {spawn}=require('node:child_process'),env={...process.env};delete env.ELECTRON_RUN_AS_NODE;env.MEMOFLOW_ALLOW_MULTI_INSTANCE='1';
 const child=spawn(electron,['--headless','--no-sandbox','--disable-gpu',__filename],{env,stdio:'inherit',windowsHide:true});let timedOut=false;
 const timer=setTimeout(()=>{timedOut=true;child.kill();console.error('Tag management timed out');},90000);
 child.on('error',error=>{clearTimeout(timer);console.error(error);process.exitCode=1;});child.on('exit',code=>{clearTimeout(timer);process.exitCode=timedOut?1:(code??1);});
}else{
 const {app,BrowserWindow}=electron,Core=require('../dist/core.js');fs.mkdirSync(path.join(root,'work'),{recursive:true});
 const directory=fs.mkdtempSync(path.join(root,'work/tag-management-'));process.env.MEMOFLOW_DATA_DIR=directory;app.setAppPath(root);
 const created=new Date().toISOString(),note=(id,content,html='')=>({id,content,html,created,updated:created,deleted:false,starred:false,images:[]});
 const fixture=Core.upgrade({theme:'light',profile:'标签管理验证',review:{count:8,period:'all',include:'旧标签/子',exclude:'工作',noTags:false},extraTags:['旧标签/空','目标/空'],memos:[note('one','正文 #旧标签/子 #目标 https://example.test/#旧标签','<p>正文 <strong>#旧标</strong><em>签/子</em> #目标 <a href="https://example.test/#旧标签">https://example.test/#旧标签</a></p>'),note('two','子层级 #旧标签/子/孙'),note('three','目标记录 #目标/子'),{...note('trash','回收站 #旧标签'),deleted:true,deletedAt:created}]});
 fs.mkdirSync(path.join(directory,'data'));fs.writeFileSync(path.join(directory,'data/state.json'),JSON.stringify(fixture));
 let win,passed=0;const delay=ms=>new Promise(r=>setTimeout(r,ms)),evaluate=code=>win.webContents.executeJavaScript(code,true);
 async function until(code){for(let i=0;i<160;i++){if(await evaluate(code))return;await delay(35);}throw Error('Timed out: '+code);}
 async function check(code,label){assert.ok(await evaluate(code),label);passed++;console.log('PASS: '+label);}
 async function click(selector){await evaluate(`document.querySelector(${JSON.stringify(selector)}).scrollIntoView({block:'nearest'})`);await delay(80);await evaluate(`document.querySelector(${JSON.stringify(selector)}).click()`);await delay(100);}
 async function menu(selector){await click(selector);await until('document.querySelector("#tagMenu").matches(":popover-open")');}
 async function target(value){await evaluate(`(()=>{const e=document.querySelector('#mergeTagTarget');e.value=${JSON.stringify(value)};e.dispatchEvent(new Event('change',{bubbles:true}));})()`);}
 async function shot(name){if(process.env.CI)return;await delay(80);fs.writeFileSync(path.join(directory,name+'.png'),(await win.webContents.capturePage()).toPNG());}
 async function run(){
  for(let i=0;i<160;i++){win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('app/index.html'));if(win)break;await delay(35);}assert.ok(win);win.webContents.setBackgroundThrottling(false);
  await until('!!window.MemoInteractions && document.querySelectorAll(".memo").length===3');win.setContentSize(1110,820);await delay(150);
  await evaluate('window.MemoShell.togglePin("旧标签");window.MemoShell.togglePin("目标");localStorage.setItem("memo-flow-recent-tags",JSON.stringify(["旧标签/子","目标/子"]));');
  await menu('#pinnedTags [data-manage-tag="旧标签"]');
  await check('document.querySelector("#tagMenu [data-tag-command=pin]").textContent==="取消置顶" && !!document.querySelector("#tagMenu [data-tag-command=edit]") && !!document.querySelector("#tagMenu [data-tag-command=edit]")','pinned tags expose shared management actions');await shot('01-pinned-menu');
  await click('#tagMenu [data-tag-command=edit]');
  await check('document.querySelectorAll("#editTagPreview .tag-change-paths li").length===4 && document.querySelector("#editTagPreview").textContent.includes("回收站 1 条")','rename previews descendant paths and active/trash impact');
  await evaluate('document.querySelector("#editTagName").value="目标";document.querySelector("#editTagName").dispatchEvent(new Event("input"))');await check('document.querySelector("#editTagError").textContent.includes("已存在")','rename reveals existing-name conflicts before submission');
  await evaluate('document.querySelector("#editTagName").value="旧标签/子/新";document.querySelector("#editTagName").dispatchEvent(new Event("input"))');await check('document.querySelector("#editTagError").textContent.includes("自己的子标签")','rename blocks a recursive descendant destination');
  await click('#cancelTagEdit');await click('#tags [data-collapse-tag="旧标签"]');await menu('#tags [data-manage-tag="旧标签/子"]');await click('#tagMenu [data-tag-command=move]');await evaluate('document.querySelector("#moveTagParent").value="目标";document.querySelector("#moveTagParent").dispatchEvent(new Event("change"))');
  await check('!document.querySelector("#moveTagConsent").hidden && document.querySelector("#moveTagPreview").textContent.includes("目标/子/孙")','move previews retained child paths and exposes merge consent');await evaluate('document.querySelector("#moveTagForm").requestSubmit()');await check('document.querySelector("#moveTagError").textContent.includes("请先确认")','colliding move never silently merges tags');
  await evaluate('window.originalTagStore=MemoStore;window.MemoStore={...MemoStore,save:async()=>{throw Error("模拟移动失败")}};document.querySelector("#confirmMoveMerge").checked=true;document.querySelector("#moveTagForm").requestSubmit()');await until('document.querySelector("#moveTagError").textContent.includes("未保存")');await check('document.querySelector("#moveTagParent").value==="目标" && document.querySelector("#confirmMoveMerge").checked && !document.querySelector("#cancelTagMove").disabled','failed move preserves destination, explicit consent and retry controls');await evaluate('window.MemoStore=window.originalTagStore;void 0');await click('#cancelTagMove');
  await menu('#pinnedTags [data-manage-tag="旧标签"]');await click('#tagMenu [data-tag-command=edit]');await click('#mergeFromTagEdit');
  await check('[...document.querySelector("#mergeTagTarget").options].every(o=>o.value!=="旧标签"&&!o.value.startsWith("旧标签/"))','merge excludes self and descendants');
  await target('目标');await shot('02-merge-preview');await click('#cancelTagMerge');
  await check('MemoStore.readState().then(s=>s.memos.find(m=>m.id==="one").content.includes("#旧标签/子"))','cancel leaves stored notes untouched');
  await menu('#tags [data-manage-tag="旧标签"]');await click('#tagMenu [data-tag-command=edit]');await click('#mergeFromTagEdit');await target('目标');
  await evaluate('window.originalTagStore=MemoStore;window.MemoStore={...MemoStore,save:async()=>{throw Error("模拟写入失败");}};void 0');await click('#confirmTagMerge');
  await check('document.querySelector("#dialog").open && !document.querySelector("#confirmTagMerge").disabled','failed commit keeps merge recoverable');
  await check('MemoStore.readState().then(s=>s.memos.find(m=>m.id==="one").content.includes("#旧标签/子") && window.MemoShell.pinned("旧标签"))','failed commit does not remap storage or preferences');
  await evaluate('window.MemoStore=window.originalTagStore;void 0');await click('#confirmTagMerge');await until('!document.querySelector("#dialog").open');
  await check('MemoStore.readState().then(s=>s.memos.find(m=>m.id==="two").content==="子层级 #目标/子/孙" && s.extraTags.includes("目标/空")&&!s.extraTags.includes("旧标签/空"))','merge preserves descendant paths and combines empty tags');
  await check('MemoStore.readState().then(s=>{const m=s.memos.find(m=>m.id==="one");return m.content.includes("https://example.test/#旧标签")&&m.html.includes("href=\\\"https://example.test/#旧标签\\\"")&&m.html.includes("<strong>#目标/子</strong>")&&m.content.includes("正文");})','rich split tags update while URL fragments and formatting survive');
  await check('MemoStore.readState().then(s=>{const m=s.memos.find(m=>m.id==="trash");return m.deleted && m.content==="回收站 #目标";})','trash notes retain deletion status and receive merged tag');
  await check('MemoStore.readState().then(s=>{const m=s.memos.find(m=>m.id==="one");return m.created==='+JSON.stringify(created)+'&&m.history.some(v=>v.content.includes("#旧标签/子"));})','created time and pre-merge history preserved');
  await check('MemoStore.readState().then(s=>s.review.include==="目标/子" && s.review.exclude==="工作")','saved review tag filters follow merged hierarchy');
  await check('JSON.parse(localStorage.getItem("memo-flow-pinned-tags")).filter(t=>t==="目标").length===1 && !window.MemoShell.pinned("旧标签") && JSON.parse(localStorage.getItem("memo-flow-recent-tags")).join(",")==="目标/子"','pinned and recent tags remap without duplicates');
  if(await evaluate('document.querySelector("#tags [data-collapse-tag=目标]").getAttribute("aria-expanded")==="false"'))await click('#tags [data-collapse-tag="目标"]');
  await menu('#pinnedTags [data-manage-tag="目标"]');await click('#tagMenu [data-tag-command=edit]');
  await evaluate('document.querySelector("#editTagName").value="新目标";document.querySelector("#editTagForm").requestSubmit();');await until('!!document.querySelector("#pinnedTags [data-manage-tag=新目标]")');
  await check('document.querySelector("#tags [data-collapse-tag=新目标]").getAttribute("aria-expanded")==="true"','renaming a parent preserves its expanded state');
  await check('MemoStore.readState().then(s=>s.memos.find(m=>m.id==="two").content==="子层级 #新目标/子/孙")','rename from pinned section updates hierarchy');
  await menu('#pinnedTags [data-manage-tag="新目标"]');await click('#tagMenu [data-tag-command=pin]');await check('!document.querySelector("#pinnedTags [data-pinned-tag=新目标]") && !!document.querySelector("#tags [data-tag=新目标]")','unpin removes shortcut and retains tag');
  win.webContents.reload();await until('!!window.MemoInteractions && !!document.querySelector("#tags [data-tag=新目标]")');await check('!window.MemoShell.pinned("旧标签") && !window.MemoShell.pinned("新目标")','preferences and merged notes survive reload');
  console.log(`Tag management: ${passed} checks passed; isolated evidence: ${directory}`);app.exit(0);
 }
 require('../desktop/main.cjs');app.whenReady().then(run).catch(error=>{console.error(error);app.exit(1);});
}
