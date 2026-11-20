'use strict';

const fs = require('node:fs/promises');
const fsNative = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { createHash, randomBytes } = require('node:crypto');
const { FileStore } = require('../desktop/file-store.cjs');
const Core = require('../dist/core.js');
const { PreviewState } = require('./sidebar-preview-state.cjs');

const root = path.resolve(__dirname, '..');
const profileDirectory = process.env.MEMOFLOW_DATA_DIR ? path.resolve(process.env.MEMOFLOW_DATA_DIR) : path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'Fomo');
const token = randomBytes(24).toString('hex');
let port = 0;
let store;
let storeDirectory = '';
let preview = null;
let previewHtml = '';
let previewRevision = '';
let rebuildTimer;
const cssFiles = ['style.css', 'classic.css', 'reference.css', 'fidelity.css', 'numbers-font.css', 'ui-font.css', 'sidebar.css', 'cards.css', 'share.css'];
const scriptFiles = ['icons.js', 'classic.js', 'core.js', 'markup.js', 'editor.js', 'interactions.js', 'store.js', 'tag-sidebar.js', 'export.js', 'app.js'];

async function buildPreviewDocument(prefix) {
  const dist = path.join(root, 'dist');
  let html = await fs.readFile(path.join(dist, 'index.html'), 'utf8');
  const assets = new Map();
  for (const file of [...cssFiles, ...scriptFiles]) assets.set(file, await fs.readFile(path.join(dist, file), 'utf8'));
  const revisionHash = createHash('sha256');
  for (const [file, content] of assets) revisionHash.update(file).update('\0').update(content).update('\0');
  const revision = revisionHash.digest('hex').slice(0, 20);
  for (const file of cssFiles) {
    const link = `<link rel="stylesheet" href="${file}">`;
    if (!html.includes(link)) throw Error(`主页面缺少样式引用：${file}`);
    // A replacement callback keeps CSS sequences such as `$&` literal.
    html = html.replace(link, () => `<style>\n${assets.get(file)}\n</style>`);
  }
  for (const file of scriptFiles) {
    const source = assets.get(file);
    new Function(source);
    const script = `<script src="${file}"></script>`;
    if (!html.includes(script)) throw Error(`主页面缺少脚本引用：${file}`);
    // Script source frequently contains `$&` and other replacement tokens.
    html = html.replace(script, () => `<script>${source.replace(/<\/script/gi, '<\\/script')}</script>`);
  }
  html = html.replace('</head>', `${htmlBootstrap(prefix, revision)}</head>`);
  return { html, revision };
}

function watchPreviewAssets(prefix) {
  const watcher = fsNative.watch(path.join(root, 'dist'), { persistent: true }, () => {
    clearTimeout(rebuildTimer);
    rebuildTimer = setTimeout(async () => {
      try {
        const next = await buildPreviewDocument(prefix);
        if (next.revision !== previewRevision) {
          previewHtml = next.html;
          previewRevision = next.revision;
          console.log(JSON.stringify({ previewUpdated: true, revision: previewRevision }));
        }
      } catch (error) {
        console.error('实时预览更新失败：' + String(error.message || error).replace(/[\r\n]/g, ' ').slice(0, 200));
      }
    }, 180);
  });
  watcher.on('error', error => console.error('预览文件监听失败：' + String(error.message || error).replace(/[\r\n]/g, ' ').slice(0, 200)));
  return watcher;
}

async function currentStore() {
  let directory = process.env.FOMO_PREVIEW_DATA_DIR || path.join(profileDirectory, 'data');
  if (!process.env.FOMO_PREVIEW_DATA_DIR) {
    const configFile = path.join(profileDirectory, 'storage-location.json');
    let config;
    try { config = JSON.parse(await fs.readFile(configFile, 'utf8')); }
    catch (error) { if (error.code !== 'ENOENT') throw Error('无法读取 Fomo 存储位置配置'); }
    if (config !== undefined && (!config || config.version !== 1 || typeof config.directory !== 'string' || !path.isAbsolute(config.directory))) throw Error('Fomo 存储位置配置无效');
    if (config) directory = config.directory;
  }
  const resolved = path.resolve(directory);
  if (!store || storeDirectory !== resolved) {
    store = new FileStore(resolved);
    storeDirectory = resolved;
  }
  return store;
}

function htmlBootstrap(prefix, initialRevision) {
  const endpoint = `${prefix}/api/state`;
  const versionEndpoint = `${prefix}/api/version`;
  const script = `(function(){
    let snapshot=null,etag='',requesting=null;
    async function fetchSnapshot(){
      if(requesting)return requesting;
      requesting=(async()=>{
        const headers=etag?{'If-None-Match':etag}:{};
        const response=await fetch(${JSON.stringify(endpoint)},{headers,cache:'no-store',credentials:'omit'});
        const badge=document.getElementById('fomoPreviewBadge');if(badge){const changed=response.headers.get('X-Fomo-Desktop-Changed')==='1';badge.textContent=changed?'桌面笔记已更新 · 重启预览可同步':'交互预览 · 保存仅限当前预览服务';badge.title=changed?'预览中已有临时修改，为保留这些修改，桌面更新暂未合并。重启预览会读取最新桌面笔记并清除临时修改。':'保存内容只存在于当前预览服务内存，重启服务后会恢复原始本地数据';}
        if(response.status===304)return null;
        if(!response.ok)throw Error('本机数据暂不可读（HTTP '+response.status+'）');
        const next=await response.json(),nextTag=response.headers.get('ETag')||'';
        const changed=!!etag&&!!nextTag&&nextTag!==etag;
        etag=nextTag;snapshot=next;
        if(changed)window.dispatchEvent(new Event('fomo-preview-state-change'));
        return snapshot;
      })().finally(()=>{requesting=null;});
      return requesting;
    }
    window.FomoPreviewBridge={readOnly:false,readState:async()=>{if(!snapshot)await fetchSnapshot();if(!snapshot)throw Error('本机笔记库暂不可读');return structuredClone(snapshot);},saveState:async(base,desired)=>{const response=await fetch(${JSON.stringify(endpoint)},{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({base,desired}),cache:'no-store',credentials:'omit'});if(response.status===409)throw Error('其他窗口或桌面端已修改预览数据，请刷新后重试');if(!response.ok)throw Error('预览沙盒保存失败（HTTP '+response.status+'）');snapshot=await response.json();etag=response.headers.get('ETag')||'';return structuredClone(snapshot);}};
    setInterval(()=>{fetchSnapshot().catch(()=>{});},2500);
    let codeRevision=${JSON.stringify(initialRevision)};
    async function checkCodeRevision(){try{const response=await fetch(${JSON.stringify(versionEndpoint)},{cache:'no-store',credentials:'omit'});if(!response.ok)return;const next=(await response.json()).revision;if(next&&next!==codeRevision){location.reload();return;}codeRevision=next||codeRevision;}catch(_){}}
    setInterval(checkCodeRevision,1200);
    addEventListener('DOMContentLoaded',()=>{
      const badge=document.createElement('div');badge.id='fomoPreviewBadge';badge.textContent='交互预览 · 保存仅限当前预览服务';badge.setAttribute('role','status');badge.title='保存内容只存在于当前预览服务内存，重启服务后会恢复原始本地数据';
      document.body.appendChild(badge);
    },{once:true});
  })();`;
  const style = `<style>
    #fomoPreviewBadge{position:fixed;right:14px;bottom:12px;z-index:10000;padding:5px 9px;border:1px solid #dedede;border-radius:6px;background:rgba(255,255,255,.94);color:#777;font:12px/1.4 system-ui,sans-serif;box-shadow:0 2px 8px rgba(0,0,0,.08);pointer-events:none}
    body.dark #fomoPreviewBadge{background:rgba(35,35,35,.94);border-color:#484848;color:#bbb}
  </style>`;
  return `${style}<script>${script.replace(/<\/script/gi, '<\\/script')}</script>`;
}

function send(response, status, headers = {}, body = '') {
  response.writeHead(status, { 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', ...headers });
  response.end(body);
}

async function main() {
  const prefix = `/preview/${token}`;
  const initial = await buildPreviewDocument(prefix);
  previewHtml = initial.html;
  previewRevision = initial.revision;
  const watcher = watchPreviewAssets(prefix);

  const server = http.createServer(async (request, response) => {
    try {
      const expectedHost = `127.0.0.1:${port}`;
      const origin = request.headers.origin;
      if (request.headers.host !== expectedHost || (origin && origin !== `http://${expectedHost}`)) return send(response, 403, {}, 'Forbidden');
      if (request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'POST') return send(response, 405, { Allow: 'GET, HEAD, POST' }, 'Method Not Allowed');
      const pathname = new URL(request.url, `http://${expectedHost}`).pathname;
      if (request.method === 'POST' && pathname === `${prefix}/api/state`) {
        const chunks = [];
        let size = 0;
        for await (const chunk of request) {
          size += chunk.length;
          if (size > 128 * 1024 * 1024) return send(response, 413, { 'Cache-Control': 'no-store' }, 'Preview state too large');
          chunks.push(chunk);
        }
        let input;
        try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')); Core.validate(input.base); Core.validate(input.desired); }
        catch { return send(response, 400, { 'Cache-Control': 'no-store' }, 'Invalid preview state'); }
        let next;
        try { next = preview.save(input.base, input.desired); }
        catch { return send(response, 409, { 'Cache-Control': 'no-store' }, 'Preview state changed'); }
        const serialized = JSON.stringify(next);
        const etag = `"${createHash('sha256').update(serialized).digest('hex')}"`;
        return send(response, 200, { 'Cache-Control': 'no-store', ETag: etag, 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': Buffer.byteLength(serialized) }, serialized);
      }
      if (request.method === 'POST') return send(response, 405, { Allow: 'GET, HEAD, POST' }, 'Method Not Allowed');
      if (pathname === `${prefix}/api/state`) {
        const state = preview.refresh(await (await currentStore()).readState());
        const serialized = JSON.stringify(state);
        const etag = `"${createHash('sha256').update(serialized).digest('hex')}"`;
        const headers = { 'Cache-Control': 'no-store', ETag: etag, 'X-Fomo-Desktop-Changed': preview.desktopChanged ? '1' : '0', 'Content-Type': 'application/json; charset=utf-8' };
        if (request.headers['if-none-match'] === etag) return send(response, 304, headers);
        return send(response, 200, { ...headers, 'Content-Length': Buffer.byteLength(serialized) }, request.method === 'HEAD' ? '' : serialized);
      }
      if (pathname === `${prefix}/api/version`) {
        const body = JSON.stringify({ revision: previewRevision });
        return send(response, 200, { 'Cache-Control': 'no-store', ETag: `"${previewRevision}"`, 'Content-Type': 'application/json; charset=utf-8' }, request.method === 'HEAD' ? '' : body);
      }
      if (pathname === prefix || pathname === `${prefix}/` || pathname === `${prefix}/fomo.html`) {
        return send(response, 200, {
          'Cache-Control': 'no-store',
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Security-Policy': "default-src 'self' data: blob:; img-src 'self' data: blob:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; font-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'"
        }, request.method === 'HEAD' ? '' : previewHtml);
      }
      return send(response, 404, {}, 'Not Found');
    } catch (error) {
      console.error('交互预览请求失败：' + String(error.message || error).replace(/[\r\n]/g, ' ').slice(0, 240));
      return send(response, 503, { 'Cache-Control': 'no-store', 'Content-Type': 'text/plain; charset=utf-8' }, '本机笔记库暂不可读');
    }
  });

  const state = await (await currentStore()).readState();
  preview = new PreviewState(state);
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(Number(process.env.FOMO_PREVIEW_PORT) || 0, '127.0.0.1', resolve);
  });
  port = server.address().port;
  const tags = new Set(state.memos.filter(memo => !memo.deleted).flatMap(memo => Core.tagsOf(memo.content)));
  console.log(JSON.stringify({ previewUrl: `http://127.0.0.1:${port}${prefix}/`, notes: state.memos.filter(memo => !memo.deleted).length, tags: tags.size, interactive: true, writes: 'memory-only', bind: '127.0.0.1' }));
  const stop = () => {clearTimeout(rebuildTimer);watcher.close();server.close(() => process.exit(0));};
  process.once('SIGINT', stop);
  process.once('SIGTERM', stop);
}

main().catch(error => {
  console.error('无法启动本机侧栏预览：' + String(error.message || error).replace(/[\r\n]/g, ' ').slice(0, 240));
  process.exitCode = 1;
});
