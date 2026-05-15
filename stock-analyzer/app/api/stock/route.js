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

        const indexMap = { 'KS11': '^KS11', 'KQ11': '^KQ11', 'KS200': '^KS200' };
        const isIndex = !!indexMap[symbol];
        const koreanSymbol = indexMap[symbol] || (symbol.includes('.') ? symbol : `${symbol}.KS`);

        // 야후 chart() + 네이버 현재가 동시 요청
        const [chartResult, naverData] = await Promise.all([
            yahooFinance.chart(koreanSymbol, { period1: startDate, period2: endDate, interval }),
            isIndex ? null : getNaverBasicInfo(symbol),
        ]);

        const historical = chartResult?.quotes || [];
        if (!historical.length) {
            return Response.json({ error: '데이터를 찾을 수 없습니다' }, { status: 404 });
        }

        // 야후 quote: 당일 OHLCV + 지수 현재가 fallback
        const quote = await yahooFinance.quote(koreanSymbol);

        const currentPrice = (naverData?.currentPrice > 0 ? naverData.currentPrice : null)
            || Math.round(quote.regularMarketPrice || 0);
        const change = naverData?.change ?? Math.round(quote.regularMarketChange || 0);
        const changePercent = naverData?.changePercent ?? (quote.regularMarketChangePercent || 0);
        const nameKr = naverData?.nameKr || '';

        let chartData = historical
            .filter(item => item.open && item.high && item.low && item.close)
            .map((item) => ({
                time: item.date.toISOString().split('T')[0],
                open: Math.round(item.open),
                high: Math.round(item.high),
                low: Math.round(item.low),
                close: Math.round(item.close),
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
        if (timeframe === 'daily' && currentPrice > 0) {
            const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
            const todayStr = `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, '0')}-${String(kst.getDate()).padStart(2, '0')}`;
            const lastCandleDate = chartData[chartData.length - 1]?.time;

            if (lastCandleDate !== todayStr) {
                const prevClose = chartData[chartData.length - 1]?.close || currentPrice;

                // 장 종료 후라면 KRX 확정 OHLCV 사용, 장중이면 Yahoo quote 사용
                const krxCandle = isIndex ? null : await getKRXTodayCandle(symbol);

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
