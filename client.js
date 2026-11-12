(() => {
  globalThis.QuickTranslate = {
    start(text, handlers, {force = false} = {}) {
      let port, finished = false, timer;
      const finish = () => { finished = true; clearInterval(timer); port?.disconnect(); };
      try {
        port = chrome.runtime.connect({name: 'translate'});
        port.onMessage.addListener(message => {
          if (finished) return;
          if (message.type === 'DELTA') handlers.delta(message.delta);
          if (message.type === 'DONE') { finish(); handlers.done(); }
          if (message.type === 'ERROR') { finish(); handlers.error(message.error); }
        });
        port.onDisconnect.addListener(() => {
          const error = chrome.runtime.lastError;
          if (!finished) { finish(); handlers.error(error ? '扩展连接已断开，请刷新网页后重试。' : '连接中断，请重试。'); }
        });
        // Port traffic keeps a slow streaming request alive in Manifest V3.
        timer = setInterval(() => { try { port.postMessage({type: 'PING'}); } catch { finish(); handlers.error('连接中断，请重试。'); } }, 20000);
        port.postMessage({type: 'START', text, force});
      } catch { finish(); queueMicrotask(() => handlers.error('扩展已更新，请刷新网页后重试。')); }
      return finish;
    },
    async copy(text, root = document.body) {
      try { await navigator.clipboard.writeText(text); }
      catch {
        const input = document.createElement('textarea'); input.value = text;
        input.style.cssText = 'position:fixed;left:0;top:0;opacity:0';
        root.append(input); input.select(); const ok = document.execCommand('copy'); input.remove();
        if (!ok) throw new Error('请选中译文后按 ⌘C / Ctrl+C 复制。');
      }
    }
  };
})();
