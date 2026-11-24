'use strict';
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const { writeBuildIdentity }=require('./scripts/build-identity.cjs');
writeBuildIdentity({cwd:root});
// Reject corrupted source bytes instead of silently shipping replacement characters.
for(const file of fs.readdirSync(path.join(root,'dist'))){
 if(/\.(css|js|html)$/.test(file))new TextDecoder('utf-8',{fatal:true}).decode(fs.readFileSync(path.join(root,'dist',file)));
}
// Reference styles are inlined after the shared desktop shell.
require('./scripts/build-icons.cjs');
require('./scripts/build-editor.cjs');
let html=fs.readFileSync(path.join(root,'dist/index.html'),'utf8');
html=html.replace('<link rel="stylesheet" href="style.css">',()=>'<style>'+fs.readFileSync(path.join(root,'dist/style.css'),'utf8')+'</style>');
html=html.replace('<link rel="stylesheet" href="classic.css">',()=>'<style>'+fs.readFileSync(path.join(root,'dist/classic.css'),'utf8')+'</style>');
html=html.replace('<link rel="stylesheet" href="reference.css">',()=>'<style>'+fs.readFileSync(path.join(root,'dist/reference.css'),'utf8')+'</style>');
html=html.replace('<link rel="stylesheet" href="fidelity.css">',()=>'<style>'+fs.readFileSync(path.join(root,'dist/fidelity.css'),'utf8')+'</style>');
html=html.replace('<link rel="stylesheet" href="ui-font.css">',()=>'<style>'+fs.readFileSync(path.join(root,'dist/ui-font.css'),'utf8')+'</style>');
html=html.replace('<link rel="stylesheet" href="sidebar.css">',()=>'<style>'+fs.readFileSync(path.join(root,'dist/sidebar.css'),'utf8')+'</style>');
html=html.replace('<link rel="stylesheet" href="cards.css">',()=>'<style>'+fs.readFileSync(path.join(root,'dist/cards.css'),'utf8')+'</style>');
html=html.replace('<link rel="stylesheet" href="share.css">',()=>'<style>'+fs.readFileSync(path.join(root,'dist/share.css'),'utf8')+'</style>');
html=html.replace('<link rel="stylesheet" href="numbers-font.css">',()=>'<style>'+fs.readFileSync(path.join(root,'dist/numbers-font.css'),'utf8')+'</style>');
for(const file of ['icons.js','classic.js','core.js','markup.js','editor.js','interactions.js','store.js','tag-sidebar.js','export.js','app.js']){
 const code=fs.readFileSync(path.join(root,'dist',file),'utf8');
 new Function(code);
 html=html.replace('<script src="'+file+'"></script>',()=>'<script>'+code.replace(/<\/script/gi,'<\\/script')+'</script>');
}
const target=process.argv[2]?path.resolve(process.argv[2]):path.resolve(root,'fomo.html');
fs.writeFileSync(target,html);
console.log('Built '+target);
