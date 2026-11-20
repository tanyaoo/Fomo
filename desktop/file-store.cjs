'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const Core = require('../dist/core.js');

async function atomicWrite(file, value, io = fs) {
  await io.mkdir(path.dirname(file), { recursive: true });
  const temp = file + '.' + randomUUID() + '.tmp';
  let handle;
  try {
    handle = await io.open(temp, 'wx');
    await handle.writeFile(value);
    await handle.sync();
    await handle.close(); handle = null;
    await io.rename(temp, file);
  } catch (error) {
    await handle?.close().catch(() => {});
    await io.unlink(temp).catch(() => {});
    throw error;
  }
}

function markdown(memo) {
  const tags = Core.tagsOf(memo.content);
  return ['---', 'id: ' + JSON.stringify(memo.id), 'created: ' + JSON.stringify(memo.created),
    'updated: ' + JSON.stringify(memo.updated), 'tags: ' + JSON.stringify(tags),
    'starred: ' + memo.starred, 'deleted: ' + memo.deleted, ...(memo.pinned ? ['pinned: true'] : []), ...(memo.relatedTo ? ['related_to: ' + JSON.stringify(memo.relatedTo)] : []),...(Core.refsOf(memo).length?['references: '+JSON.stringify(Core.refsOf(memo))]:[]),...(memo.annotationOf?['annotation_of: '+JSON.stringify(memo.annotationOf)]:[]), '---', '', memo.content, '',...Core.refsOf(memo).map(id=>'引用：[['+id+']]'),...((memo.annotations||[]).length&&!memo.annotationsMigrated?['## 批注','',...memo.annotations.flatMap(a=>['### '+a.created+' · '+a.id,'',a.content,''])]:[])].join('\n');
}

class FileStore {
  constructor(directory, options = {}) {
    this.directory = directory;
    this.file = path.join(directory, 'state.json');
    this.io = options.io || fs;
    this.now = options.now || Date.now;
    this.tail = Promise.resolve();
    this.warning = '';
    this.backups = new (require('./backups.cjs').Backups)(this, atomicWrite);
  }
  serialize(operation) {
    const result = this.tail.then(operation);
    this.tail = result.catch(() => {});
    return result;
  }
  async readJSON(file) {
    try { return JSON.parse(await this.io.readFile(file, 'utf8')); }
    catch (error) { if (error.code === 'ENOENT') return undefined; throw error; }
  }
  init() {
    return this.serialize(async () => {
      const stored = await this.readJSON(this.file);
      const value = Core.upgrade(stored === undefined ? Core.blank() : stored);
      const migrating=stored!==undefined&&(stored.version!==4||stored.memos.some(m=>m.annotations?.length&&!m.annotationsMigrated));
      // Commit a complete pre-migration copy before touching the authoritative file.
      if(migrating)await atomicWrite(path.join(this.directory,'backups','before-v4-'+randomUUID()+'.json'),JSON.stringify(stored,null,2),this.io);
      if (stored === undefined || migrating) await atomicWrite(this.file, JSON.stringify(value, null, 2), this.io);
      await this.refreshMarkdown(value);
      await this.backups.automatic();
      return value;
    });
  }
  readState() {
    return this.serialize(async () => Core.validate(await this.readJSON(this.file)));
  }
  save(base, desired) {
    return this.serialize(async () => {
      const latest = Core.validate(await this.readJSON(this.file));
      const next = Core.merge(Core.validate(base), Core.validate(desired), latest);
      // Preserve a valid previous state before committing. Never overwrite corrupt input.
      await atomicWrite(path.join(this.directory, 'backups', 'previous-state.json'), JSON.stringify(latest, null, 2), this.io);
      await atomicWrite(this.file, JSON.stringify(next, null, 2), this.io);
      // Markdown is a derived view. Failure here must not report the committed memo as unsaved.
      await this.refreshMarkdown(next, latest.memos.map(m=>m.id));
      await this.backups.automatic();
      return next;
    });
  }
  // Synchronization must not merge an operation into a state that changed
  // after its preview, especially when that operation moves notes to trash.
  saveIfUnchanged(base, desired) {
    return this.serialize(async () => {
      const expected = Core.validate(base), latest = Core.validate(await this.readJSON(this.file));
      if (JSON.stringify(latest) !== JSON.stringify(expected)) throw Error('Fomo 笔记已变化，请重新预览');
      const next = Core.merge(expected, Core.validate(desired), latest);
      await atomicWrite(path.join(this.directory, 'backups', 'previous-state.json'), JSON.stringify(latest, null, 2), this.io);
      await atomicWrite(this.file, JSON.stringify(next, null, 2), this.io);
      await this.refreshMarkdown(next, latest.memos.map(m=>m.id));
      await this.backups.automatic();
      return next;
    });
  }
  draft(value) {
    return this.serialize(async () => {
      if (!value || typeof value.current?.content !== 'string') throw Error('草稿格式无效');
      const existing=await this.readJSON(path.join(this.directory,'draft.json'));
      if(existing!==undefined&&(!existing||typeof existing.current?.content!=='string'))throw Error('已有草稿无法读取，原文件未覆盖');
      return atomicWrite(path.join(this.directory, 'draft.json'), JSON.stringify(value), this.io);
    });
  }
  readDraft() { return this.serialize(async () => {const value=await this.readJSON(path.join(this.directory,'draft.json'));if(value!==undefined&&(!value||typeof value.current?.content!=='string'))throw Error('草稿格式无效，原文件仍然保留');return value;}); }
  backupInfo() { return this.serialize(() => this.backups.info()); }
  configureBackups(value) { return this.serialize(() => this.backups.configure(value)); }
  backupNow() { return this.serialize(async () => { await this.backups.create(); return this.backups.info(); }); }
  autoBackup() { return this.serialize(() => this.backups.automatic()); }
  previewBackup(id) { return this.serialize(() => this.backups.preview(id)); }
  deleteBackup(id) { return this.serialize(() => this.backups.remove(id)); }
  restoreBackup(request) { return this.serialize(() => this.backups.restore(request)); }
  restoreAiConversationBackup(request) { return this.serialize(() => this.backups.restoreConversations(request)); }
  purge(ids) {
    return this.serialize(async () => {
      const latest = Core.validate(await this.readJSON(this.file));
      const next = Core.purge(latest, ids);
      if (next.memos.length === latest.memos.length) return next;
      // Destructive deletion always leaves a protected whole-library copy first.
      await this.backups.create('before-restore');
      await atomicWrite(this.file, JSON.stringify(next, null, 2), this.io);
      await this.refreshMarkdown(next, latest.memos.map(m => m.id));
      await this.backups.automatic();
      return next;
    });
  }
  storageInfo() {
    return this.serialize(async () => {
      const measure = async folder => {
        const rows = await this.io.readdir(folder, { withFileTypes: true, recursive: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
        let bytes = 0, files = 0;
        for (const row of rows) {
          if (!row.isFile()) continue;
          const stat = await this.io.stat(path.join(row.parentPath || row.path, row.name)).catch(() => null);
          if (stat) { bytes += stat.size; files += 1; }
        }
        return { bytes, files };
      };
      const state = await this.io.stat(this.file).catch(() => null);
      const attachments = await measure(path.join(this.directory, 'attachments'));
      const attachmentRows = await this.io.readdir(path.join(this.directory, 'attachments'), { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
      const stateValue = Core.validate(await this.readJSON(this.file));
      const referenced = new Set();
      for (const memo of stateValue.memos) for (let index = 0; index < memo.images.length; index++) {
        const match = /^data:image\/(jpeg|png|webp|gif);base64,/.exec(memo.images[index]);
        if (match) referenced.add(memo.id + '-' + index + '.' + (match[1] === 'jpeg' ? 'jpg' : match[1]));
      }
      const attachmentPattern = /^[a-zA-Z0-9-]{1,100}-\d+\.(?:jpg|png|webp|gif)$/;
      let referencedFiles = 0, referencedBytes = 0, orphanedFiles = 0, orphanedBytes = 0;
      for (const row of attachmentRows) {
        if (!row.isFile() || !attachmentPattern.test(row.name)) continue;
        const stat = await this.io.stat(path.join(this.directory, 'attachments', row.name)).catch(() => null);
        if (!stat) continue;
        if (referenced.has(row.name)) { referencedFiles += 1; referencedBytes += stat.size; }
        else { orphanedFiles += 1; orphanedBytes += stat.size; }
      }
      const backups = await measure(path.join(this.directory, 'backups'));
      const memos = await measure(path.join(this.directory, 'Memos'));
      const trash = await measure(path.join(this.directory, 'Trash'));
      const rootRows = await this.io.readdir(this.directory, { withFileTypes: true }).catch(() => []);
      let miscBytes = 0, miscFiles = 0;
      for (const row of rootRows) {
        if (!row.isFile() || row.name === 'state.json') continue;
        const stat = await this.io.stat(path.join(this.directory, row.name)).catch(() => null);
        if (stat) { miscBytes += stat.size; miscFiles += 1; }
      }
      attachments.referencedFiles = referencedFiles;
      attachments.referencedBytes = referencedBytes;
      attachments.orphanedFiles = orphanedFiles;
      attachments.orphanedBytes = orphanedBytes;
      const stateBytes = state?.size || 0;
      const misc = { bytes: miscBytes, files: miscFiles };
      return { state: { bytes: stateBytes, files: state ? 1 : 0 }, attachments, backups, memos, trash, misc, total: stateBytes + attachments.bytes + backups.bytes + memos.bytes + trash.bytes + misc.bytes };
    });
  }
  cleanupAttachments(names) {
    const pattern = /^[a-zA-Z0-9-]{1,100}-\d+\.(?:jpg|png|webp|gif)$/;
    if (!Array.isArray(names) || names.length > 10000 || names.some(name => typeof name !== 'string' || !pattern.test(name))) throw Error('附件清理清单无效');
    const requested = new Set(names);
    return this.serialize(async () => {
      const state = Core.validate(await this.readJSON(this.file));
      const referenced = new Set();
      for (const memo of state.memos) for (let index = 0; index < memo.images.length; index++) {
        const match = /^data:image\/(jpeg|png|webp|gif);base64,/.exec(memo.images[index]);
        if (match) referenced.add(memo.id + '-' + index + '.' + (match[1] === 'jpeg' ? 'jpg' : match[1]));
      }
      const folder = path.join(this.directory, 'attachments');
      const rows = await this.io.readdir(folder, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
      let removed = 0, bytes = 0, skipped = 0;
      for (const row of rows) {
        if (!row.isFile() || !pattern.test(row.name) || !requested.has(row.name)) continue;
        if (referenced.has(row.name)) { skipped += 1; continue; }
        const file = path.join(folder, row.name), stat = await this.io.stat(file).catch(() => null);
        await this.io.unlink(file);
        removed += 1; bytes += stat?.size || 0;
      }
      return { removed, bytes, skipped };
    });
  }
  attachmentInfo() {
    return this.serialize(async () => {
      const state = Core.validate(await this.readJSON(this.file));
      const references = new Map();
      for (const memo of state.memos) for (let index = 0; index < memo.images.length; index++) {
        const match = /^data:image\/(jpeg|png|webp|gif);base64,/.exec(memo.images[index]);
        if (!match) continue;
        const name = memo.id + '-' + index + '.' + (match[1] === 'jpeg' ? 'jpg' : match[1]);
        references.set(name, { memoId: memo.id, memoPreview: String(memo.content || '').replace(/\s+/g, ' ').trim().slice(0, 80), deleted: !!memo.deleted });
      }
      const folder = path.join(this.directory, 'attachments');
      const rows = await this.io.readdir(folder, { withFileTypes: true }).catch(error => { if (error.code === 'ENOENT') return []; throw error; });
      const pattern = /^[a-zA-Z0-9-]{1,100}-\d+\.(?:jpg|png|webp|gif)$/;
      const result = [];
      for (const row of rows) {
        if (!row.isFile() || !pattern.test(row.name)) continue;
        const stat = await this.io.stat(path.join(folder, row.name)).catch(() => null);
        if (!stat) continue;
        const reference = references.get(row.name);
        result.push({ name: row.name, bytes: stat.size, referenced: !!reference, memoId: reference?.memoId || '', memoPreview: reference?.memoPreview || '', deleted: !!reference?.deleted });
      }
      return result.sort((a, b) => b.bytes - a.bytes || a.name.localeCompare(b.name));
    });
  }
  async refreshMarkdown(state, previousIds = []) {
    try {
      await this.io.mkdir(path.join(this.directory, 'Memos'), { recursive: true });
      await this.io.mkdir(path.join(this.directory, 'Trash'), { recursive: true });
      await this.io.mkdir(path.join(this.directory, 'attachments'), { recursive: true });
      const manifest = await this.readJSON(path.join(this.directory, 'markdown-manifest.json'));
      const prior = manifest === undefined ? [] : manifest;
      if (!Array.isArray(prior) || prior.some(id => typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(id))) throw Error('Markdown 清单无效，原文件保留');
      const active = new Set(state.memos.filter(m => !m.deleted).map(m => m.id));
      const present = new Set(state.memos.map(m => m.id));
      const allManifest = await this.readJSON(path.join(this.directory,'markdown-all-manifest.json'));
      const allPrior = allManifest === undefined ? [] : allManifest;
      if (!Array.isArray(allPrior) || allPrior.some(id=>typeof id!=='string'||!/^[a-zA-Z0-9-]{1,100}$/.test(id))) throw Error('Markdown 全量清单无效，原文件保留');
      // Reuse unchanged projections: only notes whose Markdown or image signature changed are rewritten.
      const cacheFile = path.join(this.directory, 'markdown-cache.json');
      const storedCache = await this.readJSON(cacheFile);
      const cache = storedCache && storedCache.version === 1 && storedCache.memos && typeof storedCache.memos === 'object' && !Array.isArray(storedCache.memos) ? storedCache : { version: 1, memos: {} };
      const listing = async folder => new Set(await this.io.readdir(path.join(this.directory, folder)).catch(error => { if (error.code === 'ENOENT') return []; throw error; }));
      const memoFiles = await listing('Memos'), trashFiles = await listing('Trash'), attachments = await listing('attachments');
      const attachmentPattern = /^[a-zA-Z0-9-]{1,100}-\d+\.(?:jpg|png|webp|gif)$/;
      const removeAttachment = async name => { if (!attachmentPattern.test(name)) return; await this.io.unlink(path.join(this.directory, 'attachments', name)).catch(error => { if (error.code !== 'ENOENT') throw error; }); attachments.delete(name); };
      let changed = storedCache === undefined;
      for (const memo of state.memos) {
        const text = markdown(memo);
        const imageSignature = memo.images.map(src => src.length + ':' + src.slice(0, 32) + src.slice(-32)).join('|');
        const digest = createHash('sha256').update(text).update('\0').update(imageSignature).digest('hex');
        const known = cache.memos[memo.id];
        const names = memo.images.map((src, index) => { const match = /^data:image\/(jpeg|png|webp|gif);base64,(.+)$/.exec(src); return memo.id + '-' + index + '.' + (match[1] === 'jpeg' ? 'jpg' : match[1]); });
        const fileList = memo.deleted ? trashFiles : memoFiles;
        const otherList = memo.deleted ? memoFiles : trashFiles;
        const ready = known && known.hash === digest && fileList.has(memo.id + '.md') && !otherList.has(memo.id + '.md') && names.every(name => attachments.has(name));
        if (ready) continue;
        let output = text;
        for (let index = 0; index < memo.images.length; index++) {
          const match = /^data:image\/(jpeg|png|webp|gif);base64,(.+)$/.exec(memo.images[index]);
          const name = names[index];
          await atomicWrite(path.join(this.directory, 'attachments', name), Buffer.from(match[2], 'base64'), this.io);
          attachments.add(name);
          output += '\n![笔记图片](../attachments/' + name + ')\n';
        }
        await atomicWrite(path.join(this.directory, memo.deleted ? 'Trash' : 'Memos', memo.id + '.md'), output, this.io);
        fileList.add(memo.id + '.md');
        // Both locations belong to the app; remove only the old projection of this exact record.
        await this.io.unlink(path.join(this.directory, memo.deleted ? 'Memos' : 'Trash', memo.id + '.md')).catch(e => { if (e.code !== 'ENOENT') throw e; });
        otherList.delete(memo.id + '.md');
        if (known) for (const name of known.images || []) if (!names.includes(name)) await removeAttachment(name);
        cache.memos[memo.id] = { hash: digest, images: names };
        changed = true;
      }
      for (const [id, entry] of Object.entries(cache.memos)) {
        if (present.has(id)) continue;
        for (const name of entry.images || []) await removeAttachment(name);
        delete cache.memos[id];
        changed = true;
      }
      for (const id of prior) {
        if (!active.has(id)) await this.io.unlink(path.join(this.directory, 'Memos', id + '.md')).catch(e => { if (e.code !== 'ENOENT') throw e; });
      }
      for(const id of new Set([...allPrior,...previousIds]))if(!present.has(id))for(const folder of ['Memos','Trash'])await this.io.unlink(path.join(this.directory,folder,id+'.md')).catch(error=>{if(error.code!=='ENOENT')throw error;});
      await atomicWrite(path.join(this.directory, 'markdown-manifest.json'), JSON.stringify([...active]), this.io);
      await atomicWrite(path.join(this.directory, 'markdown-all-manifest.json'), JSON.stringify([...present]), this.io);
      if (changed) await atomicWrite(cacheFile, JSON.stringify(cache), this.io);
      this.warning = '';
    } catch (error) { this.warning = '笔记已保存，Markdown 副本生成失败：' + error.message; }
  }
}
module.exports = { FileStore, atomicWrite, markdown };
