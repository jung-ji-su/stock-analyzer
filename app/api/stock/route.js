import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

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
            case 'minute':
                startDate.setDate(startDate.getDate() - 5);
                interval = '60m';
                break;
            case 'daily':
                startDate.setFullYear(startDate.getFullYear() - 2);
                interval = '1d';
                break;
            case 'weekly':
                startDate.setFullYear(startDate.getFullYear() - 5);
                interval = '1wk';
                break;
            case 'monthly':
                startDate.setFullYear(startDate.getFullYear() - 10);
                interval = '1mo';
                break;
            case 'yearly':
                startDate.setFullYear(startDate.getFullYear() - 20);
                interval = '1mo'; // 년봉은 월봉 데이터로 연단위 집계
                break;
            default:
                startDate.setMonth(startDate.getMonth() - 6);
                interval = '1d';
        }

        const koreanSymbol = symbol.includes('.') ? symbol : `${symbol}.KS`;

        const [historical, quote] = await Promise.all([
            yahooFinance.historical(koreanSymbol, {
                period1: startDate,
                period2: endDate,
                interval,
            }),
            yahooFinance.quote(koreanSymbol),
        ]);

        if (!historical || historical.length === 0) {
            return Response.json({ error: '데이터를 찾을 수 없습니다' }, { status: 404 });
        }

        let chartData = historical.map((item) => ({
            time: item.date.toISOString().split('T')[0],
            open: Math.round(item.open),
            high: Math.round(item.high),
            low: Math.round(item.low),
            close: Math.round(item.close),
            volume: item.volume,
        }));

        // 년봉: 월봉 데이터를 연단위로 집계
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

        return Response.json({
            symbol: koreanSymbol,
            name: quote?.longName || quote?.shortName || symbol,
            currentPrice: quote?.regularMarketPrice ?? 0,
            change: quote?.regularMarketChange ?? 0,
            changePercent: quote?.regularMarketChangePercent ?? 0,
            chartData,
            timeframe,
        });
    } catch (error) {
        return Response.json({ error: '데이터 조회 실패: ' + error.message }, { status: 500 });
    }
}