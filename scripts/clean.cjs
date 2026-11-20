'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const work = path.join(root, 'work');
const release = path.join(root, 'release');
const prefixes = ['composer-focus-', 'inline-edit-', 'list-menu-', 'public-0.9-', 'public-update-', 'refinements-', 'smoke-', 'studio-preview-', 'tags-cards-', 'update-smoke-', 'workspace-', 'sidebar-check-', 'sidebar-audit-', 'detail-relations-', 'detail-batch-', 'card-layout-', 'share-images-', 'tag-management-', 'tag-area-', 'dialog-check-', 'discovery-check-', 'feedback-check-', 'note-scrollbar-', 'search-batch-', 'lifecycle-', 'settings-batch-', 'ui-batch-', 'annotation-draft-', 'location-tests', 'uat-', 'matrix-audit-', 'icon-states-'];
const exact = new Set(['file-store-tests', 'location-tests', 'signing-build-check']);
const options = new Set(process.argv.slice(2));
const apply = options.has('--yes');
const includeRelease = options.has('--release');

async function sizeOf(target) {
  let total = 0;
  const rows = await fs.readdir(target, { withFileTypes: true, recursive: true }).catch(() => []);
  for (const row of rows) {
    if (!row.isFile()) continue;
    const stat = await fs.stat(path.join(row.parentPath || row.path, row.name)).catch(() => null);
    if (stat) total += stat.size;
  }
  return total;
}

async function remove(target, label) {
  const before = await sizeOf(target);
  if (!apply) {
    console.log('[dry-run] ' + label + ' · ' + (before / 1024 / 1024).toFixed(1) + ' MB');
    return before;
  }
  await fs.rm(target, { recursive: true, force: true });
  console.log('removed ' + label + ' · ' + (before / 1024 / 1024).toFixed(1) + ' MB');
  return before;
}

(async () => {
  const stats = await fs.stat(path.join(root, 'package.json')).catch(() => null);
  if (!stats || !stats.isFile()) throw Error('清理脚本必须位于 WriteBoom 项目根目录的 scripts 下');

  let reclaimed = 0;
  let removed = 0;
  const directories = await fs.readdir(work, { withFileTypes: true }).catch(() => []);
  for (const entry of directories) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const matchesExact = exact.has(entry.name);
    const matchesPrefix = prefixes.some(prefix => entry.name.startsWith(prefix));
    if (!matchesExact && !matchesPrefix) continue;
    const target = path.join(work, entry.name);
    if (path.dirname(target) !== work) throw Error('拒绝清理工作区之外的路径：' + target);
    reclaimed += await remove(target, 'work/' + entry.name);
    removed += 1;
  }
  if (!apply) console.log('[dry-run] 共 ' + removed + ' 个临时运行目录；添加 --yes 才会删除');
  if (includeRelease) {
    const exists = await fs.stat(release).catch(() => null);
    if (exists?.isDirectory() && path.dirname(release) === root && path.basename(release) === 'release') {
      reclaimed += await remove(release, 'release/');
    }
  }
  if (apply) console.log('已清理 ' + removed + ' 个临时运行目录' + (includeRelease ? '和本地 release/' : '') + '，释放约 ' + (reclaimed / 1024 / 1024 / 1024).toFixed(2) + ' GB');
})().catch(error => { console.error('清理失败：' + error.message); process.exitCode = 1; });
