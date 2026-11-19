import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { match, TPS } from './policy.js';
import { Limiter } from './limiter.js';
import { Cache } from './cache.js';

export function createGateway({ baseUrl, tokens, verify, allowedOrigin = '', fetchImpl = fetch, limiter = new Limiter(TPS), cache = new Cache(), health = () => ({}), timeoutMs = 10_000, internalKey = '', statsUrl = '' }) {
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
      // 토스가 응답하지 않으면 10초 뒤 실패 처리 (같은 요청을 기다리는 다른 사용자까지 묶이지 않게)
      const r = await fetchImpl(`${baseUrl}${path}${qs}`, { headers, signal: AbortSignal.timeout(timeoutMs) })
        .catch((e) => { throw Object.assign(new Error(e.name === 'TimeoutError' ? 'upstream_timeout' : 'upstream_unreachable'), { status: 504 }); });
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

  const keyBuf = Buffer.from(internalKey);
  const isInternal = (v) => {
    if (internalKey.length < 32 || typeof v !== 'string') return false; // 짧은 키는 쓰지 않는다
    const b = Buffer.from(v);
    return b.length === keyBuf.length && timingSafeEqual(b, keyBuf);
  };

  return http.createServer(async (req, res) => {
    // ALLOWED_ORIGIN: 쉼표로 여러 개 가능. 요청 Origin 이 목록에 있을 때만 CORS 허용.
    const origin = req.headers.origin;
    const cors = origin && allowedOrigin.split(',').map((o) => o.trim()).includes(origin)
      ? { 'access-control-allow-origin': origin, 'access-control-allow-headers': 'authorization', vary: 'origin' }
      : {};
    try {
      const url = new URL(req.url, 'http://x');
      if (req.method === 'OPTIONS') return send(res, 204, '', cors);
      if (url.pathname === '/healthz') return send(res, 200, { ok: true, token: tokens.status(), ...health() }, cors);

      // 인증: 주인(Firebase ID 토큰) 또는 같은 VM 의 수집기(내부 키)
      if (!isInternal(req.headers['x-internal-key'])) {
        const m = /^Bearer (.+)$/.exec(req.headers.authorization || '');
        if (!m) return send(res, 401, { error: 'unauthorized' }, cors);
        try { await verify(m[1]); } catch (e) { console.error('auth failed:', e.message); return send(res, 403, { error: 'forbidden' }, cors); }
      }

      // 수집기 통계(백테스트 등)는 VM 안의 수집기로 넘긴다
      if (url.pathname.startsWith('/stats/') && req.method === 'GET') {
        if (!statsUrl) return send(res, 404, { error: 'stats_disabled' }, cors);
        const r = await fetchImpl(`${statsUrl}${url.pathname}${url.search}`, { signal: AbortSignal.timeout(timeoutMs) })
          .catch(() => { throw Object.assign(new Error('stats_unreachable'), { status: 503 }); });
        return send(res, r.status, await r.text(), cors);
      }

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
