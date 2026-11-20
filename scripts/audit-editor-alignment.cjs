'use strict';
const fs=require('node:fs'),path=require('node:path'),electron=require('electron'),root=path.resolve(__dirname,'..');
if(typeof electron==='string'){
 const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
 const child=require('node:child_process').spawn(electron,[__filename],{env,stdio:'inherit',windowsHide:true});child.on('exit',code=>process.exitCode=code??1);
}else{
 const {app,BrowserWindow}=electron,Core=require('../dist/core.js');
 const directory=path.join(root,'work/editor-alignment-'+Date.now());fs.mkdirSync(path.join(directory,'data'),{recursive:true});
 process.env.MEMOFLOW_DATA_DIR=directory;app.setAppPath(root);
 const now=new Date().toISOString();fs.writeFileSync(path.join(directory,'data/state.json'),JSON.stringify(Core.upgrade({profile:'编辑器对齐检查',memos:[{id:'alignment',content:'#阅读 同样字号的正文\n第一项\n第二项',html:'<p>#阅读 同样字号的正文</p><ul><li><p>第一项</p></li><li><p>第二项</p></li></ul>',images:[],created:now,updated:now,deleted:false,starred:false}]})));
 let window;const pause=ms=>new Promise(r=>setTimeout(r,ms)),ev=code=>window.webContents.executeJavaScript(code,true),until=async code=>{for(let i=0;i<180;i++){if(await ev(code))return;await pause(35);}throw Error('Timeout '+code);};
 async function capture(name){
   await pause(180);const metrics=await ev(`(()=>{const rect=element=>{const r=element.getBoundingClientRect(),s=getComputedStyle(element);return {id:element.id||element.dataset.format||element.className,x:r.x,y:r.y,width:r.width,height:r.height,center:r.y+r.height/2,font:s.font,fontSize:s.fontSize,lineHeight:s.lineHeight,display:s.display};};const c=document.querySelector('#composer'),tools=[...c.querySelectorAll('.format-tools button,.send-wrap>*')].filter(el=>el.getClientRects().length&&getComputedStyle(el).display!=='none');return {viewport:{width:innerWidth,height:innerHeight},composer:rect(c),editor:rect(document.querySelector('#editor')),tools:tools.map(rect),overflow:document.documentElement.scrollWidth>innerWidth,tag:[...document.querySelectorAll('#editor .editor-tag,#editor .tag-link,#editor .memo-tag')].map(rect)};})()`);
   const r=metrics.composer,x=Math.max(0,Math.floor(r.x)-6),y=Math.max(0,Math.floor(r.y)-6),width=Math.min(metrics.viewport.width-x,Math.ceil(r.width)+12),height=Math.min(metrics.viewport.height-y,Math.ceil(r.height)+12);
   fs.writeFileSync(path.join(directory,name+'.png'),(await window.webContents.capturePage({x,y,width,height})).toPNG());fs.writeFileSync(path.join(directory,name+'.json'),JSON.stringify(metrics,null,2));return metrics;
 }
 async function run(){
   for(let i=0;i<180;i++){window=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('app/index.html'));if(window)break;await pause(35);}if(!window)throw Error('No isolated window');window.webContents.setBackgroundThrottling(false);window.setContentSize(1100,820);await until('!!document.querySelector("#editor")?.memoEditor&&!!window.MemoInteractions');
   await ev('document.activeElement.blur()');await capture('01-empty');
   await ev('document.querySelector("#editor").focus()');await capture('02-focused');
   await ev('document.querySelector("#editor").memoEditor.setHTML("<p>#阅读 同样字号的正文</p>");document.querySelector("#editor").focus()');await capture('03-writing');
   await ev('document.querySelector("[data-id=alignment] [data-action=edit]").click()');await capture('04-inline');await ev('document.querySelector("#cancelEdit").click()');
   await ev('MemoInteractions.openDetail("alignment");document.querySelector("#detailActionsToggle").click();document.querySelector("#detailEdit").click()');await capture('05-detail');await ev('document.querySelector("#cancelEdit").click();document.querySelector("#closeDialog").click()');
   window.setMinimumSize(360,480);window.setContentSize(390,820);await pause(150);await ev('document.querySelector("#editor").focus()');await capture('06-narrow');
   console.log('Editor audit evidence: '+directory);app.exit(0);
 }
 require('../desktop/main.cjs');app.whenReady().then(run).catch(error=>{console.error(error);app.exit(1);});
}
