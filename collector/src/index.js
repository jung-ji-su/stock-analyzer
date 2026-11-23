// 주식 데이터 수집기 (Oracle Cloud VM 상주)
// - 장 마감 뒤(16:30): 종목 목록 → 일봉 → 수급 → 엔진 신호(백테스트) 를 Oracle DB 에 쌓는다
// - 장중(09:00~15:30) 1분마다: AI 트레이더 손절·익절 체크를 앱에 요청
// - 127.0.0.1:8788 로 통계를 내준다 (게이트웨이가 로그인 확인 뒤 /stats/* 로 넘겨줌)
import http from 'node:http';
import { openPool, closePool, migrate, getMeta, setMeta, query } from './db.js';
import { refreshUniverse, collectBars, collectFlows, backfillFlows, computeAllSignals, pingStops, activeStocks, engineVersion } from './jobs.js';
import { backtestStats, dataStatus, experimentRows, buyScoreStats, supplyStats } from './stats.js';
import { runExperiment } from './experiment.js';
import { screens } from './screens.js';
import { runSupplyEngine } from './supplyEngine.js';
import { rebuildShapes, findSimilar, LEN } from './similar.js';
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
    await rebuildShapes(cfg).catch((e) => fail('shapes', e));
    status.pipeline = { at: new Date().toISOString(), reason, seconds: Math.round((Date.now() - t0) / 1000) };
    // 장 마감(16:30) 전에 돈 수집은 그날 몫으로 치지 않는다 (마감 후 다시 받아야 오늘 일봉이 확정됨)
    if (kstMinutes() >= 16 * 60 + 30 || !isKrMarketDay(date)) {
      lastPipeline = date;
      await setMeta('last_pipeline', date).catch((e) => fail('meta', e));
    }
    refreshExperiment();
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

// 확률 설정 실험: 수집이 끝날 때마다 백그라운드에서 다시 계산해 두고, 요청에는 저장해 둔 결과를 준다
// (DB 에서 십수만 행을 읽어 오느라 게이트웨이 응답 제한 10초를 넘길 수 있어서)
let expCache = null, expRunning = null;
function refreshExperiment() {
  if (expRunning) return expRunning;
  const key = `${lastPipeline}`, t0 = Date.now();
  expRunning = experimentRows()
    .then((rows) => { expCache = { key, value: { rows: rows.length, seconds: Math.round((Date.now() - t0) / 100) / 10, at: new Date().toISOString(), horizons: runExperiment(rows) } }; })
    .catch((e) => fail('experiment', e))
    .finally(() => { expRunning = null; });
  return expRunning;
}
async function experiment() {
  if (expCache?.key !== `${lastPipeline}`) refreshExperiment();
  return expCache?.value ?? { pending: true };
}

// 수급 포함 엔진 비교: 엔진을 날짜마다 두 번 돌려 1~2분 걸리므로 백그라운드에서 계산하고, 그동안은 { pending } 을 준다
let supEngCache = null, supEngRunning = null;
async function supplyEngine() {
  const key = `${lastPipeline}`;
  if (supEngCache?.key !== key && !supEngRunning) {
    supEngRunning = runSupplyEngine()
      .then((value) => { supEngCache = { key, value: { ...value, at: new Date().toISOString() } }; })
      .catch((e) => fail('supply-engine', e))
      .finally(() => { supEngRunning = null; });
  }
  return supEngCache?.value ?? { pending: true };
}

// DB 스캐너 결과는 하루 한 번 바뀌므로 수집 날짜 기준으로 저장해 둔다
let screenCache = null;
let supplyCache = null; // 수급 검증: 수집이 끝날 때마다 (백필 직후엔 첫 요청 때) 새로 계산
async function cachedSupply() {
  const key = `${lastPipeline}|${running}`; // 백필·수집 중엔 따로, 끝나면 다시 계산
  if (supplyCache?.key !== key) supplyCache = { key, value: await supplyStats() };
  return supplyCache.value;
}

let scoreCache = null; // 매수 점수 검증: 수집이 끝날 때마다 새로 계산
async function cachedBuyScore() {
  if (scoreCache?.key !== `${lastPipeline}`) scoreCache = { key: `${lastPipeline}`, value: await buyScoreStats() };
  return scoreCache.value;
}

async function cachedScreens() {
  if (screenCache?.key !== `${lastPipeline}`) screenCache = { key: `${lastPipeline}`, value: await screens() };
  return screenCache.value;
}

const send = (res, code, body) => { res.writeHead(code, { 'content-type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(body)); };
const server = http.createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://x').pathname;
    if (path === '/stats/backtest') return send(res, 200, { result: await backtestStats() });
    if (path === '/stats/screens') return send(res, 200, { result: await cachedScreens() });
    if (path === '/stats/buyscore') return send(res, 200, { result: await cachedBuyScore() });
    if (path === '/stats/supply') return send(res, 200, { result: await cachedSupply() });
    if (path === '/stats/supply-engine') return send(res, 200, { result: await supplyEngine() });
    if (path === '/stats/similar') {
      const q = new URL(req.url, 'http://x').searchParams;
      const closes = (q.get('closes') || '').split(',').map(Number);
      if (closes.length !== LEN || closes.some((c) => !(c > 0))) return send(res, 400, { error: `closes 에 종가 ${LEN}개가 필요해요` });
      const code = /^[0-9A-Z]{6}$/.test(q.get('code') || '') ? q.get('code') : '';
      const date = /^\d{4}-\d{2}-\d{2}$/.test(q.get('date') || '') ? q.get('date') : '';
      return send(res, 200, { result: await findSimilar({ closes, code, date }) });
    }
    if (path === '/stats/experiment') return send(res, 200, { result: await experiment() });
    if (path === '/stats/status') return send(res, 200, { result: { ...status, running, data: await dataStatus() } });
    return send(res, 404, { error: 'not_found' });
  } catch (e) { fail('http', e); return send(res, 500, { error: e.message }); }
});

async function main() {
  await openPool({ user: need('DB_USER'), password: need('DB_PASSWORD'), connectString: need('DB_CONNECT_STRING') });
  await migrate();
  server.listen(Number(process.env.PORT || 8788), '127.0.0.1', () => console.log('collector listening on 127.0.0.1:8788'));
  lastPipeline = await getMeta('last_pipeline');
  // 오늘 날짜로 기록돼 있어도 아직 마감 전이면 마감 후 수집을 다시 하게 한다
  if (lastPipeline === kstDate() && kstMinutes() < 16 * 60 + 30) lastPipeline = null;
  // 데이터가 비었으면 바로 한 번 (3년치 백필 + 백테스트, 수십 분 걸릴 수 있음)
  const { bars } = await dataStatus();
  if (!bars) pipeline('첫 실행');
  // 엔진 코드가 바뀌어 재시작됐으면 신호만 바로 다시 계산 (일봉은 그대로)
  else if ((await getMeta('engine_ver')) !== engineVersion() && !running) {
    running = true;
    computeAllSignals(cfg).then(() => refreshExperiment()).catch((e) => fail('signals', e)).finally(() => { running = false; });
  }
  // 수급 과거치 백필 (한 번만, 수 분): 수급이 1주 뒤 결과를 더 잘 맞히는지 검증하려면 일봉만큼 긴 수급이 필요하다
  if (bars && !running && (await getMeta('flow_backfill')) !== 'v1') {
    running = true;
    backfillFlows(cfg)
      .then((ok) => (ok ? setMeta('flow_backfill', 'v1') : null))
      .catch((e) => fail('flow_backfill', e)).finally(() => { running = false; });
  }
  // 닮은꼴 차트 벡터가 아직 없으면 한 번 만든다 (1~2분)
  if (bars && !running && !(await query('SELECT COUNT(*) n FROM chart_shapes'))[0].N) {
    running = true;
    rebuildShapes(cfg).catch((e) => fail('shapes', e)).finally(() => { running = false; });
  }
  setInterval(tick, 30_000);
  tick();
}

main().catch((e) => { console.error('시작 실패:', e.message); process.exit(1); });
for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, async () => { server.close(); await closePool().catch(() => {}); process.exit(0); });
