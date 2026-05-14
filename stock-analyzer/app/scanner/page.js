'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence, useSpring, useTransform } from 'framer-motion';
import { useAuth } from '@/lib/AuthContext';
import { useFavorites } from '@/lib/FavoritesContext';
import { useToast } from '@/components/Toast';
import { useRouter } from 'next/navigation';

// ╔══════════════════════════════════════════════════════════
// ║ 1. 기본 계산 함수 (로직 원본 유지)
// ╚══════════════════════════════════════════════════════════

function calcSMA(data, period) {
  if (data.length < period) return null;
  const slice = data.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

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
  const sigOffset = macdSeries.length - signalSeries.length;
  const histArr = signalSeries.map((s, i) => macdSeries[i + sigOffset] - s);
  const trend = histArr.length >= 3 ? histArr[histArr.length - 1] - histArr[histArr.length - 3] : 0;
  return { macdLine, signal, histogram, trend };
}

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
    for (let i = p; i < arr.length; i++) { sum = sum - sum / p + arr[i]; result.push(sum); }
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
  return { adx, direction: plusDI[plusDI.length - 1] > minusDI[minusDI.length - 1] ? 1 : -1 };
}

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
  const priceChange = (chartData[chartData.length - 1].close - chartData[chartData.length - 20].close) / chartData[chartData.length - 20].close;
  const obvNorm = recentOBV[0] === 0 ? 0 : obvChange / Math.abs(recentOBV[0]);
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

function calcVWMomentum(chartData) {
  if (chartData.length < 60) return 0;
  const current = chartData[chartData.length - 1].close;
  const m1 = (current - chartData[chartData.length - 20].close) / chartData[chartData.length - 20].close * 100;
  const m3 = (current - chartData[chartData.length - 60].close) / chartData[chartData.length - 60].close * 100;
  const vol10 = chartData.slice(-10).reduce((a, d) => a + d.volume, 0) / 10;
  const vol30Prev = chartData.slice(-40, -10).reduce((a, d) => a + d.volume, 0) / 30;
  const volTrend = vol30Prev === 0 ? 1 : vol10 / vol30Prev;
  const weight = Math.max(0.7, Math.min(1.3, volTrend));
  return (m1 * 0.4 + m3 * 0.6) * weight;
}

// ╔══════════════════════════════════════════════════════════
// ║ 2. 카테고리별 점수 (원본 유지)
// ╚══════════════════════════════════════════════════════════

function scoreTrend(closes, currentPrice, adx) {
  let score = 0;
  const signals = [];
  const ma20 = calcSMA(closes, 20);
  const ma60 = calcSMA(closes, 60);
  const macd = calcMACD(closes);
  if (ma20 && ma60) {
    if (currentPrice > ma20 && currentPrice > ma60 && ma20 > ma60) { score += 50; signals.push({ label: '완전 정배열', type: 'bullish', cat: 'trend' }); }
    else if (currentPrice > ma20 && currentPrice > ma60) { score += 25; signals.push({ label: '이평선 위', type: 'bullish', cat: 'trend' }); }
    else if (currentPrice < ma20 && currentPrice < ma60 && ma20 < ma60) { score -= 50; signals.push({ label: '완전 역배열', type: 'bearish', cat: 'trend' }); }
    else if (currentPrice < ma20 && currentPrice < ma60) { score -= 25; signals.push({ label: '이평선 아래', type: 'bearish', cat: 'trend' }); }
  }
  if (macd) {
    if (macd.histogram > 0 && macd.trend > 0) { score += 30; signals.push({ label: 'MACD 강세 확장', type: 'bullish', cat: 'trend' }); }
    else if (macd.histogram > 0) { score += 15; signals.push({ label: 'MACD 양전환', type: 'bullish', cat: 'trend' }); }
    else if (macd.histogram < 0 && macd.trend < 0) { score -= 30; signals.push({ label: 'MACD 약세 확장', type: 'bearish', cat: 'trend' }); }
    else if (macd.histogram < 0) { score -= 15; signals.push({ label: 'MACD 음전환', type: 'bearish', cat: 'trend' }); }
  }
  if (adx && adx.adx > 25) {
    const boost = Math.min(20, (adx.adx - 25) * 0.8);
    if (adx.direction > 0) { score += boost; signals.push({ label: `ADX ${adx.adx.toFixed(0)} 추세 강함`, type: 'bullish', cat: 'trend' }); }
    else { score -= boost; signals.push({ label: `ADX ${adx.adx.toFixed(0)} 약세 강함`, type: 'bearish', cat: 'trend' }); }
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
// ║ 3. 가중치 시스템 (원본 유지)
// ╚══════════════════════════════════════════════════════════

const BASE_WEIGHTS = { trend: 25, mom: 20, vol: 15, pos: 15, vola: 10, osc: 10, vwap: 5 };

function adjustWeights(adx) {
  const w = { ...BASE_WEIGHTS };
  if (!adx) return w;
  if (adx.adx > 30) { w.trend += 8; w.mom += 4; w.osc -= 4; w.pos -= 4; w.vola -= 4; }
  else if (adx.adx < 18) { w.osc += 6; w.pos += 6; w.vola += 4; w.trend -= 8; w.mom -= 4; w.vwap -= 4; }
  return w;
}

function calcConfidence(rawScores) {
  const positives = Object.values(rawScores).filter(s => s > 10).length;
  const negatives = Object.values(rawScores).filter(s => s < -10).length;
  const total = positives + negatives;
  if (total === 0) return 30;
  return Math.round((Math.max(positives, negatives) / total) * 100);
}

// ╔══════════════════════════════════════════════════════════
// ║ 4. 메인 점수 계산 (원본 유지)
// ╚══════════════════════════════════════════════════════════

function calcQuantScore(chartData) {
  const closes = chartData.map(d => d.close);
  const currentPrice = closes[closes.length - 1];
  const atr = calcATR(chartData);
  const adx = calcADX(chartData);
  const volume = calcVolumeAnalysis(chartData);
  const obv = calcOBV(chartData, atr);
  const trend = scoreTrend(closes, currentPrice, adx);
  const mom = scoreMomentum(chartData);
  const vola = scoreVolatility(closes);
  const vol = scoreVolume(volume, obv);
  const pos = scorePosition(closes);
  const osc = scoreOscillator(closes);
  const vwap = scoreVWAP(chartData, currentPrice);
  const rawScores = { trend: trend.score, mom: mom.score, vola: vola.score, vol: vol.score, pos: pos.score, osc: osc.score, vwap: vwap.score };
  const weights = adjustWeights(adx);
  const totalWeight = Object.values(weights).reduce((a, b) => a + b, 0);
  const score = Math.round(Object.entries(rawScores).reduce((acc, [k, v]) => acc + v * weights[k], 0) / totalWeight * 10) / 10;
  const breakdown = Object.fromEntries(Object.entries(rawScores).map(([k, v]) => [k, Math.round(v * weights[k] / totalWeight * 10) / 10]));
  const confidence = calcConfidence(rawScores);
  const signals = [...trend.signals, ...mom.signals, ...vola.signals, ...vol.signals, ...pos.signals, ...osc.signals, ...vwap.signals];
  let grade, gradeColor, gradeBg, gradeEmoji;
  if (score >= 50) { grade = '강력매수'; gradeColor = 'text-red-700'; gradeBg = 'bg-red-50 border-red-300'; gradeEmoji = '🔥'; }
  else if (score >= 20) { grade = '매수고려'; gradeColor = 'text-red-500'; gradeBg = 'bg-red-50 border-red-200'; gradeEmoji = '📈'; }
  else if (score >= -20) { grade = '관망'; gradeColor = 'text-gray-500'; gradeBg = 'bg-gray-50 border-gray-200'; gradeEmoji = '➡️'; }
  else if (score >= -50) { grade = '매도주의'; gradeColor = 'text-blue-500'; gradeBg = 'bg-blue-50 border-blue-200'; gradeEmoji = '📉'; }
  else { grade = '강력주의'; gradeColor = 'text-blue-700'; gradeBg = 'bg-blue-50 border-blue-300'; gradeEmoji = '❄️'; }
  return {
    score, grade, gradeColor, gradeBg, gradeEmoji, confidence, signals, breakdown, rawScores, weights,
    rsi: osc.rsi, zScore: pos.zScore, momentum: mom.momentum, vwapDiff: vwap.vwapDiff,
    ma20: trend.ma20, ma60: trend.ma60, currentPrice, bollinger: vola.bollinger,
    position52: pos.position52, volume, macd: trend.macd, obv, atr, adx,
  };
}

// ╔══════════════════════════════════════════════════════════
// ║ 5. 분석 근거 생성 (원본 유지)
// ╚══════════════════════════════════════════════════════════

function generateReason(stock) {
  const reasons = [];
  const { rsi, momentum, score, bollinger, position52, volume, macd, obv, atr, adx, ma20, ma60, currentPrice, confidence } = stock;
  if (score >= 50 && confidence >= 70) reasons.push('주요 퀀트 지표가 강한 매수 신호로 일치하고 있어요. 추세·모멘텀·위치가 모두 정렬된 보기 드문 상태예요');
  else if (score >= 20 && confidence >= 60) reasons.push('주요 지표가 매수 신호 우위에 있어요. 진입을 검토할 만한 타이밍이에요');
  else if (score <= -50 && confidence >= 70) reasons.push('여러 지표가 동시에 강한 위험 신호를 보내고 있어요. 매수보다 관망이나 손절을 고려하세요');
  else if (score <= -20 && confidence >= 60) reasons.push('주요 지표가 약세 신호 우위에 있어요. 추가 하락 가능성을 염두에 두세요');
  else if (confidence < 50) reasons.push('지표들이 서로 엇갈리고 있어 방향성이 불분명해요. 명확한 신호가 나올 때까지 기다리는 게 좋아요');
  if (adx) {
    if (adx.adx > 30 && adx.direction > 0) reasons.push(`ADX ${adx.adx.toFixed(0)}으로 강한 상승 추세가 형성됐어요. 추세 추종 전략이 유효한 구간이에요`);
    else if (adx.adx > 30 && adx.direction < 0) reasons.push(`ADX ${adx.adx.toFixed(0)}으로 강한 하락 추세가 형성됐어요. 반등 시도는 위험할 수 있어요`);
    else if (adx.adx < 20) reasons.push('ADX가 낮아 추세 없이 횡보하는 구간이에요. 박스권 매매나 평균회귀 전략이 유효해요');
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
  if (volume && volume.ratio > 3) reasons.push(`거래량이 평소 대비 ${volume.ratio.toFixed(1)}배 폭증했어요. 강한 매수세나 중요한 변화가 있다는 신호예요`);
  else if (volume && volume.ratio > 2) reasons.push(`거래량이 평소 대비 ${volume.ratio.toFixed(1)}배 증가했어요. 시장 관심이 높아진 종목이에요`);
  if (rsi < 30) reasons.push(`RSI가 ${rsi.toFixed(1)}로 극도로 낮아요. 과매도 영역이라 단기 반등 가능성이 높아요`);
  else if (rsi > 70) reasons.push(`RSI가 ${rsi.toFixed(1)}로 매우 높아요. 단기 과열로 잠시 조정 가능성이 있어요`);
  if (macd) {
    if (macd.histogram > 0 && macd.trend > 0) reasons.push('MACD 히스토그램이 양수이며 더 커지고 있어요. 상승 모멘텀이 강해지는 흐름이에요');
    else if (macd.histogram < 0 && macd.trend < 0) reasons.push('MACD 히스토그램이 음수이며 더 깊어지고 있어요. 하락 모멘텀이 강화되는 중이에요');
  }
  if (ma20 && ma60 && currentPrice) {
    if (currentPrice > ma20 && currentPrice > ma60 && ma20 > ma60) reasons.push('20일·60일 이동평균이 모두 현재가 아래에 있는 정배열 상태예요. 꾸준한 상승 추세가 유지되고 있어요');
    else if (currentPrice < ma20 && currentPrice < ma60 && ma20 < ma60) reasons.push('20일·60일 이동평균이 모두 현재가 위에 있는 역배열 상태예요. 하락 추세가 강하다는 신호예요');
  }
  if (obv && obv.divergence !== 0) {
    if (obv.divergence > 0) reasons.push('가격은 떨어졌지만 거래량(OBV)은 오히려 올라가는 강세 다이버전스가 나타나요. 매집이 진행 중일 가능성이 있어요');
    else reasons.push('가격은 올랐지만 거래량(OBV)은 약해지는 약세 다이버전스예요. 상승 동력이 약화되는 신호일 수 있어요');
  }
  if (momentum > 15) reasons.push(`최근 1~3개월 동안 ${momentum.toFixed(1)}% 상승했어요. 강한 상승 흐름이 이어지고 있어요`);
  else if (momentum < -15) reasons.push(`최근 1~3개월 동안 ${Math.abs(momentum).toFixed(1)}% 하락했어요. 하락 흐름이 상당히 강해요`);
  if (atr && atr.atrPercent > 5) reasons.push(`일평균 변동성(ATR)이 ${atr.atrPercent.toFixed(1)}%로 큰 종목이에요. 손익 폭이 커서 분할 매매를 고려하세요`);
  return reasons.slice(0, 3);
}

// ╔══════════════════════════════════════════════════════════
// ║ 6. 디자인 상수
// ╚══════════════════════════════════════════════════════════

const C = {
  bg:        '#F8FAFC',
  surface:   '#F1F5F9',
  card:      '#FFFFFF',
  cardHover: '#F8FAFC',
  border:    '#E5E7EB',
  borderHi:  '#D1D5DB',
  rise:      '#DC2626',
  riseDim:   'rgba(220,38,38,0.08)',
  fall:      '#2563EB',
  fallDim:   'rgba(37,99,235,0.08)',
  neutral:   '#64748B',
  neutralDim:'rgba(100,116,139,0.08)',
  gold:      '#D97706',
  accent:    '#4F46E5',
  accentDim: 'rgba(79,70,229,0.1)',
  green:     '#059669',
  t1:        '#111827',
  t2:        '#6B7280',
  t3:        '#9CA3AF',
};

// 등급별 스타일 맵
const GRADE_STYLE = {
  '강력매수': { color: C.rise,    dim: C.riseDim,    label: 'STRONG BUY',  icon: '🔥' },
  '매수고려': { color: '#FF8C42', dim: 'rgba(255,140,66,0.15)', label: 'BUY',   icon: '📈' },
  '관망':     { color: C.neutral, dim: C.neutralDim, label: 'NEUTRAL',     icon: '➡️' },
  '매도주의': { color: C.fall,    dim: C.fallDim,    label: 'CAUTION',     icon: '📉' },
  '강력주의': { color: '#2563EB', dim: 'rgba(37,99,235,0.2)', label: 'STRONG CAUTION', icon: '❄️' },
};

const SCAN_TYPES = [
  { key: 'volume', label: '거래량', icon: '📊' },
  { key: 'amount', label: '거래대금', icon: '💰' },
  { key: 'marcap', label: '시가총액', icon: '🏢' },
  { key: 'rise', label: '상승률', icon: '🚀' },
  { key: 'fall', label: '하락률', icon: '📉' },
];

const SCAN_COUNT = 100;
const BATCH_SIZE = 10;

// ╔══════════════════════════════════════════════════════════
// ║ 7. UI 서브 컴포넌트
// ╚══════════════════════════════════════════════════════════

/* ── Score Arc Gauge ── */
function ScoreArc({ score, size = 80, delay = 0 }) {
  const r = 30;
  const cx = size / 2;
  const cy = size / 2 - 2;
  const circumference = Math.PI * r;
  const normalized = Math.max(0, Math.min(1, (score + 100) / 200));
  const dash = normalized * circumference;
  const gs = GRADE_STYLE;
  let color = C.neutral;
  if (score >= 50) color = C.rise;
  else if (score >= 20) color = '#FF8C42';
  else if (score >= -20) color = C.neutral;
  else if (score >= -50) color = C.fall;
  else color = '#2563EB';

  return (
    <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`} style={{ overflow: 'visible' }}>
      {/* Track */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={C.border} strokeWidth="7" strokeLinecap="round"
      />
      {/* Glow */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
        style={{ filter: `drop-shadow(0 0 6px ${color}80)`, opacity: 0.3 }}
      />
      {/* Main fill */}
      <motion.path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
        initial={{ strokeDasharray: `0 ${circumference}` }}
        animate={{ strokeDasharray: `${dash} ${circumference}` }}
        transition={{ duration: 1.2, ease: [0.34, 1.56, 0.64, 1], delay }}
      />
      {/* Score number */}
      <text x={cx} y={cy + 2} textAnchor="middle" fill={color}
        fontSize="14" fontWeight="800" fontFamily="'DM Mono', monospace" letterSpacing="-0.5">
        {score > 0 ? '+' : ''}{score}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill={C.t3}
        fontSize="8" fontWeight="600" fontFamily="system-ui" letterSpacing="1">
        SCORE
      </text>
    </svg>
  );
}

/* ── Metric Bar ── */
function MetricBar({ label, value, maxValue = 100, positive = true }) {
  const pct = Math.min(100, (Math.abs(value) / maxValue) * 100);
  const color = positive ? C.rise : C.fall;
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color, fontFamily: "'DM Mono', monospace" }}>
          {value > 0 ? '+' : ''}{typeof value === 'number' ? value.toFixed(1) : value}
        </span>
      </div>
      <div style={{ height: 3, background: C.surface, borderRadius: 99, overflow: 'hidden' }}>
        <motion.div
          style={{ height: '100%', borderRadius: 99, background: color }}
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.8, ease: 'easeOut', delay: 0.2 }}
        />
      </div>
    </div>
  );
}

/* ── Category Breakdown Pill ── */
function BreakdownGrid({ breakdown }) {
  const CATS = [
    { key: 'trend', label: '추세' },
    { key: 'mom',   label: '모멘' },
    { key: 'vol',   label: '거래' },
    { key: 'pos',   label: '위치' },
    { key: 'vola',  label: '변동' },
    { key: 'osc',   label: '진동' },
    { key: 'vwap',  label: 'VWAP' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gap: 4 }}>
      {CATS.map(({ key, label }) => {
        const val = breakdown?.[key] || 0;
        const isPos = val > 0;
        const isNeg = val < 0;
        const color = isPos ? C.rise : isNeg ? C.fall : C.neutral;
        const bg = isPos ? C.riseDim : isNeg ? C.fallDim : '#F3F4F6';
        return (
          <div key={key} style={{ background: bg, borderRadius: 8, padding: '6px 2px', textAlign: 'center', border: `1px solid ${isPos ? 'rgba(255,59,92,0.2)' : isNeg ? 'rgba(59,130,246,0.2)' : 'transparent'}` }}>
            <div style={{ fontSize: 9, color: C.t3, marginBottom: 2, fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 11, fontWeight: 800, color, fontFamily: "'DM Mono', monospace" }}>
              {val > 0 ? '+' : ''}{val.toFixed(1)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Metric Tag ── */
function MetricTag({ label, good, tooltip }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <motion.button
        onClick={() => setShow(s => !s)}
        whileTap={{ scale: 0.94 }}
        style={{
          fontSize: 10, fontWeight: 700,
          padding: '3px 9px', borderRadius: 99,
          background: good ? C.riseDim : C.fallDim,
          color: good ? C.rise : C.fall,
          border: `1px solid ${good ? 'rgba(220,38,38,0.25)' : 'rgba(37,99,235,0.25)'}`,
          cursor: 'pointer',
          fontFamily: "'DM Mono', monospace",
          letterSpacing: '0.2px',
        }}
      >
        {label}
      </motion.button>
      <AnimatePresence>
        {show && tooltip && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            style={{
              position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
              background: C.card, border: `1px solid ${C.borderHi}`,
              borderRadius: 8, padding: '6px 10px', fontSize: 10, color: C.t2,
              whiteSpace: 'nowrap', zIndex: 50,
              boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
            }}
          >
            {tooltip}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Scanning Skeleton ── */
function ScanSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          style={{ background: C.card, borderRadius: 20, padding: 20, border: `1px solid ${C.border}` }}
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: C.surface }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 14, width: '60%', background: C.surface, borderRadius: 6, marginBottom: 8 }} />
              <div style={{ height: 10, width: '40%', background: '#EFF1F5', borderRadius: 6 }} />
            </div>
          </div>
          <div style={{ height: 8, background: C.surface, borderRadius: 99 }} />
        </motion.div>
      ))}
    </div>
  );
}

/* ── Progress Ring ── */
function ProgressRing({ progress }) {
  const r = 24;
  const circumference = 2 * Math.PI * r;
  const dash = (progress / 100) * circumference;
  return (
    <svg width={60} height={60} viewBox="0 0 60 60" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={30} cy={30} r={r} fill="none" stroke={C.border} strokeWidth={5} />
      <motion.circle
        cx={30} cy={30} r={r} fill="none"
        stroke={C.accent} strokeWidth={5} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 8px ${C.accent}80)` }}
        animate={{ strokeDasharray: `${dash} ${circumference}` }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
      <text
        x={30} y={30}
        textAnchor="middle" dominantBaseline="middle"
        fill={C.t1} fontSize={11} fontWeight={800}
        style={{ transform: 'rotate(90deg)', transformOrigin: '30px 30px' }}
        fontFamily="'DM Mono', monospace"
      >
        {progress}%
      </text>
    </svg>
  );
}

// ╔══════════════════════════════════════════════════════════
// ║ 8. 메인 컴포넌트
// ╚══════════════════════════════════════════════════════════

const SORT_OPTIONS = [
  { value: 'score',      label: '퀀트점수 순' },
  { value: 'confidence', label: '신뢰도 순' },
  { value: 'rsi',        label: 'RSI 낮은 순' },
  { value: 'volume',     label: '거래량 순' },
  { value: 'change',     label: '등락률 순' },
];

const GRADE_FILTERS = [
  { key: 'all',           label: '전체',    emoji: '◉' },
  { key: 'strong_buy',    label: '강력매수', emoji: '🔥' },
  { key: 'buy',           label: '매수고려', emoji: '📈' },
  { key: 'watch',         label: '관망',    emoji: '➡️' },
  { key: 'caution',       label: '매도주의', emoji: '📉' },
  { key: 'strong_caution',label: '강력주의', emoji: '❄️' },
];

export default function ScannerPage() {
  const { user } = useAuth();
  const { favorites, toggleFavorite, isFavorite } = useFavorites();
  const { addToast } = useToast();
  const router = useRouter();

  const [scanning,          setScanning]          = useState(false);
  const [results,           setResults]           = useState([]);
  const [filter,            setFilter]            = useState('all');
  const [scanType,          setScanType]          = useState('volume');
  const [progress,          setProgress]          = useState(0);
  const [scannedAt,         setScannedAt]         = useState(null);
  const [expandedId,        setExpandedId]        = useState(null);
  const [sortBy,            setSortBy]            = useState('score');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showSortMenu,      setShowSortMenu]      = useState(false);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    try {
      const saved     = localStorage.getItem('scanner_results');
      const savedAt   = localStorage.getItem('scanner_scannedAt');
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
    setExpandedId(null);

    try {
      const topRes  = await fetch(`/api/top?type=${scanType}`);
      const topData = await topRes.json();
      const stocks  = (topData.stocks || []).slice(0, SCAN_COUNT);

      const scanResults = [];
      for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
        const batch = stocks.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (stock) => {
            try {
              const chartRes  = await fetch(`/api/stock?symbol=${stock.code}&timeframe=daily`);
              const chartData = await chartRes.json();
              if (!chartData.chartData || chartData.chartData.length < 30) return null;
              const quant      = calcQuantScore(chartData.chartData);
              const reasonList = generateReason({ ...quant, currentPrice: chartData.currentPrice });
              return {
                code: stock.code, name: stock.name,
                price: chartData.currentPrice || 0,
                change: chartData.change || 0,
                changePercent: chartData.changePercent || 0,
                reasons: reasonList,
                ...quant,
              };
            } catch (e) { console.error(`${stock.name} 스캔 실패:`, e.message); return null; }
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

  const getFilteredResults = () => {
    let filtered = results;
    switch (filter) {
      case 'strong_buy':    filtered = filtered.filter(r => r.score >= 50); break;
      case 'buy':           filtered = filtered.filter(r => r.score >= 20 && r.score < 50); break;
      case 'watch':         filtered = filtered.filter(r => r.score >= -20 && r.score < 20); break;
      case 'caution':       filtered = filtered.filter(r => r.score >= -50 && r.score < -20); break;
      case 'strong_caution':filtered = filtered.filter(r => r.score < -50); break;
    }
    if (showFavoritesOnly) filtered = filtered.filter(r => isFavorite(r.code));
    filtered.sort((a, b) => {
      if (sortBy === 'score')      return b.score - a.score;
      if (sortBy === 'confidence') return (b.confidence || 0) - (a.confidence || 0);
      if (sortBy === 'rsi')        return a.rsi - b.rsi;
      if (sortBy === 'volume')     return (b.volume?.ratio || 0) - (a.volume?.ratio || 0);
      if (sortBy === 'change')     return Math.abs(b.changePercent) - Math.abs(a.changePercent);
      return 0;
    });
    return filtered;
  };

  const filtered    = getFilteredResults();
  const gradeCounts = {
    strong_buy:    results.filter(r => r.score >= 50).length,
    buy:           results.filter(r => r.score >= 20 && r.score < 50).length,
    watch:         results.filter(r => r.score >= -20 && r.score < 20).length,
    caution:       results.filter(r => r.score >= -50 && r.score < -20).length,
    strong_caution:results.filter(r => r.score < -50).length,
  };
  const currentSortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label || '정렬';

  return (
    <div style={{ background: C.bg, minHeight: '100vh', paddingBottom: 100 }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700&family=DM+Mono:wght@500;700&display=swap');
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { display: none; }
        body { background: ${C.bg}; }
        .scanner-page * { font-family: 'DM Sans', -apple-system, sans-serif; }
      `}</style>

      <div className="scanner-page" style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>

        {/* ══ Sticky Header ══ */}
        <div style={{
          position: 'sticky', top: 0, zIndex: 40,
          background: `${C.bg}E6`,
          backdropFilter: 'blur(20px)',
          WebkitBackdropFilter: 'blur(20px)',
          padding: '20px 0 12px',
          borderBottom: `1px solid ${C.border}`,
          marginBottom: 20,
        }}>
          <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}>
            <div>
              <div style={{
                fontFamily: 'Syne, sans-serif',
                fontSize: 24, fontWeight: 800,
                color: C.t1, letterSpacing: '-0.8px', lineHeight: 1.1,
              }}>
                퀀트 스캐너
                <span style={{
                  display: 'inline-block', marginLeft: 8,
                  fontSize: 11, fontWeight: 700, color: C.accent,
                  background: C.accentDim,
                  padding: '2px 7px', borderRadius: 6,
                  letterSpacing: '0.5px',
                  verticalAlign: 'middle',
                  fontFamily: "'DM Mono', monospace",
                }}>v3</span>
              </div>
              <div style={{ fontSize: 12, color: C.t3, marginTop: 4, fontWeight: 500 }}>
                ADX 컨텍스트 기반 다중 지표 분석
              </div>
            </div>
            {scannedAt && (
              <div style={{ fontSize: 11, color: C.t3, textAlign: 'right', fontFamily: "'DM Mono', monospace" }}>
                <div style={{ color: C.green, fontSize: 9, fontWeight: 700, letterSpacing: 1, marginBottom: 2 }}>LAST SCAN</div>
                {scannedAt}
              </div>
            )}
          </div>
        </div>

        {/* ══ Scan Config ══ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{
            background: C.card,
            borderRadius: 24,
            border: `1px solid ${C.border}`,
            padding: 20,
            marginBottom: 16,
            boxShadow: '0 8px 32px rgba(0,0,0,0.06)',
          }}
        >
          <div style={{ fontSize: 11, color: C.t3, fontWeight: 700, letterSpacing: '1px', marginBottom: 12, textTransform: 'uppercase' }}>
            스캔 대상 · {SCAN_COUNT}종목
          </div>

          {/* Scan Type Pills */}
          <div style={{ display: 'flex', gap: 8, marginBottom: 18, overflowX: 'auto' }}>
            {SCAN_TYPES.map(t => {
              const active = scanType === t.key;
              return (
                <motion.button
                  key={t.key}
                  onClick={() => !scanning && setScanType(t.key)}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    flexShrink: 0,
                    padding: '8px 14px',
                    borderRadius: 12,
                    border: `1px solid ${active ? C.accent : C.border}`,
                    background: active ? C.accentDim : 'transparent',
                    color: active ? C.accent : C.t2,
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <span>{t.icon}</span>
                  <span>{t.label}</span>
                </motion.button>
              );
            })}
          </div>

          {/* Scan Button */}
          <motion.button
            onClick={startScan}
            disabled={scanning}
            whileTap={{ scale: scanning ? 1 : 0.97 }}
            style={{
              width: '100%', padding: '16px',
              borderRadius: 16, border: 'none',
              background: scanning
                ? C.surface
                : 'linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)',
              color: scanning ? C.t2 : '#fff',
              fontSize: 15, fontWeight: 800,
              cursor: scanning ? 'not-allowed' : 'pointer',
              letterSpacing: '-0.3px',
              boxShadow: scanning ? 'none' : '0 4px 20px rgba(99,102,241,0.4)',
              transition: 'all 0.2s',
            }}
          >
            {scanning ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <ProgressRing progress={progress} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>분석 중...</div>
                  <div style={{ fontSize: 11, color: C.t3, fontFamily: "'DM Mono', monospace" }}>
                    {results.length}개 완료
                  </div>
                </div>
              </div>
            ) : (
              <span>{results.length > 0 ? '🔄 재스캔' : '🚀 퀀트 스캔 시작'}</span>
            )}
          </motion.button>

          {/* Progress Bar */}
          {scanning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ marginTop: 14 }}
            >
              <div style={{ height: 2, background: C.surface, borderRadius: 99, overflow: 'hidden' }}>
                <motion.div
                  style={{ height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${C.accent}, #8B5CF6)` }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* ══ Results ══ */}
        <AnimatePresence>
          {results.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Summary Cards */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                style={{
                  background: C.card,
                  borderRadius: 20,
                  border: `1px solid ${C.border}`,
                  padding: '16px 14px',
                  marginBottom: 14,
                  boxShadow: '0 4px 20px rgba(0,0,0,0.05)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>
                    스캔 결과 <span style={{ color: C.accent, fontFamily: "'DM Mono', monospace" }}>{results.length}</span>종목
                  </span>
                  <span style={{ fontSize: 10, color: C.t3, fontFamily: "'DM Mono', monospace" }}>{scannedAt}</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>
                  {[
                    { key: 'strong_buy',    emoji: '🔥', label: '강매수', color: C.rise },
                    { key: 'buy',           emoji: '📈', label: '매수',   color: '#FF8C42' },
                    { key: 'watch',         emoji: '➡️', label: '관망',   color: C.neutral },
                    { key: 'caution',       emoji: '📉', label: '주의',   color: C.fall },
                    { key: 'strong_caution',emoji: '❄️', label: '강주의', color: '#2563EB' },
                  ].map(({ key, emoji, label, color }) => (
                    <motion.button
                      key={key}
                      onClick={() => setFilter(filter === key ? 'all' : key)}
                      whileTap={{ scale: 0.93 }}
                      style={{
                        background: filter === key ? `${color}15` : '#F9FAFB',
                        borderRadius: 12, padding: '10px 4px', textAlign: 'center',
                        border: `1px solid ${filter === key ? `${color}40` : C.border}`,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ fontSize: 16, lineHeight: 1 }}>{emoji}</div>
                      <motion.div
                        key={gradeCounts[key]}
                        initial={{ scale: 1.3, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        style={{ fontSize: 18, fontWeight: 900, color, marginTop: 4, fontFamily: "'DM Mono', monospace", lineHeight: 1 }}
                      >
                        {gradeCounts[key]}
                      </motion.div>
                      <div style={{ fontSize: 9, color: C.t3, marginTop: 3, fontWeight: 600 }}>{label}</div>
                    </motion.button>
                  ))}
                </div>
              </motion.div>

              {/* Filter + Sort Row */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
                {/* Sort button */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <motion.button
                    onClick={() => setShowSortMenu(s => !s)}
                    whileTap={{ scale: 0.95 }}
                    style={{
                      padding: '8px 12px', borderRadius: 12,
                      background: C.card, border: `1px solid ${C.borderHi}`,
                      color: C.t1, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 5,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ fontSize: 14 }}>⇅</span>
                    <span style={{ maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentSortLabel}</span>
                  </motion.button>
                  <AnimatePresence>
                    {showSortMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.96 }}
                        style={{
                          position: 'absolute', top: '110%', left: 0, zIndex: 50,
                          background: C.card, border: `1px solid ${C.borderHi}`,
                          borderRadius: 14, padding: 6, minWidth: 160,
                          boxShadow: '0 16px 48px rgba(0,0,0,0.1)',
                        }}
                      >
                        {SORT_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => { setSortBy(opt.value); setShowSortMenu(false); }}
                            style={{
                              width: '100%', textAlign: 'left',
                              padding: '9px 12px', borderRadius: 10, border: 'none',
                              background: sortBy === opt.value ? C.accentDim : 'transparent',
                              color: sortBy === opt.value ? C.accent : C.t2,
                              fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Favorites toggle */}
                <motion.button
                  onClick={() => setShowFavoritesOnly(s => !s)}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    flexShrink: 0,
                    padding: '8px 12px', borderRadius: 12,
                    background: showFavoritesOnly ? 'rgba(245,158,11,0.15)' : C.card,
                    border: `1px solid ${showFavoritesOnly ? 'rgba(245,158,11,0.4)' : C.borderHi}`,
                    color: showFavoritesOnly ? C.gold : C.t2,
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  ⭐ {favorites.length}
                </motion.button>

                {/* Filter pills (scrollable) */}
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1 }}>
                  {GRADE_FILTERS.map(f => {
                    const count = f.key === 'all' ? results.length : gradeCounts[f.key];
                    const active = filter === f.key;
                    return (
                      <motion.button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        whileTap={{ scale: 0.93 }}
                        style={{
                          flexShrink: 0,
                          padding: '7px 11px', borderRadius: 10, border: 'none',
                          background: active ? C.accent : C.surface,
                          color: active ? '#fff' : C.t2,
                          fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4,
                          boxShadow: active ? `0 4px 14px ${C.accent}50` : 'none',
                          transition: 'all 0.2s',
                        }}
                      >
                        <span style={{ fontSize: 12 }}>{f.emoji}</span>
                        <span style={{
                          background: active ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                          borderRadius: 6, padding: '0 4px', fontSize: 10,
                          fontFamily: "'DM Mono', monospace",
                        }}>{count}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Stock Cards */}
              {scanning && results.length < 5 ? (
                <ScanSkeleton />
              ) : filtered.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{ textAlign: 'center', padding: '60px 0' }}
                >
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.t2, marginBottom: 6 }}>
                    {showFavoritesOnly ? '관심 종목이 없어요' : '해당 조건의 종목 없음'}
                  </div>
                  <div style={{ fontSize: 12, color: C.t3 }}>필터를 변경해보세요</div>
                </motion.div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {filtered.map((stock, idx) => (
                    <StockCard
                      key={stock.code}
                      stock={stock}
                      idx={idx}
                      expanded={expandedId === stock.code}
                      onToggle={() => setExpandedId(expandedId === stock.code ? null : stock.code)}
                      isFav={isFavorite(stock.code)}
                      onFav={() => {
                        toggleFavorite({ code: stock.code, name: stock.name });
                        addToast(isFavorite(stock.code) ? '관심종목 해제' : '⭐ 관심종목 추가', 'success');
                      }}
                      onChart={() => router.push(`/?stock=${stock.code}&name=${encodeURIComponent(stock.name)}`)}
                      onFinancial={() => router.push(`/financial?query=${stock.name}`)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══ Empty State ══ */}
        {!scanning && results.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div style={{ textAlign: 'center', padding: '40px 0 32px' }}>
              <div style={{
                width: 80, height: 80,
                background: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(79,70,229,0.1) 100%)',
                borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px', fontSize: 36,
                border: '1px solid rgba(99,102,241,0.2)',
              }}>🔍</div>
              <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 800, color: C.t1, marginBottom: 8 }}>
                스캔 준비 완료
              </div>
              <div style={{ fontSize: 13, color: C.t3, lineHeight: 1.6, marginBottom: 32 }}>
                최대 100개 종목을 7가지 지표로<br />실시간 분석합니다
              </div>
            </div>

            {/* Indicator Info Cards */}
            <div style={{
              background: C.card, borderRadius: 20,
              border: `1px solid ${C.border}`, overflow: 'hidden',
            }}>
              <div style={{ padding: '16px 18px 10px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.t1, letterSpacing: '-0.2px' }}>
                  📐 분석 지표 구성
                </div>
              </div>
              {[
                { icon: '📈', label: '추세', weight: '25%', desc: 'MA 정배열 + MACD + ADX 강도', color: '#818CF8' },
                { icon: '🚀', label: '모멘텀', weight: '20%', desc: '거래량 가중 1~3개월 가격 변화', color: '#34D399' },
                { icon: '📊', label: '거래량', weight: '15%', desc: '거래량 비율 + OBV (변동성 정규화)', color: '#F472B6' },
                { icon: '🎯', label: '위치', weight: '15%', desc: 'Z-Score + 52주 위치', color: '#FB923C' },
                { icon: '📉', label: '변동성', weight: '10%', desc: '볼린저밴드 + ATR', color: '#60A5FA' },
                { icon: '⚡', label: '진동', weight: '10%', desc: "RSI (Wilder's 방식)", color: '#A78BFA' },
                { icon: '🏦', label: 'VWAP', weight: '5%', desc: '거래량 가중 평균가 대비', color: '#FBBF24' },
              ].map(({ icon, label, weight, desc, color }, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 18px',
                    borderBottom: i < 6 ? `1px solid ${C.border}` : 'none',
                  }}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                    background: `${color}18`, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 18,
                  }}>{icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{label}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 800, color,
                        background: `${color}18`, padding: '1px 6px', borderRadius: 6,
                        fontFamily: "'DM Mono', monospace",
                      }}>{weight}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.t3, lineHeight: 1.4 }}>{desc}</div>
                  </div>
                </motion.div>
              ))}
              <div style={{ padding: '12px 18px', background: 'rgba(99,102,241,0.08)', borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 11, color: C.accent, fontWeight: 600, lineHeight: 1.5 }}>
                  ★ ADX 30↑ → 추세 가중치 증가 / ADX 18↓ → 평균회귀 가중치 증가
                </div>
              </div>
            </div>
          </motion.div>
        )}
      </div>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════
// ║ 9. 종목 카드 컴포넌트
// ╚══════════════════════════════════════════════════════════

function StockCard({ stock, idx, expanded, onToggle, isFav, onFav, onChart, onFinancial }) {
  const gs       = GRADE_STYLE[stock.grade] || GRADE_STYLE['관망'];
  const isRise   = (stock.changePercent || 0) >= 0;
  const priceColor = isRise ? C.rise : C.fall;

  const metricTags = [
    { label: `RSI ${(stock.rsi || 0).toFixed(0)}`,   good: (stock.rsi || 0) < 50,  tooltip: `RSI: ${(stock.rsi||0).toFixed(1)} — 30이하 과매도 / 70이상 과매수` },
    { label: `Z ${(stock.zScore || 0).toFixed(1)}`,   good: (stock.zScore || 0) < 0, tooltip: 'Z-Score: -2이하 통계적 저점 / +2이상 통계적 고점' },
    { label: `Mom ${(stock.momentum || 0) > 0 ? '+' : ''}${(stock.momentum || 0).toFixed(0)}%`, good: (stock.momentum || 0) > 0, tooltip: '1~3개월 거래량 가중 모멘텀' },
    ...(stock.bollinger ? [{ label: `%B ${((stock.bollinger.percentB || 0) * 100).toFixed(0)}`, good: (stock.bollinger.percentB || 0) < 0.5, tooltip: '볼린저밴드 상대 위치 (0~100)' }] : []),
    ...(stock.position52 !== null && stock.position52 !== undefined ? [{ label: `52W ${((stock.position52 || 0) * 100).toFixed(0)}%`, good: (stock.position52 || 0) < 0.5, tooltip: '52주 가격 범위 내 현재 위치' }] : []),
    ...(stock.volume ? [{ label: `Vol ${(stock.volume.ratio || 0).toFixed(1)}x`, good: (stock.volume.ratio || 0) > 1.2, tooltip: '20일 평균 대비 현재 거래량 배수' }] : []),
    ...(stock.atr ? [{ label: `ATR ${(stock.atr.atrPercent || 0).toFixed(1)}%`, good: (stock.atr.atrPercent || 0) < 4, tooltip: '일평균 변동성 퍼센트' }] : []),
  ].filter(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: Math.min(idx * 0.04, 0.3) }}
      layout
      style={{
        background: C.card,
        borderRadius: 22,
        border: `1px solid ${expanded ? gs.color + '30' : C.border}`,
        overflow: 'hidden',
        boxShadow: expanded
          ? `0 8px 32px rgba(0,0,0,0.08), 0 0 0 1px ${gs.color}20`
          : '0 2px 12px rgba(0,0,0,0.04)',
        transition: 'box-shadow 0.3s, border-color 0.3s',
      }}
    >
      {/* ── Card Body ── */}
      <div style={{ padding: '18px 18px 14px' }}>

        {/* Row 1: Name + Price */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>

          {/* Score Arc */}
          <div style={{ flexShrink: 0 }}>
            <ScoreArc score={stock.score} size={76} delay={idx * 0.04} />
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: C.t1, letterSpacing: '-0.3px' }}>
                {stock.name}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: '0.8px',
                color: gs.color, background: gs.dim,
                padding: '2px 7px', borderRadius: 6,
                border: `1px solid ${gs.color}30`,
              }}>{gs.label}</span>
              {/* ADX badge */}
              {stock.adx && (
                <span style={{
                  fontSize: 9, fontWeight: 700,
                  color: stock.adx.adx > 30 ? (stock.adx.direction > 0 ? C.rise : C.fall) : C.t3,
                  background: '#F3F4F6',
                  padding: '2px 6px', borderRadius: 6,
                  border: `1px solid ${C.border}`,
                  fontFamily: "'DM Mono', monospace",
                }}>
                  ADX {stock.adx.adx.toFixed(0)}
                </span>
              )}
            </div>

            <div style={{ fontSize: 10, color: C.t3, marginBottom: 8, fontFamily: "'DM Mono', monospace" }}>
              {stock.code}
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: C.t1, fontFamily: "'DM Mono', monospace", letterSpacing: '-0.5px' }}>
                {(stock.price || 0).toLocaleString()}원
              </span>
              <span style={{
                fontSize: 12, fontWeight: 700, color: priceColor,
                fontFamily: "'DM Mono', monospace",
              }}>
                {isRise ? '+' : ''}{(stock.changePercent || 0).toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Fav button */}
          <motion.button
            onClick={onFav}
            whileTap={{ scale: 0.8 }}
            animate={{ scale: isFav ? [1, 1.3, 1] : 1 }}
            transition={{ duration: 0.3 }}
            style={{
              flexShrink: 0, width: 36, height: 36, borderRadius: 10,
              background: isFav ? 'rgba(217,119,6,0.1)' : '#F3F4F6',
              border: `1px solid ${isFav ? 'rgba(245,158,11,0.4)' : C.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 16,
            }}
          >
            {isFav ? '⭐' : '☆'}
          </motion.button>
        </div>

        {/* Row 2: Quant Score Bar */}
        <MetricBar
          label="퀀트점수"
          value={stock.score}
          maxValue={100}
          positive={stock.score >= 0}
        />
        {/* Row 3: Confidence Bar */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>신뢰도</span>
            <span style={{
              fontSize: 11, fontWeight: 800, fontFamily: "'DM Mono', monospace",
              color: (stock.confidence || 0) >= 70 ? C.green : (stock.confidence || 0) >= 50 ? C.gold : C.t3,
            }}>
              {stock.confidence}%
            </span>
          </div>
          <div style={{ height: 3, background: C.surface, borderRadius: 99, overflow: 'hidden' }}>
            <motion.div
              style={{
                height: '100%', borderRadius: 99,
                background: (stock.confidence || 0) >= 70 ? C.green : (stock.confidence || 0) >= 50 ? C.gold : C.neutral,
              }}
              initial={{ width: 0 }}
              animate={{ width: `${stock.confidence}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
            />
          </div>
        </div>

        {/* Row 4: Breakdown Grid */}
        <div style={{ marginBottom: 14 }}>
          <BreakdownGrid breakdown={stock.breakdown} />
        </div>

        {/* Row 5: Analysis Reasons */}
        {stock.reasons && stock.reasons.length > 0 && (
          <div style={{
            background: '#F8FAFC', borderRadius: 14,
            padding: '12px 14px', marginBottom: 14,
            border: `1px solid ${C.border}`,
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.t2, marginBottom: 10, letterSpacing: '0.3px' }}>
              💡 AI 분석 근거
            </div>
            {stock.reasons.map((reason, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: i < stock.reasons.length - 1 ? 8 : 0 }}>
                <span style={{
                  flexShrink: 0, width: 18, height: 18, borderRadius: 6,
                  background: gs.dim, color: gs.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 900, fontFamily: "'DM Mono', monospace",
                }}>{i + 1}</span>
                <span style={{ fontSize: 12, color: C.t2, lineHeight: 1.55 }}>{reason}</span>
              </div>
            ))}
          </div>
        )}

        {/* Row 6: Metric Tags */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
          {metricTags.map(({ label, good, tooltip }, j) => (
            <MetricTag key={j} label={label} good={good} tooltip={tooltip} />
          ))}
        </div>

        {/* Row 7: Expand Toggle */}
        <motion.button
          onClick={onToggle}
          whileTap={{ scale: 0.97 }}
          style={{
            width: '100%', padding: '9px', borderRadius: 10, border: `1px solid ${C.border}`,
            background: '#F8FAFC', color: C.t3, fontSize: 11, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}
        >
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.25 }}
            style={{ display: 'inline-block', fontSize: 12 }}
          >▼</motion.span>
          {expanded ? '신호 닫기' : `세부 신호 ${stock.signals?.length || 0}개 보기`}
        </motion.button>
      </div>

      {/* ── Expanded Signal List ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '0 18px 16px',
              borderTop: `1px solid ${C.border}`,
            }}>
              <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(stock.signals || []).map((sig, j) => {
                  const sigColor = sig.type === 'bullish' ? C.rise : sig.type === 'bearish' ? C.fall : C.neutral;
                  return (
                    <motion.div
                      key={j}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: j * 0.03 }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', borderRadius: 10,
                        background: `${sigColor}08`,
                        border: `1px solid ${sigColor}18`,
                      }}
                    >
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: sigColor, flexShrink: 0,
                        boxShadow: `0 0 6px ${sigColor}`,
                      }} />
                      <span style={{ fontSize: 12, color: C.t2, fontWeight: 500 }}>{sig.label}</span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Action Buttons ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: `1px solid ${C.border}` }}>
        <motion.button
          onClick={onChart}
          whileTap={{ scale: 0.97 }}
          style={{
            padding: '14px 0', border: 'none', borderRight: `1px solid ${C.border}`,
            background: 'transparent', color: C.accent, fontSize: 12, fontWeight: 800,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = C.accentDim}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          📈 차트
        </motion.button>
        <motion.button
          onClick={onFinancial}
          whileTap={{ scale: 0.97 }}
          style={{
            padding: '14px 0', border: 'none',
            background: 'transparent', color: '#A78BFA', fontSize: 12, fontWeight: 800,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(167,139,250,0.08)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          📊 재무
        </motion.button>
      </div>
    </motion.div>
  );
}