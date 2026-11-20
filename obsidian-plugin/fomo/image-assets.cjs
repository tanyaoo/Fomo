'use strict';
const {createHash}=require('node:crypto');
const MAX_IMAGE_BYTES=32*1024*1024;
const formats={png:{ext:'png',test:b=>b.length>=8&&b.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10]))},jpeg:{ext:'jpg',test:b=>b.length>=3&&b[0]===255&&b[1]===216&&b[2]===255},gif:{ext:'gif',test:b=>b.length>=6&&['GIF87a','GIF89a'].includes(b.toString('ascii',0,6))},webp:{ext:'webp',test:b=>b.length>=12&&b.toString('ascii',0,4)==='RIFF'&&b.toString('ascii',8,12)==='WEBP'}};
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
function imageDescriptor(data){
 if(typeof data!=='string')throw Error('图片数据无效');const match=/^data:image\/(png|jpeg|gif|webp);base64,([A-Za-z0-9+/]+={0,2})$/.exec(data);if(!match||match[2].length>Math.ceil(MAX_IMAGE_BYTES/3)*4)throw Error('图片格式无效或超过大小限制');
 const bytes=Buffer.from(match[2],'base64'),format=formats[match[1]];if(!bytes.length||bytes.length>MAX_IMAGE_BYTES||bytes.toString('base64')!==match[2]||!format.test(bytes))throw Error('图片内容与格式不匹配');
 const sha256=hash(bytes);return {path:'Fomo-assets/'+sha256+'.'+format.ext,mime:'image/'+match[1],size:bytes.length,sha256};
}
function validateImageDescriptor(descriptor){
 if(!descriptor||typeof descriptor!=='object'||Array.isArray(descriptor)||Object.keys(descriptor).sort().join(',')!=='mime,path,sha256,size'||typeof descriptor.mime!=='string'||!/^image\/(png|jpeg|gif|webp)$/.test(descriptor.mime))throw Error('图片记录无效');
 const format=formats[descriptor.mime.slice(6)];if(!Number.isSafeInteger(descriptor.size)||descriptor.size<=0||descriptor.size>MAX_IMAGE_BYTES||!/^[a-f0-9]{64}$/.test(descriptor.sha256||'')||descriptor.path!=='Fomo-assets/'+descriptor.sha256+'.'+format.ext)throw Error('图片记录无效');return {path:descriptor.path,mime:descriptor.mime,size:descriptor.size,sha256:descriptor.sha256};
}
function validateImageDescriptors(descriptors){if(!Array.isArray(descriptors)||descriptors.length>1000)throw Error('图片记录无效');return descriptors.map(validateImageDescriptor);}
function recoverImage(descriptor,bytes){
 validateImageDescriptor(descriptor);if(!Buffer.isBuffer(bytes))throw Error('图片记录无效');const type=descriptor.mime.slice(6),format=formats[type];
 if(descriptor.size!==bytes.length||!format.test(bytes)||hash(bytes)!==descriptor.sha256)throw Error('图片内容或路径已变化');
 return 'data:'+descriptor.mime+';base64,'+bytes.toString('base64');
}
module.exports={imageDescriptor,validateImageDescriptor,validateImageDescriptors,recoverImage};
