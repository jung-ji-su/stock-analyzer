import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

const row = (BAND, REG, HALF, N, S_CHG, UP, DOWN, WIN) => ({ BAND, REG, HALF, N, S_CHG, UP, DOWN, WIN });

test('시장 분위기 검증: 국면별 요약과 필터', async () => {
  mock.module('../src/db.js', { namedExports: { query: async () => [] } });
  const { summarizeMarket } = await import('../src/market.js');
  const s = summarizeMarket([
    row(1, 0, 0, 60, 30, 20, 18, 32),
    row(3, 0, 0, 10, 30, 6, 2, 7),
    row(3, 1, 1, 10, 0, 4, 4, 5),
    row(3, 2, 1, 20, -40, 4, 10, 6),
  ]);
  assert.equal(s.n, 100);
  assert.deepEqual(s.regimes.map((g) => g.n), [70, 10, 20]);
  const f85 = s.filters.find((f) => f.label === '85+');
  assert.equal(f85.all.n, 40);
  assert.equal(f85.all.avg, -0.25);
  assert.equal(f85.noCrash.n, 20);
  assert.equal(f85.noCrash.up, 50);
  assert.equal(f85.normalOnly.n, 10);
  assert.equal(f85.normalOnly.avg, 3);
  assert.equal(f85.normalOnly.early.n, 10);
  assert.equal(s.bands[3].byRegime[2].down, 50);
  assert.equal(s.filters.find((f) => f.label === '70+').all.n, 40);
});
