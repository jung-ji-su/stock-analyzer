// 숫자를 정하는 핵심 로직 테스트 (node --test, 외부 의존성 없음)
import test from 'node:test';
import assert from 'node:assert/strict';
import { runAnalysis, horizonOutlook, HORIZONS, PROB_PARAMS } from '../lib/analysisEngine.js';
import { buyScore, scoreGrade, BUY_THRESHOLD } from '../lib/engineScore.js';
import { EVAL_BAND } from '../lib/evalUtils.js';

// 날짜순 가짜 일봉: step 만큼 매일 오르내리고 약간 흔들린다
function bars(n, step, start = 10000) {
  const out = [];
  let p = start;
  const d0 = Date.parse('2025-01-02T00:00:00Z');
  for (let i = 0; i < n; i++) {
    p = p * (1 + step + (i % 2 ? 0.004 : -0.004));
    out.push({ time: new Date(d0 + i * 864e5).toISOString().slice(0, 10), open: p, high: p * 1.01, low: p * 0.99, close: p, volume: 100000 + (i % 5) * 1000 });
  }
  return out;
}
const NOW = Date.parse('2030-01-01T00:00:00Z'); // 마지막 봉이 장중으로 보이지 않게 먼 미래

test('엔진의 적중 기준은 평가 기준(EVAL_BAND)과 같다', () => {
  for (const [k, { band }] of Object.entries(HORIZONS)) assert.equal(band, EVAL_BAND[k]);
});

test('horizonOutlook: 신호가 약하면 방향을 말하지 않는다', () => {
  const o = horizonOutlook(1, 2, 5, 2, PROB_PARAMS.weekly);
  assert.equal(o.prediction, '횡보');
  assert.ok(Math.abs(o.pUp + o.pSide + o.pDown - 1) < 1e-9);
});

test('horizonOutlook: 강한 상승 신호면 P(상승) > P(하락)', () => {
  const o = horizonOutlook(10, 3, 20, 4, PROB_PARAMS.monthly);
  assert.ok(o.pUp > o.pDown);
  assert.ok(o.drift > 0);
});

test('runAnalysis: 출력 형태와 범위', () => {
  const r = runAnalysis({ chartData: bars(250, 0.002), newsData: [], stockName: '', now: NOW });
  assert.ok(r.scoreBreakdown.total >= -10 && r.scoreBreakdown.total <= 10);
  for (const k of Object.keys(HORIZONS)) {
    const h = r.horizons[k];
    assert.ok(['상승', '횡보', '하락'].includes(h.prediction));
    assert.ok(h.confidence >= 34 && h.confidence <= 85);
    assert.ok(Math.abs(h.probs.up + h.probs.side + h.probs.down - 100) <= 2);
  }
  assert.equal(r.scoreBreakdown.supply, undefined); // 수급 없으면 수급 칸 없음
});

test('runAnalysis: 상승 추세가 하락 추세보다 종합 점수가 높다', () => {
  const up = runAnalysis({ chartData: bars(250, 0.003), newsData: [], stockName: '', now: NOW });
  const down = runAnalysis({ chartData: bars(250, -0.003), newsData: [], stockName: '', now: NOW });
  assert.ok(up.scoreBreakdown.total > down.scoreBreakdown.total);
});

test('runAnalysis: 수급은 기본적으로 참고만 (점수 0 반영)', () => {
  const chartData = bars(250, 0.001);
  const dates = chartData.slice(-5).map((b) => b.time);
  const base = runAnalysis({ chartData, newsData: [], stockName: '', now: NOW });
  const ref = runAnalysis({ chartData, newsData: [], stockName: '', now: NOW, supplyNet: { dates, foreigner: 5e6, institution: 0 } });
  assert.equal(ref.scoreBreakdown.supply.label, '수급(참고)');
  assert.equal(ref.scoreBreakdown.total, base.scoreBreakdown.total);
  const scored = runAnalysis({ chartData, newsData: [], stockName: '', now: NOW, scoreSupply: true, supplyNet: { dates, foreigner: 5e6, institution: 0 } });
  assert.equal(scored.scoreBreakdown.supply.label, '수급');
});

test('buyScore: 50 + 종합×5 ± 1주 전망 10, 0~100', () => {
  const fake = (total, w) => ({ scoreBreakdown: { total }, horizons: { weekly: { prediction: w } } });
  assert.equal(buyScore(fake(0, '횡보')), 50);
  assert.equal(buyScore(fake(5, '상승')), 85);
  assert.equal(buyScore(fake(-4, '하락')), 20);
  assert.equal(buyScore(fake(10, '상승')), 100);
  assert.equal(buyScore(fake(-10, '하락')), 0);
});

test('scoreGrade: 기준 경계', () => {
  assert.equal(scoreGrade(BUY_THRESHOLD), '강력매수');
  assert.equal(scoreGrade(BUY_THRESHOLD - 1), '매수고려');
  assert.equal(scoreGrade(70), '매수고려');
  assert.equal(scoreGrade(69), '관망');
  assert.equal(scoreGrade(41), '관망');
});
