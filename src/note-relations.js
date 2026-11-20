// Present annotation edges once, while preserving both directions of normal references.
export function relationGroups(links={}){
  const unique=rows=>[...new Map((rows||[]).map(row=>[row.id,row])).values()];
  const visible=rows=>unique(rows).filter(note=>note&&!note.deleted);
  const annotations=visible(links.annotations),annotationIds=new Set(annotations.map(note=>note.id));
  const outgoing=visible(links.outgoing),incoming=visible(links.incoming).filter(note=>!annotationIds.has(note.id));
  return {annotations,outgoing,incoming,count:annotations.length+outgoing.length+incoming.length};
}
