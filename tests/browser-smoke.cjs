const assert = require('node:assert/strict');
const path = require('node:path');
const {chromium} = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const extension = path.resolve(__dirname, '..');
const output = process.env.TEST_OUTPUT || '/tmp/selection-translator-test';
const wait = ms => new Promise(r => setTimeout(r, ms));

(async () => {
  const channel = process.env.PLAYWRIGHT_CHANNEL || 'chromium';
  const context = await chromium.launchPersistentContext('', {
    channel, headless: true, ignoreDefaultArgs: ['--disable-extensions'],
    args: channel === 'chrome' ? ['--enable-unsafe-extension-debugging'] : [`--disable-extensions-except=${extension}`, `--load-extension=${extension}`],
    viewport: {width: 1200, height: 900}
  });
  try {
    const errors = [];
    context.on('page', page => page.on('pageerror', e => errors.push(e.message)));
    if (channel === 'chrome') {
      const browserSession = await context.browser().newBrowserCDPSession();
      await browserSession.send('Extensions.loadUnpacked', {path:extension});
    }
    let worker = context.serviceWorkers()[0] || await context.waitForEvent('serviceworker');
    const id = worker.url().split('/')[2];
    await worker.evaluate(() => {
      globalThis.__requests = [];
      globalThis.__mode = 'success';
      globalThis.fetch = async (url, init) => {
        __requests.push({url, body: JSON.parse(init.body)});
        if (__mode === 'unauthorized') return new Response(JSON.stringify({error:{code:'invalid_api_key'}}), {status:401});
        if (__mode === 'slow') {
          return new Promise((resolve, reject) => init.signal.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError'))));
        }
        const payload = JSON.parse(init.body);
        const chunks = Array.isArray(payload.input) ? ['第一段', '解释。'] :
          payload.instructions.includes('词典编辑') ? [JSON.stringify([{word:'physics', phonetic:'/ˈfɪzɪks/', pos:'n.', meaning:'物理学', example:'Study physics. 学习物理。'}])] : ['学习物理，', '探索世界。'];
        const events = [...chunks.map(delta => ({type:'response.output_text.delta', delta})), {type:'response.completed'}];
        return new Response(new ReadableStream({async start(controller) {
          for (const event of events) {
            controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`));
            await new Promise(r => setTimeout(r, 20));
          }
          try { controller.close(); } catch {}
        }}));
      };
    });
    let options;
    for (let i=0;i<100 && !options;i++) {
      options = context.pages().find(page => page.url() === `chrome-extension://${id}/options.html`);
      if (!options) await wait(50);
    }
    assert.ok(options,'installation opens the options page');
    await options.waitForLoadState('load');
    await options.locator('#key').fill('test-not-a-real-key');
    await options.locator('#test').click();
    await options.waitForFunction(() => document.querySelector('#status').textContent.includes('连接成功'));
    assert.equal(await options.locator('#key').inputValue(), '');
    await options.screenshot({path: path.join(output, 'settings.png')});
    console.log('PASS: settings save, masked key, API connection test');

    const page = await context.newPage();
    await context.route('https://selection-translator.test/**', route => route.fulfill({contentType:'text/html', body:`<!doctype html><meta charset="utf-8"><style>body{font:20px/1.8 system-ui;background:#fafaf8;color:#293732;padding:70px;max-width:1000px}h1{font-size:36px}p{margin-top:35px}textarea,input{font:18px system-ui;display:block;margin-top:24px;width:400px}</style><h1>A small window into physics</h1><p id="sample">Learn physics and explore the world.</p><p>Every question is a starting point for discovery.</p><textarea id="input">A selected sentence inside a text field.</textarea><input id="password" type="password" value="secret-password">`}));
    await page.goto('https://selection-translator.test/');
    await page.bringToFront();
    const cdp = await context.newCDPSession(page);
    await cdp.send('DOM.enable');
    async function nodeById(target) {
      const {root} = await cdp.send('DOM.getDocument', {depth:-1, pierce:true});
      function find(node) {
        const attrs = node.attributes || [];
        for (let i=0;i<attrs.length;i+=2) if (attrs[i] === 'id' && attrs[i+1] === target) return node;
        for (const child of [...(node.children || []), ...(node.shadowRoots || [])]) { const found=find(child); if(found) return found; }
      }
      return find(root);
    }
    async function property(target, expression) {
      const node = await nodeById(target);
      if (!node) return null;
      const {object} = await cdp.send('DOM.resolveNode', {nodeId:node.nodeId});
      const result = await cdp.send('Runtime.callFunctionOn', {objectId:object.objectId, functionDeclaration:`function(){return ${expression};}`, returnByValue:true});
      return result.result.value;
    }
    async function waitProperty(target, expression, expected) {
      for(let i=0;i<60;i++) { const value=await property(target,expression); if(value===expected) return; await wait(80); }
      throw new Error(`${target}: expected ${expected}, got ${await property(target,expression)}`);
    }
    async function clickShadow(target) {
      const rect = await property(target,'(()=>{const r=this.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()');
      assert.ok(rect, `missing ${target}`); await page.mouse.click(rect.x,rect.y);
    }
    async function selectLine() {
      await page.mouse.click(40,60);
      const rect = await page.locator('#sample').evaluate(el => {
        const range = document.createRange(); range.selectNodeContents(el);
        const r = range.getBoundingClientRect(); return {left:r.left,right:r.right,y:r.top+r.height/2};
      });
      await page.mouse.move(rect.left,rect.y); await page.mouse.down();
      await page.mouse.move(rect.right+2,rect.y,{steps:12}); await page.mouse.up();
      await waitProperty('toolbar','this.hidden',false);
    }
    // Some reading apps stop mouse events from bubbling to document.
    await page.locator('#sample').evaluate(el => {
      el.addEventListener('mouseup',e => e.stopPropagation());
      el.addEventListener('pointerup',e => e.stopPropagation());
    });
    await selectLine();
    const toolbarSize = await property('toolbar','({width:this.offsetWidth,height:this.offsetHeight})');
    assert.ok(toolbarSize.width <= 240 && toolbarSize.height <= 36);
    const before = await worker.evaluate(() => __requests.length);
    await page.screenshot({path:path.join(output,'toolbar.png')});
    await wait(150);
    assert.equal(await worker.evaluate(() => __requests.length),before,'selecting must not call the API');
    await clickShadow('trigger');
    await waitProperty('status','this.textContent','翻译完成');
    assert.equal(await property('result','this.textContent'), '学习物理，探索世界。');
    assert.equal(await property('original','this.textContent'), 'Learn physics and explore the world.');
    const panelSize = await property('panel','({width:this.offsetWidth,height:this.offsetHeight})');
    assert.equal(panelSize.width,240); assert.ok(panelSize.height < 110);
    await page.screenshot({path:path.join(output,'translation.png')});
    const last = await worker.evaluate(() => __requests.at(-1));
    assert.equal(last.url, 'https://api.openai.com/v1/responses');
    assert.equal(last.body.input, 'Learn physics and explore the world.');
    assert.equal(last.body.store, false);
    assert.equal(last.body.model,'gpt-6-luna');
    assert.deepEqual(last.body.reasoning,{effort:'none'});
    console.log('PASS: native drag with stopped bubbling, compact toolbar/panel, click-only API requests');
    await page.evaluate(() => {document.body.style.minHeight='3000px';getSelection().removeAllRanges();});
    const beforeScroll = await property('panel','this.getBoundingClientRect().top');
    const requestsBeforeScroll = await worker.evaluate(() => __requests.length);
    await page.mouse.move(950,600); await page.mouse.wheel(0,90);
    await page.waitForFunction(() => scrollY >= 80);
    await waitProperty('panel',`this.getBoundingClientRect().top < ${beforeScroll-50}`,true);
    await waitProperty('panel','this.hidden',false);
    assert.equal(await property('result','this.textContent'),'学习物理，探索世界。');
    await page.evaluate(() => scrollTo(0,700));
    await page.waitForFunction(() => scrollY === 700);
    await waitProperty('panel','this.getBoundingClientRect().top <= 9',true);
    assert.equal(await property('panel','this.hidden'),false);
    assert.equal(await property('panel','this.getBoundingClientRect().bottom <= innerHeight'),true);
    await page.evaluate(() => scrollTo(0,0));
    await page.waitForFunction(() => scrollY === 0);
    await waitProperty('panel',`Math.abs(this.getBoundingClientRect().top - ${beforeScroll}) < 1`,true);
    assert.equal(await worker.evaluate(() => __requests.length),requestsBeforeScroll);
    console.log('PASS: page scrolling follows the original range, stays on screen, and does not repeat requests');
    await page.keyboard.press('Escape');
    await waitProperty('panel','this.hidden',true);
    await wait(100); await waitProperty('toolbar','this.hidden',true);
    const requestsBeforeRepeat = await worker.evaluate(() => __requests.length);
    await selectLine(); await clickShadow('trigger');
    await waitProperty('status','this.textContent','翻译完成');
    assert.equal(await worker.evaluate(() => __requests.length),requestsBeforeRepeat);
    await page.keyboard.press('Escape');
    console.log('PASS: repeated translation reuses cache without another API call');

    await page.evaluate(() => {
      const sample=document.querySelector('#sample'), scroller=document.createElement('div');
      scroller.id='reader';scroller.style.cssText='height:180px;overflow:auto;border:1px solid #ddd';
      sample.before(scroller);scroller.append(sample);sample.style.marginTop='60px';
      const spacer=document.createElement('div');spacer.style.height='1000px';scroller.append(spacer);
    });
    await selectLine(); await clickShadow('trigger');
    await waitProperty('status','this.textContent','翻译完成');
    const beforeReaderScroll=await property('panel','this.getBoundingClientRect().top');
    await page.locator('#reader').evaluate(el=>{el.scrollTop=40;});
    await waitProperty('panel',`Math.abs(this.getBoundingClientRect().top - ${beforeReaderScroll-40}) < 1`,true);
    assert.equal(await property('panel','this.hidden'),false);
    // Internal translation scrolling must not move or close the panel.
    await property('result',"(this.textContent='Long translation. '.repeat(800))");
    await page.evaluate(()=>window.dispatchEvent(new Event('resize')));
    const panelTopBeforeInternal=await property('panel','this.getBoundingClientRect().top');
    await property('result','(this.scrollTop=100)');
    assert.ok(await property('result','this.scrollTop > 0'));
    assert.equal(await property('panel','this.hidden'),false);
    assert.equal(await property('panel','this.getBoundingClientRect().top'),panelTopBeforeInternal);
    await page.keyboard.press('Escape');
    await page.evaluate(()=>{const reader=document.querySelector('#reader'),sample=document.querySelector('#sample');reader.before(sample);reader.remove();sample.style.marginTop='';});
    console.log('PASS: nested reader scroll follows the source; internal result scroll keeps the panel open');

    await page.locator('#sample').evaluate(el => {el.innerHTML='Learn physics with an <span id="word">expedition</span>.';});
    await page.locator('#word').dblclick();
    await waitProperty('toolbar','this.hidden',false);
    await clickShadow('trigger');
    await waitProperty('status','this.textContent','翻译完成');
    assert.equal(await property('original','this.textContent'),'expedition');
    await clickShadow('more'); await clickShadow('showOriginal');
    await waitProperty('original','this.hidden',false);
    await page.keyboard.press('Escape');
    await page.locator('#sample').evaluate(el => {el.textContent='Learn physics and explore the world.';});
    console.log('PASS: double-click word selection and collapsed extra actions');

    await selectLine(); await clickShadow('ask');
    await waitProperty('studyStatus','this.textContent','');
    assert.match(await property('turns','this.textContent'), /第一段解释/);
    await clickShadow('question'); await page.keyboard.insertText('这里指什么？'); await page.keyboard.press('Enter');
    await waitProperty('turns','this.children.length',2);
    await waitProperty('studyStatus','this.textContent','');
    const followup = await worker.evaluate(() => __requests.at(-1).body.input);
    assert.deepEqual(followup.map(x => x.role), ['user','user','assistant','user']);
    assert.equal(followup.at(-1).content,'这里指什么？');
    assert.match(followup[0].content,/Learn physics/);
    async function clickStudyAction(label) {
      const rect = await property('turns', `(()=>{const b=[...this.querySelectorAll('button')].findLast(b=>b.textContent===${JSON.stringify(label)});b.scrollIntoView({block:'nearest'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()`);
      await page.mouse.click(rect.x,rect.y);
    }
    await clickStudyAction('收藏问答');
    await waitProperty('turns',"this.textContent.includes('已收藏')",true);
    await page.keyboard.press('Escape');
    await selectLine(); await clickShadow('vocab');
    await waitProperty('turns',"this.textContent.includes('物理学')",true);
    await clickStudyAction('加入生词本');
    await waitProperty('turns',"this.textContent.includes('已加入生词本')",true);
    const opening = context.waitForEvent('page'); await clickShadow('openLibrary');
    const book = await opening; await book.waitForLoadState();
    await book.getByRole('heading',{name:'physics',exact:true}).waitFor();
    await book.locator('#search').fill('unmatched');
    await book.getByText('没有匹配的收藏。').waitFor();
    await book.locator('#search').fill('物理学');
    await book.getByRole('heading',{name:'physics',exact:true}).waitFor();
    await book.reload(); await book.locator('#answers').click();
    await book.getByRole('heading',{name:'这里指什么？'}).waitFor();
    await book.getByRole('button',{name:'删除',exact:true}).click();
    await book.getByText('共 0 条').waitFor();
    await book.locator('#words').click();
    await book.getByRole('heading',{name:'physics',exact:true}).waitFor();
    await book.close(); await page.bringToFront(); await page.keyboard.press('Escape');
    console.log('PASS: selection Q&A, follow-up with context, word lookup, persistent collections, search and deletion');

    await worker.evaluate(() => { __mode = 'slow'; });
    await selectLine(); await clickShadow('trigger');
    await waitProperty('status','this.textContent','翻译完成');
    const requestsBeforeRetry = await worker.evaluate(() => __requests.length);
    await clickShadow('more'); await clickShadow('retry');
    await waitProperty('status','this.textContent','正在翻译…');
    await wait(100);
    assert.equal(await worker.evaluate(() => __requests.length),requestsBeforeRetry+1);
    await page.mouse.move(950,600); await page.mouse.wheel(0,90);
    await page.waitForFunction(() => scrollY >= 80);
    await waitProperty('panel','this.hidden',false);
    assert.equal(await property('status','this.textContent'),'正在翻译…');
    await page.evaluate(()=>scrollTo(0,0));
    await page.waitForFunction(()=>scrollY===0);
    await page.keyboard.press('Escape');
    await waitProperty('panel','this.hidden',true);
    await worker.evaluate(() => { __mode = 'success'; });
    await selectLine(); await clickShadow('trigger');
    await waitProperty('status','this.textContent','翻译完成');
    console.log('PASS: cancellation and a new translation after cancellation');
    await page.keyboard.press('Escape');

    await worker.evaluate(() => { __mode = 'unauthorized'; });
    await selectLine(); await clickShadow('trigger');
    await waitProperty('status','this.textContent','翻译完成');
    await clickShadow('more'); await clickShadow('retry');
    await waitProperty('status','this.textContent','API 密钥无效，请到设置页更新。');
    console.log('PASS: authentication error shown in the page');
    await page.keyboard.press('Escape');
    await worker.evaluate(() => { __mode = 'success'; });

    await page.locator('#input').focus();
    await page.locator('#input').evaluate(el => el.setSelectionRange(0,19));
    await page.keyboard.press('Shift');
    await waitProperty('toolbar','this.hidden',false);
    await clickShadow('trigger');
    await waitProperty('status','this.textContent','翻译完成');
    assert.equal(await property('original','this.textContent'),'A selected sentence');
    await page.keyboard.press('Escape');
    await page.locator('#password').focus();
    await page.locator('#password').evaluate(el => el.select());
    await page.keyboard.press('Shift');
    await waitProperty('toolbar','this.hidden',true);
    console.log('PASS: text field selection and password field exclusion');

    await options.locator('#bubble').uncheck();
    await options.locator('button[type="submit"]').click();
    await options.waitForFunction(() => document.querySelector('#status').textContent.startsWith('已保存'));
    await page.bringToFront();
    await page.locator('#sample').click();
    await page.locator('#sample').evaluate(el => {const r=document.createRange();r.selectNodeContents(el);const s=getSelection();s.removeAllRanges();s.addRange(r);});
    await wait(150); await waitProperty('toolbar','this.hidden',true);
    await options.locator('#bubble').check();
    await options.locator('button[type="submit"]').click();
    await options.waitForFunction(() => document.querySelector('#status').textContent.startsWith('已保存'));
    await page.bringToFront(); await selectLine();
    await waitProperty('toolbar','this.hidden',false);
    console.log('PASS: visibility preference takes effect without a page reload');

    const popup = await context.newPage();
    await popup.goto(`chrome-extension://${id}/popup.html`);
    await popup.locator('#source').fill('Hello, world.');
    await popup.locator('#translate').click();
    await popup.waitForFunction(() => document.querySelector('#status').textContent === '翻译完成');
    assert.equal(await popup.locator('#result').textContent(),'学习物理，探索世界。');
    await popup.locator('#vocab').click();
    const popupCdp = await context.newCDPSession(popup);
    async function popupStudyContains(text) {
      const {nodes} = await popupCdp.send('DOM.getFlattenedDocument', {depth:-1,pierce:true});
      return nodes.some(node => node.nodeValue.includes(text));
    }
    await popupCdp.send('DOM.enable');
    for (let i=0;i<60 && !(await popupStudyContains('物理学'));i++) await wait(50);
    assert.ok(await popupStudyContains('物理学'));
    await popup.locator('#ask').click();
    for (let i=0;i<60 && !(await popupStudyContains('第一段解释。'));i++) await wait(50);
    assert.ok(await popupStudyContains('第一段解释。'));
    const publicConfig = await popup.evaluate(() => chrome.runtime.sendMessage({type:'PUBLIC_SETTINGS'}));
    assert.ok(!Object.hasOwn(publicConfig,'apiKey'));
    await options.locator('#delete').click();
    await options.waitForFunction(() => document.querySelector('#status').textContent === '密钥已删除。');
    await popup.locator('#translate').click();
    await popup.waitForFunction(() => document.querySelector('#status').textContent.includes('先在设置页填写'));
    assert.deepEqual(errors, []);
    console.log('PASS: manual translation, no secret in public config, key deletion, missing-key error');
    console.log('PASS: all browser smoke checks; no page errors');
  } finally { await context.close(); }
})().catch(error=>{console.error(error);process.exitCode=1;});
