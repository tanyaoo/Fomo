'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path');
const {validateVaultFolder}=require('../desktop/obsidian-vault-scope.cjs');
test('desktop scope requires a visible subfolder of an Obsidian vault',async t=>{
 const root=await fs.mkdtemp(path.join(process.cwd(),'work','obsidian-scope-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
 const vault=path.join(root,'vault'),folder=path.join(vault,'Fomo','nested'),outside=path.join(root,'outside');
 await fs.mkdir(path.join(vault,'.obsidian'),{recursive:true});await fs.mkdir(folder,{recursive:true});await fs.mkdir(path.join(vault,'.trash'));await fs.mkdir(outside);
 const result=await validateVaultFolder(folder);assert.equal(result.vault,await fs.realpath(vault));assert.equal(result.relative,'Fomo/nested');
 await assert.rejects(validateVaultFolder(vault),/整个 Obsidian 库/);await assert.rejects(validateVaultFolder(path.join(vault,'.obsidian')),/隐藏/);await assert.rejects(validateVaultFolder(path.join(vault,'.trash')),/隐藏/);await assert.rejects(validateVaultFolder(outside),/不在已识别/);await assert.rejects(validateVaultFolder('../relative'),/专用文件夹/);
 await fs.rename(path.join(vault,'.obsidian'),path.join(root,'configuration-backup'));await assert.rejects(validateVaultFolder(folder),/不在已识别/);
});
