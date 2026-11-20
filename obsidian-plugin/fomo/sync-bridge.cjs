'use strict';
// Opt-in, in-memory pairing. Nothing is listening until startBridge is called.
const http=require('node:http'),crypto=require('node:crypto'),fs=require('node:fs/promises');
const MAX_BODY=6*1024*1024,MAX_ASSET_BODY=48*1024*1024;
async function startBridge({getRoot,replaceFile,registerFile,getDeletions,trashFile,putAsset,getAsset,getReviews,mergeReviews}){
 if(typeof getRoot!=='function'||typeof replaceFile!=='function')throw Error('同步桥接配置无效');
 const root=await fs.realpath(await getRoot()),secret=crypto.randomBytes(32).toString('hex');
 const server=http.createServer(async(req,res)=>{
  const respond=(status,body)=>{if(!res.headersSent)res.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});res.end(JSON.stringify(body));};
  const auth=String(req.headers.authorization||'');const supplied=Buffer.from(auth.startsWith('Bearer ')?auth.slice(7):'','utf8'),expected=Buffer.from(secret,'utf8');
  if(req.headers.origin||supplied.length!==expected.length||!crypto.timingSafeEqual(supplied,expected)){req.resume();return respond(403,{error:'无权访问同步接口'});}
  if(req.method!=='POST'||!['/v1/replace','/v1/register','/v1/check','/v1/deletions','/v1/trash','/v1/asset','/v1/asset-read','/v1/review-read','/v1/review-merge'].includes(req.url)){req.resume();return respond(404,{error:'不支持的操作'});}
  if(req.url==='/v1/asset'&&typeof putAsset!=='function'){req.resume();return respond(409,{error:'附件接口尚未启用'});}
  if(req.url==='/v1/asset-read'&&typeof getAsset!=='function'){req.resume();return respond(409,{error:'附件接口尚未启用'});}
  const limit=req.url==='/v1/asset'?MAX_ASSET_BODY:MAX_BODY;let size=0,chunks=[],tooLarge=false;for await(const chunk of req){size+=chunk.length;if(size>limit){tooLarge=true;chunks=[];}else if(!tooLarge)chunks.push(chunk);}
  if(tooLarge)return respond(413,{error:'同步内容过大'});
  try{
   const payload=JSON.parse(Buffer.concat(chunks).toString('utf8'));
   if(!payload||typeof payload.root!=='string'||(['/v1/replace','/v1/register'].includes(req.url)&&(typeof payload.path!=='string'||typeof payload.expected!=='string'||typeof payload.replacement!=='string')))throw Error('同步请求无效');
   if(req.url==='/v1/trash'&&(typeof payload.path!=='string'||typeof payload.expected!=='string'))throw Error('同步请求无效');
   if(req.url==='/v1/asset'&&typeof payload.data!=='string')throw Error('同步请求无效');
   if(req.url==='/v1/asset-read'&&(!payload.descriptor||typeof payload.descriptor!=='object'||Array.isArray(payload.descriptor)))throw Error('同步请求无效');
   if(['/v1/review-read','/v1/review-merge'].includes(req.url)&&!Array.isArray(payload.notes))throw Error('同步请求无效');
   if(req.url==='/v1/review-merge'&&(!payload.progress||typeof payload.progress!=='object'||Array.isArray(payload.progress)))throw Error('同步请求无效');
   const actualRoot=await fs.realpath(await getRoot()),requestedRoot=await fs.realpath(payload.root);
   if(actualRoot!==root||requestedRoot!==root)throw Error('同步文件夹不匹配，请重新连接');
   if(req.url==='/v1/check')return respond(200,{ok:true,capabilities:{trash:typeof trashFile==='function',deletions:typeof getDeletions==='function',reviewRead:typeof getReviews==='function',reviewMerge:typeof mergeReviews==='function'}});
   if(req.url==='/v1/replace')await replaceFile(payload.path,payload.expected,payload.replacement);
   if(req.url==='/v1/register'){if(typeof registerFile!=='function')throw Error('普通笔记登记接口不可用');await registerFile(payload.path,payload.expected,payload.replacement);}
   if(req.url==='/v1/trash'){if(typeof trashFile!=='function')throw Error('回收站接口尚未启用');await trashFile(payload.path,payload.expected);}
   if(req.url==='/v1/asset'){if(typeof putAsset!=='function')throw Error('附件接口尚未启用');const result=await putAsset(payload.data);return respond(200,{ok:true,descriptor:result.descriptor,created:result.created});}
   if(req.url==='/v1/asset-read')return respond(200,{ok:true,data:await getAsset(payload.descriptor)});
   if(req.url==='/v1/deletions'){if(typeof getDeletions!=='function')throw Error('删除记录接口不可用');return respond(200,{ok:true,receipts:await getDeletions()});}
   if(req.url==='/v1/review-read'){if(typeof getReviews!=='function')throw Error('回顾进度接口不可用');return respond(200,{ok:true,progress:await getReviews(payload.notes)});}
   if(req.url==='/v1/review-merge'){if(typeof mergeReviews!=='function')throw Error('回顾进度写入接口不可用');await mergeReviews(payload.notes,payload.progress);return respond(200,{ok:true});}
   return respond(200,{ok:true});
  }catch(error){return respond(409,{error:typeof error?.message==='string'?error.message:'同步失败'});}
 });
 server.requestTimeout=15000;server.headersTimeout=10000;
 await new Promise((resolve,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',()=>{server.removeListener('error',reject);resolve();});});
 return {port:server.address().port,secret,close:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()))};
}
module.exports={startBridge};
