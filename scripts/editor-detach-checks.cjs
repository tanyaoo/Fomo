'use strict';
const assert = require('node:assert/strict');

module.exports = async ({ app, window, getStore, userDirectory }) => {
  const { BrowserWindow } = require('electron');
  const evaluate = code => window.webContents.executeJavaScript(code);
  async function until(code, timeout = 10000) {
    const deadline = Date.now() + timeout;
    while (Date.now() < deadline) {
      if (await evaluate(code)) return;
      await new Promise(resolve => setTimeout(resolve, 60));
    }
    throw Error('Editor detach timed out: ' + code);
  }

  await until('document.querySelector("#viewTitle")?.textContent === "全部笔记"');
  const enterFormatting = await evaluate(`(() => {
    const editor=document.querySelector('#editor');editor.memoEditor.setText('');editor.memoEditor.focus();
    editor.memoEditor.command('bold');editor.memoEditor.command('underline');editor.memoEditor.insertText('粗体段落');
    editor.dispatchEvent(new KeyboardEvent('keydown',{key:'Enter',bubbles:true,cancelable:true}));
    editor.memoEditor.insertText('普通段落');
    return editor.memoEditor.getHTML();
  })()`);
  assert.match(enterFormatting, /<strong><u>粗体段落<\/u><\/strong>|<u><strong>粗体段落<\/strong><\/u>/);
  assert.match(enterFormatting, /<p>普通段落<\/p>$/);
  const pasteLimit = await evaluate(`(() => {
    const editor=document.querySelector('#editor');editor.memoEditor.setText('长'.repeat(29996));editor.memoEditor.focusEnd();
    const data=new DataTransfer();data.setData('text/plain','一二三四五');
    editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
    return {length:editor.value.length,toast:document.querySelector('#toast').textContent};
  })()`);
  assert.equal(pasteLimit.length, 29996, 'pasting beyond the 30000-character note limit must keep the existing text');
  assert.match(pasteLimit.toast, /30000/);
  const wordPaste = await evaluate(`(() => {
    const editor=document.querySelector('#editor');editor.memoEditor.setText('');editor.memoEditor.focusEnd();
    const data=new DataTransfer();data.setData('text/plain','粗体\\n第二行');
    data.setData('text/html','<meta name="Generator" content="Microsoft Word 16; urn:schemas-microsoft-com:office:word"><p><strong>粗体</strong></p><p><em>第二行</em></p>');
    editor.dispatchEvent(new ClipboardEvent('paste',{clipboardData:data,bubbles:true,cancelable:true}));
    return editor.memoEditor.getHTML();
  })()`);
  assert.equal(wordPaste, '<p>粗体<br>第二行</p>', 'Word clipboard text must drop formatting while keeping line breaks in one paragraph');
  const copied = await evaluate(`(() => {
    const editor=document.querySelector('#editor');
    editor.memoEditor.setHTML('<p><strong>粗体</strong> <u>下划线</u> <mark>高亮</mark></p><ul><li><p>甲</p><ul><li><p>乙</p></li></ul></li></ul><ol start="3"><li><p>丙</p></li><li><p>丁</p></li></ol><p>https://v.legacy.invalid/mine/?memo_id=copy-fixture #写作</p>');
    editor.memoEditor.selectAll();
    const data=new DataTransfer(),event=new ClipboardEvent('copy',{clipboardData:data,bubbles:true,cancelable:true});
    editor.dispatchEvent(event);
    const beforeUndo=editor.memoEditor.getHTML(),undoChanged=editor.memoEditor.command('undo');
    return {html:data.getData('text/html'),plain:data.getData('text/plain'),prevented:event.defaultPrevented,undoChanged,sameAfterUndo:beforeUndo===editor.memoEditor.getHTML()};
  })()`);
  assert.equal(copied.prevented, true, 'rich editor copy must own the clipboard payload');
  assert.equal(copied.undoChanged, false, 'copy must not create an undo step');
  assert.equal(copied.sameAfterUndo, true, 'undo after copy must leave the document unchanged');
  assert.match(copied.html, /<li>甲<ul><li>乙<\/li><\/ul><\/li>/);
  assert.doesNotMatch(copied.html, /<li><p>|class=|contenteditable|<script/i);
  assert.match(copied.html, /<strong>粗体<\/strong>/);
  assert.match(copied.html, /<u>下划线<\/u>/);
  assert.equal(copied.plain, '粗体 下划线 高亮\n- 甲\n  - 乙\n1. 丙\n2. 丁\nhttps://v.legacy.invalid/mine/?memo_id=copy-fixture #写作');
  await evaluate(`(() => {
    const editor = document.querySelector('#editor');
    editor.memoEditor.setHTML('<p><strong>转移到新窗口</strong> #测试</p><p>第二段内容</p>');
    editor.dispatchEvent(new Event('input', { bubbles: true }));
    editor.focus();
    return true;
  })()`);
  await until('!document.querySelector("#editorExpandWrap").hidden');
  assert.equal(await evaluate('document.querySelector("#editorExpandWrap").dataset.mode'), 'detach');
  assert.equal(await evaluate('document.querySelector("#editorExpandBtn").title'), '在新窗口打开');

  await evaluate('document.querySelector("#editorExpandBtn").click()');
  let composeWindow;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    composeWindow = BrowserWindow.getAllWindows().find(candidate => candidate !== window && candidate.webContents.getURL().includes('/dist/compose.html'));
    if (composeWindow) break;
    await new Promise(resolve => setTimeout(resolve, 60));
  }
  assert.ok(composeWindow, 'detach must open a composition window');
  await composeWindow.webContents.executeJavaScript(`new Promise((resolve, reject) => {
    const deadline = Date.now() + 8000;
    const check = () => {
      const editor = document.querySelector('#composeEditor');
      if (editor?.textContent.includes('转移到新窗口') && document.querySelector('#status')?.textContent === '') resolve(true);
      else if (Date.now() > deadline) reject(Error('draft was not acknowledged in the composition window'));
      else setTimeout(check, 50);
    };
    check();
  })`);
  const transferred = await composeWindow.webContents.executeJavaScript(`({
    text: document.querySelector('#composeEditor').textContent,
    html: document.querySelector('#composeEditor').innerHTML,
    focused: document.querySelector('#composeEditor').contains(document.activeElement)
  })`);
  assert.match(transferred.text, /转移到新窗口/);
  assert.match(transferred.html, /<strong>/);
  assert.equal(transferred.focused, true, 'transferred draft should keep the caret in the composition editor');
  assert.equal(await evaluate('document.querySelector("#editor").textContent'), '', 'main draft clears only after acknowledgement');
  const draftDeadline = Date.now() + 5000;
  while ((await getStore().readDraft()).current.content && Date.now() < draftDeadline) {
    await new Promise(resolve => setTimeout(resolve, 50));
  }
  assert.equal((await getStore().readDraft()).current.content, '', 'cleared main draft should be persisted');
  const durableDraft = await getStore().readComposeDraft();
  assert.match(durableDraft.content, /转移到新窗口/, 'the receiving window must persist the transferred draft before acknowledgement');
  assert.match(durableDraft.html, /<strong>/, 'the persisted transfer retains formatting');

  await composeWindow.webContents.executeJavaScript(`document.querySelector('#composeEditor').memoEditor.setText(Array.from({length: 80}, (_, index) => '长内容 ' + (index + 1)).join('\\n'))`);
  await new Promise(resolve => setTimeout(resolve, 250));
  const longState = await composeWindow.webContents.executeJavaScript("({ textLength: document.querySelector('#composeEditor').textContent.length, sendDisabled: document.querySelector('#send').disabled, scrollable: document.querySelector('#composeEditor').scrollHeight > document.querySelector('#composeEditor').clientHeight })");
  assert.ok(longState.textLength > 300, 'long draft should remain editable');
  assert.equal(longState.sendDisabled, false);
  assert.equal(longState.scrollable, true, 'long draft should scroll inside the composition editor');
  await composeWindow.webContents.executeJavaScript(`document.querySelector('#composeEditor').focus()`);
  await new Promise(resolve => setTimeout(resolve, 150));
  assert.equal(await composeWindow.webContents.executeJavaScript('document.querySelector("#composeEditor").contains(document.activeElement)'), true);

  composeWindow.destroy();
  console.log('PASS: editor-detach — rich draft transfer, explicit acknowledgement, caret focus and isolated compose window');
  window.close();
};
