'use strict';
const http=require('node:http');
const {imageDescriptor}=require('./obsidian-image-assets.cjs');
const {validateProgress}=require('./obsidian-review-sync.cjs');
function reviewScope(notes){if(!Array.isArray(notes)||notes.length>10000||notes.some(n=>!n||typeof n.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(n.id)||typeof n.created!=='string'||!Number.isFinite(Date.parse(n.created)))||new Set(notes.map(n=>n.id)).size!==notes.length)throw Error('回顾同步身份无效');return new Set(notes.map(n=>n.id));}
function createBridgeClient({port,secret}){
 if(!Number.isInteger(port)||port<1||port>65535||typeof secret!=='string'||!/^[a-f0-9]{64}$/.test(secret))throw Error('Obsidian 连接信息无效');
 function send(endpoint,payload){
  const body=JSON.stringify(payload),limit=endpoint==='/v1/asset'?48*1024*1024:6*1024*1024;if(Buffer.byteLength(body)>limit)throw Error('同步内容过大');
  return new Promise((resolve,reject)=>{
   const request=http.request({host:'127.0.0.1',port,path:endpoint,method:'POST',headers:{authorization:'Bearer '+secret,'content-type':'application/json','content-length':Buffer.byteLength(body)},timeout:15000},response=>{
    let data='';const responseLimit=endpoint==='/v1/asset-read'?48*1024*1024:1024*1024;response.setEncoding('utf8');response.on('data',chunk=>{data+=chunk;if(data.length>responseLimit)request.destroy(Error('同步响应过大，请重新检查双方文件'));});
    response.on('aborted',()=>reject(Error('Obsidian 连接中断，操作结果未确认，请重新检查双方文件')));
    response.on('error',()=>reject(Error('Obsidian 响应中断，操作结果未确认，请重新检查双方文件')));
    response.on('end',()=>{try{const result=JSON.parse(data);if(response.statusCode!==200||result.ok!==true)throw Error(result.error||'Obsidian 同步失败');resolve(result);}catch(error){reject(error);}});
   });request.on('timeout',()=>request.destroy(Error('Obsidian 同步超时，操作结果未确认，请重新检查双方文件')));request.on('error',error=>reject(Error('Obsidian 连接失败或中断，操作结果未确认，请重新检查双方文件：'+(error.code||error.message))));request.end(body);
  });
 }
 const replaceFile=({root,path,expected,replacement})=>send('/v1/replace',{root,path,expected,replacement});
 replaceFile.check=async root=>{const result=await send('/v1/check',{root}),caps=result.capabilities;if(caps!==undefined&&(!caps||typeof caps!=='object'||Array.isArray(caps)||typeof caps.trash!=='boolean'||typeof caps.deletions!=='boolean'||(caps.reviewRead!==undefined&&typeof caps.reviewRead!=='boolean')||(caps.reviewMerge!==undefined&&typeof caps.reviewMerge!=='boolean')))throw Error('Obsidian 插件能力响应无效');return {trash:caps?.trash===true,deletions:caps?.deletions===true,reviewRead:caps?.reviewRead===true,reviewMerge:caps?.reviewMerge===true};};
 replaceFile.register=({root,path,expected,replacement})=>send('/v1/register',{root,path,expected,replacement});
 replaceFile.trash=({root,path,expected})=>send('/v1/trash',{root,path,expected});
 replaceFile.putAsset=async({root,data})=>{const expected=imageDescriptor(data),result=await send('/v1/asset',{root,data});if(typeof result.created!=='boolean'||!result.descriptor||['path','mime','size','sha256'].some(key=>result.descriptor[key]!==expected[key]))throw Error('附件响应无效，请重新检查');return {descriptor:expected,created:result.created};};
 replaceFile.getAsset=async({root,descriptor})=>{const result=await send('/v1/asset-read',{root,descriptor});let actual;try{actual=imageDescriptor(result.data);}catch{throw Error('附件响应无效，请重新检查');}if(!descriptor||['path','mime','size','sha256'].some(key=>actual[key]!==descriptor[key]))throw Error('附件响应无效，请重新检查');return result.data;};
 replaceFile.reviews=async({root,notes})=>{const allowed=reviewScope(notes),result=await send('/v1/review-read',{root,notes});validateProgress(result.progress);if(Object.values(result.progress).some(ids=>ids.some(id=>!allowed.has(id))))throw Error('回顾进度超出同步范围');return result.progress;};
 replaceFile.mergeReviews=({root,notes,progress})=>{const allowed=reviewScope(notes);validateProgress(progress);if(Object.values(progress).some(ids=>ids.some(id=>!allowed.has(id))))throw Error('回顾进度超出同步范围');return send('/v1/review-merge',{root,notes,progress});};
 replaceFile.deletions=async root=>{const result=await send('/v1/deletions',{root});if(!Array.isArray(result.receipts)||result.receipts.length>1000||result.receipts.some(r=>!r||typeof r.eventId!=='string'||!/^[0-9a-f-]{36}$/.test(r.eventId)||typeof r.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(r.id)||typeof r.fileHash!=='string'||!/^[a-f0-9]{64}$/.test(r.fileHash)))throw Error('删除凭据无效');return result.receipts;};
 return replaceFile;
}
module.exports={createBridgeClient};
