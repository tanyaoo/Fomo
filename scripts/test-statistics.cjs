'use strict';
const fs=require('node:fs'),path=require('node:path'),electron=require('electron'),root=path.resolve(__dirname,'..');
if(typeof electron==='string'){
  const env={...process.env};delete env.ELECTRON_RUN_AS_NODE;
  const child=require('node:child_process').spawn(electron,['--headless','--no-sandbox','--disable-gpu',__filename],{env,stdio:'inherit',windowsHide:true});
  const timer=setTimeout(()=>child.kill(),70000);
  child.on('exit',code=>{clearTimeout(timer);process.exitCode=code??1;});
}else{
  const {app,BrowserWindow}=electron,assert=require('node:assert/strict'),Core=require('../dist/core.js');
  fs.mkdirSync(path.join(root,'work'),{recursive:true});
  const directory=fs.mkdtempSync(path.join(root,'work/statistics-audit-'));
  process.env.MEMOFLOW_DATA_DIR=directory;app.setAppPath(root);fs.mkdirSync(path.join(directory,'data'));
  const make=(id,date,content,extra={})=>({id,content,html:`<p>${content}</p>`,images:[],created:date.toISOString(),updated:date.toISOString(),starred:false,deleted:false,...extra});
  const state=Core.upgrade({profile:'统计验证',memos:[
    make('aug-1',new Date(2026,7,3,9,15),'八月第一条 #读书/笔记 #工作/计划/复盘'),
    make('aug-2',new Date(2026,7,8,18,30),'图片记录 https://example.com #读书',{images:['data:image/png;base64,AAAA']}),
    make('sep-1',new Date(2026,8,2,8,10),'九月第一条 #工作/计划'),
    make('sep-2',new Date(2026,8,2,20,20),'九月第二条 #工作'),
    make('sep-3',new Date(2026,8,9,11,0),'九月语音 #灵感',{audio:'data:audio/webm;base64,AAAA'}),
    make('sep-4',new Date(2026,8,20,7,25),'九月导入 https://example.com',{source:'import'}),
    make('oct-1',new Date(2026,9,1,9,5),'十月第一天的记录 #读书/笔记'),
    make('oct-2',new Date(2026,9,1,12,35),'十月同一天的第二条 #工作'),
    make('oct-3',new Date(2026,9,1,21,10),'十月同一天的第三条 #生活'),
    make('oct-4',new Date(2026,9,6,10,0),'图片与链接 https://example.com #读书',{images:['data:image/png;base64,AAAA']}),
    make('oct-5',new Date(2026,9,15,16,45),'引用来源 #灵感',{source:'annotation'}),
    make('oct-6',new Date(2026,9,31,22,0),'月底复盘 #复盘'),
    make('trash',new Date(2026,9,10,22,0),'回收站不应计入',{deleted:true,deletedAt:new Date(2026,9,11).toISOString()}),
  ]});
  fs.writeFileSync(path.join(directory,'data/state.json'),JSON.stringify(state));
  let window;
  const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
  const ev=code=>window.webContents.executeJavaScript(code,true);
  async function until(code){for(let index=0;index<220;index++){if(await ev(code))return true;await pause(30);}throw Error('Timeout: '+code);}
  async function run(){
    for(let index=0;index<180;index++){window=BrowserWindow.getAllWindows().find(value=>value.webContents.getURL().includes('app/index.html'));if(window)break;await pause(35);}assert.ok(window,'isolated app window');
    window.webContents.on('console-message',(_event,level,message,line,source)=>{if(level>=2)console.error('renderer:',message,source+':'+line);});
    window.webContents.setBackgroundThrottling(false);window.setContentSize(1087,900);
    await until('!!document.querySelector("#settings")?.onclick&&typeof window.MemoCore?.statsForMonth==="function"');
    await ev('document.querySelector(".numbers [data-view=stats]").click()');
    await until('!!document.querySelector(".stats-page")');
    assert.equal(await ev('document.querySelector("#viewTitle").textContent'),'记录统计');
    assert.equal(await ev('document.querySelectorAll(".stats-analysis-card").length'),6);
    assert.equal(await ev('document.querySelectorAll(".stats-kpis>div").length'),5);
    assert.equal(await ev('document.querySelector(".stats-kpis strong").textContent'),'6');
    assert.equal(await ev(`(()=>{const grid=document.querySelector('.stats-calendar'),cells=[...grid.querySelectorAll('.cell,.blank')],first=cells[0].getBoundingClientRect(),last=cells.at(-1).getBoundingClientRect(),box=grid.getBoundingClientRect();return Math.abs(first.width-first.height)<1&&Math.abs(last.right-box.right)<2})()`),true,'heatmap fills the available width with square cells');
    assert.equal(await ev('document.querySelectorAll(".stats-calendar .cell").length'),366);
    assert.equal(await ev('document.querySelectorAll(".stats-calendar button").length'),0);
    assert.equal(await ev('document.querySelector(".stats-calendar .cell.today")!==null'),true);
    assert.deepEqual(await ev('[...document.querySelectorAll(".stats-preview-svg")].map(svg=>{const rect=svg.getBoundingClientRect();return [rect.width,rect.height]})'),[[100,100],[100,100],[100,100],[100,100]]);
    assert.equal(await ev('getComputedStyle(document.querySelector(".stats-analysis-copy em")).color'),'rgb(108, 158, 249)');
    assert.equal(await ev('getComputedStyle(document.querySelector(".stats-analysis-copy strong")).color'),'rgb(65, 62, 59)');
    assert.equal(await ev('document.querySelectorAll(".stats-analysis-pro").length'),0);
    assert.equal(await ev('document.querySelector(\'.stats-calendar [title^="2026-10-01 "]\').classList.contains("level2")'),true);
    assert.equal(await ev('document.querySelector(\'.stats-calendar [title^="2026-10-15 "]\').classList.contains("level1")'),true);
    assert.equal(await ev('document.querySelector(\'.stats-calendar [title^="2026-10-10 "]\').classList.contains("level0")'),true);
    assert.equal(await ev('document.documentElement.scrollWidth<=innerWidth&&document.querySelector("#specialPanel").scrollWidth<=document.querySelector("#specialPanel").clientWidth+1'),true,'statistics page must not overflow horizontally');
    const contentSizeBeforeBreakpoint=window.getContentSize();window.setContentSize(900,900);await until('innerWidth<992');
    assert.equal(await ev('getComputedStyle(document.querySelector(".stats-analysis-grid")).gridTemplateColumns.split(" ").length'),1);
    await pause(120);fs.writeFileSync(path.join(directory,'statistics-medium.png'),(await window.webContents.capturePage()).toPNG());
    window.setContentSize(...contentSizeBeforeBreakpoint);await until('innerWidth>=992');
    console.log('PASS: statistics opens with current-month metrics, recent-year heatmap and six analysis entries');
    await ev('document.querySelector("[data-stats-month]").click()');
    await until('!!document.querySelector(".stats-month-picker")');
    assert.equal(await ev('document.querySelectorAll(".stats-picker-months button").length'),12);
    assert.equal(await ev('document.querySelector(".stats-picker-months [aria-current=date]").textContent'),'10月');
    assert.deepEqual(await ev('[...document.querySelectorAll(".stats-picker-months button")].filter(button=>button.disabled).map(button=>button.textContent)'),['1月','2月','3月','4月','5月','6月','7月','11月','12月']);
    assert.deepEqual(await ev('[...document.querySelectorAll(".stats-year-prev,.stats-year-next")].map(button=>button.disabled)'),[true,true]);
    await ev('[...document.querySelectorAll("[data-stats-select-month]")].find(button=>button.dataset.statsSelectMonth==="2026-09").click()');
    await until('document.querySelector("[data-stats-month]").textContent.includes("2026-09")');
    assert.equal(await ev('document.querySelector(".stats-kpis strong").textContent'),'4');
    console.log('PASS: month picker selects a prior month and recalculates all five metrics');
    const openChart=async(kind,selector,title)=>{await ev(`document.querySelector('[data-stats-chart=${kind}]').click()`);await until(`document.querySelector('#dialog').open&&document.querySelector('#dialogTitle').textContent===${JSON.stringify(title)}&&!!document.querySelector(${JSON.stringify(selector)})`);await pause(160);fs.writeFileSync(path.join(directory,'chart-'+kind+'.png'),(await window.webContents.capturePage()).toPNG());};
    const closeChart=async()=>{await ev('document.querySelector("#closeDialog").click()');await until('!document.querySelector("#dialog").open');};
    await openChart('tags','.stats-radial-tree','标签树');assert.equal(await ev('document.querySelectorAll(".stats-radial-tree .stats-radial-leaf").length>0'),true);assert.equal(await ev('document.querySelector("#dialog").getBoundingClientRect().width<=720'),true);
    const leavesBefore=await ev('document.querySelectorAll(".stats-radial-tree .stats-radial-leaf").length');
    await ev('[...document.querySelectorAll("[data-stats-tree-toggle]")].find(el=>el.dataset.statsTreeToggle==="读书").dispatchEvent(new MouseEvent("click",{bubbles:true}))');
    await until('[...document.querySelectorAll("[data-stats-tree-toggle]")].some(el=>el.dataset.statsTreeToggle==="读书"&&el.getAttribute("aria-expanded")==="false")');
    assert.equal(await ev('document.querySelectorAll(".stats-radial-tree .stats-radial-leaf").length')<leavesBefore,true);
    await ev('[...document.querySelectorAll("[data-stats-tree-toggle]")].find(el=>el.dataset.statsTreeToggle==="读书").dispatchEvent(new MouseEvent("click",{bubbles:true}))');
    await until('[...document.querySelectorAll("[data-stats-tree-toggle]")].some(el=>el.dataset.statsTreeToggle==="读书"&&el.getAttribute("aria-expanded")==="true")');
    assert.equal(await ev('[...document.querySelectorAll("[data-stats-tree-toggle]")].some(el=>el.dataset.statsTreeToggle==="工作/计划")'),true);
    await ev('[...document.querySelectorAll("[data-stats-tree-toggle]")].find(el=>el.dataset.statsTreeToggle==="工作/计划").dispatchEvent(new MouseEvent("click",{bubbles:true}))');
    await until('[...document.querySelectorAll("[data-stats-tree-toggle]")].some(el=>el.dataset.statsTreeToggle==="工作/计划"&&el.getAttribute("aria-expanded")==="false")');
    assert.equal(await ev('[...document.querySelectorAll(".stats-radial-leaf")].some(el=>el.textContent.includes("复盘"))'),false);
    await ev('[...document.querySelectorAll("[data-stats-tree-toggle]")].find(el=>el.dataset.statsTreeToggle==="工作/计划").dispatchEvent(new MouseEvent("click",{bubbles:true}))');
    await until('[...document.querySelectorAll(".stats-radial-leaf")].some(el=>el.textContent.includes("复盘"))');
    const radialWidthBefore=await ev('Number(document.querySelector(".stats-radial-tree").getAttribute("viewBox").split(" ")[2])');
    await ev('(()=>{const svg=document.querySelector(".stats-radial-tree"),rect=svg.getBoundingClientRect();svg.dispatchEvent(new WheelEvent("wheel",{deltaY:-100,clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,bubbles:true,cancelable:true}));})()');
    await pause(60);
    assert.equal(await ev('Number(document.querySelector(".stats-radial-tree").getAttribute("viewBox").split(" ")[2])')<radialWidthBefore,true);
    await closeChart();
    await openChart('tagContent','.stats-treemap','标签矩阵');assert.equal(await ev('document.querySelectorAll(".stats-treemap-root").length>0'),true);assert.equal(await ev('document.querySelector(".stats-treemap").getBoundingClientRect().width<=660'),true);
    await ev('[...document.querySelectorAll(".stats-treemap-root>b[data-stats-treemap-node]")].find(el=>el.dataset.statsTreemapNode==="工作").click()');
    await until('document.querySelector(".stats-treemap").classList.contains("has-focus")&&!document.querySelector(".stats-treemap-breadcrumb").hidden');
    assert.equal(await ev('[...document.querySelectorAll("[data-stats-treemap-node]")].some(el=>el.dataset.statsTreemapNode==="工作/计划")'),true);
    await ev('[...document.querySelectorAll("[data-stats-treemap-node]")].find(el=>el.dataset.statsTreemapNode==="工作/计划").click()');
    await until('[...document.querySelectorAll("[data-stats-treemap-step]")].some(el=>el.dataset.statsTreemapStep==="1"&&el.textContent==="#计划")&&[...document.querySelectorAll("[data-stats-treemap-label]")].some(el=>el.dataset.statsTreemapLabel==="工作/计划/复盘")');
    await ev('[...document.querySelectorAll("[data-stats-treemap-step]")].find(el=>el.dataset.statsTreemapStep==="-1").click()');
    await until('!document.querySelector(".stats-treemap").classList.contains("has-focus")&&document.querySelector(".stats-treemap-breadcrumb").hidden');
    await closeChart();
    await openChart('words','.stats-polar-chart','字数分布');assert.equal(await ev('document.querySelectorAll(".stats-polar-chart path").length'),6);assert.equal(await ev('document.querySelectorAll(".stats-polar-wrap .stats-chart-legend").length'),0);assert.equal(await ev('document.querySelector(".stats-polar-chart").getBoundingClientRect().width<=660'),true);await closeChart();
    await openChart('time','.stats-bubble-plot','时间分布');
    assert.equal(await ev('document.querySelectorAll(".stats-bubble-cell>i").length'),168);
    assert.equal(await ev('document.querySelectorAll(".stats-bubble-cell>i.is-zero").length>0'),true);
    assert.equal(await ev('document.body.innerText.includes("解锁 PRO")||document.body.innerText.includes("会员限定")'),false);
    await closeChart();
    await openChart('platform','.stats-chart-pie','平台分布');assert.match(await ev('document.querySelector(".stats-chart-legend").textContent'),/客户端/);assert.equal(await ev('getComputedStyle(document.querySelector(".stats-chart-pie .stats-chart-legend>div")).fontSize'),'12px');await closeChart();
    await openChart('media','.stats-chart-pie','媒体分布');assert.match(await ev('document.querySelector(".stats-chart-legend").textContent'),/文本/);await closeChart();
    console.log('PASS: all six official chart forms open locally without a membership gate');
    await pause(180);fs.writeFileSync(path.join(directory,'statistics-main.png'),(await window.webContents.capturePage()).toPNG());
    await ev('document.querySelector("[data-stats-share]").click()');
    await until('!!document.querySelector("#statsSharePreview")&&document.querySelector("#statsSharePreview").src.startsWith("data:image/png")');
    assert.equal(await ev('document.querySelector("#saveStatsShare").disabled'),false);
    fs.writeFileSync(path.join(directory,'statistics-share.png'),(await window.webContents.capturePage()).toPNG());
    await ev('document.querySelector("#closeStatsShare").click()');await until('!document.querySelector("#dialog").open');
    console.log('PASS: monthly statistics generates a local PNG preview and save action');
    await ev('document.querySelector("[data-stats-year-share]").click()');
    await until('!!document.querySelector("#statsSharePreview")&&document.querySelector("#statsSharePreview").src.startsWith("data:image/png")');
    assert.equal(await ev('document.querySelector("#saveStatsShare").disabled'),false);
    fs.writeFileSync(path.join(directory,'statistics-year-share.png'),(await window.webContents.capturePage()).toPNG());
    await ev('document.querySelector("#closeStatsShare").click()');await until('!document.querySelector("#dialog").open');
    console.log('PASS: yearly heatmap also generates a local PNG preview and save action');
    await pause(180);fs.writeFileSync(path.join(directory,'statistics.png'),(await window.webContents.capturePage()).toPNG());
    await ev('document.body.classList.add("dark")');await pause(180);
    assert.equal(await ev('getComputedStyle(document.querySelector(".stats-daily-chart i.has-value")).backgroundColor'),'rgb(85, 187, 142)');
    fs.writeFileSync(path.join(directory,'statistics-dark.png'),(await window.webContents.capturePage()).toPNG());
    const savedSize=window.getSize(),savedMinimum=window.getMinimumSize();window.setMinimumSize(360,520);window.setSize(430,760);await until('innerWidth<520');
    await pause(180);
    const narrowLayout=await ev(`(()=>({innerWidth,doc:document.documentElement.scrollWidth,body:document.body.scrollWidth,main:document.querySelector('.main').scrollWidth,mainWidth:document.querySelector('.main').clientWidth,special:document.querySelector('#specialPanel').scrollWidth,specialWidth:document.querySelector('#specialPanel').clientWidth,overflow:[...document.querySelectorAll('.stats-page *')].filter(el=>el.scrollWidth>el.clientWidth+1).slice(0,12).map(el=>({tag:el.tagName,cls:el.className,scroll:el.scrollWidth,width:el.clientWidth,text:(el.textContent||'').trim().slice(0,40)}))}))()`);
    if(!(narrowLayout.innerWidth>=narrowLayout.doc&&narrowLayout.special<=narrowLayout.specialWidth+1))console.error('narrow layout:',narrowLayout);
    assert.equal(narrowLayout.doc<=narrowLayout.innerWidth&&narrowLayout.special<=narrowLayout.specialWidth+1,true,'statistics must remain contained at narrow widths');
    assert.equal(await ev('getComputedStyle(document.querySelector("[data-stats-year-share]")).opacity'),'1');
    fs.writeFileSync(path.join(directory,'statistics-narrow.png'),(await window.webContents.capturePage()).toPNG());
    window.setSize(...savedSize);window.setMinimumSize(...savedMinimum);
    console.log('PASS: dark mode and narrow layout keep the statistics page free of horizontal overflow');
    console.log('Statistics UI: 11 checks passed; isolated evidence: '+directory);
    await pause(400);app.exit(0);
  }
  require('../desktop/main.cjs');app.whenReady().then(run).catch(async error=>{console.error(error);if(window)console.error('renderer state:',await ev('({title:document.querySelector("#viewTitle")?.textContent,special:document.querySelector("#specialPanel")?.innerHTML.slice(0,500),memos:document.querySelector("#memos")?.innerHTML.slice(0,300),body:document.body.className})').catch(()=>null));app.exit(1);});
}
