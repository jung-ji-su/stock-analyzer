// 국내 종목 일봉 (야후 파이낸스, 서버 전용). 코스피(.KS)/코스닥(.KQ) 중 맞는 쪽을 찾아 받는다.
import YahooFinance from 'yahoo-finance2';
import { getMarketSuffix } from '@/lib/krx-cache';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

// 최근 days 일치 일봉 [{ time:'YYYY-MM-DD', open, high, low, close, volume }] 오름차순. 못 받으면 빈 배열
export async function fetchKrDailyBars(code, days = 400) {
  const period1 = new Date(Date.now() - days * 864e5), period2 = new Date();
  const hint = await getMarketSuffix(code).catch(() => null); // 시장을 알면 그쪽부터
  const suffixes = [...new Set([hint, 'KS', 'KQ'].filter(Boolean))];
  for (const s of suffixes) {
    try {
      const r = await yf.chart(`${code}.${s}`, { period1, period2, interval: '1d' });
      const bars = (r?.quotes || [])
        .filter((q) => q.date && q.open != null && q.high != null && q.low != null && q.close != null)
        .map((q) => ({ time: new Date(q.date).toISOString().slice(0, 10), open: q.open, high: q.high, low: q.low, close: q.close, volume: q.volume ?? 0 }));
      if (bars.length) return bars;
    } catch (e) {
      console.error(`일봉 조회 실패 ${code}.${s}:`, e.message);
    }
  }
  return [];
}
