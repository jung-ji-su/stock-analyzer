// 닮은꼴 차트: 최근 20거래일 종가 흐름과 모양이 가장 비슷했던 과거 구간을 Oracle AI 벡터 검색(VECTOR_DISTANCE)으로 찾는다.
// 구간마다 [시작 대비 누적 등락률 20개]를 평균 0·표준편차 1로 맞춘 20차원 벡터로 저장하고,
// 코사인 거리로 비교한다 (가격 수준·변동 폭이 달라도 '모양'만 비교). 그 뒤 20거래일 흐름도 같이 저장해 '그다음'을 보여준다.
import { query, exec, many } from './db.js';
import { activeStocks } from './jobs.js';

export const LEN = 20;   // 비교하는 구간 길이 (거래일)
export const AHEAD = 20; // 그 뒤로 보여주는 거래일
const r2 = (v) => Math.round(v * 100) / 100;

// 종가 LEN 개 → { path: 시작 대비 누적 %, vec: 정규화 벡터 } (모양이 없으면 null)
export function shapeOf(closes) {
  if (closes.length !== LEN || closes.some((c) => !(c > 0))) return null;
  const path = closes.map((c) => (c / closes[0] - 1) * 100);
  const mean = path.reduce((a, v) => a + v, 0) / LEN;
  const sd = Math.sqrt(path.reduce((a, v) => a + (v - mean) ** 2, 0) / LEN);
  if (sd < 0.3) return null; // 거의 움직이지 않은 구간은 모양이 없다
  return { path: path.map(r2), vec: path.map((v) => Math.round(((v - mean) / sd) * 10000) / 10000) };
}

// 종목 하나의 모든 구간 (끝나는 날 기준). bars: [{ d, c }] 날짜순
export function buildRows(code, bars) {
  const out = [];
  for (let i = LEN - 1; i < bars.length; i++) {
    const s = shapeOf(bars.slice(i - LEN + 1, i + 1).map((b) => b.c));
    if (!s) continue;
    const end = bars[i].c;
    const next = bars.slice(i + 1, i + 1 + AHEAD).map((b) => r2((b.c / end - 1) * 100));
    out.push({
      code, d: bars[i].d, vec: JSON.stringify(s.vec), past: JSON.stringify(s.path), next: JSON.stringify(next),
      f5: next.length >= 5 ? next[4] : null, f20: next.length >= 20 ? next[19] : null,
    });
  }
  return out;
}

// 같은 종목의 거의 겹치는 구간(14일 이내)은 하나만 남겨, 서로 다른 사례 n개를 고른다
export function pickDistinct(rows, n = 12, gapDays = 14) {
  const out = [];
  for (const r of rows) {
    if (out.some((o) => o.code === r.code && Math.abs(Date.parse(o.date) - Date.parse(r.date)) < gapDays * 86400000)) continue;
    out.push(r);
    if (out.length >= n) break;
  }
  return out;
}

const pctOf = (a, b) => (b ? Math.round((a / b) * 1000) / 10 : null);
export function summarize(list, key) {
  const v = list.map((m) => m[key]).filter((x) => x != null);
  if (!v.length) return { n: 0 };
  const sorted = [...v].sort((a, b) => a - b);
  return { n: v.length, up: v.filter((x) => x > 0).length, upRate: pctOf(v.filter((x) => x > 0).length, v.length), avg: r2(v.reduce((a, x) => a + x, 0) / v.length), median: sorted[Math.floor(v.length / 2)] };
}

// 매일 수집 뒤 전체를 다시 만든다 (약 7만 행, 앞으로의 흐름이 매일 채워지므로)
export async function rebuildShapes({ log }) {
  const t0 = Date.now();
  await exec('DELETE FROM chart_shapes');
  let rows = 0;
  for (const s of await activeStocks()) {
    const bars = (await query(
      "SELECT TO_CHAR(trade_date, 'YYYY-MM-DD') d, close_price c FROM daily_bars WHERE code = :code ORDER BY trade_date", { code: s.code }))
      .map((x) => ({ d: x.D, c: x.C }));
    rows += await many(
      `INSERT INTO chart_shapes (code, end_date, shape, past_path, next_path, fwd5, fwd20)
       VALUES (:code, TO_DATE(:d, 'YYYY-MM-DD'), TO_VECTOR(:vec, ${LEN}, FLOAT32), :past, :next, :f5, :f20)`,
      buildRows(s.code, bars),
    );
  }
  log(`닮은꼴 차트: ${rows}개 구간 (${Math.round((Date.now() - t0) / 1000)}초)`);
  return rows;
}

let baseCache = null;
async function baseRates() {
  if (baseCache && Date.now() - baseCache.at < 3600_000) return baseCache.v;
  const r = (await query(`
    SELECT COUNT(fwd5) n5, SUM(CASE WHEN fwd5 > 0 THEN 1 ELSE 0 END) up5, ROUND(AVG(fwd5), 2) avg5,
           COUNT(fwd20) n20, SUM(CASE WHEN fwd20 > 0 THEN 1 ELSE 0 END) up20, ROUND(AVG(fwd20), 2) avg20, COUNT(*) total
      FROM chart_shapes`))[0] || {};
  const v = { total: r.TOTAL, w1: { upRate: pctOf(r.UP5, r.N5), avg: r.AVG5 }, m1: { upRate: pctOf(r.UP20, r.N20), avg: r.AVG20 } };
  baseCache = { at: Date.now(), v };
  return v;
}

// closes: 최근 종가 LEN 개, code·date: 찾는 종목과 마지막 날 (자기 자신·바로 앞 구간은 제외)
export async function findSimilar({ closes, code = '', date = '' }) {
  const s = shapeOf(closes);
  if (!s) return { error: '최근 20일 동안 주가가 거의 움직이지 않아 비교할 모양이 없어요' };
  const rows = await query(`
    SELECT c.code, st.name, TO_CHAR(c.end_date, 'YYYY-MM-DD') d, c.past_path, c.next_path, c.fwd5, c.fwd20,
           VECTOR_DISTANCE(c.shape, TO_VECTOR(:q, ${LEN}, FLOAT32), COSINE) dist
      FROM chart_shapes c LEFT JOIN stocks st ON st.code = c.code
     WHERE c.fwd5 IS NOT NULL
       AND NOT (c.code = NVL(:code, '-') AND c.end_date > NVL(TO_DATE(:d, 'YYYY-MM-DD'), SYSDATE) - 60)
     ORDER BY dist
     FETCH FIRST 200 ROWS ONLY`, { q: JSON.stringify(s.vec), code, d: date || null });
  const matches = pickDistinct(rows.map((x) => ({
    code: x.CODE, name: x.NAME || x.CODE, date: x.D, similarity: Math.round((1 - x.DIST) * 1000) / 10,
    past: JSON.parse(x.PAST_PATH), next: JSON.parse(x.NEXT_PATH), fwd5: x.FWD5, fwd20: x.FWD20,
  })));
  return { query: s.path, matches, w1: summarize(matches, 'fwd5'), m1: summarize(matches, 'fwd20'), base: await baseRates() };
}
