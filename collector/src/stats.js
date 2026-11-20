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
