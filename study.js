(() => {
  function element(tag, text, className) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    if (className) node.className = className;
    return node;
  }
  globalThis.QuickTranslate.createStudy = function(container, resize = () => {}) {
    const root = container.attachShadow({mode: 'closed'});
    root.innerHTML = `<style>
      :host{min-height:0;display:flex;flex-direction:column;text-align:left;color:#263832;font:13px/1.55 -apple-system,BlinkMacSystemFont,"PingFang SC",sans-serif;color-scheme:light}
      *{box-sizing:border-box}[hidden]{display:none!important}
      #readout{min-height:0;overflow:auto;overscroll-behavior:contain;padding:0 12px}
      #excerpt{margin:3px 0 8px;border-left:2px solid #9abaae;padding-left:8px;color:#687c70;font-size:12px;overflow-wrap:anywhere;max-height:3.1em;overflow:auto}
      article{padding:8px 0;border-top:1px solid #e0e8e3;overflow-wrap:anywhere}
      strong{display:block;font-size:13px}p{margin:3px 0;white-space:pre-wrap}.detail{font-size:12px;color:#597163}
      button,textarea{font:inherit}button{border:0;background:#eef4f0;color:#276047;border-radius:5px;padding:4px 8px;cursor:pointer}button:disabled{opacity:.6}button:hover:enabled{background:#dfece4}button:focus-visible,textarea:focus-visible{outline:2px solid #4b8d6e}
      .actions,footer,form{display:flex;gap:6px;align-items:center}.actions{margin-top:5px}
      footer{padding:5px 12px;justify-content:space-between;flex-shrink:0;flex-wrap:wrap}footer button{background:transparent;font-size:12px}
      #studyStatus{font-size:12px;color:#54695e}#studyStatus.error{color:#a13c2c}
      form{border-top:1px solid #e0e8e3;padding:8px 12px;flex-shrink:0}
      textarea{flex:1;min-width:0;height:36px;resize:none;border:1px solid #cad8ce;border-radius:6px;padding:6px;background:white;color:#20382f}
      #send{color:white;background:#20664b}
    </style>
    <div id="readout"><p id="excerpt"></p><div id="turns"></div></div>
    <footer><span id="studyStatus" role="status"></span><button id="retryStudy" hidden>重试</button><button id="openLibrary" type="button"></button></footer>
    <form><textarea id="question" maxlength="2000" aria-label="追问" placeholder="继续追问…"></textarea><button id="send">发送</button></form>`;
    const $ = id => root.getElementById(id);
    const form = root.querySelector('form');
    let source, mode, cancel, history = [], generation = 0, retry;
    function status(text, error = false) {
      $('studyStatus').textContent = text;
      $('studyStatus').classList.toggle('error', error);
      resize();
    }
    function close() {
      generation++;
      cancel?.();
      cancel = null;
      retry = null;
      history = [];
      source = '';
      $('turns').replaceChildren();
      $('excerpt').textContent = '';
      $('question').value = '';
    }
    function actions(node, kind, data, copyText) {
      const row = element('div', '', 'actions');
      const save = element('button', kind === 'word' ? '加入生词本' : '收藏问答');
      const copy = element('button', '复制');
      const id = generation;
      save.onclick = async () => {
        save.disabled = true;
        try {
          const reply = await chrome.runtime.sendMessage({type:'SAVE_ENTRY', kind, data});
          if (!reply?.ok) throw new Error(reply?.error || '保存失败，请重试。');
          save.textContent = kind === 'word' ? '已加入生词本' : '已收藏';
        } catch (error) { save.disabled = false; if (id === generation) status(error.message, true); }
      };
      copy.onclick = async () => {
        try { await QuickTranslate.copy(copyText, root); copy.textContent = '已复制'; }
        catch (error) { if (id === generation) status(error.message, true); }
      };
      row.append(save, copy);
      node.append(row);
    }
    function request(question) {
      const id = generation;
      $('retryStudy').hidden = true;
      $('send').disabled = true;
      const turn = element('article'), answer = element('p');
      if (mode === 'ask') {
        turn.append(element('strong', question), answer);
        $('turns').append(turn);
        $('readout').scrollTop = $('readout').scrollHeight;
      }
      status(mode === 'ask' ? '正在回答…' : '正在查词…');
      cancel = QuickTranslate.start(source, {
        delta(value) {
          if (id !== generation) return;
          const view = $('readout'), atBottom = view.scrollHeight - view.scrollTop - view.clientHeight < 24;
          answer.textContent += value;
          resize();
          if (atBottom) view.scrollTop = view.scrollHeight;
        },
        done({words}) {
          if (id !== generation) return;
          cancel = null;
          $('send').disabled = false;
          if (mode === 'ask') {
            const data = {source, question, answer: answer.textContent};
            history.push({question, answer: data.answer});
            actions(turn, 'answer', data, data.answer);
            status('');
          } else {
            for (const item of words) {
              const card = element('article');
              card.append(element('strong', item.word), element('span', [item.phonetic, item.pos].filter(Boolean).join(' · '), 'detail'), element('p', item.meaning));
              if (item.example) card.append(element('p', item.example, 'detail'));
              actions(card, 'word', {...item, source}, item.word);
              $('turns').append(card);
            }
            status(words.length ? '' : '这段选文中没有可收录的生词。');
          }
        },
        error(message) {
          if (id !== generation) return;
          cancel = null;
          $('send').disabled = false;
          if (mode === 'ask' && !answer.textContent) turn.remove();
          retry = () => { turn.remove(); request(question); };
          $('retryStudy').hidden = false;
          status(message, true);
        }
      }, {mode, question, history: history.slice(-6)});
    }
    $('retryStudy').onclick = () => retry?.();
    $('openLibrary').onclick = () => chrome.runtime.sendMessage({type:'OPEN_LIBRARY', kind: mode === 'ask' ? 'answer' : 'word'})
      .catch(() => status('请从扩展工具栏打开收藏。', true));
    form.onsubmit = event => {
      event.preventDefault();
      const question = $('question').value.trim();
      if (!question || cancel) return;
      $('question').value = '';
      request(question);
    };
    $('question').onkeydown = event => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing && event.keyCode !== 229) {
        event.preventDefault();
        form.requestSubmit();
      }
      event.stopPropagation();
    };
    return {
      close,
      open(nextMode, text) {
        close();
        mode = nextMode;
        source = text.trim();
        $('excerpt').textContent = source;
        form.hidden = mode !== 'ask';
        $('openLibrary').textContent = mode === 'ask' ? '问答收藏 ↗' : '生词本 ↗';
        request(mode === 'ask' ? '请解释这段选文。' : '');
      }
    };
  };
})();
