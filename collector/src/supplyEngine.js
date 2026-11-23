// 수급 포함 엔진 검증: 같은 날짜에 엔진을 ① 수급 없이 ② 수급 포함(scoreSupply, 외국인+기관 5일 순매수를 20% 가중 — 예전 홈 AI 분석 방식)으로
// 두 번 돌려 성적을 비교한다. 이 비교 결과(개선 없음)로 2026-11 부터 수급은 점수에서 빼고 참고 신호로만 보여준다.
import { query } from './db.js';
import { runAnalysis } from '../../stock-analyzer/lib/analysisEngine.js';
import { buyScore, BUY_THRESHOLD } from '../../stock-analyzer/lib/engineScore.js';
import { afterClose } from './kst.js';
import { activeStocks, WARMUP, WINDOW } from './jobs.js';

export const HORIZON_EVAL = { daily: { days: 1, band: 1 }, weekly: { days: 5, band: 2 }, monthly: { days: 20, band: 4 } };
const CLASSES = ['상승', '횡보', '하락'];
const outcomeOf = (chg, band) => (chg > band ? '상승' : chg < -band ? '하락' : '횡보');
const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;
// 수십만 행을 메모리에 들고 있으므로 [예측, 신뢰도, P(상승), P(횡보), P(하락)] 배열로 줄여 둔다
const pick = (h) => [h.prediction, h.confidence, h.probs.up / 100, h.probs.side / 100, h.probs.down / 100];

// 종목 하나의 비교 행. bars: [{ time, close, volume, ... }] 날짜순, flows: Map(date → 외국인+기관 순매수)
// 신호일까지 5거래일 수급이 모두 있는 날만 쓴다 (앱도 최근 5일 수급으로 계산)
export function compareStock(bars, flows) {
  const rows = [];
  for (let i = Math.max(WARMUP - 1, 4); i < bars.length; i++) {
    const last5 = bars.slice(i - 4, i + 1);
    if (last5.some((b) => !flows.has(b.time))) continue;
    const vol = last5.reduce((a, b) => a + (b.volume || 0), 0);
    if (!vol) continue;
    const net = last5.reduce((a, b) => a + flows.get(b.time), 0);
    const date = bars[i].time;
    const chartData = bars.slice(Math.max(0, i - WINDOW + 1), i + 1);
    const now = afterClose(date);
    const a = runAnalysis({ chartData, newsData: [], stockName: '', now });
    const b = runAnalysis({ chartData, newsData: [], stockName: '', now, scoreSupply: true, supplyNet: { dates: last5.map((x) => x.time), foreigner: net, institution: 0 } });
    for (const [h, { days, band }] of Object.entries(HORIZON_EVAL)) {
      if (i + days >= bars.length) continue;
      const chg = (bars[i + days].close / bars[i].close - 1) * 100;
      rows.push({
        h, date, chg, y: outcomeOf(chg, band), ratio: (net / vol) * 100,
        base: pick(a.horizons[h]), sup: pick(b.horizons[h]),
        ...(h === 'weekly' ? { sBase: buyScore(a), sSup: buyScore(b) } : {}),
      });
    }
  }
  return rows;
}

// 예측 성적: 적중률, Brier(낮을수록 좋음), 신뢰도 - 적중률(+면 과신), 방향(상승·하락) 예측 비중과 그 적중률, 앞·뒤 기간
export function scoreVariant(rows, key) {
  if (!rows.length) return { n: 0 };
  const half = rows.map((x) => x.date).sort()[Math.floor(rows.length / 2)];
  const acc = () => ({ n: 0, hit: 0, brier: 0, conf: 0, dir: 0, dirHit: 0 });
  const all = acc(), early = acc(), late = acc();
  for (const x of rows) {
    const [pred, conf, ...p] = x[key];
    const hit = pred === x.y ? 1 : 0;
    const brier = CLASSES.reduce((s, k, j) => s + (p[j] - (k === x.y ? 1 : 0)) ** 2, 0);
    for (const t of [all, x.date < half ? early : late]) {
      t.n++; t.hit += hit; t.brier += brier; t.conf += conf;
      if (pred !== '횡보') { t.dir++; t.dirHit += hit; }
    }
  }
  const out = (t) => (t.n ? {
    n: t.n, hit: r1((t.hit / t.n) * 100), brier: r3(t.brier / t.n), overconf: r1(t.conf / t.n - (t.hit / t.n) * 100),
    dirShare: r1((t.dir / t.n) * 100), dirHit: t.dir ? r1((t.dirHit / t.dir) * 100) : null,
  } : { n: 0 });
  return { ...out(all), early: out(early), late: out(late) };
}

// 1주 매수 점수 결과: 기준 이상 종목의 5일 뒤 평균, +2%↑ / −2%↓ 비율
function buyResult(rows) {
  if (!rows.length) return { n: 0 };
  const n = rows.length;
  return {
    n, avg: Math.round((rows.reduce((a, x) => a + x.chg, 0) / n) * 100) / 100,
    up: r1((rows.filter((x) => x.chg > 2).length / n) * 100), down: r1((rows.filter((x) => x.chg < -2).length / n) * 100),
  };
}

export function summarizeSupplyEngine(rows) {
  const by = (h) => rows.filter((x) => x.h === h);
  const weekly = by('weekly');
  return {
    horizons: Object.fromEntries(Object.keys(HORIZON_EVAL).map((h) => [h, { base: scoreVariant(by(h), 'base'), sup: scoreVariant(by(h), 'sup') }])),
    buy: {
      threshold: BUY_THRESHOLD,
      all: buyResult(weekly),
      base85: buyResult(weekly.filter((x) => x.sBase >= BUY_THRESHOLD)),
      sup85: buyResult(weekly.filter((x) => x.sSup >= BUY_THRESHOLD)),
      filter85: buyResult(weekly.filter((x) => x.sBase >= BUY_THRESHOLD && x.ratio >= -2)), // 수급 없는 점수 85+ 중 순매도(−2% 미만) 제외
      base70: buyResult(weekly.filter((x) => x.sBase >= 70)),
      sup70: buyResult(weekly.filter((x) => x.sSup >= 70)),
      filter70: buyResult(weekly.filter((x) => x.sBase >= 70 && x.ratio >= -2)),
    },
  };
}

export async function runSupplyEngine() {
  const t0 = Date.now();
  const rows = [];
  let stocks = 0;
  for (const s of await activeStocks()) {
    const bars = (await query(
      `SELECT TO_CHAR(trade_date, 'YYYY-MM-DD') d, open_price o, high_price h, low_price l, close_price c, volume v
         FROM daily_bars WHERE code = :code ORDER BY trade_date`, { code: s.code }))
      .map((x) => ({ time: x.D, open: x.O, high: x.H, low: x.L, close: x.C, volume: x.V }));
    const flows = new Map((await query(
      `SELECT TO_CHAR(trade_date, 'YYYY-MM-DD') d, NVL(foreign_net, 0) + NVL(inst_net, 0) net
         FROM investor_flow WHERE code = :code`, { code: s.code })).map((x) => [x.D, x.NET]));
    const got = compareStock(bars, flows);
    if (got.length) stocks++;
    rows.push(...got);
  }
  const dates = rows.map((x) => x.date).sort();
  return { stocks, from: dates[0], to: dates.at(-1), signals: rows.filter((x) => x.h === 'weekly').length, seconds: Math.round((Date.now() - t0) / 1000), ...summarizeSupplyEngine(rows) };
}
