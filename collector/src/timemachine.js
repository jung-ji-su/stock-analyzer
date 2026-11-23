// 타임머신 매매 게임: 과거 어느 날(시총 상위 100종목 중 무작위)까지의 차트만 보여주고 산다/관망/판다를 고르게 한 뒤,
// 1주(5거래일) 뒤 결과와 같은 날 엔진의 판단을 공개한다. 가격은 그날 종가 = 10,000 으로 바꿔 종목을 알아보기 어렵게 한다.
import { query } from './db.js';
import { runAnalysis } from '../../stock-analyzer/lib/analysisEngine.js';
import { buyScore } from '../../stock-analyzer/lib/engineScore.js';
import { afterClose } from './kst.js';
import { WINDOW } from './jobs.js';

export const SHOW = 120;   // 보여주는 과거 일봉 수
export const HOLD = 5;     // 결과를 보는 거래일 (1주)
export const AFTER = 20;   // 공개할 때 더 보여주는 뒤 흐름
const BASE = 10000;
const r2 = (v) => Math.round(v * 100) / 100;

export const encodeRound = (code, date) => Buffer.from(`${code}|${date}`).toString('base64url');
export function decodeRound(token) {
  const [code, date] = Buffer.from(String(token || ''), 'base64url').toString().split('|');
  return /^[0-9A-Z]{6}$/.test(code || '') && /^\d{4}-\d{2}-\d{2}$/.test(date || '') ? { code, date } : null;
}

// 그날 종가를 BASE 로 맞춘 일봉 (가격대로 종목을 알아보지 못하게)
export function scaleBars(bars, ref) {
  const k = BASE / ref;
  return bars.map((b) => ({ time: b.time, open: Math.round(b.open * k), high: Math.round(b.high * k), low: Math.round(b.low * k), close: Math.round(b.close * k), volume: b.volume }));
}

// 선택별 1주 수익률: 산다 = 등락률, 판다(공매도) = 반대, 관망 = 0
export const pnlOf = (choice, ret) => r2(choice === 'buy' ? ret : choice === 'sell' ? -ret : 0);
// 엔진의 선택: 1주 전망이 상승이면 산다, 하락이면 판다, 횡보면 관망
export const engineChoice = (prediction) => (prediction === '상승' ? 'buy' : prediction === '하락' ? 'sell' : 'hold');

const loadBars = async (code) => (await query(
  `SELECT TO_CHAR(trade_date, 'YYYY-MM-DD') d, open_price o, high_price h, low_price l, close_price c, volume v
     FROM daily_bars WHERE code = :code ORDER BY trade_date`, { code }))
  .map((x) => ({ time: x.D, open: x.O, high: x.H, low: x.L, close: x.C, volume: x.V }));

// 무작위 문제: 엔진 신호가 있고 1주 뒤 결과가 확정된 날 중 하나
export async function newRound() {
  const pickRow = (await query(`
    SELECT code, TO_CHAR(signal_date, 'YYYY-MM-DD') d FROM engine_signals
     WHERE horizon = 'weekly' AND signal_date <= (SELECT MAX(trade_date) FROM daily_bars) - 10
     ORDER BY DBMS_RANDOM.VALUE FETCH FIRST 1 ROWS ONLY`))[0];
  if (!pickRow) return { error: '아직 문제를 낼 데이터가 없어요' };
  const bars = await loadBars(pickRow.CODE);
  const i = bars.findIndex((b) => b.time === pickRow.D);
  const past = bars.slice(Math.max(0, i - SHOW + 1), i + 1);
  return { round: encodeRound(pickRow.CODE, pickRow.D), bars: scaleBars(past, bars[i].close) };
}

export async function revealRound(token, choice) {
  const r = decodeRound(token);
  if (!r || !['buy', 'hold', 'sell'].includes(choice)) return { error: '잘못된 요청이에요' };
  const bars = await loadBars(r.code);
  const i = bars.findIndex((b) => b.time === r.date);
  if (i < 0 || i + HOLD >= bars.length) return { error: '결과를 확인할 수 없는 문제예요' };
  const name = (await query('SELECT name FROM stocks WHERE code = :code', { code: r.code }))[0]?.NAME || r.code;
  const ref = bars[i].close;
  const ret = r2((bars[i + HOLD].close / ref - 1) * 100);
  const a = runAnalysis({ chartData: bars.slice(Math.max(0, i - WINDOW + 1), i + 1), newsData: [], stockName: name, now: afterClose(r.date) });
  const w = a.horizons.weekly;
  const ai = engineChoice(w.prediction);
  return {
    code: r.code, name, date: r.date, price: ref, ret,
    future: scaleBars(bars.slice(i + 1, i + 1 + AFTER), ref),
    me: { choice, pnl: pnlOf(choice, ret) },
    ai: {
      choice: ai, pnl: pnlOf(ai, ret), prediction: w.prediction, probs: w.probs, score: buyScore(a),
      reasons: a.keySignals.slice(0, 3).map((s) => ({ label: s.label, easy: s.easy, type: s.type })),
    },
  };
}
