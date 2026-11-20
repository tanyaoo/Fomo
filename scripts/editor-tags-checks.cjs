'use strict';
const assert=require('node:assert/strict');
module.exports=async({evaluate,capture,until})=>{
 await evaluate(`document.querySelector('#editor').memoEditor.setHTML('<p><span style="font-size:20px">#写作</span> 写作</p>')`);
 const metrics=await evaluate(`(()=>{const e=document.querySelector('#editor'),tag=e.querySelector('.editor-tag');return {tag:getComputedStyle(tag).fontSize,body:getComputedStyle(e).fontSize}})()`);assert.equal(metrics.tag,'13px');assert.equal(metrics.body,'14px');
 await evaluate(`document.querySelector('#editor').memoEditor.setHTML('<p>正文 #写作/<strong>习惯</strong> 继续 https://example.com/#片段<br>#阅读</p>')`);
 assert.equal(await evaluate(`Array.from(document.querySelectorAll('#editor .editor-tag'),node=>node.textContent).join('')`),'#写作/习惯#阅读');assert.equal(await evaluate('document.querySelector("#editor strong").textContent'),'习惯');assert.equal(await evaluate('document.querySelector("#editor").memoEditor.getHTML().includes("editor-tag")'),false);
 await evaluate(`(()=>{const e=document.querySelector('#editor');e.memoEditor.setText('');e.focus();e.memoEditor.insertText('#写作/习惯');})()`);await until('document.querySelector("#editor").value === "#写作/习惯"');await capture('editor-tag-color');
 await until('document.querySelector("#draftStatus").dataset.state === "saved"');assert.ok(await evaluate('document.querySelector("#draftStatus").textContent===""&&document.querySelector("#noteStatus").textContent===""&&document.querySelector("#saveStatusRow").hidden'));assert.equal(await evaluate(`JSON.parse(sessionStorage.getItem('fomo-draft-v2')).current.html.includes('editor-tag')`),false);
 await evaluate('document.querySelector("#editor").memoEditor.command("undo")');await until('document.querySelector("#editor").value === ""');assert.equal(await evaluate('document.querySelectorAll("#editor .editor-tag").length'),0);
 console.log('PASS: structured tag decorations, rich-node boundaries, URL fragments, inherited tag size, clean draft HTML and transaction undo');
};
