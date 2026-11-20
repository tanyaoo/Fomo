"use strict";
process.env.TZ = "Asia/Shanghai";
const test = require("node:test");
const assert = require("node:assert/strict");
const Core = require("../dist/core.js");
const now = Date.parse("2026-10-29T12:00:00+08:00");
test("memo menu footer shows the clock for today", () => {
  assert.equal(Core.memoUpdatedLabel("2026-10-29T09:30:00+08:00", now), "09:30");
});
test("memo menu footer labels yesterday and recent days", () => {
  assert.equal(Core.memoUpdatedLabel("2026-10-28T20:46:00+08:00", now), "20:46");
  assert.equal(Core.memoUpdatedLabel("2026-10-28T09:00:00+08:00", now), "昨天 09:00");
  assert.equal(Core.memoUpdatedLabel("2026-10-26T09:00:00+08:00", now), "3天前 09:00");
});
test("memo menu footer falls back to month-day and full dates", () => {
  assert.equal(Core.memoUpdatedLabel("2026-05-09T20:46:00+08:00", now), "05-09 20:46");
  assert.equal(Core.memoUpdatedLabel("2025-12-13T20:46:00+08:00", now), "2025-12-13");
});
test("memo menu footer tolerates missing timestamps", () => {
  assert.equal(Core.memoUpdatedLabel("", now), "");
  assert.equal(Core.memoUpdatedLabel(undefined, now), "");
});

test("memo word count ignores rich-text markup", () => {
  assert.equal(Core.memoWordCount({ content: "==重点==", html: "<p><mark>重点</mark></p>" }), 2);
  assert.equal(Core.memoWordCount({ content: "a**b**c", html: "<p>a<strong>b</strong>c</p>" }), 3);
  assert.equal(Core.memoWordCount({ content: "纯文本", html: "" }), 3);
  assert.equal(Core.memoWordCount({ content: "", html: '<p><img src="x"></p>' }), 0);
  assert.equal(Core.memoWordCount(null), 0);
});
