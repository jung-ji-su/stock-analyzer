import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

test('닮은꼴 차트: 모양 벡터·구간·서로 다른 사례 고르기', async () => {
  mock.module('../src/db.js', { namedExports: { query: async () => [], exec: async () => 0, many: async () => 0, getMeta: async () => null, setMeta: async () => {} } });
  const { shapeOf, buildRows, pickDistinct, summarize, LEN } = await import('../src/similar.js');

  // 같은 모양이면 가격 수준·폭이 달라도 벡터가 같다
  const a = Array.from({ length: LEN }, (_, i) => 1000 * (1 + Math.sin(i / 3) * 0.05));
  const sa = shapeOf(a), sb = shapeOf(a.map((c) => c * 37));
  assert.deepEqual(sa.vec, sb.vec);
  assert.equal(sa.path[0], 0);
  assert.ok(Math.abs(sa.vec.reduce((s, v) => s + v, 0)) < 1e-3);
  assert.equal(shapeOf(Array(LEN).fill(500)), null); // 평평하면 모양 없음
  assert.equal(shapeOf(a.slice(1)), null);

  // 구간: 끝나는 날마다 하나, 뒤 흐름이 모자라면 fwd 는 null
  const bars = Array.from({ length: 50 }, (_, i) => ({ d: new Date(Date.UTC(2025, 0, 1) + i * 86400000).toISOString().slice(0, 10), c: 100 + i + (i % 3) * 2 }));
  const rows = buildRows('005930', bars);
  assert.equal(rows.length, 50 - LEN + 1);
  assert.equal(JSON.parse(rows[0].vec).length, LEN);
  assert.equal(JSON.parse(rows[0].next).length, 20);
  assert.ok(rows[0].f5 != null && rows[0].f20 != null);
  assert.equal(rows.at(-1).f5, null);
  assert.equal(JSON.parse(rows.at(-1).next).length, 0);

  // 같은 종목 14일 이내 구간은 하나만
  const m = (code, date, fwd5) => ({ code, date, fwd5 });
  const picked = pickDistinct([m('A', '2025-01-10', 1), m('A', '2025-01-12', 2), m('B', '2025-01-11', -1), m('A', '2025-03-01', 3)], 12);
  assert.deepEqual(picked.map((x) => `${x.code}${x.date}`), ['A2025-01-10', 'B2025-01-11', 'A2025-03-01']);
  const s = summarize(picked, 'fwd5');
  assert.equal(s.n, 3);
  assert.equal(s.up, 2);
  assert.equal(s.upRate, 66.7);
});
