import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCostModel, bandsAt } from '../lib/holderProfit.js';

const bar = (i, p, v = 100) => ({ time: `2026-01-${String(i + 1).padStart(2, '0')}`, high: p * 1.01, low: p * 0.99, close: p, volume: v });

test('오래 100원에 거래된 뒤 120원으로 오르면 거의 모두 수익', () => {
  const bars = [...Array.from({ length: 25 }, (_, i) => bar(i, 100)), bar(25, 120, 1)];
  const m = buildCostModel(bars, 1000);
  const last = m.days.at(-1);
  assert.ok(last.profit > 99, `profit ${last.profit}`);
  assert.ok(Math.abs(last.avgCost - 100) < 2);
  const bands = bandsAt(m.snaps.at(-1), m.mids, last.close);
  assert.ok(bands.find((x) => x.lo === 10).pct > 95); // 대부분 +10~+30% 구간
});

test('100원 물량 위로 140원에서 손바뀜이 크게 일어난 뒤 120원으로 내리면, 140원에 산 쪽은 손실', () => {
  const bars = [...Array.from({ length: 20 }, (_, i) => bar(i, 100)), ...Array.from({ length: 5 }, (_, i) => bar(20 + i, 140, 300)), bar(25, 120, 1)];
  const m = buildCostModel(bars, 1000);
  const last = m.days.at(-1);
  // 140원 구간 비중: 1 − 0.7^5 ≈ 83% → 수익 중은 약 17%
  assert.ok(last.profit > 10 && last.profit < 25, `profit ${last.profit}`);
  assert.equal(m.days.length, 26);
  assert.equal(buildCostModel(bars.slice(0, 5), 1000), null);
});
