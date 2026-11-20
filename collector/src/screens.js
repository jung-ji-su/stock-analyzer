// DB 스캐너: 외국인·기관 연속 순매수, 52주 신고가 근처 (Oracle SQL 윈도우 함수로 계산)
import { query } from './db.js';

// 종목별로 '오늘부터 거꾸로' 며칠 연속 순매수였는지: 최신순 번호(rn)를 매기고, 처음으로 순매수가 아니었던 날의 번호 - 1
const FLOW_SQL = `
  WITH f AS (
    SELECT code, trade_date, foreign_net, inst_net,
           ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
      FROM investor_flow),
  br AS (
    SELECT code, MAX(trade_date) AS last_d, MAX(rn) AS days,
           NVL(MIN(CASE WHEN NVL(foreign_net, 0) <= 0 THEN rn END), MAX(rn) + 1) AS fb,
           NVL(MIN(CASE WHEN NVL(inst_net, 0) <= 0 THEN rn END), MAX(rn) + 1) AS ib,
           NVL(MIN(CASE WHEN NVL(foreign_net, 0) <= 0 OR NVL(inst_net, 0) <= 0 THEN rn END), MAX(rn) + 1) AS bb
      FROM f GROUP BY code),
  sums AS (
    SELECT f.code,
           SUM(CASE WHEN f.rn < br.fb THEN f.foreign_net END) AS f_sum,
           SUM(CASE WHEN f.rn < br.ib THEN f.inst_net END) AS i_sum,
           SUM(CASE WHEN f.rn < br.bb THEN NVL(f.foreign_net, 0) + NVL(f.inst_net, 0) END) AS b_sum
      FROM f JOIN br ON br.code = f.code GROUP BY f.code),
  px AS (
    SELECT code,
           MAX(CASE WHEN rn = 1 THEN close_price END) AS last_close,
           MAX(CASE WHEN rn = 2 THEN close_price END) AS prev_close,
           AVG(CASE WHEN rn <= 20 THEN volume END) AS avg_vol20
      FROM (SELECT code, close_price, volume, ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn FROM daily_bars)
     WHERE rn <= 20 GROUP BY code)
  SELECT br.code, s.name, TO_CHAR(br.last_d, 'YYYY-MM-DD') AS last_d, br.days,
         br.fb - 1 AS f_streak, br.ib - 1 AS i_streak, br.bb - 1 AS b_streak,
         sums.f_sum, sums.i_sum, sums.b_sum, px.last_close, px.prev_close, px.avg_vol20
    FROM br
    JOIN stocks s ON s.code = br.code AND s.active = 1
    JOIN sums ON sums.code = br.code
    LEFT JOIN px ON px.code = br.code
   WHERE br.last_d = (SELECT MAX(trade_date) FROM investor_flow)`;

// 52주(250거래일) 최고가 대비 현재가. hi_prev: 오늘을 뺀 최고가 → 오늘 종가가 이보다 높으면 신고가 갱신
const HIGH_SQL = `
  WITH b AS (
    SELECT code, trade_date, close_price, high_price, low_price, volume,
           ROW_NUMBER() OVER (PARTITION BY code ORDER BY trade_date DESC) AS rn
      FROM daily_bars)
  SELECT b.code, s.name,
         TO_CHAR(MAX(CASE WHEN rn = 1 THEN trade_date END), 'YYYY-MM-DD') AS last_d,
         MAX(CASE WHEN rn = 1 THEN close_price END) AS last_close,
         MAX(CASE WHEN rn = 2 THEN close_price END) AS prev_close,
         MAX(high_price) AS hi52,
         MAX(CASE WHEN rn >= 2 THEN high_price END) AS hi_prev,
         MIN(low_price) AS lo52,
         MAX(CASE WHEN rn = 1 THEN volume END) AS last_vol,
         AVG(CASE WHEN rn BETWEEN 2 AND 21 THEN volume END) AS avg_vol20,
         COUNT(*) AS n
    FROM b JOIN stocks s ON s.code = b.code AND s.active = 1
   WHERE rn <= 250
   GROUP BY b.code, s.name`;

const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);
const chg = (a, b) => (a && b ? r1((a / b - 1) * 100) : null);

export async function screens() {
  const [flows, highs] = await Promise.all([query(FLOW_SQL), query(HIGH_SQL)]);
  const base = (x) => ({ code: x.CODE, name: x.NAME, price: x.LAST_CLOSE, change: chg(x.LAST_CLOSE, x.PREV_CLOSE) });
  // 순매수 강도: 연속 기간 순매수 합이 하루 평균 거래량의 몇 % 인지 (종목 크기와 상관없이 비교하려고)
  const pick = (streakKey, sumKey, min) => flows
    .filter((x) => x[streakKey] >= min)
    .map((x) => ({ ...base(x), streak: x[streakKey], netSum: x[sumKey], strength: x.AVG_VOL20 ? r1((x[sumKey] / x.AVG_VOL20) * 100) : null }))
    .sort((a, b) => b.streak - a.streak || (b.strength ?? 0) - (a.strength ?? 0))
    .slice(0, 15);

  const near = highs
    .filter((x) => x.N >= 200 && x.LAST_CLOSE && x.HI52)
    .map((x) => ({
      ...base(x),
      fromHigh: r1((x.LAST_CLOSE / x.HI52 - 1) * 100), // 0 이면 최고가, -3 이면 3% 아래
      newHigh: x.HI_PREV != null && x.LAST_CLOSE > x.HI_PREV,
      volRatio: x.AVG_VOL20 ? r1(x.LAST_VOL / x.AVG_VOL20) : null,
      hi52: x.HI52, lo52: x.LO52,
    }))
    .filter((x) => x.fromHigh >= -5)
    .sort((a, b) => b.fromHigh - a.fromHigh)
    .slice(0, 20);

  return {
    flowDate: flows[0]?.LAST_D || null,
    flowDays: Math.max(0, ...flows.map((x) => x.DAYS)),
    barDate: highs[0]?.LAST_D || null,
    foreign: pick('F_STREAK', 'F_SUM', 3),
    institution: pick('I_STREAK', 'I_SUM', 3),
    both: pick('B_STREAK', 'B_SUM', 2),
    nearHigh: near,
  };
}
