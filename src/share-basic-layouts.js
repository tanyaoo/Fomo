const localDay=value=>{const date=new Date(value);return Number.isFinite(date.getTime())?`${date.getFullYear()}-${date.getMonth()+1}-${date.getDate()}`:'';};

export function applyBasicShareLayout(root,m,template,settings,api,escape,icon){
  if(!['plain','letter','ink','excerpt'].includes(template.id))return;
  const state=api.state(),memos=state.memos.filter(note=>!note.deleted),days=MemoCore.usedDayCount(state);
  const stat=memos.length+' MEMOS · '+days+' DAYS',created=new Date(m.created),year=created.getFullYear(),month=String(created.getMonth()+1).padStart(2,'0'),day=String(created.getDate()).padStart(2,'0');
  const date=year+'/'+month+'/'+day,profile=escape(api.state().profile||'我的笔记');
  let header=root.querySelector('.share-card-header');
  if(!header){header=document.createElement('header');header.className='share-card-header';root.prepend(header);}
  const footer=root.querySelector('.share-card-footer');
  if(template.id==='plain'||template.id==='ink'){
    header.innerHTML='<span class="share-basic-time">'+date+'</span>';
    footer.innerHTML='<div class="share-basic-info">'+(settings.brand?'<b class="share-basic-brand">Fomo</b>':'')+(settings.personal?'<div class="share-basic-author">'+profile+'</div><div class="share-basic-stat">'+stat+'</div>':'')+'</div>';
    if(settings.personal){
      const heatmap=document.createElement('div');heatmap.className='share-mini-heatmap';heatmap.setAttribute('aria-hidden','true');
      const counts=new Map();for(const memo of memos){const key=localDay(memo.created);counts.set(key,(counts.get(key)||0)+1);}
      const latest=Math.max(created.getTime(),...memos.map(note=>new Date(note.created).getTime()).filter(Number.isFinite));
      for(let index=0;index<49;index++){
        const date=new Date(latest);date.setDate(date.getDate()-48+index);
        const count=counts.get(localDay(date))||0,cell=document.createElement('span');
        cell.style.backgroundColor=count>3?'#459d78':count>1?'#70bd9b':count?'#aad9c5':template.id==='ink'?'#333b37':'#e6eeea';heatmap.append(cell);
      }
      footer.append(heatmap);
    }
    if(!settings.brand&&!settings.personal)footer.replaceChildren();
  }
  if(template.id==='letter'){
    header.innerHTML=(settings.brand?'<b class="share-letter-brand">Fomo</b>':'<span></span>')+'<span>'+date+'</span>';
    footer.innerHTML=settings.personal?'<span class="share-stat-line"></span><span class="share-basic-stat">'+stat+'</span><span class="share-stat-line"></span>':'';
  }
  if(template.id==='excerpt'){
    const chapter=[...memos].sort((a,b)=>new Date(a.created)-new Date(b.created)).findIndex(note=>note.id===m.id)+1;
    header.innerHTML='<span class="share-excerpt-quote">'+icon('quote')+'</span>'+(settings.personal?'<b>Chapter. '+chapter+'</b>':'<span></span>')+'<span class="share-excerpt-quote share-excerpt-quote-end">'+icon('quote')+'</span>';
    footer.innerHTML=(settings.brand?'<b class="share-excerpt-brand">Fomo</b>':'')+(settings.personal?'<div class="share-basic-author">'+profile+'</div>':'')+'<div class="share-excerpt-date">'+year+'.'+month+'.'+day+'</div>';
  }
}
