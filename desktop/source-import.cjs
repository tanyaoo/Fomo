'use strict';
const { dialog } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);

const MIME = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp',
  '.gif': 'image/gif', '.bmp': 'image/bmp', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.m4a': 'audio/mp4', '.wav': 'audio/wav', '.ogg': 'audio/ogg', '.webm': 'audio/webm',
  '.mp4': 'video/mp4', '.mov': 'video/quicktime', '.m4v': 'video/mp4'
};
const MAX_ASSET = 24 * 1024 * 1024;
const MAX_TOTAL = 120 * 1024 * 1024;

function normalizedKey(value) {
  try { value = decodeURIComponent(value); } catch {}
  return String(value || '').replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

function assetMime(file) {
  return MIME[path.extname(file).toLowerCase()] || '';
}

function dataUrl(file, buffer) {
  const mime = assetMime(file);
  return mime ? `data:${mime};base64,${buffer.toString('base64')}` : '';
}

async function readZip(file) {
  const temp = await fs.mkdtemp(path.join(os.tmpdir(), 'fomo-backup-import-'));
  try {
    try { await run('tar.exe', ['-xf', file, '-C', temp], { windowsHide: true, timeout: 180000 }); }
    catch {
      const escaped = String(file).replace(/'/g, "''"), destination = temp.replace(/'/g, "''");
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', `Expand-Archive -LiteralPath '${escaped}' -DestinationPath '${destination}' -Force`], { windowsHide: true, timeout: 300000 });
    }
    const result = await readFolder(temp);
    return { ...result, name: path.basename(file) };
  } finally { await fs.rm(temp, { recursive: true, force: true }).catch(() => {}); }
}

async function readFolder(folder) {
  let html = '', htmlFile = '', csv = '', total = 0, assetFiles = 0;
  const assets = {};
  const queue = [folder];
  while (queue.length) {
    const current = queue.shift();
    for (const item of await fs.readdir(current, { withFileTypes: true })) {
      const full = path.join(current, item.name);
      if (item.isDirectory()) { queue.push(full); continue; }
      const ext = path.extname(item.name).toLowerCase();
      if (ext === '.html' || ext === '.htm') {
        const isIndex = /^index\.html?$/i.test(item.name);
        if ((!html || (isIndex && !/^index\.html?$/i.test(path.basename(htmlFile)))) && (await fs.stat(full)).size <= 24 * 1024 * 1024) { html = await fs.readFile(full, 'utf8'); htmlFile = full; }
      } else if (ext === '.csv') {
        if (!csv) csv = await fs.readFile(full, 'utf8');
      } else if (assetMime(item.name)) {
        const stat = await fs.stat(full);
        if (stat.size > MAX_ASSET || total + stat.size > MAX_TOTAL) throw Error('附件超过当前导入读取限制（单个24 MB、累计120 MB），已暂停导入，未压缩或删减原图。请拆分备份后导入。');
        const url = dataUrl(item.name, await fs.readFile(full));
        if (!url) continue;
        total += stat.size;
        const key = normalizedKey(path.relative(folder, full));
        assets[key] = url;
        if (!assets[item.name]) assets[item.name] = url;
        assetFiles += 1;
      }
    }
  }
  if (!html && !csv) throw Error('文件夹中没有找到可导入的 HTML 或 CSV');
  return { html, csv, assets, assetCount: assetFiles, name: path.basename(folder) };
}

async function importBackup(window, options = {}) {
  const folder = options.folder === true;
  const selected = folder
    ? await dialog.showOpenDialog(window, { title: '选择笔记备份文件夹', properties: ['openDirectory'] })
    : await dialog.showOpenDialog(window, {
        title: '选择笔记备份文件',
        properties: ['openFile'],
        filters: [
          { name: '笔记备份文件', extensions: ['zip', 'html', 'htm', 'csv'] },
          { name: 'ZIP 压缩包', extensions: ['zip'] },
          { name: 'HTML 文件', extensions: ['html', 'htm'] },
          { name: 'CSV 文件', extensions: ['csv'] }
        ]
      });
  if (selected.canceled || !selected.filePaths[0]) return null;
  const target = selected.filePaths[0];
  const stat = await fs.stat(target);
  if (stat.size > 1024 * 1024 * 1024) throw Error('导出文件超过 1 GB，无法导入');
  if (folder || stat.isDirectory()) return readFolder(target);
  const ext = path.extname(target).toLowerCase();
  if (ext === '.zip') return readZip(target);
  if (ext === '.html' || ext === '.htm') return { html: await fs.readFile(target, 'utf8'), csv: '', assets: {}, assetCount: 0, name: path.basename(target) };
  if (ext === '.csv') return { html: '', csv: await fs.readFile(target, 'utf8'), assets: {}, assetCount: 0, name: path.basename(target) };
  throw Error('请选择备份的 ZIP、HTML 或 CSV 文件');
}

module.exports = { importBackup, readZip, readFolder };
