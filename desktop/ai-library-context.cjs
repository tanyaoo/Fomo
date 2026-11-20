'use strict';
const MAX_CHARS=42000;
const NOTE_CHARS=4000;
function buildLibraryContext(memos, question=''){
  const active=(Array.isArray(memos)?memos:[]).filter(m=>!m.deleted&&typeof m.content==='string'&&m.content.trim()).sort((a,b)=>String(b.created||'').localeCompare(String(a.created||'')));
  const format=m=>`[笔记 ${String(m.id).slice(0,100)}｜${String(m.created||'').slice(0,10)}]\n${m.content.slice(0,NOTE_CHARS)}`;
  const totalChars=active.reduce((sum,m)=>sum+format(m).length+2,0);
  const complete=totalChars<=MAX_CHARS&&active.every(m=>m.content.length<=NOTE_CHARS);
  let ordered=active;
  if(!complete){
    const segmenter=typeof Intl.Segmenter==='function'?new Intl.Segmenter('zh-CN',{granularity:'word'}):null;
    const terms=[...new Set((segmenter?[...segmenter.segment(question)].filter(x=>x.isWordLike).map(x=>x.segment):String(question).split(/\s+/)).map(x=>x.toLocaleLowerCase()).filter(x=>x.length>=2))].slice(0,30);
    const score=m=>terms.reduce((n,t)=>n+(m.content.toLocaleLowerCase().includes(t)?1:0),0);
    const ranked=active.map((m,i)=>({m,i,score:score(m)})).filter(x=>x.score).sort((a,b)=>b.score-a.score||a.i-b.i);
    const spread=active;
    const picked=new Set(),merged=[];const add=m=>{if(m&&!picked.has(m.id)){picked.add(m.id);merged.push(m);}};
    // Interleave relevant and chronologically spread records so broad questions
    // do not reduce the background to only the most recent notes.
    let l=0,r=0;while(l<ranked.length||r<spread.length){for(let j=0;j<2&&l<ranked.length;j++)add(ranked[l++].m);if(r<spread.length){const index=r%2===0?Math.floor(r/2):spread.length-1-Math.floor(r/2);add(spread[index]);r++;}}
    ordered=merged;
  }
  const notes=[];let used=0;
  for(const memo of ordered){const record=format(memo),remaining=MAX_CHARS-used;if(remaining<100)break;const header=`[笔记 ${String(memo.id).slice(0,100)}｜${String(memo.created||'').slice(0,10)}]\n`;const content=memo.content.slice(0,Math.max(0,Math.min(NOTE_CHARS,remaining-header.length-2)));notes.push({id:String(memo.id),created:String(memo.created||''),content});used+=header.length+content.length+2;}
  const truncated=!complete||notes.length<active.length;
  return {total:active.length,included:notes.length,truncated,notes};
}
module.exports={buildLibraryContext,MAX_CHARS,NOTE_CHARS};
