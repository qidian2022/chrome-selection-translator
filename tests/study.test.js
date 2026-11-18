import test from 'node:test';
import assert from 'node:assert/strict';
import {parseWords, studyPrompt} from '../study-api.js';
import {saveEntry} from '../library-store.js';

test('follow-ups carry the source, recent complete turns and current question', () => {
  const history = Array.from({length: 8}, (_, n) => ({question: 'Q' + n, answer: 'A' + n}));
  const {input} = studyPrompt('ask', 'selected', ' next ', history);
  assert.match(input[0].content, /selected/);
  assert.deepEqual(input[1], {role:'user', content:'Q2'});
  assert.deepEqual(input.at(-2), {role:'assistant', content:'A7'});
  assert.deepEqual(input.at(-1), {role:'user', content:'next'});
  assert.throws(() => studyPrompt('ask', 'text', ' '), /问题/);
  assert.throws(() => studyPrompt('ask', 'text', 'x'.repeat(2001)), /问题/);
});
test('vocabulary handles fenced JSON, missing optional fields, duplicates, and empty or invalid results', () => {
  assert.deepEqual(parseWords('```json\n[{"word":"Flux","meaning":"通量"},{"word":"flux","meaning":"重复"}]\n```'), [{word:'Flux',meaning:'通量',example:'',pos:'',phonetic:''}]);
  assert.deepEqual(parseWords('[]'), []);
  assert.throws(() => parseWords('not JSON'), /格式/);
  assert.throws(() => parseWords('[{}]'), /释义/);
});
test('simultaneous saves use distinct stable keys per word and per answer', async () => {
  const rows = {};
  globalThis.chrome = {storage:{local:{set: async data => Object.assign(rows,data)}}};
  await Promise.all([saveEntry('word',{word:'Flux', meaning:'通量'}), saveEntry('word',{word:'Field',meaning:'场'})]);
  await saveEntry('word',{word:'flux',meaning:'磁通量',source:'flux through a loop'});
  await saveEntry('answer',{source:'flux',question:'为什么？',answer:'答复'});
  assert.equal(Object.keys(rows).length,3);
  assert.ok(Object.values(rows).some(row => row.meaning === '磁通量'));
  await assert.rejects(saveEntry('word',{word:'Flux'}), /完整/);
});
