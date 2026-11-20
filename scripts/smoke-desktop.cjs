'use strict';
const path = require('node:path');
const fs = require('node:fs/promises');
const { spawn } = require('node:child_process');
async function run() {
  const root = path.resolve(__dirname, '..');
  await fs.mkdir(path.join(root, 'work'), { recursive: true });
  const data = await fs.mkdtemp(path.join(root, 'work/smoke-'));
  const executable = require('electron');
  for (const phase of ['first', 'restart', 'editor-detach', 'protocol-links', 'protocol-cold']) {
    await new Promise((resolve, reject) => {
      const args = ['--headless', '--no-sandbox', '--disable-gpu', root, '--self-test'];
      if (phase === 'protocol-cold') {
        try { args.push('fomo://note/' + require('node:fs').readFileSync(path.join(data, 'protocol-note-id.txt'), 'utf8').trim()); }
        catch (error) { reject(error); return; }
      }
      const child = spawn(executable, args, { env: { ...process.env, MEMOFLOW_DATA_DIR: data, MEMOFLOW_TEST_PHASE: phase }, stdio: 'pipe', windowsHide: true });
      const timer = setTimeout(() => { child.kill(); reject(Error('desktop test timed out')); }, 45000);
      let output = '';
      child.stdout.on('data', chunk => { output += chunk.toString(); process.stdout.write(chunk); });
      child.stderr.on('data', chunk => process.stderr.write(chunk));
      child.on('error', error => { clearTimeout(timer); reject(error); });
      child.on('exit', code => { clearTimeout(timer); const marker = phase === 'first' ? 'PASS: native save' : phase === 'restart' ? 'PASS: restart restores' : phase === 'editor-detach' ? 'PASS: editor-detach' : phase === 'protocol-cold' ? 'PASS: cold protocol link' : 'PASS: protocol links'; code === 0 && output.includes(marker) ? resolve() : reject(Error('desktop test did not complete; exit ' + code)); });
    });
  }
  console.log('Desktop smoke tests passed; isolated data: ' + data);
}
run().catch(error => { console.error(error); process.exitCode = 1; });
