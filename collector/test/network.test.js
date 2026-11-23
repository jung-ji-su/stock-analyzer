import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

test('종목 관계 지도: 평균 연결 군집', async () => {
  mock.module('../src/db.js', { namedExports: { query: async () => [] } });
  const { cluster } = await import('../src/network.js');
  // 0·1·2 는 서로 0.8, 3·4 는 0.7, 5 는 모두와 0.1, 무리끼리는 0.2
  const g = [0, 0, 0, 1, 1, 2];
  const corr = (i, j) => (i === 5 || j === 5 ? 0.1 : g[i] === g[j] ? (g[i] === 0 ? 0.8 : 0.7) : 0.2);
  const out = cluster(6, corr);
  assert.equal(out[0], out[1]);
  assert.equal(out[1], out[2]);
  assert.equal(out[3], out[4]);
  assert.notEqual(out[0], out[3]);
  assert.equal(out[0], 0); // 큰 무리가 0번
  assert.equal(out[5], -1); // 혼자
  // 기준을 낮추면 두 무리가 합쳐진다
  const loose = cluster(6, corr, 0.15);
  assert.equal(loose[0], loose[3]);
});
