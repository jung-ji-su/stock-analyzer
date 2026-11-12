// 시장 지수 (서버 전용): 현재가·등락 + 최근 일봉 종가(미니 차트용). 데이터는 야후 파이낸스.
import YahooFinance from 'yahoo-finance2';

const yahooFinance = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

export const INDICES = [
  { key: 'KOSPI', label: 'KOSPI', yahoo: '^KS11', stockSymbol: 'KS11', market: 'KR' },
  { key: 'KOSDAQ', label: 'KOSDAQ', yahoo: '^KQ11', stockSymbol: 'KQ11', market: 'KR' },
  { key: 'SPX', label: 'S&P 500', yahoo: '^GSPC', stockSymbol: 'SPX', market: 'US' },
  { key: 'IXIC', label: 'NASDAQ', yahoo: '^IXIC', stockSymbol: 'IXIC', market: 'US' },
  { key: 'DJI', label: 'DOW', yahoo: '^DJI', stockSymbol: 'DJI', market: 'US' },
];

const r2 = (n) => Math.round(n * 100) / 100;

async function fetchOne(idx) {
  const start = new Date(Date.now() - 45 * 24 * 3600e3);
  const [quote, chart] = await Promise.all([
    yahooFinance.quote(idx.yahoo),
    yahooFinance.chart(idx.yahoo, { period1: start, period2: new Date(), interval: '1d' }).catch(() => null),
  ]);
  const price = quote?.regularMarketPrice;
  if (!(price > 0)) throw new Error(`${idx.key} 시세 없음`);
  const spark = (chart?.quotes || []).map((q) => q.close).filter((v) => v > 0).slice(-30);
  return {
    key: idx.key, label: idx.label, market: idx.market, stockSymbol: idx.stockSymbol,
    price: r2(price), change: r2(quote.regularMarketChange || 0), changePercent: r2(quote.regularMarketChangePercent || 0),
    spark,
  };
}

// 일부 지수가 실패해도 나머지는 돌려준다
export async function fetchIndices(keys) {
  const list = keys ? INDICES.filter((i) => keys.includes(i.key)) : INDICES;
  const res = await Promise.allSettled(list.map(fetchOne));
  return res.map((r, i) => {
    if (r.status === 'fulfilled') return r.value;
    console.error('지수 조회 실패:', list[i].key, r.reason?.message);
    return null;
  }).filter(Boolean);
}
