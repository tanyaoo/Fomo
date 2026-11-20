'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawnSync}=require('node:child_process');
const root=path.resolve(__dirname,'..'),directory=path.join(root,'work/release-checks');fs.mkdirSync(directory,{recursive:true});
const checks=['test','test:compose','test:compose-editor','test:desktop','test:lifecycle','test:workspace','test:annotation-drafts','test:reference-navigation','test:editor','test:updates','test:refinements','test:list-menu','test:cards','test:tags-cards','test:sidebar','test:tag-management','test:inline-edit','test:dialogs','test:settings','test:ai-insight','test:agent-chat','test:exports','test:discovery','test:feedback','test:share-images','test:detail-relations','test:note-scrollbar'];
const results=[];
for(const check of checks){
 const file=path.join(directory,check.replaceAll(':','-')+'.log');let result,passed=false;
 for(let attempt=1;attempt<=2&&!passed;attempt++){
  const fd=fs.openSync(file,attempt===1?'w':'a');result=spawnSync(process.execPath,[process.env.npm_execpath,'run',check],{cwd:root,stdio:['ignore',fd,fd],windowsHide:true,timeout:180000});fs.closeSync(fd);
  passed=!result.error&&result.status===0;
  if(!passed&&attempt===1)console.log(`RETRY: ${check}（首次 Electron 测试未通过，隔离重试）`);
 }
 results.push({check,passed});console.log(`${passed?'PASS':'FAIL'}: ${check}`);
 if(!passed){if(result.error)console.error(result.error.message);console.error(fs.readFileSync(file,'utf8').split(/\r?\n/).slice(-45).join('\n'));}
 fs.writeFileSync(path.join(directory,'results.json'),JSON.stringify(results,null,2));
}
const metadata=spawnSync(process.execPath,[path.join(root,'scripts/test-note-metadata.cjs')],{cwd:root,stdio:'inherit',windowsHide:true});
const failed=results.filter(result=>!result.passed).map(result=>result.check);if(metadata.status!==0)failed.push('note-metadata');
if(failed.length){console.error('Release checks failed: '+failed.join(', '));process.exitCode=1;}else console.log('PASS: all release checks');
