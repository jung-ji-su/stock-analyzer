import test from 'node:test';
import assert from 'node:assert/strict';
import { judgeResult, addBusinessDays, evalCloseFor, calcAccuracy, isUsSymbol } from '../lib/evalUtils.js';

test('judgeResult: 기간별 ±1/2/4% 기준', () => {
  assert.equal(judgeResult('상승', 100, 101.5, 'daily'), 'hit');
  assert.equal(judgeResult('상승', 100, 101.5, 'weekly'), 'miss');
  assert.equal(judgeResult('횡보', 100, 103.9, 'monthly'), 'hit');
  assert.equal(judgeResult('하락', 100, 97.9, 'weekly'), 'hit');
  assert.equal(judgeResult('하락', 100, 0, 'weekly'), 'pending');
});

test('addBusinessDays: 주말을 건너뛴다', () => {
  const fri = new Date(2026, 10, 20); // 2026-11-20 금
  const d = addBusinessDays(fri, 1);
  assert.equal(d.getDay(), 1);
  assert.equal(d.getDate(), 23);
});

test('evalCloseFor: 국내는 15:40 전 오늘 봉을 쓰지 않는다', () => {
  const candles = [{ time: '2026-11-20', close: 100 }, { time: '2026-11-23', close: 110 }];
  const before = Date.parse('2026-11-23T15:00:00+09:00');
  const after = Date.parse('2026-11-23T16:00:00+09:00');
  assert.equal(evalCloseFor(candles, '2026-11-23', before), null);
  assert.equal(evalCloseFor(candles, '2026-11-23', after), 110);
  assert.equal(evalCloseFor(candles, '2026-11-21', after), 110); // 주말 기준일이면 다음 거래일
});

test('calcAccuracy: 평가 종가로 다시 판정하고 대기는 따로 센다', () => {
  const a = calcAccuracy([
    { currentPrice: 100, daily: { prediction: '상승', evalPrice: 102 }, weekly: { prediction: '하락', evalPrice: 99 } },
    { currentPrice: 100, daily: { prediction: '횡보', evalStatus: 'pending' } },
  ]);
  assert.deepEqual([a.daily.hit, a.daily.pending, a.weekly.miss], [1, 1, 1]);
  assert.equal(a.total.rate, 50);
});

test('isUsSymbol', () => {
  assert.ok(isUsSymbol('AAPL'));
  assert.ok(isUsSymbol('BRK.B'));
  assert.ok(!isUsSymbol('005930'));
});
