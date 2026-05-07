import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

export const revalidate = 0;
export const dynamic = 'force-dynamic';

// 네이버 금융에서 현재가 + 당일 OHLC 가져오기
async function getNaverStockData(symbol) {
    try {
        const res = await fetch(
            `https://finance.naver.com/item/main.naver?code=${symbol}`,
            {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
                    'Referer': 'https://finance.naver.com',
                    'Accept-Language': 'ko-KR,ko;q=0.9',
                },
            }
        );
        const buffer = await res.arrayBuffer();
        const decoder = new TextDecoder('euc-kr', { fatal: false, ignoreBOM: true });
        const html = decoder.decode(new Uint8Array(buffer));
        const { load } = await import('cheerio');
        const $ = load(html);

        // 현재가
        const currentPriceStr = $('.no_today .blind').first().text().trim().replace(/,/g, '');
        const currentPrice = parseInt(currentPriceStr) || 0;

        // 전일대비 등락 - 부호 확인 추가
        const changeElement = $('.no_exday');
        const changeStr = changeElement.find('.blind').first().text().trim().replace(/,/g, '');
        let change = parseInt(changeStr) || 0;
        
        // 하락이면 음수로 변환
        const isDown = changeElement.find('.no_down').length > 0 || 
                       changeElement.hasClass('no_down') ||
                       changeElement.find('em.no_down').length > 0;
        if (isDown && change > 0) {
            change = -change;
        }

        // 등락률 - 여러 방법으로 시도
        let changePercent = 0;
        changeElement.find('em').each((i, el) => {
            const text = $(el).text().trim().replace(/[%,+]/g, '');
            const val = parseFloat(text);
            if (!isNaN(val) && val !== 0) changePercent = val;
        });
        
        // 하락이면 음수로 변환
        if (isDown && changePercent > 0) {
            changePercent = -changePercent;
        }
        
        // 그래도 0이면 change/previousClose로 직접 계산
        if (changePercent === 0 && change !== 0) {
            const prevPrice = currentPrice - change;
            if (prevPrice > 0) changePercent = parseFloat(((change / prevPrice) * 100).toFixed(2));
        }

        // 시가/고가/저가/거래량
        let open = 0, high = 0, low = 0, volume = 0;
        $('table.no_info tr td').each((i, el) => {
            const label = $(el).find('span.tit').text().trim();
            const valueStr = $(el).find('span.blind').text().trim().replace(/,/g, '');
            const value = parseInt(valueStr) || 0;
            if (label === '시가') open = value;
            if (label === '고가') high = value;
            if (label === '저가') low = value;
            if (label === '거래량') volume = value;
        });

        // 네이버 금융 JSON API로 한글명 가져오기
        let nameKr = '';
        try {
            const nameRes = await fetch(
                `https://m.stock.naver.com/api/stock/${symbol}/basic`,
                { headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://m.stock.naver.com' } }
            );
            const nameJson = await nameRes.json();
            nameKr = nameJson.stockName || nameJson.name || '';
            console.log('한글명:', nameKr);
        } catch (e) {
            console.log('한글명 가져오기 실패:', e.message);
        }

        console.log('네이버 현재가:', currentPrice, '변화:', change, '변화율:', changePercent);

        return { currentPrice, change, changePercent, open, high, low, volume, nameKr };
    } catch (e) {
        console.error('네이버 크롤링 실패:', e.message);
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
                interval = '1mo';
                break;
            default:
                startDate.setMonth(startDate.getMonth() - 6);
                interval = '1d';
        }

        const indexMap = { 'KS11': '^KS11', 'KQ11': '^KQ11', 'KS200': '^KS200' };
        const isIndex = !!indexMap[symbol];
        const koreanSymbol = indexMap[symbol] || (symbol.includes('.') ? symbol : `${symbol}.KS`);

        // 야후 히스토리컬 + 네이버 현재가 동시 요청
        const [historical, naverData] = await Promise.all([
            yahooFinance.historical(koreanSymbol, {
                period1: startDate,
                period2: endDate,
                interval,
            }),
            isIndex ? null : getNaverStockData(symbol),
        ]);

        if (!historical || historical.length === 0) {
            return Response.json({ error: '데이터를 찾을 수 없습니다' }, { status: 404 });
        }

        // 야후 quote (지수용 또는 네이버 실패 fallback)
        const quote = await yahooFinance.quote(koreanSymbol);

        // 현재가: 네이버 우선, 실패시 야후
        const currentPrice = (naverData?.currentPrice > 0 ? naverData.currentPrice : null)
            || Math.round(quote.regularMarketPrice || 0);
        const change = naverData?.change ?? Math.round(quote.regularMarketChange || 0);
        const changePercent = naverData?.changePercent ?? (quote.regularMarketChangePercent || 0);
        const nameKr = naverData?.nameKr || '';

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

        // 오늘 캔들 추가 (일봉만)
        if (timeframe === 'daily' && currentPrice > 0) {
            const kst = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Seoul' }));
            const todayStr = `${kst.getFullYear()}-${String(kst.getMonth() + 1).padStart(2, '0')}-${String(kst.getDate()).padStart(2, '0')}`;
            const lastCandleDate = chartData[chartData.length - 1]?.time;

            if (lastCandleDate !== todayStr) {
                const prevClose = chartData[chartData.length - 1]?.close || currentPrice;
                const todayOpen = (naverData?.open > 0 ? naverData.open : null) || prevClose;
                const todayHigh = (naverData?.high > 0 ? naverData.high : null) || Math.max(todayOpen, currentPrice);
                const todayLow = (naverData?.low > 0 ? naverData.low : null) || Math.min(todayOpen, currentPrice);
                const todayVolume = naverData?.volume || 0;

                chartData.push({
                    time: todayStr,
                    open: todayOpen,
                    high: todayHigh,
                    low: todayLow,
                    close: currentPrice,
                    volume: todayVolume,
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