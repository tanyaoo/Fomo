'use strict';
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const assert = require('node:assert/strict');
const asar = require('@electron/asar');

const appDir = path.resolve(process.argv[2] || 'release/win-unpacked');
const archive = path.join(appDir, 'resources', 'app.asar');
assert.ok(fs.existsSync(archive), 'Installed app.asar not found: ' + archive);
const hash = value => crypto.createHash('sha256').update(value).digest('hex');
const packed = JSON.parse(asar.extractFile(archive, 'package.json').toString());
const current = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
assert.equal(packed.version, current.version, 'Installed version does not match source package.json');
const identity = JSON.parse(asar.extractFile(archive, 'dist/build-info.json').toString());
assert.equal(identity.version, current.version);
assert.match(identity.commit, /^[a-f0-9]{40}$/);
assert.ok(!Number.isNaN(Date.parse(identity.builtAt)));
for (const file of ['dist/app.js', 'dist/cards.css', 'dist/sidebar.css', 'dist/fidelity.css', 'desktop/main.cjs']) {
  assert.equal(hash(asar.extractFile(archive, file)), hash(fs.readFileSync(path.join(__dirname, '..', file))), file + ' differs from source');
}
console.log(JSON.stringify({ appDir, version: identity.version, commit: identity.commit, buildId: identity.buildId, dirty: identity.dirty }, null, 2));
