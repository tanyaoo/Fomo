'use strict';
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const asar = require('@electron/asar');

function expectedCommit(root, env = process.env) {
  if (env.MEMOFLOW_BUILD_COMMIT) return env.MEMOFLOW_BUILD_COMMIT;
  return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

function verifyBuildIdentity({ archive, root, version, release = false, env = process.env }) {
  assert.ok(fs.existsSync(archive), '安装包缺少 app.asar');
  const identity = JSON.parse(asar.extractFile(archive, 'dist/build-info.json').toString());
  assert.equal(identity.schemaVersion, 1);
  assert.equal(identity.product, 'Fomo');
  assert.equal(identity.version, version, '安装包构建身份版本与 package.json 不一致');
  assert.equal(identity.commit, expectedCommit(root, env), '安装包构建身份与当前 Git HEAD 不一致');
  assert.match(identity.commit, /^[a-f0-9]{40}$/);
  assert.equal(identity.commitShort, identity.commit.slice(0, 7));
  assert.ok(!Number.isNaN(Date.parse(identity.builtAt)), '安装包构建时间无效');
  if (release) {
    assert.equal(identity.release, true, '正式发布必须绑定正式标签');
    assert.equal(identity.tag, 'v' + version, '正式发布构建标签与版本不一致');
    assert.equal(identity.dirty, false, '正式发布不得包含未提交修改');
  }
  return identity;
}

module.exports = { verifyBuildIdentity };
