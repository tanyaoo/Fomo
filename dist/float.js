(() => {
  'use strict';
  const $=s=>document.querySelector(s), api=window.memoFloat;
  const undo=$("#undo");
  let undoTimer=0;
  const showUndo=()=>{if(!undo)return;undo.hidden=false;clearTimeout(undoTimer);undoTimer=setTimeout(()=>{undo.hidden=true;if(!current.items.length)api.collapse().catch(()=>{});},6000);};
  const hideUndo=()=>{if(!undo)return;undo.hidden=true;clearTimeout(undoTimer);};
  const esc=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  let current={expanded:false,items:[]};
  const status=text=>{const el=$('#status');if(el){el.textContent=text;clearTimeout(status.timer);status.timer=setTimeout(()=>{if(el.textContent===text)el.textContent='';},1800);}};
  function card(item){
    const text=String(item.content||'').replace(/\s+/g,' ').trim()||'图片笔记';
    const preview=esc(text).replace(/(^|\s)(#[^\s#]+)/g,'$1<span class="tag">$2</span>');
    const b=document.createElement('article');b.className='card';b.dataset.id=item.id;
    b.innerHTML=`<div class="line"><span class="text">${preview}</span></div><button class="remove" aria-label="移出浮窗" title="移出浮窗">×</button>`;
    b.onclick=()=>api.open(item.id).catch(error=>status(error.message));
    b.querySelector('.remove').onclick=event=>{event.stopPropagation();api.remove(item.id).catch(error=>status(error.message));};
    return b;
  }
  function render(){
    const expanded=!!current.expanded,has=current.items.length>0;
    $('#panel').hidden=!expanded;
    $('#collapsed').style.display=expanded?'none':'grid';
    if(!expanded)return;
    $('#count').textContent=`${current.items.length}条笔记`;
    $('#cards').replaceChildren();
    for(const item of current.items)$('#cards').append(card(item));
    if(!has){const p=document.createElement('p');p.id='empty';p.textContent='浮窗里还没有笔记';$('#cards').append(p);}
    $('#status').textContent='';
  }
  async function load(){try{current=await api.read();render();}catch(error){console.error(error);}}
  $('#expand').onclick=()=>api.expand().catch(error=>console.error(error));
  $('#copy').onclick=()=>api.copy().then(()=>status('已复制全部 ' + current.items.length + ' 条笔记')).catch(error=>status(error.message));
  $('#undo').onclick=()=>api.restore().then(count=>{hideUndo();if(count)status('撤销成功');}).catch(error=>status(error.message));
  $('#clear').onclick=()=>{const count=current.items.length;if(!count)return;showUndo();api.clear().then(()=>setTimeout(()=>status('已清空浮窗中的 '+count+' 条笔记'),0)).catch(error=>{hideUndo();status(error.message);});};
  document.addEventListener('keydown',event=>{if(event.key==='Escape')api.collapse().catch(()=>{});});
  window.memoFloat.onState(load);
  load();
})();
