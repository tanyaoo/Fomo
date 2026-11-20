window.MemoStore = (() => {
  'use strict';
  if (window.FomoPreviewBridge && typeof window.FomoPreviewBridge.readState === 'function') {
    const readState = () => window.FomoPreviewBridge.readState();
    const save = (base, desired) => window.FomoPreviewBridge.saveState(base, desired);
    const purge = async ids => {
      const state = await readState();
      return save(state, MemoCore.purge(state, ids));
    };
    return { init: readState, readState, readDraft: async () => undefined, draft: async () => undefined, save, purge };
  }
  if (window.memoDesktop) return window.memoDesktop;
  const DB_NAME = 'fomo-replica-v2';
  let db;
  async function open() {
    db = await new Promise((resolve,reject) => {
      const request = indexedDB.open(DB_NAME,1);
      request.onupgradeneeded = () => { request.result.createObjectStore('data'); request.result.createObjectStore('drafts'); };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(Error('请关闭旧版本窗口后重试'));
    });
    db.onversionchange = () => db.close();
  }
  function read(store,key) {
    return new Promise((resolve,reject) => {
      const request = db.transaction(store).objectStore(store).get(key);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
  async function previousState() {
    try {
      if (!indexedDB.databases) return undefined;
      const databases = await indexedDB.databases();
      for (const entry of databases) {
        const name = entry && entry.name;
        if (!name || name === DB_NAME || !name.endsWith('-replica-v2')) continue;
        const value = await new Promise(resolve => {
          const request = indexedDB.open(name, 1);
          request.onupgradeneeded = () => { request.transaction.abort(); };
          request.onerror = () => resolve(undefined);
          request.onsuccess = () => {
            const legacy = request.result;
            if (!legacy.objectStoreNames.contains('data')) { legacy.close(); resolve(undefined); return; }
            const tx = legacy.transaction('data', 'readonly');
            let found;
            tx.oncomplete = () => { legacy.close(); resolve(found); };
            tx.onerror = () => { legacy.close(); resolve(undefined); };
            const get = tx.objectStore('data').get('state');
            get.onsuccess = () => { found = get.result; };
          };
        });
        if (value) return value;
      }
    } catch {}
    return undefined;
  }
  function transaction(store,operation) {
    return new Promise((resolve,reject) => {
      const tx = db.transaction(store,'readwrite');
      let value, error;
      tx.oncomplete = () => resolve(value);
      tx.onabort = () => reject(error || tx.error || Error('数据写入失败'));
      tx.onerror = () => {};
      try { operation(tx.objectStore(store),v => value=v,e => {error=e;tx.abort();}); }
      catch(e) {error=e;tx.abort();}
    });
  }
  async function init(legacy) {
    await open();
    let fallback = await read('data', 'state').catch(() => undefined);
    if (!fallback && !legacy) fallback = await previousState();
    return transaction('data',(store,done,fail) => {
      const request=store.get('state');
      request.onsuccess=() => { try { const original=request.result || fallback || (legacy ? JSON.parse(legacy) : MemoCore.blank()),value=MemoCore.upgrade(original);if(request.result&&(original.version!==4||original.memos.some(m=>m.annotations?.length&&!m.annotationsMigrated)))store.put(original,'before-v4-'+Date.now());store.put(value,'state');done(value); } catch(e) {fail(e);} };
    });
  }
  const save = (base,desired) => transaction('data',(store,done,fail) => {
    const request=store.get('state');
    request.onsuccess=() => { try {const value=MemoCore.merge(base,desired,MemoCore.validate(request.result));store.put(value,'state');done(value);} catch(e) {fail(e);} };
  });
  const draft = (key,value) => transaction('drafts',(store,done) => {store.put(value,key);done(value);});
  const purge = ids => transaction('data',(store,done,fail) => {
    const request=store.get('state');
    request.onsuccess=() => { try { const next=MemoCore.purge(MemoCore.validate(request.result),ids);store.put(next,'state');done(next); } catch(e) { fail(e); } };
  });
  return {init,save,draft,purge,readState:() => read('data','state'),readDraft:key => read('drafts',key)};
})();
