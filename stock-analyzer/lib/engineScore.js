// 분석 엔진 결과(runAnalysis) → 0~100 매수 점수와 등급. AI 트레이더와 스캐너가 같은 기준을 쓴다.
// (analysisEngine.js 를 건드리면 VM 수집기가 백테스트 전체를 다시 계산하므로 따로 둔다)

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

// 종합 점수(-10~+10)를 50±50 으로 펴고, 1주 전망 방향을 ±10 반영한다.
//
// 기준은 매수 점수 검증(collector /stats/buyscore, 시총 상위 99종목 2024-10~2026-11, 4.86만 건)으로 정했다.
// 5거래일 뒤: 전체 평균 +0.81%, +2% 넘게 오름 37.7%, −2% 넘게 내림 34.3%
//   75점+ (예전 기준, 전체의 16%): +1.38%, 40.2% / 38.0% → 오를 확률은 거의 그대로, 내릴 확률은 오히려 높음
//   85점+ (전체의 0.5%):           +2.41%, 48.5% / 33.8%, 앞·뒤 기간 모두 기준보다 높음(43.3 / 54.6%)
// 오를 확률이 확실히 높고 내릴 확률이 높아지지 않는 첫 구간이 85점이라 강력매수·AI 트레이더 매수 기준으로 쓴다.
// 70~84점은 평균 수익률은 높지만(+1.2~1.4%) 위아래로 더 크게 움직이는 종목이라 '매수고려'에 둔다.
export const BUY_THRESHOLD = 85;
export function buyScore(r) {
  const w = r.horizons.weekly.prediction;
  return Math.round(clamp(50 + r.scoreBreakdown.total * 5 + (w === '상승' ? 10 : w === '하락' ? -10 : 0), 0, 100));
}

// 40점 이하 두 등급은 '팔아라'가 아니라 엔진 신호가 약하다는 뜻이라 '매도주의·강력주의' 대신 '약세·강한 약세'로 부른다.
// (백테스트는 매수 쪽 기준만 검증했다)
export function scoreGrade(score) {
  if (score >= BUY_THRESHOLD) return '강력매수';
  if (score >= 70) return '매수고려';
  if (score > 40) return '관망';
  if (score > 25) return '약세';
  return '강한 약세';
}
