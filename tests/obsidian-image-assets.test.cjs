'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const {imageDescriptor,recoverImage}=require('../desktop/obsidian-image-assets.cjs');
test('image descriptors roundtrip exact bytes with content-addressed safe paths',()=>{
 for(const [type,bytes] of [['png',Buffer.from('89504e470d0a1a0a010203','hex')],['jpeg',Buffer.from('ffd8ff001122','hex')],['gif',Buffer.from('GIF89aEXAMPLE')],['webp',Buffer.from('RIFF0000WEBPtest')]]){const data='data:image/'+type+';base64,'+bytes.toString('base64'),item=imageDescriptor(data);assert.match(item.path,/^Fomo-assets\/[a-f0-9]{64}\.(png|jpg|gif|webp)$/);assert.equal(recoverImage(item,bytes),data);assert.deepEqual(imageDescriptor(data),item);}
});
test('image recovery refuses changed content, MIME, oversized input and path traversal',()=>{
 const bytes=Buffer.from('89504e470d0a1a0a010203','hex'),item=imageDescriptor('data:image/png;base64,'+bytes.toString('base64'));for(const bad of [{...item,path:'../private.png'},{...item,sha256:'0'.repeat(64)},{...item,mime:'image/gif'},{...item,size:item.size+1}])assert.throws(()=>recoverImage(bad,bytes));assert.throws(()=>recoverImage(item,Buffer.from('89504e470d0a1a0a010204','hex')));assert.throws(()=>imageDescriptor('data:image/png;base64,////'));assert.throws(()=>imageDescriptor('data:image/png;base64,'+'A'.repeat(45*1024*1024)));
});
