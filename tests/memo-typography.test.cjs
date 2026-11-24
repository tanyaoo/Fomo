"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const referenceCss = fs.readFileSync(path.join(__dirname, "..", "dist/reference.css"), "utf8");
const fidelityCss = fs.readFileSync(path.join(__dirname, "..", "dist/fidelity.css"), "utf8");
const cardsCss = fs.readFileSync(path.join(__dirname, "..", "dist/cards.css"), "utf8");
const composeHtml = fs.readFileSync(path.join(__dirname, "..", "dist/compose.html"), "utf8");
const noteHtml = fs.readFileSync(path.join(__dirname, "..", "dist/note.html"), "utf8");

test("memo body text matches the reference tracking", () => {
  assert.match(referenceCss, /\.fomo-shell \.memo-content \{font-size:14px;line-height:1\.8;letter-spacing:\.1px\}/);
});

test("memo body uses the configured HarmonyOS font stack", () => {
  assert.match(fidelityCss, /--fl-font-memo:"Fomo HarmonyOS Sans","Noto Sans SC","Microsoft YaHei",sans-serif/);
  assert.match(fidelityCss, /HarmonyOS_Sans_SC_Regular\.ttf/);
  assert.match(cardsCss, /#memos>\.memo \.memo-content \{font-family:var\(--memo-font-family,var\(--fl-font-memo\)\)/);
  assert.match(fidelityCss, /font-family:var\(--memo-font-family,var\(--fl-font-memo\)\);font-size:var\(--memo-font-size,14px\);line-height:var\(--memo-line-height,1\.8\)/);
});

test("memo paragraphs keep the reference height, spacing and card inset", () => {
  assert.match(cardsCss, /\.fomo-shell :is\(\.memo-content,\.relation-body,#editor\.structured-editor\) p \{min-height:1em\}/);
  assert.match(cardsCss, /\.memo-content p \{margin:0 0 \.5em;min-height:1em;line-height:inherit;text-wrap:pretty\}/);
  assert.match(cardsCss, /\.memo:not\(\.inline-edit-card\) \{padding:15px;border:0;border-radius:12px/);
  assert.doesNotMatch(cardsCss, /p:has\(>br:only-child\)/);
  assert.doesNotMatch(cardsCss, /:is\(p,ul,ol\):last-child \{margin-bottom:0\}/);
});

test("native editor windows share the configured system memo font", () => {
  assert.match(composeHtml, /href="ui-font\.css"/);
  assert.match(noteHtml, /href="ui-font\.css"/);
  assert.match(composeHtml, /var\(--memo-font-family,var\(--fl-font-memo\)\)/);
  assert.match(noteHtml, /var\(--memo-font-family,var\(--fl-font-memo\)\)/);
  assert.match(composeHtml, /#composeEditor p\{min-height:25px\}/);
});
