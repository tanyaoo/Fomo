'use strict';
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');
const { recoveryPlan } = require('./release-recovery-plan.cjs');

function digest(file) { return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'); }
function gh(args) { return execFileSync('gh', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim(); }
function recover({ repo, tag, sourceDir, runGh = gh }) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo) || !/^v\d+\.\d+\.\d+$/.test(tag)) throw Error('Invalid repository or release tag');
  const version = tag.slice(1);
  const names = [`Fomo-${version}-x64.exe`, `Fomo-${version}-x64.zip`, `Fomo-${version}-x64.exe.blockmap`, 'latest.yml'];
  const expected = Object.fromEntries(names.map(name => [name, digest(path.join(sourceDir, name))]));
  const read = () => JSON.parse(runGh(['release', 'view', tag, '--repo', repo, '--json', 'isDraft,assets']));
  const inspect = release => {
    const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'fomo-release-verify-'));
    const existing = {};
    for (const asset of release.assets) {
      if (!Object.hasOwn(expected, asset.name)) throw Error('Unexpected release asset: ' + asset.name);
      runGh(['release', 'download', tag, '--repo', repo, '--pattern', asset.name, '--dir', temp]);
      existing[asset.name] = digest(path.join(temp, asset.name));
    }
    return recoveryPlan({ expected, existing, draft: release.isDraft });
  };
  const release = read();
  const plan = inspect(release);
  let uploaded = 0;
  for (const name of plan.missing) {
    const current = read();
    const currentPlan = inspect(current);
    if (!current.isDraft) throw Error('Release ceased to be a draft; no further mutation');
    if (!currentPlan.missing.includes(name)) continue;
    runGh(['release', 'upload', tag, path.join(sourceDir, name), '--repo', repo]);
    uploaded++;
  }
  const after = read();
  const final = inspect(after);
  if (!final.complete) throw Error('Release is incomplete after recovery');
  if (final.mayPublish) runGh(['release', 'edit', tag, '--repo', repo, '--draft=false', '--latest']);
  return { repo, tag, complete: true, uploaded };
}

if (require.main === module) {
  try { console.log(JSON.stringify(recover({ repo: process.argv[2], tag: process.argv[3], sourceDir: process.argv[4] }))); }
  catch (error) { console.error('Release recovery stopped:', error.message); process.exitCode = 1; }
}
module.exports = { recover, digest };
