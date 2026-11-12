// 실시간 중계: 토스 WebSocket 연결은 이 프로세스가 1개만 유지하고, 브라우저 여러 개에 나눠 보낸다.
// 브라우저 프로토콜(JSON):  → {type:'auth',token} → {type:'subscribe',topics:[{type:'trade:kr',codes:['005930']}]}
//                          ← {type:'ready'} / {type:'subscribed',keys:[...]} / {type:'error',message} / 토스 data frame 그대로
import { WebSocketServer, WebSocket } from 'ws';

const MAX_SUBS = 100; // 토스: 연결당 구독 100개(채널×종목)
const ALLOWED_TYPES = new Set(['trade:kr', 'trade:us', 'orderbook:kr', 'orderbook:us']); // 개인 주문 채널은 이번 단계에서 제외
const CODE_RE = /^[0-9A-Z.\-]{1,12}$/;

export function attachStream(server, { verify, tokens, upstreamUrl, allowedOrigin = '', newSocket = (url, headers) => new WebSocket(url, { headers }), log = console }) {
  const wss = new WebSocketServer({ noServer: true, maxPayload: 16 * 1024 });
  const origins = allowedOrigin.split(',').map((o) => o.trim()).filter(Boolean);
  const clients = new Map(); // ws -> Set<'trade:kr:005930'>
  let up = null, upReady = false, retry = 0, lastDecl = '', syncTimer = null, pingTimer = null, reconnectTimer = null;

  const wanted = () => new Set([...clients.values()].flatMap((s) => [...s]));
  const sendJson = (ws, o) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(o)); };

  function scheduleSync() { clearTimeout(syncTimer); syncTimer = setTimeout(sync, 300); }

  function sync() {
    const keys = wanted();
    if (!keys.size) { lastDecl = ''; if (up) { const u = up; up = null; upReady = false; clearInterval(pingTimer); u.close(); } return; }
    if (!up) return connect();
    if (!upReady) return;
    const byType = new Map();
    for (const k of keys) { const i = k.lastIndexOf(':'); const t = k.slice(0, i); byType.set(t, [...(byType.get(t) || []), k.slice(i + 1)]); }
    const decl = JSON.stringify([...byType].map(([type, codes]) => ({ type, codes: codes.sort() })).sort((a, b) => a.type.localeCompare(b.type)));
    if (decl === lastDecl) return;
    lastDecl = decl;
    up.send(decl); // 전체 교체 방식
  }

  async function connect() {
    if (up) return;
    let token;
    try { token = await tokens.get(); } catch (e) { log.error('stream token:', e.message); return backoff(); }
    if (up) return;
    const sock = newSocket(upstreamUrl, { Authorization: `Bearer ${token}` });
    up = sock; upReady = false;
    sock.on('open', () => {
      upReady = true; retry = 0; lastDecl = '';
      clearInterval(pingTimer); pingTimer = setInterval(() => sock.readyState === WebSocket.OPEN && sock.send('PING'), 55_000);
      sync();
    });
    sock.on('message', (buf) => {
      const text = buf.toString();
      let m; try { m = JSON.parse(text); } catch { return; }
      if (m.type === 'message') {
        for (const [c, keys] of clients) if (keys.has(m.topic)) { c.bufferedAmount > 1e6 ? c.terminate() : c.send(text); }
      } else if (m.type === 'subscriptions' && m.rejected?.length) log.warn('stream rejected:', JSON.stringify(m.rejected));
      else if (m.type === 'error') log.warn('stream error frame:', JSON.stringify(m.error));
    });
    const lost = (why) => {
      if (up !== sock) return;
      up = null; upReady = false; clearInterval(pingTimer);
      log.warn('stream upstream closed:', why);
      if (/401/.test(String(why))) tokens.invalidate(token);
      if (wanted().size) backoff();
    };
    sock.on('close', (code) => lost(`close ${code}`));
    sock.on('error', (e) => lost(e.message));
  }

  function backoff() {
    clearTimeout(reconnectTimer);
    const wait = Math.min(30_000, 1000 * 2 ** retry++) + Math.random() * 500;
    reconnectTimer = setTimeout(() => wanted().size && connect(), wait);
  }

  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, 'http://x');
    if (url.pathname !== '/ws' || (origins.length && !origins.includes(req.headers.origin))) { socket.destroy(); return; }
    wss.handleUpgrade(req, socket, head, (ws) => onClient(ws));
  });

  function onClient(ws) {
    let authed = false, alive = true;
    const authTimer = setTimeout(() => !authed && ws.close(4401, 'auth timeout'), 5000);
    ws.on('pong', () => { alive = true; });
    ws.on('message', async (buf) => {
      let m; try { m = JSON.parse(buf.toString()); } catch { return sendJson(ws, { type: 'error', message: 'bad-json' }); }
      if (!authed) {
        if (m.type !== 'auth') return ws.close(4401, 'auth required');
        try { await verify(String(m.token || '')); } catch { return ws.close(4403, 'forbidden'); }
        authed = true; clearTimeout(authTimer); clients.set(ws, new Set()); return sendJson(ws, { type: 'ready' });
      }
      if (m.type !== 'subscribe' || !Array.isArray(m.topics)) return sendJson(ws, { type: 'error', message: 'bad-request' });
      const next = new Set();
      for (const t of m.topics) {
        if (!ALLOWED_TYPES.has(t?.type) || !Array.isArray(t.codes)) return sendJson(ws, { type: 'error', message: 'invalid-topic' });
        for (const code of t.codes) { if (!CODE_RE.test(code)) return sendJson(ws, { type: 'error', message: 'invalid-code' }); next.add(`${t.type}:${code}`); }
      }
      const union = new Set([...next, ...[...clients].filter(([c]) => c !== ws).flatMap(([, s]) => [...s])]);
      if (union.size > MAX_SUBS) return sendJson(ws, { type: 'error', message: 'too-many-subscriptions' });
      clients.set(ws, next);
      sendJson(ws, { type: 'subscribed', keys: [...next] });
      scheduleSync();
    });
    ws.on('close', () => { clearTimeout(authTimer); clients.delete(ws); scheduleSync(); });
    ws.on('error', () => {});
    const hb = setInterval(() => { if (!alive) return ws.terminate(); alive = false; ws.ping(); }, 30_000);
    ws.on('close', () => clearInterval(hb));
  }

  return { close() { clearTimeout(syncTimer); clearTimeout(reconnectTimer); clearInterval(pingTimer); up?.close(); wss.close(); for (const c of clients.keys()) c.terminate(); } };
}
