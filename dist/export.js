(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.MemoExport=api;})(globalThis,function(){
 'use strict';
 const escape=value=>String(value??'').replace(/[&<>"']/g,ch=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[ch]));
 const anchor=id=>'memo-'+encodeURIComponent(id);
 function html(memos,profile,renderBody){
  const notes=memos.filter(m=>!m.deleted),ids=new Set(notes.map(m=>m.id));
  const articles=notes.map(m=>{
   const body=typeof renderBody==='function'?renderBody(m):null;
   const images=(m.images||[]).filter(src=>/^data:image\/(?:png|jpeg|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(src)).map((src,i)=>`<img src="${escape(src)}" alt="笔记图片 ${i+1}" loading="lazy">`).join('');
   const media=[['audio',m.audio],['video',m.video]].filter(([type,src])=>typeof src==='string'&&new RegExp('^data:'+type+'/[a-z0-9.+-]+;base64,[a-zA-Z0-9+/=]+$').test(src)).map(([type,src])=>`<${type} controls preload="none" src="${escape(src)}"></${type}>`).join('');
   const references=(m.references||[]).filter(id=>ids.has(id)).map(id=>`<a href="#${escape(anchor(id))}">查看引用笔记</a>`).join(' · ');
   const annotations=!m.annotationsMigrated?(m.annotations||[]).map(a=>`<blockquote><time>${escape(a.created)}</time><div class="content">${escape(a.content)}</div></blockquote>`).join(''):'';
   return `<article id="${escape(anchor(m.id))}"><time>${escape(m.created)}</time><div class="content${body?' rich':''}">${body||escape(m.content)}</div><div class="media">${images}${media}</div>${references?`<nav>${references}</nav>`:''}${annotations}</article>`;
  }).join('\n');
  return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data:; media-src data:; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escape(profile)} · Fomo 笔记</title><style>body{margin:0;background:#f7f7f7;color:#333;font:14px/1.8 system-ui,"Microsoft YaHei",sans-serif}main{max-width:800px;margin:40px auto;padding:0 20px}h1{font-size:24px}header p,time{color:#888;font-size:12px}article{margin:16px 0;padding:24px;border-radius:12px;background:white;overflow-wrap:anywhere;scroll-margin-top:16px}.content{white-space:pre-wrap;margin-top:12px}.content.rich{white-space:normal}.content p{margin:0 0 .5em}.content :is(ul,ol){padding-left:24px}.content a{overflow-wrap:anywhere}.media{display:flex;flex-wrap:wrap;gap:8px;margin-top:12px}img,video{max-width:100%;height:auto;border-radius:6px}audio{max-width:100%}nav{margin-top:12px}a{color:#329867}blockquote{margin:16px 0 0;border-left:2px solid #ddd;padding-left:12px}@media print{body{background:white}article{border:1px solid #eee;break-inside:avoid}}</style></head><body><main><header><h1>${escape(profile)}的笔记</h1><p>共 ${notes.length} 条 · 本地离线阅读副本</p></header>${articles||'<p>没有可导出的笔记。</p>'}</main></body></html>`;
 }
 function csvSample(){return '\uFEFFcontent,created_at\r\n"这是第一条示例笔记 #阅读",2026-01-01 09:00:00\r\n"支持多行内容：\n记录一个想法，稍后回顾。 #想法",2026-01-02 18:30:00\r\n';}
 return {html,csvSample};
});
