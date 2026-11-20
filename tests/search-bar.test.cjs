"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const root = path.join(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(root, file), "utf8");

test("query bar exposes reference search modes without implying a cloud backend", () => {
  const app = read("dist/app.js");
  assert.match(app, /searchModes\.setAttribute\('role','tablist'\)/);
  assert.match(app, />搜索<\/button><button[^>]+id="aiSearch"[^>]+>AI 搜索<\/button>/);
  assert.match(app, /const setSearchMode=.*classList\.toggle\('active'/);
  assert.doesNotMatch(app, /if\(e\.key==='Tab'\)\{e\.preventDefault\(\);setSearchMode/);
  assert.match(app, /id="aiSearch"[^>]+aria-disabled="true"/);
  assert.match(app, /if\(searchMode==='ai'\)\{toast\('AI 搜索需要联网服务/);
  assert.match(app, /searchInput\.addEventListener\('focus',\(\)=>\{searchInput\.dataset\.idlePlaceholder=.*searchInput\.placeholder=''/);
  assert.match(app, /searchModes\.addEventListener\('mousedown'.*preventDefault/);
  assert.match(app, /searchTabHint\.textContent='AI 搜索暂未接入'/);
  assert.match(app, /\$\('#searchFilter'\)\.addEventListener\('mousedown',event=>event\.preventDefault\(\)\)/);
});

test("query bar geometry follows the native 5.26 controls", () => {
  const css = read("dist/cards.css");
  assert.match(css, /search-wrap\{width:280px[^}]*height:36px[^}]*border-radius:12px[^}]*background:#ebebeb/);
  assert.match(css, /search-modes\{display:none;flex:0 0 108px;width:108px;height:24px[^}]*padding:2px/);
  assert.match(css, /search-modes button\{[^}]*flex:0 0 52px;width:52px[^}]*height:20px[^}]*padding:4px 6px[^}]*font-size:12px/);
  assert.match(css, /#searchFilter\{display:grid[^}]*width:24px;height:24px[^}]*padding:4px[^}]*color:#949494/);
  assert.match(css, /search-wrap:is\(:focus-within,\.is-searching\) #searchFilter\{display:none\}/);
  assert.match(css, /search-tab-hint\{display:none[^}]*max-width:120px[^}]*color:#949494[^}]*font-size:14px[^}]*line-height:16px/);
  assert.match(css, /search-wrap:focus-within:not\(\.has-value\):not\(\.is-searching\) \.search-tab-hint\{display:block\}/);
});

test("advanced search panel follows the 320px native popover metrics", () => {
  const app = read("dist/app.js");
  const css = read("dist/cards.css");
  assert.match(app, /Math\.min\(320,innerWidth-24\)/);
  assert.match(css, /\.filter-popover\{[^}]*width:320px[^}]*padding:18px 16px 16px[^}]*border-radius:12px/);
  assert.match(css, /\.filter-chip\{[^}]*min-height:34px[^}]*border-radius:8px[^}]*background:#ebebeb[^}]*font-size:14px/);
  assert.match(css, /\.filter-chip\.active\{[^}]*color:#30cf79/);
  assert.match(css, /\.filter-time-bottom\{display:grid;grid-template-columns:minmax\(0,1fr\) minmax\(0,2fr\)/);
  assert.match(css, /\.filter-search\{[^}]*min-width:72px[^}]*background:#30cf79/);
});

test("search results use the native count and filter chip bar", () => {
  const app = read("dist/app.js");
  const css = read("dist/fidelity.css");
  assert.match(app, /querybar-left/);
  assert.match(app, /'笔记（'\+list\.length\+'）'/);
  assert.match(app, /class="querybar-chip" data-open-filter/);
  assert.match(app, /class="querybar-chip-close"[^>]+data-remove-search-filter/);
  assert.match(app, /queryFilterButton[^>]+class="querybar-filter-btn/);
  assert.ok(app.includes("anchors=[$('#queryFilterButton'),$('#searchFilter')]"));
  assert.match(css, /\.querybar-chip \{[^}]*height:24px[^}]*padding:4px[^}]*background:rgba\(0,0,0,\.05\)[^}]*font-size:14px/);
  assert.match(css, /\.querybar-filter-btn \{[^}]*height:24px[^}]*padding:4px 8px[^}]*color:#949494/);
});
