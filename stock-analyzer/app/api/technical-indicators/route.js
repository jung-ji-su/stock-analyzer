import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

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

    const supportIndex = Math.floor(sorted.length * 0.2);
    const support = sorted[supportIndex];

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
    const startTime = Date.now();

    try {
        const { searchParams } = new URL(request.url);
        const symbol = searchParams.get('symbol');

        if (!symbol) {
            return NextResponse.json({ error: 'symbol required' }, { status: 400 });
        }

        console.log(`\n📊 기술적 지표 계산 시작: ${symbol}`);

        // 한국 종목 코드에 .KS suffix 추가 (Yahoo Finance 필수)
        const yahooSymbol = symbol.includes('.') ? symbol : `${symbol}.KS`;
        console.log(`  🔄 변환: ${symbol} → ${yahooSymbol}`);

        // Yahoo Finance에서 90일 데이터 가져오기
        const endDate = new Date();
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - 90);

        console.log(`  📅 기간: ${startDate.toISOString().split('T')[0]} ~ ${endDate.toISOString().split('T')[0]}`);
        console.log(`  🌐 Yahoo Finance API 호출 중...`);

        let result;
        try {
            result = await yahooFinance.chart(yahooSymbol, {
                period1: startDate,
                period2: endDate,
                interval: '1d'
            });
            console.log(`  ✅ API 호출 성공 (${Date.now() - startTime}ms)`);
        } catch (apiError) {
            console.error(`  ❌ Yahoo Finance API 호출 실패:`, apiError.message);
            throw new Error(`Yahoo Finance API 오류: ${apiError.message}`);
        }

        if (!result) {
            console.error(`  ❌ 응답 없음`);
            throw new Error('Yahoo Finance 응답 없음');
        }

        if (!result.quotes || result.quotes.length === 0) {
            console.error(`  ❌ 데이터 없음 (quotes 비어있음)`);
            throw new Error('데이터 없음 (quotes 비어있음)');
        }

        console.log(`  📈 데이터 수신: ${result.quotes.length}개 데이터포인트`);

        const quotes = result.quotes;
        const closes = quotes.map(q => q.close).filter(c => c !== null && c !== undefined);
        const highs = quotes.map(q => q.high).filter(h => h !== null && h !== undefined);
        const lows = quotes.map(q => q.low).filter(l => l !== null && l !== undefined);
        const volumes = quotes.map(q => q.volume).filter(v => v !== null && v !== undefined);

        console.log(`  🔢 유효 데이터: close=${closes.length}, high=${highs.length}, low=${lows.length}, volume=${volumes.length}`);

        if (closes.length < 50) {
            console.error(`  ❌ 데이터 부족 (최소 50개 필요, 현재 ${closes.length}개)`);
            throw new Error(`데이터 부족 (${closes.length}개, 최소 50개 필요)`);
        }

        // 모든 지표 계산
        console.log(`  🧮 지표 계산 중...`);
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

        console.log(`  ✅ 지표 계산 완료 (총 ${Date.now() - startTime}ms)`);
        console.log(`     현재가: ${indicators.currentPrice}원, RSI: ${indicators.rsi?.value}`);

        return NextResponse.json({
            success: true,
            symbol,
            indicators,
            timestamp: new Date().toISOString(),
        });

    } catch (error) {
        console.error(`\n❌ 기술적 지표 계산 오류 (${Date.now() - startTime}ms):`, {
            message: error.message,
            stack: error.stack?.split('\n').slice(0, 3).join('\n')
        });

        return NextResponse.json(
            {
                success: false,
                error: error.message,
                details: error.stack?.split('\n')[0]
            },
            { status: 500 }
        );
    }
}