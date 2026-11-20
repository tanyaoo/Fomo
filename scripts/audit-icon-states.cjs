'use strict';
const { app, BrowserWindow } = require('electron');
const path = require('node:path');
const fs = require('node:fs');
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const out = path.join(__dirname, '..', 'work', 'icon-states-' + stamp);
fs.mkdirSync(out, { recursive: true });
app.whenReady().then(async () => {
  const win = new BrowserWindow({ width: 1041, height: 900, show: false });
  const ev = code => win.webContents.executeJavaScript(code);
  const shot = async name => fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG());
  const state = () => ev(`(() => {
    const q=s=>document.querySelector(s), r=s=>{const x=q(s)?.getBoundingClientRect(); return x&&{x:Math.round(x.x),y:Math.round(x.y),w:Math.round(x.width),h:Math.round(x.height)}};
    const b=q('#insertTag'), s=q('#saveMemo'), t=q('.format-tools');
    return {composer:q('#composer')?.className, active:document.activeElement?.className,
      tools:{opacity:getComputedStyle(t).opacity,color:getComputedStyle(t).color},
      button:{rect:r('#insertTag'),hover:b?.matches(':hover'),opacity:getComputedStyle(b).opacity,color:getComputedStyle(b).color,bg:getComputedStyle(b).backgroundColor},
      send:{disabled:s?.disabled,opacity:getComputedStyle(s).opacity,color:getComputedStyle(s).color}};
  })()`);
  await win.loadFile(path.join(__dirname, '..', '..', 'fomo.html'));
  await sleep(600);
  const result = { generatedAt: new Date().toISOString(), states: {} };
  result.states.idle = await state(); await shot('01-idle');
  const point = await ev(`(() => {const r=document.querySelector('#insertTag').getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}})()`);
  win.webContents.sendInputEvent({ type: 'mouseMove', x: point.x, y: point.y }); await sleep(200);
  result.states.hover = await state(); await shot('02-toolbar-hover');
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 400, y: 300 }); await sleep(100);
  await ev(`document.querySelector('.format-tools').style.transition='none'`);
  await ev(`document.querySelector('.ProseMirror').dispatchEvent(new PointerEvent('pointerdown',{bubbles:true}))`); await sleep(250);
  result.states.focused = await state(); await shot('03-editor-focused');
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Escape' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Escape' });
  await ev(`document.querySelector('.memo-menu-button').click()`); await sleep(200);
  result.states.menu = { meta: await ev(`document.querySelector('.memo-menu .menu-meta')?.innerText`), items: await ev(`[...document.querySelectorAll('.memo-menu>button')].map(b=>b.textContent.trim())`) }; await shot('04-menu');
  fs.writeFileSync(path.join(out, 'states.json'), JSON.stringify(result, null, 2));
  console.log(JSON.stringify({ out, result }, null, 2));
  win.destroy(); app.quit();
}).catch(error => { console.error(error); app.exit(1); });
