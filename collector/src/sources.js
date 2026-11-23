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

// 종목별 투자자 순매수(주), 최신순 한 페이지. { records: [{ date, foreign, inst, indiv }], nextUntil }
// count 최대 100. until(YYYY-MM-DD)은 그 날짜를 포함하고, 다음 페이지는 nextUntil 을 until 로 넘긴다 (마지막이면 null)
export async function fetchInvestorFlowPage(gatewayUrl, internalKey, code, count, until = null) {
  const qs = `count=${count}${until ? `&until=${until}` : ''}`;
  const r = await fetch(`${gatewayUrl}/api/v1/stocks/${code}/investor-trading?${qs}`, {
    headers: { 'x-internal-key': internalKey }, signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`수급 ${code} ${r.status}`);
  const n = (v) => (v == null ? null : Number(v));
  const res = (await r.json())?.result || {};
  return {
    records: (res.records || [])
      .filter((x) => x.date)
      .map((x) => ({ date: String(x.date).slice(0, 10), foreign: n(x.foreigner?.netBuyVolume), inst: n(x.institution?.netBuyVolume), indiv: n(x.individual?.netBuyVolume) })),
    nextUntil: res.nextUntil ? String(res.nextUntil).slice(0, 10) : null,
  };
}

export const fetchInvestorFlow = async (gatewayUrl, internalKey, code, count) =>
  (await fetchInvestorFlowPage(gatewayUrl, internalKey, code, count)).records;
