'use strict';
require('./build-font.cjs');
const path=require('node:path');
const fs=require('node:fs'),root=path.resolve(__dirname,'..');
const result=require('esbuild').buildSync({entryPoints:[path.join(root,'src/editor.js')],outfile:path.join(root,'dist/editor.js'),bundle:true,format:'iife',platform:'browser',target:'chrome120',minify:true,metafile:true,legalComments:'inline',banner:{js:'/* WriteBoom structured editor. ProseMirror and dependencies: MIT; see THIRD-PARTY-NOTICES.md. */'}});
require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../src/workspace-ui.js')],outfile:path.join(__dirname,'../dist/interactions.js'),bundle:true,format:'iife',platform:'browser',target:'chrome120',minify:false});
require('esbuild').buildSync({entryPoints:[path.join(__dirname,'../src/note-viewer.js')],outfile:path.join(__dirname,'../dist/note.js'),bundle:true,format:'iife',platform:'browser',target:'chrome120',minify:false});
const packages=new Set();
const yamlResult=require('esbuild').buildSync({entryPoints:[path.join(root,'src/obsidian-frontmatter.cjs')],outfile:path.join(root,'desktop/obsidian-frontmatter.cjs'),bundle:true,platform:'node',format:'cjs',target:'node18',minify:true,metafile:true,legalComments:'inline'});
fs.copyFileSync(path.join(root,'desktop/obsidian-frontmatter.cjs'),path.join(root,'obsidian-plugin/fomo/frontmatter.cjs'));
fs.copyFileSync(path.join(path.dirname(require.resolve('js-yaml/package.json')),'LICENSE'),path.join(root,'obsidian-plugin/fomo/LICENSE-js-yaml.txt'));
fs.copyFileSync(path.join(root,'desktop/obsidian-image-assets.cjs'),path.join(root,'obsidian-plugin/fomo/image-assets.cjs'));
const updaterResult=require('esbuild').buildSync({entryPoints:[path.join(root,'node_modules/electron-updater/out/main.js')],outfile:path.join(root,'desktop/updater-runtime.cjs'),bundle:true,platform:'node',format:'cjs',target:'node24',external:['electron','original-fs'],minify:true,metafile:true,legalComments:'inline'});
Object.assign(result.metafile.inputs,updaterResult.metafile.inputs);
Object.assign(result.metafile.inputs,yamlResult.metafile.inputs);
for(const input of Object.keys(result.metafile.inputs)){
  if(!input.includes('node_modules/'))continue;
  let directory=path.dirname(path.resolve(input));
  while(directory!==path.dirname(directory)&&!fs.existsSync(path.join(directory,'package.json')))directory=path.dirname(directory);
  packages.add(directory);
}
const notice=path.join(root,'THIRD-PARTY-NOTICES.md'),marker='\n<!-- STRUCTURED EDITOR DEPENDENCIES -->';
let text=fs.readFileSync(notice,'utf8').split(marker)[0]+marker+'\n';
for(const directory of [...packages].sort()){
  const info=JSON.parse(fs.readFileSync(path.join(directory,'package.json'),'utf8'));
  const license=['LICENSE','LICENSE.md','LICENSE.txt','license'].map(name=>path.join(directory,name)).find(file=>fs.existsSync(file));
  if(!license&&info.name!=='lazy-val')throw Error('缺少依赖许可：'+info.name);
  text+='\n## '+info.name+' '+info.version+'\n\n'+(license?fs.readFileSync(license,'utf8').trim():'Package metadata declares MIT; author: Vladimir Krivosheev. The published package omits a LICENSE file. Source: https://github.com/develar/lazy-val.\n\n'+fs.readFileSync(path.join(root,'node_modules/electron-updater/LICENSE'),'utf8').trim())+'\n';
}
fs.writeFileSync(notice,text);
