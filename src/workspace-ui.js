import {relationGroups} from './note-relations.js';
import {applyDisplayPreferences,sourceLabel,referenceGroup} from './display-preferences.js';
import {createFeedback} from './feedback.js';
import {openShareImage} from './share-image.js';
import {menuEditedDate} from './note-metadata.js';
import {installMediaFeedback} from './media-feedback.js';
installMediaFeedback();
window.MemoFeedback=createFeedback(document.getElementById('toast'));
window.MemoDisplay={apply:applyDisplayPreferences};
(() => {
  'use strict';
  const $=selector=>document.querySelector(selector),esc=value=>MemoMarkup.escape(value),icon=name=>window.memoIcons[name]||window.memoIcons.notes;
  const menuGlyph=name=>icon(name==='delete'?'trash':name==='edit'?'menuEdit':name).replace('class="bi ','class="menu-svg bi ');

  let api,selecting=false,context='',selected=new Set(),relatedExpanded=new Set(),lastReferenceCollapse=null,selectionAnchor='';
  const date=value=>new Date(value).toLocaleString('zh-CN');
  const cardDate=value=>{const d=new Date(value),pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;};
  const note=id=>MemoCore.resolveRef(api.state().memos,id);
  const title=m=>m.content.trim().replace(/\s+/g,' ').slice(0,140)||'图片笔记';
  const selectedRows=()=>api.filtered().filter(m=>selected.has(m.id));
  const memoCopyText=m=>String(m.content||'').replace(/(?:fomo|writeboom|memo-flow):\/\/note\/([a-zA-Z0-9-]{1,100})/g,(_,id)=>'fomo://note/'+id);
  const memoCopyHTML=m=>{const holder=document.createElement('div');holder.innerHTML=MemoMarkup.clean(m.html||MemoMarkup.plainHTML(m.content||''));holder.querySelectorAll('a[data-memo-id]').forEach(link=>link.replaceWith(document.createTextNode('fomo://note/'+link.dataset.memoId)));return holder.innerHTML;};
  async function copyValue(text,html){try{if(html&&navigator.clipboard.write&&window.ClipboardItem)await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([text],{type:'text/plain'}),'text/html':new Blob([html],{type:'text/html'})})]);else await navigator.clipboard.writeText(text);api.toast('已复制');}catch{api.modal('复制内容','<textarea id="noteCopyValue" readonly rows="8"></textarea><p>请选择文字并复制。</p>');$('#noteCopyValue').value=text;$('#noteCopyValue').select();}}
  function copyReference(m){const id=esc(m.id),label=esc(window.MemoEditor.referenceLabel(m));return copyValue('fomo://note/'+m.id,`<a href="fomo://note/${id}" data-memo-id="${id}">↗ ${label}</a>`);}
  function toggleMore(menu,open,preferRight=false){const sub=menu.querySelector('.memo-more-menu'),trigger=menu.querySelector('[data-action=more]');if(!sub)return;sub.hidden=!open;trigger.setAttribute('aria-expanded',String(open));if(open){const r=trigger.getBoundingClientRect(),s=sub.getBoundingClientRect();const anchor=preferRight?menu.getBoundingClientRect():r,right=anchor.right+1,left=anchor.left-s.width-1,preferred=preferRight?(right+s.width<=innerWidth-8?right:left):(left>=8?left:right);sub.style.left=Math.max(8,Math.min(innerWidth-s.width-8,preferred))+'px';sub.style.top=Math.max(8,Math.min(innerHeight-s.height-8,r.top))+'px';}}
  const FLOAT_KEY='writeboom-float-notes',FLOAT_POS_KEY='writeboom-float-dock-y';let floatIds=[];try{const value=JSON.parse(localStorage.getItem(FLOAT_KEY)||'[]');if(Array.isArray(value))floatIds=[...new Set(value.filter(id=>typeof id==='string'))];}catch{}let floatDockY=null;try{const value=Number(localStorage.getItem(FLOAT_POS_KEY));if(Number.isFinite(value))floatDockY=value;}catch{}
  let floatDock=null,floatOverlay=null,floatCards=null,floatCount=null,floatStatus=null,floatOpen=false,floatUndo=[],floatUndoTimer=0;
  function saveFloat(){try{localStorage.setItem(FLOAT_KEY,JSON.stringify(floatIds));}catch{}}
  function dockY(value){return Math.max(8,Math.min(innerHeight-64,value));}
  function positionFloatDock(){if(!floatDock)return;const y=dockY(floatDockY==null?innerHeight/2-26:floatDockY);floatDock.style.top=y+'px';}
  function floatUndoButton(){return floatOverlay?floatOverlay.querySelector('#floatUndo'):null;}
  function showFloatUndo(){const b=floatUndoButton();if(!b)return;b.hidden=false;clearTimeout(floatUndoTimer);floatUndoTimer=setTimeout(()=>{b.hidden=true;if(!floatIds.length)closeFloat();},6000);}
  function hideFloatUndo(){const b=floatUndoButton();if(b)b.hidden=true;clearTimeout(floatUndoTimer);}
  function ensureFloat(){
    if(floatDock)return;
    floatDock=document.createElement('div');floatDock.className='float-dock';floatDock.innerHTML='<button type="button" aria-label="展开浮窗" title="展开浮窗"><i></i><i></i><i></i></button>';
    floatOverlay=document.createElement('div');floatOverlay.className='float-overlay';
    floatOverlay.innerHTML='<section class="float-panel" role="dialog" aria-label="浮窗笔记"><header class="float-head"><strong id="floatCount"></strong><nav><button type="button" id="floatUndo" hidden>撤销</button><button type="button" id="floatCopy">复制全部</button><button type="button" id="floatClear">清空</button></nav></header><div class="float-cards" id="floatCards"></div><p class="float-status" id="floatStatus" role="status"></p></section>';
    document.body.append(floatDock,floatOverlay);
    floatCards=floatOverlay.querySelector('#floatCards');floatCount=floatOverlay.querySelector('#floatCount');floatStatus=floatOverlay.querySelector('#floatStatus');
    const dockButton=floatDock.querySelector('button');let dockDrag=null,dockMoved=false;
    dockButton.addEventListener('mousedown',event=>{if(event.button!==0)return;dockDrag={y:event.clientY,start:floatDock.getBoundingClientRect().top};dockMoved=false;event.preventDefault();});
    document.addEventListener('mousemove',event=>{if(!dockDrag)return;const y=dockY(dockDrag.start+event.clientY-dockDrag.y);floatDockY=y;floatDock.style.top=y+'px';if(Math.abs(event.clientY-dockDrag.y)>4)dockMoved=true;});
    document.addEventListener('mouseup',()=>{if(!dockDrag)return;dockDrag=null;floatDockY=dockY(parseFloat(floatDock.style.top)||innerHeight/2-26);try{localStorage.setItem(FLOAT_POS_KEY,String(floatDockY));}catch{}if(!dockMoved){floatOpen=true;renderFloat();}dockMoved=false;});
    floatOverlay.addEventListener('wheel',event=>{if(!floatOpen||!event.target.closest('.float-cards'))return;event.preventDefault();if(floatCards.scrollHeight>floatCards.clientHeight+1)floatCards.scrollTop+=event.deltaY;},{passive:false});
    floatOverlay.addEventListener('mousedown',event=>{if(event.target===floatOverlay)closeFloat();});
    floatOverlay.querySelector('#floatCopy').onclick=()=>copyValue(floatIds.map(id=>note(id)?.content||'').filter(Boolean).join('\n\n---\n\n'));
    floatOverlay.querySelector('#floatUndo').onclick=()=>{if(!floatUndo.length)return;floatIds=floatUndo.slice();floatUndo=[];hideFloatUndo();saveFloat();floatOpen=true;renderFloat();api.toast('撤销成功');};
    floatOverlay.querySelector('#floatClear').onclick=()=>{const count=floatIds.length;if(!count)return;floatUndo=floatIds.slice();floatIds=[];saveFloat();floatOpen=true;renderFloat();showFloatUndo();api.toast('已清空浮窗中的 '+count+' 条笔记');};
  }
  function closeFloat(){floatOpen=false;renderFloat();}
  function renderFloat(){
    ensureFloat();floatIds=floatIds.filter(id=>{const m=note(id);return m&&!m.deleted;});saveFloat();
    const open=floatOpen&&(floatIds.length>0||floatUndo.length>0);
    floatDock.classList.toggle('show',!open&&floatIds.length>0);floatOverlay.classList.toggle('show',open);positionFloatDock();
    floatCount.textContent=floatIds.length+'条笔记';floatCards.replaceChildren();
    for(const id of floatIds){const m=note(id);if(!m)continue;const text=String(m.content||'').replace(/\s+/g,' ').trim()||'图片笔记',preview=esc(text).replace(/(^|\s)(#[^\s#]+)/g,'$1<span class="tag">$2</span>');const card=document.createElement('article');card.className='float-card';card.dataset.floatId=id;card.innerHTML=`<span class="text">${preview}</span><button type="button" class="remove" aria-label="移出浮窗" title="移出浮窗">×</button>`;card.onclick=()=>{closeFloat();openDetail(id);};card.querySelector('.remove').onclick=e=>{e.stopPropagation();floatIds=floatIds.filter(x=>x!==id);saveFloat();renderFloat();};floatCards.append(card);}
    if(!floatIds.length){const p=document.createElement('p');p.className='float-empty';p.textContent='浮窗里还没有笔记';floatCards.append(p);}
  }
  function addFloat(id){if(!note(id))return;api.closeMenu?.();floatUndo=[];hideFloatUndo();if(!floatIds.includes(id)){if(floatIds.length>=7){api.toast('浮窗内笔记已满，最多支持 7 条笔记，整理一下再添加吧');return;}floatIds.push(id);}saveFloat();floatOpen=true;renderFloat();}
  window.addEventListener('resize',()=>positionFloatDock());
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&floatOpen)closeFloat();});
  function buildNoteMenu(menu,m){
    menu.replaceChildren();menu.dataset.refined='true';
    const add=(root,action,label,glyph)=>{const b=document.createElement('button');b.type='button';b.dataset.action=action;b.innerHTML=(glyph?menuGlyph(glyph):'')+`<span>${label}</span>`;root.append(b);return b;};
    if(!m.deleted){
      add(menu,'share','分享','share');
      add(menu,'edit','编辑','edit');add(menu,'copy','复制','copy');menu.append(document.createElement('hr'));
      if(window.memoDesktop)add(menu,'window','新窗口打开');
      add(menu,'pin',m.pinned?'取消置顶':'置顶');
      if(window.memoDesktop)add(menu,'float','加入浮窗');
      add(menu,'insight','AI 洞察');
      add(menu,'related','相关笔记');add(menu,'copy-link','复制链接');add(menu,'annotate','批注');
    }else add(menu,'restore','恢复笔记','refresh');
    const more=add(menu,'more','更多');more.setAttribute('aria-haspopup','menu');more.setAttribute('aria-expanded','false');more.insertAdjacentHTML('beforeend',icon('next').replace('class="bi ','class="more-chevron bi '));
    const sub=document.createElement('div');sub.className='memo-more-menu';sub.setAttribute('role','menu');sub.setAttribute('aria-label','更多笔记操作');sub.hidden=true;
    add(sub,'history','历史版本');if(!m.deleted)add(sub,'change-date','修改日期');menu.append(sub);
    more.onpointerenter=()=>toggleMore(menu,true);
    if(!m.deleted)add(menu,'delete','删除').className='danger';else add(menu,'purge','永久删除').className='danger';
    const meta=document.createElement('div');meta.className='menu-meta';
    const count=document.createElement('span');count.textContent=`字数统计: ${api.wordCount(m)}`;
    const edited=document.createElement('span'),stamp=m.updated||m.created;
    edited.textContent=`编辑于 ${menuEditedDate(stamp)}`;edited.title=cardDate(stamp);
    meta.append(count,edited);menu.append(meta);for(const b of menu.querySelectorAll(':scope>button'))if(b!==more)b.onpointerenter=()=>toggleMore(menu,false);
  }


  const shortDate=value=>{const d=new Date(value),pad=n=>String(n).padStart(2,'0');return `${d.getMonth()+1}月${d.getDate()}日 ${pad(d.getHours())}:${pad(d.getMinutes())}`;};
  const tokenText=text=>String(text).replace(/(?:fomo|writeboom|memo-flow):\/\/note\/[a-zA-Z0-9-]+|https?:\/\/[^/\s]+\/mine\/\?[^\s<>]*memo_id=[a-zA-Z0-9_-]+/g,'关联笔记');
  function row(m,{label='',open=openDetail}={}){
    const b=document.createElement('button');b.className='related-choice';b.type='button';
    const tags=MemoCore.tagsOf(m.content).slice(0,3).map(tag=>'#'+tag).join(' '),meta=m.missing?(label||'引用暂不可用'):[label||shortDate(m.created),tags,m.deleted?'在回收站中':''].filter(Boolean).join(' · ');
    const small=document.createElement('small');small.textContent=meta||'';
    const text=document.createElement('span');text.textContent=tokenText(title(m));b.append(small,text);b.disabled=!!m.missing;b.onclick=()=>open(m.id);return b;
  }
  function emptyNote(root,text){const p=document.createElement('p');p.className='detail-empty';p.textContent=text;root.append(p);}
  let detailEditSession=null;
  function startDetailEditing(m){
    if(detailEditSession){api.toast('请先保存或取消当前编辑');return false;}
    const section=$('#dialog .note-detail'),card=section?.dataset.detailId===m.id?section.querySelector('.detail-current-card'):section?.querySelector(`[data-relation-id="${CSS.escape(m.id)}"]`);if(!card)return false;
    const saved=captureDetail(),slot=document.createElement('div');slot.id='detailEditSlot';slot.dataset.editSlot=m.id;card.append(slot);
    if(!api.edit(m)){slot.remove();return false;}
    detailEditSession=saved;api.render();
    for(const child of card.children)if(child!==slot&&!child.matches('.detail-card-head,.relation-card-head'))child.hidden=true;
    section.querySelectorAll('button').forEach(button=>{if(!button.closest('#composer'))button.disabled=true;});
    $('#editor').focus({preventScroll:true});return true;
  }
  function finishDetailEdit(){if(!detailEditSession)return;const saved=detailEditSession;detailEditSession=null;openDetail(saved.id,saved.tab,true,saved);}
  function shareFromDetail(m){const saved=captureDetail();if(!saved){openShareImage(m,api);return;}saved.returnContext={origin:detailOrigin,trail:[...detailTrail]};detailOrigin=null;detailTrail.length=0;openShareImage(m,api,{onClose:()=>openDetail(saved.id,saved.tab,true,saved)});}
  function openDatePicker(m,anchor){
    if(!m||m.deleted||api.busy())return;
    document.getElementById('detailDatePicker')?.remove();
    const section=$('#dialog[open] .note-detail'),detail=!!section&&section.dataset.detailId===m.id;
    const pad=n=>String(n).padStart(2,'0');
    const keyOf=value=>{const d=new Date(value);return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;};
    const initial=new Date(m.created),base=Number.isFinite(initial.getTime())?initial:new Date();
    let selected=new Date(base.getFullYear(),base.getMonth(),base.getDate());
    let month=new Date(selected.getFullYear(),selected.getMonth(),1);
    let timeValue=`${pad(base.getHours())}:${pad(base.getMinutes())}`;
    const picker=document.createElement('section');
    picker.id='detailDatePicker';picker.className='detail-date-picker';picker.setAttribute('popover','auto');picker.setAttribute('role','dialog');picker.setAttribute('aria-label','修改笔记日期');
    document.body.append(picker);
    const close=(focus=true)=>{if(picker.matches(':popover-open'))picker.hidePopover();picker.remove();if(focus&&anchor?.isConnected)anchor.focus({preventScroll:true});};
    picker.addEventListener('toggle',()=>{if(!picker.matches(':popover-open'))picker.remove();});
    picker.addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();close();}});
    const draw=()=>{
      const year=month.getFullYear(),monthIndex=month.getMonth(),first=new Date(year,monthIndex,1),offset=first.getDay(),days=new Date(year,monthIndex+1,0).getDate(),today=keyOf(new Date()),selectedKey=keyOf(selected);
      let cells='';
      for(let i=0;i<42;i++){
        const day=i-offset+1,date=new Date(year,monthIndex,day),key=keyOf(date),outside=date.getMonth()!==monthIndex,isSelected=key===selectedKey,isToday=key===today;
        cells+=`<button type="button" class="detail-date-day${outside?' other':''}${isSelected?' selected':''}${isToday?' today':''}" data-detail-date="${key}" aria-label="${key}" aria-pressed="${isSelected}" ${outside?'tabindex="-1"':''}>${date.getDate()}</button>`;
      }
      picker.innerHTML=`<header class="detail-date-head"><div><strong>修改日期</strong><span>${year}年 ${monthIndex+1}月</span></div><div class="detail-date-nav"><button type="button" data-detail-date-nav="-1" aria-label="上个月">‹</button><button type="button" data-detail-date-nav="1" aria-label="下个月">›</button></div></header><div class="detail-date-week">${['日','一','二','三','四','五','六'].map(day=>`<span>${day}</span>`).join('')}</div><div class="detail-date-grid" role="grid" aria-label="${year}年 ${monthIndex+1}月">${cells}</div><label class="detail-date-time"><span>时间</span><input id="detailDateTime" type="time" value="${timeValue}" step="60" aria-label="笔记时间"></label><p class="detail-date-status" id="detailDateStatus" role="status"></p><footer class="detail-date-actions"><button type="button" id="detailDateCancel">取消</button><button type="button" id="detailDateSave" class="primary-button">保存</button></footer>`;
      picker.querySelectorAll('[data-detail-date-nav]').forEach(button=>button.onclick=()=>{month.setMonth(month.getMonth()+Number(button.dataset.detailDateNav));draw();});
      picker.querySelectorAll('[data-detail-date]').forEach(button=>button.onclick=()=>{const [y,mo,da]=button.dataset.detailDate.split('-').map(Number);selected=new Date(y,mo-1,da);month=new Date(y,mo-1,1);draw();requestAnimationFrame(()=>picker.querySelector('.detail-date-day.selected')?.focus({preventScroll:true}));});
      $('#detailDateTime').oninput=event=>{timeValue=event.target.value;};$('#detailDateCancel').onclick=()=>close();
      $('#detailDateSave').onclick=async()=>{
        if(api.busy())return;
        const status=$('#detailDateStatus');
        if(!/^\d{2}:\d{2}$/.test(timeValue)){status.textContent='请选择有效时间';return;}
        const [hours,minutes]=timeValue.split(':').map(Number),created=new Date(selected.getFullYear(),selected.getMonth(),selected.getDate(),hours,minutes,0,0);
        if(!Number.isFinite(created.getTime())){status.textContent='请选择有效日期';return;}
        const desired=MemoCore.clone(api.state()),target=desired.memos.find(item=>item.id===m.id);
        if(!target||target.deleted){status.textContent='笔记已移入回收站，请先恢复';return;}
        const saved=captureDetail(),save=$('#detailDateSave'),cancel=$('#detailDateCancel');save.disabled=cancel.disabled=true;status.textContent='正在保存…';
        target.created=created.toISOString();target.updated=new Date().toISOString();
        try{
          if(!await api.commit(desired)){status.textContent='未保存，请重试';return;}
          close(false);
          if(detail){if(saved)openDetail(saved.id,saved.tab,true,saved);else openDetail(m.id,$('#detailTabContent')?.dataset.relationView||'auto');}
          else{api.render();const button=document.querySelector(`#memos [data-id="${CSS.escape(m.id)}"] .memo-menu-button`);button?.focus({preventScroll:true});}
          api.toast('笔记日期已修改');
        }catch(error){status.textContent='保存失败：'+error.message;}
        finally{if(picker.isConnected){save.disabled=false;cancel.disabled=false;}}
      };
    };
    draw();
    picker.showPopover();
    const position=()=>{const rect=anchor?.getBoundingClientRect(),width=picker.offsetWidth||300,height=picker.offsetHeight||360;const left=rect?(rect.left<=12?12:Math.min(innerWidth-width-8,rect.left)):Math.max(8,(innerWidth-width)/2);let top=rect?rect.bottom+6:12;if(top+height>innerHeight-8)top=Math.max(8,(rect?.top||innerHeight)-height-6);picker.style.left=left+'px';picker.style.top=top+'px';};
    position();requestAnimationFrame(()=>{position();picker.querySelector('.detail-date-day.selected')?.focus({preventScroll:true});});
  }
  function openRelationMenu(trigger){
    const m=note(trigger.dataset.relationMenu),section=trigger.closest('.note-detail');if(!m||!section)return;
    let menu=section.querySelector('#relationActions');if(!menu){menu=document.createElement('div');menu.id='relationActions';menu.className='detail-actions-menu relation-actions-menu';menu.setAttribute('role','menu');menu.setAttribute('aria-label','关联笔记操作');menu.setAttribute('popover','auto');section.append(menu);}
    if(menu.matches(':popover-open')&&menu.dataset.relationTarget===m.id){menu.hidePopover();return;}
    section.querySelectorAll('[data-relation-menu][aria-expanded=true]').forEach(button=>button.setAttribute('aria-expanded','false'));
    menu.dataset.relationTarget=m.id;menu.replaceChildren();
    const close=()=>{if(menu.isConnected&&menu.matches(':popover-open'))menu.hidePopover();};
    const add=(action,label,run)=>{const b=document.createElement('button');b.type='button';b.dataset.relationAction=action;b.setAttribute('role','menuitem');b.textContent=label;b.onclick=async()=>{if(api.busy())return;close();try{await run();}catch(error){api.toast(error.message);}};menu.append(b);return b;};
    const refresh=()=>{const saved=captureDetail();if(saved)openDetail(saved.id,saved.tab,true,saved);};
    if(!m.deleted){
      add('edit','编辑',()=>startDetailEditing(m));
      add('pin',m.pinned?'取消置顶':'置顶',async()=>{const desired=MemoCore.clone(api.state()),target=desired.memos.find(item=>item.id===m.id);target.pinned=!target.pinned;if(await api.commit(desired))refresh();});
      add('related','相关笔记',()=>openDetail(m.id));
      menu.append(document.createElement('hr'));
      add('share','生成分享图',()=>shareFromDetail(m));
      add('copy-link','复制链接',()=>copyReference(m));
      add('annotate','批注',()=>api.annotate(m.id));
      add('delete','删除',async()=>{if(api.editingId()===m.id){api.toast('请先保存或取消这条笔记的编辑');return;}const before=MemoCore.clone(api.state());if(await api.commit(MemoCore.batch(before,[m.id],'delete'))){const after=MemoCore.clone(api.state());refresh();api.toast('已移入回收站',async()=>{const result=await api.undo(before,after);if(result!==false)refresh();return result;});}}).className='danger';
    }else add('detail','查看详情',()=>openDetail(m.id));
    const meta=document.createElement('div');meta.className='menu-meta';meta.innerHTML='<span>字数统计: '+api.wordCount(m)+'</span><span>编辑于 '+esc(menuEditedDate(m.updated||m.created))+'</span>';menu.append(meta);
    trigger.setAttribute('aria-controls',menu.id);trigger.setAttribute('aria-expanded','true');menu.ontoggle=()=>{trigger.setAttribute('aria-expanded',String(menu.matches(':popover-open')));};
    menu.showPopover();const anchor=trigger.getBoundingClientRect(),rect=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(innerWidth-rect.width-8,anchor.right-rect.width))+'px';menu.style.top=Math.max(8,Math.min(innerHeight-rect.height-8,anchor.bottom+4))+'px';menu.querySelector('button')?.focus({preventScroll:true});
    menu.onkeydown=e=>{const buttons=[...menu.querySelectorAll('button')],index=buttons.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();buttons[e.key==='Home'?0:e.key==='End'?buttons.length-1:(index+(e.key==='ArrowDown'?1:-1)+buttons.length)%buttons.length]?.focus();}else if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();close();trigger.focus({preventScroll:true});}};
  }
  function appendGroup(root,label,rows){
    if(!rows.length)return;
    root=referenceGroup(root,label+' '+rows.length,label.includes('引用')&&api.state().display.collapseReferences);
    const heading=document.createElement('h3');heading.textContent=label+' '+rows.length;root.append(heading);
    for(const m of rows)root.append(row(m));
  }
  const detailTrail=[];
  let detailOrigin=null;
  const scrollSelectors=['#dialogBody','.detail-primary-scroll','#detailTabContent'];
  const detailScroll=el=>el?.closest('[hidden]')?Number(el.dataset.savedScroll)||0:el?.scrollTop||0;
  function captureDetail(){
    const section=$('#dialog[open] .note-detail');if(!section)return null;
    section.saveTabPosition?.();
    const focus=document.activeElement;
    return {id:section.dataset.detailId,tab:section.dataset.relationView||'similar',hideSharedTags:section.dataset.hideSharedTags==='true',expandedRelations:[...(section.expandedRelations||[])],
      tabPositions:JSON.parse(JSON.stringify(section.tabPositions||{})),
      scroll:scrollSelectors.map(selector=>detailScroll($(selector))),
      bodies:[...section.querySelectorAll('.relation-body')].map(detailScroll),
      folds:[...section.querySelectorAll('.reference-fold')].map(group=>group.open),
      focus:section.contains(focus)?{panel:focus.closest('[role=region]')?.id,id:focus.id,reference:focus.dataset.memoId,relation:focus.dataset.relationOpen,provenance:!!focus.closest('#detailProvenance')}:null};
  }
  function restoreDetail(entry){
    const section=$('#dialog .note-detail');
    const apply=()=>{
      if(!$('#dialog').open||$('#dialog .note-detail')!==section||(section.dataset.relationView||'similar')!==entry.tab)return;
      section.querySelectorAll('.reference-fold').forEach((group,index)=>{group.open=!!entry.folds?.[index];});
      const target=entry.focus,scope=target?.panel?document.getElementById(target.panel):section;
      const focus=target&&(target.id?document.getElementById(target.id):target.provenance?$('#detailProvenance button'):
        target.reference?scope.querySelector(`[data-memo-id="${CSS.escape(target.reference)}"]`):target.relation?scope.querySelector(`[data-relation-open="${CSS.escape(target.relation)}"]`):null);
      if(focus&&!focus.disabled)focus.focus({preventScroll:true});
      scrollSelectors.forEach((selector,index)=>{const el=$(selector);if(el){el.dataset.savedScroll=entry.scroll[index];el.scrollTop=entry.scroll[index];}});
      section.querySelectorAll('.relation-body').forEach((body,index)=>{body.dataset.savedScroll=entry.bodies[index]||0;body.scrollTop=entry.bodies[index]||0;});
    };
    apply();requestAnimationFrame(apply);
  }
  function restoreDetailOrigin(){
    if($('#dialog').open)return;
    if(detailEditSession){detailEditSession=null;api.render();}
    const origin=detailOrigin;detailOrigin=null;detailTrail.length=0;
    if(!origin||origin.context!==api.context()||origin.editing!==api.editingId())return;
    if(origin.resume)origin.resume();else if(origin.focus?.isConnected&&!origin.focus.disabled)origin.focus.focus({preventScroll:true});
    $('#memos').scrollTop=origin.scroll;
    window.scrollTo({left:origin.left,top:origin.top,behavior:'instant'});
  }
  function insightMarkdown(text){
    const lines=esc(String(text||'')).split('\n');let html='',list='';
    const close=()=>{if(list){html+=`</${list}>`;list='';}};
    for(const raw of lines){const line=raw.trim();if(!line){close();continue;}
      const heading=/^(#{1,4})\s+(.*)$/.exec(line);
      if(heading){close();const level=Math.min(5,heading[1].length+1);html+=`<h${level}>${heading[2].replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}</h${level}>`;continue;}
      const bullet=/^[-*]\s+(.*)$/.exec(line);
      if(bullet){if(list!=='ul'){close();list='ul';html+='<ul>';}html+=`<li>${bullet[1].replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}</li>`;continue;}
      const ordered=/^\d+[.)]\s+(.*)$/.exec(line);
      if(ordered){if(list!=='ol'){close();list='ol';html+='<ol>';}html+=`<li>${ordered[1].replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')}</li>`;continue;}
      close();html+=`<p>${line.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/`([^`]+)`/g,'<code>$1</code>')}</p>`;
    }
    close();return html;
  }
  const INSIGHT_HISTORY_KEY='fomo-ai-insight-history';
  function saveInsightHistory(entry){
    try{
      const list=JSON.parse(localStorage.getItem(INSIGHT_HISTORY_KEY)||'[]');
      const record={id:Date.now().toString(36)+Math.random().toString(36).slice(2,6),created:new Date().toISOString(),...entry};
      const next=[record,...list].filter(item=>item&&item.content).slice(0,20);
      localStorage.setItem(INSIGHT_HISTORY_KEY,JSON.stringify(next));
    }catch{}
  }
  function openMemoInsight(m,related=[],options={}){
    if(!m||m.deleted)return;
    if(!window.memoDesktop?.aiComplete){api.toast('AI 洞察仅在桌面版可用');return;}
    const started=Date.now();
    const notes=[m,...related.filter(note=>note&&note.id!==m.id&&!note.deleted)];const title=options.title||(notes.length>1?'相关笔记洞察':'笔记洞察');api.modal(title,`<section class="memo-insight-sheet" data-insight-memo="${esc(m.id)}">
      <div class="insight-execution">
        <div class="step-list insight-steps" id="insightSteps" aria-live="polite">
          <div data-step="collect" class="step-item is_start is-active"><span class="step-dot" aria-hidden="true"></span><div class="step-content"><strong class="step-title">正在收集笔记..</strong></div></div>
          <div data-step="think" class="step-item is_start"><span class="step-dot" aria-hidden="true"></span><div class="step-content"><strong class="step-title">洞察思考中...</strong></div></div>
          <div data-step="report" class="step-item"><span class="step-dot" aria-hidden="true"></span><div class="step-content"><strong class="step-title">生成洞察报告</strong></div></div>
        </div>
        <div id="insightResult" class="insight-result" hidden></div>
        <div id="insightError" class="insight-error" hidden><h3>获取笔记洞察时发生错误</h3><p>换一个笔记试试吧</p><p class="insight-error-detail"></p><button id="insightRetry" type="button">再试一次</button></div>
      </div>
    </section>`);
    const dialog=$('#dialog');dialog.classList.add('memo-insight-dialog');
    let closed=false,activeRequestId='';
    const timers=[];
    const finish=()=>{for(const timer of timers)clearTimeout(timer);dialog.classList.remove('memo-insight-dialog');};
    const onClose=()=>{if(dialog.open)return;dialog.removeEventListener('close',onClose);closed=true;if(activeRequestId)window.memoDesktop.aiCancel?.(activeRequestId);finish();};
    dialog.addEventListener('close',onClose);
    const steps=[...document.querySelectorAll('#insightSteps [data-step]')];
    let activeStep=0;
    const setStep=(index,state)=>{if(state==='active')activeStep=index;steps.forEach((step,i)=>{step.classList.toggle('is-active',i===index&&state==='active');step.classList.toggle('is-complete',i<index||i===index&&state==='complete');step.classList.toggle('is-error',i===index&&state==='error');});};
    setStep(0,'active');
    timers.push(setTimeout(()=>{if(!closed&&activeStep===0)setStep(1,'active');},700));
    const records=notes.map((note,index)=>{const content=String(note.content||'').trim().slice(0,20000),tags=MemoCore.tagsOf(content).map(tag=>'#'+tag).join(' ');return `笔记 ${index+1}\n日期：${note.created.slice(0,10)}\n标签：${tags||'无'}\n正文：\n${content}`;}).join('\n\n');
    const memory=window.FomoAiMemory?.context?.()||'';
    const prompt=`请基于下面 ${notes.length} 条相关笔记生成一份中文洞察报告。不要编造笔记里没有的事实。不要逐条复述，重点寻找它们之间的共同主题、矛盾与可继续追问的方向。${options.focus?`\n\n重点视角：${options.focus}`:''}${memory?`\n\n${memory}`:''}\n\n${records.slice(0,60000)}`;
    const resultBox=$('#insightResult');let streamed='';
    const paint=text=>{if(closed)return;const thinking=steps[1].querySelector('.step-title');if(thinking)thinking.textContent=`已完成洞察思考（${Math.max(1,Math.round((Date.now()-started)/1000))} 秒）`;setStep(2,'active');resultBox.hidden=false;resultBox.innerHTML=`<div class="insight-result-head"><div class="insight-title">洞察报告</div><span>正在生成…</span></div><div class="insight-content">${insightMarkdown(text)}</div><p class="insight-disclaimer">AI 生成内容仅供参考</p>`;};
    const showInsightError=message=>{
      for(const timer of timers)clearTimeout(timer);
      setStep(activeStep,'error');
      const errorBox=$('#insightError'),title=errorBox.querySelector('h3'),copy=errorBox.querySelector('p'),detail=errorBox.querySelector('.insight-error-detail'),retry=$('#insightRetry');
      errorBox.hidden=false;
      const configurationIssue=/API Key|AI 尚未启用|启用 AI 服务|加密保存/.test(message)&&typeof api.openSettings==='function';
      title.textContent='获取笔记洞察时发生错误';
      copy.textContent='换一个笔记试试吧';detail.textContent=message;detail.hidden=!configurationIssue;
      retry.textContent=configurationIssue?'打开 Fomo AI 设置':'再试一次';
      retry.onclick=async()=>{
        if(configurationIssue){
          dialog.close();
          try{await api.openSettings();requestAnimationFrame(()=>{ $('#tabAi')?.click(); $('#aiTabSettings')?.click(); });}catch(error){api.toast(error.message);}
          return;
        }
        dialog.close();openMemoInsight(m,related,options);
      };
    };
    (async()=>{
      try{
        const status=await window.memoDesktop.aiSettings?.();
        if(status&&status.enabled!==true)throw Error('Fomo AI 尚未启用。请在设置 → Fomo AI → 设置中开启服务。');
        if(status&&(!status.hasKey||status.keyUsable===false))throw Error(status.hasKey?'已保存的 API Key 无法读取。请在设置 → Fomo AI → 设置中重新填写。':'尚未配置 DeepSeek API Key。请在设置 → Fomo AI → 设置中填写。');
        setStep(1,'active');
        const payload={temperature:0.4,maxTokens:1200,messages:[
          {role:'system',content:'你是 Fomo 的笔记洞察助手。基于用户选中的笔记，写一份简洁、具体、可继续行动的中文洞察报告。使用 Markdown；包含主题、值得追问的问题、可执行的下一步，不要泛泛而谈。'},
          {role:'user',content:prompt}
        ]};
        let result;
        try{
          if(window.memoDesktop.aiStreamRequest){const request=window.memoDesktop.aiStreamRequest(payload,delta=>{if(closed)return;streamed+=delta;paint(streamed);});activeRequestId=request.requestId;result=await request.result;}else if(window.memoDesktop.aiStream){activeRequestId='stream';result=await window.memoDesktop.aiStream(payload,delta=>{if(closed)return;streamed+=delta;paint(streamed);});}else result=await window.memoDesktop.aiComplete(payload);
        }catch(error){
          if(closed)throw error;
          if(streamed||!window.memoDesktop.aiComplete)throw error;
          setStep(1,'active');
          if(window.memoDesktop.aiCompleteRequest){const request=window.memoDesktop.aiCompleteRequest(payload);activeRequestId=request.requestId;result=await request.result;}else result=await window.memoDesktop.aiComplete(payload);
        }
        if(closed)return;
        steps[2].querySelector('.step-title').textContent='已经生成洞察报告';
        setStep(2,'complete');
        const seconds=Math.max(1,Math.round((Date.now()-started)/1000));
        resultBox.hidden=false;
        const report=String(result.content||'').replace(/^\s*#\s*(?:AI\s*)?洞察(?:报告)?\s*\n?/i,'').trim();saveInsightHistory({memoId:m.id,title,content:report,count:notes.length,focus:options.focus||''});resultBox.innerHTML=`<div class="insight-result-head"><div class="insight-title">洞察报告</div><span>完成洞察（${seconds} 秒）</span></div><div class="insight-content">${insightMarkdown(report)}</div><p class="insight-disclaimer">AI 生成内容仅供参考</p>`;
      }catch(error){
        if(closed)return;
        showInsightError(String(error?.message||error));
      }
    })();
  }
  function openDetail(id,tab='auto',back=false,restore=null){
    if(detailEditSession&&api.editingId()){api.toast('请先保存或取消当前编辑');return;}
    // Entering a note from "关联自" or an inline reference means the user is
    // following a backlink, so the app opens the target on its "被引用" view.
    // Legacy callers still use "links"; normalise it before choosing tabs.
    if(tab==='links')tab='quoted';
    document.getElementById('detailDatePicker')?.remove();
    const m=note(id);if(!m){api.toast('原笔记暂不可用，引用仍然保留');return;}
    const previous=captureDetail();
    if(!previous){
      detailTrail.length=0;
      if(restore?.returnContext){detailTrail.push(...restore.returnContext.trail);detailOrigin=restore.returnContext.origin;}
      else detailOrigin={context:api.context(),editing:api.editingId(),scroll:$('#memos').scrollTop,left:scrollX,top:scrollY,focus:document.activeElement,resume:api.detailReturn?.()};
    }else if(previous.id!==id&&!back)detailTrail.push(previous);
    else if(previous.id===id&&!restore)restore={...previous,tab};
    const links=MemoCore.relationships(api.state().memos,id),groups=relationGroups(links);
    const incoming=[...new Map([...groups.annotations,...groups.incoming].map(n=>[n.id,n])).values()];
    const related=MemoCore.related(api.state().memos,id).slice(0,30);
    const tabs=[];
    if(tab==='similar')tabs.push({key:'similar',label:'相关',count:related.length,notes:related.map(item=>item.memo)});
    if(groups.outgoing.length)tabs.push({key:'quote',label:'引用',count:groups.outgoing.length,notes:groups.outgoing});
    if(incoming.length)tabs.push({key:'quoted',label:'被引用',count:incoming.length,notes:incoming});
    if(!tabs.length)tabs.push({key:'similar',label:'相关',count:related.length,notes:related.map(item=>item.memo)});
    if(!tabs.some(item=>item.key===tab))tab=groups.outgoing.length?'quote':(incoming.length?'quoted':'similar');
    const relationHeading='',canRandom=!m.deleted&&api.state().memos.filter(item=>!item.deleted).length>=15;
    api.modal('笔记详情',`<section class="note-detail" data-detail-id="${m.id}">
      <div class="detail-primary">
        <div class="detail-section-row"><h3 class="detail-section-label">当前笔记</h3>${canRandom?'<button id="detailRandomWalk" type="button">随机漫步</button>':''}</div>
        <div class="detail-primary-scroll" id="detailCurrentScroll" tabindex="0">
        <article class="detail-current-card">
        <div class="detail-card-head"><time class="detail-meta" datetime="${m.created}">${esc(cardDate(m.created))}${m.deleted?' · 在回收站中':''}</time><span class="note-origin">${sourceLabel(m)}</span><button id="detailActionsToggle" type="button" aria-label="当前笔记操作" aria-haspopup="menu" aria-controls="detailActions" aria-expanded="false">···</button></div>
        ${m.annotationOf?'<div class="detail-provenance" id="detailProvenance"></div>':''}
        ${m.deleted?'<p class="detail-source-status" id="detailTrashStatus">笔记位于回收站，恢复后可继续编辑。</p>':''}
        <div class="memo-content">${api.rich(m)}</div>
        <div class="detail-images">${m.images.map((src,i)=>`<button data-detail-image="${i}" aria-label="查看图片 ${i+1}"><img src="${src}" alt="笔记图片 ${i+1}"></button>`).join('')}</div>${m.audio?`<audio class="detail-audio" controls preload="metadata" src="${m.audio}" aria-label="笔记语音"></audio>`:""}${m.video?`<video class="detail-video" controls preload="metadata" src="${m.video}" aria-label="笔记视频"></video>`:""}
        <div id="detailActions" class="detail-tools detail-actions-menu" role="menu" aria-label="当前笔记操作" popover="auto"><button id="detailShare"><span class="detail-tool-icon" data-icon="share"></span>分享</button>${!m.deleted?'<button id="detailEdit"><span class="detail-tool-icon" data-icon="edit"></span>编辑</button>':''}<button id="detailCopy"><span class="detail-tool-icon" data-icon="copy"></span>复制</button><hr>${window.memoDesktop?'<button id="detailWindow">新窗口打开</button>':''}${!m.deleted?'<button id="detailPin">'+(m.pinned?'取消置顶':'置顶')+'</button><button id="detailFloat">加入浮窗</button>':''}${window.memoDesktop?'<button id="detailInsight">AI 洞察</button>':''}<button id="detailRelated">相关笔记</button><button id="detailCopyLink">复制链接</button>${!m.deleted?'<button id="detailAnnotate">'+(api.legacyDraft(id)?'恢复批注草稿':'批注')+'</button>':''}<button id="detailMore" data-action="more" aria-haspopup="menu" aria-expanded="false">更多 ${icon('next').replace('class="bi ','class="more-chevron bi ')}</button><div class="memo-more-menu detail-more-menu" role="menu" aria-label="更多笔记操作" hidden><button id="detailHistory">历史版本</button>${!m.deleted?'<button id="detailChangeDate">修改日期</button>':''}</div>${!m.deleted?'<button id="detailDelete" class="danger">删除</button>':''}<div class="menu-meta"><span>字数统计: ${api.wordCount(m)}</span><span>编辑于 ${esc(menuEditedDate(m.updated||m.created))}</span></div></div>
        <div id="annotationList"></div>
        </article>
        </div>
      </div>
      <aside class="detail-relations"${tabs.length?'':' hidden'}>
        <div id="detailRelationHeader" class="memo-detail-header"></div>
        <div id="detailTabContent" class="detail-tab-content" role="tabpanel" tabindex="0"></div>
      </aside>
    </section>`);
    $('#dialog').classList.remove('has-relations','single-pane');
    $('#dialog').classList.add('note-detail-dialog',tabs.length?'has-relations':'single-pane');
    const header=$('#dialog .dialog-header');header.querySelector('#detailBack')?.remove();header.querySelector('.detail-switcher')?.remove();
    if(detailTrail.length){const b=document.createElement('button');b.id='detailBack';b.type='button';b.setAttribute('aria-label','返回上一条笔记');b.innerHTML=icon('back');b.onclick=()=>{let previous=detailTrail.pop();while(previous&&!note(previous.id))previous=detailTrail.pop();if(previous)openDetail(previous.id,previous.tab,true,previous);else{b.remove();api.toast('之前的笔记暂不可用');}};header.prepend(b);}
    const switcher=document.createElement('div');switcher.className='detail-switcher';switcher.innerHTML='<button id="detailSwitch" type="button" aria-haspopup="menu" aria-expanded="false">↻ <span>切换内容</span></button><div class="detail-tabs" id="detailTabs" role="menu" aria-label="切换内容" hidden></div>';header.insertBefore(switcher,header.querySelector('#closeDialog'));switcher.hidden=tabs.length<=1;const switchButton=switcher.querySelector('#detailSwitch'),switchMenu=switcher.querySelector('#detailTabs');switchButton.onclick=event=>{switchMenu.hidden=!switchMenu.hidden;switchButton.setAttribute('aria-expanded',String(!switchMenu.hidden));if(!switchMenu.hidden&&event.detail===0)switchMenu.querySelector('[aria-checked=true]')?.focus();};switcher.addEventListener('keydown',event=>{if(switchMenu.hidden)return;if(event.key==='Escape'){event.preventDefault();event.stopPropagation();switchMenu.hidden=true;switchButton.setAttribute('aria-expanded','false');switchButton.focus();return;}if(['ArrowDown','ArrowUp','Home','End'].includes(event.key)){const items=[...switchMenu.querySelectorAll('[role=menuitemradio]')],index=items.indexOf(document.activeElement),next=event.key==='Home'?0:event.key==='End'?items.length-1:(index+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;event.preventDefault();items[next]?.focus();}});const detailDialog=$('#dialog');detailDialog.detailSwitchController?.abort();const switchController=new AbortController();detailDialog.detailSwitchController=switchController;detailDialog.addEventListener('click',event=>{if(!switchMenu.hidden&&!switcher.contains(event.target)){switchMenu.hidden=true;switchButton.setAttribute('aria-expanded','false');}},{signal:switchController.signal});detailDialog.addEventListener('close',()=>{if(!detailDialog.open)switchController.abort();},{signal:switchController.signal});
    const relationSection=$('.note-detail');
    relationSection.expandedRelations=new Set(restore?.expandedRelations||relationSection.expandedRelations||[]);
    const attachRelationLinks=()=>{
      document.querySelectorAll('#detailTabContent [data-relation-menu]').forEach(b=>b.onclick=()=>openRelationMenu(b));
      document.querySelectorAll('#detailTabContent [data-relation-open]').forEach(b=>b.onclick=()=>openDetail(b.dataset.relationOpen,b.matches('.relation-parent,.relation-source')?'quoted':'auto'));
      document.querySelectorAll('#detailTabContent [data-relation-image]').forEach(b=>b.onclick=()=>{const source=note(b.dataset.relationId),index=Number(b.dataset.relationImage);if(source)api.image(source.images[index],source.images,index);});
      document.querySelectorAll('#detailTabContent [data-relation-expand]').forEach(btn=>{
        const id=btn.dataset.relationExpand,body=btn.closest('.relation-card')?.querySelector('.relation-body');if(!body)return;
        const apply=()=>{const expanded=relationSection.expandedRelations.has(id),overflow=body.scrollHeight>240;body.classList.toggle('is-collapsed',overflow&&!expanded);btn.hidden=!expanded&&!overflow;btn.textContent=expanded?'收起':'展开';btn.setAttribute('aria-expanded',String(expanded));};
        btn.onclick=()=>{if(relationSection.expandedRelations.has(id))relationSection.expandedRelations.delete(id);else relationSection.expandedRelations.add(id);apply();};
        requestAnimationFrame(apply);
      });
    };
    relationSection.dataset.hideSharedTags=String(restore?.hideSharedTags===true);
    relationSection.tabPositions=JSON.parse(JSON.stringify(restore?.tabPositions||{}));
    relationSection.saveTabPosition=()=>{
      const key=relationSection.dataset.relationView;if(!key)return;
      const panel=$('#detailTabContent');
      relationSection.tabPositions[key]={scroll:panel.scrollTop,body:$('#dialogBody').scrollTop,
        cards:[...panel.querySelectorAll('[data-relation-id] .relation-body')].map(body=>({id:body.closest('[data-relation-id]').dataset.relationId,scroll:body.scrollTop}))};
    };
    const restoreTabPosition=key=>{
      const position=relationSection.tabPositions[key],panel=$('#detailTabContent');
      for(const body of panel.querySelectorAll('[data-relation-id] .relation-body')){
        body.scrollTop=position?.cards.find(card=>card.id===body.closest('[data-relation-id]').dataset.relationId)?.scroll||0;
      }
      panel.scrollTop=position?.scroll||0;
      if(innerWidth<760)$('#dialogBody').scrollTop=position?.body||0;
    };
    const selectTab=(key,focus=false,force=false)=>{const selected=tabs.find(item=>item.key===key)||tabs[0];const current=selected?.key||'';if(relationSection.dataset.relationView===current&&!force){if(focus)$('#detailTabs [aria-selected="true"]')?.focus({preventScroll:true});return;}const relationMenu=$('#relationActions');if(relationMenu?.matches(':popover-open'))relationMenu.hidePopover();const previousRelatedMenu=$('#detailRelatedMenu');if(previousRelatedMenu?.matches(':popover-open'))previousRelatedMenu.hidePopover();relationSection.saveTabPosition();relationSection.dataset.relationView=current;const tabsRoot=$('#detailTabs');tabsRoot.replaceChildren();for(const item of tabs){const b=document.createElement('button');b.type='button';b.className='detail-tab';b.dataset.detailTab=item.key;b.id='detail-tab-'+item.key;b.setAttribute('role','menuitemradio');b.setAttribute('aria-controls','detailTabContent');b.setAttribute('aria-checked',String(item.key===current));b.setAttribute('aria-selected',String(item.key===current));b.tabIndex=0;b.textContent=item.label;b.onclick=()=>{tabsRoot.hidden=true;switchButton.setAttribute('aria-expanded','false');selectTab(item.key);switchButton.focus({preventScroll:true});};tabsRoot.append(b);}if(focus)tabsRoot.querySelector('[aria-selected="true"]')?.focus({preventScroll:true});const content=$('#detailTabContent');content.replaceChildren();content.setAttribute('aria-label',selected?selected.label+'笔记':'笔记关系');if(!selected){$('#detailRelationHeader').replaceChildren();emptyNote(content,'还没有引用、被引用或相关笔记。');return;}const sourceTags=MemoCore.tagsOf(m.content),hideSharedTags=relationSection.dataset.hideSharedTags==='true',visibleNotes=current==='similar'&&hideSharedTags?selected.notes.filter(item=>!MemoCore.tagsOf(item.content).some(tag=>sourceTags.includes(tag))):selected.notes;const heading=current==='similar'?`${visibleNotes.length} 条相关笔记`:current==='quote'?`${selected.count} 条引用笔记`:`被 ${selected.count} 条笔记引用`;const relationHeader=$('#detailRelationHeader');relationHeader.innerHTML=current==='similar'?`<h3 class="relation-count">${heading}</h3><span class="relation-hint">当前笔记相关度由本地关联计算，仅供参考</span><div class="detail-relation-actions"><button id="detailRelatedShare" type="button" aria-label="分享相关笔记" title="生成分享图">${menuGlyph('share')}</button><button id="detailRelatedMore" type="button" aria-label="相关笔记更多操作" aria-haspopup="menu" aria-expanded="false" title="更多">${icon('ellipsis')}</button></div><div id="detailRelatedMenu" class="detail-related-menu" role="menu" popover="auto"><button id="hideRelatedSameTags" type="button" role="menuitemcheckbox" aria-checked="${hideSharedTags}"><span class="menu-check" aria-hidden="true">${hideSharedTags?'✓':''}</span><span>隐藏同标签笔记</span></button></div>`:`<h3 class="relation-count">${heading}</h3>`;if(current==='similar'){$('#detailRelatedShare').onclick=()=>shareFromDetail(m);const relatedMore=$('#detailRelatedMore'),relatedMenu=$('#detailRelatedMenu');relatedMore.onclick=event=>{if(relatedMenu.matches(':popover-open')){relatedMenu.hidePopover();return;}relatedMenu.showPopover();const a=relatedMore.getBoundingClientRect(),r=relatedMenu.getBoundingClientRect();relatedMenu.style.left=Math.max(8,Math.min(innerWidth-r.width-8,a.right-r.width))+'px';relatedMenu.style.top=Math.max(8,Math.min(innerHeight-r.height-8,a.bottom+4))+'px';relatedMenu.tabIndex=-1;(event.detail===0?relatedMenu.querySelector('button'):relatedMenu).focus({preventScroll:true});};relatedMenu.addEventListener('toggle',()=>relatedMore.setAttribute('aria-expanded',String(relatedMenu.matches(':popover-open'))));$('#hideRelatedSameTags').onclick=()=>{const checked=!$('#hideRelatedSameTags').getAttribute('aria-checked').startsWith('true');relationSection.dataset.hideSharedTags=String(checked);relatedMenu.hidePopover();selectTab(current,false,true);$('#detailRelatedMore')?.focus({preventScroll:true});};}if(current==='similar'&&visibleNotes.length&&window.memoDesktop){content.insertAdjacentHTML('beforeend','<div class="ai-related-action"><button id="aiRelatedInsight" type="button">AI 洞察</button><span>让 AI 把这组笔记放在一起看</span></div>');$('#aiRelatedInsight').onclick=()=>{const related=visibleNotes.filter(note=>note&&!note.deleted);$('#dialog').close();openMemoInsight(m,related);};}
        if(!visibleNotes.length)emptyNote(content,'暂无符合条件的相关笔记。');for(const item of visibleNotes)content.insertAdjacentHTML('beforeend',relationCard(item));attachRelationLinks();restoreTabPosition(current);};selectTab(tab);
    const glyphMap={edit:'edit',copy:'copy'};document.querySelectorAll('#dialogBody .detail-tool-icon[data-icon]').forEach(el=>{el.innerHTML=menuGlyph(glyphMap[el.dataset.icon]||el.dataset.icon);});
    const actions=$('#detailActions'),actionsToggle=$('#detailActionsToggle');
    actions.querySelectorAll('button').forEach(b=>b.setAttribute('role','menuitem'));
    actionsToggle.onclick=e=>{if(actions.matches(':popover-open')){actions.hidePopover();return;}actions.showPopover();const a=actionsToggle.getBoundingClientRect(),r=actions.getBoundingClientRect();actions.style.left=Math.max(8,Math.min(innerWidth-r.width-8,a.left))+'px';actions.style.top=Math.max(8,Math.min(innerHeight-r.height-8,a.bottom+4))+'px';actions.tabIndex=-1;(e.detail===0?actions.querySelector('button'):actions).focus({preventScroll:true});};
    actions.addEventListener('toggle',()=>actionsToggle.setAttribute('aria-expanded',String(actions.matches(':popover-open'))));
    const more=$('#detailMore'),sub=actions.querySelector('.detail-more-menu');more.onpointerenter=()=>toggleMore(actions,true,true);more.onclick=()=>toggleMore(actions,sub.hidden,true);actions.querySelectorAll(':scope>button:not(#detailMore)').forEach(button=>button.onpointerenter=()=>toggleMore(actions,false));actions.addEventListener('toggle',()=>{if(!actions.matches(':popover-open'))toggleMore(actions,false);});actions.addEventListener('click',e=>{if(e.target.closest('button')!==more&&e.target.closest('button')&&actions.isConnected&&actions.matches(':popover-open'))actions.hidePopover();});
    actions.onkeydown=e=>{const inside=sub.contains(document.activeElement),items=[...(inside?sub:actions).querySelectorAll(inside?'button':':scope>button')],i=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();e.stopPropagation();items[e.key==='Home'?0:e.key==='End'?items.length-1:(i+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}else if(e.key==='ArrowRight'&&document.activeElement===more){e.preventDefault();toggleMore(actions,true,true);sub.querySelector('button')?.focus();}else if(e.key==='ArrowLeft'&&inside){e.preventDefault();toggleMore(actions,false);more.focus();}else if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();if(inside){toggleMore(actions,false);more.focus();}else{actions.hidePopover();actionsToggle.focus({preventScroll:true});}}};
    const closeActions=()=>{const relationMenu=$('#relationActions');if(relationMenu?.matches(':popover-open'))relationMenu.hidePopover();const relatedMenu=$('#detailRelatedMenu');if(relatedMenu?.matches(':popover-open'))relatedMenu.hidePopover();if(actions.isConnected&&actions.matches(':popover-open'))actions.hidePopover();};$('#dialogBody').onscroll=closeActions;$('.detail-primary-scroll').addEventListener('scroll',closeActions,{passive:true});$('#detailTabContent').addEventListener('scroll',closeActions,{passive:true});
    $('#detailEdit')?.addEventListener('click',()=>startDetailEditing(m));
    $('.detail-current-card .memo-content').ondblclick=event=>{if(!event.target.closest('a,button,[contenteditable]'))startDetailEditing(m);};
    $('#detailAnnotate')?.addEventListener('click',()=>api.annotate(id));
    $('#detailChangeDate')?.addEventListener('click',()=>openDatePicker(m,actionsToggle));$('#detailDelete')?.addEventListener('click',async()=>{if(api.busy())return;if(api.editingId()===id){api.toast('请先保存或取消这条笔记的编辑');return;}const before=MemoCore.clone(api.state());if(await api.commit(MemoCore.batch(before,[id],'delete'))){const after=MemoCore.clone(api.state());$('#dialog').close();api.toast('已移入回收站',()=>api.undo(before,after));}});$('#detailShare').onclick=()=>shareFromDetail(m);$('#detailInsight')?.addEventListener('click',()=>{$('#dialog').close();openMemoInsight(m);});$('#detailHistory').onclick=()=>showHistory(id);$('#detailCopy').onclick=()=>copyValue(memoCopyText(m),memoCopyHTML(m));
    $('#detailWindow')?.addEventListener('click',()=>openWindow(id,false));
    $('#detailPin')?.addEventListener('click',async()=>{if(api.busy())return;const desired=MemoCore.clone(api.state()),target=desired.memos.find(item=>item.id===id);if(!target||target.deleted)return;target.pinned=!target.pinned;if(await api.commit(desired)){const saved=captureDetail();if(saved)openDetail(saved.id,saved.tab,true,saved);}});
    $('#detailFloat')?.addEventListener('click',()=>addFloat(id));$('#detailRelated').onclick=()=>openDetail(id);$('#detailRandomWalk')?.addEventListener('click',()=>api.startRandomWalk(id));$('#detailCopyLink').onclick=()=>copyReference(m);
    document.querySelectorAll('[data-detail-image]').forEach(b=>b.onclick=()=>api.image(m.images[Number(b.dataset.detailImage)],m.images,Number(b.dataset.detailImage)));
    const provenance=$('#detailProvenance');if(provenance){const parent=note(m.annotationOf),b=document.createElement('button');b.type='button';b.innerHTML='<span class="detail-source-label">关联自：</span><span class="ref-arrow" aria-hidden="true">'+icon('external')+'</span>'+(parent?.deleted?'<span class="source-state">回收站</span>':!parent?'<span class="source-state">原笔记暂不可用</span>':'');b.title=parent?sourceSummary(parent):'本地暂时找不到原笔记，引用关系仍保留。';b.setAttribute('aria-label','查看批注来源：'+b.title);b.disabled=!parent||parent.deleted;b.onclick=()=>openDetail(m.annotationOf,'links');provenance.append(b);}
    document.querySelectorAll('[data-relation-open]').forEach(b=>b.onclick=()=>openDetail(b.dataset.relationOpen,b.matches('.relation-parent,.relation-source')?'quoted':'auto'));
    document.querySelectorAll('[data-relation-image]').forEach(b=>b.onclick=()=>{const source=note(b.dataset.relationId),index=Number(b.dataset.relationImage);if(source)api.image(source.images[index],source.images,index);});
    if(restore)restoreDetail(restore);else scrollSelectors.forEach(selector=>{const el=$(selector);if(el)el.scrollTop=0;});
  }
  const sourceSummary=m=>m.missing?'原笔记暂不可用':(m.created?cardDate(m.created).slice(0,10)+': ':'')+tokenText(m.content.trim().replace(/\s+/g,' ')||'图片笔记')+(m.deleted?'（回收站）':'');
  function referenceSources(m){
    return MemoCore.relationships(api.state().memos,m.id).outgoing.map(source=>`<button type="button" class="relation-source${source.missing?' is-missing':''}" ${source.missing?'disabled':'data-relation-open="'+source.id+'"'} title="${esc(sourceSummary(source))}" aria-label="查看引用来源：${esc(sourceSummary(source))}"><span class="ref-arrow" aria-hidden="true">${icon('linkedMemo')}</span><span class="detail-source-summary">${esc(sourceSummary(source))}</span></button>`).join('');
  }
  function relationCard(m,current=false){
    if(m.missing)return `<article class="relation-card is-missing" data-missing-source="${esc(m.id)}"><p class="detail-empty">原笔记暂不可用</p><p class="detail-source-status">本地暂时找不到原笔记，引用关系仍保留。</p></article>`;
    const parentId=m.annotationOf||m.relatedTo,parent=parentId?note(parentId):null,tmp=document.createElement('template');tmp.innerHTML=api.rich(m);
    return `<article class="relation-card${current?' relation-card-current':''}" data-relation-id="${m.id}">
      <div class="relation-card-head"><button class="relation-date" type="button" data-relation-open="${m.id}" aria-label="打开笔记详情"><time datetime="${m.created}">${esc(cardDate(m.created))}${m.deleted?' · 回收站':''}</time></button><button class="relation-more" type="button" data-relation-menu="${m.id}" aria-label="笔记操作" aria-haspopup="menu" aria-expanded="false">···</button></div>
      ${m.annotationOf?`<button class="relation-parent" type="button" ${parent&&!parent.deleted?'data-relation-open="'+parentId+'"':'disabled'} aria-label="查看批注来源：${esc(parent?sourceSummary(parent):'原笔记暂不可用，引用关系仍保留')}" title="${esc(parent?sourceSummary(parent):'本地暂时找不到原笔记，引用关系仍保留。')}"><span class="detail-source-label">关联自：</span><span class="ref-arrow" aria-hidden="true">${icon('external')}</span>${parent?.deleted?'<span class="source-state">回收站</span>':!parent?'<span class="source-state">原笔记暂不可用</span>':''}</button>`:''}
      <div class="relation-body-wrap"><div class="relation-body">${tmp.innerHTML}</div><button class="relation-expand" type="button" data-relation-expand="${m.id}" aria-expanded="false" hidden>展开</button></div>
      ${m.images?.length?`<div class="memo-images">${m.images.map((src,i)=>`<button type="button" data-relation-image="${i}" data-relation-id="${m.id}" aria-label="查看图片 ${i+1}"><img src="${src}" alt="笔记图片 ${i+1}" loading="lazy"></button>`).join('')}</div>`:''}
      ${m.audio?`<audio class="relation-audio" controls preload="metadata" src="${esc(m.audio)}" aria-label="笔记语音"></audio>`:''}
      ${m.video?`<video class="relation-video" controls preload="metadata" playsinline src="${esc(m.video)}" aria-label="笔记视频"></video>`:''}
    </article>`;
  }
  function relatedMarkup(m,links){
    const outgoing=links.outgoing.filter(row=>row.id!==m.annotationOf&&!row.deleted),incoming=[...new Map(links.incoming.map(row=>[row.id,row])).values()];
    if(!outgoing.length&&!incoming.length)return '';
    const collapse=api.state().display?.collapseReferences!==false,simple=outgoing.length+incoming.length<=2&&(outgoing.length===1||incoming.length===1),expanded=relatedExpanded.has(m.id),showRows=!collapse||simple||expanded;
    const counts=[outgoing.length?`引用 ${outgoing.length} 条`:'',incoming.length?`被 ${incoming.length} 条笔记引用`:''].filter(Boolean).join(' · ');
    const relationRow=(item,kind,firstIncoming=false)=>`<button type="button" class="related-memo ${kind==='incoming'?'reference-incoming':''} ${firstIncoming?'reference-group-start':''}" data-related-open="${esc(item.id)}" data-related-kind="${kind}" ${item.missing?'disabled':''} title="${esc(sourceSummary(item))}" aria-label="${esc(sourceSummary(item))}"><span class="ref-arrow" aria-hidden="true">${icon(kind==='incoming'?'backlinkedMemo':'linkedMemo')}</span><span class="related-memo-text">${esc(sourceSummary(item))}</span></button>`;
    let html='<div class="related-memos">';
    if(collapse&&!simple)html+=`<button type="button" class="related-memos-toggle" data-related-toggle="${esc(m.id)}" aria-expanded="${expanded}"><span>${counts}</span>${icon('down')}</button>`;
    if(showRows)html+=`<div class="related-list">${outgoing.map(item=>relationRow(item,'outgoing')).join('')}${incoming.map((item,index)=>relationRow(item,'incoming',index===0&&(!collapse||!simple))).join('')}</div>`;
    return html+'</div>';
  }
  function showSimilar(id){
    openDetail(id,'similar');
  }
  function showRelated(id){
    openDetail(id,'auto');
  }
  function chooseRelation(){
    api.modal('关联笔记','<div class="relation-picker"><label class="relation-search" aria-label="搜索笔记"><span data-icon="search"></span><input id="relationSearch" placeholder="搜索笔记内容或标签" autocomplete="off"></label><p id="relationCount" role="status"></p><div id="relationChoices" role="listbox" aria-label="可关联的笔记"></div></div>');
    const draw=()=>{
      const query=$('#relationSearch').value.trim(),rows=api.state().memos.filter(m=>!m.deleted&&m.id!==api.editingId()&&MemoCore.matches(m.content,query)).sort((a,b)=>Date.parse(b.created)-Date.parse(a.created)),root=$('#relationChoices');root.replaceChildren();
      $('#relationCount').textContent=rows.length>100?`找到 ${rows.length} 条，显示前 100 条；继续输入可缩小范围`:`找到 ${rows.length} 条笔记`;
      for(const m of rows.slice(0,100)){const item=row(m,{open:id=>api.link(id)});item.setAttribute('role','option');root.append(item);}
      if(!rows.length)root.innerHTML='<p class="detail-empty">没有匹配的笔记，试试其他关键词。</p>';
    };
    $('#relationSearch').oninput=draw;$('#relationSearch').onkeydown=e=>{if(e.key==='ArrowDown'){e.preventDefault();$('#relationChoices button')?.focus();}};draw();$('#relationSearch').focus();
  }
  function historyWhen(value){
    const d=new Date(value);if(!Number.isFinite(d.getTime()))return '';
    const day=date=>{const x=new Date(date);return new Date(x.getFullYear(),x.getMonth(),x.getDate()).getTime();};
    const days=Math.floor((day(Date.now())-day(d))/86400000);
    const pad=n=>String(n).padStart(2,'0'),clock=`${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
    if(days===0)return '今日 '+clock;if(days===1)return '昨日 '+clock;if(days>=2&&days<=6)return days+' 天前 '+clock;return historyFull(value);
  }
  function historyFull(value){const d=new Date(value),pad=n=>String(n).padStart(2,'0');return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;}
  function showHistory(id){
    const m=note(id);if(!m)return;const historyBase=MemoCore.clone(m),editingAtOpen=api.editingId()===id;
    const cutoff=Date.now()-30*86400000,recent=value=>{const time=Date.parse(value.created);return !Number.isFinite(time)||time>=cutoff;};
    const candidates=[...(m.history||[]).map(value=>({kind:'saved',label:'正文变化',value})),...api.draftVersions(id).map(value=>({kind:'draft',label:'本地草稿',value}))].filter(item=>recent(item.value)).sort((a,b)=>Date.parse(b.value.created)-Date.parse(a.value.created));
    const grouped=new Map();
    for(const item of candidates){const time=Date.parse(item.value.created);if(!Number.isFinite(time))continue;const key=Math.floor(time/60000);if(!grouped.has(key))grouped.set(key,[]);grouped.get(key).push(item);}
    // The app aggregates every source that falls in the same minute, then shows the newest saved revision in that minute.
    const allVersions=[...grouped].sort((a,b)=>b[0]-a[0]).map(([,entries])=>{entries.sort((a,b)=>Date.parse(b.value.created)-Date.parse(a.value.created));return entries.find(item=>item.kind==='saved')||entries[0];});
    let chosen=null,loading=false;
    api.modal('历史版本',`<section class="history-panel"><div class="history-layout"><aside class="history-sidebar"><nav id="historyVersions" aria-label="选择历史版本"></nav><p class="history-empty" id="historyEmpty" hidden>暂无历史版本</p><p class="history-tip">系统会自动保存 30 天内编辑过的历史版本，</p></aside><section class="history-document"><div class="history-document-head"><time id="historyLabel" role="status" aria-live="polite"></time><button id="loadHistory" type="button" disabled>恢复</button></div><p class="history-restore-tip">该旧版本只能恢复正文，当前附件会保留</p><article class="history-preview-card"><div id="historyPreview" class="memo-content"></div></article><p id="historyStatus" role="status"></p></section></div><div id="historyRestoreConfirm" class="history-restore-confirm" hidden><section class="history-restore-card" role="alertdialog" aria-modal="true" aria-labelledby="historyRestoreTitle" aria-describedby="historyRestoreText"><h3 id="historyRestoreTitle">恢复</h3><p id="historyRestoreText"></p><div><button id="historyRestoreCancel" type="button">取消</button><button id="historyRestoreContinue" class="primary-button" type="button">恢复</button></div></section></div></section>`);
    const panel=$('.history-panel'),title=$('#dialogTitle'),header=title.parentElement,back=document.createElement('button'),narrow=matchMedia('(max-width:419px)');
    back.type='button';back.className='history-back';back.setAttribute('aria-label','返回历史版本列表');back.textContent='‹';header.insertBefore(back,title);
    let mobileDetail=false;
    const syncHistoryLayout=()=>{if(!panel.isConnected)return;panel.classList.toggle('history-mobile-detail',narrow.matches&&mobileDetail);back.hidden=!(narrow.matches&&mobileDetail);title.textContent=narrow.matches&&mobileDetail&&chosen?historyWhen(chosen.value.created):'历史版本';};
    back.onclick=()=>{mobileDetail=false;syncHistoryLayout();$('#historyVersions [aria-pressed=true]')?.focus({preventScroll:true});};
    const onResize=()=>{if(!narrow.matches)mobileDetail=false;syncHistoryLayout();};narrow.addEventListener('change',onResize);
    $('#dialog').addEventListener('close',()=>{narrow.removeEventListener('change',onResize);back.remove();},{once:true});
    const preview=item=>{
      if(loading)return;chosen=item;$('#historyStatus').textContent='';
      $('#historyLabel').textContent=historyFull(item.value.created);$('#historyLabel').dateTime=item.value.created;
      $('#historyPreview').innerHTML=api.rich(item.value);
      $('#loadHistory').disabled=m.deleted||editingAtOpen;
      if(editingAtOpen)$('#historyStatus').textContent='请先保存或取消当前编辑，再恢复历史版本';
      $('#historyVersions').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.index)===allVersions.indexOf(item))));
      $('.history-document').scrollTop=0;
    };
    const draw=()=>{
      const visible=allVersions;
      $('#historyEmpty').hidden=visible.length>0;
      const nav=$('#historyVersions');nav.replaceChildren();
      visible.forEach(item=>{const index=allVersions.indexOf(item),b=document.createElement('button');b.type='button';b.dataset.index=index;b.dataset.kind=item.kind;b.className='history-version';b.setAttribute('aria-pressed',String(item===chosen));b.setAttribute('aria-controls','historyPreview');b.innerHTML=`<time datetime="${item.value.created}">${esc(historyWhen(item.value.created))}</time><span>${esc(item.label||(item.value.content.length+' 字'))}</span>`;b.onclick=()=>{preview(item);if(narrow.matches){mobileDetail=true;syncHistoryLayout();$('#loadHistory').focus({preventScroll:true});}};nav.append(b);});
      if(!chosen||!visible.includes(chosen))chosen=visible[0]||null;if(chosen)preview(chosen);else{$('#historyLabel').textContent='';$('#historyPreview').replaceChildren();$('#loadHistory').disabled=true;}
    };
    $('#historyVersions').onkeydown=e=>{if(loading||!['ArrowDown','ArrowUp','Home','End'].includes(e.key))return;const items=[...$('#historyVersions').querySelectorAll('button')],index=items.indexOf(document.activeElement);e.preventDefault();const next=items[e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length];next.focus({preventScroll:true});next.scrollIntoView({block:'nearest'});next.click();};
    const restoreVersion=async()=>{
      if(loading||api.busy()||!chosen||m.deleted)return;
      loading=true;$('#loadHistory').disabled=true;$('#historyVersions').querySelectorAll('button').forEach(b=>b.disabled=true);
      try{if(!await api.restoreHistoryCommit(id,chosen.value,historyBase)&&$('#historyStatus'))$('#historyStatus').textContent='恢复未完成，请重试';}
      catch(error){if($('#historyStatus'))$('#historyStatus').textContent=error.message;}
      finally{loading=false;if($('#loadHistory')){$('#loadHistory').disabled=m.deleted||!chosen;$('#historyVersions').querySelectorAll('button').forEach(b=>b.disabled=false);}}
    };
    const hideRestore=()=>{const box=$('#historyRestoreConfirm');if(!box||box.hidden)return;box.hidden=true;if($('#loadHistory'))$('#loadHistory').focus({preventScroll:true});};
    $('#loadHistory').onclick=()=>{if(loading||api.busy()||!chosen||m.deleted)return;const box=$('#historyRestoreConfirm');$('#historyRestoreText').textContent=`恢复到此版本？${historyFull(chosen.value.created)} · ${chosen.value.content.length} 字`;box.hidden=false;$('#historyRestoreCancel').focus({preventScroll:true});};
    $('#historyRestoreCancel').onclick=hideRestore;
    $('#historyRestoreContinue').onclick=async()=>{const box=$('#historyRestoreConfirm');box.hidden=true;await restoreVersion();};
    $('#historyRestoreConfirm').onclick=event=>{if(event.target.id==='historyRestoreConfirm')hideRestore();};
    $('#historyRestoreConfirm').onkeydown=event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hideRestore();}};
    draw();syncHistoryLayout();
  }
  async function openWindow(id,floating){try{await window.memoDesktop.openNote(id,floating);}catch(error){const message=(error&&error.message)||'';api.toast(message.startsWith('浮窗内笔记已满')?message:'无法打开笔记窗口：'+message);}}
  function positionMenu(menu){menu.style.position='fixed';menu.style.top='0';menu.style.left='0';const rect=menu.closest('.memo').querySelector('.memo-menu-button').getBoundingClientRect(),size=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(innerWidth-size.width-8,rect.right-size.width))+'px';menu.style.top=Math.max(8,Math.min(innerHeight-size.height-8,rect.bottom+5))+'px';menu.style.maxHeight=(innerHeight-16)+'px';menu.style.overflowY='auto';if(menu.querySelector('.memo-more-menu:not([hidden])'))toggleMore(menu,true);}
  function positionMenuAt(menu,left,top){if(!menu)return;menu.style.position='fixed';menu.style.top='0';menu.style.left='0';const size=menu.getBoundingClientRect();menu.style.left=Math.max(8,Math.min(innerWidth-size.width-8,left))+'px';menu.style.top=Math.max(8,Math.min(innerHeight-size.height-8,top))+'px';menu.style.maxHeight=(innerHeight-16)+'px';menu.style.overflowY='auto';if(menu.querySelector('.memo-more-menu:not([hidden])'))toggleMore(menu,true);}

  function exitSelection(){selecting=false;selected.clear();selectionAnchor='';drawSelection();($('#multiSelect').getClientRects().length?$('#multiSelect'):$('#sortButton')).focus({preventScroll:true});}
  function selectNote(id,checked,range=false){
    const ids=api.filtered().map(m=>m.id),start=ids.indexOf(selectionAnchor),end=ids.indexOf(id);
    const targets=range&&start>=0&&end>=0?ids.slice(Math.min(start,end),Math.max(start,end)+1):[id];
    for(const target of targets)checked?selected.add(target):selected.delete(target);
    selectionAnchor=id;drawSelection();
  }
  function drawSelection(){
    const selectable=!['insight','stats','find'].includes(api.view());$('#multiSelect').hidden=!selectable;if(!selectable){selecting=false;selected.clear();}
    document.body.classList.toggle('selecting-notes',selecting);$('#bulkBar').hidden=!selecting;$('#multiSelect').setAttribute('aria-pressed',String(selecting));
    $('#bulkCount').textContent='已选择 '+selected.size+' 条';const count=api.filtered().length;$('#bulkSelectAll').textContent=count&&selected.size===count?'取消全选':'全选当前结果（'+count+'）';
    const loaded=document.querySelectorAll('#memos>.memo').length;$('#bulkScope').textContent=`当前结果 ${count} 条${count>loaded?' · 已加载 '+loaded+' 条':''} · 全选包含未加载笔记`;
    $('#bulkSelectAll').disabled=!count||api.busy();
    for(const name of ['bulkTag','bulkCopy','bulkDelete'])$('#'+name).disabled=!selected.size||api.busy();
    $('#bulkTag').hidden=api.view()==='trash';$('#bulkDelete').textContent=api.view()==='trash'?'批量恢复':'移入回收站';
    document.querySelectorAll('.memo').forEach(article=>{const checked=selected.has(article.dataset.id);article.classList.toggle('is-selected',checked);const box=article.querySelector('.memo-selection');if(box){box.hidden=!selecting;box.querySelector('input').checked=checked;}});
  }
  function beginSelection(id){if(['insight','stats'].includes(api.view()))return;context=api.context();selecting=true;if(id)selected.add(id);api.closeMenu();api.render();}
  function batchTagDialog(){
    api.modal('批量添加标签',`<p>为所选 ${selected.size} 条笔记添加标签。已有标签不会重复添加。</p><label for="bulkTagInput">标签名称</label><input id="bulkTagInput" list="bulkTagOptions" placeholder="例如：阅读/摘录 工作"><datalist id="bulkTagOptions"></datalist><p class="dialog-hint">多个标签用空格或逗号分隔。只添加所填标签，不替换原有标签。</p><div id="bulkTagPreview" class="bulk-tag-preview" role="status" aria-live="polite"></div><p id="bulkStatus" role="status"></p><div class="dialog-actions"><button id="cancelBulkOperation">取消</button><button id="confirmBulkTag" class="primary-button">添加标签</button></div>`);
    const parseTags=()=>[...new Set($('#bulkTagInput').value.split(/[\s,，]+/).filter(Boolean).map(MemoCore.normalizeTag))];
    $('#cancelBulkOperation').onclick=()=>$('#dialog').close();
    $('#bulkTagInput').oninput=()=>{const tags=parseTags(),root=$('#bulkTagPreview');root.replaceChildren();$('#bulkStatus').textContent='';if(!tags.length||tags.some(t=>!MemoCore.validTag(t)))return;for(const tag of tags){const count=selectedRows().filter(m=>!MemoCore.tagsOf(m.content).includes(tag)).length,p=document.createElement('p');p.textContent='#'+tag+' · 将添加到 '+count+' 条笔记'+(count<selected.size?' · '+(selected.size-count)+' 条已包含':'');root.append(p);}};
    const tags=[...new Set([...api.state().extraTags,...api.state().memos.filter(m=>!m.deleted).flatMap(m=>MemoCore.tagsOf(m.content))])];for(const tag of tags){const option=document.createElement('option');option.value=tag;$('#bulkTagOptions').append(option);}
    $('#confirmBulkTag').onclick=async()=>{
      const tags=[...new Set($('#bulkTagInput').value.split(/[\s,，]+/).filter(Boolean).map(MemoCore.normalizeTag))];
      if(!tags.length||tags.some(tag=>!MemoCore.validTag(tag))){$('#bulkStatus').textContent='请输入有效标签，例如 阅读/摘录';return;}
      if(selectedRows().every(m=>tags.every(tag=>MemoCore.tagsOf(m.content).includes(tag)))){$('#bulkStatus').textContent='所选笔记已包含这些标签，无需重复添加。';return;}
      await commitBatch('tag',tags);
    };$('#bulkTagInput').focus();
  }
  function batchDeleteDialog(){
    const restore=api.view()==='trash';api.modal(restore?'批量恢复':'移入回收站',`<p>${restore?'恢复':'将'}所选 ${selected.size} 条笔记${restore?'到全部笔记':'移入回收站'}？${restore?'':'内容仍可在回收站中找回。'}</p><p id="bulkStatus" role="status"></p><div class="dialog-actions"><button id="cancelBulkOperation">取消</button><button id="confirmBulkDelete" class="${restore?'primary-button':'danger'}">${restore?'恢复':'移入回收站'}</button></div>`);
    $('#cancelBulkOperation').onclick=()=>$('#dialog').close();$('#confirmBulkDelete').onclick=()=>commitBatch(restore?'restore':'delete');
  }
  async function commitBatch(operation,tags=[]){
    if(api.busy())return;
    const ids=[...selected];if(ids.includes(api.editingId())){$('#bulkStatus').textContent='所选笔记中有正在编辑的记录，请先保存或取消编辑。';return;}
    const affected=operation==='tag'?selectedRows().filter(m=>tags.some(tag=>!MemoCore.tagsOf(m.content).includes(tag))).length:ids.length;const before=MemoCore.clone(api.state()),controls=[...$('#dialog').querySelectorAll('button,input')],block=e=>e.preventDefault();controls.forEach(b=>b.disabled=true);$('#dialog').addEventListener('cancel',block);$('#bulkStatus').textContent='正在保存…';
    try{
      let desired=before;if(operation==='tag')for(const tag of tags)desired=MemoCore.batch(desired,ids,'tag',tag);else desired=MemoCore.batch(desired,ids,operation);
      if(!await api.commit(desired)){$('#bulkStatus').textContent='操作未完成，所选笔记保留。可刷新后重试。';return;}
      const after=MemoCore.clone(api.state());$('#dialog').close();exitSelection();api.toast(operation==='tag'?'已为 '+affected+' 条笔记添加标签'+(affected<ids.length?'，其余笔记已包含':''):operation==='delete'?'已将 '+ids.length+' 条笔记移入回收站':'已恢复 '+ids.length+' 条笔记',()=>api.undo(before,after));
    }catch(error){$('#bulkStatus').textContent=error.message;}finally{controls.forEach(b=>b.disabled=false);$('#dialog').removeEventListener('cancel',block);drawSelection();}
  }
  async function copySelected(){
    const rows=selectedRows(),text=rows.map(m=>m.content).join('\n\n---\n\n');if(!rows.length)return;
    try{
      if(window.ClipboardItem&&navigator.clipboard?.write){const html=rows.map(m=>api.rich(m)).join('<hr>');await navigator.clipboard.write([new ClipboardItem({'text/plain':new Blob([text],{type:'text/plain'}),'text/html':new Blob([html],{type:'text/html'})})]);}
      else await navigator.clipboard.writeText(text);
      exitSelection();api.toast('已复制 '+rows.length+' 条笔记');
    }catch{api.modal('复制所选笔记','<p>请选择下方内容并复制。</p><textarea id="bulkCopyText" readonly rows="12"></textarea>');$('#bulkCopyText').value=text;$('#bulkCopyText').focus();$('#bulkCopyText').select();}
  }

  window.MemoInteractions={
    init(handlers){
      api=handlers;context=api.context();$('#linkMemo').onclick=chooseRelation;renderFloat();
      const toggle=document.createElement('button');toggle.id='multiSelect';toggle.type='button';toggle.className='multi-select-toggle';toggle.textContent='多选';toggle.setAttribute('aria-pressed','false');toggle.onclick=()=>selecting?exitSelection():beginSelection();$('.title-row').append(toggle);
      const bar=document.createElement('section');bar.id='bulkBar';bar.hidden=true;bar.className='bulk-bar';bar.setAttribute('aria-label','批量操作');bar.innerHTML='<span id="bulkCount" role="status"></span><span id="bulkScope" class="bulk-scope"></span><button id="bulkSelectAll">全选当前结果</button><button id="bulkTag">添加标签</button><button id="bulkCopy">复制</button><button id="bulkDelete">移入回收站</button><button id="bulkExit" aria-label="退出多选">退出</button>';$('#memos').before(bar);
      $('#bulkExit').onclick=exitSelection;$('#bulkSelectAll').onclick=()=>{const ids=api.filtered().map(m=>m.id);selected=selected.size===ids.length?new Set():new Set(ids);selectionAnchor='';drawSelection();};$('#bulkTag').onclick=batchTagDialog;$('#bulkDelete').onclick=batchDeleteDialog;$('#bulkCopy').onclick=copySelected;
      document.addEventListener('pointerdown',e=>{if(!e.target.closest('.memo-menu,.memo-menu-button')&&$('.memo-menu'))api.closeMenu();});
      document.addEventListener('click',e=>{
        const link=e.target.closest('[data-memo-id]');if(link&&!link.closest('#editor')){e.preventDefault();e.stopImmediatePropagation();const target=note(link.dataset.memoId);if(!target||target.deleted){api.toast('关联笔记暂不可用');return;}openDetail(target.id,'quoted');return;}
        const article=e.target.closest('.memo');if(selecting&&article&&!e.target.closest('button,a,input,label')&&getSelection().isCollapsed){e.preventDefault();e.stopImmediatePropagation();selectNote(article.dataset.id,!selected.has(article.dataset.id),e.shiftKey);}
      },true);
      document.addEventListener('keydown',e=>{
        const menu=e.target.closest?.('.memo-menu');if(menu){const scope=e.target.closest('.memo-more-menu')||menu,items=[...scope.querySelectorAll('button')].filter(b=>b.getClientRects().length&&(scope!==menu||!b.closest('.memo-more-menu'))),index=items.indexOf(document.activeElement);if(['ArrowDown','ArrowUp','Home','End'].includes(e.key)){e.preventDefault();items[e.key==='Home'?0:e.key==='End'?items.length-1:(index+(e.key==='ArrowDown'?1:-1)+items.length)%items.length]?.focus();}if(e.key==='ArrowRight'&&e.target.dataset.action==='more'){e.preventDefault();toggleMore(menu,true);menu.querySelector('.memo-more-menu button')?.focus();}if(e.key==='ArrowLeft'&&scope!==menu){e.preventDefault();toggleMore(menu,false);menu.querySelector('[data-action=more]').focus();}if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();const id=menu.closest('.memo').dataset.id;api.closeMenu();document.querySelector(`[data-id="${id}"] .memo-menu-button`)?.focus();}return;}
        if(!selecting||$('#dialog').open||$('#lightbox').open||e.isComposing)return;
        const editable=e.target.isContentEditable||e.target.closest('input,textarea,select');if(editable)return;
        if(e.key==='Escape'){e.preventDefault();e.stopImmediatePropagation();exitSelection();}
        if((e.key==='Delete'||e.key==='Backspace')&&selected.size){e.preventDefault();e.stopImmediatePropagation();batchDeleteDialog();}
        if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='a'&&selecting){e.preventDefault();e.stopImmediatePropagation();const ids=api.filtered().map(m=>m.id);selected=selected.size===ids.length?new Set():new Set(ids);selectionAnchor='';drawSelection();}
        if((e.ctrlKey||e.metaKey)&&e.key.toLowerCase()==='c'&&selected.size){e.preventDefault();copySelected();}
      },true);
      $('#dialog').addEventListener('close',restoreDetailOrigin);
      $('#memos').addEventListener('scroll',()=>{const menu=$('.memo-menu');if(menu)positionMenu(menu);});window.addEventListener('resize',()=>api.closeMenu());
      if(window.memoDesktop){
        window.memoDesktop.onOpenMemo(async id=>{await api.refresh();const m=note(id);if(m&&!m.deleted){openDetail(id);}else api.toast('原笔记已移除');});
        window.memoDesktop.onOpenMemoLinkError?.(()=>api.toast('笔记链接无效，请重新复制完整链接'));
      }
    },
    finishDetailEdit,openDetail,openDatePicker,openMemoInsight,showRelated,showSimilar,chooseRelation,showHistory,positionMenu,positionMenuAt,toggleMore,isSelecting:()=>selecting,
    async menuAction(action,m){
      if(action==='share'){openShareImage(m,api);return true;}
      if(action==='copy-link'){await copyReference(m);return true;}
      if(action==='insight'){openMemoInsight(m);return true;}
      if(action==='related'){showRelated(m.id);return true;}
      if(action==='similar'){api.modal('相关笔记','<div id="similarNotes"></div>');const list=MemoCore.related(api.state().memos,m.id),root=$('#similarNotes');for(const item of list)root.append(row(item.memo));if(!list.length)root.textContent='暂无相关笔记，可通过共同标签或引用关联记录。';return true;}
      return false;
    },
    async action(action,m){if(action==='detail'){openDetail(m.id);return true;}if(action==='annotate'){api.annotate(m.id);return true;}if(action==='history'){showHistory(m.id);return true;}if(action==='select'){beginSelection(m.id);return true;}if(action==='window'){await openWindow(m.id,false);return true;}if(action==='float'){addFloat(m.id);return true;}if(action==='related'){showRelated(m.id);return true;}return false;},
    render(){
      if(!api)return;const referenceCollapse=api.state().display?.collapseReferences!==false;if(lastReferenceCollapse!==null&&lastReferenceCollapse!==referenceCollapse)relatedExpanded.clear();lastReferenceCollapse=referenceCollapse;if(context!==api.context()){selected.clear();selectionAnchor='';selecting=false;context=api.context();}
      const visible=new Set(api.filtered().map(m=>m.id));selected=new Set([...selected].filter(id=>visible.has(id)));
      document.querySelectorAll('.memo').forEach(article=>{
        if(article.classList.contains('inline-edit-card'))return;const m=note(article.dataset.id);if(!m)return;MemoMarkup.highlight(article.querySelector('.memo-content'),api.query());
        const menu=article.querySelector('.memo-menu');
        if(menu&&!menu.dataset.refined){buildNoteMenu(menu,m);}
        if(menu){menu.setAttribute('role','menu');menu.setAttribute('aria-label','笔记操作');menu.querySelectorAll('button').forEach(b=>b.setAttribute('role','menuitem'));positionMenu(menu);}
        const head=article.querySelector('.memo-head');if(head&&!article.querySelector('.memo-selection')){const label=document.createElement('label');label.className='memo-selection';const checkbox=document.createElement('input');checkbox.type='checkbox';checkbox.setAttribute('aria-label','选择笔记：'+title(m));checkbox.onclick=e=>selectNote(m.id,checkbox.checked,e.shiftKey);label.append(checkbox);head.prepend(label);}
        article.querySelector('.source-link')?.remove();article.querySelector('.reference-summary')?.remove();article.querySelector('.related-memos')?.remove();
        const links=MemoCore.relationships(api.state().memos,m.id),related=relatedMarkup(m,links);
        if(related){article.insertAdjacentHTML('beforeend',related);const toggle=article.querySelector('[data-related-toggle]');if(toggle)toggle.onclick=e=>{e.stopPropagation();if(relatedExpanded.has(m.id))relatedExpanded.delete(m.id);else relatedExpanded.add(m.id);window.MemoInteractions.render();article.querySelector('[data-related-toggle]')?.focus({preventScroll:true});};for(const button of article.querySelectorAll('[data-related-open]')){button.onclick=e=>{e.stopPropagation();const id=button.dataset.relatedOpen;if(!id)return;openDetail(button.dataset.relatedKind==='incoming'?m.id:id,'quoted');};}}
      });drawSelection();
    },
    focusMenu(keyboard=true){const focus=()=>{const menu=$('.memo-menu');if(!menu)return false;menu.tabIndex=-1;(keyboard?menu.querySelector('button'):menu)?.focus({preventScroll:true});return true;};queueMicrotask(focus);setTimeout(focus,0);},
    isBusy(){return api.busy();}
  };
})();
