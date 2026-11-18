import test from 'node:test';
import assert from 'node:assert/strict';
import {translate, readEvents, validateText, ENDPOINT} from '../api.js';

function stream(events, chunkSize = 7) {
  const bytes = new TextEncoder().encode(events.map(e => `event: ${e.type}\r\ndata: ${JSON.stringify(e)}\r\n\r\n`).join(''));
  let offset = 0;
  return new ReadableStream({pull(c) { if (offset >= bytes.length) c.close(); else { c.enqueue(bytes.slice(offset, offset + chunkSize)); offset += chunkSize; } }});
}
const delta = text => ({type: 'response.output_text.delta', delta: text});
const complete = {type: 'response.completed'};
const success = events => async () => new Response(stream(events), {status: 200});

test('SSE handles split UTF-8, CRLF, and event boundaries', async () => {
  const events = [delta('早上好，世界。'), complete];
  const result = [];
  for await (const event of readEvents(stream(events, 1))) result.push(event);
  assert.deepEqual(result, events);
});
test('request sends only chosen text to official endpoint, with storage off', async () => {
  let request;
  const result = await translate({text: 'Hello', apiKey: 'test-key', fetchImpl: async (url, init) => {
    request = {url, ...init}; return new Response(stream([delta('你'), delta('好'), complete]));
  }});
  assert.equal(result, '你好');
  assert.equal(request.url, ENDPOINT);
  assert.equal(request.headers.Authorization, 'Bearer test-key');
  assert.equal(request.redirect, 'error');
  const body = JSON.parse(request.body);
  assert.equal(body.store, false); assert.equal(body.input, 'Hello'); assert.equal(body.stream, true);
  assert.equal(body.model, 'gpt-6-luna');
  assert.deepEqual(body.reasoning, {effort: 'none'});
});
test('custom models do not receive Luna-only reasoning settings', async () => {
  let body;
  await translate({text: 'Hello', apiKey: 'test', model: 'gpt-4.1-mini', fetchImpl: async (_, init) => {
    body = JSON.parse(init.body); return new Response(stream([delta('你好'), complete]));
  }});
  assert.equal(body.model, 'gpt-4.1-mini');
  assert.equal(Object.hasOwn(body, 'reasoning'), false);
});
test('deltas reach UI before completion', async () => {
  const deltas = [];
  await translate({text: 'Hello', apiKey: 'test', fetchImpl: success([delta('你'), delta('好'), complete]), onDelta: x => deltas.push(x)});
  assert.deepEqual(deltas, ['你', '好']);
});
test('rejects empty and too-long inputs before network request', async () => {
  assert.throws(() => validateText('  '), /选中/);
  assert.throws(() => validateText('a'.repeat(12001)), /12,000/);
  let called = false;
  await assert.rejects(translate({text: 'Hello', apiKey: '', fetchImpl: async () => { called = true; }}), /密钥/);
  assert.equal(called, false);
});
test('HTTP errors use useful messages without echoing server secrets', async () => {
  for (const [status, code, pattern] of [[401,'invalid_api_key',/密钥无效/],[404,'model_not_found',/模型不存在/],[429,'insufficient_quota',/额度不足/],[429,'rate_limit',/频繁/],[500,'internal',/暂时不可用/]]) {
    await assert.rejects(translate({text: 'Hello', apiKey: 'test', fetchImpl: async () => new Response(JSON.stringify({error: {code, message: 'secret must not be shown'}}), {status})}), pattern);
  }
});
test('partial and truncated streams cannot be reported as completed', async () => {
  for (const events of [[delta('部分')],[delta('部分'),{type:'response.incomplete'}]]) {
    await assert.rejects(translate({text:'Hello',apiKey:'test',fetchImpl:success(events)}), /尚未完成/);
  }
});
test('empty response and refusal are handled', async () => {
  await assert.rejects(translate({text:'Hello',apiKey:'test',fetchImpl:success([complete])}), /空译文/);
  await assert.rejects(translate({text:'Hello',apiKey:'test',fetchImpl:success([{type:'response.refusal.delta'}])}), /未翻译/);
});
test('user cancellation aborts in-flight request', async () => {
  const controller = new AbortController();
  const pending = translate({text:'Hello',apiKey:'test',signal:controller.signal,fetchImpl:async (_, init) => new Promise((resolve,reject) => {
    init.signal.addEventListener('abort', () => reject(new DOMException('Aborted','AbortError')));
  })});
  controller.abort();
  await assert.rejects(pending, /已停止/);
});
test('network errors show the service host', async () => {
  await assert.rejects(translate({text:'Hello',apiKey:'test',fetchImpl:async () => {throw new TypeError('Failed to fetch');}}), /api\.openai\.com/);
});
test('malformed SSE is rejected', async () => {
  const body = new ReadableStream({start(c) { c.enqueue(new TextEncoder().encode('data: {bad}\n\n')); c.close(); }});
  await assert.rejects(async () => { for await (const event of readEvents(body)) void event; }, /格式异常/);
});

test('compatible APIs receive chat messages, stream content, and detect truncated completions', async () => {
  const endpoint = 'https://api.deepseek.com/chat/completions';
  let body;
  const event = (content, finish_reason = null) => ({choices:[{delta:{content},finish_reason}]});
  const run = events => translate({text:'Hello', endpoint, model:'deepseek-flash', apiKey:'test', fetchImpl:async (url, init) => {
    assert.equal(url,endpoint);
    body = JSON.parse(init.body);
    return new Response(stream(events));
  }});
  assert.equal(await run([event('你好'),event('', 'stop')]), '你好');
  assert.equal(body.messages[0].role,'system');
  assert.deepEqual(body.messages[1],{role:'user',content:'Hello'});
  assert.equal(body.model,'deepseek-flash');
  assert.equal(body.instructions,undefined);
  await assert.rejects(run([event('半句')]), /尚未完成/);
  await assert.rejects(run([event('半句','length')]), /尚未完成/);
});

test('custom endpoints retain base paths, allow local HTTP and accept full completion addresses', async () => {
  const {endpointFor,hostPattern} = await import('../providers.js');
  assert.equal(endpointFor('custom','https://api.example.net/compatible/v1/'),'https://api.example.net/compatible/v1/chat/completions');
  const local = 'http://127.0.0.1:11434/v1/chat/completions';
  assert.equal(endpointFor('custom',local),local);
  assert.equal(hostPattern(local),'http://127.0.0.1/*');
  for (const url of ['http://api.example.net/v1','https://user:pass@example.net','https://example.net?key=test'])
    assert.throws(() => endpointFor('custom',url));
});

test('local compatible HTTP service receives a keyless follow-up and returns only the streamed answer', async t => {
  const {createServer} = await import('node:http');
  const {requestText} = await import('../api.js');
  const {studyPrompt} = await import('../study-api.js');
  let received;
  const server = createServer(async (req, res) => {
    let data = '';
    for await (const chunk of req) data += chunk;
    received = {url:req.url, auth:req.headers.authorization, messages:JSON.parse(data).messages};
    res.writeHead(200, {'Content-Type':'text/event-stream'});
    for (const choice of [{delta:{reasoning_content:'思考中'}}, {delta:{content:'通量'},finish_reason:'stop'}])
      res.write('data: ' + JSON.stringify({choices:[choice]}) + '\n\n');
    res.end('data: [DONE]\n\n');
  });
  await new Promise((resolve,reject) => { server.once('error',reject); server.listen(0,'127.0.0.1',resolve); });
  t.after(() => new Promise(resolve => server.close(resolve)));
  const endpoint = 'http://127.0.0.1:' + server.address().port + '/v1/chat/completions';
  const prompt = studyPrompt('ask','flux','再举一例',[{question:'是什么？',answer:'穿过曲面的量。'}]);
  assert.equal(await requestText({...prompt,endpoint,model:'local/model',apiKey:''}), '通量');
  assert.equal(received.auth,undefined);
  assert.equal(received.url,'/v1/chat/completions');
  assert.deepEqual(received.messages.map(m=>m.role),['system','user','user','assistant','user']);
});
