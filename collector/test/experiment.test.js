import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluate, runExperiment, GRID } from '../src/experiment.js';

// 결과가 h 와 전혀 상관없는 가짜 데이터: 어떤 설정도 기준보다 나을 수 없어야 하고, drift 0 이 가장 정직해야 한다
function noise(n, seed = 3) {
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const g = () => Math.sqrt(-2 * Math.log(rnd() + 1e-12)) * Math.cos(2 * Math.PI * rnd());
  return Array.from({ length: n }, (_, i) => ({ horizon: 'daily', h: (rnd() - 0.5) * 16, sigma: 2, chg: g() * 2, date: String(10000 + i) }));
}

test('신호가 쓸모없으면 skill 은 0 근처 이하, 방향 가중을 키울수록 나빠진다', () => {
  const rows = noise(20000);
  const a = evaluate(rows, { driftK: 0, sigmaMult: 1, minScore: 0 }, 1, 1);
  const b = evaluate(rows, { driftK: 0.5, sigmaMult: 1, minScore: 0 }, 1, 1);
  assert.ok(a.skill > -1 && a.skill < 1.5, `skill ${a.skill}`);
  assert.ok(b.skill < a.skill);
  assert.ok(a.calibErr < 3);
});

test('신호가 실제로 맞으면 방향 가중이 있는 설정이 이긴다', () => {
  const rows = noise(20000).map((x) => ({ ...x, chg: x.chg + x.h * 0.15 }));
  const res = runExperiment(rows).daily;
  assert.equal(res.length, GRID.length);
  assert.ok(res[0].params.driftK > 0);
  assert.ok(res.some((x) => x.current));
});
