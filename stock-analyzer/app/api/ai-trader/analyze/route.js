import { NextResponse } from 'next/server';
import { authorizeTrader, unauthorized } from '@/lib/verifyAuth';
import { runAnalysis } from '@/lib/analysisEngine';
import { fetchKrDailyBars } from '@/lib/yahooDaily';

export const maxDuration = 60;

// AI 트레이더 판단: 홈 화면 AI 분석과 같은 엔진(lib/analysisEngine.js)으로 점수를 매긴다.
// 무료 LLM 에 점수를 맡기던 방식은 응답이 들쭉날쭉하고 실패하면 매매가 멈춰서 쓰지 않는다.

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 약 1년치 일봉 (엔진의 52주·3개월 모멘텀용)
async function loadDaily(code) {
  const bars = await fetchKrDailyBars(code, 400);
  if (bars.length < 30) throw new Error(bars.length ? '일봉 데이터 부족' : '일봉 조회 실패');
  return bars;
}

// 매수 점수 0~100: 종합 점수(-10~+10)를 50±50 으로 펴고, 1주 전망 방향을 ±10 반영한다.
// 75점 이상(=종합 +3 이상이면서 1주 상승 전망, 또는 종합 +5 이상)만 매수 대상이 된다.
function buyScore(r) {
  const w = r.horizons.weekly.prediction;
  return Math.round(clamp(50 + r.scoreBreakdown.total * 5 + (w === '상승' ? 10 : w === '하락' ? -10 : 0), 0, 100));
}

// 손절·익절: 변동성(ATR) 기준. 손절 -2ATR(−3~−12%), 익절 +3ATR(+5~+30%)
function stops(price, atr) {
  const a = atr > 0 ? atr / price : 0.03;
  const sl = clamp(2 * a, 0.03, 0.12), tp = clamp(3 * a, 0.05, 0.3);
  return { stopLoss: Math.round(price * (1 - sl)), takeProfit: Math.round(price * (1 + tp)) };
}

export async function POST(request) {
  try {
    const { action, candidates, holdings } = await request.json();
    if (!(await authorizeTrader(request, undefined))) return unauthorized();

    if (action === 'analyze_buy') {
      if (!Array.isArray(candidates) || !candidates.length) {
        return NextResponse.json({ success: true, action: 'buy', results: [], summary: { total: 0, analyzed: 0, failed: 0 }, timestamp: new Date().toISOString() });
      }
      const results = [], errors = [];
      for (const c of candidates.slice(0, 15)) {
        try {
          const bars = await loadDaily(c.code);
          const r = runAnalysis({ chartData: bars, newsData: [], stockName: c.name });
          const price = r.indicators.currentPrice;
          const bulls = r.keySignals.filter((s) => s.type === 'bullish');
          const bears = r.keySignals.filter((s) => s.type === 'bearish');
          const w = r.horizons.weekly, m = r.horizons.monthly;
          results.push({
            ...c,
            aiAnalysis: {
              score: buyScore(r),
              reasons: bulls.slice(0, 3).map((s) => s.label).concat(bulls.length ? [] : ['뚜렷한 상승 신호 없음']),
              ...stops(price, r.scoreBreakdown.atr),
              holdPeriod: m.prediction === '상승' ? '2~4주' : '1주 안팎',
              risk: bears[0]?.label || `일간 변동성 ±${r.extras.sigmaD}%`,
              engine: { total: r.scoreBreakdown.total, weekly: { prediction: w.prediction, probs: w.probs }, monthly: { prediction: m.prediction, probs: m.probs } },
            },
          });
        } catch (e) {
          errors.push({ stock: c.name, error: e.message });
        }
      }
      results.sort((a, b) => b.aiAnalysis.score - a.aiAnalysis.score);
      return NextResponse.json({
        success: true, action: 'buy', results,
        errors: errors.length ? errors : undefined,
        summary: { total: candidates.length, analyzed: results.length, failed: errors.length },
        timestamp: new Date().toISOString(),
      });
    }

    if (action === 'analyze_sell') {
      const results = [], errors = [];
      for (const h of Array.isArray(holdings) ? holdings : []) {
        try {
          const bars = await loadDaily(h.code);
          const r = runAnalysis({ chartData: bars, newsData: [], stockName: h.name });
          const currentPrice = r.indicators.currentPrice;
          const profitRate = ((currentPrice - h.buyPrice) / h.buyPrice) * 100;
          const holdDays = Math.floor((Date.now() - new Date(h.buyDate)) / 864e5);
          const w = r.horizons.weekly;
          let analysis, triggerType = 'AI';
          if (h.stopLoss && currentPrice <= h.stopLoss) {
            triggerType = 'auto_stop_loss';
            analysis = { action: 'sell', score: 100, reason: `손절선 도달 (${h.stopLoss}원)` };
          } else if (h.takeProfit && currentPrice >= h.takeProfit) {
            triggerType = 'auto_take_profit';
            analysis = { action: 'sell', score: 100, reason: `익절선 도달 (${h.takeProfit}원)` };
          } else {
            // 1주 하락 전망이 확실하거나 종합 점수가 크게 꺾이면 매도
            const sell = (w.prediction === '하락' && w.probs.down >= 45) || r.scoreBreakdown.total <= -3;
            const bear = r.keySignals.find((s) => s.type === 'bearish');
            analysis = {
              action: sell ? 'sell' : 'hold',
              score: Math.round(clamp(50 - r.scoreBreakdown.total * 5, 0, 100)),
              reason: sell ? `1주 전망 ${w.prediction}(하락 ${w.probs.down}%)${bear ? ` · ${bear.label}` : ''}` : `보유 유지 (1주 전망 ${w.prediction})`,
            };
          }
          results.push({ ...h, currentPrice, profitRate, holdDays, aiAnalysis: analysis, triggerType });
        } catch (e) {
          errors.push({ stock: h.name, error: e.message });
        }
      }
      results.sort((a, b) => b.aiAnalysis.score - a.aiAnalysis.score);
      return NextResponse.json({ success: true, action: 'sell', results, errors: errors.length ? errors : undefined, timestamp: new Date().toISOString() });
    }

    return NextResponse.json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    console.error('AI 트레이더 판단 오류:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
