// 시장 분위기 검증: 시장 전체가 약할 때도 매수 점수가 통하는지 본다.
// 시장 = 시총 상위 100종목 일간 수익률의 단순 평균을 이어 붙인 지수 (코스피 지수 데이터가 DB에 없어서 대신 쓴다).
// 국면은 신호일 종가까지의 정보만 쓴다 (미래 정보 없음).
//   보통: 시장 지수 ≥ 20일 평균
//   약세: 시장 지수 < 20일 평균 (급락은 아님)
//   급락: 최근 5거래일 시장 수익률 < −3%
import { query } from './db.js';

const pct = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
const UP = 2, DOWN = -2; // 1주 적중 판정 기준과 같은 ±2%
export const REGIMES = [{ key: 0, label: '보통' }, { key: 1, label: '약세' }, { key: 2, label: '급락' }];
export const BANDS = [{ key: 0, label: '40 이하' }, { key: 1, label: '41~69' }, { key: 2, label: '70~84' }, { key: 3, label: '85+' }];

// rows: [{ BAND, REG, HALF, N, S_CHG, UP, DOWN, WIN }] → 점수대 × 국면 요약, 그리고 '약세·급락 땐 안 산다' 필터 결과
export function summarizeMarket(rows) {
  const total = rows.reduce((a, r) => a + r.N, 0);
  const agg = (rs) => {
    const n = rs.reduce((a, r) => a + r.N, 0);
    if (!n) return { n: 0 };
    const s = (k) => rs.reduce((a, r) => a + r[k], 0);
    return { n, share: pct(n, total), avg: Math.round((s('S_CHG') / n) * 100) / 100, up: pct(s('UP'), n), down: pct(s('DOWN'), n), win: pct(s('WIN'), n) };
  };
  const halves = (rs) => ({ early: agg(rs.filter((r) => r.HALF === 0)), late: agg(rs.filter((r) => r.HALF === 1)) });
  const reg = (rs) => Object.fromEntries(REGIMES.map((g) => [g.key, { ...agg(rs.filter((r) => r.REG === g.key)), ...halves(rs.filter((r) => r.REG === g.key)) }]));
  const atLeast = (lo) => rows.filter((r) => r.BAND >= lo);
  const filters = [[3, '85+'], [2, '70+']].map(([lo, label]) => {
    const all = atLeast(lo);
    return {
      label,
      all: { ...agg(all), ...halves(all) },
      noCrash: { ...agg(all.filter((r) => r.REG !== 2)), ...halves(all.filter((r) => r.REG !== 2)) }, // 급락 땐 안 삼
      normalOnly: { ...agg(all.filter((r) => r.REG === 0)), ...halves(all.filter((r) => r.REG === 0)) }, // 약세·급락 땐 안 삼
    };
  });
  return {
    n: total,
    regimes: REGIMES.map((g) => ({ ...g, ...agg(rows.filter((r) => r.REG === g.key)) })),
    bands: BANDS.map((b) => ({ ...b, all: agg(rows.filter((r) => r.BAND === b.key)), byRegime: reg(rows.filter((r) => r.BAND === b.key)) })),
    filters,
  };
}

export async function marketStats() {
  const rows = await query(`
    WITH r AS (
      SELECT trade_date, close_price / LAG(close_price) OVER (PARTITION BY code ORDER BY trade_date) - 1 ret
        FROM daily_bars),
    m AS (
      SELECT trade_date, AVG(ret) mret FROM r
       WHERE ret IS NOT NULL AND ABS(ret) < 0.35
       GROUP BY trade_date HAVING COUNT(*) >= 30),
    idx AS (SELECT trade_date, EXP(SUM(LN(1 + mret)) OVER (ORDER BY trade_date)) lvl FROM m),
    reg AS (
      SELECT trade_date,
             CASE WHEN lvl / LAG(lvl, 5) OVER (ORDER BY trade_date) - 1 < -0.03 THEN 2
                  WHEN lvl < AVG(lvl) OVER (ORDER BY trade_date ROWS BETWEEN 19 PRECEDING AND CURRENT ROW) THEN 1
                  ELSE 0 END reg
        FROM idx),
    s AS (
      SELECT e.signal_date, e.change_pct, g.reg,
             LEAST(100, GREATEST(0, ROUND(50 + e.total_score * 5
               + CASE e.prediction WHEN '상승' THEN 10 WHEN '하락' THEN -10 ELSE 0 END))) score
        FROM v_signal_eval e
        JOIN reg g ON g.trade_date = e.signal_date
       WHERE e.horizon = 'weekly' AND e.outcome IS NOT NULL AND e.total_score IS NOT NULL),
    mid AS (SELECT MIN(signal_date) + (MAX(signal_date) - MIN(signal_date)) / 2 m FROM s),
    h AS (
      SELECT s.change_pct, s.reg,
             CASE WHEN score >= 85 THEN 3 WHEN score >= 70 THEN 2 WHEN score > 40 THEN 1 ELSE 0 END band,
             CASE WHEN s.signal_date < mid.m THEN 0 ELSE 1 END half
        FROM s CROSS JOIN mid)
    SELECT band, reg, half, COUNT(*) n, SUM(change_pct) s_chg,
           SUM(CASE WHEN change_pct > ${UP} THEN 1 ELSE 0 END) up,
           SUM(CASE WHEN change_pct < ${DOWN} THEN 1 ELSE 0 END) down,
           SUM(CASE WHEN change_pct > 0 THEN 1 ELSE 0 END) win
      FROM h
     GROUP BY band, reg, half`);
  const range = (await query(`
    SELECT TO_CHAR(MIN(signal_date), 'YYYY-MM-DD') d_from, TO_CHAR(MAX(signal_date), 'YYYY-MM-DD') d_to
      FROM v_signal_eval WHERE horizon = 'weekly' AND outcome IS NOT NULL`))[0] || {};
  return { from: range.D_FROM, to: range.D_TO, ...summarizeMarket(rows) };
}
