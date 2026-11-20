'use strict';
const { safeStorage } = require('electron');
const fs = require('node:fs/promises');
const { atomicWrite } = require('./file-store.cjs');

const DEFAULTS = {
  enabled: false,
  baseUrl: 'https://api.deepseek.com',
  model: 'deepseek-chat',
  encryptedKey: ''
};

function normalizeBase(value) {
  const raw = String(value || DEFAULTS.baseUrl).trim();
  let url;
  try { url = new URL(raw); } catch { throw Error('API 地址格式不正确'); }
  if (!/^https:$/.test(url.protocol) && !(url.protocol === 'http:' && /^(localhost|127\.0\.0\.1|\[::1\])$/.test(url.hostname))) {
    throw Error('API 地址必须是 HTTPS，或本机 localhost');
  }
  return raw.replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
}

function normalizeModel(value) {
  const model = String(value || DEFAULTS.model).trim();
  if (!/^[a-zA-Z0-9._:/-]{1,100}$/.test(model)) throw Error('模型名称格式不正确');
  return model;
}

class AiSettings {
  constructor(file) {
    this.file = file;
    this.write = Promise.resolve();
    this.requests = new Map();
  }

  async readRaw() {
    try {
      const parsed = JSON.parse(await fs.readFile(this.file, 'utf8'));
      return { ...DEFAULTS, ...parsed };
    } catch {
      return { ...DEFAULTS };
    }
  }

  async publicSettings() {
    const data = await this.readRaw();
    const hasKey = Boolean(data.encryptedKey);
    const keyUsable = hasKey && safeStorage.isEncryptionAvailable() ? Boolean(await this.secretKey()) : false;
    return {
      enabled: data.enabled === true,
      baseUrl: data.baseUrl || DEFAULTS.baseUrl,
      model: data.model || DEFAULTS.model,
      hasKey,
      keyUsable,
      encryptionAvailable: safeStorage.isEncryptionAvailable()
    };
  }

  async secretKey() {
    const data = await this.readRaw();
    if (!data.encryptedKey) return '';
    try { return safeStorage.decryptString(Buffer.from(data.encryptedKey, 'base64')); } catch { return ''; }
  }

  async save(payload = {}) {
    const data = await this.readRaw();
    const next = {
      ...data,
      enabled: payload.enabled === true,
      baseUrl: normalizeBase(payload.baseUrl),
      model: normalizeModel(payload.model)
    };
    if (payload.clearKey === true) next.encryptedKey = '';
    else if (typeof payload.key === 'string' && payload.key.trim()) {
      if (!safeStorage.isEncryptionAvailable()) throw Error('系统加密不可用，无法安全保存 API Key');
      next.encryptedKey = safeStorage.encryptString(payload.key.trim()).toString('base64');
    }
    this.write = this.write.then(() => atomicWrite(this.file, JSON.stringify(next, null, 2)));
    await this.write;
    return this.publicSettings();
  }

  async complete(payload = {}) {
    const controller = new AbortController();
    const requestId = typeof payload.requestId === 'string' ? payload.requestId : '';
    if (requestId) this.requests.set(requestId, controller);
    const timer = setTimeout(() => controller.abort(), 90000);
    const started = Date.now();
    try {
      const data = await this.readRaw();
      if (data.enabled !== true) throw Error('请先在设置中启用 AI 服务');
      const key = await this.secretKey();
      if (!key) throw Error(data.encryptedKey ? '已保存的 API Key 无法读取，请在设置 → Fomo AI → 设置中重新填写' : '请先在设置中填写 DeepSeek API Key');
      const messages = Array.isArray(payload.messages) ? payload.messages.slice(-20).map(message => ({
        role: ['system', 'assistant'].includes(message?.role) ? message.role : 'user',
        content: String(message?.content || '').slice(0, 60000)
      })).filter(message => message.content.trim()) : [];
      if (!messages.length) throw Error('AI 请求内容为空');
      const baseUrl = normalizeBase(data.baseUrl);
      const model = normalizeModel(payload.model || data.model);
      const temperature = Math.max(0, Math.min(2, Number(payload.temperature) || 0.4));
      const maxTokens = Math.max(128, Math.min(4000, Number(payload.maxTokens) || 1200));
      if (controller.signal.aborted) throw Object.assign(Error('Aborted'), { name: 'AbortError' });
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: false }),
        signal: controller.signal
      });
      const text = await response.text();
      let body = null;
      try { body = JSON.parse(text); } catch {}
      if (!response.ok) {
        const detail = body?.error?.message || text || `HTTP ${response.status}`;
        throw Error(String(detail).slice(0, 300));
      }
      const content = body?.choices?.[0]?.message?.content;
      if (typeof content !== 'string' || !content.trim()) throw Error('AI 没有返回内容');
      return { content: content.trim(), model, latency: Date.now() - started, usage: body?.usage || null };
    } catch (error) {
      const message = error?.name === 'AbortError' ? 'AI 请求超时' : String(error?.message || error);
      throw Error(message.slice(0, 300));
    } finally {
      clearTimeout(timer);
      if (requestId && this.requests.get(requestId) === controller) this.requests.delete(requestId);
    }
  }

  async stream(payload = {}, onChunk = () => {}) {
    const controller = new AbortController();
    const requestId = typeof payload.requestId === 'string' ? payload.requestId : '';
    if (requestId) this.requests.set(requestId, controller);
    const timer = setTimeout(() => controller.abort(), 120000);
    let content = '';
    try {
      const data = await this.readRaw();
      if (data.enabled !== true) throw Error('请先在设置中启用 AI 服务');
      const key = await this.secretKey();
      if (!key) throw Error(data.encryptedKey ? '已保存的 API Key 无法读取，请在设置 → Fomo AI → 设置中重新填写' : '请先在设置中填写 DeepSeek API Key');
      const messages = Array.isArray(payload.messages) ? payload.messages.slice(-20).map(message => ({
        role: ['system', 'assistant'].includes(message?.role) ? message.role : 'user',
        content: String(message?.content || '').slice(0, 60000)
      })).filter(message => message.content.trim()) : [];
      if (!messages.length) throw Error('AI 请求内容为空');
      const baseUrl = normalizeBase(data.baseUrl);
      const model = normalizeModel(payload.model || data.model);
      const temperature = Math.max(0, Math.min(2, Number(payload.temperature) || 0.4));
      const maxTokens = Math.max(128, Math.min(4000, Number(payload.maxTokens) || 1200));
      if (controller.signal.aborted) throw Object.assign(Error('Aborted'), { name: 'AbortError' });
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model, messages, temperature, max_tokens: maxTokens, stream: true }),
        signal: controller.signal
      });
      if (!response.ok) {
        const text = await response.text();
        let body = null; try { body = JSON.parse(text); } catch {}
        const detail = body?.error?.message || text || `HTTP ${response.status}`;
        throw Error(String(detail).slice(0, 300));
      }
      const reader = response.body?.getReader?.();
      if (!reader) throw Error('当前网络不支持流式响应');
      const decoder = new TextDecoder();
      let buffer = '', usage = null, doneEvent = false;
      const consume = block => {
        const value = block.split(/\r\n|\r|\n/).filter(line => line.startsWith('data:')).map(line => line.slice(5).replace(/^ /, '')).join('\n').trim();
        if (!value) return;
        if (value === '[DONE]') { doneEvent = true; return; }
        let packet; try { packet = JSON.parse(value); } catch { throw Error('AI 返回了无法解析的流式数据'); }
        if (packet.error) throw Error(String(packet.error.message || 'AI 流式请求失败').slice(0, 300));
        if (packet.usage) usage = packet.usage;
        const delta = packet.choices?.[0]?.delta?.content;
        if (typeof delta === 'string' && delta) { content += delta; onChunk(delta); }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        let boundary;
        while ((boundary = /\r\n\r\n|\n\n|\r\r/.exec(buffer))) {
          const block = buffer.slice(0, boundary.index);
          buffer = buffer.slice(boundary.index + boundary[0].length);
          consume(block);
          if (doneEvent) break;
        }
        if (doneEvent) break;
      }
      buffer += decoder.decode();
      if (!doneEvent && buffer.trim()) consume(buffer);
      if (!content.trim()) throw Error('AI 没有返回内容');
      return { content: content.trim(), model, usage };
    } catch (error) {
      const message = error?.name === 'AbortError' ? 'AI 请求超时' : String(error?.message || error);
      throw Error(message.slice(0, 300));
    } finally {
      clearTimeout(timer);
      if (requestId && this.requests.get(requestId) === controller) this.requests.delete(requestId);
    }
  }

  cancel(requestId) {
    if (typeof requestId !== 'string' || !requestId) return false;
    const controller = this.requests.get(requestId);
    if (!controller) return false;
    controller.abort();
    this.requests.delete(requestId);
    return true;
  }

  cancelLatest() {
    const entry = [...this.requests.entries()].at(-1);
    if (!entry) return false;
    const [requestId, controller] = entry;
    this.requests.delete(requestId);
    if (!controller.signal.aborted) controller.abort();
    return true;
  }

  async test(payload = {}) {
    const data = await this.readRaw();
    const baseUrl = normalizeBase(payload.baseUrl || data.baseUrl);
    const model = normalizeModel(payload.model || data.model);
    const key = typeof payload.key === 'string' && payload.key.trim() ? payload.key.trim() : await this.secretKey();
    if (!key) throw Error(data.encryptedKey && !payload.key ? '已保存的 API Key 无法读取，请重新填写' : '请先填写 API Key');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25000);
    const started = Date.now();
    try {
      const response = await fetch(`${baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: '只回复 OK' }],
          max_tokens: 8,
          stream: false
        }),
        signal: controller.signal
      });
      const text = await response.text();
      let body = null;
      try { body = JSON.parse(text); } catch {}
      if (!response.ok) {
        const detail = body?.error?.message || text || `HTTP ${response.status}`;
        throw Error(String(detail).slice(0, 300));
      }
      return {
        ok: true,
        status: response.status,
        latency: Date.now() - started,
        model,
        message: body?.choices?.[0]?.message?.content || '连接成功'
      };
    } catch (error) {
      const message = error?.name === 'AbortError' ? '连接超时' : String(error?.message || error);
      return { ok: false, latency: Date.now() - started, model, message: message.slice(0, 300) };
    } finally {
      clearTimeout(timer);
    }
  }
}

module.exports = { AiSettings, DEFAULTS, normalizeBase, normalizeModel };
