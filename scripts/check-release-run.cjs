'use strict';
const { execFileSync } = require('node:child_process');

function assertFirstRun({ pages, tag, runId }) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag || '') || !/^\d+$/.test(String(runId || ''))) throw Error('Invalid release tag or run ID');
  if (!Array.isArray(pages) || pages.some(page => !Array.isArray(page.workflow_runs))) throw Error('Cannot verify prior release runs');
  const runs = pages.flatMap(page => page.workflow_runs);
  if (!runs.some(run => String(run.id) === String(runId) && run.event === 'push' && run.head_branch === tag)) throw Error('Current release run was not returned by GitHub');
  const prior = runs.find(run =>
    String(run.id) !== String(runId) && run.event === 'push' && run.head_branch === tag);
  if (prior) throw Error(`Release tag ${tag} already has run ${prior.id}; recover its original build instead`);
}

if (require.main === module) {
  try {
    const { GITHUB_REPOSITORY: repo, GITHUB_REF_NAME: tag, GITHUB_RUN_ID: runId } = process.env;
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repo || '') || !/^v\d+\.\d+\.\d+$/.test(tag || '')) throw Error('Invalid repository or release tag');
    const endpoint = `repos/${repo}/actions/workflows/desktop.yml/runs?event=push&branch=${encodeURIComponent(tag)}&per_page=100`;
    const pages = JSON.parse(execFileSync('gh', ['api', '--paginate', '--slurp', endpoint], { encoding: 'utf8' }));
    assertFirstRun({ pages, tag, runId });
    console.log('No earlier release run found for ' + tag);
  } catch (error) {
    console.error('Release build stopped:', error.message);
    process.exitCode = 1;
  }
}
module.exports = { assertFirstRun };
