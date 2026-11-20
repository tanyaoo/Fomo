import {applyBasicShareLayout} from './share-basic-layouts.js';
import {drawPaper,drawBorder,drawFlower,drawTicket,cutTicketEdges} from './share-decoration.js';
const templates=[
  {id:'daily',name:'日签',paper:'#ecd896',ink:'#b1731c',accent:'#b1731c',layout:'daily'},
  {id:'ticket',name:'票根',paper:'#f2f2f2',ink:'#2e2e2e',accent:'#777777',layout:'ticket'},
  {id:'journal',name:'手札',paper:'#f8f7f0',ink:'#323232',accent:'#73734b',layout:'journal'},
  {id:'memo',name:'备忘',paper:'#faf8f1',ink:'#585854',accent:'#d7b739',layout:'memo'},
  {id:'plain',name:'素白',paper:'#ffffff',ink:'#454545',accent:'#5783f7',layout:'plain'},
  {id:'letter',name:'空笺',paper:'#ffffff',ink:'#454545',accent:'#5783f7',layout:'letter'},
  {id:'ink',name:'墨色',paper:'#202020',ink:'#d9d9d9',accent:'#2b88d8',layout:'ink'},
  {id:'excerpt',name:'断章',paper:'#f5f2ed',ink:'#141817',accent:'#141817',layout:'excerpt'},
  {id:'bloom',name:'生花',paper:'#d5f0e4',ink:'#454545',accent:'#5783f7',layout:'bloom'},
  {id:'gold',name:'黑金',paper:'#202020',ink:'#e4ddb3',accent:'#e4ddb3',layout:'gold'},
  {id:'old',name:'旧页',paper:'#fffcf7',ink:'#563a17',accent:'#ad9e88',layout:'old'},
  {id:'light',name:'浮光',paper:'#f2efef',ink:'#323232',accent:'#999999',layout:'light'}
];
const $=selector=>document.querySelector(selector);
const escape=value=>window.MemoMarkup.escape(String(value));
const icon=name=>window.memoIcons[name]||'';
const defaults={personal:true,brand:true,tags:true,fontSize:16};
const storageKey='writeboom-share-image-options';
const dateParts=value=>{const d=new Date(value);return {day:String(d.getDate()).padStart(2,'0'),month:String(d.getMonth()+1).padStart(2,'0'),year:d.getFullYear()};};

function options(){try{const saved=JSON.parse(localStorage.getItem(storageKey)||'{}');return {...defaults,...Object.fromEntries(['personal','brand','tags'].filter(k=>typeof saved[k]==='boolean').map(k=>[k,saved[k]])),fontSize:Number.isInteger(Number(saved.fontSize))&&Number(saved.fontSize)>=14&&Number(saved.fontSize)<=20?Number(saved.fontSize):16};}catch{return {...defaults};}}
function imageReady(image){return new Promise((resolve,reject)=>{if(image.complete&&image.naturalWidth)return resolve();const timeout=setTimeout(()=>reject(Error('图片读取超时，请重试')),10000);image.onload=()=>{clearTimeout(timeout);resolve();};image.onerror=()=>{clearTimeout(timeout);reject(Error('笔记图片无法读取，请重试'));};});}
function fillRect(context,rect,origin,color,radius=0){if(!color||color==='transparent'||color==='rgba(0, 0, 0, 0)')return;context.fillStyle=color;if(radius>0){context.beginPath();context.roundRect(rect.left-origin.left,rect.top-origin.top,rect.width,rect.height,Math.min(radius,rect.width/2,rect.height/2));context.fill();}else context.fillRect(rect.left-origin.left,rect.top-origin.top,rect.width,rect.height);}

// Measure the actual rich document so PNG wrapping matches its HTML preview.
async function renderImage(m,api,template,settings,thumbnail=false){
  const root=document.createElement('article');root.className='share-document';root.dataset.layout=template.layout;
  root.style.cssText=`--share-paper:${template.paper};--share-ink:${template.ink};--share-accent:${template.accent};--share-font-size:${settings.fontSize}px`;
  const {day,month,year}=dateParts(m.created),brand=settings.brand?'<span class="share-brand">'+icon('back')+'<b>Fomo</b></span>':'<span></span>';
  const symbols=settings.brand?'<span class="share-symbols">'+icon('hash')+icon('insight')+icon('sparkles')+'</span>':'';
  root.innerHTML=`<header class="share-card-header">${brand}${symbols}</header><div class="share-card-date">${escape(day)} <small>/ ${escape(month)}<span>${escape(year)}</span></small></div><div class="share-quote">${icon('quote')}</div><div class="share-card-body">${api.rich(m)}</div><div class="share-card-images"></div><footer class="share-card-footer">${settings.personal?'<div class="share-author">'+escape(api.state().profile||'我的笔记')+'</div><div class="share-date">'+year+'.'+month+'.'+day+' / '+api.state().memos.filter(n=>!n.deleted).length+' MEMOS</div>':''}${settings.brand?'<div class="share-footer-brand">Fomo</div>':''}</footer>`;
  if(!settings.tags){
    const tagParagraphs=new Set();
    root.querySelectorAll('.tag-link').forEach(tag=>{const paragraph=tag.closest('p');if(paragraph)tagParagraphs.add(paragraph);tag.remove();});
    for(const paragraph of tagParagraphs)if(!paragraph.textContent.trim()&&!paragraph.querySelector('img,audio,video,a,code'))paragraph.remove();
  }
  if(!settings.brand)root.querySelector('.share-card-header').remove();
  root.querySelectorAll('button,a').forEach(el=>{el.removeAttribute('tabindex');el.style.pointerEvents='none';});
  for(const src of m.images||[]){const image=document.createElement('img');image.alt='';image.src=src;root.querySelector('.share-card-images').append(image);}
  if(['bloom','gold','old'].includes(template.layout)){const footer=root.querySelector('.share-card-footer'),header=root.querySelector('.share-card-header');if(settings.personal&&header){const info=document.createElement('div');info.className='share-heading-info';info.textContent=api.state().profile||'我的笔记';header.prepend(info);}if(header){header.querySelector('.share-symbols')?.remove();const date=document.createElement('span');date.className='share-heading-date';date.textContent=year+'-'+month+'-'+day;header.append(date);}if(template.layout==='bloom'){const ornament=document.createElement('span');ornament.className='share-flower';ornament.setAttribute('aria-hidden','true');root.append(ornament);}}
  if(template.layout==='light')root.querySelector('.share-card-date').innerHTML='<span>'+day+'</span><small>'+year+'.'+month+'</small>';
  if(template.layout==='gold'&&root.querySelector('.share-card-header'))root.querySelector('.share-card-header').prepend(root.querySelector('.share-quote'));
  if(['daily','ticket','journal'].includes(template.layout)){
    const header=root.querySelector('.share-card-header'),footer=root.querySelector('.share-card-footer'),date=root.querySelector('.share-card-date');
    const memos=api.state().memos.filter(note=>!note.deleted),count=memos.length,profile=escape(api.state().profile||'我的笔记');
    if(template.layout==='daily'){
      if(header)header.remove();
      if(settings.personal){const bar=document.createElement('div');bar.className='share-daily-user';bar.innerHTML='<span>'+profile+'</span><span>'+count+' MEMOS</span>';root.prepend(bar);}
      date.innerHTML='<span>'+day+'</span><small>'+month+'月 · '+['星期日','星期一','星期二','星期三','星期四','星期五','星期六'][new Date(m.created).getDay()]+'</small><small>'+year+'</small>';
      footer.innerHTML=settings.brand?'<span>Fomo</span><span>记录想法</span>':'';
    }
    if(template.layout==='ticket'){
      if(header){header.innerHTML='<span>·</span><b>Fomo</b><span>·</span>';}
      footer.innerHTML=(settings.personal?'<div class="share-ticket-row"><span>记录者</span><b>'+profile+'</b></div><div class="share-ticket-row"><span>记录日期</span><b>'+year+'.'+month+'.'+day+'</b></div><div class="share-ticket-row"><span>累计笔记</span><b>'+count+'</b></div>':'')+'<div class="share-ticket-code" aria-hidden="true"></div>';
    }
    if(template.layout==='journal'){
      if(header)header.remove();
      const chapter=[...memos].sort((a,b)=>new Date(a.created)-new Date(b.created)).findIndex(note=>note.id===m.id)+1;
      date.innerHTML='<span>'+month+' / '+day+'</span><small>Captured in Words</small>'+(settings.personal?'<small>Chapter.'+chapter+'</small>':'');
      footer.innerHTML=settings.personal?'<span class="share-journal-line"></span><span>Written by '+profile+'</span><span class="share-journal-line"></span>':'';
      if(settings.brand){const brand=document.createElement('div');brand.className='share-journal-brand';brand.textContent='Fomo';footer.append(brand);}
    }
  }
  applyBasicShareLayout(root,m,template,settings,api,escape,icon);
  const host=document.createElement('div');host.className='share-render-host';host.setAttribute('aria-hidden','true');host.inert=true;host.append(root);document.body.append(host);
  try{
    await document.fonts.ready;await Promise.all([...root.querySelectorAll('img')].map(imageReady));
    const origin=root.getBoundingClientRect(),scale=thumbnail?.5:2,width=Math.ceil(origin.width),height=Math.ceil(origin.height);
    if(height>14000||width*height*4>24000000)throw Error('笔记过长，无法生成完整图片，请分段分享');
    const canvas=document.createElement('canvas');canvas.width=width*scale;canvas.height=height*scale;const context=canvas.getContext('2d');if(!context)throw Error('当前环境无法生成图片');context.scale(scale,scale);context.fillStyle=template.paper;context.fillRect(0,0,width,height);
    for(const element of [root,...root.querySelectorAll('*')]){
      const style=getComputedStyle(element);if(style.display==='none')continue;const rect=element.getBoundingClientRect();fillRect(context,rect,origin,style.backgroundColor,parseFloat(style.borderTopLeftRadius)||0);
      if(element===root)drawPaper(context,width,height,template.layout);
      for(const side of ['Top','Right','Bottom','Left'])drawBorder(context,rect,origin,side,style);
      if(element.classList.contains('share-flower'))drawFlower(context,rect,origin);
      if(element.classList.contains('share-ticket-code'))drawTicket(context,rect,origin);
      if(element.tagName==='IMG'&&element.complete&&element.naturalWidth){context.save();const radius=parseFloat(style.borderTopLeftRadius)||0;if(radius){context.beginPath();context.roundRect(rect.left-origin.left,rect.top-origin.top,rect.width,rect.height,radius);context.clip();}context.drawImage(element,rect.left-origin.left,rect.top-origin.top,rect.width,rect.height);context.restore();}
      if(element.tagName==='svg'||element instanceof SVGElement)continue;
      if(element.tagName==='LI'){
        const list=element.parentElement,items=[...list.children].filter(item=>item.tagName==='LI'),position=items.indexOf(element),reversed=list.hasAttribute('reversed');
        let index=Number(list.getAttribute('start')??(reversed?items.length:1));
        for(let i=0;i<=position;i++){if(items[i].hasAttribute('value'))index=Number(items[i].getAttribute('value'));if(i<position)index+=reversed?-1:1;}
        const type=getComputedStyle(list).listStyleType,marker=list.tagName==='OL'?index+'.':type==='circle'?'◦':type==='square'?'▪':type==='none'?'':'•';
        const first=document.createTreeWalker(element,NodeFilter.SHOW_TEXT).nextNode();let line=rect;if(first?.textContent){const range=document.createRange();range.setStart(first,0);range.setEnd(first,Math.min(1,first.length));const measured=range.getBoundingClientRect();if(measured.height)line=measured;}
        context.save();context.font=style.font;context.fillStyle=style.color;context.textBaseline='middle';context.textAlign='right';context.fillText(marker,rect.left-origin.left-6,line.top-origin.top+line.height/2+parseFloat(style.fontSize)*.04);context.restore();
      }
    }
    for(const svg of root.querySelectorAll('svg')){if(!svg.getClientRects().length)continue;const rect=svg.getBoundingClientRect();if(!rect.width||!rect.height)continue;const clone=svg.cloneNode(true);clone.setAttribute('xmlns','http://www.w3.org/2000/svg');clone.setAttribute('width',String(rect.width));clone.setAttribute('height',String(rect.height));const markup=new XMLSerializer().serializeToString(clone).replaceAll('currentColor',getComputedStyle(svg).color);const image=new Image();image.src='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(markup);await imageReady(image);if(svg.closest('.share-excerpt-quote-end')){context.save();context.translate(rect.left-origin.left+rect.width/2,rect.top-origin.top+rect.height/2);context.rotate(Math.PI);context.drawImage(image,-rect.width/2,-rect.height/2,rect.width,rect.height);context.restore();}else context.drawImage(image,rect.left-origin.left,rect.top-origin.top,rect.width,rect.height);}
    const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),segmenter=new Intl.Segmenter('zh',{granularity:'grapheme'});let node;
    while((node=walker.nextNode())){if(!node.textContent||node.parentElement.closest('svg'))continue;const style=getComputedStyle(node.parentElement);if(style.display==='none'||!node.parentElement.getClientRects().length)continue;const fontSize=parseFloat(style.fontSize);context.font=`${style.fontStyle} ${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;context.fillStyle=style.color;context.textBaseline='middle';
      for(const part of segmenter.segment(node.textContent)){if(part.segment==='\n')continue;const range=document.createRange();range.setStart(node,part.index);range.setEnd(node,part.index+part.segment.length);const rect=range.getBoundingClientRect();if(!rect.width||!rect.height)continue;context.fillText(part.segment,rect.left-origin.left,rect.top-origin.top+rect.height/2+fontSize*.04);if(style.textDecorationLine.includes('underline')||node.parentElement.closest('u'))context.fillRect(rect.left-origin.left,rect.bottom-origin.top-1,rect.width,1);}
    }
    if(template.layout==='ticket')cutTicketEdges(context,width,height);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));if(!blob)throw Error('图片生成失败，请重试');return {blob,url:URL.createObjectURL(blob),width:canvas.width,height:canvas.height};
  }finally{host.remove();}
}

export function openShareImage(m,api,{onClose}={}){
  const settings=options();let selected='memo',revision=0,epoch=0,current=null,closed=false,working=false,thumbTask=0;const cache=new Map(),thumbnailCache=new Map(),urls=new Set();
  api.modal('生成分享图片',`<section class="share-sheet"><div class="share-hint"><span>请右键点击图片保存或复制</span><div><button id="shareSave" type="button" disabled title="保存图片" aria-label="保存图片">${icon('download')}</button><button id="shareCopy" type="button" disabled title="复制图片" aria-label="复制图片">${icon('copy')}</button></div></div><div class="share-preview-stage" aria-busy="true"><p id="shareImageStatus" role="status">图片生成中…</p><img id="sharePreview" alt="笔记分享图片预览" hidden></div><div class="share-template-strip" role="tablist" aria-label="分享图片模板">${templates.map(t=>`<button class="share-template" data-share-template="${t.id}" type="button" role="tab" aria-selected="${t.id===selected}" aria-label="${t.name}模板" tabindex="${t.id===selected?0:-1}"><span class="share-template-preview" aria-busy="true"><img alt="" hidden></span><span>${t.name}</span></button>`).join('')}</div><div id="shareSettingsPanel" class="share-settings-panel" hidden><label>显示个人相关信息<input id="sharePersonal" type="checkbox" role="switch" ${settings.personal?'checked':''}></label><label>显示 Fomo 标志<input id="shareBrand" type="checkbox" role="switch" ${settings.brand?'checked':''}></label><label>显示笔记中的标签<input id="shareTags" type="checkbox" role="switch" ${settings.tags?'checked':''}></label><label>文字大小<select id="shareFont">${Array.from({length:7},(_,i)=>14+i).map(size=>`<option value="${size}" ${size===settings.fontSize?'selected':''}>${size}</option>`).join('')}</select></label></div><div id="shareContextMenu" class="share-context-menu" role="menu" hidden><button type="button" role="menuitem" id="shareContextSave">保存图片</button><button type="button" role="menuitem" id="shareContextCopy">复制图片</button></div></section>`);
  const dialog=$('#dialog'),sheet=$('.share-sheet'),stage=$('.share-preview-stage'),preview=$('#sharePreview'),status=$('#shareImageStatus'),save=$('#shareSave'),copy=$('#shareCopy');
  const gear=document.createElement('button');gear.id='shareSettings';gear.type='button';gear.title='分享图片设置';gear.setAttribute('aria-label','分享图片设置');gear.setAttribute('aria-expanded','false');gear.setAttribute('aria-controls','shareSettingsPanel');gear.innerHTML=icon('settings');dialog.querySelector('.dialog-header').append(gear);
  function cleanup(){if(closed)return;closed=true;revision++;for(const url of urls)URL.revokeObjectURL(url);gear.remove();observer.disconnect();dialog.removeEventListener('close',cleanup);document.removeEventListener('pointerdown',outside);document.removeEventListener('keydown',escapeMenus,true);if(!dialog.open&&onClose)requestAnimationFrame(()=>{if(!dialog.open)onClose();});}
  const observer=new MutationObserver(()=>{if(!sheet.isConnected)cleanup();});observer.observe($('#dialogBody'),{childList:true});dialog.addEventListener('close',cleanup);
  function outside(event){if(!sheet.contains(event.target)&&event.target!==gear&&!gear.contains(event.target))hideMenus();else if(!event.target.closest('#shareContextMenu,#sharePreview'))$('#shareContextMenu').hidden=true;}
  function hideMenus(){$('#shareSettingsPanel').hidden=true;gear.setAttribute('aria-expanded','false');$('#shareContextMenu').hidden=true;}
  function escapeMenus(event){if(event.key!=='Escape')return;if(!$('#shareSettingsPanel').hidden||!$('#shareContextMenu').hidden){event.preventDefault();event.stopImmediatePropagation();hideMenus();gear.focus();}}
  document.addEventListener('pointerdown',outside);document.addEventListener('keydown',escapeMenus,true);
  gear.onclick=()=>{const panel=$('#shareSettingsPanel');panel.hidden=!panel.hidden;gear.setAttribute('aria-expanded',String(!panel.hidden));$('#shareContextMenu').hidden=true;};
  function invalidate(){preview.hidden=true;epoch++;thumbTask++;cache.clear();thumbnailCache.clear();for(const url of urls)URL.revokeObjectURL(url);urls.clear();for(const image of sheet.querySelectorAll('.share-template img')){image.hidden=true;image.removeAttribute('src');image.parentElement.setAttribute('aria-busy','true');}}
  async function imageFor(template,thumbnail=false){
    const entries=thumbnail?thumbnailCache:cache,key=template.id,generation=epoch;
    if(entries.has(key)){const value=entries.get(key);entries.delete(key);entries.set(key,value);return value;}
    const source=thumbnail?{...m,content:[...new Intl.Segmenter('zh',{granularity:'grapheme'}).segment(m.content.slice(0,1024))].slice(0,180).map(part=>part.segment).join(''),html:'',images:[]}:m;
    const promise=renderImage(source,api,template,{...settings},thumbnail).then(result=>{if(closed||generation!==epoch)URL.revokeObjectURL(result.url);else urls.add(result.url);return result;});entries.set(key,promise);
    promise.catch(()=>{if(entries.get(key)===promise)entries.delete(key);});
    if(!thumbnail&&entries.size>3){const oldest=entries.keys().next().value,old=entries.get(oldest);entries.delete(oldest);old.then(result=>{if(result!==current){URL.revokeObjectURL(result.url);urls.delete(result.url);}}).catch(()=>{});}
    return promise;
  }
  const yieldToInput=()=>new Promise(resolve=>setTimeout(resolve,24));
  async function thumbnails(){
    const task=++thumbTask,generation=epoch;
    for(const template of [templates.find(item=>item.id===selected),...templates.filter(item=>item.id!==selected)]){
      await yieldToInput();if(closed||task!==thumbTask||generation!==epoch)return;
      const thumb=sheet.querySelector('[data-share-template="'+template.id+'"] img');if(!thumb.hidden)continue;
      try{const result=await imageFor(template,true);if(closed||task!==thumbTask||generation!==epoch)return;thumb.src=result.url;thumb.hidden=false;thumb.parentElement.setAttribute('aria-busy','false');}
      catch{if(closed||task!==thumbTask)return;thumb.parentElement.setAttribute('aria-busy','false');}
    }
  }
  async function draw(){
    const token=++revision;current=null;save.disabled=copy.disabled=true;preview.style.opacity='.45';stage.setAttribute('aria-busy','true');status.textContent='图片生成中…';
    try{
      const result=await imageFor(templates.find(t=>t.id===selected));if(closed||token!==revision)return;
      current=result;preview.src=result.url;preview.dataset.template=selected;preview.hidden=false;preview.style.opacity='';stage.scrollTop=0;status.textContent='';save.disabled=copy.disabled=working;stage.setAttribute('aria-busy','false');
      thumbnails();
    }catch(error){if(!closed&&token===revision){preview.hidden=true;stage.setAttribute('aria-busy','false');status.textContent=error.message;const retry=document.createElement('button');retry.id='shareRetry';retry.textContent='重新生成';retry.onclick=draw;status.append(retry);}}
  }
  const choose=id=>{if(selected===id&&current)return;selected=id;hideMenus();for(const button of sheet.querySelectorAll('[data-share-template]')){const active=button.dataset.shareTemplate===id;button.setAttribute('aria-selected',String(active));button.tabIndex=active?0:-1;}sheet.querySelector(`[data-share-template="${id}"]`).scrollIntoView({block:'nearest',inline:'nearest'});draw();};
  sheet.querySelectorAll('[data-share-template]').forEach(button=>button.onclick=()=>choose(button.dataset.shareTemplate));
  $('.share-template-strip').onkeydown=event=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(event.key))return;event.preventDefault();const index=templates.findIndex(t=>t.id===selected),next=event.key==='Home'?0:event.key==='End'?templates.length-1:(index+(event.key==='ArrowRight'?1:-1)+templates.length)%templates.length;choose(templates[next].id);sheet.querySelector(`[data-share-template="${selected}"]`).focus();};
  for(const [id,key]of [['sharePersonal','personal'],['shareBrand','brand'],['shareTags','tags'],['shareFont','fontSize']])$('#'+id).onchange=event=>{settings[key]=key==='fontSize'?Number(event.target.value):event.target.checked;invalidate();try{localStorage.setItem(storageKey,JSON.stringify(settings));}catch{}draw();};
  async function exportImage(kind){if(!current||working)return;working=true;const image=current;save.disabled=copy.disabled=true;$('#shareContextMenu').hidden=true;try{if(window.memoDesktop?.shareImage){const data=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(reader.result);reader.onerror=reject;reader.readAsDataURL(image.blob);});const result=await window.memoDesktop.shareImage({kind,data});if(result)api.toast(kind==='copy'?'分享图片已复制':'分享图片已保存');}else if(kind==='copy'){if(!navigator.clipboard?.write||!window.ClipboardItem)throw Error('当前环境不支持复制图片，请保存图片');await navigator.clipboard.write([new ClipboardItem({'image/png':image.blob})]);api.toast('分享图片已复制');}else{const link=document.createElement('a');link.href=image.url;link.download='fomo-share-'+m.created.slice(0,10)+'.png';document.body.append(link);link.click();link.remove();api.toast('已开始下载分享图片');}}catch(error){api.toast('操作未完成：'+error.message);}finally{working=false;if(!closed){save.disabled=copy.disabled=!current;}}}
  save.onclick=()=>exportImage('save');copy.onclick=()=>exportImage('copy');$('#shareContextSave').onclick=save.onclick;$('#shareContextCopy').onclick=copy.onclick;
  preview.oncontextmenu=event=>{event.preventDefault();if(!current)return;hideMenus();const menu=$('#shareContextMenu');menu.hidden=false;const r=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(innerWidth-r.width-8,event.clientX))+'px';menu.style.top=Math.max(8,Math.min(innerHeight-r.height-8,event.clientY))+'px';menu.querySelector('button').focus();};
  requestAnimationFrame(()=>{sheet.querySelector('[aria-selected=true]').scrollIntoView({block:'nearest',inline:'center'});});draw();
}
