const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../dist/core.js');
const memo = (id,content='文字') => ({id,content,html:'',created:'2026-10-01T00:00:00.000Z',updated:'2026-10-01T00:00:00.000Z',starred:false,deleted:false,images:[]});

test('appearance accepts follow-system and rejects unknown theme values',()=>{
  assert.equal(C.validate({memos:[],theme:'system'}).theme,'system');
  assert.equal(C.validate({memos:[],theme:'sepia'}).theme,'light');
  const base=C.validate({memos:[],theme:'light'}),desired=C.clone(base);desired.theme='system';
  assert.equal(C.merge(base,desired,base).theme,'system');
});
test('pinned records survive backup, merge and unpin without modifying their content',()=>{
 const base=C.validate({memos:[memo('a'),memo('b')]});
 const desired=C.clone(base);desired.memos[0].pinned=true;
 const latest=C.clone(base);latest.memos[1].content='另一窗口的新内容';
 const merged=C.merge(base,desired,latest);
 assert.equal(merged.memos[0].pinned,true);assert.equal(merged.memos[1].content,'另一窗口的新内容');
 assert.equal(C.validate(JSON.parse(JSON.stringify(merged))).memos[0].pinned,true);
 const unpinned=C.clone(merged);unpinned.memos[0].pinned=false;
 assert.equal(C.merge(merged,unpinned,merged).memos[0].pinned,undefined);
 assert.throws(()=>C.validate({memos:[{...memo('x'),pinned:'yes'}]}),/置顶/);
});

test('used-day count follows reference account-age semantics rather than distinct recording days',()=>{
 const first=new Date(2026,0,1,23,30),now=new Date(2026,0,4,1,0);
 const state=C.validate({memos:[
   {...memo('old'),created:first.toISOString(),deleted:true},
   {...memo('later'),created:new Date(2026,0,4,0,30).toISOString()}
 ]});
 assert.equal(C.usedDayCount(state,now),4);
 assert.equal(C.usedDayCount({memos:[{created:new Date(2026,0,4,8,0).toISOString()}]},new Date(2026,0,4,23,0)),1);
 assert.equal(C.usedDayCount({memos:[]},now),0);
 assert.equal(C.usedDayCount({memos:[{created:'invalid'}]},now),0);
});

test('legacy backups gain optional review progress without changing their notes',()=>{
 const old={memos:[memo('old')],profile:'原名称'};
 const restored=C.validate(old);
 assert.deepEqual(restored.reviewed,{});assert.deepEqual(restored.memos,old.memos);
 const reflection={...memo('new'),relatedTo:'old'};
 const state={...restored,memos:[...restored.memos,reflection],reviewed:{'2026-10-16':['old']}};
 assert.deepEqual(C.validate(JSON.parse(JSON.stringify(state))),state);
 assert.throws(()=>C.validate({...state,memos:[{...reflection,relatedTo:'../bad'}]}),/关联/);
 assert.throws(()=>C.validate({...state,reviewed:{bad:['old']}}),/回顾进度/);
});

test('simultaneous review completion merges additions while preserving note conflict checks',()=>{
 const base={...C.blank(),memos:[memo('a'),memo('b')]};
 const first={...C.clone(base),reviewed:{'2026-10-16':['a']}};
 const second={...C.clone(base),reviewed:{'2026-10-16':['b']}};
 const latest=C.merge(base,first,base),merged=C.merge(base,second,latest);
 assert.deepEqual(new Set(merged.reviewed['2026-10-16']),new Set(['a','b']));
 assert.deepEqual(merged.memos,base.memos);
});
test('audio attachments roundtrip and invalid audio is rejected',()=>{
 const audio='data:audio/webm;base64,AAAA';
 const validated=C.validate({memos:[{...memo('voice'),audio}]});
 assert.equal(validated.memos[0].audio,audio);
 assert.equal(C.validate(JSON.parse(JSON.stringify(validated))).memos[0].audio,audio);
 assert.throws(()=>C.validate({memos:[{...memo('bad-voice'),audio:'javascript:alert(1)'}]}),/音频/);
});
test('video attachments roundtrip and invalid video is rejected',()=>{
 const video='data:video/mp4;base64,AAAA';
 const validated=C.validate({memos:[{...memo('clip'),video}]});
 assert.equal(validated.memos[0].video,video);
 assert.throws(()=>C.validate({memos:[{...memo('bad-clip'),video:'javascript:alert(1)'}]}),/视频/);
});
test('URL fragments are preserved; tag spelling is canonical',()=>{
 const text='https://a.test/#读书 #读书/ #读书//摘录 #工作';
 assert.deepEqual(C.tagsOf(text),['读书','读书/摘录','工作']);
 assert.equal(C.replaceTag(text,'读书','阅读'),'https://a.test/#读书 #阅读 #阅读/摘录 #工作');
});
test('emoji-prefixed tags render and rename like text tags',()=>{
 const text='#📚/读书 #👨‍💻/工作 #⭐';
 assert.deepEqual(C.tagsOf(text),['📚/读书','👨‍💻/工作','⭐']);
 assert.equal(C.validTag('📚/读书'),true);
 assert.equal(C.validTag('👨‍💻'),true);
 assert.equal(C.replaceTag(text,'📚','📖'),'#📖/读书 #👨‍💻/工作 #⭐');
});
test('invalid stored data aborts rather than silently seeding or overwriting',()=>{
 for(const memos of [[{}],[memo('x'),memo('x')],[{...memo('x'),images:['javascript:alert(1)']}],[{...memo('x'),id:'"><svg'}]])assert.throws(()=>C.validate({memos}));
 assert.throws(()=>C.validate({memos:[],extraTags:[null]}));
});
test('backup roundtrip preserves empty tags, appearance and review settings',()=>{
 const s={...C.blank(),memos:[memo('x')],extraTags:['空标签'],theme:'dark',profile:'测试',review:{count:12,period:'3',include:'读书',exclude:'工作',noTags:false,at:'20:00',notify:false}};
 assert.deepEqual(C.validate(JSON.parse(JSON.stringify(s))),s);
});
test('concurrent additions and changes to unrelated records survive',()=>{
 const base={...C.blank(),memos:[memo('a'),memo('b')]};
 const first=C.clone(base);first.memos.push(memo('new-a'));first.memos[0].starred=true;
 const latest=C.merge(base,first,base);
 const second=C.clone(base);second.memos.push(memo('new-b'));second.memos[1].deleted=true;
 const result=C.merge(base,second,latest);
 assert.equal(result.memos.length,4);assert.equal(result.memos.find(m=>m.id==='a').starred,true);assert.equal(result.memos.find(m=>m.id==='b').deleted,true);
});
test('a stale edit cannot overwrite another window or restored/deleted record',()=>{
 const base={...C.blank(),memos:[memo('a')]};const desired=C.clone(base);desired.memos[0].content='我的编辑';
 for(const latest of [{...C.clone(base),memos:[memo('a','另一窗口编辑')]},{...C.clone(base),memos:[{...memo('a'),deleted:true}]}])assert.throws(()=>C.merge(base,desired,latest),/其他窗口修改/);
});
test('conflicting settings require resolution',()=>{
 const base=C.blank(),a={...base,profile:'A'},b={...base,profile:'B'};assert.throws(()=>C.merge(base,a,b));
});
test('multi-keyword search and filtered daily selection do not miss old records',()=>{
 const list=Array.from({length:30},(_,i)=>memo('m-'+i,i===29?'老笔记 目标 内容':'新记录'));
 const candidates=list.filter(m=>C.matches(m.content,'目标 内容'));
 assert.equal(C.daily(candidates,'2026-10-11',8)[0].id,'m-29');
 assert.equal(C.matches('内容 目标','目标   内容'),true);assert.equal(C.matches('目标','目标 内容'),false);
});
test('daily review is stable for a day and configured count',()=>{
 const list=Array.from({length:30},(_,i)=>memo('m-'+i));
 assert.deepEqual(C.daily(list,'2026-10-11',8),C.daily([...list].reverse(),'2026-10-11',8));
 assert.equal(C.daily(list,'2026-10-11',12).length,12);
 assert.notDeepEqual(C.daily(list,'2026-10-11',8),C.daily(list,'2026-10-12',8));
});
