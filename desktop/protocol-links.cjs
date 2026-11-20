'use strict';

const SCHEMES = new Set(['fomo', 'writeboom', 'memo-flow']);
const VALID_ID = /^[a-zA-Z0-9-]{1,100}$/;

function parseNoteLink(value) {
  const text = String(value || '').trim().replace(/^["']|["']$/g, '');
  let url;
  try { url = new URL(text); } catch { return { matched: false, id: '' }; }
  const scheme = url.protocol.slice(0, -1).toLowerCase();
  if (!SCHEMES.has(scheme)) return { matched: false, id: '' };
  const id = !url.search && !url.hash && url.hostname.toLowerCase() === 'note' && /^\/[a-zA-Z0-9-]{1,100}\/?$/.test(url.pathname) ? url.pathname.slice(1).replace(/\/$/, '') : '';
  return { matched: true, id: VALID_ID.test(id) ? id : '', scheme };
}

function findNoteLink(argv) {
  const args = Array.isArray(argv) ? argv : [];
  for (let index = args.length - 1; index >= 0; index -= 1) {
    const result = parseNoteLink(args[index]);
    if (result.matched) return result;
  }
  return { matched: false, id: '' };
}

module.exports = { SCHEMES: [...SCHEMES], parseNoteLink, findNoteLink };
