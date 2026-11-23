import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

test('타임머신: 문제 토큰, 가격 감추기, 선택별 수익', async () => {
  mock.module('../src/db.js', { namedExports: { query: async () => [], exec: async () => 0, many: async () => 0, getMeta: async () => null, setMeta: async () => {} } });
  const { encodeRound, decodeRound, scaleBars, pnlOf, engineChoice } = await import('../src/timemachine.js');
  const t = encodeRound('005930', '2025-03-14');
  assert.deepEqual(decodeRound(t), { code: '005930', date: '2025-03-14' });
  assert.equal(decodeRound('garbage'), null);
  assert.equal(decodeRound(Buffer.from('x;DROP|2025-01-01').toString('base64url')), null);

  const s = scaleBars([{ time: 'a', open: 50000, high: 51000, low: 49000, close: 50000, volume: 7 }, { time: 'b', open: 55000, high: 56000, low: 54000, close: 55000, volume: 8 }], 50000);
  assert.equal(s[0].close, 10000);
  assert.equal(s[1].close, 11000);
  assert.equal(s[1].volume, 8);

  assert.equal(pnlOf('buy', 3.456), 3.46);
  assert.equal(pnlOf('sell', 3.456), -3.46);
  assert.equal(pnlOf('hold', 3.456), 0);
  assert.equal(engineChoice('상승'), 'buy');
  assert.equal(engineChoice('하락'), 'sell');
  assert.equal(engineChoice('횡보'), 'hold');
});
