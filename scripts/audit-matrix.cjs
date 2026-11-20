'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.join(__dirname, '..', 'work', 'matrix-audit-' + stamp);
fs.mkdirSync(out, { recursive: true });
app.setPath('userData', path.join(out, 'profile'));
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1041, height: 900, show: false });
  const ev = code => win.webContents.executeJavaScript(code);
  const shot = async name => fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG());
  const metrics = () => ev(`(() => {
    const q=s=>document.querySelector(s), r=s=>{const x=q(s)?.getBoundingClientRect(); return x&&{x:Math.round(x.x),y:Math.round(x.y),w:Math.round(x.width),h:Math.round(x.height)}};
    return {viewport:{w:innerWidth,h:innerHeight,dpr:devicePixelRatio}, overflow:document.documentElement.scrollWidth>innerWidth,
      sidebar:r('.sidebar'), main:r('.main'), composer:r('#composer'), card:r('.memo'), dialog:r('#dialog'),
      theme:document.body.classList.contains('dark')?'dark':'light'};
  })()`);
  const close = async () => { await ev(`if(document.querySelector('#dialog')?.open) document.querySelector('#dialog').close()`); await sleep(120); };
  const theme = async dark => { await ev(`document.body.classList.toggle('dark', ${dark})`); await sleep(100); };
  const result = { generatedAt: new Date().toISOString(), viewport: 'window 900px high', runs: [] };
  await win.loadFile(path.join(__dirname, '..', 'fomo.html'));
  await sleep(700);
  for (const width of [780, 1041, 1440]) {
    win.setContentSize(width, 900); await sleep(350);
    for (const dark of [false, true]) {
      await theme(dark); await ev(`document.querySelector('[data-view=all]')?.click(); document.querySelector('#memos').scrollTop=0`); await sleep(200);
      const row = { width, zoom: 1, theme: dark ? 'dark' : 'light', home: await metrics() };
      await shot(`w${width}-z100-${dark ? 'dark' : 'light'}-home`);
      await ev(`document.querySelector('#workspaceSettings')?.click()`); await sleep(220);
      row.settings = await metrics();
      await shot(`w${width}-z100-${dark ? 'dark' : 'light'}-settings`);
      await close();
      const id = await ev(`document.querySelector('.memo')?.dataset.id`);
      if (id) {
        await ev(`window.MemoInteractions.openDetail(${JSON.stringify(id)})`); await sleep(220);
        row.detail = await metrics();
        await shot(`w${width}-z100-${dark ? 'dark' : 'light'}-detail`);
        await close();
      }
      result.runs.push(row);
    }
  }
  await theme(false);
  for (const zoom of [1.25, 1.5, 2]) {
    win.setContentSize(1041, 900); await win.webContents.setZoomFactor(zoom); await sleep(300);
    await ev(`document.querySelector('[data-view=all]')?.click(); document.querySelector('#memos').scrollTop=0`); await sleep(180);
    const row = { width: 1041, zoom, theme: 'light', home: await metrics() };
    await shot(`w1041-z${String(Math.round(zoom*100))}-light-home`);
    await ev(`document.querySelector('#workspaceSettings')?.click()`); await sleep(220);
    row.settings = await metrics();
    await shot(`w1041-z${String(Math.round(zoom*100))}-light-settings`);
    await close(); result.runs.push(row);
  }
  await win.webContents.setZoomFactor(1);
  fs.writeFileSync(path.join(out, 'matrix.json'), JSON.stringify(result, null, 2));
  const bad = result.runs.filter(r => r.home.overflow || r.settings?.overflow || r.detail?.overflow);
  console.log(JSON.stringify({ out, runs: result.runs.length, overflowRuns: bad.length, bad: bad.map(r=>({width:r.width,zoom:r.zoom,theme:r.theme})) }, null, 2));
  win.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
