"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
const order = ["bold", "underline", "highlight", "list", "number", "tag", "image"];
const buttons = (html, id) => {
  const start = html.indexOf('id="' + id + '"');
  assert.ok(start > 0, id + " exists");
  const end = html.indexOf("</div>", start);
  const block = html.slice(start, end);
  return [...block.matchAll(/data-(format|action)="([a-z]+)"/g)].map((m) => m[2]);
};
test("main editor bubble keeps the reference tool order", () => {
  assert.deepEqual(buttons(read("dist/index.html"), "selectionToolbar"), order);
});
test("quick format popover omits the duplicated quote action", () => {
  assert.deepEqual(buttons(read("dist/index.html"), "formatPopover"), ["bold", "underline", "highlight"]);
});
test("tray quick format popover omits the duplicated quote action", () => {
  assert.deepEqual(buttons(read("dist/compose.html"), "composeFormatPopover"), ["bold", "underline", "highlight"]);
});
test("tray composer bubble keeps the same tools", () => {
  assert.deepEqual(buttons(read("dist/compose.html"), "composeSelectionToolbar"), order);
});
test("bubble tool geometry follows the reference popover metrics", () => {
  const css = read("dist/fidelity.css");
  assert.match(css, /\.fomo-shell \.selection-toolbar \{gap:0;padding:5px 0/);
  assert.match(css, /\.selection-toolbar button \{width:26px;min-width:26px;height:28px/);
  assert.match(css, /\.selection-toolbar button svg \{width:16px;height:16px;padding:5px/);
});
test("stroke glyphs in the bubble are not painted as filled blocks", () => {
  const css = read("dist/cards.css");
  assert.match(css, /#selectionToolbar :is\(\[data-format="list"\],\[data-format="number"\],\[data-action="tag"\],\[data-action="image"\]\) svg\{fill:none!important;stroke:currentColor/);
  assert.match(read("dist/compose.html"), /#composeSelectionToolbar\.selection-toolbar :is\(\[data-format="list"\]/);
});
