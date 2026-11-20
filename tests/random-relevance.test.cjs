'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../dist/core.js');
const date = '2026-10-22T00:00:00.000Z';
const memo = (id, content, extra = {}) => ({ id, content, html: '', images: [], created: date, updated: date, starred: false, deleted: false, ...extra });

test('random-walk relevance favors meaning over repeated characters', () => {
  const list = [
    memo('source', '交易时情绪失控，会让我追涨并破坏止损纪律。每次急着回本时，都会频繁开仓。'),
    memo('semantic', '行情波动让我害怕亏损，必须控制频繁操作，严格执行止损，按交易计划行动，不能急着回本。'),
    memo('tagged', '复盘这套方法，把关键步骤整理成卡片。 #交易/复盘'),
    memo('unrelated', '周末去咖啡馆看书，傍晚沿江散步，天气很好。')
  ];
  const ranked = C.recommendMemos(list, 'source', { limit: 10 });
  assert.equal(ranked[0].memo.id, 'semantic');
  assert.ok(ranked[0].similarity > .12);
  assert.ok(ranked[0].reasons.includes('语义相近'));
  assert.equal(ranked.some(row => row.memo.id === 'unrelated'), false);
});

test('explicit references rank first and hierarchical tags contribute a bounded signal', () => {
  const list = [
    memo('source', '整理知识卡片。 #阅读/方法/卡片'),
    memo('direct', '完全不同的正文，但保留明确引用。', { references: ['source'] }),
    memo('tag-match', '记录另一种读书方法。 #阅读/方法/笔记'),
    memo('unrelated', '晚饭后散步。 #生活')
  ];
  const ranked = C.recommendMemos(list, 'source', { limit: 10 });
  assert.equal(ranked[0].memo.id, 'direct');
  assert.equal(ranked[0].similarity, .94);
  assert.ok(ranked[0].reasons.includes('显式引用'));
  assert.ok(ranked.some(row => row.memo.id === 'tag-match' && row.reasons.includes('相同标签')));
  assert.equal(ranked.some(row => row.memo.id === 'unrelated'), false);
});

test('recommendations exclude the source and visited nodes without a baseline score', () => {
  const list = [memo('source', '交易计划与止损纪律'), memo('seen', '止损纪律与交易计划'), memo('fresh', '根据交易计划执行止损'), memo('other', '散步和咖啡')];
  assert.equal(C.recommendMemos(list, 'source').length, 2);
  const ranked = C.recommendMemos(list, 'source', { exclude: ['seen'] });
  assert.deepEqual(ranked.map(row => row.memo.id), ['fresh']);
  assert.equal(C.recommendMemos([memo('source', '交易计划')], 'source').length, 0);
  assert.equal(C.recommendMemos([memo('source', '交易计划'), memo('other', '散步和咖啡')], 'source').length, 0);
});
