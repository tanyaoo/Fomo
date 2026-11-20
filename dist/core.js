(function (root) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const normalizeTag = tag => tag.replace(/^#/, '').replace(/\/+$/g, '').replace(/\/{2,}/g, '/');
  const validTag = tag => /^[\p{L}\p{N}\p{Extended_Pictographic}\p{Emoji_Component}\u200D\uFE0F_\-/]+(?:\/[\p{L}\p{N}\p{Extended_Pictographic}\p{Emoji_Component}\u200D\uFE0F_\-/]+)*$/u.test(tag);
  // Prefix matches include the final segment of hierarchical tags.
  const matchTagSuggestions = (tags, query) => {
    const needle=String(query || '').toLowerCase();
    const prefix=tag=>{const text=tag.toLowerCase();return text.startsWith(needle)||text.slice(text.lastIndexOf('/')+1).startsWith(needle);};
    return tags.filter(tag=>tag.toLowerCase().includes(needle)).sort((a,b)=>Number(!prefix(a))-Number(!prefix(b)));
  };
  // URL tokens consume fragments before hashtag tokens are considered.
  const tokens = text => [...text.matchAll(/(?:fomo|writeboom|memo-flow):\/\/note\/[a-zA-Z0-9-]+|https?:\/\/[^\s<>\uFFFC]+|(?<![\p{L}\p{N}_/#])#[\p{L}\p{N}\p{Extended_Pictographic}\p{Emoji_Component}\u200D\uFE0F_\-/]+/gu)];
  const tagsOf = text => [...new Set(tokens(text).filter(m => m[0][0] === '#').map(m => normalizeTag(m[0].slice(1))).filter(validTag))];
  // Local libraries have no per-tag usage timestamps; reconstruct from active notes.
  function recentTagSuggestions(memos) {
    const usage=new Map();
    for(const memo of memos || []){
      if(memo.deleted)continue;
      const time=Math.max(Date.parse(memo.created)||0,Date.parse(memo.updated)||0);
      if(!time)continue;
      const names=new Set(tagsOf(memo.content || '').flatMap(tag=>tag.split('/').map((_,i)=>tag.split('/').slice(0,i+1).join('/'))));
      for(const tag of names)usage.set(tag,Math.max(usage.get(tag)||0,time));
    }
    const names=[...usage].sort((a,b)=>b[1]-a[1]||a[0].localeCompare(b[0],'zh-CN')).slice(0,30).map(([tag])=>tag);
    return names.filter(tag=>!names.some(other=>other!==tag&&other.startsWith(tag+'/'))).slice(0,10);
  }
  const replaceTag = (text, oldTag, newTag) => text.replace(/(?:fomo|writeboom|memo-flow):\/\/note\/[a-zA-Z0-9-]+|https?:\/\/[^\s<>]+|(?<![\p{L}\p{N}_/#])#[\p{L}\p{N}\p{Extended_Pictographic}\p{Emoji_Component}\u200D\uFE0F_\-/]+/gu, token => {
    if (token[0] !== '#') return token;
    const tag = normalizeTag(token.slice(1));
    return tag === oldTag || tag.startsWith(oldTag + '/') ? (newTag ? '#' + newTag + tag.slice(oldTag.length) : '') : token;
  });
  const validId = id => typeof id === 'string' && /^[a-zA-Z0-9-]{1,100}$/.test(id);
  const tagParent = tag => tag.includes('/') ? tag.slice(0, tag.lastIndexOf('/')) : '';
  const tagLeaf = tag => tag.split('/').at(-1);
  const tagWeight = name => /^\d/.test(name) ? 10 : /^[A-Z]/.test(name) ? 100 : /^[a-z]/.test(name) ? 1000 : /^[\u4e00-\u9fa5]/.test(name) ? 10000 : 0;
  const compareTagNames = (a, b) => {
    const left = tagLeaf(a), right = tagLeaf(b), x = tagWeight(left), y = tagWeight(right);
    return x - y || (x === 10000 ? left.localeCompare(right, 'zh') : left.localeCompare(right));
  };
  function orderedTags(names, savedOrder = []) {
    const rank = new Map(savedOrder.map((tag, index) => [tag, index])), groups = new Map();
    const complete = new Set(names);
    for (const tag of [...complete]) for (let parent = tagParent(tag); parent; parent = tagParent(parent)) complete.add(parent);
    for (const tag of complete) { const group = tagParent(tag); if (!groups.has(group)) groups.set(group, []); groups.get(group).push(tag); }
    for (const group of groups.values()) group.sort((a, b) => {
      const x = rank.get(a), y = rank.get(b);
      if (x === undefined && y === undefined) return compareTagNames(a, b);
      return x === undefined ? -1 : y === undefined ? 1 : x - y;
    });
    const output = [], append = group => { for (const tag of groups.get(group) || []) { output.push(tag); append(tag); } };
    append(''); return output;
  }
  const MODEL_VERSION = 4;
  const SOURCE_VALUES = ['direct', 'annotation', 'reflection', 'import'];
  const sourceOf = m => SOURCE_VALUES.includes(m && m.source) ? m.source : (m && m.annotationOf ? 'annotation' : m && m.relatedTo ? 'reflection' : 'direct');
  const memoIdFromToken = token => {
    if (typeof token !== 'string') return '';
    const clean=token.trim().replace(/[.,!?;:，。！？；：)）\]】}]+$/,'');
    let match = /^(?:fomo|writeboom|memo-flow):\/\/note\/([a-zA-Z0-9-]{1,100})$/.exec(clean);
    if (match) return match[1];
    match = /^https?:\/\/[^/\s]+\/mine\/\?(?:[^\s#]*&)?memo_id=([a-zA-Z0-9_-]{1,100})/.exec(clean);
    return match ? match[1] : '';
  };
  const memoIds = text => [...new Set((String(text).match(/https?:\/\/[^\s<>]+|(?:fomo|writeboom|memo-flow):\/\/note\/[a-zA-Z0-9-]+/g) || []).map(memoIdFromToken).filter(Boolean))];
  const refsOf = m => [...new Set([...(m.references || []), m.relatedTo, m.annotationOf, ...memoIds(m.content), ...memoIds(m.html)].filter(Boolean))];
  // Never guess between an external slug and multiple local records.
  const refIndex = list => {const index=new Map();for(const m of list)for(const key of new Set([m.id,m.sourceSlug].filter(Boolean))){if(index.has(key)&&index.get(key)!==m)index.set(key,null);else if(!index.has(key))index.set(key,m);}return index;};
  const resolveRef = (list,id) => refIndex(list).get(id)||null;
  const hasLinks = m => !!(m && (/https?:\/\//i.test(m.content || '') || /<a\b[^>]*\bhref\s*=\s*["']https?:\/\//i.test(m.html || '') || refsOf(m).length));
  function displayPreferences(value){const p=value&&typeof value==='object'?value:{};return {font:['default','system','serif'].includes(p.font)?p.font:'default',fontSize:[13,14,15,16,18,20,24,28,32].includes(p.fontSize)?p.fontSize:14,lineHeight:(()=>{const v=Number(p.lineHeight);if(v===1.5)return 1.6;return [1.6,1.8,2,2.2].includes(v)?v:1.8;})(),collapseNotes:typeof p.collapseNotes==='boolean'?p.collapseNotes:true,showHeatmap:typeof p.showHeatmap==='boolean'?p.showHeatmap:true,showSources:typeof p.showSources==='boolean'?p.showSources:false,collapseReferences:typeof p.collapseReferences==='boolean'?p.collapseReferences:false,spellcheck:typeof p.spellcheck==='boolean'?p.spellcheck:false};}
  const blank = () => ({version:MODEL_VERSION, profile:'我的笔记', theme:'light', display:displayPreferences(),extraTags:[], memos:[], reviewed:{}, review:{count:8, period:'all', include:'', exclude:'',noTags:false,at:'20:00',notify:false}});
  // The app counts from the local date on which the account was created, not
  // from the number of days that contain a memo. A local library has no
  // account record, so its earliest memo is the durable equivalent.
  function usedDayCount(state, now = Date.now()) {
    let earliest = Infinity;
    for (const item of state && Array.isArray(state.memos) ? state.memos : []) {
      const time = Date.parse(item && item.created);
      if (Number.isFinite(time) && time < earliest) earliest = time;
    }
    if (!Number.isFinite(earliest)) return 0;
    const first = new Date(earliest);
    const start = new Date(first.getFullYear(), first.getMonth(), first.getDate());
    const current = now instanceof Date ? now : new Date(now);
    if (!Number.isFinite(current.getTime())) return 0;
    return Math.max(0, Math.ceil((current.getTime() - start.getTime()) / 86400000));
  }
  const imageOK = value => Array.isArray(value) && value.every(s => typeof s === 'string' && /^data:image\/(jpeg|png|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(s));
  function references(value, id) {
    if (!Array.isArray(value) || value.length > 200 || value.some(ref => !validId(ref) || ref === id)) throw Error('引用笔记 ID 无效');
    return [...new Set(value)];
  }
  function validateHistory(rows, id) {
    if (!Array.isArray(rows) || rows.length > 100) throw Error('笔记历史格式无效');
    const ids = new Set();
    return rows.map(r => {
      if (!r || !validId(r.id) || ids.has(r.id) || typeof r.content !== 'string' || typeof r.html !== 'string' || !imageOK(r.images) || !Number.isFinite(Date.parse(r.created))) throw Error('笔记历史内容无效');
      ids.add(r.id);
      return {id:r.id, content:r.content, html:r.html, images:r.images, references:references(r.references || [], id), created:new Date(r.created).toISOString()};
    });
  }
  function validate(raw) {
    if (!raw || typeof raw !== 'object' || !Array.isArray(raw.memos)) throw Error('备份缺少 memos 数组');
    if (raw.version !== undefined && (!Number.isInteger(raw.version) || raw.version > MODEL_VERSION || raw.version < 1)) throw Error('数据版本不受支持，请使用相应的新版应用');
    const ids = new Set();
    const memos = raw.memos.map(m => {
      if (!m || typeof m.content !== 'string' || !Number.isFinite(Date.parse(m.created))) throw Error('笔记内容或日期不合法');
      if (typeof m.id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(m.id) || ids.has(m.id)) throw Error('笔记 ID 无效或重复');
      ids.add(m.id);
      if (m.images !== undefined && (!Array.isArray(m.images) || m.images.some(s => typeof s !== 'string' || !/^data:image\/(jpeg|png|webp|gif);base64,[a-zA-Z0-9+/=]+$/.test(s)))) throw Error('图片数据不合法');
  if (m.audio !== undefined && (typeof m.audio !== 'string' || !/^data:audio\/(?:webm|ogg|mp4|mpeg|wav);base64,[a-zA-Z0-9+/=]+$/.test(m.audio))) throw Error('音频数据不合法');
  if (m.video !== undefined && (typeof m.video !== 'string' || !/^data:video\/(?:mp4|webm|quicktime);base64,[a-zA-Z0-9+/=]+$/.test(m.video))) throw Error('视频数据不合法');
      if (m.relatedTo !== undefined && (typeof m.relatedTo !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(m.relatedTo) || m.relatedTo === m.id)) throw Error('关联笔记 ID 无效');
      if (m.pinned !== undefined && typeof m.pinned !== 'boolean') throw Error('置顶状态无效');
      if (m.source !== undefined && !SOURCE_VALUES.includes(m.source)) throw Error('笔记来源无效');
      if (m.deletedAt !== undefined && !Number.isFinite(Date.parse(m.deletedAt))) throw Error('删除时间无效');
      const deleted = m.deleted !== undefined ? !!m.deleted : !!m.deletedAt;
      if (m.annotationOf !== undefined && (!validId(m.annotationOf) || m.annotationOf === m.id)) throw Error('批注来源无效');
      const importedSlug = Object.entries(m).find(([key,value]) => key !== 'sourceSlug' && key.endsWith('Slug') && value !== undefined)?.[1];
      const sourceSlug = m.sourceSlug !== undefined ? m.sourceSlug : importedSlug;
      if (sourceSlug !== undefined && (typeof sourceSlug !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(sourceSlug))) throw Error('来源笔记标识无效');
      if (m.legacyAnnotationId !== undefined && !validId(m.legacyAnnotationId)) throw Error('旧批注 ID 无效');
      if (m.annotationsMigrated !== undefined && typeof m.annotationsMigrated !== 'boolean') throw Error('批注迁移标记无效');
      const refs = m.references === undefined ? [] : references(m.references,m.id);
      const history = m.history === undefined ? [] : validateHistory(m.history,m.id);
      const annotationIds=new Set();
      if(m.annotations!==undefined&&(!Array.isArray(m.annotations)||m.annotations.length>500))throw Error('批注格式无效');
      const annotations=(m.annotations||[]).map(a=>{
        if(!a||typeof a.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(a.id)||annotationIds.has(a.id)||typeof a.content!=='string'||!a.content.trim()||a.content.length>10000||!Number.isFinite(Date.parse(a.created)))throw Error('批注内容或日期无效');
        annotationIds.add(a.id);return {id:a.id,content:a.content,created:new Date(a.created).toISOString()};
      });
      return {id:m.id, content:m.content, html:typeof m.html === 'string' ? m.html : '', created:new Date(m.created).toISOString(), updated:Number.isFinite(Date.parse(m.updated)) ? new Date(m.updated).toISOString() : new Date(m.created).toISOString(), starred:!!m.starred, deleted, images:m.images || [], ...(m.audio ? {audio:m.audio} : {}), ...(m.video ? {video:m.video} : {}), ...(deleted && m.deletedAt ? {deletedAt:new Date(m.deletedAt).toISOString()} : {}), ...(m.relatedTo ? {relatedTo:m.relatedTo} : {}), ...(m.source ? {source:m.source} : {}), ...(sourceSlug ? {sourceSlug} : {}), ...(m.pinned ? {pinned:true} : {}),...(annotations.length?{annotations}:{}),...(refs.length?{references:refs}:{}),...(m.annotationOf?{annotationOf:m.annotationOf}:{}),...(m.legacyAnnotationId?{legacyAnnotationId:m.legacyAnnotationId}:{}),...(m.annotationsMigrated?{annotationsMigrated:true}:{}),...(history.length?{history}:{})};
    });
    const result = {...blank(), memos};
    result.profile = typeof raw.profile === 'string' ? raw.profile.slice(0,30) || '我的笔记' : result.profile;
  if (result.profile === 'WriteBoom 演示' || result.profile === 'WriteBoom') result.profile = result.profile === 'WriteBoom' ? 'Fomo' : 'Fomo 演示';
    result.theme = raw.theme === 'dark' ? 'dark' : raw.theme === 'system' ? 'system' : 'light';
    result.display = displayPreferences(raw.display);
    if (raw.extraTags !== undefined && (!Array.isArray(raw.extraTags) || raw.extraTags.some(t => typeof t !== 'string' || !validTag(normalizeTag(t))))) throw Error('标签数据不合法');
    result.extraTags = [...new Set((raw.extraTags || []).map(normalizeTag))];
    if (raw.review) result.review = {count:[4,8,12,16,20,24].includes(raw.review.count) ? raw.review.count : 8, period:['all','12','6','3','1'].includes(raw.review.period) ? raw.review.period : 'all', include:typeof raw.review.include === 'string' ? raw.review.include : '', exclude:typeof raw.review.exclude === 'string' ? raw.review.exclude : '',noTags:!!raw.review.noTags,at:typeof raw.review.at === 'string' && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(raw.review.at) ? raw.review.at : '20:00',notify:raw.review.notify===true};
    if (raw.reviewed !== undefined) {
      if (!raw.reviewed || typeof raw.reviewed !== 'object' || Array.isArray(raw.reviewed)) throw Error('回顾进度格式无效');
      for (const [day, ids] of Object.entries(raw.reviewed)) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !Array.isArray(ids) || ids.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(id))) throw Error('回顾进度格式无效');
        result.reviewed[day] = [...new Set(ids)];
      }
    }
    return result;
  }
  // Deterministic identifiers are for migration/revision identity, not cryptography.
  function fingerprint(text) {
    let a=2166136261,b=5381;
    for(const c of text){a=Math.imul(a^c.codePointAt(0),16777619);b=Math.imul(b,33)^c.codePointAt(0);}
    return (a>>>0).toString(16).padStart(8,'0')+(b>>>0).toString(16).padStart(8,'0');
  }
  function upgrade(raw) {
    const state=validate(raw), byId=new Map(state.memos.map(m=>[m.id,m]));
    for(const parent of [...state.memos]) {
      if(parent.annotationsMigrated || !parent.annotations?.length) continue;
      for(const a of parent.annotations){
        const stem='legacy-'+fingerprint(parent.id+'\0'+a.id);let id=stem,index=0;
        while(byId.has(id) && !(byId.get(id).annotationOf===parent.id && byId.get(id).legacyAnnotationId===a.id)) id=stem+'-'+(++index);
        if(byId.has(id))continue;
        const child={id,content:a.content,html:'',images:[],created:a.created,updated:a.created,starred:false,deleted:parent.deleted,source:'annotation',references:[parent.id],annotationOf:parent.id,legacyAnnotationId:a.id};
        state.memos.push(child);byId.set(id,child);
      }
      // Keep the source archive in backups/JSON; hide it from live search and counts.
      parent.annotationsMigrated=true;
    }
    return validate(state);
  }
  const documentOf=m=>({content:m.content,html:m.html||'',images:m.images||[],audio:m.audio||'',video:m.video||'',references:refsOf(m)});
  function snapshot(m) {
    const document=documentOf(m),created=m.updated || m.created,{content,html,references}=document;
    return {id:'rev-'+fingerprint(JSON.stringify({content,html,references})+created),content,html,images:[],references,created};
  }
  function restoreVersion(m, revision, now=new Date().toISOString()) {
    const r=validateHistory([revision],m.id)[0],next={...clone(m),content:r.content,html:r.html,images:m.images,updated:now};
    delete next.relatedTo;delete next.references;
    const refs=references(r.references,m.id);
    if(refs.length)next.references=refs;
    // Annotation provenance is stable even when an old body is restored.
    return next;
  }
  // Compare against the version actually read by this window inside one IDB transaction.
  // Unrelated additions survive; two edits of the same record require user resolution.
  function merge(base, desired, latest) {
    const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
    const next = clone(latest);
    next.reviewed ||= {};
    // Review completion is additive: separate windows must not lose each other's progress.
    for (const [day, ids] of Object.entries(desired.reviewed || {})) next.reviewed[day] = [...new Set([...(next.reviewed[day] || []), ...ids])];
    for (const field of ['profile','theme','extraTags','review']) {
      if (equal(base[field],desired[field])) continue;
      if (!equal(base[field],latest[field]) && !equal(desired[field],latest[field])) throw Error('其他窗口修改了设置或标签，请刷新后重试');
      next[field] = clone(desired[field]);
    }
    const beforeDisplay=displayPreferences(base.display),desiredDisplay=displayPreferences(desired.display),latestDisplay=displayPreferences(latest.display);next.display={...latestDisplay};
    for(const field of Object.keys(desiredDisplay)){if(equal(beforeDisplay[field],desiredDisplay[field]))continue;if(!equal(beforeDisplay[field],latestDisplay[field])&&!equal(desiredDisplay[field],latestDisplay[field]))throw Error('其他窗口修改了显示设置，请刷新后重试');next.display[field]=desiredDisplay[field];}
    const before = new Map(base.memos.map(m => [m.id,m]));
    const now = new Map(latest.memos.map(m => [m.id,m]));
    for (const m of desired.memos) {
      if (equal(before.get(m.id),m)) continue;
      let value=clone(m);
      if (!equal(before.get(m.id),now.get(m.id)) && !equal(now.get(m.id),m)) {
        const old=before.get(m.id),current=now.get(m.id),body=n=>{if(!n)return n;const {annotations,history,annotationsMigrated,...rest}=n;return rest;};
        if(!old||!current||(!equal(body(old),body(m))&&!equal(body(old),body(current))))throw Error('这条笔记已在其他窗口修改。草稿已保留，请比较最新内容后再保存');
        const original=new Map((old.annotations||[]).map(a=>[a.id,a])),desiredAnnotations=new Map((m.annotations||[]).map(a=>[a.id,a])),merged=new Map((current.annotations||[]).map(a=>[a.id,a]));
        for(const id of new Set([...original.keys(),...desiredAnnotations.keys()])){
          const initial=original.get(id),desiredValue=desiredAnnotations.get(id);if(equal(initial,desiredValue))continue;
          if(!equal(initial,merged.get(id))&&!equal(desiredValue,merged.get(id)))throw Error('这条批注已在其他窗口修改，请刷新后重试');
          if(desiredValue)merged.set(id,desiredValue);else merged.delete(id);
        }
        value=clone(equal(body(old),body(m))?current:m);delete value.annotations;if(merged.size)value.annotations=[...merged.values()];
      }
      const current=now.get(m.id);
      // A pre-upgrade editingBase must not conflict solely with the migration marker,
      // or undo the migration when the user resumes that saved draft.
      if(current?.annotationsMigrated)value.annotationsMigrated=true;
      const history=new Map([...(current?.history||[]),...(value.history||[])].map(r=>[r.id,r]));
      if(current && !equal(documentOf(current),documentOf(value))){const revision=snapshot(current);history.set(revision.id,revision);}
      delete value.history;
      if(history.size){const cutoff=Date.now()-30*86400000;value.history=[...history.values()].filter(row=>Date.parse(row.created)>=cutoff).sort((a,b)=>Date.parse(a.created)-Date.parse(b.created)).slice(-100);}
      now.set(m.id,value);
    }
    next.memos = [...now.values()];
    return validate(next);
  }
  const matches = (text, query) => query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean).every(term => text.toLocaleLowerCase().includes(term));
  const searchText=m=>[m.content,...(m.annotationsMigrated?[]:m.annotations||[]).map(a=>a.content)].join('\n');
  function daily(list, day, count) {
    const hash = s => { let h=2166136261; for (const c of s) h=Math.imul(h ^ c.charCodeAt(0),16777619); return h>>>0; };
    return [...list].sort((a,b) => hash(day+a.id)-hash(day+b.id) || a.id.localeCompare(b.id)).slice(0,count);
  }
  function related(list,id){const index=refIndex(list),source=index.get(id);if(!source)return [];const tags=tagsOf(source.content);return list.filter(m=>!m.deleted&&m.id!==source.id).map(m=>{const direct=refsOf(m).some(ref=>index.get(ref)?.id===source.id)||refsOf(source).some(ref=>index.get(ref)?.id===m.id),shared=tagsOf(m.content).filter(t=>tags.includes(t));return {memo:m,direct,shared};}).filter(r=>r.direct||r.shared.length).sort((a,b)=>Number(b.direct)-Number(a.direct)||b.shared.length-a.shared.length||Date.parse(b.memo.created)-Date.parse(a.memo.created));}
  function relationships(list,id) {
    const index=refIndex(list),source=index.get(id);if(!source)return {outgoing:[],incoming:[],annotations:[]};
    const outgoing=refsOf(source).map(ref=>index.get(ref)||{id:ref,content:'原笔记暂不可用',missing:true});
    return {outgoing:[...new Map(outgoing.map(m=>[m.id,m])).values()],incoming:list.filter(m=>!m.deleted&&m.id!==source.id&&refsOf(m).some(ref=>index.get(ref)?.id===source.id)),annotations:list.filter(m=>!m.deleted&&index.get(m.annotationOf)?.id===source.id)};
  }
  function semanticSearch(list, query, options = {}) {
    const q = String(query || '').trim().toLocaleLowerCase();
    if (!q) return [];
    const terms = [...new Set(q.split(/\s+/).filter(Boolean))], queryTags = tagsOf(q), rows = [];
    for (const memo of list) {
      if (memo.deleted) continue;
      const body = searchText(memo).toLocaleLowerCase(), tags = tagsOf(memo.content);
      let score = 0; const reasons = [];
      for (const term of terms) {
        const count = body.split(term).length - 1;
        if (count) { score += 4 + Math.min(count, 4); reasons.push('命中「' + term + '」'); }
      }
      for (const tag of tags) {
        if (queryTags.includes(tag) || terms.some(term => tag.toLocaleLowerCase().includes(term))) {
          score += 6; reasons.push('标签 #' + tag);
        }
      }
      if (score) rows.push({ memo, score, reasons: [...new Set(reasons)] });
    }
    const tagCounts = new Map();
    for (const row of rows) for (const tag of tagsOf(row.memo.content)) tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1);
    const topTags = [...tagCounts].filter(([, count]) => count > 1).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN')).slice(0, 5).map(([tag]) => tag);
    const linked = new Set(rows.filter(row => row.score >= 6).map(row => row.memo.id));
    for (const row of rows) {
      for (const tag of topTags) if (!row.reasons.some(reason => reason === '同主题 #' + tag) && tagsOf(row.memo.content).includes(tag)) {
        row.score += 2; row.reasons.push('同主题 #' + tag);
      }
      if (refsOf(row.memo).some(id => linked.has(id) && id !== row.memo.id)) {
        row.score += 2; row.reasons.push('引用关联');
      }
    }
    return rows.sort((a, b) => b.score - a.score || Date.parse(b.memo.created) - Date.parse(a.memo.created)).slice(0, Math.max(1, Math.min(50, options.limit || 12)));
  }
  // The app delegates random-walk recommendations to a semantic service and
  // returns a ranked `similarity` list. A local library has no remote model,
  // so approximate the same behavior with TF-IDF cosine similarity while
  // keeping explicit references and tags as strong, explainable signals.
  const relevanceSegmenter = typeof Intl === 'object' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter('zh-CN', { granularity: 'word' }) : null;
  function relevanceTerms(value) {
    const text = String(value || '')
      .replace(/(?:fomo|writeboom|memo-flow):\/\/note\/[a-zA-Z0-9-]+|https?:\/\/[^\s<>]+|(?<![\p{L}\p{N}_/#])#[\p{L}\p{N}\p{Extended_Pictographic}\p{Emoji_Component}\u200D\uFE0F_\-/]+/gu, ' ')
      .replace(/<[^>]*>/g, ' ')
      .normalize('NFKC').toLocaleLowerCase();
    const raw = relevanceSegmenter
      ? [...relevanceSegmenter.segment(text)].filter(part => part.isWordLike).map(part => part.segment)
      : text.split(/[^\p{L}\p{N}_+-]+/u);
    return raw.map(term => term.trim()).filter(term => {
      if (!term) return false;
      if (/^\p{Script=Han}+$/u.test(term)) return [...term].length >= 2;
      return /^[\p{L}\p{N}][\p{L}\p{N}_+-]*$/u.test(term) && term.length >= 2 && /[\p{L}]/u.test(term);
    });
  }
  function relevanceVector(terms) {
    const counts = new Map();
    for (const term of terms) counts.set(term, (counts.get(term) || 0) + 1);
    return counts;
  }
  function tagRelevance(left, right, rarity) {
    const sourceTags = tagsOf(left.content || ''), candidateTags = tagsOf(right.content || '');
    let best = 0;
    for (const a of sourceTags) for (const b of candidateTags) {
      const weight = Math.min(rarity.get(a) || 0, rarity.get(b) || 0);
      if (!weight) continue;
      if (a === b) { best = Math.max(best, weight); continue; }
      const ap = a.split('/'), bp = b.split('/');
      let common = 0;
      while (common < ap.length && common < bp.length && ap[common] === bp[common]) common++;
      if (common) best = Math.max(best, weight * Math.min(.78, .42 + (common - 1) * .18));
    }
    return best;
  }
  function recommendMemos(list, sourceId, options = {}) {
    const active = (list || []).filter(memo => memo && !memo.deleted);
    const source = active.find(memo => memo.id === sourceId || memo.sourceSlug === sourceId);
    if (!source) return [];
    const excluded = new Set([source.id, ...(Array.isArray(options.exclude) ? options.exclude : [])]);
    const candidates = active.filter(memo => !excluded.has(memo.id));
    if (!candidates.length) return [];
    const documents = [source, ...candidates], termCounts = documents.map(memo => relevanceVector(relevanceTerms(memo.content)));
    const documentFrequency = new Map();
    for (const counts of termCounts) for (const term of counts.keys()) documentFrequency.set(term, (documentFrequency.get(term) || 0) + 1);
    const tagFrequency = new Map();
    for (const memo of active) for (const tag of tagsOf(memo.content || '')) tagFrequency.set(tag, (tagFrequency.get(tag) || 0) + 1);
    const tagCeiling = Math.max(.5, Math.log(active.length + .5)), tagRarity = new Map();
    for (const [tag, count] of tagFrequency) tagRarity.set(tag, Math.max(0, Math.min(1, Math.log((active.length + .5) / (count + .5)) / tagCeiling)));
    const vectors = termCounts.map(counts => {
      const vector = new Map();
      let norm = 0;
      for (const [term, count] of counts) {
        const idf = Math.log((documents.length + .5) / ((documentFrequency.get(term) || 0) + .5));
        const weight = (1 + Math.log(count)) * Math.max(.02, idf);
        vector.set(term, weight); norm += weight * weight;
      }
      const length = Math.sqrt(norm);
      if (length > 0) for (const [term, weight] of vector) vector.set(term, weight / length);
      return vector;
    });
    const sourceRefs = new Set(refsOf(source));
    const threshold = Number.isFinite(Number(options.minimum)) ? Math.max(0, Number(options.minimum)) : .08;
    const limit = Math.max(1, Math.min(50, Number(options.limit) || 10));
    return candidates.map((memo, offset) => {
      const vector = vectors[offset + 1];
      let cosine = 0;
      for (const [term, weight] of vectors[0]) cosine += weight * (vector.get(term) || 0);
      const semantic = cosine > 0 ? Math.sqrt(Math.min(1, cosine)) : 0;
      const tags = tagRelevance(source, memo, tagRarity);
      const memoRefs = new Set(refsOf(memo));
      const direct = sourceRefs.has(memo.id) || memoRefs.has(source.id);
      const sharedRefs = [...sourceRefs].filter(ref => memoRefs.has(ref)).length;
      const references = sharedRefs ? sharedRefs / Math.sqrt(sourceRefs.size * memoRefs.size) : 0;
      let similarity = direct ? Math.max(.94, .68 * semantic + .24 * tags + .08 * references) : .68 * semantic + .24 * tags + .08 * references;
      similarity = Math.max(0, Math.min(.98, similarity));
      const reasons = [];
      if (direct) reasons.push('显式引用');
      if (tags) reasons.push('相同标签');
      if (semantic) reasons.push('语义相近');
      return { memo, similarity, reasons };
    }).filter(row => row.similarity >= threshold).sort((a, b) => b.similarity - a.similarity || Date.parse(b.memo.created) - Date.parse(a.memo.created) || a.memo.id.localeCompare(b.memo.id)).slice(0, limit);
  }
  function batch(state, ids, operation, value='', now=new Date().toISOString()) {
    const next=clone(state),selected=[...new Set(ids)];
    if(!selected.length || selected.some(id=>!validId(id)))throw Error('请先选择笔记');
    if(!['tag','delete','restore'].includes(operation))throw Error('批量操作无效');
    const tag=normalizeTag(value.trim());if(operation==='tag'&&!validTag(tag))throw Error('标签格式不正确');
    const rows=selected.map(id=>next.memos.find(m=>m.id===id));
    if(rows.some(m=>!m || (operation==='restore'?!m.deleted:m.deleted)))throw Error('选择的笔记状态已变化，请刷新后重新选择');
    for(const m of rows){
      if(operation==='delete'){m.deleted=true;m.deletedAt=now;}
      if(operation==='restore'){m.deleted=false;delete m.deletedAt;}
      if(operation==='tag'&&!tagsOf(m.content).includes(tag)){m.content=m.content.trimEnd()+'\n#'+tag;if(m.html)m.html+='<p>#'+tag+'</p>';m.updated=now;}
    }
    return validate(next);
  }
  function purge(state, ids) {
    const next=clone(state),selected=[...new Set(ids)];
    if(!selected.length)throw Error('请选择要永久删除的笔记');
    if(selected.some(id=>!validId(id)))throw Error('笔记 ID 无效');
    for(const id of selected){const memo=next.memos.find(m=>m.id===id);if(memo&&!memo.deleted)throw Error('只能永久删除回收站中的笔记');}
    next.memos=next.memos.filter(m=>!selected.includes(m.id));
    return validate(next);
  }
  // Drafts are separate from published notes; accept the original text-only format.
  function annotationDraft(id, value) {
    if (!validId(id)) return null;
    if (typeof value === 'string') value = {content:value, html:'', images:[]};
    if (!value || typeof value !== 'object' || typeof value.content !== 'string' ||
        !imageOK(value.images)) return null;
    const references = [...new Set([id, ...(Array.isArray(value.references) ? value.references : []).filter(validId)])].slice(0,200);
    const selection = value.selection;
    return {annotationOf:id, reflectionOf:'', ...(value.referencePrefill===true?{referencePrefill:true}:{}), content:value.content,
      html:typeof value.html === 'string' ? value.html : '', images:[...value.images], references,
      ...(selection && Number.isInteger(selection.anchor) && Number.isInteger(selection.head) && selection.anchor >= 0 && selection.head >= 0
        ? {selection:{anchor:selection.anchor,head:selection.head}} : {})};
  }
  // The memo footer uses with a relative update label:
  // HH:mm today, 昨天 HH:mm, N天前 HH:mm, MM-DD HH:mm within the year,
  // and YYYY-MM-DD for older records.
  function memoUpdatedLabel(iso, now = Date.now()) {
    const time = Date.parse(iso);
    const pad = value => String(value).padStart(2, '0');
    if (!Number.isFinite(time)) return '';
    const date = new Date(time);
    const current = new Date(now);
    const days = Math.floor((Number(now) - time) / 86400000);
    const clock = pad(date.getHours()) + ':' + pad(date.getMinutes());
    if (days === 0) return clock;
    if (days === 1) return '昨天 ' + clock;
    if (days > 1 && days < 7) return days + '天前 ' + clock;
    if (date.getFullYear() === current.getFullYear()) return pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + clock;
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
  }

  // The app counts the characters left after removing HTML tags, so bold,
  // highlight and list markup never inflate the number shown in the menu.
  function memoWordCount(memo) {
    if (!memo) return 0;
    const source = typeof memo.html === 'string' && memo.html.trim() ? memo.html : String(memo.content || '');
    return source.replace(/<[^>]*>/g, '').length;
  }

  const localDateKey = value => {
    const date = value instanceof Date ? value : new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  };
  const statsMonthParts = value => {
    if (value instanceof Date && Number.isFinite(value.getTime())) return {year:value.getFullYear(), month:value.getMonth() + 1};
    const match = /^(\d{4})-(\d{1,2})$/.exec(String(value || ''));
    if (!match) return null;
    const year=Number(match[1]), month=Number(match[2]);
    return year>=1000 && year<=9999 && month>=1 && month<=12 ? {year,month} : null;
  };
  const activeStatsMemos = state => state && Array.isArray(state.memos) ? state.memos.filter(memo => memo && !memo.deleted) : [];

  // Statistics use the local calendar, matching the date shown on each card.
  // Deleted notes are deliberately excluded, while tag/markup characters never
  // inflate the visible word count.
  function statsForMonth(state, value, now = new Date()) {
    const parts=statsMonthParts(value) || statsMonthParts(now);
    const year=parts.year, month=parts.month, daysInMonth=new Date(year, month, 0).getDate();
    const days=Array.from({length:daysInMonth},(_,index)=>({day:index+1,key:year+'-'+String(month).padStart(2,'0')+'-'+String(index+1).padStart(2,'0'),count:0,wordCount:0}));
    let count=0, wordCount=0;
    for (const memo of activeStatsMemos(state)) {
      const date=new Date(memo.created);
      if (!Number.isFinite(date.getTime()) || date.getFullYear()!==year || date.getMonth()+1!==month) continue;
      const words=memoWordCount(memo), day=days[date.getDate()-1];
      count++; wordCount+=words; day.count++; day.wordCount+=words;
    }
    return {
      year, month, monthKey:year+'-'+String(month).padStart(2,'0'), days,
      count, wordCount,
      recordDays:days.filter(day=>day.count>0).length,
      maxDay:Math.max(0,...days.map(day=>day.count)),
      maxWordDay:Math.max(0,...days.map(day=>day.wordCount))
    };
  }

  function statsForYear(state, year, now = new Date()) {
    const target=Number(year)||now.getFullYear(), months=Array.from({length:12},(_,index)=>statsForMonth(state,target+'-'+String(index+1),now));
    const days=new Map();
    for (const month of months) for (const day of month.days) days.set(day.key,{...day});
    return {
      year:target, months, days:[...days.values()],
      count:months.reduce((sum,month)=>sum+month.count,0),
      wordCount:months.reduce((sum,month)=>sum+month.wordCount,0),
      recordDays:months.reduce((sum,month)=>sum+month.recordDays,0)
    };
  }

  const statsHeatLevel = count => {const value=Number(count);return !Number.isFinite(value)||value<=0?0:value<=2?1:value<=5?2:value<=10?3:value<=20?4:5;};

  function statsCalendar(state, end = new Date(), length) {
    const finish=end instanceof Date && Number.isFinite(end.getTime()) ? new Date(end.getFullYear(),end.getMonth(),end.getDate()) : new Date();
    const hasExplicitLength=length!==undefined&&length!==null&&Number.isFinite(Number(length)),
      count=hasExplicitLength?Math.max(1,Math.min(1000,Number(length))):null,
      start=new Date(finish);
    if(hasExplicitLength)start.setDate(start.getDate()-count+1);
    else start.setFullYear(start.getFullYear()-1);
    const counts=new Map();
    for (const memo of activeStatsMemos(state)) {
      const key=localDateKey(memo.created);if(key)counts.set(key,(counts.get(key)||0)+1);
    }
    const dates=[];
    for(let date=new Date(start),guard=0;(count===null?date<=finish:guard<count)&&guard<1000;guard++,date.setDate(date.getDate()+1))dates.push(new Date(date));
    return dates.map(date=>{const key=localDateKey(date);return {key,date,count:counts.get(key)||0};});
  }

  function allStatistics(state) {
    const memos=activeStatsMemos(state), platformCounts=new Map(), mediaCounts=new Map(), tagCounts=new Map(), hourCounts=Array.from({length:7},()=>Array(24).fill(0));
    const platformLabels={direct:'客户端',annotation:'客户端',reflection:'客户端',import:'导入'};
    const words=[];
    for (const memo of memos) {
      const source=sourceOf(memo), platform=platformLabels[source];platformCounts.set(platform,(platformCounts.get(platform)||0)+1);
      const media=memo.audio?'音频':memo.images?.length||memo.video?'图片':hasLinks(memo)?'链接':'文本';
      mediaCounts.set(media,(mediaCounts.get(media)||0)+1);
      const count=memoWordCount(memo);words.push(count);
      const date=new Date(memo.created);if(Number.isFinite(date.getTime()))hourCounts[(date.getDay()+6)%7][date.getHours()]++;
      for (const tag of tagsOf(memo.content || '')) for (let index=1;index<=tag.split('/').length;index++){
        const name=tag.split('/').slice(0,index).join('/');tagCounts.set(name,(tagCounts.get(name)||0)+1);
      }
    }
    const wordDistribution=[
      {label:'0–50',min:0,max:50},{label:'51–100',min:51,max:100},{label:'101–300',min:101,max:300},
      {label:'301–500',min:301,max:500},{label:'501–1000',min:501,max:1000},{label:'1000+',min:1001,max:Infinity}
    ].map(bucket=>({...bucket,count:words.filter(word=>word>=bucket.min&&word<=bucket.max).length}));
    const distribution=counts=>[...counts].map(([name,count])=>({name,count})).sort((a,b)=>b.count-a.count||a.name.localeCompare(b.name,'zh-CN'));
    return {
      count:memos.length, wordCount:words.reduce((sum,word)=>sum+word,0), avgWords:memos.length?Math.round(words.reduce((sum,word)=>sum+word,0)/memos.length):0,
      maxWords:words.length?Math.max(...words):0, wordDistribution,
      timeDistribution:hourCounts.flatMap((hours,day)=>hours.map((count,hour)=>({weekday:day+1,hour,count}))),
      platformDistribution:distribution(platformCounts), mediaDistribution:distribution(mediaCounts),
      tags:distribution(tagCounts).map(row=>({...row,level:row.name.split('/').length,leaf:tagLeaf(row.name)}))
    };
  }

  // Single absolute label for the list, detail and floating note windows so
  // the same memo never shows two different clock times.
  function memoAbsoluteLabel(iso) {
    const time = Date.parse(iso);
    const pad = value => String(value).padStart(2, '0');
    if (!Number.isFinite(time)) return '';
    const date = new Date(time);
    return date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate()) + ' ' + pad(date.getHours()) + ':' + pad(date.getMinutes());
  }

  const api = {MODEL_VERSION,SOURCE_VALUES,displayPreferences,annotationDraft,clone,normalizeTag,validTag,matchTagSuggestions,recentTagSuggestions,tagParent,tagLeaf,tagWeight,compareTagNames,orderedTags,tokens,tagsOf,replaceTag,blank,usedDayCount,memoUpdatedLabel,memoWordCount,statsHeatLevel,statsForMonth,statsForYear,statsCalendar,allStatistics,memoAbsoluteLabel,validate,upgrade,merge,matches,searchText,daily,related,refsOf,resolveRef,hasLinks,sourceOf,memoIdFromToken,memoIds,relationships,snapshot,restoreVersion,semanticSearch,recommendMemos,batch,purge};
  if (typeof module !== 'undefined') module.exports = api;
  else root.MemoCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
