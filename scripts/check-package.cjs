'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),assert=require('node:assert/strict'),asar=require('@electron/asar');
const root=path.resolve(__dirname,'..'),{version}=require('../package.json'),archive=path.join(root,'release/win-unpacked/resources/app.asar');
const hash=buffer=>crypto.createHash('sha256').update(buffer).digest('hex');
const packed=JSON.parse(asar.extractFile(archive,'package.json').toString());assert.equal(packed.version,version);const {verifyBuildIdentity}=require('./verify-build-identity.cjs');const buildIdentity=verifyBuildIdentity({archive,root,version,release:process.env.PUBLISH_RELEASE==='true'});
const files=asar.listPackage(archive).map(name=>name.replace(/\\/g,'/').replace(/^\//,''));let verified=0;
for(const file of files){
 if(file==='package.json')continue;
 assert.ok(file==='THIRD-PARTY-NOTICES.md'||file==='desktop'||file==='dist'||file.startsWith('desktop/')||file.startsWith('dist/'),'安装包包含非应用资料：'+file);
 const source=path.join(root,file);assert.ok(fs.existsSync(source),'安装包存在未知文件：'+file);if(fs.statSync(source).isDirectory())continue;
 assert.equal(hash(asar.extractFile(archive,path.normalize(file))),hash(fs.readFileSync(source)),'安装包与当前源码不同：'+file);verified++;
}
for(const required of ['dist/share.css','desktop/share-images.cjs','dist/editor.js','dist/interactions.js','dist/core.js','dist/icons.js','dist/fidelity.css','dist/sidebar.css','dist/ui-font.css','dist/cards.css','dist/tag-sidebar.js','desktop/main.cjs','desktop/obsidian-vault-scope.cjs','desktop/obsidian-sync.cjs','desktop/obsidian-sync-plan.cjs','desktop/obsidian-review-sync.cjs','desktop/obsidian-frontmatter.cjs','desktop/obsidian-image-assets.cjs','desktop/obsidian-deletion-recovery.cjs','desktop/obsidian-bridge-client.cjs','desktop/updates.cjs','desktop/updater-runtime.cjs','desktop/backups.cjs','desktop/ai-agent.cjs','desktop/ai-library-context.cjs','desktop/ai-conversations.cjs','desktop/profile-migration.cjs','desktop/float-state.cjs','desktop/protocol-links.cjs','dist/compose.js','dist/float.js'])assert.ok(files.includes(required),required);
assert.match(fs.readFileSync(path.join(root,'release/latest.yml'),'utf8'),new RegExp('version: '+version.replace(/\./g,'\\.')));
const artifacts={};for(const ext of ['exe','zip']){const filename=`Fomo-${version}-x64.${ext}`,file=path.join(root,'release',filename),data=fs.readFileSync(file);assert.ok(data.length>1000000,filename);artifacts[ext]={filename,bytes:data.length,sha256:hash(data)};}
const yaml=require('js-yaml'),update=yaml.load(fs.readFileSync(path.join(root,'release/latest.yml'),'utf8')),feed=yaml.load(fs.readFileSync(path.join(root,'release/win-unpacked/resources/app-update.yml'),'utf8'));
assert.equal(feed.provider,'github');assert.equal(feed.owner,'tanyaoo');assert.equal(feed.repo,'Fomo');assert.equal(feed.private,false);assert.ok(!feed.token&&!feed.requestHeaders,'发布凭据不得进入安装包');
assert.equal(update.version,version);assert.equal(update.path,artifacts.exe.filename);assert.equal(update.sha512,crypto.createHash('sha512').update(fs.readFileSync(path.join(root,'release',update.path))).digest('base64'),'更新元数据摘要必须与本次安装包一致');
const {signingConfiguration,validateSignature}=require('./windows-signing.cjs'),signingConfig=signingConfiguration();let signing={mode:signingConfig.mode,verified:false};
if(signingConfig.mode!=='none'){
 assert.ok([feed.publisherName].flat().includes(signingConfig.publisher),'更新配置必须包含经确认的签名发布者');
 const command=require('node:child_process').spawnSync('powershell.exe',['-NoProfile','-NonInteractive','-ExecutionPolicy','Bypass','-File',path.join(__dirname,'verify-windows-signatures.ps1')],{encoding:'utf8',windowsHide:true});
 if(command.error||command.status!==0)throw Error('Windows 签名校验无法完成，停止发布');
 const signatures=JSON.parse(command.stdout.replace(/^\uFEFF/,''));assert.equal(signatures.length,3);
 signatures.forEach(record=>validateSignature(record,signingConfig.publisher));signing={mode:signingConfig.mode,verified:true,files:signatures};
}
const result={version,buildIdentity,verifiedFiles:verified,asarSha256:hash(fs.readFileSync(archive)),artifacts,signing};fs.mkdirSync(path.join(root,'work'),{recursive:true});fs.writeFileSync(path.join(root,'work',`verified-release-${version}.json`),JSON.stringify(result,null,2));console.log('PASS: packaged '+version+'; '+verified+' files match current source, no data/test artifacts; EXE and ZIP hashes recorded.');
console.log(signing.verified?'PASS: Windows trusts installer, app and helper signatures; timestamp and updater publisher verified.':'NOTICE: 正式代码签名未启用；本次构建不得标为已签名。');
