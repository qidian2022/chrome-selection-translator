const $ = id => document.getElementById(id);
let cancel, generation = 0;
function status(text, error = false) { $('status').textContent = text; $('status').classList.toggle('error', error); }
function idle() { $('stop').hidden = true; $('copy').disabled = !$('result').textContent; cancel = null; }
function start() {
  cancel?.(); const id = ++generation;
  $('result').textContent = ''; $('copy').disabled = true; $('stop').hidden = false; status('正在翻译…');
  cancel = QuickTranslate.start($('source').value, {
    delta(value) { if (id === generation) { $('result').textContent += value; status('正在生成译文…'); } },
    done() { if (id === generation) { idle(); status('翻译完成'); } },
    error(error) { if (id === generation) { idle(); status(error, true); } }
  });
}
$('translate').addEventListener('click', start);
$('source').addEventListener('keydown', event => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); start(); } });
$('stop').addEventListener('click', () => { cancel?.(); generation++; idle(); status('已停止，当前显示的是部分译文。'); });
$('settings').addEventListener('click', () => chrome.runtime.openOptionsPage());
$('copy').addEventListener('click', async () => { try { await QuickTranslate.copy($('result').textContent); status('已复制'); } catch (error) { status(error.message, true); } });
(async () => {
  const job = new URLSearchParams(location.search).get('job');
  if (job) {
    const data = await chrome.runtime.sendMessage({type: 'TAKE_JOB', id: job});
    if (data.text) { $('source').value = data.text; start(); }
    return;
  }
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  try {
    const results = await chrome.scripting.executeScript({target: {tabId: tab.id, allFrames: true}, func: () => {
      const active = document.activeElement;
      if (active?.type === 'password') return '';
      if (typeof active?.selectionStart === 'number') return active.value.slice(active.selectionStart, active.selectionEnd);
      return window.getSelection()?.toString() || '';
    }});
    const result = results.find(item => item.result?.trim());
    if (result) $('source').value = result.result;
  } catch { status('此页面可以粘贴文字后翻译。'); }
})().catch(() => status('请粘贴要翻译的文字。'));
