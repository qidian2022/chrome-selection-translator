export const DEFAULT_MODEL = 'gpt-6-luna';
export const ENDPOINT = 'https://api.openai.com/v1/responses';
export const providers = {
  openai: {endpoint: ENDPOINT, model: DEFAULT_MODEL},
  deepseek: {endpoint: 'https://api.deepseek.com/chat/completions', model: 'deepseek-flash'},
  custom: {model: ''}
};

export function endpointFor(provider, address = '') {
  if (!Object.hasOwn(providers, provider)) throw new Error('请选择 API 服务商。');
  if (provider !== 'custom') return providers[provider].endpoint;
  let url;
  try { url = new URL(address.trim()); } catch { throw new Error('请填写完整的 API 地址，例如 https://example.com/v1。'); }
  if ((url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(url.hostname))) ||
      url.username || url.password || url.search || url.hash || url.hostname.includes('*'))
    throw new Error('请填写 HTTPS 接口地址。本机 localhost 和 127.0.0.1 可用 HTTP。地址中请勿包含账号、密钥或查询参数。');
  const base = url.href.replace(/\/+$/, '');
  return base.endsWith('/chat/completions') ? base : base + '/chat/completions';
}

export function hostPattern(endpoint) {
  const {protocol, hostname} = new URL(endpoint);
  return protocol + '//' + hostname + '/*';
}

export function localService(endpoint) {
  return ['localhost', '127.0.0.1'].includes(new URL(endpoint).hostname);
}
