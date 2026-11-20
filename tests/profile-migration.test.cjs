'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {migrateLegacyProfile,adoptLegacyCryptKey}=require('../desktop/profile-migration.cjs');
const temporary=()=>fs.mkdtempSync(path.join(os.tmpdir(),'writeboom-migration-'));
const legacy=(root,name='Memo Flow')=>path.join(root,name);

test('migrates notes, window state, storage location and local preferences',t=>{
 const root=temporary();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const old=legacy(root),target=path.join(root,'WriteBoom');
 fs.mkdirSync(path.join(old,'data'),{recursive:true});
 fs.writeFileSync(path.join(old,'data','state.json'),'{"memos":[]}');
 fs.writeFileSync(path.join(old,'window.json'),'{"width":900}');
 fs.writeFileSync(path.join(old,'storage-location.json'),'{"directory":"D:/notes"}');
 fs.mkdirSync(path.join(old,'Local Storage','leveldb'),{recursive:true});
 fs.writeFileSync(path.join(old,'Local Storage','leveldb','CURRENT'),'CURRENT');
 const result=migrateLegacyProfile({appData:root,target});
 assert.equal(result.directory,target);assert.equal(result.migrated,true);
 assert.equal(fs.readFileSync(path.join(target,'data','state.json'),'utf8'),'{"memos":[]}');
 assert.equal(fs.readFileSync(path.join(target,'window.json'),'utf8'),'{"width":900}');
 assert.equal(fs.readFileSync(path.join(target,'storage-location.json'),'utf8'),'{"directory":"D:/notes"}');
 assert.equal(fs.readFileSync(path.join(target,'Local Storage','leveldb','CURRENT'),'utf8'),'CURRENT');
});

test('does not overwrite an existing WriteBoom library',t=>{
 const root=temporary();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const old=legacy(root),target=path.join(root,'WriteBoom');
 fs.mkdirSync(path.join(old,'data'),{recursive:true});fs.writeFileSync(path.join(old,'data','state.json'),'old');
 fs.mkdirSync(path.join(target,'data'),{recursive:true});fs.writeFileSync(path.join(target,'data','state.json'),'new');
 const result=migrateLegacyProfile({appData:root,target});
 assert.equal(result.migrated,false);assert.equal(fs.readFileSync(path.join(target,'data','state.json'),'utf8'),'new');
});

test('migrates a custom storage location even when the old default library is empty',t=>{
 const root=temporary();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const old=legacy(root),target=path.join(root,'WriteBoom');
 fs.mkdirSync(old,{recursive:true});fs.writeFileSync(path.join(old,'storage-location.json'),'{"directory":"E:/custom"}');
 const result=migrateLegacyProfile({appData:root,target});
 assert.equal(result.migrated,true);assert.equal(fs.readFileSync(path.join(target,'storage-location.json'),'utf8'),'{"directory":"E:/custom"}');
});

test('adopts the matching legacy Chromium crypt key for an inherited API key',t=>{
 const root=temporary();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const old=legacy(root,'WriteBoom'),target=path.join(root,'Fomo');
 fs.mkdirSync(old,{recursive:true});fs.mkdirSync(target,{recursive:true});
 fs.writeFileSync(path.join(old,'ai-settings.json'),JSON.stringify({encryptedKey:'same-ciphertext'}));
 fs.writeFileSync(path.join(target,'ai-settings.json'),JSON.stringify({encryptedKey:'same-ciphertext'}));
 fs.writeFileSync(path.join(old,'Local State'),JSON.stringify({profile:{legacy:true},os_crypt:{encrypted_key:'legacy-key',audit_enabled:true}}));
 fs.writeFileSync(path.join(target,'Local State'),JSON.stringify({profile:{current:true},os_crypt:{encrypted_key:'current-key',audit_enabled:false}}));
 const result=adoptLegacyCryptKey({appData:root,target,legacyNames:['WriteBoom']});
 assert.equal(result.migrated,true);
 const migrated=JSON.parse(fs.readFileSync(path.join(target,'Local State'),'utf8'));
 assert.deepEqual(migrated,{profile:{current:true},os_crypt:{encrypted_key:'legacy-key',audit_enabled:true}});
 assert.deepEqual(JSON.parse(fs.readFileSync(result.backup,'utf8')).os_crypt,{encrypted_key:'current-key',audit_enabled:false});
});

test('does not replace a current Chromium crypt key for an independently saved API key',t=>{
 const root=temporary();t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const old=legacy(root,'WriteBoom'),target=path.join(root,'Fomo');
 fs.mkdirSync(old,{recursive:true});fs.mkdirSync(target,{recursive:true});
 fs.writeFileSync(path.join(old,'ai-settings.json'),JSON.stringify({encryptedKey:'legacy-ciphertext'}));
 fs.writeFileSync(path.join(target,'ai-settings.json'),JSON.stringify({encryptedKey:'current-ciphertext'}));
 fs.writeFileSync(path.join(old,'Local State'),JSON.stringify({os_crypt:{encrypted_key:'legacy-key'}}));
 fs.writeFileSync(path.join(target,'Local State'),JSON.stringify({os_crypt:{encrypted_key:'current-key'}}));
 const result=adoptLegacyCryptKey({appData:root,target,legacyNames:['WriteBoom']});
 assert.equal(result.migrated,false);
 assert.equal(JSON.parse(fs.readFileSync(path.join(target,'Local State'),'utf8')).os_crypt.encrypted_key,'current-key');
});
