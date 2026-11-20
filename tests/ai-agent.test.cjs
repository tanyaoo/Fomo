'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {runAgent}=require('../desktop/ai-agent.cjs');
const settings=()=>({requests:new Map(),readRaw:async()=>({enabled:true,baseUrl:'https://example.test',model:'deepseek-chat'}),secretKey:async()=> 'synthetic'});
const sse=(...packets)=>new Response(packets.map(p=>'data: '+JSON.stringify(p)+'\n\n').join('')+'data: [DONE]\n\n');
test('agent executes bounded search and streams final answer with valid tool history',async()=>{
  const original=global.fetch,requests=[],events=[],seen=[];
  global.fetch=async (_url,init)=>{requests.push(JSON.parse(init.body));return requests.length===1?sse({choices:[{delta:{tool_calls:[{index:0,id:'call-1',type:'function',function:{name:'search_notes',arguments:'{"query":"阅读"}'}}]}}]}):sse({choices:[{delta:{content:'找到笔记'}}]});};
  try{const result=await runAgent(settings(),{requestId:'r',messages:[{role:'user',content:'找阅读'}]},async query=>{seen.push(query);return [{id:'n1',created:'2026-01-01',content:'阅读笔记'}];},event=>events.push(event));
    assert.equal(result.content,'找到笔记');assert.deepEqual(seen,['阅读']);assert.equal(requests[0].tools[0].function.name,'search_notes');assert.equal(requests[1].messages.at(-2).tool_calls[0].id,'call-1');assert.equal(requests[1].messages.at(-1).tool_call_id,'call-1');assert.match(requests[1].messages.at(-1).content,/阅读笔记/);assert.equal(events[0].type,'search');assert.equal(events[1].delta,'找到笔记');
  }finally{global.fetch=original;}
});
test('agent rejects unsupported tools without executing search',async()=>{
  const original=global.fetch;let searched=false;
  global.fetch=async()=>sse({choices:[{delta:{tool_calls:[{index:0,id:'bad',function:{name:'delete_notes',arguments:'{}'}}]}}]});
  try{await assert.rejects(runAgent(settings(),{messages:[{role:'user',content:'test'}]},async()=>{searched=true;return [];}),/不支持的工具/);assert.equal(searched,false);}finally{global.fetch=original;}
});
test('agent cancellation during configuration prevents network requests',async()=>{
  const instance=settings(),original=global.fetch;let resolve,called=false;instance.readRaw=()=>new Promise(r=>resolve=r);global.fetch=async()=>{called=true;};
  try{const pending=runAgent(instance,{requestId:'cancel',messages:[{role:'user',content:'test'}]},async()=>[]);instance.requests.get('cancel').abort();resolve({enabled:true,baseUrl:'https://example.test',model:'deepseek-chat'});await assert.rejects(pending,/停止或超时/);assert.equal(called,false);assert.equal(instance.requests.size,0);}finally{global.fetch=original;}
});
test('library context is sent without manual references and reports incomplete coverage',async()=>{
  const original=global.fetch,events=[];let sent;global.fetch=async(_url,init)=>{sent=JSON.parse(init.body);return sse({choices:[{delta:{content:'回答'}}]});};
  try{await runAgent(settings(),{messages:[{role:'user',content:'我的目标是什么'}]},async()=>[],event=>events.push(event),async question=>{assert.equal(question,'我的目标是什么');return {total:3,included:1,truncated:true,notes:[{id:'a',created:'2026-01-01',content:'目标是完成项目'}]};});assert.match(sent.messages[0].content,/目标是完成项目/);assert.match(sent.messages[0].content,/背景不完整/);assert.equal(events[0].type,'library');assert.equal(events[0].included,1);}finally{global.fetch=original;}
});
