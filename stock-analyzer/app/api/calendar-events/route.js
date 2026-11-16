import YahooFinance from 'yahoo-finance2';

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
export const dynamic = 'force-dynamic';

// 종목별 실적 발표일·배당락일 (야후 파이낸스). 종목당 6시간 캐시
const cache = new Map();
const TTL = 6 * 3600_000;
const SYMBOL_RE = /^[A-Za-z0-9.\-]{1,15}$/;
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

async function load(symbol) {
  const hit = cache.get(symbol);
  if (hit && hit.exp > Date.now()) return hit.v;
  // 국내 6자리 코드는 코스피(.KS) 먼저, 없으면 코스닥(.KQ)
  const tries = /^[0-9A-Z]{6}$/.test(symbol) ? [`${symbol}.KS`, `${symbol}.KQ`] : [symbol];
  let v = null;
  for (const s of tries) {
    try {
      const r = await Promise.race([
        yf.quoteSummary(s, { modules: ['calendarEvents'] }),
        new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
      ]);
      const c = r?.calendarEvents;
      if (!c) continue;
      v = {
        earnings: day(c.earnings?.earningsDate?.[0]),
        earningsEstimate: !!c.earnings?.isEarningsDateEstimate,
        exDividend: day(c.exDividendDate),
        dividendPay: day(c.dividendDate),
      };
      break;
    } catch { /* 다음 시장으로 */ }
  }
  cache.set(symbol, { exp: Date.now() + (v ? TTL : 10 * 60_000), v }); // 실패는 10분만 기억
  return v;
}

export async function GET(req) {
  const symbols = [...new Set((new URL(req.url).searchParams.get('symbols') || '').split(','))]
    .map((s) => s.trim()).filter((s) => SYMBOL_RE.test(s)).slice(0, 40);
  const out = {};
  await Promise.all(symbols.map(async (s) => { out[s] = await load(s); }));
  return Response.json({ events: out });
}
