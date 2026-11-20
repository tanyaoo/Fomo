'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict'),electron=require('electron'),root=path.resolve(__dirname,'..');
if(typeof electron==='string'){
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=require('node:child_process').spawn(electron,['--headless','--no-sandbox','--disable-gpu',__filename],{env,stdio:'inherit',windowsHide:true});
  const timer=setTimeout(()=>child.kill(),90000);child.on('exit',code=>{clearTimeout(timer);process.exitCode=code??1;});
}else{
  const {app,BrowserWindow}=electron,Core=require('../dist/core.js');
  const directory=fs.mkdtempSync(path.join(root,'work/ai-insights-'));process.env.MEMOFLOW_DATA_DIR=directory;app.setAppPath(root);app.setPath('userData',path.join(directory,'profile'));
  const now=Date.now(),make=(id,days,content)=>({id,content,html:'',images:[],created:new Date(now-days*86400000).toISOString(),updated:new Date(now-days*86400000).toISOString(),deleted:false,starred:false});
  fs.mkdirSync(path.join(directory,'data'));fs.writeFileSync(path.join(directory,'data/state.json'),JSON.stringify(Core.upgrade({memos:[make('reading-new',1,'阅读范围新笔记 #阅读/摘录'),make('reading-old',100,'阅读范围旧笔记 #阅读/摘录'),make('writing',2,'写作范围笔记 #写作')]})));
  let win;const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms)),ev=code=>win.webContents.executeJavaScript(code,true),until=async(code,attempts=300)=>{for(let i=0;i<attempts;i++){if(await ev(code))return;await pause(35);}throw Error('Timeout: '+code);};
  async function run(){
    for(let i=0;i<180;i++){win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('app/index.html'));if(win)break;await pause(35);}assert.ok(win);win.webContents.setBackgroundThrottling(false);win.setContentSize(1087,900);await until('!!document.querySelector("#aiInsight")?.onclick&&!!document.querySelector("#editor")?.memoEditor');
    await ev('document.querySelector("#aiInsight").click()');await until('document.querySelector("#aiInsightCount").textContent==="共 2 条笔记"');
    await ev('document.querySelector("#aiInsightTagMode").value="contain";document.querySelector("#aiInsightTagMode").dispatchEvent(new Event("change",{bubbles:true}))');assert.ok(await ev('!document.querySelector("#aiInsightTagField").hidden && [...document.querySelectorAll("#aiInsightTags option")].some(o=>o.value==="阅读") && document.querySelector("#aiInsightStart").disabled'),'tag mode offers existing tags and requires a selection');
    await ev('document.querySelector("#aiInsightTagMode").value="contain";document.querySelector("#aiInsightTagMode").dispatchEvent(new Event("change",{bubbles:true}));document.querySelector("#aiInsightTag").value="阅读";document.querySelector("#aiInsightTag").dispatchEvent(new Event("input",{bubbles:true}))');await until('!document.querySelector("#aiInsightTagField").hidden&&document.querySelector("#aiInsightCount").textContent==="共 1 条笔记"');
    await ev('(()=>{const d=new Date();d.setDate(d.getDate()-1);const value=[d.getFullYear(),String(d.getMonth()+1).padStart(2,"0"),String(d.getDate()).padStart(2,"0")].join("-");const period=document.querySelector("#aiInsightPeriod");period.value="custom";period.dispatchEvent(new Event("change",{bubbles:true}));document.querySelector("#aiInsightStartDate").value=value;document.querySelector("#aiInsightStartDate").dispatchEvent(new Event("input",{bubbles:true}));})()');await until('!document.querySelector("#aiInsightCustomDates").hidden&&document.querySelector("#aiInsightCount").textContent==="共 1 条笔记"');
    await ev('document.querySelector("#aiInsightTag").value="不存在";document.querySelector("#aiInsightTag").dispatchEvent(new Event("input",{bubbles:true}))');await until('document.querySelector("#aiInsightCount").textContent==="共 0 条笔记"&&document.querySelector("#aiInsightStart").disabled');
    await ev('document.querySelector("#aiInsightTag").value="阅读";document.querySelector("#aiInsightTag").dispatchEvent(new Event("input",{bubbles:true}));document.querySelector("#aiInsightPeriod").value="none";document.querySelector("#aiInsightPeriod").dispatchEvent(new Event("change",{bubbles:true}))');await until('document.querySelector("#aiInsightCount").textContent==="共 2 条笔记"');
    await pause(240);fs.writeFileSync(path.join(directory,'ai-insights-scoped.png'),(await win.webContents.capturePage()).toPNG());
    let lastRequest='';globalThis.fetch=async(_url,init)=>{const payload=JSON.parse(String(init?.body||'{}'));lastRequest=payload.messages?.map(message=>message.content).join('\n')||'';return new Response('data: '+JSON.stringify({choices:[{delta:{content:'范围洞察报告'}}]})+'\n\ndata: [DONE]\n\n',{status:200,headers:{'Content-Type':'text/event-stream'}});};
    await ev("window.memoDesktop.saveAiSettings({enabled:true,baseUrl:'https://api.deepseek.com',model:'test-model',key:'synthetic-test-key'})");
    await ev('document.querySelector("#aiInsightStart").click()');await until('document.querySelector("#insightResult")?.textContent.includes("范围洞察报告")',1800);
    assert.ok(lastRequest.includes('阅读范围新笔记')&&lastRequest.includes('阅读范围旧笔记')&&!lastRequest.includes('写作范围笔记'),'selected tag range must determine the notes sent to AI');
    console.log('PASS: AI insight landing filters by tag and period, disables empty ranges, and sends only matching notes');
    await ev('document.querySelector("#closeDialog").click()');await until('!document.querySelector("#dialog").open');
    await ev(`localStorage.setItem('fomo-ai-insight-templates',JSON.stringify([{id:'custom-test',name:'盲点检查',prompt:'只指出容易被忽略的盲点'}]))`);await ev('document.querySelector("#aiInsight").click()');await until('!!document.querySelector("#aiInsightFocus")');assert.equal(await ev('[...document.querySelector("#aiInsightFocus").options].at(-1).textContent'),'盲点检查');await ev('document.querySelector("#aiInsightManage").click()');await until('!!document.querySelector(".ai-template-dialog")&&document.querySelectorAll(".ai-template-row").length===7');fs.writeFileSync(path.join(directory,'ai-template-manager.png'),(await win.webContents.capturePage()).toPNG());
    console.log('PASS: custom AI perspectives persist into the insight selector and management sheet');
    app.exit(0);
  }
  require('../desktop/main.cjs');app.whenReady().then(run).catch(error=>{console.error(error);app.exit(1);});
}
