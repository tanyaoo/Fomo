'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
 const source=fs.readFileSync(path.join(__dirname,'../src/note-metadata.js'),'utf8');
 const {menuEditedDate:f}=await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
 const now=new Date(2026,0,2,0,5);
 const cases=[
  [new Date(2026,0,2,0,1),'00:01'],
  [new Date(2026,0,1,23,59),'23:59'],
  [new Date(2025,11,31,9,7),'昨天 09:07'],
  [new Date(2025,11,20,9,7),'2025-12-20'],
  [new Date(2026,0,3,9,7),'01-03 09:07'],
  ['invalid','']
 ];
 for(const [value,expected] of cases)assert.equal(f(value,now),expected);
 assert.equal(f(new Date(2026,2,7,23,59),new Date(2026,2,9,0,1)),'昨天 23:59');
 console.log('Note metadata: 7 relative-date cases passed');
})().catch(e=>{console.error(e);process.exitCode=1;});
