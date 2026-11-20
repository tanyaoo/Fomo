import {Schema,Slice,DOMParser as Parser,DOMSerializer} from 'prosemirror-model';
import {EditorState,Plugin,TextSelection} from 'prosemirror-state';
import {EditorView,Decoration,DecorationSet} from 'prosemirror-view';
import {schema as basic} from 'prosemirror-schema-basic';
import {addListNodes,wrapInList,splitListItem,liftListItem,sinkListItem} from 'prosemirror-schema-list';
import {baseKeymap,toggleMark,chainCommands,setBlockType,wrapIn,lift} from 'prosemirror-commands';
import {history,undo,redo,closeHistory} from 'prosemirror-history';
import {keymap} from 'prosemirror-keymap';
import {InputRule,inputRules,wrappingInputRule,textblockTypeInputRule} from 'prosemirror-inputrules';

const validId=id=>typeof id==='string'&&/^[a-zA-Z0-9-]{1,100}$/.test(id);
const referenceURL=id=>'fomo://note/'+id;
const marks=basic.spec.marks.remove('link')
  .addToEnd('underline',{parseDOM:[{tag:'u'},{style:'text-decoration=underline'}],toDOM:()=>['u',0]})
  .addToEnd('highlight',{parseDOM:[{tag:'mark'}],toDOM:()=>['mark',0]})
  ;
const referenceNode={inline:true,group:'inline',atom:true,selectable:true,attrs:{id:{},label:{default:''}},
  parseDOM:[{tag:'a[data-memo-id]',getAttrs:dom=>{const id=dom.getAttribute('data-memo-id'),text=dom.textContent||'';return validId(id)&&text.startsWith('↗ ')?{id,label:text.slice(2)}:false;}}],
  toDOM:node=>['a',{'data-memo-id':node.attrs.id,href:referenceURL(node.attrs.id)},'↗ '+node.attrs.label]};
const nodes=addListNodes(basic.spec.nodes.remove('image').addBefore('text','memo_reference',referenceNode),'paragraph block*','block');
function referenceLabel(memo){
 const date=new Date(memo.created),stamp=Number.isNaN(date.valueOf())?'日期未知':date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
 const content=String(memo.content||''),body=content.replace(/(^|\s)#[^\s#]+/g,' ').replace(/\s+/g,' ').trim();
 const chars=Array.from(body),preview=chars.slice(0,20).join('')+(chars.length>20?'…':'');
 return [stamp,preview||'图片笔记'].join(' ');
}
const schema=new Schema({nodes,marks});
const highlightPattern=/==(?!\s+==)([^=]+)==(?!\s+==)$/;
const highlightInputRule=new InputRule(highlightPattern, (state,match,start,end)=>{
  const content=match[1];
  const tr=state.tr.replaceWith(start,end,state.schema.text(content,[schema.marks.highlight.create()]));
  return tr.setSelection(TextSelection.create(tr.doc,start+content.length));
});
const escape=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const memoTokenRE=/(?:https?:\/\/[^/\s]+\/mine\/\?(?:[^\s<>]*&)?memo_id=[a-zA-Z0-9_-]{1,100}|(?:fomo|writeboom|memo-flow):\/\/note\/[a-zA-Z0-9-]{1,100})/g;
// The editor shows a memo reference as link text, not as a chip.
function inlineHTML(text,highlight=false){
  const source=String(text);let html='',cursor=0;
  for(const match of source.matchAll(memoTokenRE)){
    const id=window.MemoCore?.memoIdFromToken?.(match[0])||'';
    if(!validId(id))continue;
    html+=escape(source.slice(cursor,match.index));
    html+=escape(referenceURL(id));
    cursor=match.index+match[0].length;
  }
  html+=escape(source.slice(cursor));
  return highlight?html.replace(/==(?!\s+==)([^=]+)==(?!\s+==)/g,'<mark>$1</mark>'):html;
}
function plainHTML(text,{highlight=false}={}){
  const lines=text.replace(/\r\n?/g,'\n').split('\n');let html='',list='';
  for(const line of lines){
    const unordered=/^\s*[-*+]\s+(.+)$/.exec(line),ordered=/^\s*(\d+)[.)]\s+(.+)$/.exec(line),kind=unordered?'ul':ordered?'ol':'';
    if(kind){if(list!==kind){if(list)html+='</'+list+'>';html+=kind==='ol'?'<ol start="'+Number(ordered[1])+'">':'<ul>';list=kind;}html+='<li><p>'+inlineHTML(unordered?unordered[1]:ordered[2],highlight)+'</p></li>';}
    else{if(list){html+='</'+list+'>';list='';}html+=line.startsWith('> ')?'<blockquote><p>'+inlineHTML(line.slice(2),highlight)+'</p></blockquote>':'<p>'+inlineHTML(line,highlight)+'</p>';}
  }
  return html+(list?'</'+list+'>':'');
}
function textOf(doc,display=false){
  const block=(node,depth=0)=>{
    if(node.isText)return node.text;
    if(node.type.name==='memo_reference')return display?'↗ '+node.attrs.label:referenceURL(node.attrs.id);
    if(node.type.name==='hard_break')return '\n';
    // Legacy contenteditable used <p><br></p> for a blank paragraph.
    // The block separator already accounts for that line; do not count it twice.
    if(node.isTextblock&&node.childCount===1&&node.firstChild.type.name==='hard_break')return '';
    if(node.type.name==='bullet_list'||node.type.name==='ordered_list'){
      const lines=[];node.forEach((child,offset,index)=>{const prefix=node.type.name==='bullet_list'?'- ':String((node.attrs.order||1)+index)+'. ';lines.push('  '.repeat(depth)+prefix+block(child,depth+1).trim());});return lines.join('\n');
    }
    const parts=[];node.forEach(child=>parts.push(block(child,depth)));
    return parts.join(node.isTextblock?'':'\n');
  };
  return block(doc);
}
// Keep copied rich text inert and portable. The editor removes paragraph wrappers
// inside list items before putting HTML on the clipboard.
function copyHTML(html){
  const holder=document.createElement('div');holder.innerHTML=html;
  holder.querySelectorAll('li').forEach(item=>{
    for(const child of [...item.children]){
      if(child.tagName!=='P')continue;
      while(child.firstChild)item.insertBefore(child.firstChild,child);
      child.remove();
    }
  });
  return holder.innerHTML;
}
function copyListText(list,depth=0){
  const ordered=list.tagName==='OL',lines=[],items=[...list.children].filter(child=>child.tagName==='LI');
  items.forEach((item,index)=>{
    const clone=item.cloneNode(true);clone.querySelectorAll('ul,ol').forEach(node=>node.remove());
    const text=clone.textContent.replace(/\s+/g,' ').trim(),indent='  '.repeat(depth),marker=ordered?String(index+1)+'.':'-';
    lines.push(text?indent+marker+' '+text:indent+marker);
    for(const child of [...item.children])if(child.tagName==='UL'||child.tagName==='OL')lines.push(...copyListText(child,depth+1));
  });
  return lines;
}
function copyInlineText(nodes){
  let text='';
  for(const node of nodes||[]){
    if(node.nodeType===Node.TEXT_NODE){text+=node.textContent;continue;}
    if(node.nodeType!==Node.ELEMENT_NODE)continue;
    const tag=node.tagName;
    if(tag==='BR'){text+='\n';continue;}
    if(tag==='UL'||tag==='OL'){
      const lines=copyListText(node);
      if(lines.length&&text&&!/\n$/.test(text))text+='\n';
      text+=lines.join('\n');
      if(!/\n$/.test(text))text+='\n';
      continue;
    }
    if(tag==='DIV'||tag==='P'||/^H[1-6]$/.test(tag)||tag==='BLOCKQUOTE'){
      const blocks=copyBlocks([node]);
      if(blocks&&text&&!/\n$/.test(text))text+='\n';
      text+=blocks;
      if(!/\n$/.test(text))text+='\n';
      continue;
    }
    text+=copyInlineText(node.childNodes);
  }
  return text;
}
function copyBlocks(nodes){
  const blocks=[],inline=[];
  const flush=()=>{
    if(!inline.length)return;
    const text=copyInlineText(inline);inline.length=0;
    if(text.trim())blocks.push(text.trim());
  };
  for(const node of nodes||[]){
    if(node.nodeType===Node.TEXT_NODE){inline.push(node);continue;}
    if(node.nodeType!==Node.ELEMENT_NODE)continue;
    const tag=node.tagName;
    if(tag==='UL'||tag==='OL'){
      flush();const lines=copyListText(node);if(lines.length)blocks.push(...lines);
    }else if(tag==='BR'){
      flush();
    }else if(tag==='P'||/^H[1-6]$/.test(tag)||tag==='BLOCKQUOTE'){
      flush();const text=copyInlineText(node.childNodes);if(text.trim())blocks.push(text.trim());
    }else if(tag==='DIV'){
      flush();const inner=copyBlocks(node.childNodes);if(inner)blocks.push(inner);
    }else inline.push(node);
  }
  flush();
  return blocks.join('\n');
}
function copyPlainText(html){
  const holder=document.createElement('div');holder.innerHTML=html;
  holder.querySelectorAll('a').forEach(link=>{
    if(!link.querySelector('svg')&&!link.hasAttribute('data-memo-id'))return;
    const href=link.getAttribute('href');if(href)link.replaceWith(document.createTextNode(href));
  });
  const normalized=copyBlocks(holder.childNodes).replace(/\n{2,}/g,'\n');
  return normalized.split('\n').map(line=>{
    const match=/^([\t ]*)([\s\S]*)$/.exec(line),indent=match?match[1]:'';
    const text=(match?match[2]:line).replace(/[ \t]+/g,' ').replace(/\s+$/g,'');
    return indent+text;
  }).join('\n').trim();
}
function inlineSnapshot(node,pos){
  let text='';const positions=[];
  node.forEach((child,offset)=>{if(!child.isText){text+='\ufffc';positions.push(pos+1+offset);return;}text+=child.text;for(let i=0;i<child.text.length;i++)positions.push(pos+1+offset+i);});
  return {text,positions};
}
function tagDecorations(doc){
  if(!doc.textContent.includes('#'))return DecorationSet.empty;
  const decorations=[];
  doc.descendants((node,pos)=>{if(!node.isTextblock)return;const {text,positions}=inlineSnapshot(node,pos);for(const token of window.MemoCore.tokens(text)){if(token[0][0]!=='#'||!window.MemoCore.validTag(window.MemoCore.normalizeTag(token[0].slice(1))))continue;decorations.push(Decoration.inline(positions[token.index],positions[token.index+token[0].length-1]+1,{class:'editor-tag'}));}});
  return DecorationSet.create(doc,decorations);
}
function parseDocument(html,resolveReference){
  const holder=document.createElement('div');
  holder.innerHTML=window.MemoMarkup.clean(html||'<p></p>');
  // The editor keeps memo URLs as ordinary text. Canonical legacy anchors
  // are flattened so cursor movement, selection and undo follow text rules.
  holder.querySelectorAll('a[href]').forEach(link=>{
    const id=link.getAttribute('data-memo-id');
    if(validId(id)&&(link.textContent||'').startsWith('↗ ')){link.textContent=link.textContent.replace(/^(↗ \S+) (?:#[^\s]+\s+)+/,'$1 ');return;}
    const memo=validId(id)&&resolveReference?.(id);if(memo){link.setAttribute('href',referenceURL(id));link.textContent='↗ '+referenceLabel(memo);return;}
    link.replaceWith(document.createTextNode(validId(id)?referenceURL(id):link.textContent||''));
  });
  if(resolveReference){
    const walker=document.createTreeWalker(holder,NodeFilter.SHOW_TEXT),texts=[];while(walker.nextNode())texts.push(walker.currentNode);
    for(const text of texts){if(text.parentElement?.closest('a,code,pre'))continue;const value=text.nodeValue,pattern=/fomo:\/\/note\/([a-zA-Z0-9-]{1,100})/g;let match,last=0,fragment=null;while((match=pattern.exec(value))){const memo=resolveReference(match[1]);if(!memo)continue;if(!fragment)fragment=document.createDocumentFragment();fragment.append(document.createTextNode(value.slice(last,match.index)));const link=document.createElement('a');link.dataset.memoId=match[1];link.setAttribute('href',referenceURL(match[1]));link.textContent='↗ '+referenceLabel(memo);fragment.append(link);last=pattern.lastIndex;}if(fragment){fragment.append(document.createTextNode(value.slice(last)));text.replaceWith(fragment);}}
  }
  return Parser.fromSchema(schema).parse(holder,{preserveWhitespace:'full'});
}
function create(element,options={}){
  let view,editable=true,ready=false,plainPaste=false;
  const syncEmpty=()=>element.dataset.empty=String(view.state.doc.childCount===1&&view.state.doc.firstChild.type===schema.nodes.paragraph&&view.state.doc.firstChild.content.size===0);
  const parse=parseDocument;
  const decorations=new Plugin({state:{init:(_,state)=>tagDecorations(state.doc),apply:(tr,previous)=>tr.docChanged?tagDecorations(tr.doc):previous.map(tr.mapping,tr.doc)},props:{decorations:state=>decorations.getState(state)}});
  const hintPlugin=new Plugin({state:{init:()=>null,apply:(tr,previous)=>{const update=tr.getMeta(hintPlugin);if(update!==undefined)return update;if(previous===null)return null;const pos=tr.docChanged?tr.mapping.map(previous.pos,1):previous.pos;return pos<0||pos>tr.doc.content.size?null:{...previous,pos};}},props:{decorations:state=>{const hint=hintPlugin.getState(state);if(!hint||hint.pos>state.doc.content.size)return null;return DecorationSet.create(state.doc,[Decoration.widget(hint.pos,()=>{const span=document.createElement('span');span.className='tag-inline-hint';span.textContent=hint.text;span.contentEditable='false';span.setAttribute('aria-hidden','true');return span;},{side:1,key:'inline-hint-'+hint.text})]);}}});
  const run=command=>{if(!editable)return false;view.focus();return command(view.state,view.dispatch,view);};
  const listAncestor=()=>{const {$from}=view.state.selection;for(let depth=$from.depth;depth>0;depth--){const node=$from.node(depth);if(node.type===schema.nodes.bullet_list||node.type===schema.nodes.ordered_list)return {node,pos:$from.before(depth)};}return null;};
  const enterCommand=chainCommands(splitListItem(schema.nodes.list_item),baseKeymap.Enter);
  const clearBoldAndUnderlineOnEnter=(state,dispatch,view)=>enterCommand(state,transaction=>{
    if(!dispatch)return;
    const marks=(transaction.storedMarks||state.storedMarks||state.selection.$from.marks()).filter(mark=>mark.type!==schema.marks.strong&&mark.type!==schema.marks.underline);
    dispatch(transaction.setStoredMarks(marks));
  },view);
  const bindings={
    'Mod-z':undo,'Mod-y':redo,'Mod-Shift-z':redo,
    'Mod-b':toggleMark(schema.marks.strong),'Mod-B':toggleMark(schema.marks.strong),'Mod-u':toggleMark(schema.marks.underline),'Mod-U':toggleMark(schema.marks.underline),'Mod-i':toggleMark(schema.marks.em),'Mod-Shift-h':toggleMark(schema.marks.highlight),
    'Mod-Shift-7':()=>api.command('number'),'Mod-Shift-8':()=>api.command('list'),
    Enter:clearBoldAndUnderlineOnEnter,Tab:sinkListItem(schema.nodes.list_item),'Shift-Tab':liftListItem(schema.nodes.list_item)
  };
  view=new EditorView({mount:element},{
    state:EditorState.create({schema,plugins:[history(),keymap(bindings),inputRules({rules:[highlightInputRule,wrappingInputRule(/^\s*([-+*])\s$/,schema.nodes.bullet_list),wrappingInputRule(/^(\d+)\.\s$/,schema.nodes.ordered_list,match=>({order:+match[1]})),wrappingInputRule(/^>\s$/,schema.nodes.blockquote),textblockTypeInputRule(/^```\s$/,schema.nodes.code_block)]}),keymap(baseKeymap),decorations,hintPlugin]}),
    attributes:{role:'textbox','aria-label':'记录想法','aria-multiline':'true',spellcheck:'false'},
    nodeViews:{memo_reference:node=>{const dom=document.createElement('span');dom.className='editor-reference-preview';dom.contentEditable='false';dom.setAttribute('role','img');dom.setAttribute('aria-label','引用笔记 '+node.attrs.label);const arrow=document.createElement('span');arrow.className='editor-reference-arrow';arrow.innerHTML=window.memoIcons?.linkedMemo||'↖';const label=document.createElement('span');label.className='editor-reference-label'+(node.attrs.label.endsWith('…')?' is-truncated':'');label.textContent=node.attrs.label;dom.append(arrow,label);return {dom};}},
    editable:()=>editable,
    transformPastedHTML:html=>window.MemoMarkup.clean(html),
    handlePaste:(_view,event)=>{
      const data=event.clipboardData;if(!data)return false;
      const files=[...data.files],text=data.getData('text/plain'),html=data.getData('text/html'),isWord=/microsoft-com:office/i.test(html),asPlain=plainPaste;plainPaste=false;
      const insertPlainText=text=>{const holder=document.createElement('div');text.replace(/\r\n?/g,'\n').split('\n').forEach(line=>{const p=document.createElement('p');p.textContent=line;holder.append(p);});view.dispatch(view.state.tr.replaceSelection(new Slice(Parser.fromSchema(schema).parse(holder,{preserveWhitespace:'full'}).content,0,0)).scrollIntoView());};
      if(asPlain){insertPlainText(text);return true;}
      const reference=/^fomo:\/\/note\/([a-zA-Z0-9-]{1,100})$/.exec(text.trim());
      if(reference){
        const id=reference[1],memo=options.resolveReference?.(id),holder=document.createElement('div');holder.innerHTML=window.MemoMarkup.clean(html||'');
        const link=[...holder.querySelectorAll('a[data-memo-id]')].find(a=>a.dataset.memoId===id&&a.getAttribute('href')===referenceURL(id));
        const label=memo?referenceLabel(memo):link?.textContent?.startsWith('↗ ')?link.textContent.slice(2):'';
        if(label){if(_view.state.doc.textContent.length+text.length>30000){options.onMessage?.('笔记，包括本次粘贴，请不超过 30000 字');return true;}view.dispatch(view.state.tr.replaceSelectionWith(schema.nodes.memo_reference.create({id,label})).scrollIntoView());return true;}
        insertPlainText(referenceURL(id));return true;
      }
      if(!isWord&&/(https?:\/\/[^\s]+)/.test(text)&&!/^(?:https?:\/\/|mailto:)\S+$/i.test(text.trim()))return false;
      if(/^(?:https?:\/\/|mailto:)\S+$/i.test(text.trim())){
        view.dispatch(view.state.tr.replaceSelectionWith(schema.text(text.trim()+' ')).scrollIntoView());return true;
      }
      const imageFiles=isWord?[]:files.filter(file=>/^image\//i.test(file.type));
      if(imageFiles.length){options.onFiles?.(imageFiles);return true;}
      if(text.length&&_view.state.doc.textContent.length+text.length>30000){options.onMessage?.('笔记，包括本次粘贴，请不超过 30000 字');return true;}
      if(isWord&&text){const holder=document.createElement('div'),paragraph=document.createElement('p'),lines=text.replace(/\r\n/g,'\n').split('\n');lines.forEach((line,index)=>{if(index)paragraph.append(document.createElement('br'));paragraph.append(document.createTextNode(line));});holder.append(paragraph);view.dispatch(view.state.tr.replaceSelection(new Slice(parse(holder.innerHTML).content,0,0)).scrollIntoView());return true;}
      let textLists=0,htmlLists=0;
      if(text)for(const line of text.split(/\r?\n/)){const value=line.trim();if(/^(\*|-|\+)\s+\S+/.test(value)||/^\d+\.\s+\S+/.test(value))textLists++;}
      if(html)htmlLists=(html.match(/<li\b/gi)||[]).length;
      if(textLists||htmlLists){
        if(textLists>htmlLists&&text){view.dispatch(view.state.tr.replaceSelection(new Slice(parse(plainHTML(text,{highlight:true})).content,0,0)).scrollIntoView());return true;}
        if(htmlLists>textLists)return false;
      }
      if(/==(?!\s+==)[^=]+==(?!\s+==)/.test(text)){view.dispatch(view.state.tr.replaceSelection(new Slice(parse(plainHTML(text,{highlight:true})).content,0,0)).scrollIntoView());return true;}
      if(text.includes('</p>')){view.dispatch(view.state.tr.replaceSelection(new Slice(parse(text).content,0,0)).scrollIntoView());return true;}
      return false;
    },
    handleKeyDown:(_view,event)=>{if((event.ctrlKey||event.metaKey)&&event.shiftKey&&event.key.toLowerCase()==='v')plainPaste=true;else plainPaste=false;if(event.isComposing||event.keyCode===229||view.composing)return false;return options.onKeyDown?.(event)===true;},
    handleDOMEvents:{
      copy:(_view,event)=>{
        if(_view.state.selection.empty||!event.clipboardData)return false;
        const holder=document.createElement('div');
        holder.append(DOMSerializer.fromSchema(schema).serializeFragment(_view.state.selection.content().content));
        const source=holder.innerHTML;
        if(!/<[^>]+>/.test(source)||!source.trim())return false;
        event.clipboardData.setData('text/html',copyHTML(source));
        event.clipboardData.setData('text/plain',copyPlainText(source));
        event.preventDefault();
        return true;
      },
      compositionend:()=>{setTimeout(()=>{if(!view.isDestroyed)options.onSelection?.();},0);return false;}
    },
    dispatchTransaction:transaction=>{const result=view.state.applyTransaction(transaction);view.updateState(result.state);syncEmpty();if(!ready||transaction.getMeta(hintPlugin)!==undefined)return;if(result.transactions.some(tr=>tr.docChanged))options.onChange?.();else options.onSelection?.();}
  });
  ready=true;element.classList.add('structured-editor');element.setAttribute('data-structured-editor','true');syncEmpty();
  const api={
    getText:()=>textOf(view.state.doc),
    getDisplayText:()=>textOf(view.state.doc,true),
    getHTML:()=>{const holder=document.createElement('div');holder.append(DOMSerializer.fromSchema(schema).serializeFragment(view.state.doc.content));return holder.innerHTML;},
    setHTML(html,{history:record=false,resolveReferences=false}={}){const doc=resolveReferences?parseDocument(html||'<p></p>',options.resolveReference):parse(html||'<p></p>');if(doc.eq(view.state.doc))return;if(record)view.dispatch(view.state.tr.replaceWith(0,view.state.doc.content.size,doc.content).scrollIntoView());else{const next=EditorState.create({schema,doc,plugins:view.state.plugins});view.updateState(next);syncEmpty();options.onChange?.();}},
    setText(text,settings){this.setHTML(plainHTML(text),settings);},
    insertText(text,range){if(!editable)return;view.focus();const tr=view.state.tr;if(range)tr.insertText(text,range.from,range.to);else tr.insertText(text);view.dispatch(tr.scrollIntoView());},
    command(name){if(!editable)return false;const mark={bold:'strong',underline:'underline',highlight:'highlight',italic:'em'}[name];if(mark)return run(toggleMark(schema.marks[mark]));if(name==='quote'){const quote=schema.nodes.blockquote;const {$from}=view.state.selection;let active=false;for(let depth=$from.depth;depth>0;depth--){if($from.node(depth).type===quote){active=true;break;}}return run(active?lift:wrapIn(quote));}if(name==='list'||name==='number'){view.focus();const type=schema.nodes[name==='list'?'bullet_list':'ordered_list'],active=listAncestor();if(active?.node.type===type)return run(liftListItem(schema.nodes.list_item));if(active){view.dispatch(view.state.tr.setNodeMarkup(active.pos,type).scrollIntoView());return true;}return run(wrapInList(type));}if(name==='undo')return run(undo);if(name==='redo')return run(redo);if(name==='paragraph')return run(setBlockType(schema.nodes.paragraph));return false;},
    isActive(name){const mark=schema.marks[{bold:'strong',underline:'underline',highlight:'highlight',italic:'em'}[name]];if(mark){const {empty,from,to,$from}=view.state.selection;return empty?!!mark.isInSet(view.state.storedMarks||$from.marks()):view.state.doc.rangeHasMark(from,to,mark);}if(name==='quote'){const {$from}=view.state.selection;for(let depth=$from.depth;depth>0;depth--){if($from.node(depth).type===schema.nodes.blockquote)return true;}return false;}if(name==='list'||name==='number')return listAncestor()?.node.type===schema.nodes[name==='list'?'bullet_list':'ordered_list'];return false;},
    setEditable(value){editable=!!value;view.setProps({editable:()=>editable});},
    setSpellcheck(value){const enabled=String(!!value);view.dom.setAttribute('spellcheck',enabled);element.setAttribute('spellcheck',enabled);},
    focus:()=>view.focus(),
    focusTextBlock(index,offset){
      if(!Number.isInteger(index)||!Number.isInteger(offset)||index<0||offset<0)return false;
      let at=0,position=null;
      view.state.doc.descendants((node,pos)=>{if(!node.isTextblock)return;if(at++===index){let remaining=offset,relative=0;node.forEach(child=>{if(remaining<=0)return;const length=child.type.name==='memo_reference'?referenceURL(child.attrs.id).length:child.isText?child.text.length:child.nodeSize;if(remaining>=length){remaining-=length;relative+=child.nodeSize;}else{relative+=child.type.name==='memo_reference'?0:Math.min(remaining,child.nodeSize);remaining=0;}});position=pos+1+relative;}return false;});
      if(position===null)return false;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,position)));
      view.focus();return true;
    },
    focusEnd(){view.dispatch(view.state.tr.setSelection(TextSelection.near(view.state.doc.resolve(view.state.doc.content.size),-1)).scrollIntoView());view.focus();},
    getSelection:()=>({anchor:view.state.selection.anchor,head:view.state.selection.head}),
    caretRect(){const rect=view.coordsAtPos(view.state.selection.head);return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};},
    positionRect(position){const rect=view.coordsAtPos(position);return {left:rect.left,right:rect.right,top:rect.top,bottom:rect.bottom};},
    setTagHint(request){let hint=null;if((request?.kind==='tag'||request?.kind==='reference')&&!request.query){const next=view.state.doc.textBetween(request.to,Math.min(request.to+1,view.state.doc.content.size),'');if(!next||/\s/.test(next))hint={pos:request.to,text:request.kind==='tag'?'选择标签...':'搜索笔记...'};}const previous=hintPlugin.getState(view.state);if(previous?.pos!==hint?.pos||previous?.text!==hint?.text)view.dispatch(view.state.tr.setMeta(hintPlugin,hint));},
    selectionRect(){const selection=view.state.selection;if(selection.empty)return null;const start=view.coordsAtPos(selection.from),end=view.coordsAtPos(selection.to);if(!start||!end)return null;return {left:Math.min(start.left,end.left),right:Math.max(start.right,end.right),top:Math.min(start.top,end.top),bottom:Math.max(start.bottom,end.bottom)};},
    restoreSelection(value){if(!value||!Number.isInteger(value.anchor)||!Number.isInteger(value.head))return;const max=view.state.doc.content.size,anchor=Math.max(1,Math.min(max-1,value.anchor)),head=Math.max(1,Math.min(max-1,value.head));view.dispatch(view.state.tr.setSelection(TextSelection.between(view.state.doc.resolve(anchor),view.state.doc.resolve(head))));},
    selectAll(){const end=Math.max(1,view.state.doc.content.size-1);view.focus();view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc,1,end)));},
    queryAtCursor(){const {empty,$from,from}=view.state.selection;if(!empty||!$from.parent.isTextblock)return null;const before=$from.parent.textBetween(0,$from.parentOffset,'','\ufffc');const ref=/(?:^|[\s\S])@([^\n@#]*)$/.exec(before);if(ref)return{kind:'reference',query:ref[1],from:from-ref[1].length-1,to:from};const tag=/(?:^|\s)#([^\s#@]*)$/.exec(before);return tag?{kind:'tag',query:tag[1],from:from-tag[1].length-1,to:from}:null;},
    insertReference(memo,range){if(!editable||!validId(memo.id))return;view.focus();const from=range?.from??view.state.selection.from,to=range?.to??view.state.selection.to,node=schema.nodes.memo_reference.create({id:memo.id,label:referenceLabel(memo)});let tr=view.state.tr.replaceWith(from,to,node).insertText(' ',from+1);tr=tr.setSelection(TextSelection.create(tr.doc,from+2)).setStoredMarks([]);view.dispatch(tr.scrollIntoView());},
    getReferenceIds(){return window.MemoCore.memoIds(textOf(view.state.doc));},
    removeReference(id){const ranges=[];view.state.doc.descendants((node,pos)=>{if(node.type.name==='memo_reference'){if(node.attrs.id===id)ranges.push([pos,pos+node.nodeSize]);return false;}if(!node.isTextblock)return;const {text,positions}=inlineSnapshot(node,pos);for(const match of text.matchAll(/https?:\/\/[^\s<>\ufffc]+|(?:fomo|writeboom|memo-flow):\/\/note\/[a-zA-Z0-9-]+/g)){if(window.MemoCore.memoIdFromToken(match[0])===id)ranges.push([positions[match.index],positions[match.index+match[0].length-1]+1]);}});const merged=[];for(const [from,to]of ranges.sort((a,b)=>a[0]-b[0]||a[1]-b[1])){const last=merged.at(-1);if(last&&from<=last[1])last[1]=Math.max(last[1],to);else merged.push([from,to]);}let tr=view.state.tr;for(const [from,to]of merged.reverse())tr=tr.delete(from,to);if(tr.docChanged)view.dispatch(closeHistory(tr));},
    isComposing:()=>view.composing,
    destroy:()=>view.destroy()
  };
  element.memoEditor=api;
  return api;
}
window.MemoEditor={create,plainHTML,copyHTML,copyPlainText,referenceLabel,displayText:(html,resolveReference)=>textOf(parseDocument(html,resolveReference),true)};
