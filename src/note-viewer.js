import {absoluteNoteDate} from './note-metadata.js';
import {installMediaFeedback} from './media-feedback.js';
installMediaFeedback();
import {relationGroups} from './note-relations.js';
import {applyDisplayPreferences,sourceLabel,referenceGroup} from './display-preferences.js';
(() => {
  'use strict';
  document.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=window.memoIcons[el.dataset.icon]||'';});
  const $=selector=>document.querySelector(selector);let floating=false,activeTheme='light',loadRevision=0,currentMemo=null,editing=false,saving=false,reading=false,editRevision=0,editImages=[],dirty=false;
  function compactReferences(root,links){
    const rows=Object.values(links||{}).flat(),map=new Map(rows.flatMap(item=>[[item.id,item],...(item.sourceSlug?[[item.sourceSlug,item]]:[])]));
    root.querySelectorAll('a[data-memo-id]').forEach(link=>{
      const source=map.get(link.dataset.memoId);if(!source)return;
      const stamp=typeof source.created==='string'?source.created.slice(0,16).replace('T',' '):'';
link.className='memo-reference-link';link.textContent='';const label='查看关联笔记：'+(source.content||'').replace(/\s+/g,' ').slice(0,80);link.setAttribute('aria-label',label);link.title=label;
    });
    root.querySelectorAll('a[href^="http"]:not([data-memo-id])').forEach(link=>{if(!/^https?:\/\//i.test(link.textContent.trim()))return;try{link.textContent=new URL(link.href).hostname+'...';link.className='blank-memo-link';}catch{}});
  }
  const memoEditor=window.MemoEditor?.create($('#noteEditor'),{onFiles:files=>addImages(files),onChange:()=>{if(editing){dirty=true;syncNativeState();$('#noteCharCount').textContent=String(memoEditor.getDisplayText().length);}}});
  const systemTheme=matchMedia('(prefers-color-scheme: dark)');
  const applyTheme=()=>document.body.classList.toggle('dark',activeTheme==='dark'||(activeTheme==='system'&&systemTheme.matches));
  systemTheme.addEventListener('change',()=>{if(activeTheme==='system')applyTheme();});
  async function open(id){try{await window.memoNote.open(id);}catch(error){$('#noteWindowStatus').textContent=error.message;}}
  async function load(){
    const revision=++loadRevision;
    try{
      const info=await window.memoNote.read();if(revision!==loadRevision)return;floating=info.floating;activeTheme=info.theme;applyTheme();applyDisplayPreferences(info.display);$('#floatNote').setAttribute('aria-pressed',String(floating));$('#floatNote').title=floating?'取消窗口置顶':'窗口置顶';$('#floatNote').setAttribute('aria-label',$('#floatNote').title);
      if(editing)return;
      $('#noteImages').replaceChildren();$('#noteAnnotations').replaceChildren();
      if(!info.memo){$('#noteDate').textContent='';$('#noteContent').textContent='这条笔记暂不可用。';$('#noteWindowStatus').textContent='';$('#editNote').disabled=true;return;}
      if(editing)return;
      const m=MemoCore.validate({memos:[info.memo]}).memos[0];currentMemo=m;$('#noteDate').textContent=absoluteNoteDate(m.created);$('#noteWindowTitle').textContent=absoluteNoteDate(m.created);document.title='Fomo · '+absoluteNoteDate(m.created);$('#noteContent').innerHTML=MemoMarkup.rich(m);compactReferences($('#noteContent'),info.links);
      document.querySelector('.note-origin')?.remove();const origin=document.createElement('span');origin.className='note-origin';origin.textContent=sourceLabel(m);$('#noteDate').after(origin);
      m.images.forEach((src,index)=>{const image=document.createElement('img');image.src=src;image.alt='笔记图片 '+(index+1);$('#noteImages').append(image);});
      if(m.audio){const audio=document.createElement('audio');audio.controls=true;audio.preload='metadata';audio.src=m.audio;audio.setAttribute('aria-label','笔记语音');$('#noteImages').append(audio);}
      if(m.video){const video=document.createElement('video');video.controls=true;video.preload='metadata';video.src=m.video;video.setAttribute('aria-label','笔记视频');$('#noteImages').append(video);}
      const groups=relationGroups(info.links);
      for(const [key,label]of [['annotations','批注'],['outgoing','引用的笔记'],['incoming','引用此笔记']]){
        if(key==='annotations')continue;const rows=key==='incoming'?[...new Map([...groups.annotations,...groups.incoming].map(n=>[n.id,n])).values()]:groups[key];if(!rows.length)continue;
        const root=referenceGroup($('#noteAnnotations'),label+' '+rows.length,key!=='annotations'&&info.display?.collapseReferences);
        const heading=document.createElement('h3');heading.textContent=label+' '+rows.length;root.append(heading);
        for(const item of rows){const b=document.createElement('button');b.className='related-choice';b.textContent=(item.content.trim().replace(/\s+/g,' ').slice(0,160)||'图片笔记')+(item.deleted?' · 在回收站中':'');b.disabled=!!item.missing;b.onclick=()=>open(item.id);root.append(b);}
      }
      $('#editNote').disabled=m.deleted;$('#noteWindowStatus').textContent=m.deleted?'原笔记在回收站中，可回主窗口恢复。':'';
    }catch(error){if(revision===loadRevision)$('#noteWindowStatus').textContent='无法读取：'+error.message;}
  }
  function showEditing(on){
    editing=on;if(!on)dirty=false;syncNativeState();
    $('#noteContent').hidden=on;$('#noteImages').hidden=on;$('#noteAnnotations').hidden=on;
    $('#noteEditor').hidden=!on;$('#noteEditImages').hidden=!on;$('#noteFormatBar').hidden=!on;$('#editNote').hidden=on;
    document.body.classList.toggle('note-editing',on);
    if(on)$('#noteCharCount').textContent=String(memoEditor.getDisplayText().length);
  }
  function textblockPosition(event,content){
    const range=document.caretRangeFromPoint?.(event.clientX,event.clientY);if(!range||!content?.contains(range.startContainer))return null;
    const element=range.startContainer.nodeType===Node.ELEMENT_NODE?range.startContainer:range.startContainer.parentElement;
    const selector='p,h1,h2,h3,h4,h5,h6,pre,li:not(:has(p,h1,h2,h3,h4,h5,h6,pre))',block=element?.closest(selector);if(!block||!content.contains(block))return null;
    const blocks=[...content.querySelectorAll(selector)].filter(node=>!node.closest('.annotation-parent')),index=blocks.indexOf(block);if(index<0)return null;
    const selected=document.createRange();selected.selectNodeContents(block);selected.setEnd(range.startContainer,range.startOffset);const fragment=selected.cloneContents();fragment.querySelectorAll('a[data-memo-id]').forEach(link=>link.textContent='fomo://note/'+link.dataset.memoId);return {index,offset:fragment.textContent.length};
  }
  function startEditing(position=null){
    if(!currentMemo||currentMemo.deleted||!memoEditor)return;
    if(editing||saving)return;
    let sourceLine=0;
    if(position&&currentMemo.annotationOf){
      const normalized=window.MemoMarkup.referenceBody(currentMemo);
      if(normalized.content!==currentMemo.content){
        if(!currentMemo.html)sourceLine=1;
        else{const template=document.createElement('template');template.innerHTML=window.MemoMarkup.clean(currentMemo.html);const first=template.content.firstElementChild;if(first?.matches('p,div')){const clone=first.cloneNode(true);clone.querySelectorAll('a[data-memo-id]').forEach(link=>link.remove());const text=clone.textContent.trim(),token=text.replace(/^关联自：\s*/, '');if(/^关联自：\s*$/.test(text)||(text.startsWith('关联自：')&&MemoCore.memoIdFromToken(token)===currentMemo.annotationOf))sourceLine=1;}}
      }
    }
    editRevision++;editImages=[...currentMemo.images];
    showEditing(true);renderEditImages();
    memoEditor.setHTML(currentMemo.html||MemoEditor.plainHTML(currentMemo.content));
    dirty=false;syncNativeState();memoEditor.focusTextBlock((position?.index??0)+sourceLine,position?.offset??0);
  }
  async function saveEditing(){
    if(!memoEditor||!currentMemo||!editing||saving||reading)return;
    const content=memoEditor.getText(),html=memoEditor.getHTML();
    if(!content.trim()&&!editImages.length&&!currentMemo.audio&&!currentMemo.video){$('#noteWindowStatus').textContent='这里还没有内容，写下一点再保存。';return;}
    try{
      saving=true;syncEditControls();memoEditor.setEditable(false);
      await window.memoNote.save({content,html,images:editImages,base:currentMemo});
      showEditing(false);currentMemo=null;await load();
      $('#noteWindowStatus').textContent='已保存';setTimeout(()=>{if(!editing&&$('#noteWindowStatus').textContent==='已保存')$('#noteWindowStatus').textContent='';},1800);
    }catch(error){$('#noteWindowStatus').textContent='保存失败：'+error.message;}
    finally{saving=false;memoEditor.setEditable(true);syncEditControls();}
  }
  function cancelEditing(){if(saving)return;editRevision++;showEditing(false);currentMemo=null;load();}
  $('#noteContent').ondblclick=event=>{if(event.target.closest('a,button,input,textarea'))return;startEditing(textblockPosition(event,$('#noteContent')));};
  $('#noteContent').onclick=event=>{const link=event.target.closest('a[data-memo-id]');if(link){event.preventDefault();open(link.dataset.memoId);}};
  $('#floatNote').onclick=async()=>{try{await window.memoNote.setFloating(!floating);await load();}catch(error){$('#noteWindowStatus').textContent=error.message;}};
  $('#composeNote').onclick=()=>window.memoNote.compose().catch(e=>$('#noteWindowStatus').textContent=e.message);
  $('#closeNote').onclick=()=>window.memoNote.close();
  document.addEventListener('keydown',e=>{if(e.isComposing)return;if(editing&&(e.ctrlKey||e.metaKey)&&e.key==='Enter'){e.preventDefault();saveEditing();return;}if(editing&&e.key==='Escape'){e.preventDefault();cancelEditing();return;}if((e.ctrlKey||e.metaKey)&&e.shiftKey&&e.key.toLowerCase()==='o'){e.preventDefault();$('#editNote').click();}});
  $('#editNote').onclick=async()=>{try{await window.memoNote.edit();}catch(error){$('#noteWindowStatus').textContent=error.message;}};
  $('#saveNote').onclick=saveEditing;
  $('#cancelNote').onclick=cancelEditing;
  $('#noteTag').onclick=()=>memoEditor.insertText('#');
  $('#noteBold').onclick=()=>memoEditor.command('bold');
  $('#noteList').onclick=()=>memoEditor.command('list');
  $('#noteNumber').onclick=()=>memoEditor.command('number');
  function syncNativeState(){window.memoNote.editState({dirty:editing&&(dirty||reading),saving:saving||reading}).catch(()=>{});}
  function syncEditControls(){
    syncNativeState();
    $('#saveNote').disabled=saving||reading;$('#cancelNote').disabled=saving;$('#noteImage').disabled=saving||reading;
    $('#noteEditor').setAttribute('aria-busy',String(saving||reading));
    for(const id of ['noteTag','noteBold','noteList','noteNumber'])$('#'+id).disabled=saving;
  }
  function renderEditImages(){
    const root=$('#noteEditImages');root.replaceChildren();root.hidden=!editing;
    editImages.forEach((src,index)=>{const item=document.createElement('div'),image=document.createElement('img'),remove=document.createElement('button');image.src=src;image.alt='图片 '+(index+1);remove.type='button';remove.textContent='移除';remove.disabled=saving||reading;remove.onclick=()=>{if(saving||reading)return;editImages.splice(index,1);dirty=true;syncNativeState();renderEditImages();};item.append(image,remove);root.append(item);});
  }
  async function addImages(files){
    if(!editing||saving||reading)return;
    const revision=editRevision,list=Array.from(files),status=$('#noteWindowStatus');
    if(list.reduce((n,f)=>n+f.size,0)>32*1024*1024){status.textContent='单次图片总大小请不超过 32 MB';return;}
    reading=true;syncEditControls();renderEditImages();let added=0,failed=0;
    try{for(let i=0;i<list.length;i++){
      if(revision!==editRevision||!editing)break;
      const file=list[i];if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)||file.size>8*1024*1024){failed++;continue;}
      try{const src=await new Promise((resolve,reject)=>{const reader=new FileReader();reader.onprogress=e=>{if(revision===editRevision&&editing)status.textContent='图片读取中 '+(i+1)+'/'+list.length+(e.lengthComputable?' · '+Math.round(e.loaded/e.total*100)+'%':'');};reader.onload=()=>resolve(reader.result);reader.onerror=()=>reject(Error('图片读取失败'));reader.onabort=()=>reject(Error('图片读取已取消'));reader.readAsDataURL(file);});
        if(revision!==editRevision||!editing)break;const decoded=new Image();decoded.src=src;await decoded.decode();if(revision!==editRevision||!editing)break;editImages.push(src);dirty=true;syncNativeState();added++;
      }catch{failed++;}
    }
    if(revision===editRevision&&editing)status.textContent=failed?'已添加 '+added+' 张，'+failed+' 张未添加（格式、大小或读取失败）；原内容保留。':'';
    }finally{reading=false;syncEditControls();renderEditImages();}
  }
  $('#noteImage').onclick=()=>$('#noteImageInput').click();
  $('#noteImageInput').onchange=event=>{addImages(event.target.files);event.target.value='';};
  window.memoNote.onChange(load);load();
})();
