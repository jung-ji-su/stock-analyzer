// 토스 게이트웨이 클라이언트 (브라우저 전용: 본인 Firebase 로그인 토큰으로 호출)
import { auth } from '@/lib/firebase';

const GATEWAY = process.env.NEXT_PUBLIC_TOSS_GATEWAY_URL || 'https://jisu-willberich.duckdns.org';

// 일/주/월/년 봉은 1d 캔들을 페이지 단위(200개)로 받아 가공, 분봉은 1m 로 받아 60분봉으로 가공
const PAGES = { minute: 10, daily: 3, weekly: 8, monthly: 15, yearly: 25 };

export const isTossSymbol = (s) => /^[0-9A-Z]{6}$/.test(s || '');

async function tossGet(path) {
  const user = auth.currentUser;
  if (!user) throw new Error('로그인이 필요합니다');
  const r = await fetch(GATEWAY + path, { headers: { authorization: `Bearer ${await user.getIdToken()}` } });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error?.message || j?.error || `토스 게이트웨이 ${r.status}`);
  return j.result;
}

const num = (v) => parseFloat(v) || 0;
const toBar = (c) => ({
  ts: c.timestamp, open: num(c.openPrice), high: num(c.highPrice), low: num(c.lowPrice), close: num(c.closePrice), volume: num(c.volume),
});

// 오래된 → 최신 순, 여러 페이지
async function fetchCandles(symbol, interval, pages) {
  const out = [];
  let before = null;
  for (let i = 0; i < pages; i++) {
    const q = `symbol=${encodeURIComponent(symbol)}&interval=${interval}&count=200${before ? `&before=${encodeURIComponent(before)}` : ''}`;
    const res = await tossGet(`/api/v1/candles?${q}`);
    out.push(...(res?.candles || []));
    before = res?.nextBefore;
    if (!before) break;
  }
  return out.map(toBar).reverse();
}

// 같은 키끼리 묶어 OHLCV 합치기 (입력은 시간 오름차순)
export function aggregate(bars, keyOf) {
  const map = new Map();
  for (const b of bars) {
    const { key, time } = keyOf(b);
    const g = map.get(key);
    if (!g) map.set(key, { time, open: b.open, high: b.high, low: b.low, close: b.close, volume: b.volume });
    else { g.high = Math.max(g.high, b.high); g.low = Math.min(g.low, b.low); g.close = b.close; g.volume += b.volume; }
  }
  return [...map.values()];
}

const day = (b) => b.ts.slice(0, 10); // 토스 timestamp 는 +09:00(KST) 기준
export const keyers = {
  daily: (b) => ({ key: day(b), time: day(b) }),
  weekly: (b) => {
    const d = new Date(`${day(b)}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); // 해당 주 월요일
    const t = d.toISOString().slice(0, 10);
    return { key: t, time: t };
  },
  monthly: (b) => ({ key: day(b).slice(0, 7), time: `${day(b).slice(0, 7)}-01` }),
  yearly: (b) => ({ key: day(b).slice(0, 4), time: `${day(b).slice(0, 4)}-01-01` }),
  // 차트 축이 KST 로 보이도록 +9h 를 더한 unix 초 사용
  minute: (b) => {
    const sec = Math.floor(Date.parse(b.ts) / 1000) + 9 * 3600;
    const t = sec - (sec % 3600);
    return { key: t, time: t };
  },
};

// /api/stock 과 같은 모양으로 반환: { name, nameKr, currentPrice, change, changePercent, chartData }
export async function fetchTossStock(symbol, timeframe = 'daily') {
  const kind = keyers[timeframe] ? timeframe : 'daily';
  const [bars, price, info, dayBars] = await Promise.all([
    fetchCandles(symbol, kind === 'minute' ? '1m' : '1d', PAGES[kind]),
    tossGet(`/api/v1/prices?symbols=${symbol}`),
    tossGet(`/api/v1/stocks?symbols=${symbol}`).catch(() => null),
    kind === 'daily' ? null : fetchCandles(symbol, '1d', 1), // 전일 대비 계산용
  ]);
  const chartData = aggregate(bars, keyers[kind]);
  if (!chartData.length) throw new Error('데이터를 찾을 수 없습니다');

  const daily = kind === 'daily' ? chartData : aggregate(dayBars, keyers.daily);
  const currentPrice = num(price?.[0]?.lastPrice) || daily[daily.length - 1]?.close || 0;
  const prevClose = daily.length >= 2 ? daily[daily.length - 2].close : currentPrice;
  const change = currentPrice - prevClose;
  const name = info?.[0]?.name || symbol;
  return {
    name, nameKr: name, currentPrice, change,
    changePercent: prevClose ? (change / prevClose) * 100 : 0,
    chartData,
  };
}
