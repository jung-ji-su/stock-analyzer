// 수익자 비율 화면용: 5년치 일봉 + 주식 수 (야후, 로그인 없이). 계산은 브라우저에서 lib/holderProfit.js 로 한다.
import YahooFinance from 'yahoo-finance2';
import { fetchKrDailyBars } from '@/lib/yahooDaily';
import { fetchNaverBasic } from '@/lib/naver';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
const YEARS = 5;

export const revalidate = 0;

async function quoteShares(symbols) {
  for (const s of symbols) {
    try {
      const q = await yf.quote(s);
      const shares = q?.sharesOutstanding || (q?.marketCap && q?.regularMarketPrice ? q.marketCap / q.regularMarketPrice : null);
      if (q) return { shares: shares > 0 ? Math.round(shares) : null, name: q.longName || q.shortName || '' };
    } catch { /* 다음 시장 */ }
  }
  return { shares: null, name: '' };
}

export async function GET(request) {
  const symbol = new URL(request.url).searchParams.get('symbol') || '';
  const kr = /^[0-9A-Z]{6}$/.test(symbol) && /\d/.test(symbol);
  const us = !kr && /^[A-Z]{1,5}([.-][A-Z])?$/.test(symbol);
  if (!kr && !us) return Response.json({ error: '종목 코드가 올바르지 않아요' }, { status: 400 });
  try {
    let bars;
    if (kr) bars = await fetchKrDailyBars(symbol, YEARS * 366);
    else {
      const r = await yf.chart(symbol.replace('.', '-'), { period1: new Date(Date.now() - YEARS * 366 * 864e5), period2: new Date(), interval: '1d' });
      bars = (r?.quotes || []).filter((q) => q.date && q.high != null && q.low != null && q.close != null)
        .map((q) => ({ time: new Date(q.date).toISOString().slice(0, 10), high: q.high, low: q.low, close: q.close, volume: q.volume ?? 0 }));
    }
    if (!bars.length) return Response.json({ error: '일봉을 찾지 못했어요' }, { status: 404 });
    const [{ shares, name }, naver] = await Promise.all([
      quoteShares(kr ? [`${symbol}.KS`, `${symbol}.KQ`] : [symbol.replace('.', '-')]),
      kr ? fetchNaverBasic(symbol) : null,
    ]);
    const r1 = (v) => (us ? Math.round(v * 100) / 100 : Math.round(v));
    return Response.json({
      symbol, name: naver?.name || name || symbol, us, shares,
      bars: bars.map((x) => ({ time: x.time, high: r1(x.high), low: r1(x.low), close: r1(x.close), volume: x.volume })),
    }, { headers: { 'Cache-Control': 's-maxage=1800, stale-while-revalidate=3600' } });
  } catch (e) {
    console.error('[holder-profit]', e.message);
    return Response.json({ error: '데이터를 불러오지 못했어요' }, { status: 500 });
  }
}
