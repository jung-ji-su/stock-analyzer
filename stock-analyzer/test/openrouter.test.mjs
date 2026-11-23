import test, { mock } from 'node:test';
import assert from 'node:assert/strict';

mock.module(new URL('../lib/opsLog.js', import.meta.url).href, { namedExports: { recordAiCall: async () => {} } });
mock.module('jsonrepair', { namedExports: { jsonrepair: (s) => s } });
const { askAI } = await import('../lib/openrouter.js');

const reply = (content, finish = 'stop') => ({ json: async () => ({ choices: [{ message: { content }, finish_reason: finish }] }) });

test('askAI: 동시에 보내고 가장 먼저 온 쓸 만한 답을 쓴다', async () => {
  process.env.OPENROUTER_API_KEY = 'k';
  const seen = [];
  globalThis.fetch = async (url, { body, signal }) => {
    const { model } = JSON.parse(body);
    seen.push(model);
    if (model === 'a') return reply('', 'length'); // 빈 응답
    if (model === 'b') { await new Promise((r, j) => { const t = setTimeout(r, 300); signal.addEventListener('abort', () => { clearTimeout(t); j(signal.reason); }); }); return reply('{"x":2}'); }
    return reply('{"x":3}');
  };
  const t0 = Date.now();
  const out = await askAI({ models: ['a', 'b', 'c', 'd'], messages: [] });
  assert.deepEqual(out, { x: 3 });
  assert.ok(Date.now() - t0 < 250); // 느린 b 를 기다리지 않음
  assert.deepEqual(seen.sort(), ['a', 'b', 'c']); // 앞 3개만 동시에, d 는 안 보냄
});

test('askAI: 앞쪽이 모두 실패하면 남은 모델을 차례로', async () => {
  globalThis.fetch = async (url, { body }) => (JSON.parse(body).model === 'd' ? reply('{"ok":1}') : reply('글만'));
  assert.deepEqual(await askAI({ models: ['a', 'b', 'c', 'd'], messages: [] }), { ok: 1 });
  globalThis.fetch = async () => reply('', 'length');
  assert.equal(await askAI({ models: ['a', 'b'], messages: [] }), null);
});
