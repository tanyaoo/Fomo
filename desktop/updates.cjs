'use strict';
const fs = require('node:fs/promises');
const path = require('node:path');
const { atomicWrite } = require('./file-store.cjs');
const FEED = Object.freeze({ provider: 'github', owner: 'tanyaoo', repo: 'Fomo', private: false, releaseType: 'release' });
const RELEASES = 'https://github.com/tanyaoo/Fomo/releases';
class Updates {
  constructor({ updater, directory, version, enabled, notify = () => {} }) {
    Object.assign(this, { updater, directory, notify, enabled });
    this.file = path.join(directory, 'updates.json');
    this.value = { currentVersion: version, version: '', phase: enabled ? 'idle' : 'disabled', percent: 0, message: enabled ? '尚未检查更新' : '开发预览不检查更新', auto: true, checkedAt: '' };
    this.operation = null;
    updater.autoDownload = false;
    updater.autoInstallOnAppQuit = false;
    updater.allowDowngrade = false;
    updater.allowPrerelease = false;
    updater.disableWebInstaller = true;
    updater.disableDifferentialDownload = true;
    updater.logger = null;
    updater.setFeedURL(FEED);
    updater.on('error', error => this.fail(error));
    updater.on('checking-for-update', () => this.set({ phase: 'checking', message: '正在检查新版…' }));
    updater.on('update-not-available', () => this.set({ phase: 'current', version: '', percent: 0, checkedAt: new Date().toISOString(), message: '已是最新版本' }));
    updater.on('update-available', info => this.set({ phase: 'available', version: info.version, percent: 0, checkedAt: new Date().toISOString(), message: '发现新版本 ' + info.version }));
    updater.on('download-progress', info => this.set({ phase: 'downloading', percent: Math.max(0, Math.min(100, Math.round(info.percent))), message: '正在下载更新…' }));
    updater.on('update-downloaded', info => this.set({ phase: 'ready', version: info.version, percent: 100, message: '新版已下载，可以重启更新' }));
  }
  async init() {
    try { const saved = JSON.parse(await fs.readFile(this.file, 'utf8')); if (typeof saved.auto === 'boolean') this.value.auto = saved.auto; }
    catch (error) { if (error.code !== 'ENOENT') this.value.message = '更新偏好无法读取，使用默认设置'; }
    return this.status();
  }
  status() { return { ...this.value, releases: RELEASES }; }
  set(value) { Object.assign(this.value, value); this.notify(this.status()); }
  fail(error) {
    const code=typeof error?.code==='string'?error.code:'';
    const stage=this.value.phase==='downloading'?'下载':this.value.phase==='installing'?'安装':'检查';
    const known=/^(?:ERR_UPDATER_INVALID_CHECKSUM|ERR_UPDATER_INVALID_SIGNATURE|ERR_UPDATER_WEB_INSTALLER_DISABLED|ERR_UPDATER_LATEST_VERSION_NOT_FOUND|ERR_UPDATER_CHANNEL_FILE_NOT_FOUND|ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|EACCES|EPERM)$/.test(code)?code:'';
    const detail=code==='ERR_UPDATER_INVALID_CHECKSUM'?'安装包校验未通过':code==='ERR_UPDATER_INVALID_SIGNATURE'?'安装包签名校验未通过':/^(?:EACCES|EPERM)$/.test(code)?'没有访问更新文件的权限':/^(?:ETIMEDOUT|ECONNRESET|ECONNREFUSED|ENOTFOUND|EAI_AGAIN)$/.test(code)?'网络连接失败':'请重试或打开安装包页面';
    if(known)console.error('Fomo updater error:',stage,known);
    this.set({ phase: 'error', message: `${stage}更新失败：${detail}。${known?'（'+known+'）':''}` });
  }
  async preference(auto) {
    if (typeof auto !== 'boolean') throw Error('更新设置无效');
    await atomicWrite(this.file, JSON.stringify({ auto }));
    this.set({ auto });
    return this.status();
  }
  async check() {
    if (!this.enabled || this.operation || ['ready', 'preparing', 'installing'].includes(this.value.phase)) return this.status();
    this.operation = (async () => {
      try { await this.updater.checkForUpdates(); }
      catch (error) { this.fail(error); }
    })();
    await this.operation; this.operation = null;
    if (this.value.auto && this.value.phase === 'available') return this.download();
    return this.status();
  }
  async download() {
    if (!this.enabled || this.operation || !['available', 'error'].includes(this.value.phase) || !this.value.version) return this.status();
    this.set({ phase: 'downloading', percent: 0, message: '正在下载更新…' });
    this.operation = this.updater.downloadUpdate().catch(error => this.fail(error));
    await this.operation; this.operation = null;
    return this.status();
  }
  prepare() {
    if (this.value.phase !== 'ready') throw Error('请先下载更新');
    this.set({ phase: 'preparing', message: '正在保存草稿，准备更新…' });
  }
  cancelPrepare() {
    if (this.value.phase === 'preparing') this.set({ phase: 'ready', message: '未安装：草稿尚未保存或应用正在操作，请稍后重试' });
  }
  install() {
    if (!this.enabled || this.value.phase !== 'preparing') throw Error('尚未准备好更新');
    this.set({ phase: 'installing', message: '正在重启并安装新版…' });
    try { this.updater.quitAndInstall(true, true); }
    catch (error) { this.set({ phase: 'ready', message: '无法启动安装程序，请重试或手动下载安装包' }); throw error; }
  }
}
module.exports = { Updates, FEED, RELEASES };
