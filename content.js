(() => {
  if (globalThis.__quickTranslateLoaded) return;
  globalThis.__quickTranslateLoaded = true;
  const host = document.createElement('div');
  host.style.cssText = 'all:initial!important;position:fixed!important;inset:0 auto auto 0!important;width:0!important;height:0!important;z-index:2147483647!important;';
  const root = host.attachShadow({mode: 'closed'});
  const svg = paths => `<svg viewBox="0 0 20 20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
  const copyIcon = svg('<rect x="7" y="7" width="10" height="10" rx="2"/><path d="M13 7V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h2"/>');
  const translateIcon = svg('<path d="M2 4h10M7 2v2M10 4c-1 5-4 8-8 9M4 6c1 3 3 5 6 6M11 17l3-8 4 8M12 14h5"/>');
  // The markup is static; source text and model output are rendered as plain text.
  root.innerHTML = `<style>
    :host{color-scheme:light} *{box-sizing:border-box} [hidden]{display:none!important}
    button{display:inline-flex;align-items:center;justify-content:center;gap:5px;font:12px/1 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;cursor:pointer;border:0;border-radius:5px;padding:6px;background:transparent;color:inherit;white-space:nowrap}
    button:hover{background:#eef1f3} button:focus-visible{outline:2px solid #77b5ee;outline-offset:-2px} button:disabled{opacity:.35;cursor:default} svg{width:15px;height:15px;flex-shrink:0}
    #toolbar{position:fixed;display:flex;align-items:center;gap:2px;padding:3px;background:#35383f;color:#fff;border:1px solid #555960;border-radius:9px;box-shadow:0 4px 14px #14203126;font:12px/1 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;user-select:none}
    #toolbar button{height:26px;padding:0 9px} #toolbar button:hover{background:#ffffff1a} #toolbar .separator{width:1px;height:15px;background:#ffffff26}
    #panel{position:fixed;display:flex;flex-direction:column;width:260px;max-width:calc(100vw - 16px);background:#fff;color:#263238;border:1px solid #dce2e6;border-radius:10px;box-shadow:0 6px 24px #18253426;font:14px/1.6 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;text-align:left;overflow:hidden}
    header{display:flex;align-items:center;gap:2px;padding:5px 6px 0 11px;flex-shrink:0;color:#758089;user-select:none} header span{font-size:11px;margin-right:auto} header button{width:26px;height:26px}
    #result{padding:5px 12px 11px;white-space:pre-wrap;overflow-wrap:anywhere;user-select:text;overflow:auto;overscroll-behavior:contain;min-height:0;flex:1} #result:empty{display:none}
    #status{padding:5px 12px 10px;color:#7a858b;font-size:11px;white-space:pre-wrap;overflow-wrap:anywhere;flex-shrink:0} #status.error{color:#a13c2c}
    #extras{padding:0 11px 8px;border-top:1px solid #edf0f2;flex-shrink:0} #extras .actions{display:flex;gap:4px;margin-top:5px;color:#576871} #extras button{font-size:11px;padding:5px 7px}
    #original{margin:6px 0 0;max-height:90px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere;font-size:12px;color:#758089}
  </style>
  <div id="toolbar" role="toolbar" aria-label="划词工具" hidden>
    <button id="trigger" title="翻译成中文" aria-label="翻译成中文">${translateIcon}翻译</button>
    <span class="separator"></span><button id="copySource" title="复制原文" aria-label="复制原文">${copyIcon}<span id="copyLabel">复制</span></button>
  </div>
  <section id="panel" role="dialog" aria-label="中文译文" hidden>
    <header><span>中文</span><button id="copy" title="复制译文" aria-label="复制译文" disabled>${copyIcon}</button><button id="more" title="更多选项" aria-label="更多选项" aria-expanded="false">${svg('<circle cx="4" cy="10" r=".7"/><circle cx="10" cy="10" r=".7"/><circle cx="16" cy="10" r=".7"/>')}</button><button id="close" title="关闭" aria-label="关闭译文">${svg('<path d="m5 5 10 10M15 5 5 15"/>')}</button></header>
    <div id="result"></div><div id="status" role="status" aria-live="polite"></div>
    <div id="extras" hidden><div class="actions"><button id="showOriginal" aria-expanded="false">原文</button><button id="retry">重新翻译</button><button id="settings">设置</button></div><div id="original" hidden></div></div>
  </section>`;
  const $ = id => root.getElementById(id);
  let saved = '', anchor = {left:24, right:48, top:60, bottom:80}, cancel = null;
  let generation = 0, showBubble = true, pointerDown = false, timer = null, dismissedText = null;
  let panelAbove = false, anchorTarget = null, placementFrame = null;
  const inside = event => event.composedPath().includes(host);
  const mount = () => { if (!host.isConnected) document.documentElement.append(host); };
  function activeElement() {
    let active = document.activeElement;
    while (active?.shadowRoot?.activeElement) active = active.shadowRoot.activeElement;
    return active;
  }
  function selection() {
    const active = activeElement();
    if (active === host) return null;
    if (active?.tagName === 'INPUT' || active?.tagName === 'TEXTAREA') {
      if (active.type === 'password') return null;
      if (typeof active.selectionStart === 'number' && active.selectionEnd > active.selectionStart) {
        return {text:active.value.slice(active.selectionStart,active.selectionEnd), rect:active.getBoundingClientRect(), target:{element:active}};
      }
      return null;
    }
    const s = window.getSelection();
    if (!s?.rangeCount || s.isCollapsed || !s.toString().trim()) return null;
    const range = s.getRangeAt(0);
    if (root.contains(range.commonAncestorContainer)) return null;
    const rects = Array.from(range.getClientRects()).filter(r => r.width || r.height);
    // Anchor the strip to the end where the user finished selecting.
    const atStart = s.focusNode === range.startContainer && s.focusOffset === range.startOffset;
    const rect = (atStart ? rects[0] : rects.at(-1)) || range.getBoundingClientRect();
    if (!rect.width && !rect.height) return null;
    return {text:s.toString(),rect,target:{range:range.cloneRange(),atStart}};
  }
  function rememberAnchor(current) {
    anchor = current.rect; anchorTarget = current.target;
  }
  function refreshAnchor() {
    let rect;
    if (anchorTarget?.element?.isConnected) {
      rect = anchorTarget.element.getBoundingClientRect();
    } else if (anchorTarget?.range?.commonAncestorContainer.isConnected && !anchorTarget.range.collapsed) {
      const rects = Array.from(anchorTarget.range.getClientRects()).filter(r => r.width || r.height);
      rect = (anchorTarget.atStart ? rects[0] : rects.at(-1)) || anchorTarget.range.getBoundingClientRect();
    }
    // If the page removes the source, keep the translation at its last visible position.
    if (rect && (rect.width || rect.height)) anchor = rect;
  }
  function followAnchor() {
    if (placementFrame !== null || ($('toolbar').hidden && $('panel').hidden)) return;
    placementFrame = requestAnimationFrame(() => {
      placementFrame = null; refreshAnchor();
      if (!$('toolbar').hidden) placeToolbar();
      if (!$('panel').hidden) placePanel(true);
    });
  }
  function placeToolbar() {
    const toolbar = $('toolbar'), width = toolbar.offsetWidth, height = toolbar.offsetHeight;
    const left = (anchor.left + anchor.right - width) / 2;
    const top = anchor.top >= height + 14 ? anchor.top - height - 6 : anchor.bottom + 6;
    toolbar.style.left = `${Math.max(8,Math.min(left,innerWidth-width-8))}px`;
    toolbar.style.top = `${Math.max(8,Math.min(top,innerHeight-height-8))}px`;
  }
  function placePanel(initial = false) {
    const panel = $('panel');
    if (initial) panelAbove = innerHeight - anchor.bottom < 140 && anchor.top > innerHeight - anchor.bottom;
    const space = panelAbove ? anchor.top - 14 : innerHeight - anchor.bottom - 14;
    panel.style.maxHeight = `${Math.min(360,Math.max(90,space),innerHeight-16)}px`;
    panel.style.left = `${Math.max(8,Math.min(anchor.left,innerWidth-panel.offsetWidth-8))}px`;
    const top = panelAbove ? anchor.top - panel.offsetHeight - 6 : anchor.bottom + 6;
    panel.style.top = `${Math.max(8,Math.min(top,innerHeight-panel.offsetHeight-8))}px`;
  }
  function close(suppress = true) {
    clearTimeout(timer); cancel?.(); cancel = null; generation++;
    if (placementFrame !== null) { cancelAnimationFrame(placementFrame); placementFrame = null; }
    if (suppress) dismissedText = selection()?.text || saved;
    $('panel').hidden = true; $('toolbar').hidden = true;
  }
  function updateSelection() {
    if (pointerDown || activeElement() === host) return;
    const current = selection();
    if (!current) { $('toolbar').hidden = true; dismissedText = null; return; }
    if (current.text === dismissedText) return;
    if (!$('panel').hidden && current.text === saved) return;
    if (!$('panel').hidden) close(false);
    saved = current.text; rememberAnchor(current);
    mount(); $('toolbar').hidden = !showBubble; $('copyLabel').textContent = '复制';
    if (showBubble) placeToolbar();
  }
  function scheduleSelection() {
    clearTimeout(timer);
    timer = setTimeout(updateSelection, 45);
  }
  function status(text, error = false, hide = false) {
    $('status').textContent = text; $('status').classList.toggle('error',error); $('status').hidden = hide;
    placePanel();
  }
  function start(text, force = false) {
    clearTimeout(timer); cancel?.(); const id = ++generation;
    saved = text; dismissedText = text; mount(); $('toolbar').hidden = true; $('panel').hidden = false;
    $('panel').style.width = text.length > 65 ? '320px' : '240px';
    $('result').textContent = ''; $('original').textContent = text; $('copy').disabled = true;
    $('extras').hidden = true; $('original').hidden = true; $('more').setAttribute('aria-expanded','false'); $('showOriginal').setAttribute('aria-expanded','false');
    placePanel(true); status('正在翻译…');
    cancel = QuickTranslate.start(text, {
      delta(value) {
        if (id !== generation) return;
        $('result').textContent += value; status('正在生成译文…');
      },
      done() { if (id !== generation) return; $('copy').disabled = false; cancel = null; status('翻译完成',false,true); },
      error(error) { if (id !== generation) return; $('copy').disabled = !$('result').textContent; cancel = null; status(error,true); }
    }, {force});
  }
  // Keep the selection when clicking actions, but allow selecting the translated text.
  root.addEventListener('mousedown',event => { if (event.target.closest('button')) event.preventDefault(); });
  $('trigger').addEventListener('click',event => { if (event.isTrusted) start(saved); });
  $('retry').addEventListener('click',event => { if (event.isTrusted) start(saved, true); });
  $('copySource').addEventListener('click',async event => {
    if (!event.isTrusted) return;
    try { await QuickTranslate.copy(saved,root); $('copyLabel').textContent = '已复制'; placeToolbar(); }
    catch { $('copyLabel').textContent = '按 ⌘/Ctrl+C'; placeToolbar(); }
  });
  $('copy').addEventListener('click',async () => {
    try { await QuickTranslate.copy($('result').textContent,root); status('已复制'); }
    catch (error) { status(error.message,true); }
  });
  $('close').addEventListener('click',() => close());
  $('more').addEventListener('click',() => { $('extras').hidden = !$('extras').hidden; $('more').setAttribute('aria-expanded',String(!$('extras').hidden)); placePanel(); });
  $('showOriginal').addEventListener('click',() => { $('original').hidden = !$('original').hidden; $('showOriginal').setAttribute('aria-expanded',String(!$('original').hidden)); placePanel(); });
  $('settings').addEventListener('click',() => chrome.runtime.sendMessage({type:'OPEN_SETTINGS'}).catch(() => status('请从工具栏打开扩展设置。',true)));
  // Capture events before page handlers stop bubbling, then wait for the final selection.
  document.addEventListener('pointerdown',event => {
    if (!event.isTrusted || inside(event)) return;
    pointerDown = true; dismissedText = null; close(false);
  },true);
  const release = event => {
    if (!event.isTrusted) return;
    pointerDown = false;
    if (!inside(event)) scheduleSelection();
  };
  document.addEventListener('pointerup',release,true);
  document.addEventListener('mouseup',release,true);
  document.addEventListener('pointercancel',() => { pointerDown = false; },true);
  document.addEventListener('selectionchange',scheduleSelection,true);
  document.addEventListener('keyup',event => {
    if (!event.isTrusted || inside(event) || event.key === 'Escape') return;
    if (event.key.startsWith('Arrow') || event.key === 'Shift' || ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'a')) dismissedText = null;
    scheduleSelection();
  },true);
  document.addEventListener('keydown',event => { if (event.key === 'Escape') close(); },true);
  window.addEventListener('blur',() => { pointerDown = false; $('toolbar').hidden = true; });
  window.addEventListener('scroll',event => {
    if (inside(event)) return;
    followAnchor();
  },true);
  window.addEventListener('resize',followAnchor);
  const setBubble = enabled => { showBubble = enabled !== false; if (!showBubble) $('toolbar').hidden = true; };
  chrome.runtime.sendMessage({type:'PUBLIC_SETTINGS'}).then(data => setBubble(data.showBubble)).catch(() => {});
  chrome.runtime.onMessage.addListener((message,sender,reply) => {
    if (sender.id !== chrome.runtime.id) return;
    if (message.type === 'BUBBLE_VISIBILITY') { setBubble(message.enabled); reply({ok:true}); }
    if (message.type === 'TRANSLATE_SELECTION') {
      const current = selection(); if (current) rememberAnchor(current);
      start(message.text || current?.text || ''); reply({ok:true});
    }
    if (message.type === 'TRANSLATE_FOCUSED' && document.hasFocus()) {
      const current = selection(); if (current) rememberAnchor(current);
      start(current?.text || ''); reply({ok:true});
    }
  });
})();
