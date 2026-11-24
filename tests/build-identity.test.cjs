'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { createBuildIdentity } = require('../scripts/build-identity.cjs');

const commit = 'abcdef0123456789abcdef0123456789abcdef01';

test('release identity binds the exact tag and commit', () => {
  const identity = createBuildIdentity({ version: '1.2.3', commit, ref: 'refs/tags/v1.2.3', tag: 'v1.2.3', builtAt: '2026-11-24T00:00:00Z', source: 'github-actions' });
  assert.equal(identity.release, true);
  assert.equal(identity.branch, '');
  assert.equal(identity.commitShort, 'abcdef0');
  assert.equal(identity.buildId, '1.2.3+abcdef012345');
  assert.equal(identity.dirty, false);
});

test('local dirty identity is visible and cannot masquerade as a release', () => {
  const identity = createBuildIdentity({ version: '1.2.3', commit, ref: 'refs/heads/main', dirty: true });
  assert.equal(identity.release, false);
  assert.equal(identity.branch, 'main');
  assert.equal(identity.dirty, true);
  assert.match(identity.buildId, /-dirty$/);
});

test('identity rejects mismatched tags and incomplete commits', () => {
  assert.throws(() => createBuildIdentity({ version: '1.2.3', commit, tag: 'v1.2.4' }), /不一致/);
  assert.throws(() => createBuildIdentity({ version: '1.2.3', commit: 'abcdef0' }), /完整/);
});
