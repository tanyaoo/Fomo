'use strict';
const fs=require('node:fs/promises'),path=require('node:path');
async function isVault(dir){
 try{const info=await fs.lstat(path.join(dir,'.obsidian'));if(info.isSymbolicLink()||!info.isDirectory())throw Error('Obsidian 配置目录无效');return true;}
 catch(error){if(error.code==='ENOENT')return false;throw error;}
}
async function validateVaultFolder(selected){
 if(typeof selected!=='string'||!path.isAbsolute(selected))throw Error('请选择 Obsidian 库中的 Fomo 专用文件夹');
 const folder=await fs.realpath(selected),info=await fs.stat(folder);if(!info.isDirectory())throw Error('请选择已有的专用文件夹');
 if(await isVault(folder))throw Error('不能选择整个 Obsidian 库，请选择其中的 Fomo 专用文件夹');
 let cursor=path.dirname(folder);
 while(true){
  if(await isVault(cursor)){
   const relative=path.relative(cursor,folder),segments=relative.split(path.sep);
   if(!relative||path.isAbsolute(relative)||segments.some(segment=>!segment||segment==='..'||segment.startsWith('.')))throw Error('不能选择隐藏配置或回收站文件夹');
   return {folder,vault:cursor,relative:segments.join('/')};
  }
  const parent=path.dirname(cursor);if(parent===cursor)break;cursor=parent;
 }
 throw Error('该文件夹不在已识别的 Obsidian 库中');
}
module.exports={validateVaultFolder};
