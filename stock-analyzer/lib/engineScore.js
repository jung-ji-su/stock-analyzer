// 분석 엔진 결과(runAnalysis) → 0~100 매수 점수와 등급. AI 트레이더와 스캐너가 같은 기준을 쓴다.
// (analysisEngine.js 를 건드리면 VM 수집기가 백테스트 전체를 다시 계산하므로 따로 둔다)

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 종합 점수(-10~+10)를 50±50 으로 펴고, 1주 전망 방향을 ±10 반영한다.
// 75점 이상(=종합 +3 이상이면서 1주 상승 전망, 또는 종합 +5 이상)이면 AI 트레이더가 매수한다.
export const BUY_THRESHOLD = 75;
export function buyScore(r) {
  const w = r.horizons.weekly.prediction;
  return Math.round(clamp(50 + r.scoreBreakdown.total * 5 + (w === '상승' ? 10 : w === '하락' ? -10 : 0), 0, 100));
}

export function scoreGrade(score) {
  if (score >= BUY_THRESHOLD) return '강력매수';
  if (score >= 60) return '매수고려';
  if (score > 40) return '관망';
  if (score > 25) return '매도주의';
  return '강력주의';
}
