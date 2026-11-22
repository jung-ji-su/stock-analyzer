import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

const row = (SCORE, HALF, N, S_CHG, UP, DOWN, WIN) => ({ SCORE, HALF, N, S_CHG, UP, DOWN, WIN });

test('매수 점수 검증: 구간·기준 이상·앞뒤 기간 요약', async () => {
  mock.module('../src/db.js', { namedExports: { query: async () => [] } });
  const { summarizeScores } = await import('../src/stats.js');
  const s = summarizeScores([
    row(30, 0, 50, -50, 10, 20, 20),
    row(55, 1, 30, 0, 9, 9, 15),
    row(77, 0, 10, 20, 5, 2, 7),
    row(88, 1, 10, 50, 8, 1, 9),
  ]);
  assert.equal(s.n, 100);
  assert.deepEqual(s.base, { n: 100, share: 100, avg: 0.2, up: 32, down: 32, win: 51, early: s.base.early, late: s.base.late });
  assert.equal(s.base.early.n, 60);
  const b = Object.fromEntries(s.buckets.map((x) => [`${x.lo}-${x.hi}`, x]));
  assert.equal(b['0-40'].n, 50);
  assert.equal(b['75-79'].avg, 2);
  assert.equal(b['60-64'].n, 0);
  const a75 = s.atLeast.find((x) => x.min === 75);
  assert.equal(a75.n, 20);
  assert.equal(a75.share, 20);
  assert.equal(a75.up, 65);
  assert.equal(a75.early.n, 10);
  assert.equal(a75.late.up, 80);
  assert.equal(s.atLeast.find((x) => x.min === 90).n, 0);
});
