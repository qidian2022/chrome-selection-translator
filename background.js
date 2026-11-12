import {translate, DEFAULT_MODEL, validateText} from './api.js';
import {TranslationCache} from './cache.js';

const translationCache = new TranslationCache();
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
const settings = async () => { await ready; return chrome.storage.local.get({apiKey: '', model: DEFAULT_MODEL, showBubble: true}); };
const trustedPage = sender => sender.id === chrome.runtime.id && [chrome.runtime.getURL('options.html'), chrome.runtime.getURL('popup.html')].includes(sender.url?.split('?')[0]);

// Only the public display preference is sent to page content scripts.
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (changes.apiKey || changes.model) { translationCache.clear(); cacheVersion++; }
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
    if (message.type === 'OPEN_SETTINGS') { await chrome.runtime.openOptionsPage(); return {ok: true}; }
    if (message.type === 'PUBLIC_SETTINGS' || (message.type === 'GET_SETTINGS' && trustedPage(sender))) {
      const {apiKey, model, showBubble} = await settings();
      return {ok: true, hasKey: Boolean(apiKey), model, showBubble};
    }
    if (message.type === 'SAVE_SETTINGS' && trustedPage(sender)) {
      const old = await settings();
      const model = String(message.model || '').trim();
      if (!/^[a-zA-Z0-9._:-]{1,120}$/.test(model)) throw new Error('请填写有效的模型名称。');
      const apiKey = String(message.apiKey || '').trim() || old.apiKey;
      if (/[\r\n\s]/.test(apiKey)) throw new Error('API 密钥中不能包含空格或换行。');
      await chrome.storage.local.set({apiKey, model, showBubble: message.showBubble !== false});
      return {ok: true, hasKey: Boolean(apiKey)};
    }
    if (message.type === 'DELETE_KEY' && trustedPage(sender)) {
      await ready; await chrome.storage.local.remove('apiKey'); return {ok: true};
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
  if (port.name !== 'translate' || port.sender?.id !== chrome.runtime.id) return;
  const controller = new AbortController();
  let started = false, connected = true;
  const send = value => { if (connected) { try { port.postMessage(value); } catch { controller.abort(); } } };
  port.onDisconnect.addListener(() => { connected = false; controller.abort(); });
  port.onMessage.addListener(async message => {
    if (message.type !== 'START' || started) return;
    started = true;
    try {
      const config = await settings();
      if (controller.signal.aborted) return;
      const text = validateText(message.text);
      if (!config.apiKey) throw new Error('先在设置页填写 OpenAI API 密钥，再开始翻译。');
      const version = cacheVersion;
      if (message.force === true) translationCache.delete(config.model, text);
      const cached = translationCache.get(config.model, text);
      if (cached !== null) {
        send({type: 'DELTA', delta: cached}); send({type: 'DONE'}); return;
      }
      const output = await translate({...config, text, signal: controller.signal, onDelta: delta => send({type: 'DELTA', delta})});
      if (!controller.signal.aborted && version === cacheVersion) translationCache.set(config.model, text, output);
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
