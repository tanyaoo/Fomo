'use strict';
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const roots = ['dist', 'desktop', 'obsidian-plugin', 'THIRD-PARTY-NOTICES.md'];
const git = args => execFileSync('git', args, { encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'] });
const normalize = value => value.toString('utf8').replace(/\r\n/g, '\n');
const files = git(['ls-tree', '-r', '--name-only', 'HEAD', '--', ...roots]).toString('utf8').trim().split(/\r?\n/).filter(Boolean);
const changed = [];
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  if (normalize(git(['show', 'HEAD:' + file])) !== normalize(fs.readFileSync(file))) changed.push(file);
}
if (changed.length) throw Error('构建产物与源码提交不一致：\n' + changed.join('\n'));
console.log(`Generated files match HEAD (${files.length} files checked)`);
