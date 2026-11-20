'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
(async()=>{
 const root=path.resolve(__dirname,'..'),parent=path.join(root,'work');await fs.mkdir(parent,{recursive:true});const directory=await fs.mkdtemp(path.join(parent,'workspace-'));
 const now='2026-10-01T00:00:00.000Z',make=(id,content)=>({id,content,html:'<p>'+content+'</p>',images:[],starred:false,deleted:false,created:now,updated:now});
 const paragraphs=Array.from({length:65},(_,i)=>'导航段落 '+(i+1)+' #导航').join('\n');
 const old={version:4,memos:[{...make('a',paragraphs),html:'',references:['b','trash','missing-source']},
 {...make('b',paragraphs+'\nwriteboom://note/c'),html:'',references:['a','c']},
 {...make('c',paragraphs),html:''},{...make('trash','回收站中的来源'),deleted:true},
 {...make('annotation','批注 #导航'),annotationOf:'a',references:['a','b','missing-source']},
 ...Array.from({length:20},(_,i)=>({...make('incoming-'+i,'导航引用 '+i+' #导航'),references:['a','b'],...(i===19?{annotationOf:'missing-parent'}:{})}))]};
 await fs.mkdir(path.join(directory,'data'));await fs.writeFile(path.join(directory,'data/state.json'),JSON.stringify(old));await fs.writeFile(path.join(directory,'data/draft.json'),JSON.stringify({editing:'',annotationDrafts:{c:'旧版批注草稿'},current:{content:'尚未提交的原草稿',html:'<p>尚未提交的原草稿</p>',images:[]},newDraft:{content:'',images:[]}}));
 for(const phase of ['reference-navigation'])await new Promise((resolve,reject)=>{
   const child=spawn(require('electron'),['--headless','--no-sandbox','--disable-gpu',root,'--self-test'],{env:{...process.env,MEMOFLOW_DATA_DIR:directory,MEMOFLOW_TEST_PHASE:phase},stdio:'pipe',windowsHide:true});let output='';const timer=setTimeout(()=>{child.kill();reject(Error('工作台测试超时'));},120000);
   child.stdout.on('data',chunk=>{output+=chunk;process.stdout.write(chunk);});child.stderr.on('data',chunk=>process.stderr.write(chunk));child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('exit',code=>{clearTimeout(timer);code===0&&output.includes('PASS: '+phase)?resolve():reject(Error('工作台测试未完成 '+phase+'，退出码 '+code));});
 });
 console.log('Reference navigation tests passed; isolated data: '+directory);
})().catch(error=>{console.error(error);process.exitCode=1;});
