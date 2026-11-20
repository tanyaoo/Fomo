'use strict';
const yaml=require('js-yaml');
const OWNED=new Set(['fomo_id','fomo_created','fomo_starred','fomo_images','fomo_references','fomo_related_to','fomo_annotation_of','fomo_source','fomo_source_slug']);

// Preserve every non-Fomo line verbatim. The YAML parser rejects duplicate or
// malformed keys; Fomo fields must also have our unambiguous single-line form.
function parseDocument(text){
 if(typeof text!=='string')throw Error('笔记内容无效');
 const empty=/^---(\r?\n)---(?:\r?\n|$)/.exec(text);if(empty){if((empty[1]==='\r\n'&&/(?<!\r)\n/.test(empty[0]))||(empty[1]==='\n'&&/\r/.test(empty[0])))throw Error('YAML 属性换行格式不一致');return {hasFrontmatter:true,newline:empty[1],userLines:[],fields:{},body:text.slice(empty[0].length)};}
 const match=/^---(\r?\n)([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text);
 if(!match){if(/^(?:\uFEFF)?---(?:\r?\n|$)/.test(text))throw Error('YAML 属性不完整');return {hasFrontmatter:false,newline:'\n',userLines:[],fields:{},body:text};}
 const newline=match[1],header=match[2],lines=header.split(/\r?\n/),parsed=yaml.load(header,{schema:yaml.JSON_SCHEMA});
 if((newline==='\r\n'&&/(?<!\r)\n|\r(?!\n)/.test(match[0]))||(newline==='\n'&&/\r/.test(match[0])))throw Error('YAML 属性换行格式不一致');
 if(parsed!==undefined&&parsed!==null&&(typeof parsed!=='object'||Array.isArray(parsed)))throw Error('YAML 属性必须是映射');
 const data=parsed||{},fields={},userLines=[];
 if(Object.hasOwn(data,'<<'))throw Error('YAML 合并键需要人工处理');
 for(const line of lines){const owned=/^(fomo_[a-z_]+):[ \t]*(.*)$/.exec(line);if(!owned){userLines.push(line);continue;}if(!OWNED.has(owned[1])||Object.hasOwn(fields,owned[1]))throw Error('Fomo 属性无效或重复');try{fields[owned[1]]=JSON.parse(owned[2]);}catch{throw Error('Fomo 属性必须使用标准格式');}}
 for(const key of Object.keys(data))if(key.startsWith('fomo_')&&(!OWNED.has(key)||!Object.hasOwn(fields,key)||JSON.stringify(fields[key])!==JSON.stringify(data[key])))throw Error('Fomo 属性格式不明确');
 for(const key of Object.keys(fields))if(!Object.hasOwn(data,key))throw Error('Fomo 属性格式不明确');
 const first=lines.find(line=>line.trim()&&!line.trimStart().startsWith('#'));if(first&&/^[ \t]*[\[{]/.test(first))throw Error('YAML 流式映射需要人工处理');
 return {hasFrontmatter:true,newline,userLines,fields,body:text.slice(match[0].length)};
}
function writeDocument(document,fields,body=document.body){
 if(!document||!Array.isArray(document.userLines)||typeof body!=='string'||!fields||typeof fields!=='object'||Array.isArray(fields))throw Error('笔记内容无效');
 const newline=document.newline==='\r\n'?'\r\n':'\n',owned=[];for(const [key,value] of Object.entries(fields)){if(!OWNED.has(key)||value===undefined)throw Error('Fomo 属性无效');owned.push(key+': '+JSON.stringify(value));}
 const extra=document.hasFrontmatter?document.userLines:[],header=[...owned,...extra].join(newline),result='---'+newline+header+newline+'---'+newline+body;parseDocument(result);return result;
}
module.exports={parseDocument,writeDocument};
