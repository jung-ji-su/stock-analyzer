import test from 'node:test';
import assert from 'node:assert/strict';
import { analyzeDrivers, debtLevel } from '../lib/supplyDrivers.js';

const bars = [
  { time: '2026-11-17', close: 100, volume: 1000 },
  { time: '2026-11-18', close: 98, volume: 1000 },
  { time: '2026-11-19', close: 95, volume: 1000 },
  { time: '2026-11-20', close: 94, volume: 1000 },
];
const inv = (date, f, i, p) => ({ date, foreigner: { netBuyVolume: String(f) }, institution: { netBuyVolume: String(i) }, individual: { netBuyVolume: String(p) } });

test('하락: 같은 방향(순매도)인 쪽만 원인, 받아낸 쪽은 개인', () => {
  const r = analyzeDrivers({
    bars, days: 3,
    investor: [inv('2026-11-20', -100, -50, 150), inv('2026-11-19', -200, 0, 200), inv('2026-11-18', 0, -50, 50)],
    program: [{ date: '2026-11-19', arbitrage: { netBuyVolume: '-30' }, nonArbitrage: { netBuyVolume: '-30' } }],
    short: [{ date: '2026-11-19', shortSellingVolume: '90', shortSellingVolumeRate: '0.09' }, { date: '2026-11-10', shortSellingVolumeRate: '0.01' }],
    credit: [{ date: '2026-11-20', marginLoan: { balanceQuantity: '500', balanceRate: '0.031' } }, { date: '2026-11-17', marginLoan: { balanceQuantity: '530', balanceRate: '0.033' } }],
  });
  assert.equal(r.from, '2026-11-18');
  assert.equal(r.change, -6);
  assert.equal(r.dir, -1);
  // 거래량 3000 대비: 외국인 −10%, 기관 −3.3%, 프로그램 −2%, 공매도 3%, 신용 −1%
  assert.equal(r.flows.foreigner, -10);
  assert.equal(r.top[0], 'foreigner');
  assert.equal(r.weights.individual, 0);
  assert.equal(r.counter.key, 'individual');
  assert.equal(r.short.times, 3); // 평소 1% → 3%
  assert.equal(r.credit.change, -30);
  assert.equal(r.credit.level.label, '보통');
  assert.equal(Object.values(r.weights).reduce((a, v) => a + v, 0) >= 99, true);
  assert.match(r.summary, /외국인이 판 영향/);
});

test('개인이 빠진 당일 잠정치는 건너뛰고, 보합이면 원인 비중 없음', () => {
  const r = analyzeDrivers({
    bars: [...bars.slice(0, 3), { time: '2026-11-20', close: 95.1, volume: 1000 }, { time: '2026-11-23', close: 90, volume: 1000 }], days: 1,
    investor: [{ date: '2026-11-23', foreigner: { netBuyVolume: '5' }, institution: { netBuyVolume: '5' } }, inv('2026-11-20', 10, -10, 0)],
  });
  assert.equal(r.to, '2026-11-20');
  assert.equal(r.dir, 0);
  assert.equal(r.weights, null);
  assert.equal(analyzeDrivers({ bars, investor: [] }), null);
  assert.equal(debtLevel(9).label, '매우 높음');
});
