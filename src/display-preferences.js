// The main workspace and native note windows use the same reading preferences.
export function applyDisplayPreferences(value){
  const p=window.MemoCore.displayPreferences(value),body=document.body;
  const fonts={default:'var(--fl-font-memo)',system:'-apple-system,BlinkMacSystemFont,"Segoe UI","Microsoft YaHei",sans-serif',serif:'"Songti SC","SimSun",serif'};
  const windows=/Windows/i.test(navigator.userAgent);
  body.style.setProperty('--memo-font-family',fonts[p.font]);
  body.dataset.displayFont=p.font;
  body.classList.toggle('system-font-sidebar',p.font==='system');
  body.classList.toggle('system-font-win',p.font==='system'&&windows);
  body.style.setProperty('--memo-font-size',p.fontSize+'px');
  body.style.setProperty('--memo-tag-font-size',({13:11,14:12,15:13,16:14,20:16,24:18,28:20,32:22}[p.fontSize]||p.fontSize-2)+'px');
  body.style.setProperty('--memo-line-height',String(p.font==='default'&&p.lineHeight===1.8?1.62:p.lineHeight));
  const listPad={13:20,14:22,15:24,16:26,20:32,24:36,28:40,32:44};
  body.style.setProperty('--memo-ul-padding-left',(listPad[p.fontSize]||22)+'px');
  body.classList.toggle('heatmap-hidden',!p.showHeatmap);
  body.classList.toggle('note-sources-visible',p.showSources);
  document.querySelectorAll('[data-structured-editor]').forEach(node=>node.memoEditor?.setSpellcheck?.(p.spellcheck));
  document.querySelectorAll('.ProseMirror').forEach(node=>node.setAttribute('spellcheck',String(p.spellcheck)));
}

export function sourceLabel(m){
  return {direct:'直接记录',annotation:'引用',reflection:'联想',import:'导入'}[window.MemoCore.sourceOf(m)];
}

// Collapsing affects presentation only; annotations remain separate.
export function referenceGroup(root,label,fold){
  if(!fold)return root;
  const group=document.createElement('details');group.className='reference-fold';
  const summary=document.createElement('summary');summary.textContent=label;
  const content=document.createElement('div');content.className='reference-fold-content';
  group.append(summary,content);root.append(group);return content;
}
