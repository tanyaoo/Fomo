const {app,BrowserWindow}=require('electron');
const path=require('node:path'),fs=require('node:fs');
const out=path.join(__dirname,'..','work','visual-audit-'+new Date().toISOString().replace(/[:.]/g,'-'));
fs.mkdirSync(out,{recursive:true});
const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
app.whenReady().then(async()=>{try{
 const win=new BrowserWindow({width:1041,height:1089,show:false});
 await win.loadFile(path.join(__dirname,'..','..','fomo.html'));
 await sleep(750);
 const ev=code=>win.webContents.executeJavaScript(code);
 const shot=async name=>fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());
 const metrics=async()=>ev(`(()=>{const q=s=>document.querySelector(s),r=s=>{const x=q(s)?.getBoundingClientRect();return x&&{x:Math.round(x.x),y:Math.round(x.y),w:Math.round(x.width),h:Math.round(x.height)}};const n=getComputedStyle(q('.numbers strong'));return {viewport:{w:innerWidth,h:innerHeight},overflow:document.documentElement.scrollWidth>innerWidth,sidebar:r('.sidebar'),main:r('.main'),composer:r('#composer'),card:r('.memo'),search:r('.search-wrap'),numberFont:n.fontFamily,numberWeight:n.fontWeight,numberSize:n.fontSize,stats:[...document.querySelectorAll('.numbers span')].map(x=>x.textContent),title:q('#viewTitle')?.textContent,theme:document.body.classList.contains('dark')?'dark':'light'}})()`);
 const result={generatedAt:new Date().toISOString(),source:'seeded fomo.html demo',captures:{}};
 result.captures.home=await metrics();await shot('01-home');
 await ev(`document.querySelector('#editor').focus()`);await sleep(250);result.captures.focused=await metrics();await shot('02-editor-focused');
 await ev(`document.querySelector('.memo-menu-button').click()`);await sleep(200);result.captures.menu={...await metrics(),footer:await ev(`document.querySelector('.memo-menu .menu-meta')?.innerText`)};await shot('03-note-menu');
 await ev(`document.querySelector('#workspaceSettings').click()`);await sleep(250);result.captures.settings=await ev(`(()=>{const d=document.querySelector('#dialog').getBoundingClientRect();return {w:Math.round(d.width),h:Math.round(d.height),open:document.querySelector('#dialog').open}})()`);await shot('04-settings');
 await ev(`document.querySelector('#closeDialog').click()`);await sleep(150);
 const id=await ev(`document.querySelector('.memo')?.dataset.id`);if(id){await ev(`window.MemoInteractions.openDetail(${JSON.stringify(id)})`);await sleep(250);result.captures.detail=await ev(`(()=>{const d=document.querySelector('#dialog').getBoundingClientRect();return {w:Math.round(d.width),h:Math.round(d.height),open:document.querySelector('#dialog').open}})()`);await shot('05-detail');await ev(`document.querySelector('#closeDialog').click()`);await sleep(150);}
 await ev(`document.body.classList.add('dark')`);await sleep(200);result.captures.dark=await metrics();await shot('06-dark-home');await ev(`document.body.classList.remove('dark')`);
 win.setContentSize(390,844);await sleep(350);result.captures.narrow=await metrics();await shot('07-narrow-home');
 fs.writeFileSync(path.join(out,'metrics.json'),JSON.stringify(result,null,2));
 console.log(JSON.stringify({out,...result.captures},null,2));
 win.destroy();app.quit();
}catch(error){console.error(error);app.exit(1)}});
