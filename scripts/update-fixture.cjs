'use strict';
const http=require('node:http'),fs=require('node:fs/promises'),path=require('node:path'),crypto=require('node:crypto');
module.exports=async({updater,userDirectory})=>{
 const parts=require('../package.json').version.split('.').map(Number),nextVersion=parts[0]+'.'+parts[1]+'.'+(parts[2]+1);
 const payload=Buffer.from('Fomo isolated download fixture; never execute.');
 const sha512=crypto.createHash('sha512').update(payload).digest('base64');
 const server=http.createServer((req,res)=>{
   if(req.url.startsWith('/latest.yml')){res.setHeader('Content-Type','text/yaml');res.end(`version: ${nextVersion}\nfiles:\n  - url: Fomo-${nextVersion}-x64.exe\n    sha512: ${sha512}\n    size: ${payload.length}\npath: Fomo-${nextVersion}-x64.exe\nsha512: ${sha512}\nreleaseDate: '2026-10-21T00:00:00Z'\n`);}
   else if(req.url.includes('.exe')){const bytes=require('node:fs').existsSync(path.join(userDirectory,'corrupt-download'))?Buffer.alloc(payload.length,120):payload;res.setHeader('Content-Length',bytes.length);res.end(bytes);}
   else{res.statusCode=404;res.end();}
 });await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));server.unref();
 const config=path.join(userDirectory,'test-app-update.yml');
 await fs.writeFile(config,'provider: generic\nurl: http://127.0.0.1:'+server.address().port+'\nupdaterCacheDirName: writeboom-update-tests-'+path.basename(userDirectory)+'\n');
 updater.updateConfigPath=config;updater.forceDevUpdateConfig=true;updater.setFeedURL({provider:'generic',url:'http://127.0.0.1:'+server.address().port});
 if(process.env.MEMOFLOW_TEST_DEBUG==='1')updater.logger=console;
 Object.defineProperty(updater.app,'baseCachePath',{value:path.join(userDirectory,'cache')});
 updater.quitAndInstall=(silent,reopen)=>{require('node:fs').writeFileSync(path.join(userDirectory,'install-request.json'),JSON.stringify({silent,reopen,installerPath:updater.installerPath}));};
};
