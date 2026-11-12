// 재무제표 종합 평가 (규칙 기반, 순수 함수). summary: 연간 데이터 최신순
export function evaluateFinancials(financialData) {
  const summary = financialData.summary;
  const latest = summary[0];
  const oldest = summary[summary.length - 1];
  const years = summary.length;
  const pct = (a, b) => (b > 0 ? (a / b) * 100 : 0);

  // 1. 성장성
  const revenueGrowth = oldest.revenue > 0 ? ((latest.revenue - oldest.revenue) / oldest.revenue) * 100 : 0;
  const profitGrowth = oldest.netIncome > 0 ? ((latest.netIncome - oldest.netIncome) / oldest.netIncome) * 100 : 0;
  const recent2 = summary.slice(0, 2), past3 = summary.slice(2, 5);
  const recentAvg = recent2.reduce((a, b) => a + b.revenue, 0) / recent2.length;
  const pastAvg = past3.length ? past3.reduce((a, b) => a + b.revenue, 0) / past3.length : recentAvg;
  const acceleration = pastAvg > 0 ? ((recentAvg - pastAvg) / pastAvg) * 100 : 0;

  // 2. 수익성
  const operatingMargin = pct(latest.operatingIncome, latest.revenue);
  const netMargin = pct(latest.netIncome, latest.revenue);
  const roa = pct(latest.netIncome, latest.totalAssets);
  const roe = pct(latest.netIncome, latest.totalEquity);
  const marginTrend = operatingMargin - pct(oldest.operatingIncome, oldest.revenue);

  // 3. 안정성
  const debtRatio = pct(latest.totalLiabilities, latest.totalEquity);
  const oldDebtRatio = pct(oldest.totalLiabilities, oldest.totalEquity);
  const debtTrend = debtRatio - oldDebtRatio;

  // 4. 효율성
  const assetTurnover = latest.totalAssets > 0 ? latest.revenue / latest.totalAssets : 0;

  // 5. 현금흐름
  const operatingCF = latest.operatingCF || 0;
  const cfRatio = latest.netIncome > 0 && operatingCF !== 0 ? (operatingCF / latest.netIncome) * 100 : 0;
  const hasCashFlowData = operatingCF !== 0 && latest.netIncome !== 0;
  const cashHealthy = hasCashFlowData && operatingCF > 0 && cfRatio > 80;
  const weakCash = hasCashFlowData && latest.netIncome > latest.revenue * 0.05 && operatingCF > 0 && cfRatio < 50;

  // 6. 위험 신호
  const risks = [];
  const lossYears = summary.filter((s) => s.netIncome < 0).length;
  if (lossYears >= 2) risks.push(`최근 ${years}년 중 ${lossYears}년 적자`);
  if (years >= 2 && latest.revenue < summary[1].revenue * 0.8) risks.push('전년 대비 매출 20% 이상 급감');
  if (debtTrend > 50) risks.push(`부채비율 ${debtTrend.toFixed(0)}%p 급증`);
  if (latest.netIncome < 0 && oldest.netIncome > 0) risks.push('흑자에서 적자로 전환');
  if (weakCash) risks.push('이익 대비 현금창출력 낮음 (현금흐름 점검 필요)');

  // 7. 점수 (기본 50)
  let score = 50;
  if (revenueGrowth > 100) score += 15; else if (revenueGrowth > 50) score += 12; else if (revenueGrowth > 20) score += 8; else if (revenueGrowth > 0) score += 4; else if (revenueGrowth < -20) score -= 10;
  if (acceleration > 20) score += 10; else if (acceleration > 0) score += 5; else if (acceleration < -10) score -= 5;
  if (operatingMargin > 25) score += 12; else if (operatingMargin > 15) score += 8; else if (operatingMargin > 10) score += 5; else if (operatingMargin > 5) score += 2; else if (operatingMargin < 0) score -= 8;
  if (roe > 20) score += 10; else if (roe > 15) score += 7; else if (roe > 10) score += 4; else if (roe < 0) score -= 8;
  if (marginTrend > 5) score += 8; else if (marginTrend < -5) score -= 8;
  if (debtRatio < 50) score += 12; else if (debtRatio < 100) score += 8; else if (debtRatio < 150) score += 3; else if (debtRatio > 300) score -= 10;
  if (debtTrend < -20) score += 8; else if (debtTrend > 50) score -= 10;
  if (latest.netIncome > 0 && latest.operatingIncome > 0) score += 5;
  if (assetTurnover > 1.5) score += 10; else if (assetTurnover > 1.0) score += 6; else if (assetTurnover > 0.5) score += 3;
  // 현금흐름은 한 번만 반영 (예전엔 두 번 더해졌음)
  if (cashHealthy) score += 10; else if (cfRatio > 50) score += 5; else if (weakCash) score -= 10;
  score -= risks.length * 5;
  score = Math.round(Math.min(100, Math.max(0, score)));

  const grade = score >= 90 ? 'A+' : score >= 85 ? 'A' : score >= 75 ? 'B+' : score >= 65 ? 'B' : score >= 55 ? 'C+' : score >= 45 ? 'C' : 'D';

  // 8. 강점·약점
  const strengths = [], weaknesses = [];
  if (revenueGrowth > 50) strengths.push(`${years}년간 매출 ${revenueGrowth.toFixed(1)}% 크게 성장`);
  else if (revenueGrowth > 20) strengths.push(`${years}년간 매출 ${revenueGrowth.toFixed(1)}% 꾸준히 성장`);
  else if (revenueGrowth < -20) weaknesses.push(`${years}년간 매출 ${Math.abs(revenueGrowth).toFixed(1)}% 감소`);
  if (acceleration > 20) strengths.push('최근 성장 속도가 빨라지고 있음');
  else if (acceleration < -10) weaknesses.push('최근 성장 속도가 느려지고 있음');
  if (roe > 20) strengths.push(`ROE ${roe.toFixed(1)}%로 자본 효율 매우 우수`);
  else if (roe > 15) strengths.push(`ROE ${roe.toFixed(1)}%로 자본 효율 양호`);
  else if (roe < 5 && roe > 0) weaknesses.push(`ROE ${roe.toFixed(1)}%로 자본 효율 낮음`);
  if (operatingMargin > 20) strengths.push(`영업이익률 ${operatingMargin.toFixed(1)}%로 수익성 매우 높음`);
  else if (operatingMargin > 15) strengths.push(`영업이익률 ${operatingMargin.toFixed(1)}%로 수익성 우수`);
  else if (operatingMargin < 5) weaknesses.push(`영업이익률 ${operatingMargin.toFixed(1)}%로 수익성 개선 필요`);
  if (marginTrend > 5) strengths.push(`영업이익률 ${marginTrend.toFixed(1)}%p 개선`);
  else if (marginTrend < -5) weaknesses.push(`영업이익률 ${Math.abs(marginTrend).toFixed(1)}%p 악화`);
  if (debtRatio < 50) strengths.push(`부채비율 ${debtRatio.toFixed(1)}%로 재무 매우 안정`);
  else if (debtRatio < 100) strengths.push(`부채비율 ${debtRatio.toFixed(1)}%로 재무 안정`);
  else if (debtRatio > 200) weaknesses.push(`부채비율 ${debtRatio.toFixed(1)}%로 재무 부담 매우 높음`);
  else if (debtRatio > 150) weaknesses.push(`부채비율 ${debtRatio.toFixed(1)}%로 재무 부담 높음`);
  if (assetTurnover > 1.5) strengths.push(`자산회전율 ${assetTurnover.toFixed(2)}로 자산 활용 우수`);
  if (cashHealthy) strengths.push(`영업현금흐름 ${Math.round(operatingCF / 1e8).toLocaleString()}억원으로 현금창출력 우수`);

  // 9. 인사이트
  const insights = [];
  if (revenueGrowth > 0 && profitGrowth > revenueGrowth * 1.5) insights.push(`이익 증가율(${profitGrowth.toFixed(1)}%)이 매출 증가율(${revenueGrowth.toFixed(1)}%)보다 높아 수익 구조가 좋아지는 중`);
  else if (revenueGrowth > 0 && profitGrowth < revenueGrowth * 0.5) insights.push('매출은 늘었지만 이익은 덜 늘어 비용 관리가 필요');
  if (latest.netIncome > 0 && netMargin > 10 && debtRatio < 100) insights.push('높은 수익성과 안정적인 재무구조로 배당 여력이 있음');
  if (operatingMargin > 15 && roe > 15) insights.push('영업이익률과 ROE 모두 우수해 질적으로 성장 중');
  if (oldDebtRatio > 0 && debtRatio < oldDebtRatio * 0.8) insights.push(`부채비율이 ${oldDebtRatio.toFixed(1)}%에서 ${debtRatio.toFixed(1)}%로 크게 개선`);
  if (acceleration > 10 && operatingMargin > 10) insights.push('성장 가속과 탄탄한 수익성이 함께 나타남');
  else if (acceleration < -10 && marginTrend < -3) insights.push('성장 둔화와 수익성 악화가 함께 나타남');
  if (roa > 10) insights.push(`ROA ${roa.toFixed(1)}%로 자산 대비 수익 창출이 높음`);

  // 10. 한 줄 평가
  let verdict;
  if (score >= 85) verdict = '성장성·수익성·안정성이 고르게 우수한 재무구조예요.';
  else if (score >= 75) verdict = `재무 지표가 양호한 편이에요.${weaknesses[0] ? ` 다만 ${weaknesses[0]} 점은 지켜볼 필요가 있어요.` : ''}`;
  else if (score >= 65) verdict = '평균 수준의 재무 지표예요. 업황 변화와 분기 실적 흐름을 함께 보는 게 좋아요.';
  else if (score >= 50) verdict = `개선이 필요한 부분이 있어요.${risks[0] ? ` 특히 '${risks[0]}'은 주의 신호예요.` : ''}`;
  else verdict = `재무 지표가 전반적으로 약해요.${risks.length ? ` ${risks.slice(0, 2).join(', ')} 등 위험 요소가 있어요.` : ''}`;

  return {
    score, grade, verdict,
    summary: `${financialData.corpName}은(는) 최근 ${years}년간 매출이 ${revenueGrowth >= 0 ? '+' : ''}${revenueGrowth.toFixed(1)}% 변했고, ROE ${roe.toFixed(1)}%, 부채비율 ${debtRatio.toFixed(1)}%예요.`,
    strengths, weaknesses, insights, risks,
    metrics: { revenueGrowth, profitGrowth, operatingMargin, netMargin, roa, roe, debtRatio, assetTurnover, cfRatio, operatingCF },
  };
}
