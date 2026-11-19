// 외부 데이터: 앱(시총 순위), 야후(일봉), 게이트웨이(토스 수급)
import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// 시가총액 상위 종목 (앱의 KRX 데이터). [{ code, name, market:'KS'|'KQ' }]
export async function fetchTopByMarcap(appUrl) {
  const r = await fetch(`${appUrl}/api/top?type=marcap`, { signal: AbortSignal.timeout(30000) });
  if (!r.ok) throw new Error(`시총 순위 ${r.status}`);
  const { stocks = [] } = await r.json();
  return stocks
    .filter((s) => /^[0-9A-Z]{6}$/.test(s.code))
    .map((s) => ({ code: s.code, name: s.name, market: /KOSDAQ/i.test(s.market || '') ? 'KQ' : 'KS' }));
}

// 일봉 (오름차순). [{ date:'YYYY-MM-DD', open, high, low, close, volume }]
export async function fetchDailyBars(code, market, days) {
  const r = await yf.chart(`${code}.${market}`, { period1: new Date(Date.now() - days * 864e5), period2: new Date(), interval: '1d' });
  return (r?.quotes || [])
    .filter((q) => q.date && q.open != null && q.high != null && q.low != null && q.close != null)
    .map((q) => ({
      // 야후 국내 일봉 시각은 한국 장 시작(00:00 UTC 근처) 기준이라 한국 날짜로 바꾼다
      date: new Date(q.date).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }),
      open: q.open, high: q.high, low: q.low, close: q.close, volume: q.volume ?? 0,
    }));
}

// 종목별 투자자 순매수(주). [{ date, foreign, inst, indiv }]
export async function fetchInvestorFlow(gatewayUrl, internalKey, code, count) {
  const r = await fetch(`${gatewayUrl}/api/v1/stocks/${code}/investor-trading?count=${count}`, {
    headers: { 'x-internal-key': internalKey }, signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`수급 ${code} ${r.status}`);
  const n = (v) => (v == null ? null : Number(v));
  return ((await r.json())?.result?.records || [])
    .filter((x) => x.date)
    .map((x) => ({ date: String(x.date).slice(0, 10), foreign: n(x.foreigner?.netBuyVolume), inst: n(x.institution?.netBuyVolume), indiv: n(x.individual?.netBuyVolume) }));
}
