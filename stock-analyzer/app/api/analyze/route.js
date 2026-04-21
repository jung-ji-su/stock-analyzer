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

  return top3.map(p => ({
    ...p,
    strength: Math.round((p.volume / totalVol) * 100),
  }));
}

// ============================
// 퀀트 팩터 계산 함수들
// ============================

// Z-Score: 현재 가격이 통계적으로 어디 있는지
function calcZScore(closes, period = 20) {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
  if (std === 0) return 0;
  return (closes[closes.length - 1] - mean) / std;
}

// ATR: 평균 진폭 (변동성 측정)
function calcATR(chartData, period = 14) {
  if (chartData.length < period + 1) return 0;
  const trueRanges = chartData.slice(1).map((d, i) => {
    const prevClose = chartData[i].close;
    return Math.max(
      d.high - d.low,
      Math.abs(d.high - prevClose),
      Math.abs(d.low - prevClose)
    );
  });
  const recentTR = trueRanges.slice(-period);
  return recentTR.reduce((a, b) => a + b, 0) / period;
}

// Stochastic RSI: RSI의 RSI (더 민감한 모멘텀)
function calcStochRSI(closes, period = 14) {
  const rsiValues = calcRSI(closes, period).filter(v => v !== null);
  if (rsiValues.length < period) return 0.5;
  const recentRSI = rsiValues.slice(-period);
  const minRSI = Math.min(...recentRSI);
  const maxRSI = Math.max(...recentRSI);
  if (maxRSI === minRSI) return 0.5;
  return (rsiValues[rsiValues.length - 1] - minRSI) / (maxRSI - minRSI);
}

// VWAP: 거래량 가중 평균가격 (기관 기준선)
function calcVWAP(chartData) {
  if (chartData.length === 0) return 0;
  const recent = chartData.slice(-20); // 최근 20일
  const totalVolume = recent.reduce((a, d) => a + d.volume, 0);
  if (totalVolume === 0) return chartData[chartData.length - 1].close;
  const vwap = recent.reduce((a, d) => a + ((d.high + d.low + d.close) / 3) * d.volume, 0) / totalVolume;
  return vwap;
}

// RS Score: 모멘텀 (12개월 수익률 - 1개월 수익률)
function calcMomentumScore(closes) {
  if (closes.length < 20) return 0;
  const current = closes[closes.length - 1];
  // 1개월 수익률 (20일)
  const month1Return = closes.length >= 20
    ? (current - closes[closes.length - 20]) / closes[closes.length - 20]
    : 0;
  // 3개월 수익률 (60일)
  const month3Return = closes.length >= 60
    ? (current - closes[closes.length - 60]) / closes[closes.length - 60]
    : month1Return;
  // 모멘텀 = 장기 추세 강도
  return (month1Return * 0.4 + month3Return * 0.6) * 100;
}

// MTF 일치도: 단기/중기/장기 추세 일치 여부
function calcMTFScore(closes) {
  if (closes.length < 60) return { score: 0, signals: [] };
  const ma5 = calcSMA(closes, 5).filter(v => v !== null).slice(-1)[0];
  const ma20 = calcSMA(closes, 20).filter(v => v !== null).slice(-1)[0];
  const ma60 = calcSMA(closes, 60).filter(v => v !== null).slice(-1)[0];
  const current = closes[closes.length - 1];

  let score = 0;
  const signals = [];

  // 단기(5일) 추세
  if (current > ma5) { score += 1; }
  else { score -= 1; }

  // 중기(20일) 추세
  if (current > ma20) { score += 2; }
  else { score -= 2; }

  // 장기(60일) 추세
  if (current > ma60) { score += 3; }
  else { score -= 3; }

  // 이평선 배열 상태
  if (ma5 > ma20 && ma20 > ma60) {
    score += 3;
    signals.push({ label: 'MA5>MA20>MA60 완전 정배열 (강한 상승 추세)', score: +3, type: 'bullish', easy: '단기·중기·장기 평균 가격이 모두 올라가는 모양으로 강한 상승 흐름입니다' });
  } else if (ma5 < ma20 && ma20 < ma60) {
    score -= 3;
    signals.push({ label: 'MA5<MA20<MA60 완전 역배열 (강한 하락 추세)', score: -3, type: 'bearish', easy: '단기·중기·장기 평균 가격이 모두 내려가는 모양으로 강한 하락 흐름입니다' });
  } else {
    signals.push({ label: '이평선 혼조 (추세 전환 구간)', score: 0, type: 'neutral', easy: '상승도 하락도 아닌 방향을 찾는 중간 단계입니다' });
  }

  return { score, signals };
}

// ============================
// Layer 1: 기술지표 스코어
// ============================
function calcIndicatorScore(indicators) {
  let score = 0;
  const signals = [];

  // RSI
  const rsi = indicators.rsi;
  if (rsi < 30) {
    score += 4;
    signals.push({ label: 'RSI 과매도 구간', score: +4, type: 'bullish', easy: '주가가 너무 많이 떨어져서 싸게 살 수 있는 구간입니다. 반등 가능성이 높아요' });
  } else if (rsi < 40) {
    score += 2;
    signals.push({ label: 'RSI 저점 근접', score: +2, type: 'bullish', easy: '주가가 많이 내려온 편이라 반등 가능성이 있습니다' });
  } else if (rsi > 70) {
    score -= 4;
    signals.push({ label: 'RSI 과매수 구간', score: -4, type: 'bearish', easy: '주가가 너무 많이 올라 과열된 상태입니다. 조정이 올 수 있어요' });
  } else if (rsi > 60) {
    score -= 2;
    signals.push({ label: 'RSI 고점 근접', score: -2, type: 'bearish', easy: '주가가 많이 오른 편이라 잠깐 쉬어갈 수 있습니다' });
  } else {
    signals.push({ label: 'RSI 중립', score: 0, type: 'neutral', easy: '주가가 과열도 침체도 아닌 안정적인 구간입니다' });
  }

  // MACD
  const macd = indicators.macd;
  const macdSignal = indicators.macdSignal;
  const macdHist = indicators.macdHistogram;
  if (macd > macdSignal && macdHist > 0 && macd > 0) {
    score += 4;
    signals.push({ label: 'MACD 강한 골든크로스', score: +4, type: 'bullish', easy: '상승 신호가 매우 강하게 나왔습니다. 매수세가 강하게 들어오고 있어요' });
  } else if (macd > macdSignal && macdHist > 0) {
    score += 2;
    signals.push({ label: 'MACD 골든크로스', score: +2, type: 'bullish', easy: '상승 전환 신호가 나왔습니다. 분위기가 좋아지고 있어요' });
  } else if (macd < macdSignal && macdHist < 0 && macd < 0) {
    score -= 4;
    signals.push({ label: 'MACD 강한 데드크로스', score: -4, type: 'bearish', easy: '하락 신호가 매우 강하게 나왔습니다. 매도세가 강하게 들어오고 있어요' });
  } else if (macd < macdSignal && macdHist < 0) {
    score -= 2;
    signals.push({ label: 'MACD 데드크로스', score: -2, type: 'bearish', easy: '하락 전환 신호가 나왔습니다. 분위기가 나빠지고 있어요' });
  } else {
    signals.push({ label: 'MACD 중립', score: 0, type: 'neutral', easy: '아직 방향이 결정되지 않은 상태입니다' });
  }

  // 이동평균선
  const price = indicators.currentPrice;
  const ma20 = indicators.ma20;
  const ma60 = indicators.ma60;
  if (price > ma20 && price > ma60 && ma20 > ma60) {
    score += 4;
    signals.push({ label: '완전 정배열 (강한 상승 추세)', score: +4, type: 'bullish', easy: '20일·60일 평균 가격 모두 위에 있습니다. 꾸준히 오르는 좋은 흐름이에요' });
  } else if (price > ma20 && price > ma60) {
    score += 2;
    signals.push({ label: '이평선 위 (상승 추세)', score: +2, type: 'bullish', easy: '현재 가격이 평균보다 위에 있습니다. 상승 흐름이에요' });
  } else if (price < ma20 && price < ma60 && ma20 < ma60) {
    score -= 4;
    signals.push({ label: '완전 역배열 (강한 하락 추세)', score: -4, type: 'bearish', easy: '20일·60일 평균 가격 모두 아래에 있습니다. 하락 흐름이 강해요' });
  } else if (price < ma20 && price < ma60) {
    score -= 2;
    signals.push({ label: '이평선 아래 (하락 추세)', score: -2, type: 'bearish', easy: '현재 가격이 평균보다 아래에 있습니다. 하락 흐름이에요' });
  } else {
    signals.push({ label: '이평선 혼조', score: 0, type: 'neutral', easy: '방향이 애매한 구간입니다. 좀 더 지켜볼 필요가 있어요' });
  }

  // 볼린저밴드
  const bbUpper = indicators.bbUpper;
  const bbLower = indicators.bbLower;
  const bbRange = bbUpper - bbLower;
  const bbPos = bbRange > 0 ? ((price - bbLower) / bbRange) * 100 : 50;
  if (bbPos < 10) {
    score += 3;
    signals.push({ label: '볼린저 하단 이탈 (반등 가능성)', score: +3, type: 'bullish', easy: '가격이 정상 범위 밖으로 너무 내려왔습니다. 고무줄처럼 다시 올라올 가능성이 높아요' });
  } else if (bbPos < 25) {
    score += 1;
    signals.push({ label: '볼린저 하단 근접', score: +1, type: 'bullish', easy: '가격이 정상 범위 아래쪽에 있습니다. 반등 가능성이 있어요' });
  } else if (bbPos > 90) {
    score -= 3;
    signals.push({ label: '볼린저 상단 이탈 (과열)', score: -3, type: 'bearish', easy: '가격이 정상 범위 밖으로 너무 올라왔습니다. 조정이 올 가능성이 높아요' });
  } else if (bbPos > 75) {
    score -= 1;
    signals.push({ label: '볼린저 상단 근접', score: -1, type: 'bearish', easy: '가격이 정상 범위 위쪽에 있습니다. 조정 가능성이 있어요' });
  } else {
    signals.push({ label: '볼린저밴드 중간 구간', score: 0, type: 'neutral', easy: '가격이 정상 범위 안에 있습니다. 안정적인 상태예요' });
  }

  // 거래량
  const volRatio = indicators.volumeRatio;
  const recentPrices = indicators.recentPrices || [];
  const priceUp = recentPrices.length > 1 && recentPrices[recentPrices.length - 1] > recentPrices[recentPrices.length - 2];
  if (volRatio > 2) {
    if (priceUp) {
      score += 3;
      signals.push({ label: '거래량 급등 + 가격 상승 (강한 매수세)', score: +3, type: 'bullish', easy: '많은 사람들이 사고 있고 가격도 오르고 있어요. 강한 매수 신호입니다' });
    } else {
      score -= 3;
      signals.push({ label: '거래량 급등 + 가격 하락 (강한 매도세)', score: -3, type: 'bearish', easy: '많은 사람들이 팔고 있고 가격도 내리고 있어요. 강한 매도 신호입니다' });
    }
  } else if (volRatio > 1.5) {
    score += 1;
    signals.push({ label: '거래량 증가 (관심 유입)', score: +1, type: 'bullish', easy: '평소보다 거래가 활발합니다. 관심이 높아지고 있어요' });
  } else if (volRatio < 0.5) {
    score -= 1;
    signals.push({ label: '거래량 급감 (관심 저조)', score: -1, type: 'bearish', easy: '거래가 매우 적습니다. 관심이 식어가고 있어요' });
  } else {
    signals.push({ label: '거래량 평균 수준', score: 0, type: 'neutral', easy: '거래량이 평소와 비슷한 수준입니다' });
  }

  // 매물대
  const volumeProfile = indicators.volumeProfile || [];
  if (volumeProfile.length > 0) {
    const nearSupport = volumeProfile.some(p => Math.abs(price - p.priceFrom) / price < 0.02);
    const nearResistance = volumeProfile.some(p => Math.abs(price - p.priceTo) / price < 0.02);
    if (nearSupport) {
      score += 2;
      signals.push({ label: '주요 매물대 지지 구간 근접', score: +2, type: 'bullish', easy: '과거에 많이 거래된 가격대에 있어요. 이 가격에서 버텨줄 가능성이 높습니다' });
    }
    if (nearResistance) {
      score -= 2;
      signals.push({ label: '주요 매물대 저항 구간 근접', score: -2, type: 'bearish', easy: '과거에 많이 팔린 가격대에 왔어요. 여기서 막힐 가능성이 있습니다' });
    }
  }

  return { score, signals };
}

// ============================
// Layer 2: 퀀트 팩터 스코어
// ============================
function calcQuantScore(chartData, closes) {
  let score = 0;
  const signals = [];

  // 1. Z-Score (평균회귀)
  const zScore = calcZScore(closes, 20);
  const zScoreRounded = Math.round(zScore * 100) / 100;
  if (zScore < -2) {
    score += 4;
    signals.push({ label: `Z-Score ${zScoreRounded} (통계적 과매도)`, score: +4, type: 'bullish', easy: '현재 가격이 통계적으로 정상 범위보다 많이 낮습니다. 평균으로 돌아올 가능성이 높아요' });
  } else if (zScore < -1) {
    score += 2;
    signals.push({ label: `Z-Score ${zScoreRounded} (하단 구간)`, score: +2, type: 'bullish', easy: '현재 가격이 평균보다 낮은 편입니다. 반등 가능성이 있어요' });
  } else if (zScore > 2) {
    score -= 4;
    signals.push({ label: `Z-Score ${zScoreRounded} (통계적 과매수)`, score: -4, type: 'bearish', easy: '현재 가격이 통계적으로 정상 범위보다 많이 높습니다. 다시 내려올 가능성이 높아요' });
  } else if (zScore > 1) {
    score -= 2;
    signals.push({ label: `Z-Score ${zScoreRounded} (상단 구간)`, score: -2, type: 'bearish', easy: '현재 가격이 평균보다 높은 편입니다. 조정 가능성이 있어요' });
  } else {
    signals.push({ label: `Z-Score ${zScoreRounded} (통계적 중립)`, score: 0, type: 'neutral', easy: '현재 가격이 통계적으로 정상 범위 안에 있습니다' });
  }

  // 2. Stochastic RSI
  const stochRSI = calcStochRSI(closes);
  const stochRSIRounded = Math.round(stochRSI * 100) / 100;
  if (stochRSI < 0.2) {
    score += 3;
    signals.push({ label: `StochRSI ${stochRSIRounded} (강한 과매도)`, score: +3, type: 'bullish', easy: 'RSI를 더 세밀하게 분석했을 때 매우 싼 구간입니다. 반등 신호가 강해요' });
  } else if (stochRSI < 0.35) {
    score += 1;
    signals.push({ label: `StochRSI ${stochRSIRounded} (과매도 근접)`, score: +1, type: 'bullish', easy: 'RSI 기준으로 싼 편에 속합니다' });
  } else if (stochRSI > 0.8) {
    score -= 3;
    signals.push({ label: `StochRSI ${stochRSIRounded} (강한 과매수)`, score: -3, type: 'bearish', easy: 'RSI를 더 세밀하게 분석했을 때 매우 비싼 구간입니다. 조정 신호가 강해요' });
  } else if (stochRSI > 0.65) {
    score -= 1;
    signals.push({ label: `StochRSI ${stochRSIRounded} (과매수 근접)`, score: -1, type: 'bearish', easy: 'RSI 기준으로 비싼 편에 속합니다' });
  } else {
    signals.push({ label: `StochRSI ${stochRSIRounded} (중립)`, score: 0, type: 'neutral', easy: 'RSI 기준으로 중립적인 구간입니다' });
  }

  // 3. VWAP (기관 기준선)
  const vwap = calcVWAP(chartData);
  const currentPrice = closes[closes.length - 1];
  const vwapDiff = ((currentPrice - vwap) / vwap) * 100;
  const vwapDiffRounded = Math.round(vwapDiff * 10) / 10;
  if (vwapDiff > 3) {
    score -= 2;
    signals.push({ label: `VWAP 대비 +${vwapDiffRounded}% (기관 기준선 상단)`, score: -2, type: 'bearish', easy: '기관투자자들이 평균적으로 산 가격보다 많이 올라왔습니다. 기관이 팔 수 있어요' });
  } else if (vwapDiff > 1) {
    score += 1;
    signals.push({ label: `VWAP 대비 +${vwapDiffRounded}% (기관 기준선 위)`, score: +1, type: 'bullish', easy: '기관투자자들의 평균 매수가보다 위에 있습니다. 긍정적인 신호예요' });
  } else if (vwapDiff < -3) {
    score += 2;
    signals.push({ label: `VWAP 대비 ${vwapDiffRounded}% (기관 기준선 하단)`, score: +2, type: 'bullish', easy: '기관투자자들의 평균 매수가보다 많이 내려왔습니다. 기관이 살 수 있어요' });
  } else if (vwapDiff < -1) {
    score -= 1;
    signals.push({ label: `VWAP 대비 ${vwapDiffRounded}% (기관 기준선 아래)`, score: -1, type: 'bearish', easy: '기관투자자들의 평균 매수가보다 아래에 있습니다' });
  } else {
    signals.push({ label: `VWAP 근접 (${vwapDiffRounded}%)`, score: 0, type: 'neutral', easy: '기관투자자들의 평균 매수가와 비슷한 수준입니다' });
  }

  // 4. 모멘텀 스코어
  const momentum = calcMomentumScore(closes);
  const momentumRounded = Math.round(momentum * 10) / 10;
  if (momentum > 15) {
    score += 3;
    signals.push({ label: `모멘텀 +${momentumRounded}% (강한 상승 모멘텀)`, score: +3, type: 'bullish', easy: '최근 몇 달간 꾸준히 올라왔습니다. 상승 흐름이 강해요' });
  } else if (momentum > 5) {
    score += 1;
    signals.push({ label: `모멘텀 +${momentumRounded}% (상승 모멘텀)`, score: +1, type: 'bullish', easy: '최근 상승 흐름이 있습니다' });
  } else if (momentum < -15) {
    score -= 3;
    signals.push({ label: `모멘텀 ${momentumRounded}% (강한 하락 모멘텀)`, score: -3, type: 'bearish', easy: '최근 몇 달간 꾸준히 내려왔습니다. 하락 흐름이 강해요' });
  } else if (momentum < -5) {
    score -= 1;
    signals.push({ label: `모멘텀 ${momentumRounded}% (하락 모멘텀)`, score: -1, type: 'bearish', easy: '최근 하락 흐름이 있습니다' });
  } else {
    signals.push({ label: `모멘텀 ${momentumRounded}% (중립)`, score: 0, type: 'neutral', easy: '최근 큰 방향성 없이 횡보하고 있습니다' });
  }

  // 5. ATR 변동성 (신뢰도 조절용 - 점수보다 신뢰도에 활용)
  const atr = calcATR(chartData);
  const atrRatio = currentPrice > 0 ? (atr / currentPrice) * 100 : 0;

  return { score, signals, atr, atrRatio: Math.round(atrRatio * 100) / 100 };
}

// ============================
// Layer 3: 뉴스 감성 스코어
// ============================
function calcNewsScore(newsData) {
  if (!newsData || newsData.length === 0) return { score: 0, signals: [], positiveCount: 0, negativeCount: 0 };

  const positiveKeywords = ['상승', '급등', '호실적', '매수', '목표가 상향', '신고가', '수주', '흑자', '성장', '기대', '호재', '강세', '돌파', '반등', '긍정', '개선', '최대', '사상최고', '증가'];
  const negativeKeywords = ['하락', '급락', '적자', '매도', '목표가 하향', '신저가', '손실', '부진', '우려', '악재', '약세', '이탈', '부정', '악화', '위기', '폭락', '감소', '최저'];

  let newsScore = 0;
  let positiveCount = 0;
  let negativeCount = 0;

  newsData.forEach(news => {
    const text = (news.title + ' ' + (news.desc || '')).toLowerCase();
    let articleScore = 0;
    positiveKeywords.forEach(kw => { if (text.includes(kw)) articleScore += 1; });
    negativeKeywords.forEach(kw => { if (text.includes(kw)) articleScore -= 1; });
    if (articleScore > 0) positiveCount++;
    else if (articleScore < 0) negativeCount++;
    newsScore += articleScore;
  });

  const signals = [];
  if (positiveCount > negativeCount * 1.5) {
    signals.push({ label: `긍정 뉴스 우세 (긍정 ${positiveCount}건 / 부정 ${negativeCount}건)`, score: newsScore, type: 'bullish', easy: '최근 뉴스 분위기가 좋습니다. 호재 소식이 많아요' });
  } else if (negativeCount > positiveCount * 1.5) {
    signals.push({ label: `부정 뉴스 우세 (부정 ${negativeCount}건 / 긍정 ${positiveCount}건)`, score: newsScore, type: 'bearish', easy: '최근 뉴스 분위기가 좋지 않습니다. 악재 소식이 많아요' });
  } else {
    signals.push({ label: `뉴스 방향성 혼조 (긍정 ${positiveCount}건 / 부정 ${negativeCount}건)`, score: 0, type: 'neutral', easy: '긍정적·부정적 뉴스가 섞여있습니다. 뉴스만으론 방향을 알기 어려워요' });
  }

  const normalizedScore = Math.max(-5, Math.min(5, newsScore));
  return { score: normalizedScore, signals, positiveCount, negativeCount };
}

// ============================
// Layer 4: MTF 스코어
// ============================
// (calcMTFScore 함수는 위에서 정의됨)

// ============================
// Sigmoid 확률 변환
// ============================
function scoreToProbability(totalScore) {
  const k = 0.18;
  const probability = 1 / (1 + Math.exp(-k * totalScore));
  return {
    bullish: Math.round(probability * 100),
    bearish: Math.round((1 - probability) * 100),
  };
}

// ============================
// 신뢰도 계산 (ATR 변동성 반영)
// ============================
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

  // ATR이 높을수록 (변동성 클수록) 신뢰도 하락
  const volatilityPenalty = atrRatio > 5 ? 15 : atrRatio > 3 ? 8 : atrRatio > 2 ? 4 : 0;

  const confidence = Math.round(consistencyRatio * 80 + dataBonus - conflictPenalty - volatilityPenalty);
  return Math.max(20, Math.min(95, confidence));
}

// ============================
// 시나리오 생성
// ============================
function generateScenarios(indicators, probability, allSignals) {
  const price = indicators.currentPrice;
  const bbUpper = indicators.bbUpper;
  const bbLower = indicators.bbLower;
  const ma20 = indicators.ma20;
  const ma60 = indicators.ma60;

  const target1 = Math.round(Math.max(bbUpper, price * 1.03));
  const target2 = Math.round(price * 1.05);
  const support1 = Math.round(Math.max(bbLower, ma20 < price ? ma20 : bbLower));
  const support2 = Math.round(ma60 < price ? ma60 : price * 0.94);

  const bullishConditions = allSignals.filter(s => s.type === 'bullish').slice(0, 3).map(s => s.label);
  const bearishConditions = allSignals.filter(s => s.type === 'bearish').slice(0, 3).map(s => s.label);

  return {
    scenarioA: {
      name: '상승 시나리오',
      probability: probability.bullish,
      conditions: bullishConditions.length > 0 ? bullishConditions : ['매수세 유입', '긍정적 모멘텀 유지'],
      flow: `현재 ${price.toLocaleString()}원 → ${support1.toLocaleString()}원 지지 확인 → ${target1.toLocaleString()}원 1차 목표`,
      targetRange: { low: Math.round(price * 1.02), high: target2 },
    },
    scenarioB: {
      name: '하락 시나리오',
      probability: probability.bearish,
      conditions: bearishConditions.length > 0 ? bearishConditions : ['매도세 출현', '부정적 모멘텀'],
      flow: `${support1.toLocaleString()}원 지지 이탈 시 → ${support2.toLocaleString()}원까지 하락 가능`,
      targetRange: { high: Math.round(price * 0.98), low: support2 },
    },
  };
}

// ============================
// POST 핸들러
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

    // ── 4개 레이어 분석 실행 ──
    const { score: techScore, signals: techSignals } = calcIndicatorScore(indicators);
    const { score: quantScore, signals: quantSignals, atr, atrRatio } = calcQuantScore(chartData, closes);
    const { score: newsScore, signals: newsSignals, positiveCount, negativeCount } = calcNewsScore(newsData);
    const { score: mtfScore, signals: mtfSignals } = calcMTFScore(closes);

    // 가중치: 기술지표 30% + 퀀트팩터 40% + 뉴스 20% + MTF 10%
    const totalScore = techScore * 0.30 + quantScore * 0.40 + newsScore * 0.20 + mtfScore * 0.10;

    const probability = scoreToProbability(totalScore);
    const allSignals = [...techSignals, ...quantSignals, ...mtfSignals, ...newsSignals];
    const confidence = calcConfidence(allSignals, atrRatio);

    const keySignals = allSignals
      .filter(s => s.type !== 'neutral')
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .slice(0, 6)
      .map(s => ({ ...s }));

    const scenarios = generateScenarios(indicators, probability, allSignals);

    // 점수 상세 내역
    const scoreBreakdown = {
      tech: { score: Math.round(techScore * 10) / 10, weight: '30%', label: '기술지표' },
      quant: { score: Math.round(quantScore * 10) / 10, weight: '40%', label: '퀀트팩터' },
      news: { score: Math.round(newsScore * 10) / 10, weight: '20%', label: '뉴스감성' },
      mtf: { score: Math.round(mtfScore * 10) / 10, weight: '10%', label: 'MTF추세' },
      total: Math.round(totalScore * 10) / 10,
      atr: Math.round(atr),
      atrRatio,
    };

    // ── AI 설명 생성 ──
    const prompt = `
당신은 전문 주식 분석가입니다. 아래 퀀트 분석 결과를 바탕으로 ${stockName}(${symbol})에 대한 분석을 해주세요.

## 레이어별 점수
- 기술지표(30%): ${scoreBreakdown.tech.score}점
- 퀀트팩터(40%): ${scoreBreakdown.quant.score}점
- 뉴스감성(20%): ${scoreBreakdown.news.score}점
- MTF추세(10%): ${scoreBreakdown.mtf.score}점
- 종합: ${scoreBreakdown.total}점

## 확률/신뢰도
- 상승 확률: ${probability.bullish}% / 하락 확률: ${probability.bearish}%
- 신뢰도: ${confidence}%
- 변동성(ATR): ${scoreBreakdown.atrRatio}%

## 핵심 신호
${keySignals.map(s => `- [${s.type === 'bullish' ? '상승' : s.type === 'bearish' ? '하락' : '중립'}] ${s.label}`).join('\n')}

## 기술지표
- RSI: ${indicators.rsi}
- MACD: ${indicators.macd} / Signal: ${indicators.macdSignal}
- MA20: ${indicators.ma20?.toLocaleString()} / MA60: ${indicators.ma60?.toLocaleString()}
- 볼린저: 상단 ${indicators.bbUpper?.toLocaleString()} / 하단 ${indicators.bbLower?.toLocaleString()}
- 거래량 비율: ${indicators.volumeRatio}배

## 최신 뉴스
${newsData && newsData.length > 0 ? newsData.slice(0, 10).map((n, i) => `${i + 1}. ${n.title}`).join('\n') : '뉴스 없음'}

위 데이터를 바탕으로 아래 JSON 형식으로만 응답해주세요:

{
  "daily": {
    "prediction": "상승" 또는 "하락" 또는 "횡보",
    "confidence": ${confidence},
    "targetPrice": 예상 가격 숫자 (현재가 ${currentPrice}원 기준. 상승이면 반드시 현재가보다 높게, 하락이면 반드시 현재가보다 낮게, 횡보면 현재가 ±2% 이내),
    "reason": "기술적/퀀트 근거 중심 2~3줄",
    "easyReason": "왜 이렇게 예측하는지 초등학생도 이해할 수 있게 비유 포함 2~3줄"
  },
  "weekly": {
    "prediction": "상승" 또는 "하락" 또는 "횡보",
    "confidence": ${confidence},
    "targetPrice": 예상 가격 숫자 (현재가 ${currentPrice}원 기준. 상승이면 반드시 현재가보다 높게, 하락이면 반드시 현재가보다 낮게, 횡보면 현재가 ±2% 이내),
    "reason": "기술적/퀀트 근거 중심 2~3줄",
    "easyReason": "왜 이렇게 예측하는지 초등학생도 이해할 수 있게 비유 포함 2~3줄"
  },
  "monthly": {
    "prediction": "상승" 또는 "하락" 또는 "횡보",
    "confidence": ${confidence},
    "targetPrice": 예상 가격 숫자 (현재가 ${currentPrice}원 기준. 상승이면 반드시 현재가보다 높게, 하락이면 반드시 현재가보다 낮게, 횡보면 현재가 ±2% 이내),
    "reason": "기술적/퀀트 근거 중심 2~3줄",
    "easyReason": "왜 이렇게 예측하는지 초등학생도 이해할 수 있게 비유 포함 2~3줄"
  },
  "summary": "4개 레이어 분석을 종합한 전문적 분석 3~4줄",
  "easySummary": "이 주식 지금 어때? 라고 친구에게 설명하듯이 쉽게 3~4줄",
  "keyPoints": ["핵심포인트1", "핵심포인트2", "핵심포인트3"],
  "quantInsight": "퀀트 팩터(Z-Score, StochRSI, VWAP, 모멘텀) 분석 결과를 쉽게 1~2줄",
  "riskWarning": "현재 가장 주의해야 할 리스크 1가지를 쉽게 1줄",
  "indicatorComments": {
    "rsi": "RSI 값 한줄 설명",
    "macd": "MACD 값 한줄 설명",
    "bb": "볼린저밴드 위치 한줄 설명",
    "ma": "이동평균선 배열 한줄 설명",
    "volume": "거래량 한줄 설명",
    "volumeProfile": "매물대 한줄 설명"
  }
}`;

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openrouter/auto',
        messages: [{ role: 'user', content: prompt }],
      }),
    });

    const result = await response.json();
    const text = result.choices[0].message.content;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ error: 'AI 응답 파싱 실패' }, { status: 500 });

    const aiAnalysis = JSON.parse(jsonMatch[0]);

    // 목표가 방향 검증 및 보정
    ['daily', 'weekly', 'monthly'].forEach(period => {
      if (!aiAnalysis[period]) return;
      const target = aiAnalysis[period].targetPrice;
      const prediction = aiAnalysis[period].prediction;
      if (prediction === '상승' && target <= currentPrice) {
        aiAnalysis[period].targetPrice = Math.round(currentPrice * 1.03);
      } else if (prediction === '하락' && target >= currentPrice) {
        aiAnalysis[period].targetPrice = Math.round(currentPrice * 0.97);
      } else if (prediction === '횡보') {
        aiAnalysis[period].targetPrice = Math.round(currentPrice * (0.99 + Math.random() * 0.02));
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
        techScore: scoreBreakdown.tech.score,
        quantScore: scoreBreakdown.quant.score,
        newsScore: scoreBreakdown.news.score,
        mtfScore: scoreBreakdown.mtf.score,
        // 하위 호환성
        indicatorScore: scoreBreakdown.tech.score,
        totalScore: scoreBreakdown.total,
      },
      indicators,
    });

  } catch (error) {
    return Response.json({ error: '분석 실패: ' + error.message }, { status: 500 });
  }
}