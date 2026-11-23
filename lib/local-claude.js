const fs = require('fs');
const os = require('os');
const path = require('path');

function configPath() {
  return path.join(os.homedir(), '.claude', 'settings.json');
}

/**
 * Read the same Anthropic-compatible provider config that Claude Code uses.
 * The token is returned only to the main process and is never sent to the
 * renderer or written into this app's settings file.
 */
function readClaudeCodeConfig() {
  const file = configPath();
  let parsed = {};
  let fileError = '';
  try {
    parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (err) {
    fileError =
      err?.code === 'ENOENT'
        ? `未找到 ${file}`
        : `无法读取 ${file}：${err?.message || err}`;
  }

  const env = {
    ...process.env,
    ...(parsed && typeof parsed.env === 'object' && parsed.env ? parsed.env : {}),
  };
  const baseUrl = String(env.ANTHROPIC_BASE_URL || '')
    .trim()
    .replace(/\/+$/, '');
  const authToken = String(env.ANTHROPIC_AUTH_TOKEN || '').trim();
  const apiKey = String(env.ANTHROPIC_API_KEY || '').trim();
  const model = String(
    env.ANTHROPIC_MODEL ||
      env.ANTHROPIC_DEFAULT_SONNET_MODEL ||
      env.ANTHROPIC_DEFAULT_OPUS_MODEL ||
      env.ANTHROPIC_DEFAULT_HAIKU_MODEL ||
      env.ANTHROPIC_DEFAULT_FABLE_MODEL ||
      env.ANTHROPIC_DEFAULT_MODEL ||
      'claude-opus-5-5'
  ).trim();

  return {
    ok: !!(authToken || apiKey),
    file,
    baseUrl,
    authToken,
    apiKey,
    model,
    error: authToken || apiKey ? '' : fileError || '本机 Claude Code 配置中未找到 API 凭据',
  };
}

/** Metadata only — never includes the token or API key. */
function inspectClaudeCodeConfig() {
  const config = readClaudeCodeConfig();
  return {
    ok: config.ok,
    file: config.file,
    baseUrl: config.baseUrl,
    model: config.model,
    hasToken: !!(config.authToken || config.apiKey),
    error: config.error || '',
  };
}

module.exports = { configPath, readClaudeCodeConfig, inspectClaudeCodeConfig };
