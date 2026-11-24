"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const cardCss = fs.readFileSync(path.join(__dirname, "..", "dist/cards.css"), "utf8");
const fidelityCss = fs.readFileSync(path.join(__dirname, "..", "dist/fidelity.css"), "utf8");
const appJs = fs.readFileSync(path.join(__dirname, "..", "dist/app.js"), "utf8");
test("reading tags follow the approved compact pill metrics", () => {
  assert.match(cardCss, /#memos>\.memo \.memo-content \.tag-link \{[^}]*font-size:12px;line-height:inherit;font-weight:400;[^}]*padding:2px 4px;[^}]*border-radius:8px/);
  assert.match(cardCss, /:is\(\.memo-content,\.relation-body\) \.tag-link \{[^}]*font-size:calc\(var\(--memo-font-size, 14px\) - 1px\);line-height:inherit;padding:2px 4px;border-radius:8px/);
  assert.doesNotMatch(cardCss, /\.tag-link[^{]*\{[^}]*border-radius:6px/);
});

test("editor hashtags use the current reading palette and compact size", () => {
  assert.match(cardCss, /\.editor-tag\{font-size:calc\(var\(--memo-font-size, 14px\) - 1px\)!important;background:var\(--reading-tag-bg\);color:var\(--reading-tag\);padding:2px 4px/);
});

test("memo timestamps use the reference meta colour and size", () => {
  assert.match(cardCss, /\.memo-time \{[^}]*color:var\(--reading-meta\)[^}]*font-size:12px;font-weight:400;font-variant-numeric:tabular-nums;line-height:20px\}/);
  assert.match(cardCss, /--reading-meta:#949494/);
  assert.match(cardCss, /--reading-meta:hsla\(0,0%,100%,\.52\)/);
});

test("memo card menu uses a 16px ellipsis glyph in a 24px hit area", () => {
  assert.match(cardCss, /#memos>\.memo \.memo-menu-button \{[^}]*width:24px;height:24px/);
  assert.match(cardCss, /#memos>\.memo \.memo-menu-button svg \{width:16px;height:16px\}/);
  assert.match(appJs, /更多操作">\$\{icon\('ellipsis'\)\}<\/button>/);
});

test("dark reading tags use the approved green palette", () => {
  assert.match(cardCss, /--reading-tag:#a5d6af;--reading-tag-bg:#293e30/);
});
