import {providers, endpointFor, hostPattern, localService} from './providers.js';

const $ = id => document.getElementById(id);
let cancel, revision = 0;
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function destination() { return {provider: $('provider').value, customUrl: $('address').value.trim()}; }
async function send(type, fields = {}) {
  const reply = await chrome.runtime.sendMessage({type, ...fields});
  if (!reply?.ok) throw new Error(reply?.error || '操作失败，请重试。');
  return reply;
}
function showProfile(model, hasKey) {
  $('model').value = model;
  $('keyHint').textContent = hasKey ? '此接口已保存密钥，留空可继续使用。' : '填写此服务的密钥。本机免鉴权服务可以留空。';
}
function showProvider() {
  const {provider} = destination();
  $('addressField').hidden = provider !== 'custom';
  $('address').required = provider === 'custom';
  $('keyLink').hidden = provider === 'custom';
  if (provider !== 'custom') {
    $('keyLink').href = provider === 'openai' ? 'https://platform.openai.com/api-keys' : 'https://platform.deepseek.com/api_keys';
    $('keyLink').textContent = '管理 ' + (provider === 'openai' ? 'OpenAI' : 'DeepSeek') + ' API 密钥 ↗';
  }
}
async function load() {
  const data = await send('GET_SETTINGS');
  $('provider').value = data.provider;
  $('address').value = data.customUrl;
  $('bubble').checked = data.showBubble;
  showProvider(); showProfile(data.model, data.hasKey);
}
async function selectProfile() {
  const id = ++revision, target = destination();
  cancel?.(); $('test').disabled = false; $('key').value = ''; status('');
  showProvider(); showProfile(providers[target.provider].model, false);
  try { endpointFor(target.provider, target.customUrl); } catch { return; }
  const data = await send('GET_PROFILE', target);
  if (id === revision && $('model').value === providers[target.provider].model) showProfile(data.model, data.hasKey);
}
$('provider').onchange = () => selectProfile().catch(error => status(error.message, true));
$('address').oninput = () => selectProfile().catch(error => status(error.message, true));
async function save() {
  const target = destination(), endpoint = endpointFor(target.provider, target.customUrl);
  const fields = {...target, model: $('model').value.trim(), apiKey: $('key').value, showBubble: $('bubble').checked};
  if (!fields.model) throw new Error('请填写模型 ID。');
  if (target.provider !== 'openai' && !await chrome.permissions.request({origins: [hostPattern(endpoint)]}))
    throw new Error('请允许扩展访问所选接口的域名后再保存。');
  const data = await send('SAVE_SETTINGS', fields);
  $('key').value = ''; await load();
  return data.hasKey || localService(endpoint);
}
$('form').addEventListener('submit', async event => {
  event.preventDefault(); cancel?.(); $('test').disabled = false;
  try { status(await save() ? '已保存。' : '设置已保存，请填写此服务的 API 密钥。'); } catch (error) { status(error.message, true); }
});
$('test').addEventListener('click', async () => {
  if (!$('form').reportValidity()) return;
  cancel?.(); $('test').disabled = true;
  try {
    await save(); status('正在测试连接…'); let result = '';
    cancel = QuickTranslate.start('Good morning. Have a nice day!', {
      delta(value) { result += value; status(result); },
      done() { status(`连接成功。示例译文：${result}`); $('test').disabled = false; },
      error(error) { status(error, true); $('test').disabled = false; }
    }, {force: true});
  } catch (error) { status(error.message, true); $('test').disabled = false; }
});
$('delete').addEventListener('click', async () => {
  cancel?.(); $('test').disabled = false;
  try {
    const target = destination();
    await send('DELETE_KEY', target);
    $('key').value = ''; showProfile($('model').value, false); status('密钥已删除。');
  } catch (error) { status(error.message, true); }
});
load().catch(error => status(error.message, true));
