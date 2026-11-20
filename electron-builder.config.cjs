'use strict';
const base = require('./package.json').build;
const { signingConfiguration } = require('./scripts/windows-signing.cjs');
const signing = signingConfiguration();
module.exports = { ...base, ...signing.build, win: { ...base.win, ...signing.build.win } };
