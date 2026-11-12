import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { WebSocketServer, WebSocket } from 'ws';
import { attachStream } from '../src/stream.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const quiet = { error() {}, warn() {} };

async function setup() {
  // 모의 토스 WS 서버
  const up = { auths: [], declared: [], conns: [] };
  const upHttp = http.createServer();
  const upWss = new WebSocketServer({ server: upHttp });
  upWss.on('connection', (ws, req) => {
    up.auths.push(req.headers.authorization);
    up.conns.push(ws);
    ws.on('message', (b) => { const t = b.toString(); if (t !== 'PING') up.declared.push(JSON.parse(t)); });
  });
  await new Promise((r) => upHttp.listen(0, '127.0.0.1', r));

  const server = http.createServer();
  const stream = attachStream(server, {
    verify: async (t) => { if (t !== 'owner') throw new Error('bad'); },
    tokens: { get: async () => 'tok1', invalidate() {} },
    upstreamUrl: `ws://127.0.0.1:${upHttp.address().port}`,
    allowedOrigin: 'https://app.example', log: quiet,
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `ws://127.0.0.1:${server.address().port}/ws`;

  const client = async (token = 'owner') => {
    const ws = new WebSocket(url, { headers: { origin: 'https://app.example' } });
    const got = [];
    ws.on('message', (b) => got.push(JSON.parse(b.toString())));
    const closed = new Promise((r) => ws.on('close', (code) => r(code)));
    await new Promise((r, j) => { ws.on('open', r); ws.on('error', j); });
    ws.send(JSON.stringify({ type: 'auth', token }));
    return { ws, got, closed };
  };
  return { up, url, client, close() { stream.close(); server.close(); upWss.close(); upHttp.close(); } };
}

test('스트림: 인증 실패는 4403 으로 종료, 허용 안 된 Origin 은 연결 거부', async () => {
  const t = await setup();
  const bad = await t.client('stranger');
  assert.equal(await bad.closed, 4403);
  const evil = new WebSocket(t.url, { headers: { origin: 'https://evil.example' } });
  await new Promise((r) => { evil.on('error', r); evil.on('close', r); });
  assert.equal(t.up.conns.length, 0);
  t.close();
});

test('스트림: 구독 합치기(전체 교체), 토픽별 전달, 잘못된 입력 거절', async () => {
  const t = await setup();
  const a = await t.client(), b = await t.client();
  await sleep(100);
  a.ws.send(JSON.stringify({ type: 'subscribe', topics: [{ type: 'trade:kr', codes: ['005930'] }] }));
  b.ws.send(JSON.stringify({ type: 'subscribe', topics: [{ type: 'trade:kr', codes: ['000660'] }, { type: 'orderbook:us', codes: ['AAPL'] }] }));
  await sleep(700);

  assert.equal(t.up.conns.length, 1, '토스 연결은 1개만');
  assert.equal(t.up.auths[0], 'Bearer tok1');
  const last = t.up.declared.at(-1);
  assert.deepEqual(last, [
    { type: 'orderbook:us', codes: ['AAPL'] },
    { type: 'trade:kr', codes: ['000660', '005930'] },
  ]);

  const frame = (topic) => JSON.stringify({ type: 'message', topic, data: { price: '1', volume: '1', timestamp: 'x', currency: 'KRW' } });
  t.up.conns[0].send(frame('trade:kr:005930'));
  t.up.conns[0].send(frame('orderbook:us:AAPL'));
  await sleep(200);
  assert.deepEqual(a.got.filter((m) => m.type === 'message').map((m) => m.topic), ['trade:kr:005930']);
  assert.deepEqual(b.got.filter((m) => m.type === 'message').map((m) => m.topic), ['orderbook:us:AAPL']);

  a.ws.send(JSON.stringify({ type: 'subscribe', topics: [{ type: 'personal:order', codes: ['3'] }] }));
  a.ws.send(JSON.stringify({ type: 'subscribe', topics: [{ type: 'trade:kr', codes: ['../x'] }] }));
  await sleep(100);
  assert.equal(a.got.filter((m) => m.type === 'error').length, 2);

  // b 가 떠나면 b 의 종목은 선언에서 빠진다
  b.ws.close();
  await sleep(700);
  assert.deepEqual(t.up.declared.at(-1), [{ type: 'trade:kr', codes: ['005930'] }]);
  t.close();
});

test('스트림: 구독 100개 초과는 거절', async () => {
  const t = await setup();
  const a = await t.client();
  await sleep(100);
  const codes = Array.from({ length: 101 }, (_, i) => `A${i}`);
  a.ws.send(JSON.stringify({ type: 'subscribe', topics: [{ type: 'trade:us', codes }] }));
  await sleep(150);
  assert.ok(a.got.some((m) => m.message === 'too-many-subscriptions'));
  t.close();
});
