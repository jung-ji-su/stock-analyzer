import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

// RSI 계산
function calculateRSI(prices, period = 14) {
  if (prices.length < period + 1) return null;
  
  let gains = 0;
  let losses = 0;
  
  for (let i = 1; i <= period; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) gains += change;
    else losses += Math.abs(change);
  }
  
  let avgGain = gains / period;
  let avgLoss = losses / period;
  
  for (let i = period + 1; i < prices.length; i++) {
    const change = prices[i] - prices[i - 1];
    if (change > 0) {
      avgGain = (avgGain * (period - 1) + change) / period;
      avgLoss = (avgLoss * (period - 1)) / period;
    } else {
      avgGain = (avgGain * (period - 1)) / period;
      avgLoss = (avgLoss * (period - 1) + Math.abs(change)) / period;
    }
  }
  
  const rs = avgGain / avgLoss;
  const rsi = 100 - (100 / (1 + rs));
  
  return {
    value: rsi.toFixed(2),
    signal: rsi > 70 ? '과매수' : rsi < 30 ? '과매도' : '중립'
  };
}

// MACD 계산
function calculateMACD(prices, fast = 12, slow = 26, signal = 9) {
  if (prices.length < slow) return null;
  
  const ema = (data, period) => {
    const k = 2 / (period + 1);
    let emaValue = data[0];
    for (let i = 1; i < data.length; i++) {
      emaValue = data[i] * k + emaValue * (1 - k);
    }
    return emaValue;
  };
  
  const ema12 = ema(prices.slice(-fast), fast);
  const ema26 = ema(prices.slice(-slow), slow);
  const macdLine = ema12 - ema26;
  
  return {
    value: macdLine.toFixed(2),
    signal: macdLine > 0 ? '골든크로스' : '데드크로스'
  };
}

// 볼린저밴드 계산
function calculateBollingerBands(prices, period = 20, stdDev = 2) {
  if (prices.length < period) return null;
  
  const recentPrices = prices.slice(-period);
  const sma = recentPrices.reduce((a, b) => a + b, 0) / period;
  const variance = recentPrices.reduce((sum, price) => sum + Math.pow(price - sma, 2), 0) / period;
  const std = Math.sqrt(variance);
  
  const upper = sma + (std * stdDev);
  const lower = sma - (std * stdDev);
  const current = prices[prices.length - 1];
  
  let position = '중앙';
  if (current >= upper) position = '상단 돌파';
  else if (current <= lower) position = '하단 돌파';
  
  return {
    upper: upper.toFixed(0),
    middle: sma.toFixed(0),
    lower: lower.toFixed(0),
    position
  };
}

// 지지선/저항선 계산
function calculateSupportResistance(prices) {
  if (prices.length < 20) return null;
  
  const recentPrices = prices.slice(-60);
  const sorted = [...recentPrices].sort((a, b) => a - b);
  
  // 지지선: 최근 60일 중 하위 20%
  const supportIndex = Math.floor(sorted.length * 0.2);
  const support = sorted[supportIndex];
  
  // 저항선: 최근 60일 중 상위 20%
  const resistanceIndex = Math.floor(sorted.length * 0.8);
  const resistance = sorted[resistanceIndex];
  
  const current = prices[prices.length - 1];
  
  return {
    support: support.toFixed(0),
    resistance: resistance.toFixed(0),
    current: current.toFixed(0),
    distance: {
      toSupport: ((current - support) / support * 100).toFixed(2),
      toResistance: ((resistance - current) / current * 100).toFixed(2)
    }
  };
}

// ATR (변동성) 계산
function calculateATR(highs, lows, closes, period = 14) {
  if (highs.length < period + 1) return null;
  
  const trueRanges = [];
  for (let i = 1; i < highs.length; i++) {
    const tr = Math.max(
      highs[i] - lows[i],
      Math.abs(highs[i] - closes[i - 1]),
      Math.abs(lows[i] - closes[i - 1])
    );
    trueRanges.push(tr);
  }
  
  const atr = trueRanges.slice(-period).reduce((a, b) => a + b, 0) / period;
  
  return {
    value: atr.toFixed(0),
    volatility: atr / closes[closes.length - 1] > 0.05 ? '높음' : '보통'
  };
}

// 이동평균선 계산
function calculateMovingAverages(prices) {
  const ma5 = prices.slice(-5).reduce((a, b) => a + b, 0) / 5;
  const ma20 = prices.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const ma60 = prices.slice(-60).reduce((a, b) => a + b, 0) / 60;
  const current = prices[prices.length - 1];
  
  return {
    ma5: ma5.toFixed(0),
    ma20: ma20.toFixed(0),
    ma60: ma60.toFixed(0),
    alignment: current > ma5 && ma5 > ma20 && ma20 > ma60 ? '정배열' : '역배열'
  };
}

// 거래량 분석
function analyzeVolume(volumes) {
  const recent = volumes.slice(-5);
  const average = volumes.slice(-20).reduce((a, b) => a + b, 0) / 20;
  const currentVol = recent[recent.length - 1];
  const change = ((currentVol - average) / average * 100).toFixed(0);
  
  return {
    current: currentVol,
    average: average.toFixed(0),
    change: `${change >= 0 ? '+' : ''}${change}%`,
    signal: Math.abs(change) > 100 ? '급증' : Math.abs(change) > 50 ? '증가' : '보통'
  };
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    
    if (!symbol) {
      return NextResponse.json({ error: 'symbol required' }, { status: 400 });
    }

    console.log(`📊 기술적 지표 계산: ${symbol}`);

    // Yahoo Finance에서 90일 데이터 가져오기
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);
    
    const result = await YahooFinance.chart(symbol, {
      period1: startDate,
      period2: endDate,
      interval: '1d'
    });

    if (!result || !result.quotes || result.quotes.length === 0) {
      throw new Error('데이터 없음');
    }

    const quotes = result.quotes;
    const closes = quotes.map(q => q.close).filter(c => c !== null);
    const highs = quotes.map(q => q.high).filter(h => h !== null);
    const lows = quotes.map(q => q.low).filter(l => l !== null);
    const volumes = quotes.map(q => q.volume).filter(v => v !== null);

    // 모든 지표 계산
    const indicators = {
      rsi: calculateRSI(closes),
      macd: calculateMACD(closes),
      bollingerBands: calculateBollingerBands(closes),
      supportResistance: calculateSupportResistance(closes),
      atr: calculateATR(highs, lows, closes),
      movingAverages: calculateMovingAverages(closes),
      volume: analyzeVolume(volumes),
      currentPrice: closes[closes.length - 1].toFixed(0),
    };

    console.log(`✅ 지표 계산 완료:`, indicators);

    return NextResponse.json({
      success: true,
      symbol,
      indicators,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ 기술적 지표 계산 오류:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message 
      },
      { status: 500 }
    );
  }
}