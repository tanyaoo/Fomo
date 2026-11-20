'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
(async()=>{
 const root=path.resolve(__dirname,'..'),parent=path.join(root,'work');await fs.mkdir(parent,{recursive:true});const directory=await fs.mkdtemp(path.join(parent,'workspace-'));
 const now='2026-10-01T00:00:00.000Z',make=(id,content)=>({id,content,html:'<p>'+content+'</p>',images:[],starred:false,deleted:false,created:now,updated:now});
 const old={version:4,memos:[make('a','起点 #阅读'),make('b','第二条参考笔记 #阅读/摘录'),make('c','第三条参考笔记 #工作'),...Array.from({length:24},(_,i)=>make('context-'+i,'前段背景'.repeat(80)+' <img src=x> 排序测试 检索词 '+i))]};
 await fs.mkdir(path.join(directory,'data'));await fs.writeFile(path.join(directory,'data/state.json'),JSON.stringify(old));await fs.writeFile(path.join(directory,'data/draft.json'),JSON.stringify({editing:'',current:{content:'尚未提交的原草稿',html:'<p>尚未提交的原草稿</p>',images:[]},newDraft:{content:'',images:[]}}));
 for(const phase of ['editor-interactions'])await new Promise((resolve,reject)=>{
   const child=spawn(require('electron'),['--headless','--no-sandbox','--disable-gpu',root,'--self-test'],{env:{...process.env,MEMOFLOW_DATA_DIR:directory,MEMOFLOW_TEST_PHASE:phase},stdio:'pipe',windowsHide:true});let output='';const timer=setTimeout(()=>{child.kill();reject(Error('编辑器测试超时'));},120000);
   child.stdout.on('data',chunk=>{output+=chunk;process.stdout.write(chunk);});child.stderr.on('data',chunk=>process.stderr.write(chunk));child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('exit',code=>{clearTimeout(timer);code===0&&output.includes('PASS: '+phase)?resolve():reject(Error('编辑器测试未完成 '+phase+'，退出码 '+code));});
 });
 console.log('Editor interaction tests passed; isolated data: '+directory);
})().catch(error=>{console.error(error);process.exitCode=1;});
