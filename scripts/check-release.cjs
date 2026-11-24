'use strict';
const { execFileSync } = require('node:child_process');
const { version } = require('../package.json');

const tag = process.env.MEMOFLOW_RELEASE_TAG || process.env.GITHUB_REF_NAME;
if (tag !== 'v' + version) throw Error('发布标签 ' + tag + ' 与 package.json 版本 ' + version + ' 不一致');

const git = args => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
const head = git(['rev-parse', 'HEAD']);
if (process.env.GITHUB_SHA && head !== process.env.GITHUB_SHA) {
  throw Error(`Checkout HEAD ${head} 与触发发布的提交 ${process.env.GITHUB_SHA} 不一致`);
}
if (tag) {
  const tagged = git(['rev-parse', `refs/tags/${tag}^{commit}`]);
  if (tagged !== head) throw Error(`发布标签 ${tag} 指向 ${tagged}，但当前提交是 ${head}`);
}
console.log(`Release identity verified: ${tag} -> ${head}`);
