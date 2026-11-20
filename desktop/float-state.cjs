'use strict';
// The float window caps at seven notes and lets a full clear be undone.
const FLOAT_LIMIT = 7;
const FLOAT_FULL_MESSAGE = '浮窗内笔记已满，最多支持 7 条笔记，整理一下再添加吧';

function addId(ids, id) {
  if (ids.includes(id)) return ids.slice();
  if (ids.length >= FLOAT_LIMIT) throw new Error(FLOAT_FULL_MESSAGE);
  return [...ids, id];
}

function clearWithUndo(ids) {
  return { ids: [], undo: ids.slice(), count: ids.length };
}

function restoreUndo(undo) {
  if (!Array.isArray(undo)) return [];
  return undo.filter((id) => typeof id === 'string' && id);
}

module.exports = { FLOAT_LIMIT, FLOAT_FULL_MESSAGE, addId, clearWithUndo, restoreUndo };
