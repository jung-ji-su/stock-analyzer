import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

// 합성 일봉: 완만한 상승 + 흔들림, 수급은 일부 날짜만
function bars(n) {
  const out = [];
  let c = 10000;
  for (let i = 0; i < n; i++) {
    c *= 1 + Math.sin(i / 7) * 0.012 + 0.0008;
    const d = new Date(Date.UTC(2024, 0, 1) + i * 86400000).toISOString().slice(0, 10);
    out.push({ time: d, open: c, high: c * 1.01, low: c * 0.99, close: Math.round(c), volume: 100000 + (i % 5) * 10000 });
  }
  return out;
}

test('수급 포함 엔진 비교: 5일 수급이 모두 있는 날만, 기간별 두 변형 성적', async () => {
  mock.module('../src/db.js', { namedExports: { query: async () => [], exec: async () => 0, many: async () => 0, getMeta: async () => null, setMeta: async () => {} } });
  const { compareStock, summarizeSupplyEngine } = await import('../src/supplyEngine.js');
  const b = bars(320);
  const flows = new Map(b.slice(200).map((x, i) => [x.time, (i % 9 < 4 ? -1 : 1) * 60000]));
  flows.delete(b[290].time); // 빠진 날이 있으면 그 뒤 5일은 건너뜀
  const rows = compareStock(b, flows);
  const dates = new Set(rows.map((r) => r.date));
  assert.ok(!dates.has(b[249].time) || flows.has(b[245].time));
  for (let i = 290; i <= 294; i++) assert.ok(!dates.has(b[i].time));
  assert.ok(dates.has(b[300].time));
  const w = rows.filter((r) => r.h === 'weekly');
  assert.ok(w.every((r) => r.sBase >= 0 && r.sSup <= 100 && Number.isFinite(r.ratio)));
  assert.ok(rows.some((r) => r.base.join() !== r.sup.join())); // 수급이 결과를 바꾸긴 한다
  const s = summarizeSupplyEngine(rows);
  for (const h of ['daily', 'weekly', 'monthly']) {
    assert.equal(s.horizons[h].base.n, s.horizons[h].sup.n);
    assert.ok(s.horizons[h].base.brier > 0 && s.horizons[h].base.brier < 2);
  }
  assert.equal(s.buy.all.n, w.length);
});
