import {libraryPrefix} from './library-store.js';

const $ = id => document.getElementById(id);
let entries = [], revision = 0;
const kind = () => location.hash === '#answers' ? 'answer' : 'word';
function node(tag, text, className) {
  const el = document.createElement(tag);
  el.textContent = text;
  if (className) el.className = className;
  return el;
}
function report(error) { $('status').textContent = error.message; }
function render() {
  const words = kind() === 'word', term = $('search').value.trim().toLowerCase();
  const section = entries.filter(([, item]) => item.kind === kind());
  const matches = section.filter(([, item]) => [item.word, item.meaning, item.source, item.question, item.answer, item.example, item.pos, item.phonetic].some(value => value?.toLowerCase().includes(term)));
  $('words').setAttribute('aria-current', words ? 'page' : 'false');
  $('answers').setAttribute('aria-current', words ? 'false' : 'page');
  $('search').placeholder = words ? '搜索词语、释义或原文' : '搜索问题、回答或原文';
  $('count').textContent = term ? '找到 ' + matches.length + ' 条' : '共 ' + section.length + ' 条';
  $('clear').hidden = !section.length || Boolean(term);
  $('clear').textContent = words ? '清空生词本' : '清空问答收藏';
  $('entries').replaceChildren();
  if (!matches.length) {
    $('entries').append(node('p', term ? '没有匹配的收藏。' : words ? '查生词时点击「加入生词本」，就能在这里复习。' : '在 AI 回答下点击「收藏问答」，就能在这里重读。'));
  }
  for (const [id, item] of matches) {
    const card = node('article', '', 'card');
    card.append(node('h2', words ? item.word : item.question));
    if (words) card.append(node('small', [item.phonetic, item.pos].filter(Boolean).join(' · ')));
    card.append(node('p', words ? item.meaning : item.answer));
    if (words && item.example) card.append(node('p', item.example, 'example'));
    const details = node('details', '');
    details.append(node('summary', '原文'), node('p', item.source));
    const row = node('div', '', 'row');
    const copy = node('button', '复制'), remove = node('button', '删除', 'subtle');
    copy.onclick = async () => {
      try { await QuickTranslate.copy((words ? [item.word, item.phonetic, item.pos, item.meaning, item.example] : [item.source, item.question, item.answer]).filter(Boolean).join('\n')); $('status').textContent = '已复制。'; }
      catch (error) { report(error); }
    };
    remove.onclick = () => chrome.storage.local.remove(id).catch(report);
    row.append(copy, remove);
    card.append(details, row);
    $('entries').append(card);
  }
}
async function reload() {
  const id = ++revision;
  const storage = chrome.storage.local;
  const keys = storage.getKeys ? await storage.getKeys() : Object.keys(await storage.get(null));
  const items = await storage.get(keys.filter(key => key.startsWith(libraryPrefix)));
  if (id !== revision) return;
  entries = Object.entries(items).sort((a, b) => b[1].savedAt - a[1].savedAt);
  render();
}
$('search').oninput = render;
window.onhashchange = () => { $('search').value = ''; $('status').textContent = ''; render(); };
$('clear').onclick = () => {
  const ids = entries.filter(([, item]) => item.kind === kind()).map(([id]) => id);
  if (ids.length && confirm('确定删除这个分类中的全部 ' + ids.length + ' 条收藏？')) chrome.storage.local.remove(ids).catch(report);
};
chrome.storage.onChanged.addListener((changes, area) => {
  if (area === 'local' && Object.keys(changes).some(key => key.startsWith(libraryPrefix))) reload().catch(report);
});
reload().catch(report);
