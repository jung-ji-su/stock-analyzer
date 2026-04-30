'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useFavorites } from '@/lib/FavoritesContext';
import { useToast } from '@/components/Toast';
import { useRouter } from 'next/navigation';

// ╔══════════════════════════════════════════════════════════
// ║ 퀀트 계산 함수 (기존과 동일)
// ╚══════════════════════════════════════════════════════════

function calcSMA(data, period) {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function calcEMA(data, period) {
  if (data.length < period) return null;
  const k = 2 / (period + 1);
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
  }
  return ema;
}

function calcEMASeries(data, period) {
  if (data.length < period) return [];
  const k = 2 / (period + 1);
  const result = [];
  let ema = data.slice(0, period).reduce((a, b) => a + b, 0) / period;
  result.push(ema);
  for (let i = period; i < data.length; i++) {
    ema = data[i] * k + ema * (1 - k);
    result.push(ema);
  }
  return result;
}

function calcRSI(closes, period = 14) {
  if (closes.length < period + 1) return 50;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  let avgGain = changes.slice(0, period).filter(c => c > 0).reduce((a, b) => a + b, 0) / period;
  let avgLoss = Math.abs(changes.slice(0, period).filter(c => c < 0).reduce((a, b) => a + b, 0)) / period;
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? Math.abs(changes[i]) : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
  }
  if (avgLoss === 0) return 100;
  return 100 - (100 / (1 + avgGain / avgLoss));
}

function calcZScore(closes, period = 20) {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
  if (std === 0) return 0;
  return (closes[closes.length - 1] - mean) / std;
}

function calcMomentum(closes) {
  const current = closes[closes.length - 1];
  const month1 = closes.length >= 20 ? (current - closes[closes.length - 20]) / closes[closes.length - 20] * 100 : 0;
  const month3 = closes.length >= 60 ? (current - closes[closes.length - 60]) / closes[closes.length - 60] * 100 : month1;
  return month1 * 0.4 + month3 * 0.6;
}

function calcVWAP(chartData) {
  const recent = chartData.slice(-20);
  const totalVol = recent.reduce((a, d) => a + d.volume, 0);
  if (totalVol === 0) return chartData[chartData.length - 1].close;
  return recent.reduce((a, d) => a + ((d.high + d.low + d.close) / 3) * d.volume, 0) / totalVol;
}

function calcStochRSI(closes, period = 14) {
  if (closes.length < period * 2) return 0.5;
  const rsiValues = [];
  for (let i = period; i < closes.length; i++) {
    const slice = closes.slice(i - period, i + 1);
    const changes = slice.slice(1).map((c, j) => c - slice[j]);
    const gains = changes.filter(c => c > 0).reduce((a, b) => a + b, 0) / period;
    const losses = Math.abs(changes.filter(c => c < 0).reduce((a, b) => a + b, 0)) / period;
    rsiValues.push(losses === 0 ? 100 : 100 - (100 / (1 + gains / losses)));
  }
  if (rsiValues.length < period) return 0.5;
  const recentRSI = rsiValues.slice(-period);
  const minRSI = Math.min(...recentRSI);
  const maxRSI = Math.max(...recentRSI);
  if (maxRSI === minRSI) return 0.5;
  return (rsiValues[rsiValues.length - 1] - minRSI) / (maxRSI - minRSI);
}

function calcBollinger(closes, period = 20, stdDev = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
  const upper = mean + stdDev * std;
  const lower = mean - stdDev * std;
  const current = closes[closes.length - 1];
  const bWidth = (upper - lower) / mean;
  const percentB = (current - lower) / (upper - lower);
  return { upper, lower, mean, percentB, bWidth };
}

function calc52WeekPosition(closes) {
  const year = closes.slice(-252);
  if (year.length < 60) return null;
  const high = Math.max(...year);
  const low = Math.min(...year);
  const current = closes[closes.length - 1];
  if (high === low) return 0.5;
  return (current - low) / (high - low);
}

function calcVolumeAnalysis(chartData) {
  if (chartData.length < 20) return { ratio: 1, trend: 0 };
  const volumes = chartData.map(d => d.volume);
  const recentVol = volumes[volumes.length - 1];
  const avg20 = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const ratio = avg20 === 0 ? 1 : recentVol / avg20;
  const avg5 = volumes.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const trend = avg20 === 0 ? 0 : (avg5 - avg20) / avg20;
  return { ratio, trend, recentVol, avg20 };
}

function calcMACD(closes) {
  if (closes.length < 35) return null;
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  if (ema12 === null || ema26 === null) return null;
  const macdLine = ema12 - ema26;
  const ema12Series = calcEMASeries(closes, 12);
  const ema26Series = calcEMASeries(closes, 26);
  const offset = ema12Series.length - ema26Series.length;
  const macdSeries = ema26Series.map((v, i) => ema12Series[i + offset] - v);
  if (macdSeries.length < 9) return { macdLine, signal: 0, histogram: 0, trend: 0 };
  const signal = calcEMA(macdSeries, 9);
  const histogram = macdLine - signal;
  const histSeries = macdSeries.slice(-3).map((m, i, arr) => {
    const sigSlice = calcEMA(macdSeries.slice(0, macdSeries.length - 2 + i), 9);
    return m - sigSlice;
  });
  const trend = histSeries.length >= 2 ? histSeries[histSeries.length - 1] - histSeries[0] : 0;
  return { macdLine, signal, histogram, trend };
}

function calcDisparity(closes, period = 20) {
  const ma = calcSMA(closes, period);
  if (ma === null) return 100;
  const current = closes[closes.length - 1];
  return (current / ma) * 100;
}

function calcOBV(chartData) {
  if (chartData.length < 21) return { trend: 0, divergence: 0 };
  const obvSeries = [0];
  for (let i = 1; i < chartData.length; i++) {
    const prev = obvSeries[obvSeries.length - 1];
    if (chartData[i].close > chartData[i - 1].close) {
      obvSeries.push(prev + chartData[i].volume);
    } else if (chartData[i].close < chartData[i - 1].close) {
      obvSeries.push(prev - chartData[i].volume);
    } else {
      obvSeries.push(prev);
    }
  }
  const recentOBV = obvSeries.slice(-20);
  const obvChange = recentOBV[recentOBV.length - 1] - recentOBV[0];
  const priceChange = (chartData[chartData.length - 1].close - chartData[chartData.length - 20].close)
                    / chartData[chartData.length - 20].close;
  const obvNorm = obvChange === 0 ? 0 : obvChange / Math.abs(recentOBV[0] || 1);
  let divergence = 0;
  if (priceChange > 0.05 && obvNorm < -0.1) divergence = -1;
  else if (priceChange < -0.05 && obvNorm > 0.1) divergence = 1;
  return { trend: obvNorm, divergence };
}

function calcATR(chartData, period = 14) {
  if (chartData.length < period + 1) return null;
  const trs = [];
  for (let i = 1; i < chartData.length; i++) {
    const high = chartData[i].high;
    const low = chartData[i].low;
    const prevClose = chartData[i - 1].close;
    trs.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
  }
  const recent = trs.slice(-period);
  const atr = recent.reduce((a, b) => a + b, 0) / period;
  const currentPrice = chartData[chartData.length - 1].close;
  return { atr, atrPercent: (atr / currentPrice) * 100 };
}

function generateReason(stock) {
  const reasons = [];
  const {
    rsi, zScore, momentum, vwapDiff, stochRSI, ma20, ma60,
    currentPrice, score, bollinger, position52, volume,
    macd, disparity, obv, atr,
  } = stock;

  if (score >= 12) {
    reasons.unshift('여러 퀀트 지표가 모두 강한 매수 신호를 보내고 있어요. 추세·모멘텀·과매도 신호가 동시에 정렬된 매우 보기 드문 상태예요');
  } else if (score >= 8) {
    reasons.unshift('주요 퀀트 지표 대부분이 매수 신호를 보내고 있어요. 진입을 적극 검토할 만한 타이밍이에요');
  } else if (score <= -12) {
    reasons.unshift('여러 지표가 동시에 강한 위험 신호를 보내고 있어요. 매수보다 관망이나 손절을 고려하는 게 좋아요');
  } else if (score <= -8) {
    reasons.unshift('주요 지표 대부분이 매도·약세 신호를 보내고 있어요. 추가 하락 가능성을 염두에 두세요');
  }

  if (position52 !== null) {
    if (position52 < 0.1) reasons.push('현재 가격이 최근 1년 중 가장 낮은 구간에 있어요. 추세 전환이 일어난다면 큰 반등 여력이 있는 위치예요');
    else if (position52 > 0.95) reasons.push('현재 가격이 52주 신고가를 돌파한 위치예요. 매물대 부담이 없어 추가 상승 여력이 큰 흐름이에요');
  }

  if (bollinger) {
    if (bollinger.percentB <= 0.05) reasons.push('볼린저밴드 하단을 터치한 상태예요. 통계적으로 95% 신뢰구간을 벗어난 극단적 저점이라 평균 회귀 가능성이 높아요');
    else if (bollinger.percentB >= 0.95) reasons.push('볼린저밴드 상단을 터치한 상태예요. 단기 과열 구간이라 조정이나 횡보 가능성이 있어요');
    else if (bollinger.bWidth < 0.05) reasons.push('볼린저밴드가 매우 좁아진 수축 상태예요. 곧 큰 방향성 움직임이 나올 가능성이 높아요');
  }

  if (volume) {
    if (volume.ratio > 3) reasons.push(`거래량이 평소 대비 ${volume.ratio.toFixed(1)}배 폭증했어요. 강한 매수세나 중요한 변화가 있다는 신호예요`);
    else if (volume.ratio > 2) reasons.push(`거래량이 평소 대비 ${volume.ratio.toFixed(1)}배 증가했어요. 시장 관심이 높아진 종목이에요`);
  }

  if (rsi < 30) reasons.push(`RSI가 ${rsi.toFixed(1)}로 극도로 낮아요. 과매도 영역이라 단기 반등 가능성이 높아요`);
  else if (rsi > 70) reasons.push(`RSI가 ${rsi.toFixed(1)}로 매우 높아요. 단기 과열로 잠시 조정 가능성이 있어요`);

  if (macd) {
    if (macd.histogram > 0 && macd.trend > 0) reasons.push('MACD 히스토그램이 양수이며 더 커지고 있어요. 상승 모멘텀이 강해지는 흐름이에요');
    else if (macd.histogram < 0 && macd.trend < 0) reasons.push('MACD 히스토그램이 음수이며 더 깊어지고 있어요. 하락 모멘텀이 강화되는 중이에요');
  }

  if (ma20 && ma60 && currentPrice) {
    if (currentPrice > ma20 && currentPrice > ma60 && ma20 > ma60) {
      reasons.push('20일·60일 이동평균이 모두 현재가 아래에 있는 정배열 상태예요. 꾸준한 상승 추세가 유지되고 있어요');
    } else if (currentPrice < ma20 && currentPrice < ma60 && ma20 < ma60) {
      reasons.push('20일·60일 이동평균이 모두 현재가 위에 있는 역배열 상태예요. 하락 추세가 강하다는 신호예요');
    }
  }

  if (obv && obv.divergence !== 0) {
    if (obv.divergence > 0) reasons.push('가격은 떨어졌지만 거래량(OBV)은 오히려 올라가는 강세 다이버전스가 나타나요. 매집이 진행 중일 가능성이 있어요');
    else reasons.push('가격은 올랐지만 거래량(OBV)은 약해지는 약세 다이버전스예요. 상승 동력이 약화되는 신호일 수 있어요');
  }

  if (momentum > 15) reasons.push(`최근 1~3개월 동안 ${momentum.toFixed(1)}% 상승했어요. 강한 상승 흐름이 이어지고 있어요`);
  else if (momentum < -15) reasons.push(`최근 1~3개월 동안 ${Math.abs(momentum).toFixed(1)}% 하락했어요. 하락 흐름이 상당히 강해요`);

  if (atr && atr.atrPercent > 5) {
    reasons.push(`일평균 변동성(ATR)이 ${atr.atrPercent.toFixed(1)}%로 매우 큰 종목이에요. 손익 폭이 커서 분할 매매를 고려하는 게 좋아요`);
  }

  return reasons.slice(0, 3);
}

function calcQuantScore(chartData) {
  const closes = chartData.map(d => d.close);
  const currentPrice = closes[closes.length - 1];
  const signals = [];
  const breakdown = {};

  let oscScore = 0;
  const rsi = Math.round(calcRSI(closes) * 10) / 10;
  if (rsi < 30) { oscScore += 3; signals.push({ label: `RSI ${rsi} 과매도`, type: 'bullish', cat: 'osc' }); }
  else if (rsi < 40) { oscScore += 1.5; signals.push({ label: `RSI ${rsi} 저점`, type: 'bullish', cat: 'osc' }); }
  else if (rsi > 70) { oscScore -= 3; signals.push({ label: `RSI ${rsi} 과매수`, type: 'bearish', cat: 'osc' }); }
  else if (rsi > 60) { oscScore -= 1.5; signals.push({ label: `RSI ${rsi} 고점`, type: 'bearish', cat: 'osc' }); }

  const stochRSI = Math.round(calcStochRSI(closes) * 100) / 100;
  if (stochRSI < 0.2) { oscScore += 2; signals.push({ label: `StochRSI ${stochRSI} 강과매도`, type: 'bullish', cat: 'osc' }); }
  else if (stochRSI > 0.8) { oscScore -= 2; signals.push({ label: `StochRSI ${stochRSI} 강과매수`, type: 'bearish', cat: 'osc' }); }
  oscScore = Math.max(-4, Math.min(4, oscScore));
  breakdown.osc = oscScore;

  let trendScore = 0;
  const ma20 = calcSMA(closes, 20);
  const ma60 = calcSMA(closes, 60);
  if (ma20 && ma60) {
    if (currentPrice > ma20 && currentPrice > ma60 && ma20 > ma60) { trendScore += 3; signals.push({ label: '완전 정배열', type: 'bullish', cat: 'trend' }); }
    else if (currentPrice > ma20 && currentPrice > ma60) { trendScore += 1.5; signals.push({ label: '이평선 위', type: 'bullish', cat: 'trend' }); }
    else if (currentPrice < ma20 && currentPrice < ma60 && ma20 < ma60) { trendScore -= 3; signals.push({ label: '완전 역배열', type: 'bearish', cat: 'trend' }); }
    else if (currentPrice < ma20 && currentPrice < ma60) { trendScore -= 1.5; signals.push({ label: '이평선 아래', type: 'bearish', cat: 'trend' }); }
  }

  const macd = calcMACD(closes);
  if (macd) {
    if (macd.histogram > 0 && macd.trend > 0) { trendScore += 2.5; signals.push({ label: 'MACD 강세 확장', type: 'bullish', cat: 'trend' }); }
    else if (macd.histogram > 0) { trendScore += 1; signals.push({ label: 'MACD 양전환', type: 'bullish', cat: 'trend' }); }
    else if (macd.histogram < 0 && macd.trend < 0) { trendScore -= 2.5; signals.push({ label: 'MACD 약세 확장', type: 'bearish', cat: 'trend' }); }
    else if (macd.histogram < 0) { trendScore -= 1; signals.push({ label: 'MACD 음전환', type: 'bearish', cat: 'trend' }); }
  }
  trendScore = Math.max(-5, Math.min(5, trendScore));
  breakdown.trend = trendScore;

  let momScore = 0;
  const momentum = Math.round(calcMomentum(closes) * 10) / 10;
  if (momentum > 15) { momScore += 2; signals.push({ label: `모멘텀 +${momentum}%`, type: 'bullish', cat: 'mom' }); }
  else if (momentum > 5) { momScore += 1; signals.push({ label: `모멘텀 +${momentum}%`, type: 'bullish', cat: 'mom' }); }
  else if (momentum < -15) { momScore -= 2; signals.push({ label: `모멘텀 ${momentum}%`, type: 'bearish', cat: 'mom' }); }
  else if (momentum < -5) { momScore -= 1; signals.push({ label: `모멘텀 ${momentum}%`, type: 'bearish', cat: 'mom' }); }

  const disparity = Math.round(calcDisparity(closes, 20) * 10) / 10;
  if (disparity < 92) { momScore += 1.5; signals.push({ label: `20일 이격도 ${disparity}%`, type: 'bullish', cat: 'mom' }); }
  else if (disparity > 108) { momScore -= 1.5; signals.push({ label: `20일 이격도 ${disparity}%`, type: 'bearish', cat: 'mom' }); }
  momScore = Math.max(-3, Math.min(3, momScore));
  breakdown.mom = momScore;

  let volaScore = 0;
  const bollinger = calcBollinger(closes);
  if (bollinger) {
    if (bollinger.percentB <= 0.05) { volaScore += 3; signals.push({ label: '볼린저 하단 터치', type: 'bullish', cat: 'vola' }); }
    else if (bollinger.percentB <= 0.2) { volaScore += 1; signals.push({ label: '볼린저 하단 근접', type: 'bullish', cat: 'vola' }); }
    else if (bollinger.percentB >= 0.95) { volaScore -= 3; signals.push({ label: '볼린저 상단 터치', type: 'bearish', cat: 'vola' }); }
    else if (bollinger.percentB >= 0.8) { volaScore -= 1; signals.push({ label: '볼린저 상단 근접', type: 'bearish', cat: 'vola' }); }
    if (bollinger.bWidth < 0.05) { signals.push({ label: '볼린저 수축 (변동 예고)', type: 'neutral', cat: 'vola' }); }
  }
  volaScore = Math.max(-3, Math.min(3, volaScore));
  breakdown.vola = volaScore;

  let volScore = 0;
  const volume = calcVolumeAnalysis(chartData);
  if (volume.ratio > 3) { volScore += 2.5; signals.push({ label: `거래량 ${volume.ratio.toFixed(1)}배 폭증`, type: 'bullish', cat: 'vol' }); }
  else if (volume.ratio > 2) { volScore += 1.5; signals.push({ label: `거래량 ${volume.ratio.toFixed(1)}배 증가`, type: 'bullish', cat: 'vol' }); }
  else if (volume.ratio < 0.3) { volScore -= 1; signals.push({ label: '거래량 급감', type: 'bearish', cat: 'vol' }); }

  const obv = calcOBV(chartData);
  if (obv.divergence > 0) { volScore += 2; signals.push({ label: 'OBV 강세 다이버전스', type: 'bullish', cat: 'vol' }); }
  else if (obv.divergence < 0) { volScore -= 2; signals.push({ label: 'OBV 약세 다이버전스', type: 'bearish', cat: 'vol' }); }
  else if (obv.trend > 0.1) { volScore += 0.5; signals.push({ label: 'OBV 매집 추세', type: 'bullish', cat: 'vol' }); }
  else if (obv.trend < -0.1) { volScore -= 0.5; signals.push({ label: 'OBV 분산 추세', type: 'bearish', cat: 'vol' }); }
  volScore = Math.max(-3, Math.min(3, volScore));
  breakdown.vol = volScore;

  let posScore = 0;
  const zScore = Math.round(calcZScore(closes) * 100) / 100;
  if (zScore < -2) { posScore += 2.5; signals.push({ label: `Z-Score ${zScore} 통계적 저점`, type: 'bullish', cat: 'pos' }); }
  else if (zScore < -1) { posScore += 1; signals.push({ label: `Z-Score ${zScore} 하단`, type: 'bullish', cat: 'pos' }); }
  else if (zScore > 2) { posScore -= 2.5; signals.push({ label: `Z-Score ${zScore} 통계적 고점`, type: 'bearish', cat: 'pos' }); }
  else if (zScore > 1) { posScore -= 1; signals.push({ label: `Z-Score ${zScore} 상단`, type: 'bearish', cat: 'pos' }); }

  const position52 = calc52WeekPosition(closes);
  if (position52 !== null) {
    if (position52 < 0.1) { posScore += 2.5; signals.push({ label: '52주 저점 근접', type: 'bullish', cat: 'pos' }); }
    else if (position52 < 0.2) { posScore += 1; signals.push({ label: '52주 저가권', type: 'bullish', cat: 'pos' }); }
    else if (position52 > 0.95) { posScore += 1.5; signals.push({ label: '52주 신고가 돌파', type: 'bullish', cat: 'pos' }); }
    else if (position52 > 0.85) { posScore -= 0.5; signals.push({ label: '52주 고가권', type: 'bearish', cat: 'pos' }); }
  }
  posScore = Math.max(-4, Math.min(4, posScore));
  breakdown.pos = posScore;

  let vwapScore = 0;
  const vwap = calcVWAP(chartData);
  const vwapDiff = Math.round(((currentPrice - vwap) / vwap) * 1000) / 10;
  if (vwapDiff < -3) { vwapScore += 2; signals.push({ label: `VWAP -${Math.abs(vwapDiff)}% 저평가`, type: 'bullish', cat: 'vwap' }); }
  else if (vwapDiff > 3) { vwapScore -= 2; signals.push({ label: `VWAP +${vwapDiff}% 고평가`, type: 'bearish', cat: 'vwap' }); }
  breakdown.vwap = vwapScore;

  const score = Math.round((oscScore + trendScore + momScore + volaScore + volScore + posScore + vwapScore) * 10) / 10;

  let grade, gradeColor, gradeBg, gradeEmoji;
  if (score >= 12) { grade = '강력매수'; gradeColor = 'text-red-700'; gradeBg = 'bg-red-50 border-red-300'; gradeEmoji = '🔥'; }
  else if (score >= 6) { grade = '매수고려'; gradeColor = 'text-red-500'; gradeBg = 'bg-red-50 border-red-200'; gradeEmoji = '📈'; }
  else if (score >= -5) { grade = '관망'; gradeColor = 'text-gray-500'; gradeBg = 'bg-gray-50 border-gray-200'; gradeEmoji = '➡️'; }
  else if (score >= -11) { grade = '매도주의'; gradeColor = 'text-blue-500'; gradeBg = 'bg-blue-50 border-blue-200'; gradeEmoji = '📉'; }
  else { grade = '강력주의'; gradeColor = 'text-blue-700'; gradeBg = 'bg-blue-50 border-blue-300'; gradeEmoji = '❄️'; }

  const atr = calcATR(chartData);

  return {
    score, grade, gradeColor, gradeBg, gradeEmoji, signals, breakdown,
    rsi, zScore, momentum, vwapDiff, stochRSI, ma20, ma60, currentPrice,
    bollinger, position52, volume, macd, disparity, obv, atr,
  };
}

// ╔══════════════════════════════════════════════════════════
// ║ 메인 컴포넌트
// ╚══════════════════════════════════════════════════════════
const SCAN_TYPES = [
  { key: 'volume', label: '거래량 TOP' },
  { key: 'amount', label: '거래대금 TOP' },
  { key: 'marcap', label: '시가총액 TOP' },
  { key: 'rise', label: '상승률 TOP' },
  { key: 'fall', label: '하락률 TOP' },
];

const SCAN_COUNT = 100;
const BATCH_SIZE = 10;

export default function ScannerPage() {
  const { user } = useAuth();
  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  const { addToast } = useToast();
  const router = useRouter();
  
  const [scanning, setScanning] = useState(false);
  const [results, setResults] = useState([]);
  const [filter, setFilter] = useState('all');
  const [scanType, setScanType] = useState('volume');
  const [progress, setProgress] = useState(0);
  const [scannedAt, setScannedAt] = useState(null);
  const [expandedId, setExpandedId] = useState(null);
  
  // ✅ 정렬 & 관심종목 필터
  const [sortBy, setSortBy] = useState('score');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    try {
      const saved = localStorage.getItem('scanner_results');
      const savedAt = localStorage.getItem('scanner_scannedAt');
      const savedType = localStorage.getItem('scanner_type');
      if (saved) {
        setResults(JSON.parse(saved));
        setScannedAt(savedAt);
        if (savedType) setScanType(savedType);
      }
    } catch (e) {}
  }, [user, router]);

  const startScan = async () => {
    setScanning(true);
    setResults([]);
    setProgress(0);

    try {
      const topRes = await fetch(`/api/top?type=${scanType}`);
      const topData = await topRes.json();
      const stocks = (topData.stocks || []).slice(0, SCAN_COUNT);

      const scanResults = [];

      for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
        const batch = stocks.slice(i, i + BATCH_SIZE);

        const batchResults = await Promise.all(
          batch.map(async (stock) => {
            try {
              const chartRes = await fetch(`/api/stock?symbol=${stock.code}&timeframe=daily`);
              const chartData = await chartRes.json();
              if (!chartData.chartData || chartData.chartData.length < 30) return null;

              const quant = calcQuantScore(chartData.chartData);
              const reasonList = generateReason({ ...quant, currentPrice: chartData.currentPrice });

              return {
                code: stock.code,
                name: stock.name,
                price: chartData.currentPrice || 0,
                change: chartData.change || 0,
                changePercent: chartData.changePercent || 0,
                reasons: reasonList,
                ...quant,
              };
            } catch (e) {
              console.error(`${stock.name} 스캔 실패:`, e.message);
              return null;
            }
          })
        );

        scanResults.push(...batchResults.filter(r => r !== null));
        setResults([...scanResults].sort((a, b) => b.score - a.score));
        setProgress(Math.min(100, Math.round(((i + BATCH_SIZE) / stocks.length) * 100)));

        if (i + BATCH_SIZE < stocks.length) {
          await new Promise(r => setTimeout(r, 250));
        }
      }

      scanResults.sort((a, b) => b.score - a.score);
      setResults(scanResults);

      const now = new Date().toLocaleTimeString('ko-KR');
      setScannedAt(now);

      try {
        localStorage.setItem('scanner_results', JSON.stringify(scanResults));
        localStorage.setItem('scanner_scannedAt', now);
        localStorage.setItem('scanner_type', scanType);
      } catch (e) {}

      addToast(`${scanResults.length}개 종목 스캔 완료!`, 'success');

    } catch (e) {
      console.error(e);
      addToast('스캔 중 오류가 발생했습니다', 'error');
    } finally {
      setScanning(false);
      setProgress(100);
    }
  };

  const gradeFilters = [
    { key: 'all', label: '전체' },
    { key: 'strong_buy', label: '🔥 강력매수' },
    { key: 'buy', label: '📈 매수고려' },
    { key: 'watch', label: '➡️ 관망' },
    { key: 'caution', label: '📉 매도주의' },
    { key: 'strong_caution', label: '❄️ 강력주의' },
  ];

  const getFilteredResults = () => {
    let filtered = results;
    
    // 등급 필터
    switch (filter) {
      case 'strong_buy': filtered = filtered.filter(r => r.score >= 12); break;
      case 'buy': filtered = filtered.filter(r => r.score >= 6 && r.score < 12); break;
      case 'watch': filtered = filtered.filter(r => r.score >= -5 && r.score < 6); break;
      case 'caution': filtered = filtered.filter(r => r.score >= -11 && r.score < -5); break;
      case 'strong_caution': filtered = filtered.filter(r => r.score < -11); break;
    }
    
    // ✅ 관심종목 필터
    if (showFavoritesOnly) {
      filtered = filtered.filter(r => isFavorite(r.code));
    }
    
    // ✅ 정렬
    filtered.sort((a, b) => {
      if (sortBy === 'score') return b.score - a.score;
      if (sortBy === 'rsi') return a.rsi - b.rsi;
      if (sortBy === 'volume') return (b.volume?.ratio || 0) - (a.volume?.ratio || 0);
      if (sortBy === 'change') return Math.abs(b.changePercent) - Math.abs(a.changePercent);
      return 0;
    });
    
    return filtered;
  };

  const filtered = getFilteredResults();

  const gradeCounts = {
    strong_buy: results.filter(r => r.score >= 12).length,
    buy: results.filter(r => r.score >= 6 && r.score < 12).length,
    watch: results.filter(r => r.score >= -5 && r.score < 6).length,
    caution: results.filter(r => r.score >= -11 && r.score < -5).length,
    strong_caution: results.filter(r => r.score < -11).length,
  };

  return (
    <main className="min-h-screen bg-gray-50 p-3 pb-24">
      <div className="max-w-2xl mx-auto">

        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900 mb-0.5">🔍 종목 스캐너</h1>
          <p className="text-xs text-gray-400">11개 퀀트 지표로 매수/매도 종목 자동 탐색</p>
        </div>

        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
          <p className="text-xs font-medium text-gray-500 mb-2">스캔 대상 ({SCAN_COUNT}종목)</p>

          <div className="flex gap-2 mb-4 overflow-x-auto pb-1 scrollbar-hide">
            {SCAN_TYPES.map(t => (
              <button key={t.key} onClick={() => setScanType(t.key)}
                className={`flex-shrink-0 px-3 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                  scanType === t.key ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                {t.label}
              </button>
            ))}
          </div>

          <button onClick={startScan} disabled={scanning}
            className="w-full py-3.5 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-2xl font-bold text-sm disabled:opacity-60">
            {scanning ? (
              <span className="flex items-center justify-center gap-2">
                <span className="animate-spin">⏳</span>
                스캔 중... {progress}%
              </span>
            ) : results.length > 0 ? '🔄 재스캔' : '🚀 퀀트 스캔 시작'}
          </button>

          {scanning && (
            <div className="mt-3">
              <div className="w-full bg-gray-100 rounded-full h-2 overflow-hidden">
                <div className="h-2 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full transition-all duration-300"
                  style={{ width: `${progress}%` }} />
              </div>
              <p className="text-xs text-gray-400 text-center mt-1">병렬 처리 중... {progress}%</p>
            </div>
          )}
        </div>

        {results.length > 0 && (
          <>
            <div className="bg-gray-900 rounded-2xl p-4 mb-4 text-white">
              <div className="flex justify-between items-center mb-3">
                <p className="text-sm font-bold">📊 스캔 결과 ({results.length}종목)</p>
                {scannedAt && <p className="text-xs text-gray-400">{scannedAt} 기준</p>}
              </div>
              <div className="grid grid-cols-5 gap-1.5">
                {[
                  { key: 'strong_buy', emoji: '🔥', label: '강력매수', color: 'text-red-400' },
                  { key: 'buy', emoji: '📈', label: '매수고려', color: 'text-orange-400' },
                  { key: 'watch', emoji: '➡️', label: '관망', color: 'text-gray-300' },
                  { key: 'caution', emoji: '📉', label: '매도주의', color: 'text-blue-400' },
                  { key: 'strong_caution', emoji: '❄️', label: '강력주의', color: 'text-blue-300' },
                ].map(({ key, emoji, label, color }) => (
                  <div key={key} className="bg-white bg-opacity-10 rounded-xl p-2 text-center">
                    <p className="text-lg">{emoji}</p>
                    <p className={`text-xl font-bold ${color}`}>{gradeCounts[key]}</p>
                    <p className="text-gray-400 mt-0.5" style={{ fontSize: '9px' }}>{label}</p>
                  </div>
                ))}
              </div>
            </div>

            {/* ✅ 등급 필터 */}
            <div className="flex gap-2 mb-3 overflow-x-auto pb-1 scrollbar-hide">
              {gradeFilters.map(f => {
                const count = f.key === 'all' ? results.length : gradeCounts[f.key];
                return (
                  <button key={f.key} onClick={() => setFilter(f.key)}
                    className={`flex-shrink-0 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors whitespace-nowrap ${
                      filter === f.key ? 'bg-blue-500 text-white' : 'bg-white text-gray-600 border border-gray-200'
                    }`}>
                    {f.label} {count}
                  </button>
                );
              })}
            </div>

            {/* ✅ 정렬 & 관심종목 */}
            <div className="bg-white rounded-2xl border border-gray-200 p-3 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-gray-700">정렬:</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="score">점수 높은 순</option>
                  <option value="rsi">RSI 낮은 순</option>
                  <option value="volume">거래량 많은 순</option>
                  <option value="change">등락률 큰 순</option>
                </select>
              </div>
              
              <button
                onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                className={`w-full py-2 rounded-lg text-xs font-bold transition-colors ${
                  showFavoritesOnly 
                    ? 'bg-yellow-100 text-yellow-700 border border-yellow-300' 
                    : 'bg-gray-100 text-gray-600'
                }`}>
                ⭐ 관심종목만 보기 ({favorites.length})
              </button>
            </div>

            <div className="space-y-2">
              {filtered.length === 0 ? (
                <div className="text-center py-8 text-gray-400 text-sm">
                  {showFavoritesOnly ? '관심종목이 없습니다' : '해당 등급의 종목이 없습니다'}
                </div>
              ) : (
                filtered.map((stock) => (
                  <div key={stock.code} className={`rounded-2xl border ${stock.gradeBg} overflow-hidden`}>
                    <div className="p-4">

                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                            <span className="text-lg">{stock.gradeEmoji}</span>
                            <p className="font-bold text-gray-900 text-sm">{stock.name}</p>
                            <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-white border ${stock.gradeColor}`}>
                              {stock.grade}
                            </span>
                            
                            {/* ✅ 관심종목 버튼 */}
                            <button
                              onClick={() => {
                                toggleFavorite({ code: stock.code, name: stock.name });
                                addToast(
                                  isFavorite(stock.code) ? '관심종목에서 제거' : '관심종목에 추가',
                                  'success'
                                );
                              }}
                              className={`p-1 rounded transition-colors ${
                                isFavorite(stock.code) ? 'text-yellow-500' : 'text-gray-300'
                              }`}>
                              ⭐
                            </button>
                          </div>
                          <p className="text-xs text-gray-400 ml-7">{stock.code}</p>
                        </div>
                        <div className="text-right shrink-0 ml-2">
                          <p className="font-bold text-gray-900 text-sm">{stock.price?.toLocaleString() || '0'}원</p>
                          <p className={`text-xs font-medium ${(stock.change || 0) >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                            {(stock.change || 0) >= 0 ? '+' : ''}{(stock.changePercent || 0).toFixed(2)}%
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs text-gray-500 shrink-0 w-14">퀀트점수</span>
                        <div className="flex-1 bg-white rounded-full h-2 overflow-hidden">
                          <div className={`h-2 rounded-full ${stock.score >= 0 ? 'bg-red-400' : 'bg-blue-400'}`}
                            style={{ width: `${Math.min(Math.abs(stock.score) / 20 * 100, 100)}%` }} />
                        </div>
                        <span className={`text-xs font-bold shrink-0 w-10 text-right ${stock.score >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                          {stock.score >= 0 ? '+' : ''}{stock.score}
                        </span>
                      </div>

                      <div className="grid grid-cols-7 gap-1 mb-3">
                        {[
                          { key: 'osc', label: '진동', color: (stock.breakdown?.osc || 0) >= 0 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600' },
                          { key: 'trend', label: '추세', color: (stock.breakdown?.trend || 0) >= 0 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600' },
                          { key: 'mom', label: '모멘', color: (stock.breakdown?.mom || 0) >= 0 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600' },
                          { key: 'vola', label: '변동', color: (stock.breakdown?.vola || 0) >= 0 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600' },
                          { key: 'vol', label: '거래', color: (stock.breakdown?.vol || 0) >= 0 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600' },
                          { key: 'pos', label: '위치', color: (stock.breakdown?.pos || 0) >= 0 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600' },
                          { key: 'vwap', label: 'VWAP', color: (stock.breakdown?.vwap || 0) >= 0 ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600' },
                        ].map(({ key, label, color }) => {
                          const val = stock.breakdown?.[key] || 0;
                          return (
                            <div key={key} className={`text-center py-1 rounded-lg ${val === 0 ? 'bg-gray-100 text-gray-400' : color}`}>
                              <p style={{ fontSize: '9px' }}>{label}</p>
                              <p className="text-xs font-bold">{val > 0 ? '+' : ''}{val.toFixed(1)}</p>
                            </div>
                          );
                        })}
                      </div>

                      {stock.reasons && stock.reasons.length > 0 && (
                        <div className="bg-white bg-opacity-70 rounded-xl p-3 mb-3">
                          <p className="text-xs font-bold text-gray-700 mb-1.5">💡 분석 근거</p>
                          {stock.reasons.map((reason, i) => (
                            <p key={i} className="text-xs text-gray-600 leading-relaxed mb-1 last:mb-0">
                              {i + 1}. {reason}
                            </p>
                          ))}
                        </div>
                      )}

                      <div className="flex gap-1.5 flex-wrap mb-3">
                        {[
                          { label: `RSI ${(stock.rsi || 0).toFixed(0)}`, good: (stock.rsi || 0) < 50 },
                          { label: `Z ${(stock.zScore || 0).toFixed(1)}`, good: (stock.zScore || 0) < 0 },
                          { label: `모멘 ${(stock.momentum || 0) > 0 ? '+' : ''}${(stock.momentum || 0).toFixed(0)}%`, good: (stock.momentum || 0) > 0 },
                          stock.bollinger && { label: `%B ${((stock.bollinger.percentB || 0) * 100).toFixed(0)}`, good: (stock.bollinger.percentB || 0) < 0.5 },
                          stock.position52 !== null && { label: `52주 ${((stock.position52 || 0) * 100).toFixed(0)}%`, good: (stock.position52 || 0) < 0.5 },
                          stock.volume && { label: `거래 ${(stock.volume.ratio || 0).toFixed(1)}x`, good: (stock.volume.ratio || 0) > 1.2 },
                          stock.atr && { label: `변동 ${(stock.atr.atrPercent || 0).toFixed(1)}%`, good: (stock.atr.atrPercent || 0) < 4 },
                        ].filter(Boolean).map(({ label, good }, j) => (
                          <span key={j} className={`text-xs px-2 py-0.5 rounded-full ${good ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                            {label}
                          </span>
                        ))}
                      </div>

                      <button
                        onClick={() => setExpandedId(expandedId === stock.code ? null : stock.code)}
                        className="w-full text-xs text-gray-400 text-center py-1">
                        {expandedId === stock.code ? '▲ 신호 닫기' : `▼ 세부 신호 보기 (${stock.signals?.length || 0}개)`}
                      </button>

                      {expandedId === stock.code && stock.signals && (
                        <div className="mt-2 space-y-1">
                          {stock.signals.map((sig, j) => (
                            <div key={j} className="flex items-center gap-2">
                              <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                                sig.type === 'bullish' ? 'bg-red-400' :
                                sig.type === 'bearish' ? 'bg-blue-400' : 'bg-gray-400'
                              }`} />
                              <span className="text-xs text-gray-600">{sig.label}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    {/* ✅ 페이지 연동 버튼 */}
                    <div className="grid grid-cols-2 border-t border-gray-200">
                      <button
                        onClick={() => router.push(`/?stock=${stock.code}&name=${encodeURIComponent(stock.name)}`)}
                        className="py-2.5 text-xs font-bold bg-blue-500 text-white border-r border-gray-200">
                        📈 차트 보기
                      </button>
                      <button
                        onClick={() => router.push(`/financial?query=${stock.name}`)}
                        className="py-2.5 text-xs font-bold bg-purple-500 text-white">
                        📊 재무분석
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </>
        )}

        {!scanning && results.length === 0 && (
          <div className="text-center py-8">
            <p className="text-5xl mb-4">🔍</p>
            <p className="text-gray-600 font-bold mb-1">퀀트 스캐너 v2</p>
            <p className="text-gray-400 text-sm mb-6">11개 지표로 종목을 분석합니다</p>
            <div className="bg-white rounded-2xl border border-gray-200 p-4 text-left">
              <p className="text-xs font-bold text-gray-700 mb-3">📐 분석 지표 (7개 카테고리, 11종)</p>
              {[
                { icon: '📊', label: 'RSI', desc: 'Wilder\'s 방식 — 과매수/과매도 판단' },
                { icon: '⚡', label: 'StochRSI', desc: 'RSI를 더 민감하게 변환한 지표' },
                { icon: '📈', label: '이동평균 정배열', desc: '5/20/60일 평균과 현재가 관계' },
                { icon: '🌊', label: 'MACD', desc: '추세 전환 + 모멘텀 동시 측정' },
                { icon: '🚀', label: '모멘텀', desc: '1~3개월 가격 변화율' },
                { icon: '📐', label: '이격도', desc: '평균선 대비 현재가 위치 (%)' },
                { icon: '📉', label: '볼린저밴드', desc: '통계적 변동성 + 과열/침체' },
                { icon: '📊', label: '거래량 분석', desc: '평균 대비 거래량 폭증 감지' },
                { icon: '📦', label: 'OBV', desc: '거래량 누적으로 매집/분산 추세' },
                { icon: '🎯', label: 'Z-Score + 52주', desc: '통계적 위치 + 1년 가격 위치' },
                { icon: '🏦', label: 'VWAP', desc: '기관투자자 평균 매수가 대비' },
              ].map(({ icon, label, desc }) => (
                <div key={label} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <span className="text-lg shrink-0">{icon}</span>
                  <div>
                    <p className="text-xs font-bold text-gray-700">{label}</p>
                    <p className="text-xs text-gray-400 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}