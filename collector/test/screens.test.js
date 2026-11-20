import test from 'node:test';
import assert from 'node:assert/strict';
import { mock } from 'node:test';

test('DB 스캐너: 연속 순매수 정렬·강도, 52주 신고가 근처 필터', async () => {
  const flows = [
    { CODE: 'A', NAME: '가', LAST_D: '2026-11-20', DAYS: 20, F_STREAK: 5, I_STREAK: 0, B_STREAK: 0, F_SUM: 500, I_SUM: null, B_SUM: null, LAST_CLOSE: 110, PREV_CLOSE: 100, AVG_VOL20: 1000 },
    { CODE: 'B', NAME: '나', LAST_D: '2026-11-20', DAYS: 20, F_STREAK: 5, I_STREAK: 3, B_STREAK: 2, F_SUM: 900, I_SUM: 300, B_SUM: 700, LAST_CLOSE: 50, PREV_CLOSE: 50, AVG_VOL20: 1000 },
    { CODE: 'C', NAME: '다', LAST_D: '2026-11-20', DAYS: 20, F_STREAK: 2, I_STREAK: 0, B_STREAK: 0, F_SUM: 50, I_SUM: null, B_SUM: null, LAST_CLOSE: 10, PREV_CLOSE: 10, AVG_VOL20: 100 },
  ];
  const highs = [
    { CODE: 'A', NAME: '가', LAST_D: '2026-11-20', LAST_CLOSE: 110, PREV_CLOSE: 100, HI52: 110, HI_PREV: 105, LO52: 60, LAST_VOL: 3000, AVG_VOL20: 1000, N: 250 },
    { CODE: 'B', NAME: '나', LAST_D: '2026-11-20', LAST_CLOSE: 50, PREV_CLOSE: 50, HI52: 100, HI_PREV: 100, LO52: 40, LAST_VOL: 10, AVG_VOL20: 10, N: 250 },
    { CODE: 'C', NAME: '다', LAST_D: '2026-11-20', LAST_CLOSE: 97, PREV_CLOSE: 96, HI52: 100, HI_PREV: 100, LO52: 50, LAST_VOL: 10, AVG_VOL20: 10, N: 120 },
  ];
  const seq = [flows, highs];
  mock.module('../src/db.js', { namedExports: { query: async () => seq.shift() } });
  const { screens } = await import('../src/screens.js');
  const s = await screens();
  assert.deepEqual(s.foreign.map((x) => x.code), ['B', 'A']); // 3일 미만 C 제외, 같은 5일이면 강도 큰 B 먼저
  assert.equal(s.foreign[0].strength, 90);
  assert.deepEqual(s.institution.map((x) => x.code), ['B']);
  assert.deepEqual(s.both.map((x) => x.code), ['B']);
  assert.deepEqual(s.nearHigh.map((x) => x.code), ['A']); // B 는 50% 아래, C 는 데이터 200일 미만
  assert.equal(s.nearHigh[0].newHigh, true);
  assert.equal(s.nearHigh[0].volRatio, 3);
  assert.equal(s.nearHigh[0].change, 10);
});
