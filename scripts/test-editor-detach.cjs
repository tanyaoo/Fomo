'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
(async () => {
  const root = path.resolve(__dirname, '..');
  await fs.mkdir(path.join(root, 'work'), { recursive: true });
  const directory = await fs.mkdtemp(path.join(root, 'work/editor-detach-'));
  await new Promise((resolve, reject) => {
    const child = spawn(require('electron'), [root, '--self-test'], {
      env: { ...process.env, MEMOFLOW_DATA_DIR: directory, MEMOFLOW_TEST_PHASE: 'editor-detach' },
      stdio: 'pipe', windowsHide: true
    });
    let output = '';
    const timer = setTimeout(() => { child.kill(); reject(Error('Editor detach test timed out')); }, 90000);
    child.stdout.on('data', data => { output += data; process.stdout.write(data); });
    child.stderr.on('data', data => process.stderr.write(data));
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => {
      clearTimeout(timer);
      code === 0 && output.includes('PASS: editor-detach') ? resolve() : reject(Error('Editor detach test failed: ' + code));
    });
  });
  console.log('Isolated editor detach verification: ' + directory);
})().catch(error => { console.error(error); process.exitCode = 1; });
