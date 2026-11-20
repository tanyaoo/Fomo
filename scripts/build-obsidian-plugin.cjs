'use strict';
const path=require('node:path');
const fs=require('node:fs');
const esbuild=require('esbuild');
const root=path.resolve(__dirname,'..'),out=path.join(root,'work','obsidian-plugin-package');
fs.mkdirSync(out,{recursive:true});
esbuild.buildSync({entryPoints:[path.join(root,'obsidian-plugin','fomo','main.js')],outfile:path.join(out,'main.js'),bundle:true,platform:'node',format:'cjs',external:['obsidian'],logLevel:'silent'});
for(const name of ['manifest.json','styles.css','LICENSE-js-yaml.txt'])fs.copyFileSync(path.join(root,'obsidian-plugin','fomo',name),path.join(out,name));
console.log('Built Obsidian plugin in '+out);
