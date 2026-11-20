'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),{EventEmitter}=require('node:events'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os');
const {Updates,FEED}=require('../desktop/updates.cjs');
async function fixture(t,auto=true){
 const parent=path.resolve(__dirname,'../work');await fs.mkdir(parent,{recursive:true});const directory=await fs.mkdtemp(path.join(parent,'memo-updates-'));t.after(()=>fs.rm(directory,{recursive:true,force:true}));
 const updater=new EventEmitter();updater.setFeedURL=value=>updater.feed=value;updater.checks=0;updater.downloads=0;updater.installs=0;
 updater.checkForUpdates=async()=>{updater.checks++;updater.emit('checking-for-update');updater.emit('update-available',{version:'0.8.2'});};
 updater.downloadUpdate=async()=>{updater.downloads++;updater.emit('download-progress',{percent:50});updater.emit('update-downloaded',{version:'0.8.2'});};
 updater.quitAndInstall=(silent,reopen)=>{assert.equal(silent,true);assert.equal(reopen,true);updater.installs++;};
 const states=[],controller=new Updates({updater,directory,version:'0.8.1',enabled:true,notify:s=>states.push(s)});await controller.init();await controller.preference(auto);return {controller,updater,directory,states};
}
test('updater downloads automatically but never installs without preparation',async t=>{
 const {controller:c,updater:u,states}=await fixture(t);await c.check();assert.equal(c.status().phase,'ready');assert.equal(u.downloads,1);assert.equal(u.installs,0);assert.equal(u.autoInstallOnAppQuit,false);assert.equal(u.allowDowngrade,false);assert.equal(u.allowPrerelease,false);assert.equal(u.disableWebInstaller,true);assert.deepEqual(u.feed,FEED);assert.ok(states.some(s=>s.percent===50));assert.throws(()=>c.install());c.prepare();c.install();assert.equal(u.installs,1);
});
test('manual preference survives restart; manual download and draft failure retry work',async t=>{
 const {controller:c,updater:u,directory}=await fixture(t,false);await c.check();assert.equal(c.status().phase,'available');assert.equal(u.downloads,0);await c.download();c.prepare();c.cancelPrepare();assert.equal(c.status().phase,'ready');assert.equal(u.installs,0);await c.check();assert.equal(u.checks,1);const next=new Updates({updater:new class extends EventEmitter{setFeedURL(){}},directory,version:'0.8.1',enabled:true});await next.init();assert.equal(next.status().auto,false);c.prepare();c.install();assert.equal(u.installs,1);
});
test('offline and failed download stay recoverable; errors never reach installation',async t=>{
 const {controller:c,updater:u}=await fixture(t);u.checkForUpdates=async()=>{throw Error('network with private details');};await c.check();assert.equal(c.status().phase,'error');assert.doesNotMatch(c.status().message,/private details/);assert.throws(()=>c.prepare());u.checkForUpdates=async()=>u.emit('update-available',{version:'0.8.2'});u.downloadUpdate=async()=>{throw Error('checksum mismatch');};await c.check();assert.equal(c.status().phase,'error');assert.equal(u.installs,0);u.downloadUpdate=async()=>u.emit('update-downloaded',{version:'0.8.2'});await c.download();assert.equal(c.status().phase,'ready');
});
test('duplicate checks/downloads do not overlap and disabled builds cannot install',async t=>{
 const {controller:c,updater:u}=await fixture(t,false);let release;u.checkForUpdates=()=>{u.checks++;return new Promise(r=>release=r);};const pending=c.check();await c.check();assert.equal(u.checks,1);release();await pending;c.enabled=false;await c.check();await c.download();assert.equal(u.downloads,0);assert.throws(()=>c.install());await assert.rejects(c.preference('yes'));assert.equal(c.status().auto,false);
});
test('update failures identify the phase and safe error category without exposing private details',async t=>{
 const {controller:c,updater:u}=await fixture(t,false);
 u.checkForUpdates=async()=>{u.emit('checking-for-update');throw Object.assign(Error('private path and token'),{code:'ENOTFOUND'});};
 await c.check();assert.match(c.status().message,/检查更新失败.*网络连接失败.*ENOTFOUND/);assert.doesNotMatch(c.status().message,/private|token/);
 u.checkForUpdates=async()=>u.emit('update-available',{version:'0.8.2'});await c.check();
 u.downloadUpdate=async()=>{throw Object.assign(Error('secret'),{code:'ERR_UPDATER_INVALID_CHECKSUM'});};await c.download();
 assert.match(c.status().message,/下载更新失败.*校验未通过/);assert.doesNotMatch(c.status().message,/secret/);
 u.downloadUpdate=async()=>u.emit('update-downloaded',{version:'0.8.2'});await c.download();assert.equal(c.status().phase,'ready');
});
