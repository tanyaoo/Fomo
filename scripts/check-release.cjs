'use strict';
const { version } = require('../package.json');
const tag = process.env.MEMOFLOW_RELEASE_TAG || process.env.GITHUB_REF_NAME;
if (tag !== 'v' + version) throw Error('发布标签 ' + tag + ' 与 package.json 版本 ' + version + ' 不一致');
console.log('Release version verified: ' + tag);
