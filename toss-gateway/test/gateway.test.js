import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { createGateway } from '../src/server.js';
import { TokenManager } from '../src/token.js';
import { Limiter } from '../src/limiter.js';
import { match } from '../src/policy.js';

function mockToss() {
  const s = { tokens: 0, calls: [], revokeNext: false };
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      const j = (st, o) => { res.writeHead(st, { 'content-type': 'application/json' }); res.end(JSON.stringify(o)); };
      if (req.url === '/oauth2/token') {
        assert.equal(req.headers['content-type'], 'application/x-www-form-urlencoded');
        assert.match(body, /grant_type=client_credentials/);
        s.tokens++;
        return j(200, { access_token: `tok${s.tokens}`, token_type: 'Bearer', expires_in: 86400 });
      }
      s.calls.push({ url: req.url, auth: req.headers.authorization, acct: req.headers['x-tossinvest-account'] });
      if (s.revokeNext) { s.revokeNext = false; return j(401, { error: { code: 'token-revoked' } }); }
      if (req.url.startsWith('/api/v1/accounts')) return j(200, { result: [{ accountSeq: 7 }] });
      return j(200, { result: { ok: true, url: req.url } });
    });
  });
  return new Promise((r) => server.listen(0, '127.0.0.1', () => r({ server, s, url: `http://127.0.0.1:${server.address().port}` })));
}

async function setup() {
  const toss = await mockToss();
  const tokens = new TokenManager({ baseUrl: toss.url, clientId: 'id', clientSecret: 'sec' });
  const verify = async (t) => { if (t !== 'owner') throw new Error('bad'); };
  const gw = createGateway({ baseUrl: toss.url, tokens, verify, allowedOrigin: 'https://app.example, http://localhost:3000' });
  await new Promise((r) => gw.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${gw.address().port}`;
  const get = (p, auth = 'owner', method = 'GET') => fetch(base + p, { method, headers: auth ? { authorization: `Bearer ${auth}` } : {} });
  return { toss, get, base, close: () => { gw.close(); toss.server.close(); } };
}

test('인증: 토큰 없음 401, 남의 토큰 403, healthz 는 공개', async () => {
  const t = await setup();
  assert.equal((await t.get('/api/v1/prices?symbols=005930', null)).status, 401);
  assert.equal((await t.get('/api/v1/prices?symbols=005930', 'stranger')).status, 403);
  assert.equal((await t.get('/healthz', null)).status, 200);
  assert.equal(t.toss.s.calls.length, 0);
  t.close();
});

test('GET 이외(주문)와 허용 안 된 경로는 차단, 토스까지 가지 않음', async () => {
  const t = await setup();
  assert.equal((await t.get('/api/v1/orders', 'owner', 'POST')).status, 403);
  assert.equal((await t.get('/api/v1/orders')).status, 404);
  assert.equal((await t.get('/oauth2/token')).status, 404);
  assert.equal(t.toss.s.calls.length, 0);
  t.close();
});

test('토큰 1회만 발급, 동일 요청은 캐시, 쿼리 순서 무관', async () => {
  const t = await setup();
  const rs = await Promise.all([1, 2, 3].map(() => t.get('/api/v1/candles?symbol=005930&interval=1d')));
  rs.forEach((r) => assert.equal(r.status, 200));
  await t.get('/api/v1/candles?interval=1d&symbol=005930');
  assert.equal(t.toss.s.tokens, 1);
  assert.equal(t.toss.s.calls.length, 1);
  assert.equal(t.toss.s.calls[0].auth, 'Bearer tok1');
  t.close();
});

test('401 이면 토큰 재발급 후 1회 재시도', async () => {
  const t = await setup();
  t.toss.s.revokeNext = true;
  const r = await t.get('/api/v1/prices?symbols=000660');
  assert.equal(r.status, 200);
  assert.equal(t.toss.s.tokens, 2);
  assert.equal(t.toss.s.calls.at(-1).auth, 'Bearer tok2');
  t.close();
});

test('계좌 API 는 accountSeq 헤더를 자동 첨부', async () => {
  const t = await setup();
  assert.equal((await t.get('/api/v1/holdings')).status, 200);
  const h = t.toss.s.calls.find((c) => c.url.startsWith('/api/v1/holdings'));
  assert.equal(h.acct, '7');
  t.close();
});

test('리미터: 초과분은 대기, 대기 한도 넘으면 429', async () => {
  let now = 0;
  const l = new Limiter({ G: 1 }, 1500, () => now);
  await l.acquire('G'); // 버스트 1
  const p = l.acquire('G'); // 1초 대기 예약
  now += 1000;
  await p;
  await l.acquire('G').catch(() => {}); // 이미 예약된 슬롯 소진 후
  await assert.rejects(async () => { await l.acquire('G'); await l.acquire('G'); await l.acquire('G'); }, { status: 429 });
});

test('정책: 주요 경로가 올바른 그룹으로 분류', () => {
  assert.equal(match('/api/v1/stocks/all').group, 'STOCK_ALL');
  assert.equal(match('/api/v1/sectors/rankings').group, 'SECTOR_RANKING');
  assert.equal(match('/api/v1/stocks/005930/investor-trading').group, 'STOCK_TRADING_TREND');
  assert.equal(match('/api/v1/market-indicators/KOSPI/candles').group, 'MARKET_INDICATOR_CHART');
  assert.equal(match('/api/v1/orders'), null);
});

test('CORS: 허용 목록의 Origin 만 헤더를 받는다', async () => {
  const t = await setup();
  const hit = await fetch(t.base + '/healthz', { headers: { origin: 'http://localhost:3000' } });
  assert.equal(hit.headers.get('access-control-allow-origin'), 'http://localhost:3000');
  const miss = await fetch(t.base + '/healthz', { headers: { origin: 'https://evil.example' } });
  assert.equal(miss.headers.get('access-control-allow-origin'), null);
  t.close();
});
