import test from 'node:test';
import assert from 'node:assert/strict';
import { computeSignals, engineVersion } from '../src/jobs.js';
import { runAnalysis } from '../../stock-analyzer/lib/analysisEngine.js';

function bars(n, seed = 11) {
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  let p = 50000; const out = []; const d0 = Date.UTC(2023, 0, 2);
  for (let i = 0; i < n; i++) {
    const o = p; p = Math.max(1000, p * (1 + (rnd() - 0.49) * 0.04));
    out.push({ time: new Date(d0 + i * 864e5).toISOString().slice(0, 10), open: o, high: Math.max(o, p) * 1.005, low: Math.min(o, p) * 0.995, close: p, volume: 1e5 + rnd() * 1e6 });
  }
  return out;
}

test('신호: 250일 쌓인 날부터 날짜×3기간, 그날까지의 일봉만 써서 계산한다 (미래 데이터 안 씀)', () => {
  const b = bars(400);
  const t0 = Date.now();
  const s = computeSignals('005930', b, 'v1');
  const perStock = Date.now() - t0;
  assert.equal(s.length, (400 - 249) * 3);
  assert.equal(s[0].d, b[249].time);
  // 같은 날짜를 그날까지 잘라서 직접 돌린 결과와 같아야 한다
  const i = 300;
  const direct = runAnalysis({ chartData: b.slice(i - 279, i + 1), newsData: [], stockName: '', now: Date.parse(`${b[i].time}T16:00:00+09:00`) });
  const row = s.find((x) => x.d === b[i].time && x.horizon === 'weekly');
  assert.equal(row.pred, direct.horizons.weekly.prediction);
  assert.equal(row.conf, direct.horizons.weekly.confidence);
  // 미래 일봉을 바꿔도 과거 신호는 그대로
  const b2 = b.map((x, k) => (k > i ? { ...x, close: x.close * 2 } : x));
  assert.deepEqual(computeSignals('005930', b2, 'v1').filter((x) => x.d === b[i].time), s.filter((x) => x.d === b[i].time));
  console.log(`  종목당(151일) ${perStock}ms`);
});

test('신호: fromDate 이후만 새로 계산', () => {
  const b = bars(300);
  assert.equal(computeSignals('X', b, 'v', b[290].time).length, 9 * 3);
});

test('엔진 버전은 엔진 파일 내용으로 정해진다', () => {
  assert.match(engineVersion(), /^[0-9a-f]{12}$/);
});
