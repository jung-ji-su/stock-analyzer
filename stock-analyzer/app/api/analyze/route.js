const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// ============================
// 기술 지표 계산 함수들
// ============================
function calcSMA(data, period) {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    const slice = data.slice(i - period + 1, i + 1);
    return slice.reduce((a, b) => a + b, 0) / period;
  });
}

function calcRSI(closes, period = 14) {
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  const rsiValues = [];
  for (let i = 0; i < closes.length; i++) {
    if (i < period) { rsiValues.push(null); continue; }
    const slice = changes.slice(i - period, i);
    const gains = slice.filter(c => c > 0).reduce((a, b) => a + b, 0) / period;
    const losses = Math.abs(slice.filter(c => c < 0).reduce((a, b) => a + b, 0)) / period;
    if (losses === 0) { rsiValues.push(100); continue; }
    rsiValues.push(100 - (100 / (1 + gains / losses)));
  }
  return rsiValues;
}

function calcEMA(data, period) {
  const k = 2 / (period + 1);
  const ema = [];
  let prevEma = null;
  for (const val of data) {
    if (val === null) { ema.push(null); continue; }
    if (prevEma === null) { prevEma = val; ema.push(val); continue; }
    prevEma = val * k + prevEma * (1 - k);
    ema.push(prevEma);
  }
  return ema;
}

function calcMACD(closes) {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v && ema26[i] ? v - ema26[i] : null);
  const validMacd = macdLine.filter(v => v !== null);
  const signal = calcEMA(validMacd, 9);
  const fullSignal = macdLine.map((v, i) => {
    if (v === null) return null;
    const idx = macdLine.slice(0, i + 1).filter(x => x !== null).length - 1;
    return signal[idx] || null;
  });
  return { macdLine, signal: fullSignal };
}

function calcBollingerBands(closes, period = 20) {
  const sma = calcSMA(closes, period);
  return sma.map((avg, i) => {
    if (avg === null) return { upper: null, middle: null, lower: null };
    const slice = closes.slice(i - period + 1, i + 1);
    const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / period);
    return { upper: avg + 2 * std, middle: avg, lower: avg - 2 * std };
  });
}

function calcVolumeProfile(chartData, bins = 10) {
  const prices = chartData.map(d => d.close);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);
  const binSize = (maxP - minP) / bins;
  const profile = Array(bins).fill(0).map((_, i) => ({
    priceFrom: Math.round(minP + i * binSize),
    priceTo: Math.round(minP + (i + 1) * binSize),
    volume: 0,
  }));
  chartData.forEach(d => {
    const idx = Math.min(Math.floor((d.close - minP) / binSize), bins - 1);
    profile[idx].volume += d.volume;
  });
  const top3 = profile.sort((a, b) => b.volume - a.volume).slice(0, 5);
  const totalVol = top3.reduce((a, p) => a + p.volume, 0);
  return top3.map(p => ({ ...p, strength: Math.round((p.volume / totalVol) * 100) }));
}

// ============================
// 퀀트 팩터 계산
// ============================
function calcZScore(closes, period = 20) {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
  if (std === 0) return 0;
  return (closes[closes.length - 1] - mean) / std;
}

function calcATR(chartData, period = 14) {
  if (chartData.length < period + 1) return 0;
  const trueRanges = chartData.slice(1).map((d, i) => {
    const prevClose = chartData[i].close;
    return Math.max(d.high - d.low, Math.abs(d.high - prevClose), Math.abs(d.low - prevClose));
  });
  return trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcVWAP(chartData) {
  if (chartData.length === 0) return 0;
  const recent = chartData.slice(-20);
  const totalVolume = recent.reduce((a, d) => a + d.volume, 0);
  if (totalVolume === 0) return chartData[chartData.length - 1].close;
  return recent.reduce((a, d) => a + ((d.high + d.low + d.close) / 3) * d.volume, 0) / totalVolume;
}

function calcMomentumScore(closes) {
  if (closes.length < 20) return 0;
  const current = closes[closes.length - 1];
  const month1Return = closes.length >= 20 ? (current - closes[closes.length - 20]) / closes[closes.length - 20] : 0;
  const month3Return = closes.length >= 60 ? (current - closes[closes.length - 60]) / closes[closes.length - 60] : month1Return;
  return (month1Return * 0.4 + month3Return * 0.6) * 100;
}

// ============================
// Layer 1: 기술지표 스코어
// ============================
function calcIndicatorScore(indicators) {
  let score = 0;
  const signals = [];

  const rsi = indicators.rsi;
  if (rsi < 30) { score += 4; signals.push({ label: 'RSI 과매도 구간', score: +4, type: 'bullish', easy: '주가가 너무 많이 떨어져서 반등 가능성이 높아요' }); }
  else if (rsi < 40) { score += 2; signals.push({ label: 'RSI 저점 근접', score: +2, type: 'bullish', easy: '주가가 많이 내려온 편이라 반등 가능성이 있습니다' }); }
  else if (rsi > 70) { score -= 4; signals.push({ label: 'RSI 과매수 구간', score: -4, type: 'bearish', easy: '주가가 너무 올라 과열된 상태예요. 조정이 올 수 있어요' }); }
  else if (rsi > 60) { score -= 2; signals.push({ label: 'RSI 고점 근접', score: -2, type: 'bearish', easy: '주가가 많이 오른 편이라 쉬어갈 수 있습니다' }); }
  else { signals.push({ label: 'RSI 중립', score: 0, type: 'neutral', easy: '과열도 침체도 아닌 안정적인 구간입니다' }); }

  const { macd, macdSignal, macdHistogram } = indicators;
  if (macd > macdSignal && macdHistogram > 0 && macd > 0) { score += 4; signals.push({ label: 'MACD 강한 골든크로스', score: +4, type: 'bullish', easy: '상승 신호가 매우 강합니다' }); }
  else if (macd > macdSignal && macdHistogram > 0) { score += 2; signals.push({ label: 'MACD 골든크로스', score: +2, type: 'bullish', easy: '상승 전환 신호가 나왔습니다' }); }
  else if (macd < macdSignal && macdHistogram < 0 && macd < 0) { score -= 4; signals.push({ label: 'MACD 강한 데드크로스', score: -4, type: 'bearish', easy: '하락 신호가 매우 강합니다' }); }
  else if (macd < macdSignal && macdHistogram < 0) { score -= 2; signals.push({ label: 'MACD 데드크로스', score: -2, type: 'bearish', easy: '하락 전환 신호가 나왔습니다' }); }
  else { signals.push({ label: 'MACD 중립', score: 0, type: 'neutral', easy: '아직 방향이 결정되지 않은 상태입니다' }); }

  const price = indicators.currentPrice;
  const ma20 = indicators.ma20;
  const ma60 = indicators.ma60;
  if (price > ma20 && price > ma60 && ma20 > ma60) { score += 4; signals.push({ label: '완전 정배열 (강한 상승 추세)', score: +4, type: 'bullish', easy: '이동평균 모두 위에 있어 상승 흐름이에요' }); }
  else if (price > ma20 && price > ma60) { score += 2; signals.push({ label: '이평선 위 (상승 추세)', score: +2, type: 'bullish', easy: '평균보다 위에 있어 상승 흐름이에요' }); }
  else if (price < ma20 && price < ma60 && ma20 < ma60) { score -= 4; signals.push({ label: '완전 역배열 (강한 하락 추세)', score: -4, type: 'bearish', easy: '이동평균 모두 아래에 있어 하락 흐름이에요' }); }
  else if (price < ma20 && price < ma60) { score -= 2; signals.push({ label: '이평선 아래 (하락 추세)', score: -2, type: 'bearish', easy: '평균보다 아래에 있어 하락 흐름이에요' }); }
  else { signals.push({ label: '이평선 혼조', score: 0, type: 'neutral', easy: '방향이 애매한 구간이에요' }); }

  const bbRange = indicators.bbUpper - indicators.bbLower;
  const bbPos = bbRange > 0 ? ((price - indicators.bbLower) / bbRange) * 100 : 50;
  if (bbPos < 10) { score += 3; signals.push({ label: '볼린저 하단 이탈 (반등 가능)', score: +3, type: 'bullish', easy: '정상 범위 밖으로 내려와 반등 가능성이 높아요' }); }
  else if (bbPos < 25) { score += 1; signals.push({ label: '볼린저 하단 근접', score: +1, type: 'bullish', easy: '정상 범위 아래쪽에 있어요' }); }
  else if (bbPos > 90) { score -= 3; signals.push({ label: '볼린저 상단 이탈 (과열)', score: -3, type: 'bearish', easy: '정상 범위 밖으로 올라와 조정 가능성이 있어요' }); }
  else if (bbPos > 75) { score -= 1; signals.push({ label: '볼린저 상단 근접', score: -1, type: 'bearish', easy: '정상 범위 위쪽에 있어요' }); }
  else { signals.push({ label: '볼린저밴드 중간 구간', score: 0, type: 'neutral', easy: '안정적인 범위 안에 있어요' }); }

  const volRatio = indicators.volumeRatio;
  const recentPrices = indicators.recentPrices || [];
  const priceUp = recentPrices.length > 1 && recentPrices[recentPrices.length - 1] > recentPrices[recentPrices.length - 2];
  if (volRatio > 2) {
    if (priceUp) { score += 3; signals.push({ label: '거래량 급등 + 상승 (강한 매수세)', score: +3, type: 'bullish', easy: '많은 사람들이 사고 있고 가격도 오르고 있어요' }); }
    else { score -= 3; signals.push({ label: '거래량 급등 + 하락 (강한 매도세)', score: -3, type: 'bearish', easy: '많은 사람들이 팔고 있고 가격도 내리고 있어요' }); }
  } else if (volRatio > 1.5) { score += 1; signals.push({ label: '거래량 증가', score: +1, type: 'bullish', easy: '평소보다 거래가 활발합니다' }); }
  else if (volRatio < 0.5) { score -= 1; signals.push({ label: '거래량 급감', score: -1, type: 'bearish', easy: '거래가 매우 적어 관심이 줄고 있어요' }); }
  else { signals.push({ label: '거래량 평균', score: 0, type: 'neutral', easy: '거래량이 평소와 비슷해요' }); }

  const volumeProfile = indicators.volumeProfile || [];
  if (volumeProfile.length > 0) {
    const nearSupport = volumeProfile.some(p => Math.abs(price - p.priceFrom) / price < 0.02);
    const nearResistance = volumeProfile.some(p => Math.abs(price - p.priceTo) / price < 0.02);
    if (nearSupport) { score += 2; signals.push({ label: '매물대 지지 근접', score: +2, type: 'bullish', easy: '과거 많이 거래된 가격대라 버텨줄 가능성이 높아요' }); }
    if (nearResistance) { score -= 2; signals.push({ label: '매물대 저항 근접', score: -2, type: 'bearish', easy: '과거 많이 팔린 가격대라 막힐 수 있어요' }); }
  }

  return { score, signals };
}

// ============================
// Layer 2: 퀀트 팩터 스코어
// ============================
function calcQuantScoreLayer(chartData, closes) {
  let score = 0;
  const signals = [];
  const currentPrice = closes[closes.length - 1];

  // Z-Score
  const zScore = calcZScore(closes, 20);
  const zR = Math.round(zScore * 100) / 100;
  if (zScore < -2) { score += 4; signals.push({ label: `Z-Score ${zR} (통계적 과매도)`, score: +4, type: 'bullish', easy: '통계적으로 정상보다 많이 낮아 반등 가능성이 높아요' }); }
  else if (zScore < -1) { score += 2; signals.push({ label: `Z-Score ${zR} (하단)`, score: +2, type: 'bullish', easy: '평균보다 낮은 편이에요' }); }
  else if (zScore > 2) { score -= 4; signals.push({ label: `Z-Score ${zR} (통계적 과매수)`, score: -4, type: 'bearish', easy: '통계적으로 정상보다 많이 높아 내려올 가능성이 있어요' }); }
  else if (zScore > 1) { score -= 2; signals.push({ label: `Z-Score ${zR} (상단)`, score: -2, type: 'bearish', easy: '평균보다 높은 편이에요' }); }
  else { signals.push({ label: `Z-Score ${zR} (중립)`, score: 0, type: 'neutral', easy: '통계적으로 정상 범위에요' }); }

  // VWAP
  const vwap = calcVWAP(chartData);
  const vwapDiff = ((currentPrice - vwap) / vwap) * 100;
  const vR = Math.round(vwapDiff * 10) / 10;
  if (vwapDiff > 3) { score -= 2; signals.push({ label: `VWAP +${vR}% (기관 기준 상단)`, score: -2, type: 'bearish', easy: '기관 평균 매수가보다 많이 올라 기관이 팔 수 있어요' }); }
  else if (vwapDiff > 1) { score += 1; signals.push({ label: `VWAP +${vR}% (기관 기준 위)`, score: +1, type: 'bullish', easy: '기관 매수가보다 위에 있어 긍정적이에요' }); }
  else if (vwapDiff < -3) { score += 2; signals.push({ label: `VWAP ${vR}% (기관 기준 하단)`, score: +2, type: 'bullish', easy: '기관 매수가보다 많이 내려와 기관이 살 수 있어요' }); }
  else if (vwapDiff < -1) { score -= 1; signals.push({ label: `VWAP ${vR}% (기관 기준 아래)`, score: -1, type: 'bearish', easy: '기관 매수가보다 아래에 있어요' }); }
  else { signals.push({ label: `VWAP 근접 (${vR}%)`, score: 0, type: 'neutral', easy: '기관 매수가와 비슷한 수준이에요' }); }

  // 모멘텀
  const momentum = calcMomentumScore(closes);
  const mR = Math.round(momentum * 10) / 10;
  if (momentum > 15) { score += 3; signals.push({ label: `모멘텀 +${mR}% (강한 상승)`, score: +3, type: 'bullish', easy: '최근 몇 달간 꾸준히 올라왔어요' }); }
  else if (momentum > 5) { score += 1; signals.push({ label: `모멘텀 +${mR}%`, score: +1, type: 'bullish', easy: '최근 상승 흐름이 있어요' }); }
  else if (momentum < -15) { score -= 3; signals.push({ label: `모멘텀 ${mR}% (강한 하락)`, score: -3, type: 'bearish', easy: '최근 몇 달간 꾸준히 내려왔어요' }); }
  else if (momentum < -5) { score -= 1; signals.push({ label: `모멘텀 ${mR}%`, score: -1, type: 'bearish', easy: '최근 하락 흐름이 있어요' }); }
  else { signals.push({ label: `모멘텀 ${mR}% (중립)`, score: 0, type: 'neutral', easy: '큰 방향성 없이 횡보 중이에요' }); }

  const atr = calcATR(chartData);
  const atrRatio = currentPrice > 0 ? Math.round((atr / currentPrice) * 10000) / 100 : 0;

  return { score, signals, atr, atrRatio, zScore: zR, vwapDiff: vR, momentum: mR };
}

// ============================
// Layer 3: 뉴스 감성 스코어
// ============================
function calcNewsScore(newsData) {
  if (!newsData || newsData.length === 0) return { score: 0, signals: [], positiveCount: 0, negativeCount: 0 };

  const positiveKw = ['상승', '급등', '호실적', '매수', '목표가 상향', '신고가', '수주', '흑자', '성장', '기대', '호재', '강세', '돌파', '반등', '개선', '최대', '사상최고', '증가'];
  const negativeKw = ['하락', '급락', '적자', '매도', '목표가 하향', '신저가', '손실', '부진', '우려', '악재', '약세', '이탈', '악화', '위기', '폭락', '감소', '최저'];

  let newsScore = 0, positiveCount = 0, negativeCount = 0;

  newsData.forEach(news => {
    const text = (news.title + ' ' + (news.desc || ''));
    let articleScore = 0;
    positiveKw.forEach(kw => { if (text.includes(kw)) articleScore += 1; });
    negativeKw.forEach(kw => { if (text.includes(kw)) articleScore -= 1; });
    if (articleScore > 0) positiveCount++;
    else if (articleScore < 0) negativeCount++;
    newsScore += articleScore;
  });

  const signals = [];
  if (positiveCount > negativeCount * 1.5) {
    signals.push({ label: `긍정 뉴스 우세 (긍정 ${positiveCount} / 부정 ${negativeCount})`, score: newsScore, type: 'bullish', easy: '최근 뉴스 분위기가 좋아요' });
  } else if (negativeCount > positiveCount * 1.5) {
    signals.push({ label: `부정 뉴스 우세 (부정 ${negativeCount} / 긍정 ${positiveCount})`, score: newsScore, type: 'bearish', easy: '최근 뉴스 분위기가 좋지 않아요' });
  } else {
    signals.push({ label: `뉴스 혼조 (긍정 ${positiveCount} / 부정 ${negativeCount})`, score: 0, type: 'neutral', easy: '긍정·부정 뉴스가 섞여있어요' });
  }

  return { score: Math.max(-5, Math.min(5, newsScore)), signals, positiveCount, negativeCount };
}

// ============================
// 확률 / 신뢰도 / 시나리오
// ============================
function scoreToProbability(totalScore) {
  const probability = 1 / (1 + Math.exp(-0.18 * totalScore));
  return { bullish: Math.round(probability * 100), bearish: Math.round((1 - probability) * 100) };
}

function calcConfidence(allSignals, atrRatio = 0) {
  const bullishCount = allSignals.filter(s => s.type === 'bullish').length;
  const bearishCount = allSignals.filter(s => s.type === 'bearish').length;
  const neutralCount = allSignals.filter(s => s.type === 'neutral').length;
  const total = allSignals.length;
  if (total === 0) return 50;

  const dominantCount = Math.max(bullishCount, bearishCount);
  const activeTotal = total - neutralCount || 1;
  const consistencyRatio = dominantCount / activeTotal;
  const conflictPenalty = Math.min(bullishCount, bearishCount) * 4;
  const dataBonus = total >= 10 ? 10 : total >= 6 ? 5 : 0;
  const volatilityPenalty = atrRatio > 5 ? 15 : atrRatio > 3 ? 8 : atrRatio > 2 ? 4 : 0;

  return Math.max(20, Math.min(95, Math.round(consistencyRatio * 80 + dataBonus - conflictPenalty - volatilityPenalty)));
}

function generateScenarios(indicators, probability, allSignals) {
  const price = indicators.currentPrice;
  const target1 = Math.round(Math.max(indicators.bbUpper, price * 1.03));
  const target2 = Math.round(price * 1.05);
  const support1 = Math.round(Math.max(indicators.bbLower, indicators.ma20 < price ? indicators.ma20 : indicators.bbLower));
  const support2 = Math.round(indicators.ma60 < price ? indicators.ma60 : price * 0.94);

  return {
    scenarioA: {
      name: '상승 시나리오', probability: probability.bullish,
      conditions: allSignals.filter(s => s.type === 'bullish').slice(0, 3).map(s => s.label),
      flow: `${price.toLocaleString()}원 → ${target1.toLocaleString()}원`,
      targetRange: { low: Math.round(price * 1.02), high: target2 },
    },
    scenarioB: {
      name: '하락 시나리오', probability: probability.bearish,
      conditions: allSignals.filter(s => s.type === 'bearish').slice(0, 3).map(s => s.label),
      flow: `${support1.toLocaleString()}원 이탈 시 → ${support2.toLocaleString()}원`,
      targetRange: { high: Math.round(price * 0.98), low: support2 },
    },
  };
}

// ============================
// ★ 안전한 JSON 파싱 (3단계 시도)
// ============================
function safeParseJSON(text) {
  // 1단계: ```json ``` 코드블록 추출
  const codeBlock = text.match(/```json\s*([\s\S]*?)```/);
  if (codeBlock) {
    try { return JSON.parse(codeBlock[1].trim()); } catch {}
  }

  // 2단계: 일반 JSON 추출
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try { return JSON.parse(jsonMatch[0]); } catch {}
  }

  // 3단계: 제어문자/후행 콤마 정리 후 재시도
  const cleaned = text
    .replace(/[\x00-\x1F\x7F]/g, ' ')
    .replace(/,\s*}/g, '}')
    .replace(/,\s*]/g, ']');
  const retry = cleaned.match(/\{[\s\S]*\}/);
  if (retry) {
    try { return JSON.parse(retry[0]); } catch {}
  }

  return null;
}

// ============================
// ★ AI 실패 시 Fallback 응답
// ============================
function generateFallback(currentPrice, probability, confidence, scoreBreakdown) {
  const isUp = probability.bullish > probability.bearish;
  const prediction = isUp ? '상승' : probability.bullish === probability.bearish ? '횡보' : '하락';
  const mult = isUp ? 1.02 : prediction === '횡보' ? 1.0 : 0.98;
  const base = { prediction, confidence, reason: '퀀트 점수 기반 자동 판단입니다.', easyReason: 'AI 분석을 받지 못해 점수 기반으로 표시합니다.' };

  return {
    daily: { ...base, targetPrice: Math.round(currentPrice * mult) },
    weekly: { ...base, targetPrice: Math.round(currentPrice * (1 + (mult - 1) * 2)) },
    monthly: { ...base, targetPrice: Math.round(currentPrice * (1 + (mult - 1) * 3)) },
    summary: `종합 ${scoreBreakdown.total}점, 상승 확률 ${probability.bullish}% 기반 자동 분석입니다.`,
    easySummary: '자세한 AI 분석을 받지 못해 점수 기반 요약이에요.',
    keyPoints: [`종합 ${scoreBreakdown.total}점`, `상승 확률 ${probability.bullish}%`, `신뢰도 ${confidence}%`],
    quantInsight: '퀀트 점수 기반 요약입니다.',
    riskWarning: '변동성이 클 수 있으니 분할 매매를 고려하세요.',
    indicatorComments: {},
  };
}

// ============================
// ★ POST 핸들러
// ============================
export async function POST(request) {
  try {
    const { chartData, stockName, symbol, newsData } = await request.json();

    if (!chartData || chartData.length < 10) {
      return Response.json({ error: '데이터가 부족합니다' }, { status: 400 });
    }

    const closes = chartData.map(d => d.close);
    const volumes = chartData.map(d => d.volume);

    const rsi = calcRSI(closes);
    const { macdLine, signal } = calcMACD(closes);
    const bb = calcBollingerBands(closes);
    const ma20 = calcSMA(closes, 20);
    const ma60 = calcSMA(closes, 60);
    const volumeProfile = calcVolumeProfile(chartData);

    const lastRSI = rsi.filter(v => v !== null).slice(-1)[0];
    const lastMACD = macdLine.filter(v => v !== null).slice(-1)[0];
    const lastSignal = signal.filter(v => v !== null).slice(-1)[0];
    const lastBB = bb.filter(v => v.upper !== null).slice(-1)[0];
    const lastMA20 = ma20.filter(v => v !== null).slice(-1)[0];
    const lastMA60 = ma60.filter(v => v !== null).slice(-1)[0];
    const currentPrice = closes[closes.length - 1];
    const avgVolume = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
    const recentVolume = volumes[volumes.length - 1];
    const recentPrices = closes.slice(-10);

    const indicators = {
      currentPrice,
      rsi: Math.round(lastRSI * 10) / 10,
      macd: Math.round(lastMACD * 10) / 10,
      macdSignal: Math.round(lastSignal * 10) / 10,
      macdHistogram: Math.round((lastMACD - lastSignal) * 10) / 10,
      bbUpper: Math.round(lastBB.upper),
      bbMiddle: Math.round(lastBB.middle),
      bbLower: Math.round(lastBB.lower),
      ma20: Math.round(lastMA20),
      ma60: Math.round(lastMA60),
      volumeRatio: Math.round((recentVolume / avgVolume) * 100) / 100,
      volumeProfile,
      recentPrices,
    };

    // ── 3개 레이어 분석 (MTF 제거) ──
    const { score: techScore, signals: techSignals } = calcIndicatorScore(indicators);
    const { score: quantScore, signals: quantSignals, atr, atrRatio, zScore, vwapDiff, momentum } = calcQuantScoreLayer(chartData, closes);
    const { score: newsScore, signals: newsSignals, positiveCount, negativeCount } = calcNewsScore(newsData);

    // 가중치: 기술지표 35% + 퀀트 40% + 뉴스 25%
    const totalScore = techScore * 0.35 + quantScore * 0.40 + newsScore * 0.25;

    const probability = scoreToProbability(totalScore);
    const allSignals = [...techSignals, ...quantSignals, ...newsSignals];
    const confidence = calcConfidence(allSignals, atrRatio);

    const keySignals = allSignals
      .filter(s => s.type !== 'neutral')
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .slice(0, 6);

    const scenarios = generateScenarios(indicators, probability, allSignals);

    const scoreBreakdown = {
      tech: { score: Math.round(techScore * 10) / 10, weight: '35%', label: '기술지표' },
      quant: { score: Math.round(quantScore * 10) / 10, weight: '40%', label: '퀀트팩터' },
      news: { score: Math.round(newsScore * 10) / 10, weight: '25%', label: '뉴스감성' },
      total: Math.round(totalScore * 10) / 10,
      atr: Math.round(atr),
      atrRatio,
    };

    // ══════════════════════════════════
    // ★ 개선된 AI 프롬프트 (System + User 분리)
    // ══════════════════════════════════
    const systemPrompt = `당신은 한국 주식 시장 전문 퀀트 애널리스트입니다.

## 절대 규칙
1. 제공된 데이터에만 근거하세요. 외부 정보나 추측을 사용하지 마세요.
2. 모든 주장에 구체적 수치를 인용하세요. (예: "RSI 28로 과매도", "거래량 2.3배")
3. prediction이 "상승"이면 targetPrice는 반드시 현재가(${currentPrice})보다 높아야 합니다.
4. prediction이 "하락"이면 targetPrice는 반드시 현재가(${currentPrice})보다 낮아야 합니다.
5. prediction이 "횡보"면 targetPrice는 현재가 ±2% 이내여야 합니다.
6. 불확실하면 솔직하게 "신호 혼조"라고 표현하세요.
7. JSON만 출력하세요. 다른 텍스트를 절대 포함하지 마세요.

## 분석 절차 (이 순서로 내부 판단 후 결론을 JSON에 반영)
Step 1: 기술지표에서 추세/과열 여부 파악
Step 2: 퀀트팩터에서 통계적 위치와 모멘텀 확인
Step 3: 뉴스 감성에서 시장 심리 파악
Step 4: 신호 일치 → 확신↑, 신호 충돌 → "혼조" 표현

## 좋은 분석의 특징
- "RSI 28 과매도 + MACD 골든크로스 + 거래량 2.5배 = 단기 반등 가능성" 처럼 복수 지표 연결
- "MACD 양전환이지만 거래량 부족으로 확인 필요" 처럼 신호 간 충돌도 솔직하게 분석
- easyReason에는 초등학생도 이해할 비유 사용 (예: "고무줄처럼 너무 늘어나서 튕길 준비")`;

    const userPrompt = `# ${stockName}(${symbol}) 분석 데이터

현재가: ${currentPrice.toLocaleString()}원

## 종합 ${scoreBreakdown.total}점 | 상승 ${probability.bullish}% 하락 ${probability.bearish}% | 신뢰도 ${confidence}%
- 기술지표(35%): ${scoreBreakdown.tech.score}점
- 퀀트팩터(40%): ${scoreBreakdown.quant.score}점
- 뉴스감성(25%): ${scoreBreakdown.news.score}점

## 핵심 신호 (점수순)
${keySignals.map(s => `[${s.type === 'bullish' ? '📈' : '📉'}] ${s.label} (${s.score >= 0 ? '+' : ''}${s.score})`).join('\n')}

## 지표 요약
RSI:${indicators.rsi} | MACD:${indicators.macd}(Sig:${indicators.macdSignal},Hist:${indicators.macdHistogram}) | MA20:${indicators.ma20?.toLocaleString()} MA60:${indicators.ma60?.toLocaleString()} | BB:${indicators.bbLower?.toLocaleString()}~${indicators.bbUpper?.toLocaleString()} | 거래량:${indicators.volumeRatio}x | Z:${zScore} | VWAP:${vwapDiff}% | 모멘텀:${momentum}% | ATR:${atrRatio}%

## 뉴스 (긍정${positiveCount}/부정${negativeCount})
${(newsData || []).slice(0, 5).map((n, i) => `${i + 1}. ${n.title}`).join('\n') || '없음'}

---
아래 JSON으로만 응답:
{"daily":{"prediction":"상승|하락|횡보","confidence":숫자,"targetPrice":숫자,"reason":"근거 2~3줄","easyReason":"비유 포함 2~3줄"},"weekly":{"prediction":"상승|하락|횡보","confidence":숫자,"targetPrice":숫자,"reason":"근거 2~3줄","easyReason":"비유 포함 2~3줄"},"monthly":{"prediction":"상승|하락|횡보","confidence":숫자,"targetPrice":숫자,"reason":"근거 2~3줄","easyReason":"비유 포함 2~3줄"},"summary":"종합 3~4줄","easySummary":"쉽게 3~4줄","keyPoints":["1","2","3"],"quantInsight":"퀀트 요약 1~2줄","riskWarning":"주의사항 1줄","indicatorComments":{"rsi":"한줄","macd":"한줄","bb":"한줄","ma":"한줄","volume":"한줄"}}`;

    // ★ 타임아웃 적용 (30초)
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    let aiAnalysis;

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'openrouter/auto',
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt },
          ],
          temperature: 0.3, // ★ 환각 감소: 낮은 temperature
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      const result = await response.json();
      const text = result.choices?.[0]?.message?.content || '';

      // ★ 3단계 안전 파싱
      aiAnalysis = safeParseJSON(text);
      if (!aiAnalysis) {
        console.error('AI JSON 파싱 실패, fallback 사용:', text.slice(0, 200));
        aiAnalysis = generateFallback(currentPrice, probability, confidence, scoreBreakdown);
      }
    } catch (fetchError) {
      clearTimeout(timeout);
      console.error('AI API 호출 실패:', fetchError.message);
      aiAnalysis = generateFallback(currentPrice, probability, confidence, scoreBreakdown);
    }

    // ★ targetPrice 방향 검증 (강화)
    ['daily', 'weekly', 'monthly'].forEach(period => {
      if (!aiAnalysis[period]) return;
      const target = aiAnalysis[period].targetPrice;
      const prediction = aiAnalysis[period].prediction;

      if (prediction === '상승' && target <= currentPrice) {
        aiAnalysis[period].targetPrice = Math.round(currentPrice * (period === 'daily' ? 1.02 : period === 'weekly' ? 1.03 : 1.05));
      } else if (prediction === '하락' && target >= currentPrice) {
        aiAnalysis[period].targetPrice = Math.round(currentPrice * (period === 'daily' ? 0.98 : period === 'weekly' ? 0.97 : 0.95));
      } else if (prediction === '횡보' && Math.abs(target - currentPrice) / currentPrice > 0.02) {
        aiAnalysis[period].targetPrice = currentPrice;
      }
    });

    return Response.json({
      analysis: {
        ...aiAnalysis,
        probability,
        confidence,
        keySignals,
        scenarios,
        scoreBreakdown,
        indicatorScore: scoreBreakdown.tech.score,
        totalScore: scoreBreakdown.total,
      },
      indicators,
    });

  } catch (error) {
    return Response.json({ error: '분석 실패: ' + error.message }, { status: 500 });
  }
}