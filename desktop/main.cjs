'use strict';
const { app, BrowserWindow, Menu, Tray, nativeImage, globalShortcut, ipcMain, protocol, net, shell, dialog, session, screen, Notification } = require('electron');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const fs = require('node:fs/promises');
const fsSync = require('node:fs');
const { spawn } = require('node:child_process');
const { atomicWrite } = require('./file-store.cjs');
const {installEditContextMenu}=require('./edit-context-menu.cjs');
const { StorageLocation } = require('./storage-location.cjs');
const { NoteWindows } = require('./note-windows.cjs');
const { ComposeWindow } = require('./compose-window.cjs');
const { migrateLegacyProfile, adoptLegacyCryptKey } = require('./profile-migration.cjs');
const { Updates, RELEASES } = require('./updates.cjs');
const { AiSettings } = require('./ai-settings.cjs');
const { runAgent } = require('./ai-agent.cjs');
const { buildLibraryContext } = require('./ai-library-context.cjs');
const obsidianSync = require('./obsidian-sync.cjs');
const {createBridgeClient}=require('./obsidian-bridge-client.cjs');
const {validateVaultFolder}=require('./obsidian-vault-scope.cjs');
const MemoCore = require('../dist/core.js');
require('./ai-conversations.cjs').installConversationStore(require('./file-store.cjs').FileStore);
const { importBackup } = require('./source-import.cjs');
const { SCHEMES: NOTE_SCHEMES, parseNoteLink, findNoteLink } = require('./protocol-links.cjs');
// Keep the legacy origin for the main window so existing pinned tags, folds and
// Keep the memo-flow origin for existing localStorage. New note links use fomo://.
const HOME = 'memo-flow://app/index.html';
const REPOSITORY = 'https://github.com/tanyaoo/Fomo';
protocol.registerSchemesAsPrivileged([{ scheme: 'fomo', privileges: { standard: true, secure: true, supportFetchAPI: true } },{ scheme: 'writeboom', privileges: { standard: true, secure: true, supportFetchAPI: true } },{ scheme: 'memo-flow', privileges: { standard: true, secure: true, supportFetchAPI: true } }]);
let window, tray, store, location, noteWindows, changingLocation = false, allowClose = false, closeRequested = false;
let updates, updateTimer, updatePreparing = false, installApproved = false, updateRequestId='';
let explicitQuit = false;
let closeToTray=false, trayAction='compose', newNoteCloseAfterPublish=false, preferencesFile='';
let preferencesWrites=Promise.resolve();
let pendingNoteLink=findNoteLink(process.argv), noteLinkReady=false;
function updateClientPreferences(patch){
 const pending=preferencesWrites.then(async()=>{const next={closeToTray,trayAction,newNoteCloseAfterPublish,...patch};await atomicWrite(preferencesFile,JSON.stringify(next,null,2));closeToTray=next.closeToTray;trayAction=next.trayAction;newNoteCloseAfterPublish=next.newNoteCloseAfterPublish===true;return next;});
 preferencesWrites=pending.catch(()=>{});return pending;
}

let reviewTimer=null;
// Set the profile before Chromium and its single-instance lock initialize.
const appDataDirectory = app.getPath('appData');
let userDirectory = !app.isPackaged && process.env.MEMOFLOW_DATA_DIR
  ? path.resolve(process.env.MEMOFLOW_DATA_DIR) : path.join(appDataDirectory, 'Fomo');
if (!( !app.isPackaged && process.env.MEMOFLOW_DATA_DIR)) {
  const migration = migrateLegacyProfile({ appData: appDataDirectory, target: userDirectory, legacyNames: ['WriteBoom', 'Memo Flow'] });
  userDirectory = migration.directory;
  if (migration.error) console.error('Fomo 数据迁移失败，继续使用旧目录：' + migration.error.message);
  const cryptMigration = adoptLegacyCryptKey({ appData: appDataDirectory, target: userDirectory, legacyNames: ['WriteBoom', 'Memo Flow'] });
  if (cryptMigration.error) console.error('Fomo API Key 加密配置迁移失败：' + cryptMigration.error.message);
}
app.setPath('userData', userDirectory);
preferencesFile=path.join(userDirectory,'preferences.json');
const aiSettings=new AiSettings(path.join(userDirectory,'ai-settings.json'));
// Isolated regression profiles must not contend with one another or with a
// developer's open Fomo window when release checks run back to back.
const locked = process.env.MEMOFLOW_ALLOW_MULTI_INSTANCE === '1' ? true : app.requestSingleInstanceLock();
if (!locked) app.quit();
else {
  app.setAppUserModelId('com.tanyaoo.fomo');
  app.on('second-instance', (_event, argv) => { const link=findNoteLink(argv); if(link.matched){pendingNoteLink=link;handleNoteLink(link);}else focusEditor(); });
  app.on('open-url', (event,url) => { event.preventDefault(); const link=parseNoteLink(url); if(link.matched){pendingNoteLink=link;handleNoteLink(link);} });
  app.on('activate', () => focusEditor());
  app.on('window-all-closed', () => app.quit());
  app.on('will-quit', () => globalShortcut.unregisterAll());
  app.whenReady().then(start).catch(error => { dialog.showErrorBox('Fomo 启动失败', error.message); app.quit(); });
}

function scheduleReviewNotification(settings) {
  if (reviewTimer) { clearTimeout(reviewTimer); reviewTimer = null; }
  if (!settings || settings.enabled !== true || !/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(String(settings.at || ''))) return;
  const [hour, minute] = String(settings.at).split(':').map(Number);
  const now = new Date();
  const next = new Date(now);
  next.setHours(hour, minute, 0, 0);
  if (next <= now) next.setDate(next.getDate() + 1);
  reviewTimer = setTimeout(() => {
    try {
      if (Notification.isSupported()) {
        const notification = new Notification({ title: 'Fomo 每日回顾', body: '花几分钟回看今天以前记录的想法。', silent: false });
        notification.on('click', () => {
          if (!window || window.isDestroyed()) return;
          if (window.isMinimized()) window.restore();
          window.show(); window.focus();
          window.webContents.send('desktop:open-review');
        });
        notification.show();
      }
    } catch (error) { console.error('每日回顾提醒失败', error); }
    scheduleReviewNotification(settings);
  }, Math.min(next.getTime() - now.getTime(), 2147483647));
}

function focusEditor() {
  if (changingLocation) return;
  if (!window || window.isDestroyed()) return;
  if (window.isMinimized()) window.restore();
  window.show(); window.focus();
  window.webContents.send('desktop:focus-editor');
}
function showMainWindow(){
  if(!window||window.isDestroyed())return false;
  if(window.isMinimized())window.restore();
  window.show();window.focus();
  return true;
}
function handleNoteLink(link){
  if(!link?.matched||!window||window.isDestroyed()||!noteLinkReady){pendingNoteLink=link;return false;}
  pendingNoteLink=null;showMainWindow();
  console.log('打开笔记链接：'+(link.id||'无效'));
  if(link.id)window.webContents.send('desktop:open-memo',link.id);
  else window.webContents.send('desktop:open-note-link-error');
  return true;
}
function handle(channel, callback) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== HOME) throw Error('拒绝非应用窗口的请求');
    return callback(...args);
  });
}
async function start() {
  if(app.isPackaged)for(const scheme of NOTE_SCHEMES){try{app.setAsDefaultProtocolClient(scheme);}catch(error){console.error('注册笔记链接失败：'+error.message);}}
  await fs.mkdir(userDirectory, { recursive: true });
  try{const p=JSON.parse(await fs.readFile(preferencesFile,'utf8'));closeToTray=p.closeToTray===true;if(['compose','main','agent','none'].includes(p.trayAction))trayAction=p.trayAction;newNoteCloseAfterPublish=p.newNoteCloseAfterPublish===true;}catch{}
  location = new StorageLocation(userDirectory);
  store = await location.open();
  if (!app.isPackaged && process.argv.includes('--self-test')) {
    dialog.showOpenDialog = async () => {
      // Use a sibling of the isolated profile, like a user's separate documents folder.
      const selected = path.join(path.dirname(userDirectory), path.basename(userDirectory) + '-custom-notes');
      await fs.mkdir(selected, { recursive: true });
      return { canceled: false, filePaths: [selected] };
    };
  }
  const serveApp = async request => {
    const url = new URL(request.url);
    const file = decodeURIComponent(url.pathname).slice(1);
    if (url.host !== 'app' || !['index.html','core.js','store.js','tag-sidebar.js','export.js','app.js','style.css','classic.css','reference.css','fidelity.css','sidebar.css','numbers-font.css','ui-font.css','HarmonyOS_Sans_SC_Regular.ttf','HarmonyOS_Sans_SC_Bold.ttf','cards.css','share.css','editor.js','editor-tags.js','icons.js','classic.js','markup.js','interactions.js','note.html','note.js'].includes(file)) return new Response('Not found', { status: 404 });
    const response = await net.fetch(pathToFileURL(path.join(app.getAppPath(), 'dist', file)).toString());
    if (!file.endsWith('.html')) return response;
    const version = encodeURIComponent(app.getVersion());
    const body = (await response.text()).replace(/(\b(?:src|href)=")([^"]+\.(?:js|css))(")/g, `$1$2?v=${version}$3`);
    return new Response(body, { status: response.status, headers: { ...Object.fromEntries(response.headers), 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
  };
  protocol.handle('fomo', serveApp);
  protocol.handle('writeboom', serveApp);
  protocol.handle('memo-flow', serveApp);
  // Custom-scheme assets can survive an in-place update in Chromium's cache.
  // Clear the old renderer cache before loading the new app bundle.
  try { await session.defaultSession.clearCache(); } catch {}
  try { await session.defaultSession.clearCodeCaches({ urls: [] }); } catch {}
  session.defaultSession.setPermissionRequestHandler((contents, permission, done) => done(contents === window?.webContents && contents.getURL() === HOME && (permission === 'clipboard-sanitized-write' || permission === 'media')));
  session.defaultSession.setPermissionCheckHandler((contents, permission) => contents === window?.webContents && contents.getURL() === HOME && (permission === 'clipboard-sanitized-write' || permission === 'media'));
  session.defaultSession.webRequest.onHeadersReceived((details, done) => {
    const headers = {
      ...details.responseHeaders,
      'Content-Security-Policy': ["default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' data: blob:; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-src 'none'; form-action 'none'"]
    };
    if (/^(?:memo-flow|fomo|writeboom):/i.test(details.url)) {
      headers['Cache-Control'] = ['no-store, no-cache, must-revalidate'];
      headers.Pragma = ['no-cache'];
      headers.Expires = ['0'];
    }
    done({ responseHeaders: headers });
  });
  let savedWindow;
  try { savedWindow = JSON.parse(await fs.readFile(path.join(userDirectory, 'window.json'), 'utf8')); } catch {}
  const primaryArea = screen.getPrimaryDisplay().workArea;
  let windowWidth = Math.min(primaryArea.width, Math.max(400, Number(savedWindow?.width) || 1208));
  let windowHeight = Math.max(650, Math.min(primaryArea.height, Number(savedWindow?.height) || 900));
  let windowX = Number.isFinite(savedWindow?.x) ? Math.round(savedWindow.x) : undefined;
  let windowY = Number.isFinite(savedWindow?.y) ? Math.round(savedWindow.y) : undefined;
  let windowArea = primaryArea;
  if (windowX !== undefined && windowY !== undefined) {
    windowArea = screen.getDisplayMatching({ x: windowX, y: windowY, width: windowWidth, height: windowHeight }).workArea;
    windowWidth = Math.min(windowWidth, windowArea.width);
    windowHeight = Math.min(windowHeight, windowArea.height);
    windowX = Math.min(Math.max(windowX, windowArea.x), windowArea.x + windowArea.width - 200);
    windowY = Math.min(Math.max(windowY, windowArea.y), windowArea.y + windowArea.height - 100);
  } else {
    windowX = undefined; windowY = undefined;
  }
  window = new BrowserWindow({ width: windowWidth, height: windowHeight, ...(windowX !== undefined && windowY !== undefined ? { x: windowX, y: windowY } : {}),
    minWidth: 400, minHeight: 600, title: 'Fomo', backgroundColor: '#fafafa', show: false,
    ...(process.platform === 'win32' ? {titleBarStyle:'hidden',titleBarOverlay:{color:'#fcfbf6',symbolColor:'#353535',height:32}} : {}),
    autoHideMenuBar: true, icon: path.join(__dirname, 'assets/icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false, webSecurity: true, backgroundThrottling: !(!app.isPackaged && process.argv.includes('--self-test')) }
  });
  installEditContextMenu(window);
  const windowFile = path.join(userDirectory, 'window.json');
  let windowSaveTimer;
  const currentWindowState = () => {
    if (!window || window.isDestroyed()) return null;
    return { ...window.getNormalBounds(), maximized: window.isMaximized() };
  };
  const writeWindowState = () => {
    const state = currentWindowState();
    return state ? atomicWrite(windowFile, JSON.stringify(state)).catch(() => {}) : Promise.resolve();
  };
  const scheduleWindowState = () => {
    clearTimeout(windowSaveTimer);
    windowSaveTimer = setTimeout(() => { windowSaveTimer = null; writeWindowState(); }, 350);
  };
  for (const event of ['resize', 'move', 'maximize', 'unmaximize']) window.on(event, scheduleWindowState);
  if (savedWindow?.maximized === true) window.maximize();
  const zoomBy = delta => {
    const current = window.webContents.getZoomLevel();
    window.webContents.setZoomLevel(Math.max(-5, Math.min(5, current + delta)));
  };
  // Windows reports Ctrl++ as Ctrl+Shift+= (key '+') and Ctrl+= as key '='.
  // Handle both here because Electron's default zoomIn accelerator only matches Plus.
  window.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || !input.control || input.alt || input.meta) return;
    const key = input.key;
    if (key === '+' || key === '=' || key === 'Add') { event.preventDefault(); zoomBy(0.5); }
    else if (key === '-' || key === 'Subtract') { event.preventDefault(); zoomBy(-0.5); }
    else if (key === '0') { event.preventDefault(); window.webContents.setZoomLevel(0); }
  });
  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:\/\//.test(url)) shell.openExternal(url).catch(() => {});
    return { action: 'deny' };
  });
  window.webContents.on('will-navigate', (event, url) => { if (url !== HOME) event.preventDefault(); });
  window.webContents.on('will-attach-webview', event => event.preventDefault());
  noteWindows=new NoteWindows({root:app.getAppPath(),getStore:()=>store,onCompose:focusEditor,onSaved:id=>{if(window&&!window.isDestroyed())window.webContents.send('desktop:note-saved',id);},onEdit:id=>{if(window.isMinimized())window.restore();window.show();window.focus();window.webContents.send('desktop:open-memo',id);}});
  const composeWindow=new ComposeWindow({root:app.getAppPath(),getStore:()=>store,boundsFile:path.join(userDirectory,'compose-window.json'),getNewNoteCloseAfterPublish:()=>newNoteCloseAfterPublish,onShowPublished:(id,bounds)=>noteWindows.open(id,false,bounds),onSaved:id=>{noteWindows.notify();if(window&&!window.isDestroyed())window.webContents.send('desktop:note-saved',id);}});
  const devWatchers = [];
  if (!app.isPackaged && process.env.WRITEOOM_DEV_PREVIEW === '1') {
    let reloadTimer = null, srcTimer = null, building = false;
    const reload = () => {
      clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        if (window && !window.isDestroyed()) window.webContents.reloadIgnoringCache();
      }, 180);
    };
    const rebuild = () => {
      clearTimeout(srcTimer);
      srcTimer = setTimeout(() => {
        if (building) return;
        building = true;
        const child = spawn(process.execPath, [path.join(app.getAppPath(), 'scripts/build-editor.cjs')], {
          cwd: app.getAppPath(), stdio: 'inherit',
          env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' }
        });
        child.on('exit', code => { building = false; if (code === 0) reload(); });
      }, 320);
    };
    try {
      devWatchers.push(fsSync.watch(path.join(app.getAppPath(), 'dist'), { recursive: true }, reload));
      devWatchers.push(fsSync.watch(path.join(app.getAppPath(), 'src'), { recursive: true }, rebuild));
    } catch (error) {
      console.error('开发预览监听失败：' + error.message);
    }
  }
  window.once('closed',()=>{clearTimeout(windowSaveTimer);windowSaveTimer=null;devWatchers.forEach(watcher=>watcher.close());composeWindow.close();noteWindows.close();});
  window.on('close', event => {
    if (closeToTray && !explicitQuit && !allowClose && !changingLocation) { event.preventDefault(); window.hide(); return; }
    if (updatePreparing) { event.preventDefault(); return; }
    if (allowClose) return;
    event.preventDefault();
    if (changingLocation) return;
    if (!closeRequested) { closeRequested = true; window.webContents.send('desktop:prepare-close'); }
  });
  const { NsisUpdater } = require('./updater-runtime.cjs');
  const updater = new NsisUpdater();
  updater.installDirectory = path.dirname(app.getPath('exe'));
  const testUpdates = !app.isPackaged && process.argv.includes('--self-test') && process.env.MEMOFLOW_TEST_PHASE === 'updates';
  updates = new Updates({ updater, directory: userDirectory, version: app.getVersion(), enabled: (app.isPackaged && process.platform === 'win32') || testUpdates, notify: value => {
    if (!window.isDestroyed()) window.webContents.send('desktop:update-state', value);
    if (value.phase === 'error' && installApproved) { installApproved = false; allowClose = false; if(!window.isDestroyed())window.webContents.send('desktop:update-aborted'); }
  } });
  await updates.init();
  if (testUpdates) await require('../scripts/update-fixture.cjs')({updater,userDirectory});
  handle('desktop:update-status', () => updates.status());
  handle('desktop:update-check', () => updates.check());
  handle('desktop:update-download', () => updates.download());
  handle('desktop:update-preference', auto => updates.preference(auto));
  const prepareUpdate = () => {
    if (noteWindows.hasPendingEdits()) throw Error('请先保存或取消独立笔记窗口中的修改，再安装更新');
    if (changingLocation || closeRequested || updatePreparing || installApproved) throw Error('请等待当前操作结束');
    updates.prepare(); updatePreparing = true;
    const requestId=updateRequestId=require('node:crypto').randomUUID();
    window.webContents.send('desktop:prepare-update',requestId);
    updateTimer = setTimeout(() => { if(updateRequestId!==requestId)return;updateRequestId='';updatePreparing = false; updates.cancelPrepare(); window.webContents.send('desktop:update-aborted'); }, 30000);
    return updates.status();
  };
  handle('desktop:update-install', prepareUpdate);
  handle('desktop:update-prepared', async (ok,requestId) => {
    if (!updatePreparing||requestId!==updateRequestId) return false;
    updateRequestId='';
    clearTimeout(updateTimer);
    if (ok !== true) { updatePreparing = false; updates.cancelPrepare(); window.webContents.send('desktop:update-aborted'); return false; }
    try {
      await store.tail;
      if (noteWindows.hasPendingEdits()) throw Error('独立笔记窗口仍有未保存的修改');
      clearTimeout(windowSaveTimer); windowSaveTimer = null;
      await writeWindowState();
      updatePreparing = false; installApproved = true; allowClose = true;
      updates.install();
      if (updates.status().phase === 'error') { installApproved = false; allowClose = false; window.webContents.send('desktop:update-aborted'); }
      return true;
    } catch {
      updatePreparing = false; installApproved = false; allowClose = false; updates.cancelPrepare(); window.webContents.send('desktop:update-aborted'); return false;
    }
  });
  handle('desktop:finish-close', async ok => {
    closeRequested = false;
    if (ok!==true) { explicitQuit=false; await dialog.showMessageBox(window, { type: 'warning', title: '草稿尚未安全保存', message: '请先保存笔记或复制输入内容，再关闭应用。' }); return; }
    if (noteWindows.hasPendingEdits()) { explicitQuit=false; await dialog.showMessageBox(window, { type: 'warning', title: '独立笔记尚未保存', message: '请先保存或取消独立笔记窗口中的修改，再退出应用。' });noteWindows.focusPending();return false; }
    clearTimeout(windowSaveTimer); windowSaveTimer = null;
    await store.tail;
    await writeWindowState();
    allowClose = true; window.close();
  });
  const accessStore = callback => { if (changingLocation) throw Error('正在迁移数据，请稍候'); if(installApproved)throw Error('正在安装更新，请稍候'); return callback(store); };
  handle('memo:init', () => accessStore(current => current.init()));
  handle('memo:save', async (base, desired) => {const saved=await accessStore(current => current.save(base, desired));noteWindows.notify();composeWindow.notifyPreferences();return saved;});
  handle('desktop:open-note',(id,floating)=>noteWindows.open(id,floating));
  handle('desktop:detach-composer',payload=>composeWindow.detachDraft(payload));
  handle('desktop:set-titlebar-theme',(dark,dimmed=false)=>{if(typeof dark!=='boolean'||typeof dimmed!=='boolean')throw Error('窗口主题参数无效');if(process.platform==='win32')window.setTitleBarOverlay({color:dimmed?(dark?'#0b0b0b':'#979693'):(dark?'#121212':'#fcfbf6'),symbolColor:dimmed?(dark?'#777777':'#666562'):(dark?'#d4d4d4':'#353535'),height:32});});
  handle('desktop:set-close-to-tray',async value=>{return (await updateClientPreferences({closeToTray:value===true})).closeToTray;});
  handle('desktop:set-tray-action',async value=>{if(!['compose','main','agent','none'].includes(value))throw Error('托盘操作无效');return (await updateClientPreferences({trayAction:value})).trayAction;});
  handle('desktop:set-new-note-close-after-publish',async value=>{if(typeof value!=='boolean')throw Error('新建笔记窗口行为无效');return (await updateClientPreferences({newNoteCloseAfterPublish:value})).newNoteCloseAfterPublish;});
  handle('desktop:set-auto-launch',enabled=>{if(!app.isPackaged||process.platform!=='win32')throw Error('开机自启仅安装版 Windows 应用可设置');if(typeof enabled!=='boolean')throw Error('开机自启参数无效');app.setLoginItemSettings({openAtLogin:enabled,path:process.execPath});const actual=app.getLoginItemSettings({path:process.execPath}).openAtLogin;if(actual!==enabled)throw Error('系统未接受开机自启设置');return actual;});
  handle('ai:get-settings',()=>aiSettings.publicSettings());
  handle('ai:save-settings',payload=>aiSettings.save(payload));
  handle('ai:test',payload=>aiSettings.test(payload));
  handle('memo:import-backup',options=>importBackup(window,options));
  handle('ai:complete',payload=>aiSettings.complete(payload));
  ipcMain.handle('ai:cancel',(event,requestId)=>{
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== HOME) throw Error('forbidden');
    return aiSettings.cancel(requestId);
  });
  ipcMain.handle('ai:cancel-stream',event=>{
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== HOME) throw Error('forbidden');
    return aiSettings.cancelLatest();
  });
  ipcMain.handle('ai:stream', async (event, payload) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== HOME) throw Error('forbidden');
    const requestId = typeof payload?.requestId === 'string' ? payload.requestId : '';
    return aiSettings.stream(payload, delta => { if (requestId) event.sender.send('ai:stream:chunk', { requestId, delta }); });
  });
  ipcMain.handle('ai:agent', async (event, payload) => {
    if (event.sender !== window.webContents || event.senderFrame !== window.webContents.mainFrame || event.senderFrame.url !== HOME) throw Error('forbidden');
    const requestId = typeof payload?.requestId === 'string' ? payload.requestId : '';
    return runAgent(aiSettings, payload, async query => {
      const state = await accessStore(current => current.readState());
      return MemoCore.semanticSearch(state.memos, query, {limit:5}).map(({memo})=>({id:memo.id,created:memo.created,content:String(memo.content||'').slice(0,1000)}));
    }, value => { if(requestId && !event.sender.isDestroyed()) event.sender.send('ai:agent:event', {requestId,...value}); }, async question => {
      const state=await accessStore(current=>current.readState());return buildLibraryContext(state.memos,question);
    });
  });
  handle('desktop:schedule-review', settings => { scheduleReviewNotification(settings); return true; });
  handle('memo:read', () => accessStore(current => current.readState()));
  handle('memo:draft', value => accessStore(current => current.draft(value)));
  handle('memo:read-draft', () => accessStore(current => current.readDraft()));
  handle('ai:read-conversations', () => accessStore(current => current.readAiConversations()));
  handle('ai:save-conversations', value => accessStore(current => current.saveAiConversations(value)));
  handle('desktop:backup-info', () => accessStore(current => current.backupInfo()));
  handle('desktop:backup-configure', value => accessStore(current => current.configureBackups(value)));
  handle('desktop:backup-now', () => accessStore(current => current.backupNow()));
  handle('desktop:backup-preview', id => accessStore(current => current.previewBackup(id)));
  handle('desktop:backup-delete', id => accessStore(current => current.deleteBackup(id)));
  handle('desktop:backup-restore-ai-conversations', request => accessStore(current => current.restoreAiConversationBackup(request)));
  handle('desktop:backup-restore', async request => { const result=await accessStore(current => current.restoreBackup(request));noteWindows.notify();composeWindow.notifyPreferences();return result; });
  handle('memo:purge', async ids => { const next=await accessStore(current => current.purge(ids));noteWindows.notify();return next; });
  handle('desktop:storage-info', () => accessStore(current => current.storageInfo()));
  let obsidianPreview=null,obsidianBridge=null,obsidianGeneration=0;
  handle('desktop:obsidian-connect', code=>{
    if(changingLocation)throw Error('同步正在进行，请稍候');
    obsidianGeneration++;obsidianPreview=null;obsidianBridge=null;
    if(typeof code!=='string')throw Error('配对码无效');
    const match=/^([0-9]{1,5}):([a-f0-9]{64})$/.exec(code.trim());if(!match)throw Error('配对码无效');
    obsidianBridge=createBridgeClient({port:Number(match[1]),secret:match[2]});return true;
  });
  handle('desktop:obsidian-disconnect',()=>{if(changingLocation)throw Error('同步正在进行，请稍候');obsidianGeneration++;obsidianPreview=null;obsidianBridge=null;return true;});
  handle('desktop:obsidian-preview', async () => {
    const generation=++obsidianGeneration;obsidianPreview=null;
    const selected=await dialog.showOpenDialog(window,{title:'选择 Obsidian 库中的 Fomo 专用文件夹',properties:['openDirectory','dontAddToRecent']});
    if(generation!==obsidianGeneration)throw Error('连接状态已变化，请重新检查');
    if(selected.canceled||!selected.filePaths?.length)return null;
    obsidianPreview=null;
    const scope=await validateVaultFolder(selected.filePaths[0]);
    const bridge=obsidianBridge,capabilities=bridge?await bridge.check(scope.folder):null;
    const enableObsidianTrash=!!capabilities?.trash&&!!capabilities?.deletions;
    const result=await accessStore(current=>obsidianSync.preview(current,scope.folder,bridge?{replaceFile:bridge,registerFile:bridge.register,putAsset:bridge.putAsset,getAsset:bridge.getAsset,getDeletionReceipts:bridge.deletions,trashFile:bridge.trash,enableObsidianTrash}:{}));
    if(bridge&&result.actions.some(action=>action.type==='trash_obsidian')&&(!capabilities.trash||!capabilities.deletions))result.blocker='当前 Obsidian 插件不支持受保护的删除同步，请更新插件后重新连接。';
    if(generation!==obsidianGeneration||bridge!==obsidianBridge)throw Error('连接状态已变化，请重新检查');
    if((result.pendingObsidianTrash?.canCancel||result.pendingObsidianTrash?.canFinalize)&&bridge)obsidianPreview={root:result.root,token:result.token,store,bridge,kind:result.pendingObsidianTrash.canCancel?'cancel-trash':'finalize-trash',id:result.pendingObsidianTrash.id};
    else if(result.canApply&&result.actions.length)obsidianPreview={root:result.root,token:result.token,store,bridge,kind:'sync',enableObsidianTrash};
    else if(result.missingDeletion&&bridge)obsidianPreview={root:result.root,token:result.token,store,bridge,kind:'confirm-missing',id:result.missingDeletion.id};
    else if(result.comparison)obsidianPreview={root:result.root,token:result.token,store,bridge,kind:'conflict',id:result.comparison.id};
    return result;
  });
  handle('desktop:obsidian-confirm-missing',async()=>{
    const pending=obsidianPreview;obsidianPreview=null;if(!pending||pending.kind!=='confirm-missing'||pending.store!==store||pending.bridge!==obsidianBridge||!pending.bridge)throw Error('请先重新检查缺失笔记');
    if(changingLocation||closeRequested||updatePreparing||installApproved)throw Error('请等待当前操作结束并重新检查');changingLocation=true;
    try{await validateVaultFolder(pending.root);const bridge=pending.bridge;if(pending.store!==store||bridge!==obsidianBridge)throw Error('连接状态已变化，请重新检查');await bridge.check(pending.root);return await obsidianSync.confirmMissingDeletion(store,pending.root,pending.token,pending.id,{getDeletionReceipts:bridge.deletions,putAsset:bridge.putAsset,getAsset:bridge.getAsset,registerFile:bridge.register});}
    finally{changingLocation=false;noteWindows.notify();window.webContents.send('desktop:note-saved','');}
  });
  handle('desktop:obsidian-preview-review',async()=>{
    const generation=++obsidianGeneration;obsidianPreview=null;const bridge=obsidianBridge;if(!bridge)throw Error('请先连接 Obsidian 插件');
    const selected=await dialog.showOpenDialog(window,{title:'选择 Obsidian 库中的 Fomo 专用文件夹',properties:['openDirectory','dontAddToRecent']});
    if(generation!==obsidianGeneration||bridge!==obsidianBridge)throw Error('连接状态已变化，请重新检查');if(selected.canceled||!selected.filePaths?.length)return null;
    const scope=await validateVaultFolder(selected.filePaths[0]),caps=await bridge.check(scope.folder);if(!caps.reviewRead||!caps.reviewMerge)throw Error('当前 Obsidian 插件不支持回顾进度同步，请更新插件');
    const options={getReviews:bridge.reviews,mergeReviews:bridge.mergeReviews,getDeletionReceipts:bridge.deletions,putAsset:bridge.putAsset,getAsset:bridge.getAsset,registerFile:bridge.register};
    const result=await accessStore(current=>obsidianSync.previewReviewProgress(current,scope.folder,options));if(generation!==obsidianGeneration||bridge!==obsidianBridge)throw Error('连接状态已变化，请重新检查');
    if(result.toFomo||result.toObsidian)obsidianPreview={root:result.root,token:result.token,store,bridge,kind:'review'};return result;
  });
  handle('desktop:obsidian-apply-review',async()=>{
    const pending=obsidianPreview;obsidianPreview=null;if(!pending||pending.kind!=='review'||pending.store!==store||pending.bridge!==obsidianBridge||!pending.bridge)throw Error('请先重新检查回顾进度');
    if(changingLocation||closeRequested||updatePreparing||installApproved)throw Error('请等待当前操作结束并重新检查');changingLocation=true;
    try{await validateVaultFolder(pending.root);const bridge=pending.bridge;if(pending.store!==store||bridge!==obsidianBridge)throw Error('连接状态已变化，请重新检查');const caps=await bridge.check(pending.root);if(!caps.reviewRead||!caps.reviewMerge)throw Error('插件回顾同步能力已变化，请重新检查');return await obsidianSync.applyReviewProgress(store,pending.root,pending.token,{getReviews:bridge.reviews,mergeReviews:bridge.mergeReviews,getDeletionReceipts:bridge.deletions,putAsset:bridge.putAsset,getAsset:bridge.getAsset,registerFile:bridge.register});}
    finally{changingLocation=false;noteWindows.notify();window.webContents.send('desktop:note-saved','');}
  });
  handle('desktop:obsidian-cancel-trash',async()=>{
    const pending=obsidianPreview;obsidianPreview=null;
    if(!pending||pending.kind!=='cancel-trash'||pending.store!==store||pending.bridge!==obsidianBridge||!pending.bridge)throw Error('请先重新检查同步预览');
    if(changingLocation||closeRequested||updatePreparing||installApproved)throw Error('请等待当前操作结束并重新检查');
    changingLocation=true;
    try{await validateVaultFolder(pending.root);if(pending.store!==store||pending.bridge!==obsidianBridge)throw Error('连接状态已变化，请重新检查');return await obsidianSync.cancelObsidianTrash(store,pending.root,pending.id,{getDeletionReceipts:pending.bridge.deletions,putAsset:pending.bridge.putAsset,getAsset:pending.bridge.getAsset,registerFile:pending.bridge.register,previewToken:pending.token});}
    finally{changingLocation=false;}
  });
  handle('desktop:obsidian-finalize-trash',async()=>{
    const pending=obsidianPreview;obsidianPreview=null;
    if(!pending||pending.kind!=='finalize-trash'||pending.store!==store||pending.bridge!==obsidianBridge||!pending.bridge)throw Error('请先重新检查同步预览');
    if(changingLocation||closeRequested||updatePreparing||installApproved)throw Error('请等待当前操作结束并重新检查');
    changingLocation=true;
    try{await validateVaultFolder(pending.root);if(pending.store!==store||pending.bridge!==obsidianBridge)throw Error('连接状态已变化，请重新检查');return await obsidianSync.finalizeObsidianTrash(store,pending.root,pending.id,pending.token,{getDeletionReceipts:pending.bridge.deletions,putAsset:pending.bridge.putAsset,getAsset:pending.bridge.getAsset,registerFile:pending.bridge.register});}
    finally{changingLocation=false;}
  });
  handle('desktop:obsidian-apply', async () => {
    const pending=obsidianPreview;obsidianPreview=null;
    if(!pending||pending.kind!=='sync'||pending.store!==store||pending.bridge!==obsidianBridge)throw Error('请先重新检查同步预览');
    if(changingLocation||closeRequested||updatePreparing||installApproved)throw Error('请等待当前操作结束并重新检查');
    changingLocation=true;
    try{await validateVaultFolder(pending.root);if(pending.store!==store||pending.bridge!==obsidianBridge)throw Error('连接状态已变化，请重新检查');if(pending.enableObsidianTrash){const capabilities=await pending.bridge.check(pending.root);if(!capabilities.trash||!capabilities.deletions)throw Error('插件删除能力已变化，请重新检查');}return await obsidianSync.apply(store,pending.root,pending.token,pending.bridge?{replaceFile:pending.bridge,registerFile:pending.bridge.register,putAsset:pending.bridge.putAsset,getAsset:pending.bridge.getAsset,getDeletionReceipts:pending.bridge.deletions,trashFile:pending.bridge.trash,enableObsidianTrash:pending.enableObsidianTrash}:{});}
    finally{changingLocation=false;noteWindows.notify();window.webContents.send('desktop:note-saved','');}
  });
  handle('desktop:obsidian-resolve', async choice => {
    const pending=obsidianPreview;obsidianPreview=null;
    if(!pending||pending.kind!=='conflict'||pending.store!==store||pending.bridge!==obsidianBridge)throw Error('请先重新检查冲突预览');
    if(!['fomo','obsidian'].includes(choice))throw Error('冲突处理选择无效');
    if(changingLocation||closeRequested||updatePreparing||installApproved)throw Error('请等待当前操作结束并重新检查');
    changingLocation=true;
    try{await validateVaultFolder(pending.root);if(pending.store!==store||pending.bridge!==obsidianBridge)throw Error('连接状态已变化，请重新检查');return await obsidianSync.resolveConflict(store,pending.root,pending.token,pending.id,choice,pending.bridge?{replaceFile:pending.bridge,putAsset:pending.bridge.putAsset,getAsset:pending.bridge.getAsset,getDeletionReceipts:pending.bridge.deletions}:{});}
    finally{changingLocation=false;noteWindows.notify();window.webContents.send('desktop:note-saved','');}
  });
  handle('desktop:cleanup-attachments', names => accessStore(current => current.cleanupAttachments(names)));
  handle('desktop:attachment-info', () => accessStore(current => current.attachmentInfo()));
  const backupTimer=setInterval(()=>{if(!changingLocation&&!updatePreparing&&!installApproved)store.autoBackup().catch(()=>{});},60000);
  window.once('closed',()=>clearInterval(backupTimer));
  handle('desktop:change-data', async () => {
    if (changingLocation || closeRequested || updatePreparing || installApproved) throw Error('请等待当前操作结束');
    changingLocation = true;
    try {
      const selected = await dialog.showOpenDialog(window, { title: '选择专用空文件夹，现有笔记将自动复制到这里', defaultPath: store.directory, properties: ['openDirectory', 'createDirectory', 'dontAddToRecent'] });
      if (selected.canceled || !selected.filePaths?.length) return { changed: false, directory: store.directory };
      const result = await location.moveTo(selected.filePaths[0]);
      store = location.store;
      return result;
    } finally { changingLocation = false; }
  });
  handle('desktop:info', async () => {
    let lastBackup = '';
    try { lastBackup = JSON.parse(await fs.readFile(path.join(userDirectory, 'backup-history.json'), 'utf8')).lastBackup || ''; } catch {}
    return { version: app.getVersion(), directory: store.directory, warning: store.warning, repository: REPOSITORY, lastBackup, closeToTray, trayAction, newNoteCloseAfterPublish, autoLaunchSupported:app.isPackaged&&process.platform==='win32',autoLaunch:app.isPackaged&&process.platform==='win32'?app.getLoginItemSettings({path:process.execPath}).openAtLogin:false };
  });
  handle('desktop:open-data', async () => { const error = await shell.openPath(store.directory); if (error) throw Error(error); });
  handle('desktop:releases', () => shell.openExternal(RELEASES));
  handle('desktop:share-image', request => require('./share-images.cjs').shareImage(window,request));
  handle('desktop:export', async (name, content) => {
    if (typeof name !== 'string' || !/^[a-zA-Z0-9-]+\.(json|md|html|csv)$/.test(name) || typeof content !== 'string') throw Error('导出参数无效');
    const selected = await dialog.showSaveDialog(window, { title: '导出笔记备份', defaultPath: path.join(app.getPath('documents'), name) });
    if (selected.canceled) return false;
    await atomicWrite(selected.filePath, content);
    if (name.endsWith('.json')) await atomicWrite(path.join(userDirectory, 'backup-history.json'), JSON.stringify({ lastBackup: new Date().toISOString() })).catch(() => {});
    return true;
  });
  const menu = Menu.buildFromTemplate([
    { label: '笔记', submenu: [{ label: '开始记录', accelerator: 'CmdOrCtrl+Alt+N', click: focusEditor }, { label: '设置与备份', click: () => window.webContents.send('desktop:settings') }, { type: 'separator' }, { label: '退出', accelerator: 'Alt+F4', click: () => window.close() }] },
    { label: '编辑', submenu: [{ label: '撤销', accelerator: 'CmdOrCtrl+Z', click: () => window.webContents.send('desktop:editor-command','undo') }, { label: '重做', accelerator: 'CmdOrCtrl+Shift+Z', click: () => window.webContents.send('desktop:editor-command','redo') }, { type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }] },
    { label: '视图', submenu: [{ label: '实际大小', accelerator: 'CmdOrCtrl+0', click: () => window.webContents.setZoomLevel(0) }, { label: '放大', accelerator: 'CmdOrCtrl+=', click: () => zoomBy(0.5) }, { label: '缩小', accelerator: 'CmdOrCtrl+-', click: () => zoomBy(-0.5) }, { role: 'togglefullscreen' }] },
    { label: '帮助', submenu: [{ label: '打开本地数据目录', click: () => shell.openPath(store.directory) }, { label: '检查更新', click: () => { window.webContents.send('desktop:show-updates'); updates.check(); } }, { label: '下载新版 / GitHub Releases', click: () => shell.openExternal(RELEASES) }, { label: '关于 Fomo ' + app.getVersion(), click: () => dialog.showMessageBox(window, { title: 'Fomo', message: 'Fomo ' + app.getVersion(), detail: '独立的本地笔记应用。当前版本支持本地保存和 Markdown 副本。' }) }] }
  ]);
  Menu.setApplicationMenu(menu);
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets/icon.png'));
  tray = new Tray(icon.resize({ width: 20, height: 20 }));
  tray.setToolTip('Fomo · Ctrl+Shift+N 新建笔记');
  const showMain=()=>{if(!window||window.isDestroyed())return;if(window.isMinimized())window.restore();window.show();window.focus();};
  const openSettings=()=>{showMain();window.webContents.send('desktop:settings');};
  const openInsight=()=>{showMain();window.webContents.send('desktop:open-insight');};
  const quitApp=()=>{explicitQuit=true;if(window&&!window.isDestroyed())window.close();else app.quit();};
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '新建笔记', accelerator: 'Ctrl+Shift+N', click: () => composeWindow.open() },
    { label: '打开主界面', accelerator: 'Ctrl+Shift+O', click: showMain },
    { label: '打开洞察', accelerator: 'Alt+Shift+A', click: openInsight },
    { label: '偏好设置', accelerator: 'Ctrl+,', click: openSettings },
    { type: 'separator' },
    { label: '退出', accelerator: 'Ctrl+Q', click: quitApp }
  ]));
  tray.on('click', () => {if(trayAction==='compose')composeWindow.toggle();else if(trayAction==='main')showMain();else if(trayAction==='agent')openInsight();});
  for (const [accelerator,action] of [['CommandOrControl+Shift+N',()=>composeWindow.open()],['CommandOrControl+Shift+O',showMain],['Alt+Shift+A',openInsight],['CommandOrControl+,',openSettings],['CommandOrControl+Q',quitApp],['CommandOrControl+Alt+N',focusEditor]]) {
    try { globalShortcut.register(accelerator,action); } catch {}
  }
  window.once('ready-to-show', () => { window.show(); });
  await window.loadURL(HOME);
  noteLinkReady=true;
  if(pendingNoteLink?.matched){const link=pendingNoteLink;pendingNoteLink=null;handleNoteLink(link);}
  if (app.isPackaged) {
    const initial = setTimeout(() => { if (updates.status().auto) updates.check(); }, 15000);
    const recurring = setInterval(() => { if (updates.status().auto) updates.check(); }, 6 * 60 * 60 * 1000);
    window.once('closed', () => { clearTimeout(initial); clearInterval(recurring); clearTimeout(updateTimer); });
  }
  if (!app.isPackaged && process.argv.includes('--self-test')) {
    require('../scripts/smoke-window.cjs')({ app, window, getStore: () => store, userDirectory, quitApp }).catch(error => { console.error(error); app.exit(1); });
  }
}
