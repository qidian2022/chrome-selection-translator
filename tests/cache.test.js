import test from 'node:test';
import assert from 'node:assert/strict';
import {TranslationCache} from '../cache.js';

test('repeated text is reused only for the same model and before expiry', () => {
  let now = 0;
  const cache = new TranslationCache({ttl: 100, now: () => now});
  cache.set('luna', 'Hello', '你好');
  assert.equal(cache.get('luna', 'Hello'), '你好');
  assert.equal(cache.get('terra', 'Hello'), null);
  assert.equal(cache.get('luna', 'Different'), null);
  now = 100;
  assert.equal(cache.get('luna', 'Hello'), null);
});
test('cache is bounded and retains recently used entries', () => {
  const cache = new TranslationCache({limit: 2});
  cache.set('luna', 'one', '一'); cache.set('luna', 'two', '二');
  cache.get('luna', 'one'); cache.set('luna', 'three', '三');
  assert.equal(cache.get('luna', 'two'), null);
  assert.equal(cache.get('luna', 'one'), '一');
  assert.equal(cache.get('luna', 'three'), '三');
});
test('retry invalidates one result and credential changes can clear all results', () => {
  const cache = new TranslationCache();
  cache.set('luna', 'one', '一'); cache.set('luna', 'two', '二');
  cache.delete('luna', 'one');
  assert.equal(cache.get('luna', 'one'), null);
  assert.equal(cache.get('luna', 'two'), '二');
  cache.clear(); assert.equal(cache.get('luna', 'two'), null);
});
