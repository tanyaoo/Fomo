'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
function verify({ dir, tag, sha }) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag) || !/^[a-f0-9]{40}$/.test(sha)) throw Error('Invalid tag or commit');
  const version = tag.slice(1);
  const names = [`Fomo-${version}-x64.exe`, `Fomo-${version}-x64.zip`, `Fomo-${version}-x64.exe.blockmap`, 'latest.yml'];
  const identity = fs.readFileSync(path.join(dir, 'BUILD-IDENTITY.txt'), 'utf8').trim().split(/\r?\n/);
  if (identity.length !== 2 || identity[0] !== tag || identity[1] !== sha) throw Error('Build identity mismatch');
  const rows = fs.readFileSync(path.join(dir, 'SHA256SUMS.txt'), 'utf8').trim().split(/\r?\n/);
  if (rows.length !== names.length) throw Error('Unexpected checksum count');
  const seen = new Set();
  for (const row of rows) {
    const match = /^([a-f0-9]{64}) [ *]([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(row);
    if (!match || !names.includes(match[2]) || seen.has(match[2])) throw Error('Invalid checksum entry');
    seen.add(match[2]);
    const actual = crypto.createHash('sha256').update(fs.readFileSync(path.join(dir, match[2]))).digest('hex');
    if (actual !== match[1]) throw Error('Asset checksum mismatch: ' + match[2]);
  }
  if (seen.size !== names.length) throw Error('Missing asset checksum');
  return true;
}
if (require.main === module) {
  try { verify({ dir: process.argv[2], tag: process.argv[3], sha: process.argv[4] }); console.log('Build artifact identity and SHA-256 checks passed'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { verify };
