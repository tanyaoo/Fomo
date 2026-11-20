// Shared by the main app and native reader. Retrying never changes saved attachments.
export function installMediaFeedback(root=document){
  const states=new WeakMap();let sequence=0;
  const style=document.createElement('style');
  style.textContent='.media-load-feedback{display:flex;align-items:center;gap:10px;margin:8px 0;color:var(--muted,#777);font-size:12px;line-height:1.6}.media-load-feedback button{flex:none;padding:3px 9px;border:1px solid var(--border,#ddd);border-radius:5px;background:transparent;color:inherit;font:inherit;cursor:pointer}.media-load-feedback button:focus-visible{outline:2px solid var(--tag,#5884ff);outline-offset:2px}.media-load-feedback button:disabled{cursor:default;opacity:.6}';
  document.head.append(style);
  const isMedia=target=>target instanceof HTMLMediaElement;
  const clear=(media,restoreFocus=false)=>{
    const state=states.get(media);if(!state)return;
    const focused=restoreFocus&&state.row.contains(document.activeElement);
    clearTimeout(state.timer);state.row.remove();states.delete(media);
    const ids=(media.getAttribute('aria-describedby')||'').split(/\s+/).filter(id=>id&&id!==state.row.id);
    if(ids.length)media.setAttribute('aria-describedby',ids.join(' '));else media.removeAttribute('aria-describedby');
    if(focused)media.focus({preventScroll:true});
  };
  const show=media=>{
    if(!media.isConnected)return;
    clear(media);
    const label=media.tagName==='AUDIO'?'音频':'视频',row=document.createElement('div'),text=document.createElement('span'),button=document.createElement('button');
    row.className='media-load-feedback';row.id='media-load-feedback-'+(++sequence);row.setAttribute('role','status');
    text.textContent=label+'加载失败，原附件仍保留。';button.type='button';button.textContent='重试';button.setAttribute('aria-label','重新加载'+label);
    row.append(text,button);media.after(row);media.setAttribute('aria-describedby',[media.getAttribute('aria-describedby'),row.id].filter(Boolean).join(' '));
    const state={row,timer:null,pending:false};states.set(media,state);
    button.onclick=()=>{
      if(!media.hasAttribute('tabindex'))media.tabIndex=0;
      media.focus({preventScroll:true});
      state.pending=true;button.disabled=true;text.textContent='正在重新加载'+label+'…';
      state.timer=setTimeout(()=>{if(states.get(media)!==state)return;if(!media.isConnected){clear(media);return;}state.pending=false;button.disabled=false;text.textContent=label+'尚未加载完成，请重试。';},12000);
      try{media.load();}catch{show(media);}
    };
  };
  root.addEventListener('error',event=>{if(isMedia(event.target))show(event.target);},true);
  root.addEventListener('loadedmetadata',event=>{if(isMedia(event.target))clear(event.target,true);},true);
  root.addEventListener('loadstart',event=>{if(isMedia(event.target)&&!states.get(event.target)?.pending)clear(event.target);},true);
}
