const {test}=require('node:test');
const assert=require('node:assert/strict');
const {annotationDraft}=require('../dist/core.js');
test('legacy annotation text becomes an independent structured draft',()=>{
 assert.deepEqual(annotationDraft('a','旧批注'),{annotationOf:'a',reflectionOf:'',content:'旧批注',html:'',images:[],references:['a']});
});
test('annotation snapshots retain rich text, images, references and selection without aliasing',()=>{
 const original={content:'正文',html:'<p><strong>正文</strong></p>',images:['data:image/png;base64,AAAA'],references:['b','a','b','../bad'],selection:{anchor:2,head:3}};
 const result=annotationDraft('a',original);
 assert.equal(result.html,original.html);assert.deepEqual(result.images,original.images);assert.deepEqual(result.references,['a','b']);assert.deepEqual(result.selection,original.selection);
 result.images.push('other');result.selection.anchor=9;assert.equal(original.images.length,1);assert.equal(original.selection.anchor,2);
});
test('malformed annotation snapshots are rejected and invalid selections are omitted',()=>{
 assert.equal(annotationDraft('../a','text'),null);assert.equal(annotationDraft('a',{content:'x',images:['https://external/image']}),null);
 assert.equal(annotationDraft('a',{content:'x',images:[],selection:{anchor:-1,head:Infinity}}).selection,undefined);
 assert.equal(annotationDraft('constructor',Object.prototype.constructor),null);
});
