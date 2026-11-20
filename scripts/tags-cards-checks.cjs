'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
module.exports=async({window,getStore,userDirectory})=>{
 const ev=s=>window.webContents.executeJavaScript(s,true),click=s=>ev(`document.querySelector(${JSON.stringify(s)}).click()`);
 const until=async s=>{for(let i=0;i<160;i++){if(await ev(s))return;await new Promise(r=>setTimeout(r,40));}throw Error('Tags/cards timeout '+s);};
 const screenshot=async name=>{await ev(`new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))`);await fs.writeFile(path.join(userDirectory,name+'.png'),(await window.webContents.capturePage()).toPNG());};
 await until(`!!document.querySelector('#editor')?.memoEditor && !!document.querySelector('#multiSelect')`);
 if(process.env.MEMOFLOW_TEST_PHASE==='tags-cards-restart'){
  assert.equal(await ev(`document.querySelector('#tags [data-tag="阅读/摘录"]').getClientRects().length===0`),true);
  assert.equal(await ev(`!!document.querySelector('#pinnedTags button')`),true);
  await click('#pinnedTags button');assert.equal(await ev(`!!document.querySelector('#tags [data-tag="阅读/摘录"]')`),true);
  assert.equal(await ev(`document.querySelector('#viewTitle').textContent`),'# 阅读/摘录');
  console.log('PASS: tags-cards-restart — renamed pinned tags and persistent folds, pinned navigation reveals ancestors');window.close();return;
 }
 const image=await ev(`(()=>{const canvas=document.createElement('canvas');canvas.width=640;canvas.height=320;const c=canvas.getContext('2d');c.fillStyle='#cce5db';c.fillRect(0,0,640,320);return canvas.toDataURL('image/png');})()`);
 const state=await getStore().readState(),memo=(id,content,extra={})=>({id,content,created:'2026-10-20T00:00:00Z',updated:'2026-10-20T00:00:00Z',images:[],...extra});
 await getStore().save(state,{...state,extraTags:['知识/摘录','知识/想法'],memos:[memo('tag-card','标签笔记 #知识/摘录 #知识/想法'),memo('long-card','短字数的段落笔记',{html:Array.from({length:20},(_,i)=>`<p>段落 ${i+1}：留出阅读空间。</p>`).join('')}),memo('single-image','单图',{images:[image]}),memo('four-images','四图',{images:[image,image,image,image]})]});await click('#refresh');await until(`document.querySelectorAll('.memo').length===4`);
 await ev(`window.MemoShell.togglePin('知识/摘录');localStorage.setItem('memo-flow-recent-tags',JSON.stringify(['知识/摘录']))`);
 await until(`document.querySelector('#tags [data-tag="知识/摘录"]').getClientRects().length===0`);
 await click('[data-collapse-tag="知识"]');assert.equal(await ev(`document.activeElement.dataset.collapseTag`),'知识');await until(`document.querySelector('#tags [data-tag="知识/摘录"]').getClientRects().length>0`);
 await click('[data-collapse-tag="知识"]');await until(`document.querySelector('#tags [data-tag="知识/摘录"]').getClientRects().length===0`);
 await click('#toggleTagSearch');await ev(`document.querySelector('#tagSearch').value='摘录';document.querySelector('#tagSearch').dispatchEvent(new Event('input'))`);await until(`!!document.querySelector('#tags [data-tag="知识/摘录"]')`);assert.equal(await ev(`!!document.querySelector('#tags [data-tag="知识"]') && !!document.querySelector('#tags [data-tag="知识/摘录"]')`),true);
 await click('#tags [data-tag="知识/摘录"]');assert.equal(await ev(`document.querySelector('#tagSearch').value`),'摘录');await click('#closeTagSearch');assert.equal(await ev(`document.querySelectorAll('.memo').length`),1);
 await ev(`document.querySelector('#editor').memoEditor.setText('');document.querySelector('#editor').memoEditor.insertText('#录');document.querySelector('#editor').focus();document.querySelector('#editor').dispatchEvent(new KeyboardEvent('keyup',{key:'录',bubbles:true}))`);await until(`!document.querySelector('#tagSuggestions').hidden`);
  assert.ok((await ev(`document.querySelector('#tagSuggestions').textContent`)).includes('知识/摘录'));
  assert.deepEqual(await ev(`(()=>{const m=document.querySelector('#tagSuggestions'),b=m.querySelector('button'),ms=getComputedStyle(m),bs=getComputedStyle(b);return {radius:ms.borderRadius,shadow:ms.boxShadow,padding:ms.padding,font:bs.fontSize,line:bs.lineHeight,itemRadius:bs.borderRadius,itemMinHeight:bs.minHeight,itemBox:bs.boxSizing,animation:ms.animationName};})()`),{radius:'12px',shadow:'rgba(0, 0, 0, 0.14) 0px 14px 36px 0px',padding:'6px',font:'14px',line:'20px',itemRadius:'6px',itemMinHeight:'34px',itemBox:'border-box',animation:await ev("matchMedia('(prefers-reduced-motion: reduce)').matches")?'none':'tag-popup-in'},'tag popup matches the reference surface and item metrics');assert.ok((await ev(`getComputedStyle(document.querySelector('#tagSuggestions')).scrollbarColor`)).startsWith('rgba(0, 0, 0, 0)'),'tag popup scrollbar stays hidden until hover');
  await ev(`document.querySelector('#editor').dispatchEvent(new KeyboardEvent('keydown',{key:'Tab',bubbles:true,cancelable:true}))`);assert.equal(await ev(`document.querySelector('#editor').value`),'#知识/摘录 ');assert.equal(await ev(`document.activeElement.id`),'editor');await ev(`document.querySelector('#editor').memoEditor.setText('')`);
 await click('[data-manage-tag="知识"]');await click('#tagMenu [data-tag-command=edit]');await ev(`document.querySelector('#editTagName').value='阅读';document.querySelector('#editTagForm').requestSubmit()`);await until(`!!document.querySelector('#tags [data-tag="阅读/摘录"]') && !document.querySelector('#dialog').open`);
 assert.equal(await ev(`window.MemoShell.pinned('阅读/摘录')`),true);assert.deepEqual(await ev(`JSON.parse(localStorage.getItem('memo-flow-recent-tags'))`),['阅读/摘录']);assert.ok((await getStore().readState()).memos[0].content.includes('#阅读/摘录'));
 await click('.brand');await until(`document.querySelectorAll('.memo').length===4`);
 assert.equal(await ev(`document.querySelector('[data-id="long-card"] .memo-content').classList.contains('collapsed')`),true);
 await click('[data-id="long-card"] [data-action="expand"]');assert.equal(await ev(`document.querySelector('[data-id="long-card"] [data-action="expand"]').getAttribute('aria-expanded')`),'true');await click('[data-id="long-card"] [data-action="expand"]');assert.equal(await ev(`document.activeElement.dataset.action`),'expand');
 await until(`document.querySelector('[data-id="single-image"] img').complete`);assert.equal(await ev(`(()=>{const r=document.querySelector('[data-id="single-image"] img').getBoundingClientRect();return Math.round(r.width)===110&&Math.round(r.height)===110;})()`),true);
 assert.equal(await ev(`getComputedStyle(document.querySelector('[data-id="four-images"] .memo-images')).display`),'flex');
 await screenshot('tags-cards-light');await ev(`document.body.classList.add('dark')`);await screenshot('tags-cards-dark');await ev(`document.body.classList.remove('dark');document.querySelector('#memos').scrollTop=document.querySelector('#memos').scrollHeight`);await screenshot('tags-cards-images');
 window.setSize(900,720);await until(`innerWidth<=900`);await screenshot('tags-cards-narrow');
 await click('[data-collapse-tag="阅读"]');assert.ok((await ev(`JSON.parse(localStorage.getItem('memo-flow-collapsed-tags'))`)).includes('阅读'));
 console.log('PASS: tags-cards-first — hierarchy search, completion, rename preferences, measured folding, image aspect/grid and themes');window.close();
};
