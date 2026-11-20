'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
(async()=>{
 const root=path.resolve(__dirname,'..');await fs.mkdir(path.join(root,'work'),{recursive:true});const directory=await fs.mkdtemp(path.join(root,'work/lifecycle-'));
 const now=new Date().toISOString(),make=id=>({id,content:'原笔记 '+id+' #阅读',html:'',images:[],created:now,updated:now,deleted:false,starred:false});
 await fs.mkdir(path.join(directory,'data'));await fs.writeFile(path.join(directory,'data/state.json'),JSON.stringify({version:4,memos:[make('a'),make('b')]}));
 for(const phase of ['lifecycle-first','lifecycle-restart','lifecycle-corrupt','lifecycle-invalid','lifecycle-invalid-id','lifecycle-tray-quit']){
  if(phase==='lifecycle-tray-quit')await fs.writeFile(path.join(directory,'data/draft.json'),JSON.stringify({current:{content:'',images:[]}}));
  if(phase==='lifecycle-corrupt'||phase.startsWith('lifecycle-invalid')){
   const file=path.join(directory,'data/draft.json');await fs.copyFile(file,path.join(directory,'valid-draft.json'));
   await fs.writeFile(file,phase==='lifecycle-corrupt'?'broken-original-draft':phase==='lifecycle-invalid-id'?JSON.stringify({editing:'../invalid',current:{content:'标识无效的原草稿',images:[]}}):JSON.stringify({current:{content:'结构错误的原草稿',images:['https://invalid/image']}}));
  }
  await new Promise((resolve,reject)=>{const child=spawn(require('electron'),['--headless','--no-sandbox','--disable-gpu',root,'--self-test'],{env:{...process.env,MEMOFLOW_DATA_DIR:directory,MEMOFLOW_TEST_PHASE:phase},stdio:'pipe',windowsHide:true});let output='';const timer=setTimeout(()=>{child.kill();reject(Error('Lifecycle timeout: '+phase));},90000);child.stdout.on('data',c=>{output+=c;process.stdout.write(c)});child.stderr.on('data',c=>process.stderr.write(c));child.on('error',e=>{clearTimeout(timer);reject(e)});child.on('exit',code=>{clearTimeout(timer);code===0&&output.includes('PASS: '+phase)?resolve():reject(Error('Lifecycle failed: '+phase+' '+code));});});
 }
 console.log('Lifecycle tests passed; isolated data: '+directory);
})().catch(e=>{console.error(e);process.exitCode=1});
