import YahooFinance from 'yahoo-finance2';
import { getKRXTodayCandle } from '@/lib/krx-cache';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export const revalidate = 0;
export const dynamic = 'force-dynamic';

// Naver 모바일 JSON API로 현재가 + 한글명 조회 (HTML 스크래핑 불필요)
async function getNaverBasicInfo(symbol) {
    try {
        const res = await fetch(
            `https://m.stock.naver.com/api/stock/${symbol}/basic`,
            { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://m.stock.naver.com', 'Accept': 'application/json' } }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const d = await res.json();
        const p = (s) => parseFloat((s || '0').replace(/,/g, '')) || 0;
        return {
            currentPrice: p(d.closePrice),
            change: p(d.compareToPreviousClosePrice),
            changePercent: p(d.fluctuationsRatio),
            nameKr: d.stockName || d.stockNameEng || '',
        };
    } catch (e) {
        console.error('Naver basic info failed:', e.message);
        return null;
    }
}

export async function GET(request) {
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    const timeframe = searchParams.get('timeframe') || 'daily';

    if (!symbol) {
        return Response.json({ error: '종목 코드가 없습니다' }, { status: 400 });
    }

    try {
        const endDate = new Date();
        const startDate = new Date();
        let interval = '1d';

        switch (timeframe) {
            case 'minute':  startDate.setDate(startDate.getDate() - 5);        interval = '60m'; break;
            case 'daily':   startDate.setFullYear(startDate.getFullYear() - 2); interval = '1d';  break;
            case 'weekly':  startDate.setFullYear(startDate.getFullYear() - 5); interval = '1wk'; break;
            case 'monthly': startDate.setFullYear(startDate.getFullYear() - 10);interval = '1mo'; break;
            case 'yearly':  startDate.setFullYear(startDate.getFullYear() - 20);interval = '1mo'; break;
            default:        startDate.setMonth(startDate.getMonth() - 6);       interval = '1d';
        }

        const indexMap = { 'KS11': '^KS11', 'KQ11': '^KQ11', 'KS200': '^KS200', 'SPX': '^GSPC', 'IXIC': '^IXIC', 'DJI': '^DJI' };
        const isIndex = !!indexMap[symbol];
        // 미국 티커(영문 1~5자)는 그대로, 국내 6자리 코드는 .KS 를 붙인다
        const isUs = !isIndex && /^[A-Z]{1,5}([.-][A-Z])?$/.test(symbol);
        const koreanSymbol = indexMap[symbol] || (isUs ? symbol.replace('.', '-') : symbol.includes('.') ? symbol : `${symbol}.KS`);

        // 야후 chart() + 네이버 현재가 동시 요청
        const [chartResult, naverData] = await Promise.all([
            yahooFinance.chart(koreanSymbol, { period1: startDate, period2: endDate, interval }),
            isIndex || isUs ? null : getNaverBasicInfo(symbol),
        ]);

        const historical = chartResult?.quotes || [];
        if (!historical.length) {
            return Response.json({ error: '데이터를 찾을 수 없습니다' }, { status: 404 });
        }

        // 야후 quote: 당일 OHLCV + 지수 현재가 fallback (실패해도 chart 데이터 유지)
        let quote = {};
        try {
          quote = await yahooFinance.quote(koreanSymbol) || {};
        } catch (quoteErr) {
          console.error('quote() 실패, chart 데이터만 사용:', quoteErr.message);
        }

        const rp = (v) => (isUs ? Math.round(v * 100) / 100 : Math.round(v)); // 미국은 센트 단위 유지
        const currentPrice = (naverData?.currentPrice > 0 ? naverData.currentPrice : null)
            || rp(quote.regularMarketPrice || 0);
        const change = naverData?.change ?? rp(quote.regularMarketChange || 0);
        const changePercent = naverData?.changePercent ?? (quote.regularMarketChangePercent || 0);
        const nameKr = naverData?.nameKr || '';

        let chartData = historical
            .filter(item => item.date && item.open && item.high && item.low && item.close)
            .map((item) => ({
                time: item.date.toISOString().split('T')[0],
                open: rp(item.open),
                high: rp(item.high),
                low: rp(item.low),
                close: rp(item.close),
                volume: item.volume ?? 0,
            }));

        // 년봉: 월봉 데이터를 연 단위로 집계
        if (timeframe === 'yearly') {
            const yearMap = {};
            chartData.forEach((d) => {
                const year = d.time.slice(0, 4);
                if (!yearMap[year]) {
                    yearMap[year] = { time: `${year}-01-01`, open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume };
                } else {
                    yearMap[year].high = Math.max(yearMap[year].high, d.high);
                    yearMap[year].low = Math.min(yearMap[year].low, d.low);
                    yearMap[year].close = d.close;
                    yearMap[year].volume += d.volume;
                }
            });
            chartData = Object.values(yearMap).sort((a, b) => a.time.localeCompare(b.time));
        }

        // 당일 캔들 추가 (일봉만)
        // 미국 종목은 야후 일봉에 당일 봉이 이미 있고 날짜 기준도 달라서 건너뛴다
        if (timeframe === 'daily' && currentPrice > 0 && !isUs) {
            const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
            const todayStr = `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, '0')}-${String(kst.getDate()).padStart(2, '0')}`;
            const lastCandleDate = chartData[chartData.length - 1]?.time;

            if (lastCandleDate !== todayStr) {
                const prevClose = chartData[chartData.length - 1]?.close || currentPrice;

                // 장 종료 후라면 KRX 확정 OHLCV 사용, 장중이면 Yahoo quote 사용
                const krxCandle = isIndex || isUs ? null : await getKRXTodayCandle(symbol);

                chartData.push({
                    time: todayStr,
                    open: krxCandle?.open   || Math.round(quote.regularMarketOpen    || prevClose),
                    high: krxCandle?.high   || Math.round(quote.regularMarketDayHigh || currentPrice),
                    low:  krxCandle?.low    || Math.round(quote.regularMarketDayLow  || currentPrice),
                    close: krxCandle?.close || currentPrice,
                    volume: krxCandle?.volume ?? (quote.regularMarketVolume || 0),
                });
            }
        }

        return Response.json({
            name: quote.longName || quote.shortName || symbol,
            nameKr,
            currentPrice,
            change,
            changePercent,
            chartData,
        });

    } catch (error) {
        return Response.json({ error: '데이터 조회 실패: ' + error.message }, { status: 500 });
    }
}
