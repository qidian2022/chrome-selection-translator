const $ = id => document.getElementById(id);
let cancel;
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
async function load() {
  const data = await chrome.runtime.sendMessage({type: 'GET_SETTINGS'});
  if (!data.ok) throw new Error(data.error);
  $('model').value = data.model; $('bubble').checked = data.showBubble;
  $('keyHint').textContent = data.hasKey ? '已保存密钥。留空保留现有密钥，输入新密钥可替换。' : '填入你自己的 API 密钥。';
}
async function save() {
  const data = await chrome.runtime.sendMessage({type: 'SAVE_SETTINGS', apiKey: $('key').value, model: $('model').value, showBubble: $('bubble').checked});
  if (!data.ok) throw new Error(data.error);
  $('key').value = ''; await load(); return data;
}
$('form').addEventListener('submit', async event => {
  event.preventDefault(); cancel?.(); $('test').disabled = false;
  try { const data = await save(); status(data.hasKey ? '已保存。刷新网页后，选中文字即可翻译。' : '设置已保存，请填写 API 密钥。'); } catch (error) { status(error.message, true); }
});
$('test').addEventListener('click', async () => {
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
  try { await chrome.runtime.sendMessage({type: 'DELETE_KEY'}); $('key').value = ''; await load(); status('密钥已删除。'); } catch (error) { status(error.message, true); }
});
load().catch(error => status(error.message, true));
