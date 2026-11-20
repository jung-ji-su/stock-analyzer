// 확률 계산 설정(PROB_PARAMS) 실험: 저장된 신호의 기간 점수·변동성으로 설정마다 예측을 다시 내고 성적을 비교한다.
// 엔진 전체를 다시 돌리지 않아도 되므로 수십 가지 설정도 몇 초면 끝난다.
import { horizonOutlook, HORIZONS, PROB_PARAMS } from '../../stock-analyzer/lib/analysisEngine.js';

export const GRID = (() => {
  const out = [];
  for (const driftK of [0, 0.1, 0.2, 0.3, 0.5])
    for (const sigmaMult of [0.9, 1, 1.15, 1.3])
      for (const minScore of [0, 2, 4]) out.push({ driftK, sigmaMult, minScore });
  return out;
})();

const CLASSES = ['상승', '횡보', '하락'];
const outcomeOf = (chg, band) => (chg > band ? '상승' : chg < -band ? '하락' : '횡보');
const r = (v, d = 1) => Math.round(v * 10 ** d) / 10 ** d;

// rows: [{ horizon, h, sigma, chg, date }] (평가가 끝난 신호). 기간별로 묶어서 넘긴다
export function evaluate(rows, params, band, days) {
  const half = rows.length ? rows[Math.floor(rows.length / 2)].date : ''; // 날짜순 앞/뒤 절반 (과적합 확인용)
  const acc = () => ({ n: 0, hit: 0, brier: 0 });
  const all = acc(), early = acc(), late = acc();
  const freq = { 상승: 0, 횡보: 0, 하락: 0 };
  const buckets = new Map();
  let dir = 0;
  for (const x of rows) {
    const o = horizonOutlook(x.h, x.sigma, days, band, params);
    const y = outcomeOf(x.chg, band);
    const p = { 상승: o.pUp, 횡보: o.pSide, 하락: o.pDown };
    const brier = CLASSES.reduce((s, k) => s + (p[k] - (k === y ? 1 : 0)) ** 2, 0);
    const hit = o.prediction === y ? 1 : 0;
    for (const a of [all, x.date < half ? early : late]) { a.n++; a.hit += hit; a.brier += brier; }
    freq[y]++;
    if (o.prediction !== '횡보') dir++;
    const b = Math.min(8, Math.floor(o.pPred * 10));
    const bk = buckets.get(b) || { n: 0, conf: 0, hit: 0 };
    bk.n++; bk.conf += o.pPred; bk.hit += hit;
    buckets.set(b, bk);
  }
  if (!all.n) return null;
  // 기준: 매번 실제 결과 비율(상승·횡보·하락 빈도)을 그대로 확률로 말했을 때의 Brier
  const base = CLASSES.map((k) => freq[k] / all.n);
  const refBrier = base.reduce((s, q, i) => s + q * ((1 - q) ** 2) + base.reduce((t, q2, j) => (j === i ? t : t + q * q2 ** 2), 0), 0);
  const ece = [...buckets.values()].reduce((s, b) => s + (b.n / all.n) * Math.abs(b.conf / b.n - b.hit / b.n), 0);
  const view = (a) => (a.n ? { hitRate: r((a.hit / a.n) * 100), skill: r((1 - a.brier / a.n / refBrier) * 100, 2) } : null);
  return {
    n: all.n,
    ...view(all), // skill: 기준 대비 Brier 개선(%). 0 보다 커야 '확률이 쓸모 있다'
    calibErr: r(ece * 100), // 말한 신뢰도와 실제 적중률의 평균 차이(%p). 작을수록 정직
    dirShare: r((dir / all.n) * 100), // 상승/하락이라고 말한 비율
    baseline: r(Math.max(...base) * 100),
    early: view(early), late: view(late),
  };
}

export function runExperiment(rows) {
  const out = {};
  for (const [key, { days, band }] of Object.entries(HORIZONS)) {
    const hr = rows.filter((x) => x.horizon === key).sort((a, b) => (a.date < b.date ? -1 : 1));
    const results = GRID.map((params) => ({
      params, current: Object.keys(PROB_PARAMS[key]).every((k) => params[k] === PROB_PARAMS[key][k]),
      ...evaluate(hr, params, band, days),
    })).filter((x) => x.n);
    // 정렬: 앞·뒤 절반 중 나쁜 쪽의 skill 이 높은 순 (한쪽 기간에만 맞는 설정을 고르지 않게)
    results.sort((a, b) => Math.min(b.early?.skill ?? -99, b.late?.skill ?? -99) - Math.min(a.early?.skill ?? -99, a.late?.skill ?? -99));
    out[key] = results;
  }
  return out;
}
