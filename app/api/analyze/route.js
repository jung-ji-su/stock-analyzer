import { GoogleGenerativeAI } from '@google/generative-ai';

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

// ============================
// 1. 기술지표 점수화
// ============================
function calcIndicatorScore(indicators) {
  let score = 0;
  const signals = [];

  // RSI
  const rsi = indicators.rsi;
  if (rsi < 30) {
    score += 4; signals.push({ label: 'RSI 과매도 구간', score: +4, type: 'bullish' });
  } else if (rsi < 40) {
    score += 2; signals.push({ label: 'RSI 저점 근접', score: +2, type: 'bullish' });
  } else if (rsi > 70) {
    score -= 4; signals.push({ label: 'RSI 과매수 구간', score: -4, type: 'bearish' });
  } else if (rsi > 60) {
    score -= 2; signals.push({ label: 'RSI 고점 근접', score: -2, type: 'bearish' });
  } else {
    signals.push({ label: 'RSI 중립', score: 0, type: 'neutral' });
  }

  // MACD
  const macd = indicators.macd;
  const macdSignal = indicators.macdSignal;
  const macdHist = indicators.macdHistogram;
  if (macd > macdSignal && macdHist > 0 && macd > 0) {
    score += 4; signals.push({ label: 'MACD 강한 골든크로스', score: +4, type: 'bullish' });
  } else if (macd > macdSignal && macdHist > 0) {
    score += 2; signals.push({ label: 'MACD 골든크로스', score: +2, type: 'bullish' });
  } else if (macd < macdSignal && macdHist < 0 && macd < 0) {
    score -= 4; signals.push({ label: 'MACD 강한 데드크로스', score: -4, type: 'bearish' });
  } else if (macd < macdSignal && macdHist < 0) {
    score -= 2; signals.push({ label: 'MACD 데드크로스', score: -2, type: 'bearish' });
  } else {
    signals.push({ label: 'MACD 중립', score: 0, type: 'neutral' });
  }

  // 이동평균선
  const price = indicators.currentPrice;
  const ma20 = indicators.ma20;
  const ma60 = indicators.ma60;
  if (price > ma20 && price > ma60 && ma20 > ma60) {
    score += 4; signals.push({ label: '완전 정배열 (강한 상승 추세)', score: +4, type: 'bullish' });
  } else if (price > ma20 && price > ma60) {
    score += 2; signals.push({ label: '이평선 위 (상승 추세)', score: +2, type: 'bullish' });
  } else if (price < ma20 && price < ma60 && ma20 < ma60) {
    score -= 4; signals.push({ label: '완전 역배열 (강한 하락 추세)', score: -4, type: 'bearish' });
  } else if (price < ma20 && price < ma60) {
    score -= 2; signals.push({ label: '이평선 아래 (하락 추세)', score: -2, type: 'bearish' });
  } else {
    signals.push({ label: '이평선 혼조', score: 0, type: 'neutral' });
  }

  // 볼린저밴드
  const bbUpper = indicators.bbUpper;
  const bbLower = indicators.bbLower;
  const bbRange = bbUpper - bbLower;
  const bbPos = bbRange > 0 ? ((price - bbLower) / bbRange) * 100 : 50;
  if (bbPos < 10) {
    score += 3; signals.push({ label: '볼린저 하단 이탈 (반등 가능성)', score: +3, type: 'bullish' });
  } else if (bbPos < 25) {
    score += 1; signals.push({ label: '볼린저 하단 근접', score: +1, type: 'bullish' });
  } else if (bbPos > 90) {
    score -= 3; signals.push({ label: '볼린저 상단 이탈 (과열)', score: -3, type: 'bearish' });
  } else if (bbPos > 75) {
    score -= 1; signals.push({ label: '볼린저 상단 근접', score: -1, type: 'bearish' });
  } else {
    signals.push({ label: '볼린저밴드 중간 구간', score: 0, type: 'neutral' });
  }

  // 거래량
  const volRatio = indicators.volumeRatio;
  const recentPrices = indicators.recentPrices || [];
  const priceUp = recentPrices.length > 1 &&
    recentPrices[recentPrices.length - 1] > recentPrices[recentPrices.length - 2];
  if (volRatio > 2) {
    if (priceUp) {
      score += 3; signals.push({ label: '거래량 급등 + 가격 상승 (강한 매수세)', score: +3, type: 'bullish' });
    } else {
      score -= 3; signals.push({ label: '거래량 급등 + 가격 하락 (강한 매도세)', score: -3, type: 'bearish' });
    }
  } else if (volRatio > 1.5) {
    score += 1; signals.push({ label: '거래량 증가 (관심 유입)', score: +1, type: 'bullish' });
  } else if (volRatio < 0.5) {
    score -= 1; signals.push({ label: '거래량 급감 (관심 저조)', score: -1, type: 'bearish' });
  } else {
    signals.push({ label: '거래량 평균 수준', score: 0, type: 'neutral' });
  }

  // 매물대
  const volumeProfile = indicators.volumeProfile || [];
  if (volumeProfile.length > 0) {
    const nearSupport = volumeProfile.some(p => Math.abs(price - p.priceFrom) / price < 0.02);
    const nearResistance = volumeProfile.some(p => Math.abs(price - p.priceTo) / price < 0.02);
    if (nearSupport) {
      score += 2; signals.push({ label: '주요 매물대 지지 구간 근접', score: +2, type: 'bullish' });
    }
    if (nearResistance) {
      score -= 2; signals.push({ label: '주요 매물대 저항 구간 근접', score: -2, type: 'bearish' });
    }
  }

  return { score, signals };
}

// ============================
// 2. 뉴스 감성 점수화
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
    signals.push({ label: `긍정 뉴스 우세 (긍정 ${positiveCount}건 / 부정 ${negativeCount}건)`, score: newsScore, type: 'bullish' });
  } else if (negativeCount > positiveCount * 1.5) {
    signals.push({ label: `부정 뉴스 우세 (부정 ${negativeCount}건 / 긍정 ${positiveCount}건)`, score: newsScore, type: 'bearish' });
  } else {
    signals.push({ label: `뉴스 방향성 혼조 (긍정 ${positiveCount}건 / 부정 ${negativeCount}건)`, score: 0, type: 'neutral' });
  }

  const normalizedScore = Math.max(-5, Math.min(5, newsScore));
  return { score: normalizedScore, signals, positiveCount, negativeCount };
}

// ============================
// 3. Sigmoid 확률 변환
// ============================
function scoreToProbability(totalScore) {
  const k = 0.2;
  const probability = 1 / (1 + Math.exp(-k * totalScore));
  return {
    bullish: Math.round(probability * 100),
    bearish: Math.round((1 - probability) * 100),
  };
}

// ============================
// 4. 신뢰도 계산
// ============================
function calcConfidence(indicatorSignals, newsSignals) {
  const allSignals = [...indicatorSignals, ...newsSignals];
  const bullishCount = allSignals.filter(s => s.type === 'bullish').length;
  const bearishCount = allSignals.filter(s => s.type === 'bearish').length;
  const neutralCount = allSignals.filter(s => s.type === 'neutral').length;
  const total = allSignals.length;

  if (total === 0) return 50;

  const dominantCount = Math.max(bullishCount, bearishCount);
  const activeTotal = total - neutralCount || 1;
  const consistencyRatio = dominantCount / activeTotal;
  const conflictPenalty = Math.min(bullishCount, bearishCount) * 5;
  const dataBonus = total >= 8 ? 10 : total >= 5 ? 5 : 0;

  const confidence = Math.round(consistencyRatio * 80 + dataBonus - conflictPenalty);
  return Math.max(20, Math.min(95, confidence));
}

// ============================
// 5. 시나리오 생성
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
// 기존 지표 계산 함수들
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
    const rs = gains / losses;
    rsiValues.push(100 - (100 / (1 + rs)));
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
  const maxVol = Math.max(...profile.map(p => p.volume));
  return profile
    .sort((a, b) => b.volume - a.volume)
    .slice(0, 3)
    .map(p => ({ ...p, strength: Math.round((p.volume / maxVol) * 100) }));
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
      priceVsBBUpper: Math.round(((currentPrice - lastBB.upper) / lastBB.upper) * 100 * 10) / 10,
      priceVsBBLower: Math.round(((currentPrice - lastBB.lower) / lastBB.lower) * 100 * 10) / 10,
      volumeProfile,
      recentPrices,
    };

    // ── 퀀트 분석 실행 ──
    const { score: indicatorScore, signals: indicatorSignals } = calcIndicatorScore(indicators);
    const { score: newsScore, signals: newsSignals, positiveCount, negativeCount } = calcNewsScore(newsData);
    const totalScore = indicatorScore * 0.7 + newsScore * 0.3;
    const probability = scoreToProbability(totalScore);
    const confidence = calcConfidence(indicatorSignals, newsSignals);
    const allSignals = [...indicatorSignals, ...newsSignals];
    const keySignals = allSignals
      .filter(s => s.type !== 'neutral')
      .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
      .slice(0, 5);
    const scenarios = generateScenarios(indicators, probability, allSignals);

    // ── AI 설명 생성 (퀀트 결과 기반) ──
    const prompt = `
당신은 전문 주식 분석가입니다. 아래 퀀트 분석 결과를 바탕으로 ${stockName}(${symbol})에 대한 분석을 해주세요.

## 퀀트 분석 결과
- 현재가: ${currentPrice.toLocaleString()}원
- 상승 확률: ${probability.bullish}% / 하락 확률: ${probability.bearish}%
- 신뢰도: ${confidence}%
- 기술지표 점수: ${Math.round(indicatorScore * 10) / 10}점
- 뉴스 감성 점수: ${Math.round(newsScore * 10) / 10}점 (긍정 ${positiveCount}건 / 부정 ${negativeCount}건)

## 핵심 신호
${keySignals.map(s => `- [${s.type === 'bullish' ? '긍정' : '부정'}] ${s.label}`).join('\n')}

## 기술지표
- RSI: ${indicators.rsi} ${indicators.rsi > 70 ? '(과매수)' : indicators.rsi < 30 ? '(과매도)' : '(중립)'}
- MACD: ${indicators.macd} / Signal: ${indicators.macdSignal}
- MA20: ${indicators.ma20?.toLocaleString()} / MA60: ${indicators.ma60?.toLocaleString()}
- 볼린저: 상단 ${indicators.bbUpper?.toLocaleString()} / 하단 ${indicators.bbLower?.toLocaleString()}
- 거래량 비율: 평균 대비 ${indicators.volumeRatio}배

## 최신 뉴스
${newsData && newsData.length > 0 ? newsData.map((n, i) => `${i + 1}. ${n.title}`).join('\n') : '뉴스 없음'}

위 데이터를 바탕으로 아래 JSON 형식으로만 응답해주세요:

{
  "daily": {
    "prediction": "상승" 또는 "하락" 또는 "횡보",
    "confidence": ${confidence},
    "targetPrice": 예상 가격 숫자,
    "reason": "핵심 근거 2~3줄",
    "easyReason": "주린이도 이해할 수 있는 쉬운 설명 2~3줄"
  },
  "weekly": {
    "prediction": "상승" 또는 "하락" 또는 "횡보",
    "confidence": ${confidence},
    "targetPrice": 예상 가격 숫자,
    "reason": "핵심 근거 2~3줄",
    "easyReason": "주린이도 이해할 수 있는 쉬운 설명 2~3줄"
  },
  "monthly": {
    "prediction": "상승" 또는 "하락" 또는 "횡보",
    "confidence": ${confidence},
    "targetPrice": 예상 가격 숫자,
    "reason": "핵심 근거 2~3줄",
    "easyReason": "주린이도 이해할 수 있는 쉬운 설명 2~3줄"
  },
  "summary": "전체 종합 분석 3~4줄",
  "easySummary": "주식 초보자도 이해할 수 있게 쉬운 말로 3~4줄",
  "keyPoints": ["핵심포인트1", "핵심포인트2", "핵심포인트3"],
  "indicatorComments": {
    "rsi": "RSI 값에 대한 한줄 맥락 설명",
    "macd": "MACD 값에 대한 한줄 맥락 설명",
    "bb": "볼린저밴드 위치에 대한 한줄 맥락 설명",
    "ma": "이동평균선 배열에 대한 한줄 맥락 설명",
    "volume": "거래량에 대한 한줄 맥락 설명",
    "volumeProfile": "매물대 위치에 대한 한줄 맥락 설명"
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

    return Response.json({
      analysis: {
        ...aiAnalysis,
        probability,
        confidence,
        keySignals,
        scenarios,
        indicatorScore: Math.round(indicatorScore * 10) / 10,
        newsScore: Math.round(newsScore * 10) / 10,
        totalScore: Math.round(totalScore * 10) / 10,
      },
      indicators,
    });

  } catch (error) {
    return Response.json({ error: '분석 실패: ' + error.message }, { status: 500 });
  }
}