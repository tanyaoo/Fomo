"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("composer exposes the native expand/detach corner affordance", () => {
  const html = read("dist/index.html");
  const css = read("dist/cards.css");
  assert.match(html, /id="editorExpandWrap" class="editor-expand-wrap"/);
  assert.match(html, /id="editorExpandBtn" class="editor-expand-btn"/);
  assert.match(html, /class="editor-expand-arc"[\s\S]+M9 1C12\.3 1 15 3\.7 15 7/);
  assert.match(css, /\.editor-expand-wrap\{position:absolute;top:0;right:0;width:40px;height:40px;z-index:2\}/);
  assert.match(css, /\.editor-expand-btn\{position:absolute;top:6px;right:6px[^}]*width:26px;height:26px[^}]*border-radius:8px/);
  assert.match(css, /\.editor-expand-btn :is\(\.detach-icon,\.expand-icon\)\{opacity:0/);
  assert.match(css, /\.editor-expand-btn:hover :is\(\.detach-icon,\.expand-icon\)\{opacity:1\}/);
});

test("desktop draft detachment waits for an explicit handoff acknowledgement", () => {
  const composeWindow = read("desktop/compose-window.cjs");
  const main = read("desktop/main.cjs");
  const preload = read("desktop/preload.cjs");
  const composePreload = read("desktop/compose-preload.cjs");
  const compose = read("dist/compose.js");
  assert.match(preload, /detachComposer:\s*payload\s*=>\s*ipcRenderer\.invoke\('desktop:detach-composer'/);
  assert.match(main, /handle\('desktop:detach-composer',payload=>composeWindow\.detachDraft\(payload\)\)/);
  assert.match(composeWindow, /async detachDraft\(payload\)/);
  assert.match(composeWindow, /compose:take-draft/);
  assert.match(composeWindow, /compose:draft-loaded/);
  assert.match(composeWindow, /query:\{draft:draft\.token\}/);
  assert.match(composePreload, /takeDraft:token=>ipcRenderer\.invoke\('compose:take-draft'/);
  assert.match(composePreload, /draftLoaded:token=>ipcRenderer\.invoke\('compose:draft-loaded'/);
  assert.match(compose, /draftLoaded\(detachedToken\)/);
});

test("main draft is cleared only after the new window accepts it", () => {
  const app = read("dist/app.js");
  assert.match(app, /async function detachComposerDraft\(\)/);
  assert.match(app, /if\(!result\?\.ok\)/);
  assert.match(app, /语音草稿暂不支持转到独立窗口/);
  assert.match(app, /newDraft=\{content:'',html:'',images:\[\],audio:'',references:\[\]\};restoreEditor\(newDraft\);queueDraft\(\)/);
});
