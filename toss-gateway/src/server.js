import http from 'node:http';
import { match, TPS } from './policy.js';
import { Limiter } from './limiter.js';
import { Cache } from './cache.js';

export function createGateway({ baseUrl, tokens, verify, allowedOrigin = '', fetchImpl = fetch, limiter = new Limiter(TPS), cache = new Cache() }) {
  let accountSeq = null;

  const send = (res, status, body, extra = {}) => {
    res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', ...extra });
    res.end(typeof body === 'string' ? body : JSON.stringify(body));
  };

  async function upstream(path, qs, group, withAccount) {
    for (let attempt = 0; attempt < 2; attempt++) {
      const token = await tokens.get();
      await limiter.acquire(group);
      const headers = { authorization: `Bearer ${token}` };
      if (withAccount) headers['x-tossinvest-account'] = String(await getAccountSeq());
      const r = await fetchImpl(`${baseUrl}${path}${qs}`, { headers });
      if (r.status === 401 && attempt === 0) { tokens.invalidate(token); continue; }
      return { status: r.status, body: await r.text(), retryAfter: r.headers.get('retry-after') };
    }
  }

  async function getAccountSeq() {
    if (accountSeq) return accountSeq;
    const r = await cache.wrap('/api/v1/accounts', 300, () => upstream('/api/v1/accounts', '', 'ACCOUNT', false));
    const list = JSON.parse(r.body)?.result;
    const first = Array.isArray(list) ? list[0] : null;
    accountSeq = first?.accountSeq ?? first?.seq ?? null;
    if (!accountSeq) throw Object.assign(new Error('no_account'), { status: 502 });
    return accountSeq;
  }

  return http.createServer(async (req, res) => {
    const cors = allowedOrigin
      ? { 'access-control-allow-origin': allowedOrigin, 'access-control-allow-headers': 'authorization', vary: 'origin' }
      : {};
    try {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'OPTIONS') return send(res, 204, '', cors);
      if (url.pathname === '/healthz') return send(res, 200, { ok: true }, cors);

      // 인증: 주인(Firebase ID 토큰)만
      const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
      if (!m) return send(res, 401, { error: 'unauthorized' }, cors);
      try { await verify(m[1]); } catch { return send(res, 403, { error: 'forbidden' }, cors); }

      // 이번 단계는 조회 전용. 주문 등 GET 이외는 전부 차단.
      if (req.method !== 'GET') return send(res, 403, { error: 'orders_disabled' }, cors);

      const rule = match(url.pathname);
      if (!rule) return send(res, 404, { error: 'not_allowed' }, cors);

      const params = new URLSearchParams(url.searchParams);
      params.sort();
      const qs = params.size ? `?${params}` : '';
      const out = await cache.wrap(`${url.pathname}${qs}`, rule.ttl, () => upstream(url.pathname, qs, rule.group, rule.account));
      const extra = { ...cors, ...(out.retryAfter ? { 'retry-after': out.retryAfter } : {}) };
      return send(res, out.status, out.body, extra);
    } catch (e) {
      const status = e.status || 502;
      return send(res, status, { error: e.message || 'upstream_error' }, cors);
    }
  });
}
