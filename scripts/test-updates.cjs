'use strict';
const fs=require('node:fs/promises'),path=require('node:path'),{spawn}=require('node:child_process');
(async()=>{
 const root=path.resolve(__dirname,'..'),parent=path.join(root,'work');await fs.mkdir(parent,{recursive:true});const directory=await fs.mkdtemp(path.join(parent,'update-smoke-'));
 for(const phase of ['updates','updates-restart'])await new Promise((resolve,reject)=>{
   const child=spawn(require('electron'),['--headless','--no-sandbox','--disable-gpu',root,'--self-test'],{env:{...process.env,MEMOFLOW_DATA_DIR:directory,MEMOFLOW_TEST_PHASE:phase},stdio:'pipe',windowsHide:true});let output='';const timer=setTimeout(()=>{child.kill();reject(Error('更新测试超时'));},90000);
   child.stdout.on('data',chunk=>{output+=chunk;process.stdout.write(chunk);});child.stderr.on('data',chunk=>process.stderr.write(chunk));child.on('error',error=>{clearTimeout(timer);reject(error);});child.on('exit',code=>{clearTimeout(timer);code===0&&output.includes(phase==='updates'?'PASS: updater real download':'PASS: updater restart')?resolve():reject(Error('更新测试未完成，退出码 '+code));});
 });
})().catch(error=>{console.error(error);process.exitCode=1;});
