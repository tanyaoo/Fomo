/* Paint tag ranges without rewriting contenteditable or its undo history. */
(() => {
  'use strict';
  const composing=new WeakSet(),bound=new WeakSet();
  function paint(editor){
    if(!globalThis.CSS?.highlights||!globalThis.Highlight||composing.has(editor))return;
    let text='';const nodes=[];
    function visit(node){
      if(node.nodeType===Node.TEXT_NODE){const start=text.length;text+=node.data;nodes.push({node,start,end:text.length});return;}
      if(node.nodeName==='BR'){text+='\n';return;}
      if(['DIV','P','LI','BLOCKQUOTE'].includes(node.nodeName)&&text&&!text.endsWith('\n'))text+='\n';
      for(const child of node.childNodes)visit(child);
    }
    for(const child of editor.childNodes)visit(child);
    const ranges=[];
    // Same token boundaries as MemoCore: URL fragments are never tags.
    for(const match of text.matchAll(/https?:\/\/[^\s<>]+|(?<![\p{L}\p{N}_/#])#[\p{L}\p{N}_\-/]+/gu)){
      if(match[0][0]!=='#'||!MemoCore.tagsOf(match[0]).length)continue;
      const start=match.index,end=start+match[0].length;
      const first=nodes.find(n=>n.start<=start&&n.end>start),last=nodes.find(n=>n.start<end&&n.end>=end);
      if(!first||!last)continue;
      const range=new Range();range.setStart(first.node,start-first.start);range.setEnd(last.node,end-last.start);ranges.push(range);
    }
    CSS.highlights.set('memo-editor-tags',new Highlight(...ranges));
  }
  function bind(editor){
    if(bound.has(editor))return;bound.add(editor);
    editor.addEventListener('compositionstart',()=>composing.add(editor));
    editor.addEventListener('compositionend',()=>{composing.delete(editor);paint(editor);});
  }
  window.MemoEditorTags={paint,bind};
})();
