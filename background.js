import {providers, endpointFor, hostPattern, localService} from './providers.js';
import {studyPrompt, parseWords} from './study-api.js';
import {saveEntry} from './library-store.js';
import {translate, requestText, DEFAULT_MODEL, validateText} from './api.js';
import {TranslationCache} from './cache.js';

const translationCache = new TranslationCache();
const wordCache = new TranslationCache();
let cacheVersion = 0;

const ready = (async () => {
  await chrome.storage.local.setAccessLevel({accessLevel: 'TRUSTED_CONTEXTS'});
  const saved = await chrome.storage.local.get(['model', 'lunaDefaultApplied', 'compactToolbarApplied']);
  if (!saved.lunaDefaultApplied) {
    const patch = {lunaDefaultApplied: true};
    if (!saved.model || ['gpt-4.1-mini', 'gpt6-terra', 'gpt-6-terra', 'gpt-6.1-terra', '6-luna'].includes(saved.model)) {
      patch.model = DEFAULT_MODEL;
    }
    await chrome.storage.local.set(patch);
  }
  if (!saved.compactToolbarApplied) {
    await chrome.storage.local.set({showBubble: true, compactToolbarApplied: true});
  }
})();
async function preferences() {
  await ready;
  return chrome.storage.local.get({provider: 'openai', customUrl: '', showBubble: true});
}

async function profile(provider, customUrl) {
  const endpoint = endpointFor(provider, customUrl);
  if (provider === 'openai') {
    const saved = await chrome.storage.local.get({apiKey: '', model: DEFAULT_MODEL});
    return {...saved, endpoint};
  }
  const key = 'profile:' + endpoint;
  const saved = (await chrome.storage.local.get(key))[key];
  return {endpoint, model: saved?.model || providers[provider].model, apiKey: saved?.apiKey || ''};
}

async function checkAccess(provider, endpoint) {
  if (provider !== 'openai' && !await chrome.permissions.contains({origins: [hostPattern(endpoint)]}))
    throw new Error('请到设置页保存此接口，并允许访问服务商域名。');
}
const trustedPage = sender => sender.id === chrome.runtime.id && [chrome.runtime.getURL('options.html'), chrome.runtime.getURL('popup.html')].includes(sender.url?.split('?')[0]);

// Only the public display preference is sent to page content scripts.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.apiKey || changes.model || changes.provider || changes.customUrl || Object.keys(changes).some(key => key.startsWith('profile:'))) {
    translationCache.clear(); wordCache.clear(); cacheVersion++;
  }
  if (!changes.showBubble) return;
  chrome.tabs.query({}).then(tabs => Promise.allSettled(tabs.filter(tab => tab.id).map(tab =>
    chrome.tabs.sendMessage(tab.id, {type: 'BUBBLE_VISIBILITY', enabled: changes.showBubble.newValue !== false})
  ))).catch(() => {});
});

chrome.runtime.onInstalled.addListener(async ({reason}) => {
  await chrome.contextMenus.removeAll();
  chrome.contextMenus.create({id: 'translate', title: '翻译成中文', contexts: ['selection']});
  if (reason === 'install') await chrome.runtime.openOptionsPage();
});

chrome.runtime.onMessage.addListener((message, sender, reply) => {
  if (sender.id !== chrome.runtime.id) return;
  (async () => {
    if (message.type === 'OPEN_LIBRARY') {
      const section = message.kind === 'answer' ? 'answers' : 'words';
      await chrome.tabs.create({url: chrome.runtime.getURL('library.html#' + section)});
      return {ok: true};
    }
    if (message.type === 'SAVE_ENTRY' && ['word', 'answer'].includes(message.kind)) {
      await ready;
      await saveEntry(message.kind, message.data);
      return {ok: true};
    }
    if (message.type === 'OPEN_SETTINGS') { await chrome.runtime.openOptionsPage(); return {ok: true}; }
    if (message.type === 'PUBLIC_SETTINGS') return {ok: true, showBubble: (await preferences()).showBubble};
    if (trustedPage(sender) && ['GET_SETTINGS', 'GET_PROFILE', 'SAVE_SETTINGS', 'DELETE_KEY'].includes(message.type)) {
      const current = await preferences();
      const provider = message.type === 'GET_SETTINGS' ? current.provider : (message.provider || 'openai');
      const customUrl = message.customUrl ?? current.customUrl;
      const saved = await profile(provider, customUrl);
      if (message.type === 'GET_SETTINGS' || message.type === 'GET_PROFILE') {
        return {ok: true, provider, customUrl, hasKey: Boolean(saved.apiKey), model: saved.model, showBubble: current.showBubble};
      }
      const profileKey = 'profile:' + saved.endpoint;
      if (message.type === 'DELETE_KEY') {
        if (provider === 'openai') await chrome.storage.local.remove('apiKey');
        else await chrome.storage.local.set({[profileKey]: {model: saved.model, apiKey: ''}});
        return {ok: true};
      }
      const model = String(message.model || '').trim();
      if (!/^[a-zA-Z0-9._:@/+-]{1,160}$/.test(model)) throw new Error('请填写有效的模型 ID。');
      const apiKey = String(message.apiKey || '').trim() || saved.apiKey;
      if (/\s/.test(apiKey)) throw new Error('API 密钥中不能包含空格或换行。');
      await checkAccess(provider, saved.endpoint);
      const patch = {provider, showBubble: message.showBubble !== false};
      if (provider === 'custom') patch.customUrl = customUrl.trim();
      if (provider === 'openai') Object.assign(patch, {apiKey, model});
      else patch[profileKey] = {apiKey, model};
      await chrome.storage.local.set(patch);
      return {ok: true, hasKey: Boolean(apiKey)};
    }
    if (message.type === 'TAKE_JOB' && trustedPage(sender) && /^[\w-]{36}$/.test(message.id || '')) {
      const key = `job:${message.id}`;
      const data = (await chrome.storage.session.get(key))[key];
      await chrome.storage.session.remove(key);
      return {ok: true, text: data && Date.now() - data.created < 60000 ? data.text : ''};
    }
    throw new Error('无法处理这个操作。');
  })().then(reply).catch(error => reply({ok: false, error: error.message}));
  return true;
});

chrome.runtime.onConnect.addListener(port => {
  if (!['translate', 'ask', 'vocab'].includes(port.name) || port.sender?.id !== chrome.runtime.id) return;
  const controller = new AbortController();
  let started = false, connected = true;
  const send = value => { if (connected) { try { port.postMessage(value); } catch { controller.abort(); } } };
  port.onDisconnect.addListener(() => { connected = false; controller.abort(); });
  port.onMessage.addListener(async message => {
    if (message.type !== 'START' || started) return;
    started = true;
    try {
      const {provider, customUrl} = await preferences();
      const config = await profile(provider, customUrl);
      await checkAccess(provider, config.endpoint);
      if (controller.signal.aborted) return;
      const text = validateText(message.text);
      const options = {...config, signal: controller.signal, onDelta: delta => send({type: 'DELTA', delta})};
      if (!config.apiKey && !localService(config.endpoint)) throw new Error('先在设置页填写当前服务商的 API 密钥，再开始使用。');
      const cacheModel = JSON.stringify([config.endpoint, config.model]);
      const version = cacheVersion;
      if (port.name !== 'translate') {
        if (port.name === 'vocab') {
          const words = wordCache.get(cacheModel, text);
          if (words !== null) { send({type: 'DONE', words}); return; }
        }
        const prompt = studyPrompt(port.name, text, message.question, message.history);
        if (port.name === 'vocab') delete options.onDelta;
        const output = await requestText({...options, ...prompt});
        if (port.name === 'vocab') {
          const words = parseWords(output);
          if (!controller.signal.aborted && version === cacheVersion) wordCache.set(cacheModel, text, words);
          send({type: 'DONE', words});
        } else send({type: 'DONE'});
        return;
      }
      if (message.force === true) translationCache.delete(cacheModel, text);
      const cached = translationCache.get(cacheModel, text);
      if (cached !== null) {
        send({type: 'DELTA', delta: cached}); send({type: 'DONE'}); return;
      }
      const output = await translate({...options, text});
      if (!controller.signal.aborted && version === cacheVersion) translationCache.set(cacheModel, text, output);
      send({type: 'DONE'});
    } catch (error) { send({type: 'ERROR', error: error.message}); }
  });
});

async function fallback(text = '') {
  const id = crypto.randomUUID();
  // Remove abandoned handoff text; no translation history is persisted.
  const all = await chrome.storage.session.get(null);
  const expired = Object.keys(all).filter(key => key.startsWith('job:') && Date.now() - all[key].created > 60000);
  if (expired.length) await chrome.storage.session.remove(expired);
  await chrome.storage.session.set({[`job:${id}`]: {text, created: Date.now()}});
  await chrome.windows.create({url: chrome.runtime.getURL(`popup.html?job=${id}`), type: 'popup', width: 470, height: 640});
}

chrome.contextMenus.onClicked.addListener(async (info, tab) => {
  if (info.menuItemId !== 'translate') return;
  try {
    const response = await chrome.tabs.sendMessage(tab.id, {type: 'TRANSLATE_SELECTION', text: info.selectionText}, {frameId: info.frameId || 0});
    if (!response?.ok) await fallback(info.selectionText);
  } catch { await fallback(info.selectionText); }
});

chrome.commands.onCommand.addListener(async command => {
  if (command !== 'translate-selection') return;
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (!tab?.id) return;
  try { await chrome.tabs.sendMessage(tab.id, {type: 'TRANSLATE_FOCUSED'}); }
  catch { await fallback(); }
});
