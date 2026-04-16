
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;

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

export async function POST(request) {
    try {
        const { chartData, stockName, symbol } = await request.json();

        if (!chartData || chartData.length < 10) {
            return Response.json({ error: '데이터가 부족합니다' }, { status: 400 });
        }

        // 추가로 월봉 5년치 데이터 가져오기
        let monthlyData = [];
        try {
            const endDate = new Date();
            const startDate = new Date();
            startDate.setFullYear(startDate.getFullYear() - 5);

            const koreanSymbol = symbol.includes('.') ? symbol : `${symbol}.KS`;
            const YahooFinance = (await import('yahoo-finance2')).default;
            const yahooFinance = new YahooFinance();

            const monthly = await yahooFinance.historical(koreanSymbol, {
                period1: startDate,
                period2: endDate,
                interval: '1mo',
            });

            monthlyData = monthly.map((item) => ({
                time: item.date.toISOString().split('T')[0],
                open: Math.round(item.open),
                high: Math.round(item.high),
                low: Math.round(item.low),
                close: Math.round(item.close),
                volume: item.volume,
            }));
        } catch {
            monthlyData = [];
        }

        const closes = chartData.map(d => d.close);
        const volumes = chartData.map(d => d.volume);
        const recent = chartData.slice(-60);
        const recentCloses = closes.slice(-60);

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
            recentPrices: recentCloses.slice(-10),
        };

        const monthlyCloses = monthlyData.map(d => d.close);
        const monthlyMA12 = calcSMA(monthlyCloses, 12).filter(v => v !== null).slice(-1)[0];
        const monthlyMA24 = calcSMA(monthlyCloses, 24).filter(v => v !== null).slice(-1)[0];
        const monthlyRSI = calcRSI(monthlyCloses).filter(v => v !== null).slice(-1)[0];
        const monthlyHigh = monthlyData.length > 0 ? Math.max(...monthlyData.slice(-24).map(d => d.high)) : 0;
        const monthlyLow = monthlyData.length > 0 ? Math.min(...monthlyData.slice(-24).map(d => d.low)) : 0;
        const recentMonthly = monthlyData.slice(-12).map(d => `${d.time.slice(0, 7)}: ${d.close.toLocaleString()}원`).join(', ');

        const prompt = `
당신은 전문 주식 기술적 분석가입니다. 아래 단기/장기 데이터를 모두 바탕으로 ${stockName}(${symbol}) 주식을 분석해주세요.

## 현재 지표
- 현재가: ${indicators.currentPrice.toLocaleString()}원
- RSI(14): ${indicators.rsi} ${indicators.rsi > 70 ? '(과매수)' : indicators.rsi < 30 ? '(과매도)' : '(중립)'}
- MACD: ${indicators.macd} / Signal: ${indicators.macdSignal} / Histogram: ${indicators.macdHistogram}
- 볼린저밴드: 상단 ${indicators.bbUpper.toLocaleString()} / 중단 ${indicators.bbMiddle.toLocaleString()} / 하단 ${indicators.bbLower.toLocaleString()}
- 이동평균: MA20 ${indicators.ma20.toLocaleString()} / MA60 ${indicators.ma60.toLocaleString()}
- 거래량 비율: 평균 대비 ${indicators.volumeRatio}배

## 장기 지표 (월봉 5년치)
- 월봉 MA12: ${monthlyMA12 ? Math.round(monthlyMA12).toLocaleString() : 'N/A'}원
- 월봉 MA24: ${monthlyMA24 ? Math.round(monthlyMA24).toLocaleString() : 'N/A'}원
- 월봉 RSI: ${monthlyRSI ? Math.round(monthlyRSI * 10) / 10 : 'N/A'}
- 2년 최고가: ${monthlyHigh.toLocaleString()}원
- 2년 최저가: ${monthlyLow.toLocaleString()}원
- 최근 12개월 종가: ${recentMonthly}

## 주요 매물대 (거래량 집중 구간)
${indicators.volumeProfile.map((p, i) => `${i + 1}. ${p.priceFrom.toLocaleString()}~${p.priceTo.toLocaleString()}원 (강도: ${p.strength}%)`).join('\n')}

## 최근 10일 종가
${indicators.recentPrices.map((p, i) => `${i + 1}일전: ${p.toLocaleString()}원`).reverse().join(', ')}

위 데이터를 분석하여 아래 JSON 형식으로만 응답해주세요. JSON 외 다른 텍스트는 절대 포함하지 마세요:
{
  "daily": {
    "prediction": "상승" 또는 "하락" 또는 "횡보",
    "confidence": 0~100 사이 숫자,
    "targetPrice": 예상 가격 숫자,
    "reason": "핵심 근거 2~3줄 한국어",
    "easyReason": "주식 초보자도 이해할 수 있게 쉬운 말로 2~3줄 설명 (전문용어 없이)"
  },
  "weekly": {
    "prediction": "상승" 또는 "하락" 또는 "횡보",
    "confidence": 0~100 사이 숫자,
    "targetPrice": 예상 가격 숫자,
    "reason": "핵심 근거 2~3줄 한국어",
    "easyReason": "주식 초보자도 이해할 수 있게 쉬운 말로 2~3줄 설명 (전문용어 없이)"
  },
  "monthly": {
    "prediction": "상승" 또는 "하락" 또는 "횡보",
    "confidence": 0~100 사이 숫자,
    "targetPrice": 예상 가격 숫자,
    "reason": "핵심 근거 2~3줄 한국어",
    "easyReason": "주식 초보자도 이해할 수 있게 쉬운 말로 2~3줄 설명 (전문용어 없이)"
  },
  "summary": "전체 종합 분석 3~4줄 한국어",
  "easySummary": "주식을 전혀 모르는 사람도 이해할 수 있게 쉽고 친근한 말투로 3~4줄 설명. 비유나 예시 활용",
  "keyPoints": ["핵심포인트1", "핵심포인트2", "핵심포인트3"],
  "indicatorComments": {
    "rsi": "RSI 값에 대한 AI 한줄 맥락 설명 (쉬운말로)",
    "macd": "MACD 값에 대한 AI 한줄 맥락 설명 (쉬운말로)",
    "bb": "볼린저밴드 위치에 대한 AI 한줄 맥락 설명 (쉬운말로)",
    "ma": "이동평균선 배열에 대한 AI 한줄 맥락 설명 (쉬운말로)",
    "volume": "거래량에 대한 AI 한줄 맥락 설명 (쉬운말로)",
    "volumeProfile": "매물대 위치에 대한 AI 한줄 맥락 설명 (쉬운말로)"
  }
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
        console.log('OpenRouter 응답:', JSON.stringify(result));
        const text = result.choices[0].message.content;
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            return Response.json({ error: 'AI 응답 파싱 실패' }, { status: 500 });
        }

        const analysis = JSON.parse(jsonMatch[0]);
        return Response.json({ analysis, indicators });
    } catch (error) {
        return Response.json({ error: '분석 실패: ' + error.message }, { status: 500 });
    }
}