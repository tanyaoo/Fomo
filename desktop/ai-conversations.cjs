'use strict';
const path=require('node:path');
const {atomicWrite}=require('./file-store.cjs');

const MAX_BYTES=5*1024*1024;
function validate(value){
  if(!value||value.version!==1||!Array.isArray(value.sessions)||value.sessions.length>100)throw Error('AI 对话记录格式无效，原文件已保留');
  const ids=new Set();
  for(const session of value.sessions){
    if(!session||typeof session.id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(session.id)||ids.has(session.id)||typeof session.title!=='string'||session.title.length>120||!Number.isFinite(Date.parse(session.updated))||!Array.isArray(session.messages)||session.messages.length>500)throw Error('AI 对话记录格式无效，原文件已保留');
    ids.add(session.id);
    for(const message of session.messages){
      if(!message||!['user','assistant'].includes(message.role)||typeof message.content!=='string'||message.content.length>60000)throw Error('AI 对话消息格式无效，原文件已保留');
      if(message.searches!==undefined){if(message.role!=='assistant'||!Array.isArray(message.searches)||message.searches.length>6)throw Error('AI 搜索记录格式无效，原文件已保留');for(const search of message.searches){if(!search||typeof search.query!=='string'||search.query.length>200||!Array.isArray(search.notes)||search.notes.length>5)throw Error('AI 搜索记录格式无效，原文件已保留');for(const note of search.notes)if(!note||typeof note.id!=='string'||note.id.length>200||typeof note.created!=='string'||note.created.length>100||typeof note.content!=='string'||note.content.length>120)throw Error('AI 搜索记录格式无效，原文件已保留');}}
    }
  }
  const data=JSON.stringify(value);if(Buffer.byteLength(data)>MAX_BYTES)throw Error('AI 对话记录超过大小限制');return value;
}
function installConversationStore(FileStore){
  FileStore.prototype.readAiConversations=function(){return this.serialize(async()=>{const value=await this.readJSON(path.join(this.directory,'ai-conversations.json'));return value===undefined?{version:1,sessions:[]}:validate(value);});};
  FileStore.prototype.saveAiConversations=function(value){return this.serialize(async()=>{validate(value);const file=path.join(this.directory,'ai-conversations.json');const existing=await this.readJSON(file);if(existing!==undefined){validate(existing);await atomicWrite(path.join(this.directory,'ai-conversations.previous.json'),JSON.stringify(existing),this.io);}await atomicWrite(file,JSON.stringify(value),this.io);await this.backups.automatic();return true;});};
}
module.exports={validate,installConversationStore};
