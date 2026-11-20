'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { recover } = require('../scripts/release-recover.cjs');
const names = ['Fomo-1.2.3-x64.exe', 'Fomo-1.2.3-x64.zip', 'Fomo-1.2.3-x64.exe.blockmap', 'latest.yml'];
function fixture({ draft = true, changed = false, publishAfterFirstRead = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fomo-recover-test-'));
  for (const name of names) fs.writeFileSync(path.join(dir, name), name);
  const remote = { [names[0]]: Buffer.from(changed ? 'different' : names[0]) };
  const calls = [];
  function runGh(args) {
    calls.push(args);
    if (args[1] === 'view') { const result = JSON.stringify({ isDraft: draft, assets: Object.keys(remote).map(name => ({ name })) }); if (publishAfterFirstRead) { draft = false; publishAfterFirstRead = false; } return result; }
    if (args[1] === 'download') { const name = args[args.indexOf('--pattern') + 1], dest = args[args.indexOf('--dir') + 1]; fs.writeFileSync(path.join(dest, name), remote[name]); return ''; }
    if (args[1] === 'upload') { const file = args[3]; remote[path.basename(file)] = fs.readFileSync(file); return ''; }
    if (args[1] === 'edit') { draft = false; return ''; }
    throw Error('Unexpected operation');
  }
  return { dir, calls, runGh };
}
test('recovers a matching draft without re-uploading its existing asset', () => {
  const f = fixture();
  assert.deepEqual(recover({ repo: 'owner/repo', tag: 'v1.2.3', sourceDir: f.dir, runGh: f.runGh }), { repo: 'owner/repo', tag: 'v1.2.3', complete: true, uploaded: 3 });
  assert.equal(f.calls.filter(c => c[1] === 'upload').length, 3);
  assert.equal(f.calls.filter(c => c[1] === 'edit').length, 1);
  assert.ok(f.calls.every(c => !c.includes('--clobber')));
});
test('refuses mismatched or incomplete published releases before any mutation', () => {
  for (const opts of [{ changed: true }, { draft: false }]) {
    const f = fixture(opts);
    assert.throws(() => recover({ repo: 'owner/repo', tag: 'v1.2.3', sourceDir: f.dir, runGh: f.runGh }));
    assert.ok(f.calls.every(c => c[1] !== 'upload' && c[1] !== 'edit'));
  }
});
test('stops if a draft becomes public before upload', () => {
  const f = fixture({ publishAfterFirstRead: true });
  assert.throws(() => recover({ repo: 'owner/repo', tag: 'v1.2.3', sourceDir: f.dir, runGh: f.runGh }));
  assert.ok(f.calls.every(c => c[1] !== 'upload' && c[1] !== 'edit'));
});
