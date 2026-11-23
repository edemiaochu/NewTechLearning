const fs = require('fs');
const path = require('path');
const { safeStorage } = require('electron');

class SettingsStore {
  constructor(file) {
    this.file = file;
    this.data = {
      apiKeyEnc: '',
      keyHint: '',
      autoRefresh: true,
      proxyMode: 'system',
      proxyUrl: '',
      directSources: [],
      aiProvider: 'local-claude',
      aiModel: 'claude-opus-5-5',
      aiBaseUrl: '',
      createdAt: new Date().toISOString(),
    };
    this.apiKey = '';
    this.secure = false;
  }

  async load() {
    try {
      const raw = fs.readFileSync(this.file, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && typeof parsed === 'object') {
        this.data = { ...this.data, ...parsed };
      }
    } catch {
      // First run.
    }

    try {
      this.secure =
        typeof safeStorage.isAsyncEncryptionAvailable === 'function'
          ? await safeStorage.isAsyncEncryptionAvailable()
          : safeStorage.isEncryptionAvailable();
    } catch {
      this.secure = false;
    }

    if (this.data.apiKeyEnc && this.secure) {
      try {
        if (typeof safeStorage.decryptStringAsync === 'function') {
          const decrypted = await safeStorage.decryptStringAsync(
            Buffer.from(this.data.apiKeyEnc, 'base64')
          );
          this.apiKey = decrypted.result || '';
          if (decrypted.shouldReEncrypt && this.apiKey) {
            const encrypted = await safeStorage.encryptStringAsync(this.apiKey);
            this.data.apiKeyEnc = encrypted.toString('base64');
            this.save();
          }
        } else {
          this.apiKey = safeStorage.decryptString(Buffer.from(this.data.apiKeyEnc, 'base64'));
        }
      } catch {
        this.apiKey = '';
      }
    }

    return this.publicState();
  }

  save() {
    try {
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.tmp`;
      fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2), 'utf8');
      fs.renameSync(tmp, this.file);
    } catch (err) {
      console.error('[settings] save failed:', err.message);
    }
  }

  publicState() {
    const hasKey = !!this.apiKey;
    return {
      hasApiKey: hasKey,
      keyHint: hasKey ? this.data.keyHint || '' : '',
      autoRefresh: this.data.autoRefresh !== false,
      secure: this.secure,
      model: this.data.aiModel || 'claude-opus-5-5',
      aiProvider: ['anthropic', 'deepseek', 'custom', 'local-claude'].includes(
        this.data.aiProvider
      )
        ? this.data.aiProvider
        : 'local-claude',
      aiModel: this.data.aiModel || '',
      aiBaseUrl: this.data.aiBaseUrl || '',
      proxyMode: ['system', 'direct', 'manual'].includes(this.data.proxyMode)
        ? this.data.proxyMode
        : 'system',
      proxyUrl: this.data.proxyUrl || '',
      directSources: Array.isArray(this.data.directSources)
        ? this.data.directSources.filter((id) => typeof id === 'string').slice(0, 32)
        : [],
    };
  }

  getDirectSources() {
    return this.publicState().directSources;
  }

  getProxyConfig() {
    return {
      mode: this.publicState().proxyMode,
      url: this.data.proxyUrl || '',
    };
  }

  getAiConfig() {
    const state = this.publicState();
    return {
      aiProvider: state.aiProvider,
      aiModel: state.aiModel,
      aiBaseUrl: state.aiBaseUrl,
      apiKey: this.getApiKey(),
    };
  }

  getApiKey() {
    return this.apiKey || '';
  }

  async setApiKey(key) {
    const clean = String(key || '').trim();
    if (!clean) {
      this.data.apiKeyEnc = '';
      this.data.keyHint = '';
      this.apiKey = '';
      this.save();
      return this.publicState();
    }

    this.apiKey = clean;
    this.data.keyHint = clean.length > 8 ? `${clean.slice(0, 3)}…${clean.slice(-4)}` : '••••';

    if (this.secure) {
      try {
        this.data.apiKeyEnc =
          typeof safeStorage.encryptStringAsync === 'function'
            ? (await safeStorage.encryptStringAsync(clean)).toString('base64')
            : safeStorage.encryptString(clean).toString('base64');
      } catch {
        // Keep the key for this session only; never persist plaintext.
        this.data.apiKeyEnc = '';
      }
    } else {
      this.data.apiKeyEnc = '';
    }
    this.save();
    return this.publicState();
  }

  update(patch = {}) {
    if (typeof patch.autoRefresh === 'boolean') this.data.autoRefresh = patch.autoRefresh;
    if (['system', 'direct', 'manual'].includes(patch.proxyMode)) {
      this.data.proxyMode = patch.proxyMode;
    }
    if (typeof patch.proxyUrl === 'string') {
      this.data.proxyUrl = patch.proxyUrl.trim().slice(0, 500);
    }
    if (Array.isArray(patch.directSources)) {
      this.data.directSources = [
        ...new Set(
          patch.directSources
            .filter((id) => typeof id === 'string')
            .map((id) => id.trim())
            .filter(Boolean)
        ),
      ].slice(0, 32);
    }
    if (['anthropic', 'deepseek', 'custom', 'local-claude'].includes(patch.aiProvider)) {
      this.data.aiProvider = patch.aiProvider;
    }
    if (typeof patch.aiModel === 'string') {
      this.data.aiModel = patch.aiModel.trim().slice(0, 160);
    }
    if (typeof patch.aiBaseUrl === 'string') {
      this.data.aiBaseUrl = patch.aiBaseUrl.trim().slice(0, 500);
    }
    this.save();
    return this.publicState();
  }
}

module.exports = { SettingsStore };
