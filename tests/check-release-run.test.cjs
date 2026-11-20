'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { assertFirstRun } = require('../scripts/check-release-run.cjs');
const tag = 'v1.2.3', runId = '42';
test('allows only the current run and unrelated runs', () => {
  assert.doesNotThrow(() => assertFirstRun({ tag, runId, pages: [{ workflow_runs: [
    { id: 42, event: 'push', head_branch: tag },
    { id: 8, event: 'push', head_branch: 'v1.2.2' },
    { id: 9, event: 'workflow_dispatch', head_branch: tag }
  ] }] }));
});
test('rejects earlier runs even across result pages', () => {
  assert.throws(() => assertFirstRun({ tag, runId, pages: [
    { workflow_runs: [{ id: 42, event: 'push', head_branch: tag }] },
    { workflow_runs: [{ id: 1, event: 'push', head_branch: tag }] }
  ] }), /already has run 1/);
});
test('fails closed on malformed input', () => {
  assert.throws(() => assertFirstRun({ tag: '../x', runId, pages: [] }), /Invalid/);
  assert.throws(() => assertFirstRun({ tag, runId, pages: [{}] }), /Cannot verify/);
});
