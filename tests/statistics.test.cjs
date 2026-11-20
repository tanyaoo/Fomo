const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../dist/core.js');

const note = (id, created, content, extra = {}) => ({
  id,
  content,
  html: '',
  created: new Date(created).toISOString(),
  updated: new Date(created).toISOString(),
  starred: false,
  deleted: false,
  images: [],
  ...extra,
});

test('month statistics use local calendar boundaries and visible HTML text', () => {
  const state = C.validate({memos: [
    note('a', new Date(2026, 9, 1, 8, 30), 'ignored', {html: '<p>甲乙</p>', images: []}),
    note('b', new Date(2026, 9, 1, 18, 30), '三个字'),
    note('c', new Date(2026, 9, 5, 9, 0), '甲'),
    note('deleted', new Date(2026, 9, 5, 10, 0), '不计入', {deleted: true}),
    note('previous', new Date(2026, 8, 30, 23, 59), '上月'),
  ]});
  const month = C.statsForMonth(state, '2026-10');
  assert.equal(month.count, 3);
  assert.equal(month.wordCount, 6);
  assert.equal(month.recordDays, 2);
  assert.equal(month.maxDay, 2);
  assert.equal(month.maxWordDay, 5);
  assert.deepEqual(month.days.filter(day => day.count).map(day => [day.day, day.count, day.wordCount]), [[1, 2, 5], [5, 1, 1]]);
});

test('year statistics aggregate all months and aggregate parent tags', () => {
  const state = C.validate({memos: [
    note('jan', new Date(2026, 0, 2, 10, 0), '#读书/笔记 内容'),
    note('oct', new Date(2026, 9, 2, 10, 0), '#读书/笔记 再一条'),
    note('other', new Date(2025, 11, 31, 23, 0), '#工作'),
  ]});
  const year = C.statsForYear(state, 2026);
  assert.equal(year.count, 2);
  assert.equal(year.recordDays, 2);
  assert.equal(year.months[0].month, 1);
  assert.equal(year.months[9].month, 10);
  const all = C.allStatistics(state);
  assert.equal(all.tags.find(row => row.name === '读书').count, 2);
  assert.equal(all.tags.find(row => row.name === '读书/笔记').count, 2);
});

test('recent-year calendar is dense, local-date based and spans exactly one year inclusively', () => {
  const state = C.validate({memos: [
    note('today', new Date(2026, 9, 31, 0, 1), 'a'),
    note('same-day', new Date(2026, 9, 31, 23, 58), 'b'),
    note('old', new Date(2025, 9, 31, 12, 0), 'c'),
  ]});
  const rows = C.statsCalendar(state, new Date(2026, 9, 31, 12, 0));
  assert.equal(rows.length, 366);
  assert.equal(rows.at(-1).key, '2026-10-31');
  assert.equal(rows.at(-1).count, 2);
  assert.equal(rows[0].key, '2025-10-31');
  assert.equal(rows.find(row => row.key === '2025-10-31').count, 1);
});

test('heatmap levels follow the six official count thresholds', () => {
  assert.deepEqual([0, 1, 2, 3, 5, 6, 10, 11, 20, 21].map(C.statsHeatLevel), [0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
});

test('media distribution uses one primary type and platform/source values stay local', () => {
  const state = C.validate({memos: [
    note('img', new Date(2026, 9, 1, 8, 0), '图片 https://example.com #读书/摘录', {images: ['data:image/png;base64,AAAA']}),
    note('audio', new Date(2026, 9, 1, 12, 0), '语音 #读书', {audio: 'data:audio/webm;base64,AAAA'}),
    note('link', new Date(2026, 9, 2, 3, 0), '链接 https://example.com', {source: 'import'}),
    note('plain', new Date(2026, 9, 3, 4, 0), '纯文本', {source: 'reflection'}),
    note('video', new Date(2026, 9, 4, 5, 0), '视频', {video: 'data:video/mp4;base64,AAAA'}),
  ]});
  const all = C.allStatistics(state);
  assert.deepEqual(Object.fromEntries(all.mediaDistribution.map(row => [row.name, row.count])), {
    图片: 2, 音频: 1, 链接: 1, 文本: 1,
  });
  assert.deepEqual(Object.fromEntries(all.platformDistribution.map(row => [row.name, row.count])), {
    客户端: 4, 导入: 1,
  });
  assert.equal(all.timeDistribution.find(row => row.weekday === 4 && row.hour === 8).count, 1);
});

test('word buckets include boundaries without counting deleted notes', () => {
  const state = C.validate({memos: [
    note('w50', new Date(2026, 9, 1), 'a'.repeat(50)),
    note('w51', new Date(2026, 9, 2), 'b'.repeat(51)),
    note('w1000', new Date(2026, 9, 3), 'c'.repeat(1000)),
    note('w1001', new Date(2026, 9, 4), 'd'.repeat(1001)),
    note('gone', new Date(2026, 9, 5), 'e'.repeat(999), {deleted: true}),
  ]});
  const buckets = Object.fromEntries(C.allStatistics(state).wordDistribution.map(row => [row.label, row.count]));
  assert.equal(buckets['0–50'], 1);
  assert.equal(buckets['51–100'], 1);
  assert.equal(buckets['501–1000'], 1);
  assert.equal(buckets['1000+'], 1);
  assert.equal(C.allStatistics(state).count, 4);
});
