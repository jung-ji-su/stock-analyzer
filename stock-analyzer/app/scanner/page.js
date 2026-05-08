'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useFavorites } from '@/lib/FavoritesContext';
import { useToast } from '@/components/Toast';
import { useRouter } from 'next/navigation';

// ╔══════════════════════════════════════════════════════════
// ║ 1. 기본 계산 함수
// ╚══════════════════════════════════════════════════════════

function calcSMA(data, period) {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

// EMA: 한 번만 계산해서 시리즈 반환 (효율 개선)
function calcEMAArray(data, period) {
  if (data.length < period) return null;
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

function calcEMA(data, period) {
  const arr = calcEMAArray(data, period);
  return arr ? arr[arr.length - 1] : null;
}

// RSI (Wilder's smoothing)
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

// MACD (EMA 시리즈 1회 계산으로 최적화)
function calcMACD(closes) {
  if (closes.length < 35) return null;
  const ema12Series = calcEMAArray(closes, 12);
  const ema26Series = calcEMAArray(closes, 26);
  if (!ema12Series || !ema26Series) return null;
  const offset = ema12Series.length - ema26Series.length;
  const macdSeries = ema26Series.map((v, i) => ema12Series[i + offset] - v);
  if (macdSeries.length < 9) return null;
  const signalSeries = calcEMAArray(macdSeries, 9);
  if (!signalSeries) return null;

  const macdLine = macdSeries[macdSeries.length - 1];
  const signal = signalSeries[signalSeries.length - 1];
  const histogram = macdLine - signal;

  // 히스토그램 추세: 최근 3개 비교
  const sigOffset = macdSeries.length - signalSeries.length;
  const histArr = signalSeries.map((s, i) => macdSeries[i + sigOffset] - s);
  const trend = histArr.length >= 3 ? histArr[histArr.length - 1] - histArr[histArr.length - 3] : 0;
  return { macdLine, signal, histogram, trend };
}

// 볼린저밴드
function calcBollinger(closes, period = 20, stdDev = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
  const upper = mean + stdDev * std;
  const lower = mean - stdDev * std;
  const current = closes[closes.length - 1];
  const bWidth = mean === 0 ? 0 : (upper - lower) / mean;
  const percentB = std === 0 ? 0.5 : (current - lower) / (upper - lower);
  return { upper, lower, mean, percentB, bWidth };
}

// ATR (변동성 정규화에 핵심 사용)
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

// ★ 신규: ADX - 추세 강도 (0~100, >25 강추세, <20 횡보)
function calcADX(chartData, period = 14) {
  if (chartData.length < period * 2 + 1) return null;

  const tr = [], plusDM = [], minusDM = [];
  for (let i = 1; i < chartData.length; i++) {
    const { high, low } = chartData[i];
    const { high: prevHigh, low: prevLow, close: prevClose } = chartData[i - 1];
    tr.push(Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose)));
    const upMove = high - prevHigh;
    const downMove = prevLow - low;
    plusDM.push(upMove > downMove && upMove > 0 ? upMove : 0);
    minusDM.push(downMove > upMove && downMove > 0 ? downMove : 0);
  }

  const wilderSmooth = (arr, p) => {
    if (arr.length < p) return null;
    let sum = arr.slice(0, p).reduce((a, b) => a + b, 0);
    const result = [sum];
    for (let i = p; i < arr.length; i++) {
      sum = sum - sum / p + arr[i];
      result.push(sum);
    }
    return result;
  };

  const trS = wilderSmooth(tr, period);
  const pDMS = wilderSmooth(plusDM, period);
  const mDMS = wilderSmooth(minusDM, period);
  if (!trS) return null;

  const plusDI = pDMS.map((v, i) => trS[i] === 0 ? 0 : (v / trS[i]) * 100);
  const minusDI = mDMS.map((v, i) => trS[i] === 0 ? 0 : (v / trS[i]) * 100);
  const dx = plusDI.map((p, i) => {
    const sum = p + minusDI[i];
    return sum === 0 ? 0 : (Math.abs(p - minusDI[i]) / sum) * 100;
  });

  if (dx.length < period) return null;
  let adx = dx.slice(0, period).reduce((a, b) => a + b, 0) / period;
  for (let i = period; i < dx.length; i++) adx = (adx * (period - 1) + dx[i]) / period;

  return {
    adx,
    direction: plusDI[plusDI.length - 1] > minusDI[minusDI.length - 1] ? 1 : -1,
  };
}

// OBV (변동성 정규화된 임계값 사용)
function calcOBV(chartData, atr) {
  if (chartData.length < 21) return { trend: 0, divergence: 0 };
  const obvSeries = [0];
  for (let i = 1; i < chartData.length; i++) {
    const prev = obvSeries[obvSeries.length - 1];
    if (chartData[i].close > chartData[i - 1].close) obvSeries.push(prev + chartData[i].volume);
    else if (chartData[i].close < chartData[i - 1].close) obvSeries.push(prev - chartData[i].volume);
    else obvSeries.push(prev);
  }
  const recentOBV = obvSeries.slice(-20);
  const obvChange = recentOBV[recentOBV.length - 1] - recentOBV[0];
  const priceChange = (chartData[chartData.length - 1].close - chartData[chartData.length - 20].close)
                    / chartData[chartData.length - 20].close;
  const obvNorm = recentOBV[0] === 0 ? 0 : obvChange / Math.abs(recentOBV[0]);

  // ★ 변동성 정규화: ATR의 2.5배를 "의미있는 가격 변화"로 정의
  const atrPct = atr?.atrPercent || 2;
  const threshold = (atrPct * 2.5) / 100;

  let divergence = 0;
  if (priceChange > threshold && obvNorm < -0.1) divergence = -1;
  else if (priceChange < -threshold && obvNorm > 0.1) divergence = 1;

  return { trend: obvNorm, divergence };
}

function calcZScore(closes, period = 20) {
  if (closes.length < period) return 0;
  const slice = closes.slice(-period);
  const mean = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / period);
  if (std === 0) return 0;
  return (closes[closes.length - 1] - mean) / std;
}

// 52주 위치 (최소 6개월 데이터 필요로 강화)
function calc52WeekPosition(closes) {
  if (closes.length < 120) return null;
  const period = Math.min(closes.length, 252);
  const slice = closes.slice(-period);
  const high = Math.max(...slice);
  const low = Math.min(...slice);
  if (high === low) return { position: 0.5, period };
  return { position: (closes[closes.length - 1] - low) / (high - low), period };
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

function calcVWAP(chartData) {
  const recent = chartData.slice(-20);
  const totalVol = recent.reduce((a, d) => a + d.volume, 0);
  if (totalVol === 0) return chartData[chartData.length - 1].close;
  return recent.reduce((a, d) => a + ((d.high + d.low + d.close) / 3) * d.volume, 0) / totalVol;
}

// ★ 신규: 거래량 가중 모멘텀 (가격 + 거래량 동행 가중)
function calcVWMomentum(chartData) {
  if (chartData.length < 60) return 0;
  const current = chartData[chartData.length - 1].close;
  const m1 = (current - chartData[chartData.length - 20].close) / chartData[chartData.length - 20].close * 100;
  const m3 = (current - chartData[chartData.length - 60].close) / chartData[chartData.length - 60].close * 100;
  // 최근 10일 거래량 vs 직전 30일 거래량
  const vol10 = chartData.slice(-10).reduce((a, d) => a + d.volume, 0) / 10;
  const vol30Prev = chartData.slice(-40, -10).reduce((a, d) => a + d.volume, 0) / 30;
  const volTrend = vol30Prev === 0 ? 1 : vol10 / vol30Prev;
  // 거래량 동반 상승 → 가중치 1.3까지, 동반 감소 → 0.7까지
  const weight = Math.max(0.7, Math.min(1.3, volTrend));
  return (m1 * 0.4 + m3 * 0.6) * weight;
}

// ╔══════════════════════════════════════════════════════════
// ║ 2. 카테고리별 점수 (각 -100 ~ +100)
// ╚══════════════════════════════════════════════════════════

function scoreTrend(closes, currentPrice, adx) {
  let score = 0;
  const signals = [];
  const ma20 = calcSMA(closes, 20);
  const ma60 = calcSMA(closes, 60);
  const macd = calcMACD(closes);

  // MA 정배열 (-50 ~ +50)
  if (ma20 && ma60) {
    if (currentPrice > ma20 && currentPrice > ma60 && ma20 > ma60) {
      score += 50; signals.push({ label: '완전 정배열', type: 'bullish', cat: 'trend' });
    } else if (currentPrice > ma20 && currentPrice > ma60) {
      score += 25; signals.push({ label: '이평선 위', type: 'bullish', cat: 'trend' });
    } else if (currentPrice < ma20 && currentPrice < ma60 && ma20 < ma60) {
      score -= 50; signals.push({ label: '완전 역배열', type: 'bearish', cat: 'trend' });
    } else if (currentPrice < ma20 && currentPrice < ma60) {
      score -= 25; signals.push({ label: '이평선 아래', type: 'bearish', cat: 'trend' });
    }
  }

  // MACD (-30 ~ +30)
  if (macd) {
    if (macd.histogram > 0 && macd.trend > 0) {
      score += 30; signals.push({ label: 'MACD 강세 확장', type: 'bullish', cat: 'trend' });
    } else if (macd.histogram > 0) {
      score += 15; signals.push({ label: 'MACD 양전환', type: 'bullish', cat: 'trend' });
    } else if (macd.histogram < 0 && macd.trend < 0) {
      score -= 30; signals.push({ label: 'MACD 약세 확장', type: 'bearish', cat: 'trend' });
    } else if (macd.histogram < 0) {
      score -= 15; signals.push({ label: 'MACD 음전환', type: 'bearish', cat: 'trend' });
    }
  }

  // ★ ADX 가산점 (-20 ~ +20)
  if (adx && adx.adx > 25) {
    const boost = Math.min(20, (adx.adx - 25) * 0.8);
    if (adx.direction > 0) {
      score += boost;
      signals.push({ label: `ADX ${adx.adx.toFixed(0)} 추세 강함`, type: 'bullish', cat: 'trend' });
    } else {
      score -= boost;
      signals.push({ label: `ADX ${adx.adx.toFixed(0)} 약세 강함`, type: 'bearish', cat: 'trend' });
    }
  }

  return { score: Math.max(-100, Math.min(100, score)), signals, ma20, ma60, macd };
}

function scoreMomentum(chartData) {
  let score = 0;
  const signals = [];
  const momentum = calcVWMomentum(chartData);

  if (momentum > 20) { score += 80; signals.push({ label: `모멘텀 +${momentum.toFixed(1)}% (강)`, type: 'bullish', cat: 'mom' }); }
  else if (momentum > 10) { score += 50; signals.push({ label: `모멘텀 +${momentum.toFixed(1)}%`, type: 'bullish', cat: 'mom' }); }
  else if (momentum > 3) { score += 25; signals.push({ label: `모멘텀 +${momentum.toFixed(1)}%`, type: 'bullish', cat: 'mom' }); }
  else if (momentum < -20) { score -= 80; signals.push({ label: `모멘텀 ${momentum.toFixed(1)}% (강)`, type: 'bearish', cat: 'mom' }); }
  else if (momentum < -10) { score -= 50; signals.push({ label: `모멘텀 ${momentum.toFixed(1)}%`, type: 'bearish', cat: 'mom' }); }
  else if (momentum < -3) { score -= 25; signals.push({ label: `모멘텀 ${momentum.toFixed(1)}%`, type: 'bearish', cat: 'mom' }); }

  return { score: Math.max(-100, Math.min(100, score)), signals, momentum };
}

function scoreVolatility(closes) {
  let score = 0;
  const signals = [];
  const bollinger = calcBollinger(closes);

  if (bollinger) {
    if (bollinger.percentB <= 0.05) { score += 80; signals.push({ label: '볼린저 하단 터치', type: 'bullish', cat: 'vola' }); }
    else if (bollinger.percentB <= 0.2) { score += 30; signals.push({ label: '볼린저 하단 근접', type: 'bullish', cat: 'vola' }); }
    else if (bollinger.percentB >= 0.95) { score -= 80; signals.push({ label: '볼린저 상단 터치', type: 'bearish', cat: 'vola' }); }
    else if (bollinger.percentB >= 0.8) { score -= 30; signals.push({ label: '볼린저 상단 근접', type: 'bearish', cat: 'vola' }); }
    if (bollinger.bWidth < 0.05) signals.push({ label: '볼린저 수축 (변동 예고)', type: 'neutral', cat: 'vola' });
  }
  return { score: Math.max(-100, Math.min(100, score)), signals, bollinger };
}

function scoreVolume(volume, obv) {
  let score = 0;
  const signals = [];

  if (volume.ratio > 3) { score += 60; signals.push({ label: `거래량 ${volume.ratio.toFixed(1)}배 폭증`, type: 'bullish', cat: 'vol' }); }
  else if (volume.ratio > 2) { score += 35; signals.push({ label: `거래량 ${volume.ratio.toFixed(1)}배 증가`, type: 'bullish', cat: 'vol' }); }
  else if (volume.ratio < 0.3) { score -= 25; signals.push({ label: '거래량 급감', type: 'bearish', cat: 'vol' }); }

  if (obv.divergence > 0) { score += 50; signals.push({ label: 'OBV 강세 다이버전스', type: 'bullish', cat: 'vol' }); }
  else if (obv.divergence < 0) { score -= 50; signals.push({ label: 'OBV 약세 다이버전스', type: 'bearish', cat: 'vol' }); }
  else if (obv.trend > 0.1) { score += 15; signals.push({ label: 'OBV 매집 추세', type: 'bullish', cat: 'vol' }); }
  else if (obv.trend < -0.1) { score -= 15; signals.push({ label: 'OBV 분산 추세', type: 'bearish', cat: 'vol' }); }

  return { score: Math.max(-100, Math.min(100, score)), signals };
}

function scorePosition(closes) {
  let score = 0;
  const signals = [];
  const zScore = calcZScore(closes);

  if (zScore < -2) { score += 60; signals.push({ label: `Z-Score ${zScore.toFixed(2)} 통계적 저점`, type: 'bullish', cat: 'pos' }); }
  else if (zScore < -1) { score += 25; signals.push({ label: `Z-Score ${zScore.toFixed(2)} 하단`, type: 'bullish', cat: 'pos' }); }
  else if (zScore > 2) { score -= 60; signals.push({ label: `Z-Score ${zScore.toFixed(2)} 통계적 고점`, type: 'bearish', cat: 'pos' }); }
  else if (zScore > 1) { score -= 25; signals.push({ label: `Z-Score ${zScore.toFixed(2)} 상단`, type: 'bearish', cat: 'pos' }); }

  const pos52Obj = calc52WeekPosition(closes);
  const position52 = pos52Obj?.position ?? null;
  if (position52 !== null) {
    if (position52 < 0.1) { score += 50; signals.push({ label: '52주 저점 근접', type: 'bullish', cat: 'pos' }); }
    else if (position52 < 0.2) { score += 25; signals.push({ label: '52주 저가권', type: 'bullish', cat: 'pos' }); }
    else if (position52 > 0.95) { score += 30; signals.push({ label: '52주 신고가 돌파', type: 'bullish', cat: 'pos' }); }
    else if (position52 > 0.85) { score -= 15; signals.push({ label: '52주 고가권', type: 'bearish', cat: 'pos' }); }
  }
  return { score: Math.max(-100, Math.min(100, score)), signals, zScore, position52 };
}

function scoreOscillator(closes) {
  let score = 0;
  const signals = [];
  const rsi = calcRSI(closes);

  if (rsi < 30) { score += 70; signals.push({ label: `RSI ${rsi.toFixed(1)} 과매도`, type: 'bullish', cat: 'osc' }); }
  else if (rsi < 40) { score += 30; signals.push({ label: `RSI ${rsi.toFixed(1)} 저점`, type: 'bullish', cat: 'osc' }); }
  else if (rsi > 70) { score -= 70; signals.push({ label: `RSI ${rsi.toFixed(1)} 과매수`, type: 'bearish', cat: 'osc' }); }
  else if (rsi > 60) { score -= 30; signals.push({ label: `RSI ${rsi.toFixed(1)} 고점`, type: 'bearish', cat: 'osc' }); }

  return { score: Math.max(-100, Math.min(100, score)), signals, rsi };
}

function scoreVWAP(chartData, currentPrice) {
  let score = 0;
  const signals = [];
  const vwap = calcVWAP(chartData);
  const vwapDiff = ((currentPrice - vwap) / vwap) * 100;

  if (vwapDiff < -3) { score += 50; signals.push({ label: `VWAP ${vwapDiff.toFixed(1)}% 저평가`, type: 'bullish', cat: 'vwap' }); }
  else if (vwapDiff < -1) score += 20;
  else if (vwapDiff > 3) { score -= 50; signals.push({ label: `VWAP +${vwapDiff.toFixed(1)}% 고평가`, type: 'bearish', cat: 'vwap' }); }
  else if (vwapDiff > 1) score -= 20;

  return { score: Math.max(-100, Math.min(100, score)), signals, vwap, vwapDiff };
}

// ╔══════════════════════════════════════════════════════════
// ║ 3. 가중치 시스템 (컨텍스트 기반)
// ╚══════════════════════════════════════════════════════════

const BASE_WEIGHTS = {
  trend: 25, // 추세가 가장 중요
  mom: 20,
  vol: 15,
  pos: 15,
  vola: 10,
  osc: 10,
  vwap: 5,
};

// ADX 기반 컨텍스트 가중치 조정
function adjustWeights(adx) {
  const w = { ...BASE_WEIGHTS };
  if (!adx) return w;

  if (adx.adx > 30) {
    // 강한 추세장: 추세 추종 가중치 ↑, 평균회귀 ↓
    w.trend += 8; w.mom += 4;
    w.osc -= 4; w.pos -= 4; w.vola -= 4;
  } else if (adx.adx < 18) {
    // 횡보장: 평균회귀 가중치 ↑, 추세 ↓
    w.osc += 6; w.pos += 6; w.vola += 4;
    w.trend -= 8; w.mom -= 4; w.vwap -= 4;
  }
  return w;
}

// 신뢰도: 카테고리 간 신호 일치도 (0~100%)
function calcConfidence(rawScores) {
  const positives = Object.values(rawScores).filter(s => s > 10).length;
  const negatives = Object.values(rawScores).filter(s => s < -10).length;
  const total = positives + negatives;
  if (total === 0) return 30; // 신호 부재
  return Math.round((Math.max(positives, negatives) / total) * 100);
}

// ╔══════════════════════════════════════════════════════════
// ║ 4. 메인 점수 계산
// ╚══════════════════════════════════════════════════════════

function calcQuantScore(chartData) {
  const closes = chartData.map(d => d.close);
  const currentPrice = closes[closes.length - 1];

  const atr = calcATR(chartData);
  const adx = calcADX(chartData);
  const volume = calcVolumeAnalysis(chartData);
  const obv = calcOBV(chartData, atr);

  // 카테고리 점수
  const trend = scoreTrend(closes, currentPrice, adx);
  const mom = scoreMomentum(chartData);
  const vola = scoreVolatility(closes);
  const vol = scoreVolume(volume, obv);
  const pos = scorePosition(closes);
  const osc = scoreOscillator(closes);
  const vwap = scoreVWAP(chartData, currentPrice);

  const rawScores = {
    trend: trend.score, mom: mom.score, vola: vola.score,
    vol: vol.score, pos: pos.score, osc: osc.score, vwap: vwap.score,
  };

  // 가중평균
  const weights = adjustWeights(adx);
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const score = Math.round(
    Object.entries(rawScores).reduce((acc, [k, v]) => acc + v * weights[k], 0) / totalWeight * 10
  ) / 10;

  // breakdown: 가중치 적용된 카테고리 기여도 (시각화용)
  const breakdown = Object.fromEntries(
    Object.entries(rawScores).map(([k, v]) => [k, Math.round(v * weights[k] / totalWeight * 10) / 10])
  );

  const confidence = calcConfidence(rawScores);
  const signals = [
    ...trend.signals, ...mom.signals, ...vola.signals,
    ...vol.signals, ...pos.signals, ...osc.signals, ...vwap.signals,
  ];

  // 등급 (-100 ~ +100 기준)
  let grade, gradeColor, gradeBg, gradeEmoji;
  if (score >= 50) { grade = '강력매수'; gradeColor = 'text-red-700'; gradeBg = 'bg-red-50 border-red-300'; gradeEmoji = '🔥'; }
  else if (score >= 20) { grade = '매수고려'; gradeColor = 'text-red-500'; gradeBg = 'bg-red-50 border-red-200'; gradeEmoji = '📈'; }
  else if (score >= -20) { grade = '관망'; gradeColor = 'text-gray-500'; gradeBg = 'bg-gray-50 border-gray-200'; gradeEmoji = '➡️'; }
  else if (score >= -50) { grade = '매도주의'; gradeColor = 'text-blue-500'; gradeBg = 'bg-blue-50 border-blue-200'; gradeEmoji = '📉'; }
  else { grade = '강력주의'; gradeColor = 'text-blue-700'; gradeBg = 'bg-blue-50 border-blue-300'; gradeEmoji = '❄️'; }

  return {
    score, grade, gradeColor, gradeBg, gradeEmoji, confidence,
    signals, breakdown, rawScores, weights,
    rsi: osc.rsi, zScore: pos.zScore, momentum: mom.momentum,
    vwapDiff: vwap.vwapDiff, ma20: trend.ma20, ma60: trend.ma60,
    currentPrice, bollinger: vola.bollinger, position52: pos.position52,
    volume, macd: trend.macd, obv, atr, adx,
  };
}

// ╔══════════════════════════════════════════════════════════
// ║ 5. 분석 근거 생성
// ╚══════════════════════════════════════════════════════════

function generateReason(stock) {
  const reasons = [];
  const {
    rsi, momentum, score, bollinger, position52, volume,
    macd, obv, atr, adx, ma20, ma60, currentPrice, confidence,
  } = stock;

  // 1. 종합 평가 (점수 + 신뢰도)
  if (score >= 50 && confidence >= 70) {
    reasons.push('주요 퀀트 지표가 강한 매수 신호로 일치하고 있어요. 추세·모멘텀·위치가 모두 정렬된 보기 드문 상태예요');
  } else if (score >= 20 && confidence >= 60) {
    reasons.push('주요 지표가 매수 신호 우위에 있어요. 진입을 검토할 만한 타이밍이에요');
  } else if (score <= -50 && confidence >= 70) {
    reasons.push('여러 지표가 동시에 강한 위험 신호를 보내고 있어요. 매수보다 관망이나 손절을 고려하세요');
  } else if (score <= -20 && confidence >= 60) {
    reasons.push('주요 지표가 약세 신호 우위에 있어요. 추가 하락 가능성을 염두에 두세요');
  } else if (confidence < 50) {
    reasons.push('지표들이 서로 엇갈리고 있어 방향성이 불분명해요. 명확한 신호가 나올 때까지 기다리는 게 좋아요');
  }

  // 2. 추세 강도 (ADX)
  if (adx) {
    if (adx.adx > 30 && adx.direction > 0) {
      reasons.push(`ADX ${adx.adx.toFixed(0)}으로 강한 상승 추세가 형성됐어요. 추세 추종 전략이 유효한 구간이에요`);
    } else if (adx.adx > 30 && adx.direction < 0) {
      reasons.push(`ADX ${adx.adx.toFixed(0)}으로 강한 하락 추세가 형성됐어요. 반등 시도는 위험할 수 있어요`);
    } else if (adx.adx < 20) {
      reasons.push('ADX가 낮아 추세 없이 횡보하는 구간이에요. 박스권 매매나 평균회귀 전략이 유효해요');
    }
  }

  if (position52 !== null) {
    if (position52 < 0.1) reasons.push('현재 가격이 최근 1년 중 가장 낮은 구간에 있어요. 추세 전환이 일어난다면 큰 반등 여력이 있는 위치예요');
    else if (position52 > 0.95) reasons.push('현재 가격이 52주 신고가를 돌파한 위치예요. 매물대 부담이 없어 추가 상승 여력이 큰 흐름이에요');
  }

  if (bollinger) {
    if (bollinger.percentB <= 0.05) reasons.push('볼린저밴드 하단을 터치한 상태예요. 통계적 극단 저점이라 평균 회귀 가능성이 높아요');
    else if (bollinger.percentB >= 0.95) reasons.push('볼린저밴드 상단을 터치한 상태예요. 단기 과열 구간이라 조정 가능성이 있어요');
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
    reasons.push(`일평균 변동성(ATR)이 ${atr.atrPercent.toFixed(1)}%로 큰 종목이에요. 손익 폭이 커서 분할 매매를 고려하세요`);
  }

  return reasons.slice(0, 3);
}

// ╔══════════════════════════════════════════════════════════
// ║ 6. 메인 컴포넌트
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
        if (i + BATCH_SIZE < stocks.length) await new Promise(r => setTimeout(r, 250));
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

  // ★ 등급 임계값 변경 (-100~+100 기준)
  const getFilteredResults = () => {
    let filtered = results;
    switch (filter) {
      case 'strong_buy': filtered = filtered.filter(r => r.score >= 50); break;
      case 'buy': filtered = filtered.filter(r => r.score >= 20 && r.score < 50); break;
      case 'watch': filtered = filtered.filter(r => r.score >= -20 && r.score < 20); break;
      case 'caution': filtered = filtered.filter(r => r.score >= -50 && r.score < -20); break;
      case 'strong_caution': filtered = filtered.filter(r => r.score < -50); break;
    }
    if (showFavoritesOnly) filtered = filtered.filter(r => isFavorite(r.code));
    filtered.sort((a, b) => {
      if (sortBy === 'score') return b.score - a.score;
      if (sortBy === 'confidence') return (b.confidence || 0) - (a.confidence || 0);
      if (sortBy === 'rsi') return a.rsi - b.rsi;
      if (sortBy === 'volume') return (b.volume?.ratio || 0) - (a.volume?.ratio || 0);
      if (sortBy === 'change') return Math.abs(b.changePercent) - Math.abs(a.changePercent);
      return 0;
    });
    return filtered;
  };

  const filtered = getFilteredResults();
  const gradeCounts = {
    strong_buy: results.filter(r => r.score >= 50).length,
    buy: results.filter(r => r.score >= 20 && r.score < 50).length,
    watch: results.filter(r => r.score >= -20 && r.score < 20).length,
    caution: results.filter(r => r.score >= -50 && r.score < -20).length,
    strong_caution: results.filter(r => r.score < -50).length,
  };

  return (
    <main className="min-h-screen bg-gray-50 p-3 pb-24">
      <div className="max-w-2xl mx-auto">

        <div className="mb-4">
          <h1 className="text-xl font-bold text-gray-900 mb-0.5">🔍 종목 스캐너 v3</h1>
          <p className="text-xs text-gray-400">가중치+ADX 컨텍스트 기반 퀀트 분석</p>
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

            <div className="bg-white rounded-2xl border border-gray-200 p-3 mb-3">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-xs font-bold text-gray-700">정렬:</span>
                <select value={sortBy} onChange={(e) => setSortBy(e.target.value)}
                  className="flex-1 px-2 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500">
                  <option value="score">점수 높은 순</option>
                  <option value="confidence">신뢰도 높은 순</option>
                  <option value="rsi">RSI 낮은 순</option>
                  <option value="volume">거래량 많은 순</option>
                  <option value="change">등락률 큰 순</option>
                </select>
              </div>
              <button onClick={() => setShowFavoritesOnly(!showFavoritesOnly)}
                className={`w-full py-2 rounded-lg text-xs font-bold transition-colors ${
                  showFavoritesOnly ? 'bg-yellow-100 text-yellow-700 border border-yellow-300' : 'bg-gray-100 text-gray-600'
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
                            <button onClick={() => {
                              toggleFavorite({ code: stock.code, name: stock.name });
                              addToast(isFavorite(stock.code) ? '관심종목에서 제거' : '관심종목에 추가', 'success');
                            }}
                              className={`p-1 rounded transition-colors ${isFavorite(stock.code) ? 'text-yellow-500' : 'text-gray-300'}`}>
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

                      {/* 점수 + 신뢰도 */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-xs text-gray-500 shrink-0 w-14">퀀트점수</span>
                        <div className="flex-1 bg-white rounded-full h-2 overflow-hidden">
                          <div className={`h-2 rounded-full ${stock.score >= 0 ? 'bg-red-400' : 'bg-blue-400'}`}
                            style={{ width: `${Math.min(Math.abs(stock.score), 100)}%` }} />
                        </div>
                        <span className={`text-xs font-bold shrink-0 w-12 text-right ${stock.score >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                          {stock.score >= 0 ? '+' : ''}{stock.score}
                        </span>
                      </div>

                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs text-gray-500 shrink-0 w-14">신뢰도</span>
                        <div className="flex-1 bg-white rounded-full h-2 overflow-hidden">
                          <div className={`h-2 rounded-full ${
                            stock.confidence >= 70 ? 'bg-green-400' :
                            stock.confidence >= 50 ? 'bg-yellow-400' : 'bg-gray-400'
                          }`} style={{ width: `${stock.confidence}%` }} />
                        </div>
                        <span className="text-xs font-bold shrink-0 w-12 text-right text-gray-600">
                          {stock.confidence}%
                        </span>
                      </div>

                      {/* ADX 컨텍스트 표시 */}
                      {stock.adx && (
                        <div className="mb-3 px-2 py-1.5 bg-white bg-opacity-50 rounded-lg flex justify-between items-center">
                          <span className="text-xs text-gray-500">📐 추세강도(ADX)</span>
                          <span className={`text-xs font-bold ${
                            stock.adx.adx > 30 ? (stock.adx.direction > 0 ? 'text-red-600' : 'text-blue-600') :
                            stock.adx.adx < 18 ? 'text-gray-500' : 'text-gray-700'
                          }`}>
                            {stock.adx.adx.toFixed(0)} {stock.adx.adx > 30 ? '강한 추세' : stock.adx.adx < 18 ? '횡보' : '약한 추세'}
                          </span>
                        </div>
                      )}

                      <div className="grid grid-cols-7 gap-1 mb-3">
                        {[
                          { key: 'trend', label: '추세' },
                          { key: 'mom', label: '모멘' },
                          { key: 'vol', label: '거래' },
                          { key: 'pos', label: '위치' },
                          { key: 'vola', label: '변동' },
                          { key: 'osc', label: '진동' },
                          { key: 'vwap', label: 'VWAP' },
                        ].map(({ key, label }) => {
                          const val = stock.breakdown?.[key] || 0;
                          const color = val > 0 ? 'bg-red-100 text-red-600' :
                                        val < 0 ? 'bg-blue-100 text-blue-600' :
                                        'bg-gray-100 text-gray-400';
                          return (
                            <div key={key} className={`text-center py-1 rounded-lg ${color}`}>
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

                      <button onClick={() => setExpandedId(expandedId === stock.code ? null : stock.code)}
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

                    <div className="grid grid-cols-2 border-t border-gray-200">
                      <button onClick={() => router.push(`/?stock=${stock.code}&name=${encodeURIComponent(stock.name)}`)}
                        className="py-2.5 text-xs font-bold bg-blue-500 text-white border-r border-gray-200">
                        📈 차트 보기
                      </button>
                      <button onClick={() => router.push(`/financial?query=${stock.name}`)}
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
            <p className="text-gray-600 font-bold mb-1">퀀트 스캐너 v3</p>
            <p className="text-gray-400 text-sm mb-6">가중치 시스템 + ADX 컨텍스트 기반 분석</p>
            <div className="bg-white rounded-2xl border border-gray-200 p-4 text-left">
              <p className="text-xs font-bold text-gray-700 mb-3">📐 분석 지표 (7개 카테고리)</p>
              {[
                { icon: '📈', label: '추세 (25%)', desc: 'MA 정배열 + MACD + ADX 강도' },
                { icon: '🚀', label: '모멘텀 (20%)', desc: '거래량 가중 1~3개월 가격 변화' },
                { icon: '📊', label: '거래량 (15%)', desc: '거래량 비율 + OBV (변동성 정규화)' },
                { icon: '🎯', label: '위치 (15%)', desc: 'Z-Score + 52주 위치' },
                { icon: '📉', label: '변동성 (10%)', desc: '볼린저밴드 + ATR' },
                { icon: '⚡', label: '진동 (10%)', desc: 'RSI (Wilder\'s 방식)' },
                { icon: '🏦', label: 'VWAP (5%)', desc: '거래량 가중 평균가 대비' },
              ].map(({ icon, label, desc }) => (
                <div key={label} className="flex items-start gap-3 py-2 border-b border-gray-50 last:border-0">
                  <span className="text-lg shrink-0">{icon}</span>
                  <div>
                    <p className="text-xs font-bold text-gray-700">{label}</p>
                    <p className="text-xs text-gray-400 leading-relaxed">{desc}</p>
                  </div>
                </div>
              ))}
              <p className="text-xs text-gray-500 mt-3 leading-relaxed">
                ★ ADX 30 이상이면 추세 가중치 ↑, 18 이하면 평균회귀 가중치 ↑로 자동 조정
              </p>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}