// 종목 관계 지도: 최근 N거래일 일별 수익률의 상관계수를 모든 종목 쌍(약 4,950쌍)에 대해 Oracle CORR() 로 한 번에 구하고,
// 평균 연결(average linkage) 군집으로 같이 움직이는 무리를 묶는다. 섹터 정보 없이 데이터만으로 반도체·2차전지 같은 무리가 드러난다.
import { query } from './db.js';

export const PERIODS = [60, 120, 250]; // 3개월·6개월·1년 (거래일)
export const MIN_CORR = 0.45;         // 무리 사이 평균 상관이 이보다 낮으면 더 합치지 않는다

// n 개 종목, corr(i, j) → 무리 번호 배열 (혼자인 종목은 -1)
export function cluster(n, corr, minCorr = MIN_CORR) {
  let groups = Array.from({ length: n }, (_, i) => [i]);
  const avg = (a, b) => { let s = 0; for (const i of a) for (const j of b) s += corr(i, j); return s / (a.length * b.length); };
  for (;;) {
    let best = -2, bi = -1, bj = -1;
    for (let i = 0; i < groups.length; i++)
      for (let j = i + 1; j < groups.length; j++) {
        const v = avg(groups[i], groups[j]);
        if (v > best) { best = v; bi = i; bj = j; }
      }
    if (bi < 0 || best < minCorr) break;
    groups[bi] = groups[bi].concat(groups[bj]);
    groups = groups.filter((_, k) => k !== bj);
  }
  const out = Array(n).fill(-1);
  groups.filter((g) => g.length > 1).sort((a, b) => b.length - a.length).forEach((g, id) => g.forEach((i) => { out[i] = id; }));
  return out;
}

export async function network(days) {
  const n = PERIODS.includes(days) ? days : 120;
  const stocks = await query('SELECT code, name FROM stocks WHERE active = 1 ORDER BY code');
  const idx = new Map(stocks.map((s, i) => [s.CODE, i]));
  const rows = await query(`
    WITH d AS (SELECT DISTINCT trade_date FROM daily_bars ORDER BY trade_date DESC FETCH FIRST :n ROWS ONLY),
    r AS (
      SELECT b.code, b.trade_date, b.close_price / LAG(b.close_price) OVER (PARTITION BY b.code ORDER BY b.trade_date) - 1 ret
        FROM daily_bars b JOIN stocks s ON s.code = b.code AND s.active = 1
       WHERE b.trade_date >= (SELECT MIN(trade_date) FROM d) - 15)
    SELECT a.code a, b.code b, ROUND(CORR(a.ret, b.ret), 3) c
      FROM r a JOIN r b ON a.trade_date = b.trade_date AND a.code < b.code
     WHERE a.trade_date >= (SELECT MIN(trade_date) FROM d) AND a.ret IS NOT NULL AND b.ret IS NOT NULL
     GROUP BY a.code, b.code
    HAVING COUNT(*) >= :minN`, { n, minN: Math.floor(n * 0.8) });
  const range = (await query(`
    SELECT TO_CHAR(MIN(trade_date), 'YYYY-MM-DD') d_from, TO_CHAR(MAX(trade_date), 'YYYY-MM-DD') d_to
      FROM (SELECT DISTINCT trade_date FROM daily_bars ORDER BY trade_date DESC FETCH FIRST :n ROWS ONLY)`, { n }))[0] || {};

  const N = stocks.length;
  const m = new Float32Array(N * N);
  const pairs = [];
  for (const x of rows) {
    const i = idx.get(x.A), j = idx.get(x.B);
    if (i == null || j == null || x.C == null) continue;
    m[i * N + j] = m[j * N + i] = x.C;
    pairs.push([i, j, x.C]);
  }
  const cl = cluster(N, (i, j) => m[i * N + j]);
  // 무리 이름: 무리 안에서 다른 종목들과 평균 상관이 가장 높은(가장 대표적인) 두 종목
  const clusters = [];
  for (let id = 0; cl.includes(id); id++) {
    const mem = cl.map((c, i) => (c === id ? i : -1)).filter((i) => i >= 0);
    const centr = mem.map((i) => [i, mem.reduce((a, j) => a + (i === j ? 0 : m[i * N + j]), 0) / (mem.length - 1)]).sort((a, b) => b[1] - a[1]);
    const inner = centr.reduce((a, [, v]) => a + v, 0) / mem.length;
    clusters.push({ id, size: mem.length, label: centr.slice(0, 2).map(([i]) => stocks[i].NAME).join('·'), corr: Math.round(inner * 100) / 100, members: centr.map(([i]) => i) });
  }
  return { days: n, from: range.D_FROM, to: range.D_TO, nodes: stocks.map((s, i) => ({ code: s.CODE, name: s.NAME, cluster: cl[i] })), clusters, pairs };
}
