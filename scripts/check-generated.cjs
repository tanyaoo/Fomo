'use strict';
const fs = require('node:fs');
const { execFileSync } = require('node:child_process');

const roots = ['dist', 'desktop', 'obsidian-plugin', 'THIRD-PARTY-NOTICES.md'];
const git = args => execFileSync('git', args, { encoding: 'buffer', maxBuffer: 128 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] });
const textExtensions = new Set(['.css', '.html', '.js', '.json', '.md', '.txt', '.yml', '.yaml']);
const text = file => textExtensions.has(require('node:path').extname(file));
const normalizeText = value => value.toString('utf8').replace(/\r\n/g, '\n');
const files = git(['ls-tree', '-r', '--name-only', 'HEAD', '--', ...roots]).toString('utf8').trim().split(/\r?\n/).filter(Boolean);
const changed = [];
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const committed = git(['show', 'HEAD:' + file]);
  const current = fs.readFileSync(file);
  const matches = text(file) ? normalizeText(committed) === normalizeText(current) : committed.equals(current);
  if (!matches) changed.push(file);
}
if (changed.length) throw Error('构建产物与源码提交不一致：\n' + changed.join('\n'));
console.log(`Generated files match HEAD (${files.length} files checked)`);
