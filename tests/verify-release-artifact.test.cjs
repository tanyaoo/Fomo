'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { verify } = require('../scripts/verify-release-artifact.cjs');
const tag = 'v1.2.3', sha = 'a'.repeat(40);
function fixture() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fomo-artifact-test-'));
  const names = ['Fomo-1.2.3-x64.exe', 'Fomo-1.2.3-x64.zip', 'Fomo-1.2.3-x64.exe.blockmap', 'latest.yml'];
  const entries = names.map(name => { const value = Buffer.from(name); fs.writeFileSync(path.join(dir, name), value); return crypto.createHash('sha256').update(value).digest('hex') + '  ' + name; });
  fs.writeFileSync(path.join(dir, 'BUILD-IDENTITY.txt'), `${tag}\n${sha}\n`);
  fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), entries.join('\n') + '\n');
  return { dir, entries };
}
test('accepts original identity and all four exact hashes', () => { const { dir } = fixture(); assert.equal(verify({ dir, tag, sha }), true); });
test('rejects a changed asset or commit', () => {
  const { dir } = fixture(); fs.writeFileSync(path.join(dir, 'latest.yml'), 'changed');
  assert.throws(() => verify({ dir, tag, sha }), /checksum mismatch/);
  assert.throws(() => verify({ dir, tag, sha: 'b'.repeat(40) }), /identity mismatch/);
});
test('rejects unexpected and duplicate checksum names', () => {
  const { dir, entries } = fixture(); fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), [...entries.slice(0, 3), entries[0]].join('\n'));
  assert.throws(() => verify({ dir, tag, sha }), /Invalid checksum/);
  fs.writeFileSync(path.join(dir, 'SHA256SUMS.txt'), [...entries.slice(0, 3), `${'a'.repeat(64)}  ../escape`].join('\n'));
  assert.throws(() => verify({ dir, tag, sha }), /Invalid checksum/);
});
