// 수집·계산 작업. 각 작업은 실패해도 다른 작업을 막지 않는다 (종목 단위로 건너뜀)
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { query, exec, many, getMeta, setMeta } from './db.js';
import { fetchTopByMarcap, fetchDailyBars, fetchInvestorFlow, fetchInvestorFlowPage } from './sources.js';
import { afterClose } from './kst.js';
import { runAnalysis } from '../../stock-analyzer/lib/analysisEngine.js';

const UNIVERSE = 100;     // 시가총액 상위 몇 종목
const BACKFILL_DAYS = 3 * 365 + 30;
export const WARMUP = 250;       // 엔진이 52주 지표를 쓰므로 이만큼 쌓인 날부터 신호를 만든다
export const WINDOW = 280;       // 신호 하나에 넘기는 일봉 수 (AI 트레이더가 쓰는 약 1년치와 같게)
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// 엔진 코드가 바뀌면 값이 달라지므로, 엔진 파일 내용으로 버전을 만든다
const ENGINE_FILES = ['analysisEngine.js', 'indicators.js'].map((f) => new URL(`../../stock-analyzer/lib/${f}`, import.meta.url));
export const engineVersion = () => createHash('sha1').update(ENGINE_FILES.map((u) => readFileSync(u)).join('\n')).digest('hex').slice(0, 12);

export async function activeStocks() {
  return (await query('SELECT code, name, market FROM stocks WHERE active = 1 ORDER BY code')).map((r) => ({ code: r.CODE, name: r.NAME, market: r.MARKET }));
}

// 1) 종목 목록: 시총 상위 UNIVERSE 개. 빠진 종목은 비활성(데이터는 남김)
export async function refreshUniverse({ appUrl, log }) {
  const top = (await fetchTopByMarcap(appUrl)).slice(0, UNIVERSE);
  if (top.length < UNIVERSE / 2) throw new Error(`시총 순위가 너무 적음 (${top.length})`);
  await many(
    `MERGE INTO stocks t USING (SELECT :code code, :name name, :market market FROM dual) s ON (t.code = s.code)
     WHEN MATCHED THEN UPDATE SET t.name = s.name, t.market = s.market, t.active = 1, t.updated_at = SYSTIMESTAMP
     WHEN NOT MATCHED THEN INSERT (code, name, market) VALUES (s.code, s.name, s.market)`,
    top.map(({ code, name, market }) => ({ code, name, market })),
  );
  const keep = new Set(top.map((s) => s.code));
  const drop = (await activeStocks()).filter((s) => !keep.has(s.code)).map((s) => ({ code: s.code }));
  await many('UPDATE stocks SET active = 0, updated_at = SYSTIMESTAMP WHERE code = :code', drop);
  log(`종목 목록: ${top.length}개 (빠짐 ${drop.length})`);
}

// 2) 일봉: 처음 보는 종목은 3년치, 아니면 최근 3주치를 다시 받아 덮어쓴다 (수정주가 반영)
export async function collectBars({ log }) {
  const last = new Map((await query('SELECT code, MAX(trade_date) d FROM daily_bars GROUP BY code')).map((r) => [r.CODE, r.D]));
  let rows = 0, fail = 0;
  for (const s of await activeStocks()) {
    try {
      const bars = await fetchDailyBars(s.code, s.market, last.has(s.code) ? 21 : BACKFILL_DAYS);
      rows += await many(
        `MERGE INTO daily_bars t
         USING (SELECT :code code, TO_DATE(:d, 'YYYY-MM-DD') trade_date, :o o, :h h, :l l, :c c, :v v FROM dual) s
            ON (t.code = s.code AND t.trade_date = s.trade_date)
         WHEN MATCHED THEN UPDATE SET t.open_price = s.o, t.high_price = s.h, t.low_price = s.l, t.close_price = s.c, t.volume = s.v
         WHEN NOT MATCHED THEN INSERT (code, trade_date, open_price, high_price, low_price, close_price, volume)
              VALUES (s.code, s.trade_date, s.o, s.h, s.l, s.c, s.v)`,
        bars.map((b) => ({ code: s.code, d: b.date, o: b.open, h: b.high, l: b.low, c: b.close, v: b.volume })),
      );
    } catch (e) { fail++; log(`일봉 실패 ${s.code}: ${e.message}`); }
    await sleep(300); // 야후에 몰아서 요청하지 않게
  }
  log(`일봉: ${rows}행 반영, 실패 ${fail}종목`);
}

// 3) 투자자 수급 (토스, 게이트웨이 경유). 매일 최근 20일을 덮어쓴다 (잠정치가 나중에 확정되므로)
const saveFlows = (code, recs) => many(
  `MERGE INTO investor_flow t
   USING (SELECT :code code, TO_DATE(:d, 'YYYY-MM-DD') trade_date, :f f, :i i, :p p FROM dual) s
      ON (t.code = s.code AND t.trade_date = s.trade_date)
   WHEN MATCHED THEN UPDATE SET t.foreign_net = s.f, t.inst_net = s.i, t.indiv_net = s.p
   WHEN NOT MATCHED THEN INSERT (code, trade_date, foreign_net, inst_net, indiv_net) VALUES (s.code, s.trade_date, s.f, s.i, s.p)`,
  recs.map((r) => ({ code, d: r.date, f: r.foreign, i: r.inst, p: r.indiv })),
);

export async function collectFlows({ gatewayUrl, internalKey, log }) {
  if (!internalKey) return log('수급: INTERNAL_KEY 가 없어 건너뜀');
  let rows = 0, fail = 0;
  for (const s of await activeStocks()) {
    try {
      rows += await saveFlows(s.code, await fetchInvestorFlow(gatewayUrl, internalKey, s.code, 20));
    } catch (e) { fail++; log(`수급 실패 ${s.code}: ${e.message}`); }
  }
  log(`수급: ${rows}행 반영, 실패 ${fail}종목`);
}

// 3-1) 수급 과거치 백필 (한 번): 100일씩 nextUntil 커서로 거슬러 올라간다. 일봉(3년)보다 오래된 건 필요 없어서 최대 8페이지.
// until 이 그 날짜를 포함하므로 페이지 경계의 같은 날짜는 한 번만 저장한다.
export async function backfillFlows({ gatewayUrl, internalKey, log }, { maxPages = 8, pause = 150 } = {}) {
  if (!internalKey) { log('수급 백필: INTERNAL_KEY 가 없어 건너뜀'); return false; }
  const t0 = Date.now();
  let rows = 0, fail = 0, oldest = null;
  for (const s of await activeStocks()) {
    try {
      const seen = new Set();
      let until = null;
      for (let p = 0; p < maxPages; p++) {
        const page = await fetchInvestorFlowPage(gatewayUrl, internalKey, s.code, 100, until);
        const recs = page.records.filter((r) => !seen.has(r.date));
        recs.forEach((r) => seen.add(r.date));
        if (recs.length) rows += await saveFlows(s.code, recs);
        const last = recs.at(-1)?.date;
        if (last && (!oldest || last < oldest)) oldest = last;
        if (!page.nextUntil || !recs.length) break;
        until = page.nextUntil;
        await sleep(pause);
      }
    } catch (e) { fail++; log(`수급 백필 실패 ${s.code}: ${e.message}`); }
  }
  log(`수급 백필: ${rows}행, 가장 오래된 날 ${oldest}, 실패 ${fail}종목 (${Math.round((Date.now() - t0) / 1000)}초)`);
  return fail === 0;
}

// 일봉 배열로 날짜별 엔진 신호 계산 (순수 함수, 테스트용으로 분리). fromDate 이후 날짜만
export function computeSignals(code, bars, ver, fromDate = '') {
  const out = [];
  for (let i = WARMUP - 1; i < bars.length; i++) {
    const date = bars[i].time;
    if (date <= fromDate) continue;
    const r = runAnalysis({ chartData: bars.slice(Math.max(0, i - WINDOW + 1), i + 1), newsData: [], stockName: '', now: afterClose(date) });
    for (const [horizon, h] of Object.entries(r.horizons)) {
      out.push({
        code, d: date, horizon, close: bars[i].close, total: r.scoreBreakdown.total,
        pred: h.prediction, conf: h.confidence, up: h.probs.up, side: h.probs.side, down: h.probs.down, ver,
        hs: h.score, sd: r.extras.sigmaD,
      });
    }
  }
  return out;
}

// 4) 엔진 신호: 엔진이 바뀌었으면 전 기간을 다시, 아니면 새로 생긴 날짜만 계산 (= 과거 데이터 백테스트)
export async function computeAllSignals({ log }) {
  const ver = engineVersion();
  const full = (await getMeta('engine_ver')) !== ver;
  const lastSig = full ? new Map() : new Map((await query(
    "SELECT code, TO_CHAR(MAX(signal_date), 'YYYY-MM-DD') d FROM engine_signals GROUP BY code")).map((r) => [r.CODE, r.D]));
  if (full) { await exec('DELETE FROM engine_signals'); log(`엔진 버전 변경 → 전체 재계산 (${ver})`); }
  let rows = 0;
  const t0 = Date.now();
  for (const s of await activeStocks()) {
    const bars = (await query(
      `SELECT TO_CHAR(trade_date, 'YYYY-MM-DD') d, open_price o, high_price h, low_price l, close_price c, volume v
         FROM daily_bars WHERE code = :code ORDER BY trade_date`, { code: s.code }))
      .map((r) => ({ time: r.D, open: r.O, high: r.H, low: r.L, close: r.C, volume: r.V }));
    const sigs = computeSignals(s.code, bars, ver, lastSig.get(s.code) || '');
    rows += await many(
      `INSERT INTO engine_signals (code, signal_date, horizon, close_price, total_score, prediction, confidence, prob_up, prob_side, prob_down, engine_ver, h_score, sigma_d)
       VALUES (:code, TO_DATE(:d, 'YYYY-MM-DD'), :horizon, :close, :total, :pred, :conf, :up, :side, :down, :ver, :hs, :sd)`,
      sigs,
    );
  }
  await setMeta('engine_ver', ver);
  log(`엔진 신호: ${rows}행 추가 (${Math.round((Date.now() - t0) / 1000)}초)`);
}

// 5) AI 트레이더 손절·익절 체크 (앱 API 호출). 장중 1분마다
export async function pingStops({ appUrl, cronSecret }) {
  const r = await fetch(`${appUrl}/api/ai-trader/check-stops`, { headers: { authorization: `Bearer ${cronSecret}` }, signal: AbortSignal.timeout(55000) });
  if (!r.ok) throw new Error(`check-stops ${r.status}`);
  return r.json().catch(() => ({}));
}
