/* Shared, inert rich-text rendering for the main window and read-only viewers. */
(() => {
  'use strict';
  const escape=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function referenceBody(m){
    const importedPrefix=m.annotationOf?(String(m.content||'').match(/^关联自：https?:\/\/[^/\s]+\/mine\/\?(?:[^\s#]*&)?memo_id=[a-zA-Z0-9_-]{1,100}(?=\s|$)/)||[])[0]||'':'';
    const prefix=m.annotationOf?[...['fomo','writeboom','memo-flow'].map(scheme=>'关联自：'+scheme+'://note/'+m.annotationOf),...(importedPrefix?[importedPrefix]:[])].find(value=>m.content.startsWith(value)&&!/[a-zA-Z0-9_-]/.test(m.content[value.length]||''))||'':'';
    let result=m;
    if(prefix&&m.content.startsWith(prefix)&&!/[a-zA-Z0-9-]/.test(m.content[prefix.length]||'')){
      let html=m.html;
      if(html){const t=document.createElement('template');t.innerHTML=clean(html);const walk=document.createTreeWalker(t.content,NodeFilter.SHOW_TEXT);let remaining=prefix.length,node;const remove=[];while(remaining&&(node=walk.nextNode())){const n=Math.min(remaining,node.textContent.length);node.textContent=node.textContent.slice(n);remaining-=n;if(!node.textContent)remove.push(node);}remove.forEach(n=>n.remove());for(const el of [...t.content.children]){if(el.textContent.trim()||el.matches('img,hr')||el.querySelector('img,hr'))break;el.remove();}html=t.innerHTML;}
      result={...m,content:m.content.slice(prefix.length).replace(/^\s*\n/,''),html};
    }
    if(result.annotationOf&&result.html){
      const t=document.createElement('template');t.innerHTML=clean(result.html);let changed=false;
      for(const link of t.content.querySelectorAll('a[href]')){
        const href=link.getAttribute('href')||'',internal=/^(?:fomo|writeboom|memo-flow):\/\/note\/([a-zA-Z0-9-]{1,100})$/.exec(href),legacy=/^https?:\/\/[^/\s]+\/mine\/\?(?:[^\s#]*&)?memo_id=([a-zA-Z0-9_-]{1,100})/.exec(href),id=internal?.[1]||legacy?.[1];
        if(id===result.annotationOf){link.remove();changed=true;}
      }
      if(changed){for(const block of [...t.content.querySelectorAll('p,div')])if(!block.textContent.trim()&&!block.querySelector('img,hr,a,ul,ol'))block.remove();result={...result,html:t.innerHTML};}
    }
    if(result.annotationOf){
      const tokenRE=/https?:\/\/[^\s<>]+|(?:fomo|writeboom|memo-flow):\/\/note\/[a-zA-Z0-9-]+/g,content=String(result.content||'').replace(tokenRE,token=>{
        const internal=/^(?:fomo|writeboom|memo-flow):\/\/note\/([a-zA-Z0-9-]{1,100})$/.exec(token),legacy=/^https?:\/\/[^/\s]+\/mine\/\?(?:[^\s#]*&)?memo_id=([a-zA-Z0-9_-]{1,100})/.exec(token);
        return (internal?.[1]||legacy?.[1])===result.annotationOf?'':token;
      }).replace(/[ \t]+\n/g,'\n').replace(/\n{3,}/g,'\n\n').replace(/\s+$/,'');
      if(content!==result.content)result={...result,content};
    }
    return result;
  }
  function clean(html){
    const t=document.createElement('template');t.innerHTML=html||'';
    t.content.querySelectorAll('script,style,iframe,object,svg,math,template,form').forEach(node=>node.remove());
    // A plain note has no table node: retain cell boundaries and row breaks on paste.
    for(const row of [...t.content.querySelectorAll('tr')]){const cells=[...row.children].filter(cell=>['TD','TH'].includes(cell.tagName));if(cells.length){const paragraph=document.createElement('p');paragraph.textContent=cells.map(cell=>cell.textContent.trim()).join(' | ');row.replaceWith(paragraph);}}
    const allowed=new Set(['B','STRONG','U','MARK','UL','OL','LI','P','DIV','BR','EM','I','BLOCKQUOTE','A','CODE','PRE','HR','H1','H2','H3','H4','H5','H6']);
    const walk=node=>{for(const child of [...node.children]){
      if(['SCRIPT','STYLE','IFRAME','OBJECT','SVG','MATH','TEMPLATE','FORM','INPUT','SELECT','TEXTAREA'].includes(child.tagName.toUpperCase())){child.remove();continue;}
      // Word often encodes semantic formatting in spans. Preserve meaning, strip styling.
      if(child.tagName==='SPAN'){
        const marks=[];if(child.style.fontWeight==='bold'||Number(child.style.fontWeight)>=600)marks.push('strong');if(child.style.fontStyle==='italic')marks.push('em');if(child.style.textDecoration.includes('underline')||child.style.textDecorationLine.includes('underline'))marks.push('u');
        for(const tag of marks){const wrap=document.createElement(tag);wrap.append(...child.childNodes);child.append(wrap);}
      }
      walk(child);
      if(!allowed.has(child.tagName)){child.replaceWith(...child.childNodes);continue;}
      const id=child.getAttribute('data-memo-id'),href=child.getAttribute('href');
      const reference=child.tagName==='A'&&typeof id==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(id);
      const link=child.tagName==='A'&&typeof href==='string'&&/^(https?:\/\/|mailto:)/i.test(href);
      for(const a of [...child.attributes])if(!(child.tagName==='OL'&&a.name==='start'&&/^\d{1,6}$/.test(a.value)))child.removeAttribute(a.name);
      if(reference){child.setAttribute('data-memo-id',id);child.setAttribute('href','fomo://note/'+id);child.className='memo-reference';}
      else if(link){child.setAttribute('href',href);child.setAttribute('target','_blank');child.setAttribute('rel','noopener noreferrer');}
      else if(child.tagName==='A')child.replaceWith(...child.childNodes);
    }};
    walk(t.content);for(const link of t.content.querySelectorAll('a[href]')){const id=MemoCore.memoIdFromToken(link.getAttribute('href'));if(id){link.dataset.memoId=id;link.className='memo-reference';link.setAttribute('contenteditable','false');}}return t.innerHTML;
  }
  function plainHTML(content){let html='',list='';for(const line of String(content||'').split(/\r?\n/)){const unordered=/^\s*[-*+]\s+(.*)$/.exec(line),ordered=/^\s*(\d+)[.)]\s+(.*)$/.exec(line),kind=unordered?'ul':ordered?'ol':'';if(kind){if(list!==kind){if(list)html+='</'+list+'>';html+=kind==='ol'?'<ol start="'+Number(ordered[1])+'">':'<ul>';list=kind;}html+='<li><p>'+escape(unordered?.[1]||ordered?.[2]||'')+'</p></li>';}else{if(list){html+='</'+list+'>';list='';}html+=/^\s*>\s?/.test(line)?'<blockquote><p>'+escape(line.replace(/^\s*>\s?/,''))+'</p></blockquote>':'<p>'+(line?escape(line):'<br>')+'</p>';}}return html+(list?'</'+list+'>':'');}
  function rich(m){const t=document.createElement('template');t.innerHTML=m.html?clean(m.html):plainHTML(m.content);const walker=document.createTreeWalker(t.content,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())if(!walker.currentNode.parentElement?.closest('a,code,pre'))nodes.push(walker.currentNode);for(const n of nodes){const parts=document.createDocumentFragment();let cursor=0;for(const token of MemoCore.tokens(n.textContent)){parts.append(n.textContent.slice(cursor,token.index));const raw=token[0],memoId=MemoCore.memoIdFromToken(raw),url=raw.startsWith('http')?raw.replace(/[.,!?;:，。！？；：)）\]】}]+$/,''):raw,trailing=raw.slice(url.length);let e;if(memoId){e=document.createElement('a');e.href=url;e.dataset.memoId=memoId;e.className='memo-reference';e.textContent=url;}else if(raw.startsWith('http')){e=document.createElement('a');e.href=url;e.target='_blank';e.rel='noopener noreferrer';e.textContent=url;}else{e=document.createElement('span');e.className='tag-link';e.dataset.tag=MemoCore.normalizeTag(raw.slice(1));e.textContent=url;}parts.append(e);if(trailing)parts.append(trailing);cursor=token.index+raw.length;}parts.append(n.textContent.slice(cursor));n.replaceWith(parts);}return t.innerHTML;}
  function highlight(root,query){root.querySelectorAll('mark.search-hit').forEach(m=>m.replaceWith(...m.childNodes));root.normalize();const terms=[...new Set(query.trim().split(/\s+/).filter(Boolean))].sort((a,b)=>b.length-a.length);if(!terms.length)return;const pattern=new RegExp(terms.map(t=>t.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')).join('|'),'giu');const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);for(const node of nodes){const matches=[...node.textContent.matchAll(pattern)];if(!matches.length)continue;let start=0;const fragment=document.createDocumentFragment();for(const match of matches){fragment.append(node.textContent.slice(start,match.index));const mark=document.createElement('mark');mark.className='search-hit';mark.textContent=match[0];fragment.append(mark);start=match.index+match[0].length;}fragment.append(node.textContent.slice(start));node.replaceWith(fragment);}}
  function referenceSnippet(content,query){
    const text=String(content||'').replace(/(?:fomo|writeboom|memo-flow):\/\/note\/[a-zA-Z0-9-]+|https?:\/\/[^/\s]+\/mine\/\?[^\s<>]*memo_id=[a-zA-Z0-9_-]+/g,'关联笔记').replace(/\s+/g,' '),needle=String(query||'').trim().toLowerCase();
    const hit=needle?text.toLowerCase().indexOf(needle):-1,start=Math.max(0,hit-30);
    return (start?'...':'')+text.slice(start);
  }
  function tagLabel(name,query){
    name=String(name);query=String(query||'');if(!query)return escape(name);
    const pattern=new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),'giu');let html='',cursor=0;
    for(const match of name.matchAll(pattern)){html+=escape(name.slice(cursor,match.index))+'<span class="tag-match">'+escape(match[0])+'</span>';cursor=match.index+match[0].length;}
    return html+escape(name.slice(cursor));
  }
  function tagPopupPosition(anchor,width,height,viewportWidth,viewportHeight,topLimit=10){
    const left=Math.max(10,Math.min(anchor.left,viewportWidth-width-10));
    const below=anchor.bottom+8;
    const top=below+height>viewportHeight-10?Math.max(topLimit,anchor.top-height-8):below;
    return {left:Math.round(left),top:Math.round(top)};
  }
  window.MemoMarkup={escape,clean,plainHTML,rich:m=>rich(referenceBody(m)),referenceBody,highlight,referenceSnippet,tagLabel,tagPopupPosition};
})();
