import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

const row = (SB, BAND, HALF, N, S_CHG, UP, DOWN, WIN) => ({ SB, BAND, HALF, N, S_CHG, UP, DOWN, WIN });

test('수급 검증: 수급 구간별·점수대×수급 방향 요약', async () => {
  mock.module('../src/db.js', { namedExports: { query: async () => [] } });
  const { summarizeSupply } = await import('../src/stats.js');
  const s = summarizeSupply([
    row(0, 0, 0, 20, -20, 4, 10, 6),  // 강한 순매도, 낮은 점수
    row(3, 1, 1, 50, 25, 15, 15, 25), // 중립
    row(6, 3, 0, 10, 30, 7, 1, 8),    // 강한 순매수, 85+
    row(5, 3, 1, 20, 20, 8, 6, 12),   // 순매수, 85+
  ]);
  assert.equal(s.n, 100);
  assert.equal(s.base.avg, 0.55);
  assert.equal(s.buckets.find((b) => b.key === 0).down, 50);
  assert.equal(s.buckets.find((b) => b.key === 6).up, 70);
  assert.equal(s.buckets.find((b) => b.key === 1).n, 0);
  const top = s.cross.find((c) => c.key === 3);
  assert.equal(top.all.n, 30);
  assert.equal(top.buy.n, 30);
  assert.equal(top.buy.up, 50);
  assert.equal(top.sell.n, 0);
  assert.equal(s.cross.find((c) => c.key === 1).flat.n, 50);
});
