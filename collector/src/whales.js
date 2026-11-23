// 고래 추적기: 기간 동안 외국인·기관이 종목별로 얼마어치(원) 순매수했는지. 수량 × 그날 종가로 금액을 만든다.
// (수급 검증에서 수급만으로 다음 주를 맞히진 못했으므로, 예측이 아니라 '누가 사고 있나'를 보여주는 용도)
import { query } from './db.js';

export const PERIODS = [20, 60, 120]; // 1개월·3개월·6개월 (거래일)
const won = (v) => Math.round(v || 0);

const firstDay = `(SELECT MIN(trade_date) FROM (SELECT DISTINCT trade_date FROM daily_bars ORDER BY trade_date DESC FETCH FIRST :n ROWS ONLY))`;

export async function whales(days) {
  const n = PERIODS.includes(days) ? days : 60;
  const rows = await query(`
    SELECT f.code, s.name,
           SUM(NVL(f.foreign_net, 0) * b.close_price) fw, SUM(NVL(f.inst_net, 0) * b.close_price) iw,
           SUM(b.volume * b.close_price) tv, COUNT(*) n,
           SUM(CASE WHEN NVL(f.foreign_net, 0) + NVL(f.inst_net, 0) > 0 THEN 1 ELSE 0 END) buy_days,
           MAX(b.close_price) KEEP (DENSE_RANK FIRST ORDER BY f.trade_date) c0,
           MAX(b.close_price) KEEP (DENSE_RANK LAST ORDER BY f.trade_date) c1
      FROM investor_flow f
      JOIN daily_bars b ON b.code = f.code AND b.trade_date = f.trade_date
      JOIN stocks s ON s.code = f.code AND s.active = 1
     WHERE f.trade_date >= ${firstDay}
     GROUP BY f.code, s.name`, { n });
  const range = (await query(`
    SELECT TO_CHAR(MIN(trade_date), 'YYYY-MM-DD') d_from, TO_CHAR(MAX(trade_date), 'YYYY-MM-DD') d_to
      FROM investor_flow WHERE trade_date >= ${firstDay}`, { n }))[0] || {};
  return {
    days: n, from: range.D_FROM, to: range.D_TO,
    stocks: rows.map((r) => ({
      code: r.CODE, name: r.NAME, foreign: won(r.FW), inst: won(r.IW), trade: won(r.TV), n: r.N, buyDays: r.BUY_DAYS,
      ret: r.C0 ? Math.round((r.C1 / r.C0 - 1) * 1000) / 10 : null,
    })),
  };
}

// 종목 하나: 날짜별 종가와 외국인·기관 누적 순매수(원)
export async function whaleStock(code, days) {
  const n = PERIODS.includes(days) ? days : 60;
  const rows = await query(`
    SELECT TO_CHAR(f.trade_date, 'YYYY-MM-DD') d, b.close_price c,
           SUM(NVL(f.foreign_net, 0) * b.close_price) OVER (ORDER BY f.trade_date) cf,
           SUM(NVL(f.inst_net, 0) * b.close_price) OVER (ORDER BY f.trade_date) ci
      FROM investor_flow f JOIN daily_bars b ON b.code = f.code AND b.trade_date = f.trade_date
     WHERE f.code = :code AND f.trade_date >= ${firstDay}
     ORDER BY f.trade_date`, { code, n });
  return { code, days: n, series: rows.map((r) => ({ d: r.D, c: r.C, f: won(r.CF), i: won(r.CI) })) };
}
