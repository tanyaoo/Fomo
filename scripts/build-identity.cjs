'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.resolve(__dirname, '..');
const SHA_RE = /^[a-f0-9]{40}$/;
const VERSION_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function git(cwd, args, optional = false) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  } catch (error) {
    if (optional) return '';
    throw new Error(`无法读取构建身份：git ${args.join(' ')}`, { cause: error });
  }
}

function createBuildIdentity({ version, commit, ref = '', dirty = false, tag = '', builtAt = new Date(), source = 'local' }) {
  if (!VERSION_RE.test(String(version || ''))) throw new Error('无效的应用版本：' + version);
  if (!SHA_RE.test(String(commit || ''))) throw new Error('构建必须绑定完整的 Git 提交 SHA');
  if (tag && tag !== 'v' + version) throw new Error(`构建标签 ${tag} 与版本 ${version} 不一致`);
  const normalizedRef = String(ref || '');
  const release = tag === 'v' + version;
  return {
    schemaVersion: 1,
    product: 'Fomo',
    version,
    commit,
    commitShort: commit.slice(0, 7),
    buildId: `${version}+${commit.slice(0, 12)}${dirty ? '-dirty' : ''}`,
    ref: normalizedRef,
    branch: normalizedRef.startsWith('refs/heads/') ? normalizedRef.slice('refs/heads/'.length) : '',
    tag: release ? tag : '',
    release,
    dirty: Boolean(dirty),
    source,
    builtAt: new Date(builtAt).toISOString()
  };
}

function collectBuildIdentity({ cwd = ROOT, env = process.env, now = new Date() } = {}) {
  const { version } = JSON.parse(fs.readFileSync(path.join(cwd, 'package.json'), 'utf8'));
  const commit = env.MEMOFLOW_BUILD_COMMIT || git(cwd, ['rev-parse', 'HEAD']);
  const ref = env.MEMOFLOW_BUILD_REF || env.GITHUB_REF || git(cwd, ['symbolic-ref', '-q', 'HEAD'], true);
  const dirtyOverride = env.MEMOFLOW_BUILD_DIRTY;
  const dirty = dirtyOverride === undefined
    ? Boolean(git(cwd, ['status', '--porcelain', '--untracked-files=no']))
    : /^(1|true|yes)$/i.test(dirtyOverride);
  const tag = env.MEMOFLOW_RELEASE_TAG
    || (env.GITHUB_REF_TYPE === 'tag' ? env.GITHUB_REF_NAME : '')
    || git(cwd, ['describe', '--tags', '--exact-match', 'HEAD'], true);
  return createBuildIdentity({
    version,
    commit,
    ref,
    dirty,
    tag,
    builtAt: now,
    source: env.GITHUB_ACTIONS === 'true' ? 'github-actions' : 'local'
  });
}

function writeBuildIdentity({ cwd = ROOT, env = process.env, now = new Date() } = {}) {
  const identity = collectBuildIdentity({ cwd, env, now });
  const target = path.join(cwd, 'dist', 'build-info.json');
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.writeFileSync(target, JSON.stringify(identity, null, 2) + '\n');
  console.log(`Build identity: ${identity.buildId} (${identity.release ? 'release' : 'local'}${identity.dirty ? ', dirty' : ''})`);
  return identity;
}

if (require.main === module) writeBuildIdentity();

module.exports = { collectBuildIdentity, createBuildIdentity, writeBuildIdentity };
