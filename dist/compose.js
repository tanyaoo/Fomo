(() => {
  'use strict';
  const $=s=>document.querySelector(s);document.querySelectorAll('[data-icon]').forEach(el=>{el.innerHTML=window.memoIcons[el.dataset.icon]||'';});
  let editor=null,pinned=false,busy=false,reading=false,disposed=false,images=[],tagsCache=[],tagChoices=[],tagIndex=-1,tagRequest=null,tagRevision=0,dismissedSelection='',dismissedTag='';
  const menu=$('#tagMenu');
  const update=()=>{const count=editor?editor.getDisplayText().trim().length:0;$('#charCount').textContent=count+' 字';$('#charCount').hidden=count===0;$('#cancelCompose').hidden=count===0&&!images.length;$('#cancelCompose').disabled=busy||reading;$('#composePlaceholder').hidden=count>0||images.length>0;$('#send').disabled=busy||reading||(count===0&&!images.length);$('#imageCompose').disabled=busy||reading;$('#composeImageInput').disabled=busy||reading;$('#composeEditor').setAttribute('aria-busy',String(reading));if(editor){for(const [id,command]of [['listCompose','list'],['numberCompose','number'],['quoteCompose','quote']])$('#'+id).setAttribute('aria-pressed',String(editor.isActive(command)));for(const button of document.querySelectorAll('#composeFormatPopover [data-format],#composeSelectionToolbar [data-format]'))button.setAttribute('aria-pressed',String(editor.isActive(button.dataset.format)));updateSelectionToolbar();}};
  function selectionKey(){const selection=editor?.getSelection();return selection?selection.anchor+':'+selection.head:'';}
  function hideSelection(dismiss=false){$('#composeSelectionToolbar').hidden=true;if(dismiss)dismissedSelection=selectionKey();}
  function updateSelectionToolbar(){
    const bar=$('#composeSelectionToolbar'),root=$('#composeEditor'),active=document.activeElement;
    if(!editor||busy||disposed||editor.isComposing()||!$('#composeFormatPopover').hidden||!menu.hidden||(!root.contains(active)&&active!==root&&!bar.contains(active))){bar.hidden=true;return;}
    const rect=editor.selectionRect(),key=selectionKey(),bounds=root.getBoundingClientRect();
    if(!rect||key===dismissedSelection||rect.bottom<bounds.top||rect.top>bounds.bottom){bar.hidden=true;return;}
    dismissedSelection='';bar.hidden=false;const width=bar.offsetWidth,height=bar.offsetHeight;
    bar.style.left=Math.max(8,Math.min(innerWidth-width-8,(rect.left+rect.right-width)/2))+'px';
    const top=rect.top-height-8;bar.style.top=Math.max(48,Math.min(innerHeight-height-8,top>=48?top:rect.bottom+8))+'px';
  }
  function hideTagMenu(dismiss=false){if(dismiss&&tagRequest)dismissedTag=tagRequest.kind+':'+tagRequest.from+':'+tagRequest.query;tagRevision++;menu.hidden=true;menu.classList.remove('tag-suggestions--animate');menu.replaceChildren();tagChoices=[];tagIndex=-1;tagRequest=null;editor?.setTagHint(null);$('#composeEditor').setAttribute('aria-expanded','false');}
  function renderTags(){
    menu.replaceChildren();
    if(!tagChoices.length){
      if(tagRequest?.kind!=='reference'){hideTagMenu();return;}
      const empty=document.createElement('div');empty.className='tag-empty';empty.setAttribute('role','status');empty.textContent=tagRequest.error?'笔记读取失败，请稍后重试':tagRequest.query.trim()?'没有找到相关笔记':'暂无可关联的笔记';menu.append(empty);menu.hidden=false;menu.setAttribute('aria-label','引用建议');hideSelection();positionTags();$('#composeEditor').setAttribute('aria-expanded','true');return;
    }
    const wasHidden=menu.hidden;menu.hidden=false;if(wasHidden&&tagRequest?.kind==='tag'){menu.classList.remove('tag-suggestions--animate');void menu.offsetWidth;menu.classList.add('tag-suggestions--animate');}hideSelection();
    for(const [index,choice]of tagChoices.entries()){
      const button=document.createElement('button');button.type='button';button.setAttribute('role','option');button.setAttribute('aria-selected',String(index===tagIndex));button.className=index===tagIndex?'selected':'';
      const label=document.createElement('span');if(choice.memo){label.textContent=window.MemoMarkup.referenceSnippet(choice.memo.content,tagRequest?.query)||'图片笔记';window.MemoMarkup.highlight(label,tagRequest?.query||'');}else label.innerHTML=window.MemoMarkup.tagLabel(choice.tag,tagRequest?.query);button.append(label);
      if(choice.memo){button.classList.add('reference-option');label.className='reference-label';const date=document.createElement('span');date.className='reference-date';date.textContent=new Date(choice.memo.created).toLocaleString('sv-SE').replace('T',' ');button.prepend(date);}
      if(choice.isNew){const badge=document.createElement('span');badge.className='tag-new';badge.textContent='新建';button.append(badge);}
      button.onmousedown=event=>event.preventDefault();
      button.onpointerdown=event=>{if(event.button!==0)return;event.preventDefault();chooseTag(index);};button.onclick=()=>chooseTag(index);
      menu.append(button);
    }
    menu.scrollTop=0;
  }
  function positionTags(){
    let left=18,top=60;
    try{if(tagRequest?.kind==='tag'){const rect=editor.positionRect(tagRequest.from),point=window.MemoMarkup.tagPopupPosition(rect,menu.offsetWidth,menu.offsetHeight,innerWidth,innerHeight,52);menu.style.left=point.left+'px';menu.style.top=point.top+'px';return;}const rect=editor?.caretRect?.();if(rect){left=rect.left;top=rect.bottom+6;}}catch{}
    menu.style.left=Math.max(8,Math.min(left,innerWidth-menu.offsetWidth-8))+'px';
    menu.style.top=Math.max(52,Math.min(top,innerHeight-menu.offsetHeight-8))+'px';
  }
  async function suggestTags(){
    const revision=++tagRevision;
    if(!editor||editor.isComposing?.()){hideTagMenu();return;}
    let request=null;try{request=editor.queryAtCursor?.();}catch{}
    if(!request){dismissedTag='';hideTagMenu();return;}
    if(!$('#composeEditor').contains(document.activeElement)){hideTagMenu();return;}
    if(dismissedTag===request.kind+':'+request.from+':'+request.query){hideTagMenu();return;}
    if(request.kind==='reference'){
      editor.setTagHint(request);
      try{const rows=await window.memoCompose.references(String(request.query||'').slice(0,200));if(revision!==tagRevision||disposed)return;if(!$('#composeEditor').contains(document.activeElement)){hideTagMenu();return;}tagChoices=rows.map(memo=>({memo}));tagRequest=request;tagIndex=tagChoices.length?0:-1;menu.setAttribute('aria-label','引用建议');renderTags();if(!menu.hidden){positionTags();$('#composeEditor').setAttribute('aria-expanded','true');}}catch{if(revision===tagRevision&&!disposed){tagChoices=[];tagIndex=-1;tagRequest={...request,error:true};renderTags();}}return;
    }
    const query=String(request.query||'');
    const existing=query?window.MemoCore.matchTagSuggestions(tagsCache.map(item=>item.tag),query):tagsCache.filter(item=>item.recentIndex>=0).sort((a,b)=>a.recentIndex-b.recentIndex).map(item=>item.tag).slice(0,10);
    const proposed=window.MemoCore?.normalizeTag?.(query);
    const valid=proposed&&window.MemoCore?.validTag?.(proposed)&&!tagsCache.some(item=>item.tag.toLowerCase()===proposed.toLowerCase());
    tagChoices=existing.map(tag=>({tag,isNew:false}));
    if(valid)tagChoices.push({tag:proposed,isNew:true});
    tagRequest=request;tagIndex=tagChoices.length?0:-1;menu.setAttribute('aria-label','标签建议');
    renderTags();
    editor.setTagHint(request);
    if(menu.hidden)return;
    positionTags();
    $('#composeEditor').setAttribute('aria-expanded','true');
    if(revision!==tagRevision)hideTagMenu();
  }
  function chooseTag(index){
    const choice=tagChoices[index];if(!choice)return;
    try{if(choice.memo)editor.insertReference(choice.memo,tagRequest);else editor.insertText('#'+choice.tag+' ',tagRequest);}catch{}
    hideTagMenu();
    setTimeout(()=>{update();suggestTags();},0);
  }
  async function loadTags(){
    try{const value=await window.memoCompose.tags();if(Array.isArray(value))tagsCache=value.filter(item=>item&&typeof item.tag==='string');}catch{}
    suggestTags();
  }
  const expandTagMenu=()=>{editor.insertText('#');editor.focus();setTimeout(()=>{update();suggestTags();},0);};
  function renderImages(){const wrap=$('#composeImages');wrap.replaceChildren();wrap.hidden=!images.length;images.forEach((src,index)=>{const box=document.createElement('div');box.className='compose-image';const img=document.createElement('img');img.src=src;img.alt='笔记图片 '+(index+1);const remove=document.createElement('button');remove.type='button';remove.setAttribute('aria-label','移除图片 '+(index+1));remove.textContent='×';remove.onclick=()=>{if(busy||reading)return;images.splice(index,1);renderImages();update();};box.append(img,remove);wrap.append(box);});}
  editor=window.MemoEditor.create($('#composeEditor'),{onFiles:files=>addImages(files),onChange:()=>{dismissedTag='';suggestTags();update();},onSelection:()=>{suggestTags();update();},onKeyDown:event=>{if(!event.isComposing&&event.keyCode!==229&&(event.ctrlKey||event.metaKey||event.shiftKey)&&event.key==='Enter'){event.preventDefault();save();return true;}return false;}});update();
  const detachedToken=new URLSearchParams(location.search).get('draft');
  if(detachedToken){
    $('#status').textContent='正在接收草稿…';
    window.memoCompose.takeDraft(detachedToken).then(async draft=>{if(disposed)return false;if(draft.html)editor.setHTML(draft.html);else editor.setText(draft.content||'');images=Array.isArray(draft.images)?draft.images:[];renderImages();update();if(typeof editor.focusEnd==='function')editor.focusEnd();else editor.focusTextBlock(0,0);const loaded=await window.memoCompose.draftLoaded(detachedToken);if(!loaded)throw Error('草稿接收确认失败');$('#status').textContent='';return true;}).catch(error=>{$('#status').textContent='草稿接收失败：'+error.message;});
  }else{
    editor.focusTextBlock(0,0);
  }
  loadTags();
  $('#composeEditor').setAttribute('role','textbox');$('#composeEditor').setAttribute('aria-multiline','true');$('#composeEditor').setAttribute('aria-label','记录想法');$('#composeEditor').setAttribute('aria-controls','tagMenu');$('#composeEditor').setAttribute('aria-autocomplete','list');
  let preferencesRevision=0;
  const applyPreferences=async()=>{const revision=++preferencesRevision;try{const value=await window.memoCompose.preferences();if(revision!==preferencesRevision||disposed)return;const p=MemoCore.displayPreferences(value.display),fonts={default:'var(--fl-font-memo)',system:'-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif',serif:'"Songti SC","SimSun",serif'};document.body.style.setProperty('--memo-font-family',fonts[p.font]);document.body.style.setProperty('--memo-font-size',p.fontSize+'px');document.body.style.setProperty('--memo-tag-font-size',({13:11,14:12,15:13,16:14,20:16,24:18,28:20,32:22}[p.fontSize]||p.fontSize-2)+'px');document.body.style.setProperty('--memo-line-height',String(p.font==='default'&&p.lineHeight===1.8?1.62:p.lineHeight));document.body.classList.toggle('dark',value.theme==='dark'||value.theme==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);editor?.setSpellcheck?.(p.spellcheck);}catch{}};
  applyPreferences();window.memoCompose.onPreferencesChanged(applyPreferences);window.addEventListener('focus',applyPreferences);matchMedia('(prefers-color-scheme: dark)').addEventListener('change',applyPreferences);
  $('#tagCompose').innerHTML=window.memoIcons.hash;$('#tagCompose').onclick=expandTagMenu;
  $('#imageCompose').onclick=()=>$('#composeImageInput').click();
  const readers=new Set();
  const stopReads=()=>{disposed=true;for(const reader of readers)reader.abort();readers.clear();};
  window.addEventListener('beforeunload',stopReads);
  function readImage(file,index,total){return new Promise((resolve,reject)=>{const reader=new FileReader();readers.add(reader);reader.onload=()=>{readers.delete(reader);resolve(reader.result);};reader.onerror=()=>{readers.delete(reader);reject(reader.error||Error('图片读取失败'));};reader.onabort=()=>{readers.delete(reader);reject(Error('读取已取消'));};reader.onprogress=e=>{if(!disposed&&e.lengthComputable)$('#status').textContent='图片 '+index+'/'+total+' · '+Math.round(e.loaded/e.total*100)+'%';};reader.readAsDataURL(file);});}
  async function addImages(files){
    if(busy||reading||disposed)return;
    if(files.reduce((sum,file)=>sum+file.size,0)>32*1024*1024){$('#status').textContent='单次图片总大小请不超过 32 MB，已有草稿保留';return;}
    reading=true;update();let failed=0,added=0;
    try{for(const [index,file]of files.entries()){
      if(disposed)break;$('#status').textContent='图片 '+(index+1)+'/'+files.length+' 读取中…';
      if(!/^image\/(png|jpeg|webp|gif)$/.test(file.type)||file.size>8*1024*1024){failed++;continue;}
      try{const src=await readImage(file,index+1,files.length);if(disposed)break;if(typeof src==='string'){const decoded=new Image();decoded.src=src;await decoded.decode();if(disposed)break;images.push(src);added++;renderImages();}}catch{failed++;}
    }}finally{reading=false;if(!disposed){renderImages();update();$('#status').textContent=failed?'已添加 '+added+' 张，'+failed+' 张未添加；支持 PNG、JPEG、WebP、GIF，单张不超过 8 MB。已有草稿保留':'';}}
  }
  $('#composeEditor').addEventListener('dragover',event=>{if(event.dataTransfer?.types.includes('Files'))event.preventDefault();});
  $('#composeEditor').addEventListener('drop',event=>{if(event.dataTransfer?.files.length){event.preventDefault();addImages([...event.dataTransfer.files]);}});
  $('#composeImageInput').onchange=async event=>{const files=[...event.target.files];event.target.value='';await addImages(files);};
  const formatPanel=$('#composeFormatPopover'),formatToggle=$('#boldCompose');
  function hideFormats(){formatPanel.hidden=true;formatToggle.setAttribute('aria-expanded','false');}
  formatToggle.onclick=()=>{if(busy)return;hideSelection();formatPanel.hidden=!formatPanel.hidden;formatToggle.setAttribute('aria-expanded',String(!formatPanel.hidden));if(!formatPanel.hidden){const r=formatToggle.getBoundingClientRect();formatPanel.style.bottom='auto';formatPanel.style.left=Math.max(8,Math.min(innerWidth-formatPanel.offsetWidth-8,r.left))+'px';formatPanel.style.top=Math.max(8,r.top-formatPanel.offsetHeight-6)+'px';}hideTagMenu();};
  $('#composeSelectionToolbar').onclick=event=>{const button=event.target.closest('[data-format]');if(button&&!busy){editor.command(button.dataset.format);update();return;}const act=event.target.closest('[data-action]');if(act&&!busy){if(act.dataset.action==='tag')$('#tagCompose').click();else if(act.dataset.action==='image')$('#imageCompose').click();}};
  for(const button of document.querySelectorAll('#composeFormatPopover [data-format],#composeSelectionToolbar [data-format]')){button.innerHTML=window.memoIcons[button.dataset.format]||'';button.onmousedown=event=>event.preventDefault();}
  for(const button of document.querySelectorAll('#composeSelectionToolbar [data-action]')){button.innerHTML=window.memoIcons[{tag:'hash',image:'image'}[button.dataset.action]]||'';button.onmousedown=event=>event.preventDefault();}
  formatPanel.onclick=event=>{const button=event.target.closest('[data-format]');if(button&&!busy){editor.command(button.dataset.format);update();}};
  $('#linkCompose').onmousedown=event=>event.preventDefault();
  $('#linkCompose').onclick=()=>{if(!busy){editor.insertText('@');editor.focus();setTimeout(suggestTags,0);}};
  $('#cancelCompose').onclick=()=>{if(busy||reading)return;editor.setText('');images=[];hideTagMenu();hideFormats();renderImages();update();editor.focus();};
  $('#listCompose').onclick=()=>editor.command('list');
  $('#numberCompose').onclick=()=>editor.command('number');
  $('#quoteCompose').onclick=()=>editor.command('quote');
  
  $('#closeCompose').onclick=()=>{if(busy)return;stopReads();window.memoCompose.close();};
  $('#pinCompose').onclick=async()=>{try{pinned=await window.memoCompose.pin(!pinned);$('#pinCompose').setAttribute('aria-pressed',String(pinned));$('#pinCompose').title=pinned?'取消窗口置顶':'窗口置顶';$('#pinCompose').setAttribute('aria-label',$('#pinCompose').title);$('#status').textContent=pinned?'窗口已置顶':'已取消置顶';setTimeout(()=>{if($('#status').textContent===(pinned?'窗口已置顶':'已取消置顶'))$('#status').textContent='';},1600);}catch(error){$('#status').textContent=error.message;}};
  const save=async()=>{if(busy||reading||disposed)return;hideTagMenu();const content=editor.getText().trim();if(!content&&!images.length){editor.focusTextBlock(0,0);return;}busy=true;editor.setEditable(false);update();try{await window.memoCompose.save({content,html:editor.getHTML(),images:[...images]});busy=false;editor.setEditable(true);editor.setText('');images=[];renderImages();update();$('#status').textContent='已保存';}catch(error){busy=false;editor.setEditable(true);update();$('#status').textContent='保存失败：'+error.message;}};
  $('#send').onclick=save;
  document.addEventListener('keydown',event=>{
    if(event.isComposing||event.keyCode===229||editor.isComposing())return;
    if(event.key==='Escape'&&!formatPanel.hidden){event.preventDefault();event.stopImmediatePropagation();hideFormats();formatToggle.focus();return;}
    if(event.key==='Escape'&&!$('#composeSelectionToolbar').hidden){event.preventDefault();event.stopImmediatePropagation();hideSelection(true);if($('#composeSelectionToolbar').contains(document.activeElement))editor.focus();return;}
    if(menu.hidden)return;
    if(!tagChoices.length){if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();hideTagMenu(true);}else if(event.key==='Enter'&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();event.stopImmediatePropagation();hideTagMenu();editor.insertText(' ');}return;}
    if(event.key==='ArrowDown'||event.key==='ArrowUp'){event.preventDefault();event.stopImmediatePropagation();const step=event.key==='ArrowDown'?1:-1;tagIndex=tagIndex<0?(step>0?0:tagChoices.length-1):tagRequest?.kind==='tag'?Math.max(0,Math.min(tagChoices.length-1,tagIndex+step)):(tagIndex+step+tagChoices.length)%tagChoices.length;for(const [index,button] of [...menu.children].entries()){button.setAttribute('aria-selected',String(index===tagIndex));button.classList.toggle('selected',index===tagIndex);}menu.children[tagIndex]?.scrollIntoView({block:'nearest'});return;}
    if((event.key==='Enter'&&tagIndex>=0||event.key==='Tab')&&!event.ctrlKey&&!event.metaKey&&!event.shiftKey&&!event.altKey){event.preventDefault();event.stopImmediatePropagation();chooseTag(Math.max(0,tagIndex));return;}
    if(event.key==='Tab'&&event.shiftKey&&tagRequest?.kind==='tag'&&!event.ctrlKey&&!event.altKey&&!event.metaKey){hideTagMenu(true);return;}
    if(event.key==='Escape'){event.preventDefault();event.stopImmediatePropagation();hideTagMenu(true);}
  },true);
  $('#composeEditor').addEventListener('keydown',event=>{
    if(event.isComposing||event.keyCode===229||event.key!=='Enter'||event.ctrlKey||event.metaKey||event.shiftKey||event.altKey)return;
    const request=editor?.queryAtCursor?.();if(!request?.query||!menu.hidden)return;
    if(dismissedTag===request.kind+':'+request.from+':'+request.query)return;
    event.preventDefault();event.stopImmediatePropagation();editor.insertText(' ');
  },true);
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('#composeEditor,#tagMenu,#tagCompose'))hideTagMenu();},true);
  document.addEventListener('pointerdown',event=>{if(!event.target.closest('#composeFormatPopover,#boldCompose'))hideFormats();if(!event.target.closest('#composeEditor,#composeSelectionToolbar'))hideSelection();},true);
  $('#composeEditor').addEventListener('scroll',()=>{hideSelection();if(!menu.hidden)positionTags();});window.addEventListener('resize',()=>{hideSelection();if(!menu.hidden)positionTags();});document.addEventListener('focusin',()=>{if(!$('#composeEditor').contains(document.activeElement)&&!$('#composeSelectionToolbar').contains(document.activeElement))hideSelection();});
  $('#composeEditor').addEventListener('blur',()=>setTimeout(()=>{const active=document.activeElement;if(active===$('#composeEditor')||$('#composeEditor').contains(active)||menu.contains(active)||active?.closest?.('#tagMenu,#tagCompose'))return;hideTagMenu();},120));
  document.addEventListener('keydown',event=>{if(event.isComposing||event.keyCode===229||editor.isComposing()||event.defaultPrevented)return;if((event.ctrlKey||event.metaKey||event.shiftKey)&&event.key==='Enter'){event.preventDefault();save();}if(event.key==='Escape'&&!busy){stopReads();window.memoCompose.close();}});
})();
