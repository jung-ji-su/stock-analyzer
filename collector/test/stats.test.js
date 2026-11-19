// DB 없이 통계 가공 로직만 확인 (query 를 가짜로 바꿔서)
import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

test('백테스트 통계: 기준선은 가장 흔한 실제 결과 비율, 기간별로 묶는다', async () => {
  const rows = {
    byH: [{ HORIZON: 'weekly', N: 1000, HITS: 480, O_UP: 300, O_SIDE: 450, O_DOWN: 250, D_FROM: '2024-01-02', D_TO: '2026-11-12', STOCKS: 100 }],
    byPred: [{ HORIZON: 'weekly', PREDICTION: '횡보', N: 700, HITS: 360 }, { HORIZON: 'weekly', PREDICTION: '상승', N: 300, HITS: 120 }],
    calib: [{ HORIZON: 'weekly', BUCKET: 50, N: 400, AVG_CONF: 54.2, HITS: 200 }, { HORIZON: 'weekly', BUCKET: 40, N: 600, AVG_CONF: 44.1, HITS: 280 }],
    recent: [{ HORIZON: 'weekly', N: 100, HITS: 55 }],
    meta: [{ V: 'abc' }],
  };
  const seq = [rows.byH, rows.byPred, rows.calib, rows.recent, rows.meta];
  mock.module('../src/db.js', { namedExports: { query: async () => seq.shift() } });
  const { backtestStats } = await import('../src/stats.js');
  const s = await backtestStats();
  const w = s.horizons.find((x) => x.horizon === 'weekly');
  assert.equal(w.hitRate, 48);
  assert.equal(w.baseline, 45);
  assert.deepEqual(w.dist, { up: 30, side: 45, down: 25 });
  assert.deepEqual(w.calibration.map((c) => c.bucket), [40, 50]);
  assert.equal(w.recent.hitRate, 55);
  assert.equal(s.horizons.find((x) => x.horizon === 'daily').n, 0);
  assert.equal(s.engineVer, 'abc');
});
