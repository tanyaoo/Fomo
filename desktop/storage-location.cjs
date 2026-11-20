'use strict';
const fs = require('node:fs/promises');
const { constants } = require('node:fs');
const path = require('node:path');
const Core = require('../dist/core.js');
const { FileStore, atomicWrite } = require('./file-store.cjs');

function contains(parent, child) {
  const relative = path.relative(parent, child);
  return !relative || (!relative.startsWith('..' + path.sep) && relative !== '..' && !path.isAbsolute(relative));
}

class StorageLocation {
  constructor(userDirectory, options = {}) {
    this.userDirectory = path.resolve(userDirectory);
    this.config = path.join(this.userDirectory, 'storage-location.json');
    this.io = options.io || fs;
    this.store = null;
  }
  async open() {
    let config;
    try { config = JSON.parse(await this.io.readFile(this.config, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw Error('存储位置配置无法读取，请保留并检查 ' + this.config + '：' + error.message); }
    if (config !== undefined && (!config || config.version !== 1 || typeof config.directory !== 'string' || !path.isAbsolute(config.directory))) throw Error('存储位置配置无效：' + this.config);
    this.store = new FileStore(config ? config.directory : path.join(this.userDirectory, 'data'), { io: this.io });
    // A disconnected drive must never become an empty replacement notebook.
    if (config) {
      try { await this.store.readState(); }
      catch (error) { throw Error('自定义数据目录无法读取：' + config.directory + '。请重新连接磁盘或恢复此目录后再启动。原数据不会被覆盖。' + error.message); }
    }
    return this.store;
  }
  async moveTo(directory) {
    if (typeof directory !== 'string' || !path.isAbsolute(directory)) throw Error('请选择有效的绝对目录');
    const previous = this.store;
    return previous.serialize(async () => {
      const source = await this.io.realpath(previous.directory);
      const target = await this.io.realpath(directory);
      if (path.relative(source, target) === '') return { changed: false, directory: previous.directory };
      if (contains(source, target) || contains(target, source)) throw Error('新目录不能位于当前数据目录内，也不能包含当前数据目录');
      const userRoot = await this.io.realpath(this.userDirectory);
      if (contains(userRoot, target) || contains(target, userRoot)) throw Error('请选择应用配置目录之外的独立文件夹');
      if (!(await this.io.stat(target)).isDirectory()) throw Error('请选择文件夹');
      if ((await this.io.readdir(target)).length) throw Error('目标文件夹不是空的。请新建一个专用空文件夹，避免覆盖已有内容');
      Core.validate(await previous.readJSON(previous.file));
      const copies = [];
      const copy = async (from, to) => {
        for (const entry of await this.io.readdir(from, { withFileTypes: true })) {
          const input = path.join(from, entry.name), output = path.join(to, entry.name);
          if (entry.isSymbolicLink() || (!entry.isFile() && !entry.isDirectory())) throw Error('数据目录包含链接或特殊文件，暂不支持自动迁移：' + entry.name);
          if (entry.isDirectory()) { await this.io.mkdir(output); await copy(input, output); }
          else { await this.io.copyFile(input, output, constants.COPYFILE_EXCL); copies.push([input, output]); }
        }
      };
      try {
        await copy(source, target);
        for (const [input, output] of copies) {
          const [original, copied] = await Promise.all([this.io.readFile(input), this.io.readFile(output)]);
          if (!original.equals(copied)) throw Error('迁移后的文件校验失败：' + path.basename(output));
        }
        const next = new FileStore(target, { io: this.io });
        await next.readState();
        await next.readDraft();
        // Commit the small configuration last. Failure keeps all writes in the old directory.
        await atomicWrite(this.config, JSON.stringify({ version: 1, directory: target }, null, 2), this.io);
        next.warning = previous.warning;
        this.store = next;
        return { changed: true, directory: target, previousDirectory: previous.directory };
      } catch (error) {
        throw Error('更换位置未完成，仍使用原目录；原数据保留。目标目录可能留有部分副本，请换一个空文件夹重试。原因：' + error.message);
      }
    });
  }
}
module.exports = { StorageLocation };
