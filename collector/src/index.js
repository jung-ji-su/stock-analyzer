// 주식 데이터 수집기 (Oracle Cloud VM 상주)
// - 장 마감 뒤(16:30): 종목 목록 → 일봉 → 수급 → 엔진 신호(백테스트) 를 Oracle DB 에 쌓는다
// - 장중(09:00~15:30) 1분마다: AI 트레이더 손절·익절 체크를 앱에 요청
// - 127.0.0.1:8788 로 통계를 내준다 (게이트웨이가 로그인 확인 뒤 /stats/* 로 넘겨줌)
import http from 'node:http';
import { openPool, closePool, migrate, getMeta, setMeta } from './db.js';
import { refreshUniverse, collectBars, collectFlows, computeAllSignals, pingStops, activeStocks } from './jobs.js';
import { backtestStats, dataStatus } from './stats.js';
import { kstDate, kstMinutes } from './kst.js';
import { isKrMarketDay } from '../../stock-analyzer/lib/marketEvents.js';

const need = (k) => { const v = process.env[k]; if (!v) { console.error(`missing env ${k}`); process.exit(1); } return v; };
const cfg = {
  appUrl: need('APP_URL').replace(/\/$/, ''),
  cronSecret: process.env.CRON_SECRET || '',
  gatewayUrl: process.env.GATEWAY_URL || 'http://127.0.0.1:8787',
  internalKey: process.env.INTERNAL_KEY || '',
  log: (m) => console.log(m),
};

const status = { started: new Date().toISOString(), pipeline: null, stops: null, errors: [] };
const fail = (where, e) => {
  console.error(`[${where}]`, e.message);
  status.errors = [{ at: new Date().toISOString(), where, message: e.message }, ...status.errors].slice(0, 20);
};

let running = false, lastPipeline = null, lastAttempt = 0; // lastPipeline: 마지막으로 수집을 끝낸 한국 날짜
async function pipeline(reason) {
  if (running || Date.now() - lastAttempt < 30 * 60_000) return; // 실패가 반복돼도 30분에 한 번만 다시 시도
  running = true; lastAttempt = Date.now();
  const t0 = Date.now();
  console.log(`== 수집 시작 (${reason})`);
  try {
    const date = kstDate();
    // 종목 목록은 월요일(또는 비어 있을 때)에만 갱신
    if (!(await activeStocks()).length || new Date(`${date}T12:00:00+09:00`).getUTCDay() === 1) await refreshUniverse(cfg).catch((e) => fail('universe', e));
    await collectBars(cfg).catch((e) => fail('bars', e));
    await collectFlows(cfg).catch((e) => fail('flows', e));
    await computeAllSignals(cfg).catch((e) => fail('signals', e));
    status.pipeline = { at: new Date().toISOString(), reason, seconds: Math.round((Date.now() - t0) / 1000) };
    lastPipeline = date;
    await setMeta('last_pipeline', date).catch((e) => fail('meta', e));
  } finally { running = false; }
}

// 30초마다 시각 확인, 같은 분에는 한 번만
const done = new Set();
const once = (key, fn) => { if (done.has(key)) return; done.add(key); if (done.size > 500) done.clear(); fn(); };
function tick() {
  const date = kstDate(), min = kstMinutes();
  if (!isKrMarketDay(date)) return;
  // 16:30 이후 그날 수집을 아직 안 했으면 실행 (VM 이 재시작돼 시각을 놓쳐도 따라잡음)
  if (min >= 16 * 60 + 30 && lastPipeline !== date) pipeline('장 마감 후');
  if (cfg.cronSecret && min >= 9 * 60 && min <= 15 * 60 + 30) {
    once(`stops:${date}:${min}`, () => pingStops(cfg)
      .then((r) => { status.stops = { at: new Date().toISOString(), triggered: r?.totalTriggered ?? null }; })
      .catch((e) => fail('stops', e)));
  }
}

const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/stats/backtest') return send(res, 200, { result: await backtestStats() });
    if (path === '/stats/status') return send(res, 200, { result: { ...status, running, data: await dataStatus() } });
    return send(res, 404, { error: 'not_found' });
  } catch (e) { fail('http', e); return send(res, 500, { error: e.message }); }
});

async function main() {
  await openPool({ user: need('DB_USER'), password: need('DB_PASSWORD'), connectString: need('DB_CONNECT_STRING') });
  await migrate();
  server.listen(Number(process.env.PORT || 8788), '127.0.0.1', () => console.log('collector listening on 127.0.0.1:8788'));
  lastPipeline = await getMeta('last_pipeline');
  // 데이터가 비었으면 바로 한 번 (3년치 백필 + 백테스트, 수십 분 걸릴 수 있음)
  const { bars } = await dataStatus();
  if (!bars) pipeline('첫 실행');
  setInterval(tick, 30_000);
  tick();
}

main().catch((e) => { console.error('시작 실패:', e.message); process.exit(1); });
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { server.close(); await closePool().catch(() => {}); process.exit(0); });
