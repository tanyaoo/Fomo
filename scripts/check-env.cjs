'use strict';
const fs = require('node:fs');
const path = require('node:path');
const major = Number(process.versions.node.split('.')[0]);
if (!Number.isInteger(major) || major < 24) {
  console.error('WriteBoom 需要 Node.js 24 或更高版本，当前为 ' + process.version + '。');
  console.error('请把 Node 24 放到 PATH 最前面后重试，例如：');
  console.error('  请参照 Node.js 官方安装说明配置 PATH。');
  console.error('本次未执行构建或测试，避免用错误的运行时写入产物。');
  process.exit(1);
}
fs.mkdirSync(path.join(__dirname, '..', 'work'), { recursive: true });
console.log('Node ' + process.version + ' · 运行时检查通过');
