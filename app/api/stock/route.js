import YahooFinance from 'yahoo-finance2';
const yahooFinance = new YahooFinance();

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');
  const period = searchParams.get('period') || '1y';

  if (!symbol) {
    return Response.json({ error: '종목 코드가 없습니다' }, { status: 400 });
  }

  try {
    const endDate = new Date();
    const startDate = new Date();

    if (period === '3y') startDate.setFullYear(startDate.getFullYear() - 3);
    else if (period === '1y') startDate.setFullYear(startDate.getFullYear() - 1);
    else if (period === '6m') startDate.setMonth(startDate.getMonth() - 6);

    const koreanSymbol = symbol.includes('.') ? symbol : `${symbol}.KS`;

    const [historical, quote] = await Promise.all([
      yahooFinance.historical(koreanSymbol, {
        period1: startDate,
        period2: endDate,
        interval: '1d',
      }),
      yahooFinance.quote(koreanSymbol),
    ]);

    if (!historical || historical.length === 0) {
      return Response.json({ error: '데이터를 찾을 수 없습니다' }, { status: 404 });
    }

    const chartData = historical.map((item) => ({
      time: item.date.toISOString().split('T')[0],
      open: Math.round(item.open),
      high: Math.round(item.high),
      low: Math.round(item.low),
      close: Math.round(item.close),
      volume: item.volume,
    }));

    return Response.json({
      symbol: koreanSymbol,
      name: quote.longName || quote.shortName || symbol,
      currentPrice: quote.regularMarketPrice,
      change: quote.regularMarketChange,
      changePercent: quote.regularMarketChangePercent,
      chartData,
    });
  } catch (error) {
    return Response.json({ error: '데이터 조회 실패: ' + error.message }, { status: 500 });
  }
}