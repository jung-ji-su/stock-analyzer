// 백테스트 통계 (앱 히스토리 화면용). 결과가 확정된(평가 종가가 있는) 신호만 센다
import { query } from './db.js';

const HORIZONS = ['daily', 'weekly', 'monthly'];
const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);

export async function backtestStats() {
  // 기간별: 적중률 + 실제 결과 분포 (가장 흔한 결과만 계속 찍었을 때의 적중률 = 기준선)
  const byH = await query(`
    SELECT horizon,
           COUNT(*) n,
           SUM(CASE WHEN prediction = outcome THEN 1 ELSE 0 END) hits,
           SUM(CASE WHEN outcome = '상승' THEN 1 ELSE 0 END) o_up,
           SUM(CASE WHEN outcome = '횡보' THEN 1 ELSE 0 END) o_side,
           SUM(CASE WHEN outcome = '하락' THEN 1 ELSE 0 END) o_down,
           TO_CHAR(MIN(signal_date), 'YYYY-MM-DD') d_from, TO_CHAR(MAX(signal_date), 'YYYY-MM-DD') d_to, COUNT(DISTINCT code) stocks
      FROM v_signal_eval
     WHERE outcome IS NOT NULL
     GROUP BY horizon`);

  // 예측 종류별 적중률 (예: '상승' 이라고 했을 때 맞은 비율)
  const byPred = await query(`
    SELECT horizon, prediction, COUNT(*) n, SUM(CASE WHEN prediction = outcome THEN 1 ELSE 0 END) hits
      FROM v_signal_eval WHERE outcome IS NOT NULL
     GROUP BY horizon, prediction`);

  // 신뢰도 구간별 실제 적중률 (보정이 잘 됐으면 두 값이 비슷해야 한다)
  const calib = await query(`
    SELECT horizon, FLOOR(confidence / 10) * 10 bucket, COUNT(*) n,
           ROUND(AVG(confidence), 1) avg_conf,
           SUM(CASE WHEN prediction = outcome THEN 1 ELSE 0 END) hits
      FROM v_signal_eval WHERE outcome IS NOT NULL
     GROUP BY horizon, FLOOR(confidence / 10) * 10`);

  // 최근 60거래일만 (시장 상황이 바뀌면 성적도 바뀌므로 따로 본다)
  const recent = await query(`
    SELECT horizon, COUNT(*) n, SUM(CASE WHEN prediction = outcome THEN 1 ELSE 0 END) hits
      FROM v_signal_eval
     WHERE outcome IS NOT NULL
       AND signal_date >= (SELECT MIN(trade_date) FROM (
             SELECT DISTINCT trade_date FROM daily_bars ORDER BY trade_date DESC FETCH FIRST 60 ROWS ONLY))
     GROUP BY horizon`);

  const ver = (await query("SELECT v FROM collector_meta WHERE k = 'engine_ver'"))[0]?.V || null;

  return {
    engineVer: ver,
    horizons: HORIZONS.map((h) => {
      const r = byH.find((x) => x.HORIZON === h);
      if (!r) return { horizon: h, n: 0 };
      const dist = { up: pct(r.O_UP, r.N), side: pct(r.O_SIDE, r.N), down: pct(r.O_DOWN, r.N) };
      const rc = recent.find((x) => x.HORIZON === h);
      return {
        horizon: h, n: r.N, hitRate: pct(r.HITS, r.N), baseline: Math.max(dist.up, dist.side, dist.down), dist,
        recent: rc ? { n: rc.N, hitRate: pct(rc.HITS, rc.N) } : null,
        from: r.D_FROM, to: r.D_TO, stocks: r.STOCKS,
        byPrediction: byPred.filter((x) => x.HORIZON === h).map((x) => ({ prediction: x.PREDICTION, n: x.N, hitRate: pct(x.HITS, x.N) })),
        calibration: calib.filter((x) => x.HORIZON === h).sort((a, b) => a.BUCKET - b.BUCKET)
          .map((x) => ({ bucket: x.BUCKET, n: x.N, avgConf: x.AVG_CONF, hitRate: pct(x.HITS, x.N) })),
      };
    }),
  };
}

export async function dataStatus() {
  const [c] = await query(`
    SELECT (SELECT COUNT(*) FROM stocks WHERE active = 1) stocks,
           (SELECT COUNT(*) FROM daily_bars) bars,
           (SELECT COUNT(*) FROM investor_flow) flows,
           (SELECT COUNT(*) FROM engine_signals) signals FROM dual`);
  return { stocks: c.STOCKS, bars: c.BARS, flows: c.FLOWS, signals: c.SIGNALS };
}

// 실험용: 평가가 끝난 신호의 기간 점수·변동성·실제 등락률
export async function experimentRows() {
  return (await query(`
    SELECT horizon, h_score, sigma_d, change_pct, TO_CHAR(signal_date, 'YYYY-MM-DD') d
      FROM v_signal_eval
     WHERE outcome IS NOT NULL AND h_score IS NOT NULL AND sigma_d > 0`, {}, { fetchArraySize: 5000 }))
    .map((x) => ({ horizon: x.HORIZON, h: x.H_SCORE, sigma: x.SIGMA_D, chg: x.CHANGE_PCT, date: x.D }));
}

// ─── 매수 점수 검증 ───────────────────────────────────────────────────────────
// 스캐너·AI 트레이더의 매수 점수(stock-analyzer/lib/engineScore.js 와 같은 식)를 신호마다 다시 만들고
// 5거래일 뒤 수익률과 비교한다. 강력매수·AI 트레이더 매수 기준(지금 75점)을 정하는 근거.
//   점수 = clamp(round(50 + 종합점수×5 + 1주 전망 상승 +10 / 하락 −10), 0, 100)
export const SCORE_BUCKETS = [[0, 40], [41, 59], [60, 64], [65, 69], [70, 74], [75, 79], [80, 84], [85, 89], [90, 100]];
export const SCORE_MINS = [60, 65, 70, 75, 80, 85, 90];
const UP = 2, DOWN = -2; // 1주 적중 판정 기준과 같은 ±2%

// rows: [{ SCORE, HALF(0 앞·1 뒤), N, S_CHG, UP, DOWN, WIN }] → 구간별·기준 이상별 요약
export function summarizeScores(rows) {
  const total = rows.reduce((a, r) => a + r.N, 0);
  const agg = (rs) => {
    const n = rs.reduce((a, r) => a + r.N, 0);
    if (!n) return { n: 0 };
    const s = (k) => rs.reduce((a, r) => a + r[k], 0);
    return { n, share: pct(n, total), avg: Math.round((s('S_CHG') / n) * 100) / 100, up: pct(s('UP'), n), down: pct(s('DOWN'), n), win: pct(s('WIN'), n) };
  };
  const range = (lo, hi) => rows.filter((r) => r.SCORE >= lo && r.SCORE <= hi);
  const halves = (rs) => ({ early: agg(rs.filter((r) => r.HALF === 0)), late: agg(rs.filter((r) => r.HALF === 1)) });
  return {
    n: total,
    base: { ...agg(rows), ...halves(rows) },
    buckets: SCORE_BUCKETS.map(([lo, hi]) => ({ lo, hi, ...agg(range(lo, hi)) })),
    atLeast: SCORE_MINS.map((min) => ({ min, ...agg(range(min, 100)), ...halves(range(min, 100)) })),
  };
}

export async function buyScoreStats() {
  const rows = await query(`
    WITH s AS (
      SELECT signal_date, change_pct,
             LEAST(100, GREATEST(0, ROUND(50 + total_score * 5
               + CASE prediction WHEN '상승' THEN 10 WHEN '하락' THEN -10 ELSE 0 END))) score
        FROM v_signal_eval
       WHERE horizon = 'weekly' AND outcome IS NOT NULL AND total_score IS NOT NULL),
    mid AS (SELECT MIN(signal_date) + (MAX(signal_date) - MIN(signal_date)) / 2 m FROM s),
    h AS (SELECT s.score, s.change_pct, CASE WHEN s.signal_date < mid.m THEN 0 ELSE 1 END half FROM s CROSS JOIN mid)
    SELECT score, half,
           COUNT(*) n, SUM(change_pct) s_chg,
           SUM(CASE WHEN change_pct > ${UP} THEN 1 ELSE 0 END) up,
           SUM(CASE WHEN change_pct < ${DOWN} THEN 1 ELSE 0 END) down,
           SUM(CASE WHEN change_pct > 0 THEN 1 ELSE 0 END) win
      FROM h
     GROUP BY score, half`);
  const range = (await query(`
    SELECT TO_CHAR(MIN(signal_date), 'YYYY-MM-DD') d_from, TO_CHAR(MAX(signal_date), 'YYYY-MM-DD') d_to, COUNT(DISTINCT code) stocks
      FROM v_signal_eval WHERE horizon = 'weekly' AND outcome IS NOT NULL`))[0] || {};
  return { from: range.D_FROM, to: range.D_TO, stocks: range.STOCKS, ...summarizeScores(rows) };
}
