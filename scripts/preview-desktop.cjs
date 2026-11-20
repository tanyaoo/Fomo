'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
(async () => {
  const root = path.resolve(__dirname, '..');
  await fs.mkdir(path.join(root, 'work'), { recursive: true });
  const data = await fs.mkdtemp(path.join(root, 'work/studio-preview-'));
  await new Promise((resolve, reject) => {
    const child = spawn(require('electron'), ['--headless', '--no-sandbox', '--disable-gpu', root, '--self-test'], {
      env: { ...process.env, MEMOFLOW_DATA_DIR: data, MEMOFLOW_TEST_PHASE: 'design' }, stdio: 'pipe', windowsHide: true
    });
    const timer = setTimeout(() => { child.kill(); reject(Error('Visual review timed out')); }, 120000);
    let output = '';
    child.stdout.on('data', chunk => { output += chunk.toString(); process.stdout.write(chunk); });
    child.stderr.on('data', chunk => process.stderr.write(chunk));
    child.on('error', error => { clearTimeout(timer); reject(error); });
    child.on('exit', code => { clearTimeout(timer); code === 0 && output.includes('PASS: real summary counts') ? resolve() : reject(Error('Visual review did not complete; exit ' + code)); });
  });
  console.log('Isolated visual profile: ' + data);
})().catch(error => { console.error(error); process.exitCode = 1; });
