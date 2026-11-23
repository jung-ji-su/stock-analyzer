// 수익 중인 투자자 비율 추정 (순수 함수). 증권사 '매물대/筹码分布(cost distribution)'와 같은 방식:
// 주식이 거래된 가격을 '그 주식을 지금 들고 있는 사람의 매수단가'로 보고, 날마다 회전율만큼 예전 물량이 새 가격으로 바뀐다고 본다.
//   분포(오늘) = 분포(어제) × (1 − 회전율) + 오늘 거래 가격대(저가~고가 고르게) × 회전율,  회전율 = 거래량 ÷ 주식 수
// 그날 종가보다 싸게 산 물량의 비율 = 수익 중인 비율 (Glassnode 'Percent Supply in Profit' 과 같은 정의, 사람 수가 아니라 주식 수 기준).
// 실제 계좌 데이터가 아니라 거래량으로 만든 추정이다. 주식 수는 상장주식 수라서(유통주식보다 많음) 회전이 실제보다 느리게 잡힐 수 있다.

export const BANDS = [
  { lo: -Infinity, hi: -30, label: '−30% 넘게 손실' },
  { lo: -30, hi: -10, label: '−30~−10%' },
  { lo: -10, hi: 0, label: '−10~0%' },
  { lo: 0, hi: 10, label: '0~+10%' },
  { lo: 10, hi: 30, label: '+10~+30%' },
  { lo: 30, hi: Infinity, label: '+30% 넘게 수익' },
];

/**
 * bars: 일봉 [{ time, high, low, close, volume }] (순서 무관)
 * shares: 주식 수 (없으면 하루 평균 거래량의 120배로 가정 = 반년에 한 번 전부 손바뀜)
 * keep: 날짜별 분포를 남겨 둘 최근 거래일 수 (특정 시점 보기용)
 */
export function buildCostModel(bars, shares, { bins = 80, keep = 500 } = {}) {
  const b = [...(bars || [])].filter((x) => x && x.high > 0 && x.low > 0 && x.close > 0)
    .sort((a, c) => (a.time < c.time ? -1 : 1));
  if (b.length < 20) return null;
  const avgVol = b.reduce((a, x) => a + (x.volume || 0), 0) / b.length;
  const base = shares > 0 ? shares : avgVol * 120;
  if (!(base > 0)) return null;

  // 가격 구간: 로그 간격 (몇 배씩 움직인 종목도 싼 구간까지 잘게 나뉘게)
  const lo = Math.min(...b.map((x) => x.low)) * 0.98, hi = Math.max(...b.map((x) => x.high)) * 1.02;
  const edges = Array.from({ length: bins + 1 }, (_, i) => lo * (hi / lo) ** (i / bins));
  const mids = edges.slice(0, -1).map((e, i) => Math.sqrt(e * edges[i + 1]));

  // 하루 거래를 저가~고가에 고르게 (구간이 겹치는 길이만큼)
  const dayDist = (x) => {
    const d = new Float64Array(bins);
    const l = Math.min(x.low, x.high), h = Math.max(x.low, x.high);
    if (h - l < 1e-9) { d[binOf(edges, x.close)] = 1; return d; }
    for (let i = 0; i < bins; i++) {
      const ov = Math.min(h, edges[i + 1]) - Math.max(l, edges[i]);
      if (ov > 0) d[i] = ov / (h - l);
    }
    return d;
  };

  // 처음 보유 물량: 첫날 하루 가격에 다 몰아넣으면 그 가격에 가짜 봉우리가 남는다 → 처음 120거래일 거래를 거래량 비중대로 섞어서 시작
  const warm = b.slice(0, 120);
  const wv = warm.reduce((a, x) => a + (x.volume || 1), 0);
  let dist = new Float64Array(bins);
  for (const x of warm) { const dd = dayDist(x); for (let i = 0; i < bins; i++) dist[i] += dd[i] * ((x.volume || 1) / wv); }
  const days = [];
  const snaps = [];
  const from = Math.max(0, b.length - keep);
  for (let k = 0; k < b.length; k++) {
    const x = b[k];
    if (k > 0) {
      const t = Math.min(1, (x.volume || 0) / base);
      const today = dayDist(x);
      for (let i = 0; i < bins; i++) dist[i] = dist[i] * (1 - t) + today[i] * t;
    }
    if (k >= from) {
      const s = Float64Array.from(dist);
      snaps.push(s);
      const st = stats(s, edges, mids, x.close);
      days.push({ time: x.time, close: x.close, profit: st.profit, avgCost: st.avgCost });
    }
  }
  return { edges, mids, days, snaps, sharesKnown: shares > 0 };
}

function binOf(edges, p) {
  let i = 0;
  while (i < edges.length - 2 && edges[i + 1] <= p) i++;
  return i;
}

// 분포 하나의 통계: 수익 중 비율(%), 평균 매수단가
export function stats(dist, edges, mids, price) {
  let tot = 0, below = 0, cost = 0;
  for (let i = 0; i < dist.length; i++) {
    const w = dist[i];
    tot += w; cost += w * mids[i];
    if (edges[i + 1] <= price) below += w;
    else if (edges[i] < price) below += w * ((price - edges[i]) / (edges[i + 1] - edges[i])); // 걸친 구간은 비례
  }
  return tot > 0 ? { profit: Math.round((below / tot) * 1000) / 10, avgCost: cost / tot } : { profit: null, avgCost: null };
}

// 수익률 구간별 비율(%): 매수단가 대비 그날 종가 수익률로 나눈다
export function bandsAt(dist, mids, price) {
  const tot = dist.reduce((a, v) => a + v, 0);
  const out = BANDS.map((x) => ({ ...x, pct: 0 }));
  if (!tot) return out;
  for (let i = 0; i < dist.length; i++) {
    const r = (price / mids[i] - 1) * 100;
    const k = out.findIndex((x) => r >= x.lo && r < x.hi);
    out[k].pct += (dist[i] / tot) * 100;
  }
  return out.map((x) => ({ ...x, pct: Math.round(x.pct * 10) / 10 }));
}
