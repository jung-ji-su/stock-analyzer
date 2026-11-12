// 토스 게이트웨이 클라이언트 (브라우저 전용: 본인 Firebase 로그인 토큰으로 호출)
import { auth } from '@/lib/firebase';

const GATEWAY = process.env.NEXT_PUBLIC_TOSS_GATEWAY_URL || 'https://jisu-willberich.duckdns.org';

// 일/주/월/년 봉은 1d 캔들을 페이지 단위(200개)로 받아 가공, 분봉은 1m 로 받아 60분봉으로 가공
const PAGES = { m1: 5, m5: 10, m15: 15, m60: 20, daily: 3, weekly: 8, monthly: 15, yearly: 25 };
export const isMinuteTf = (tf) => /^m\d+$/.test(tf) || tf === 'minute';

export const isTossSymbol = (s) => /^[0-9A-Z]{6}$/.test(s || '');
const US_MARKETS = new Set(['NYSE', 'NASDAQ', 'AMEX', 'US_ETC']);
export const isUsStock = (stock) => US_MARKETS.has(stock?.exchange);
// 토스로 조회 가능한 종목인가 (국내 6자리 코드 또는 미국 종목)
export const canUseToss = (stock) => !!stock && (isTossSymbol(stock.symbol) || isUsStock(stock));

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
const minuteKey = (b, n) => {
  const sec = Math.floor(Date.parse(b.ts) / 1000) + 9 * 3600;
  const t = sec - (sec % (n * 60));
  return { key: t, time: t };
};
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
  // 분봉: 차트 축이 KST 로 보이도록 +9h 를 더한 unix 초 사용
  m1: (b) => minuteKey(b, 1),
  m5: (b) => minuteKey(b, 5),
  m15: (b) => minuteKey(b, 15),
  m60: (b) => minuteKey(b, 60),
};
keyers.minute = keyers.m60; // 예전 이름(60분봉) 호환

// /api/stock 과 같은 모양으로 반환: { name, nameKr, currentPrice, change, changePercent, chartData }
export async function fetchTossStock(symbol, timeframe = 'daily') {
  const kind = timeframe === 'minute' ? 'm60' : keyers[timeframe] ? timeframe : 'daily';
  const minute = isMinuteTf(kind);
  const [bars, price, info, dayBars] = await Promise.all([
    fetchCandles(symbol, minute ? '1m' : '1d', PAGES[kind]),
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

// ─── 종목 마스터(검색용) ─────────────────────────────────────────────────────
// /stocks/all 은 1 TPS 제한이라 시장별로 순서대로 받고, 브라우저에 하루 동안 저장한다.
const MARKETS = ['KOSPI', 'KOSDAQ', 'KR_ETC', 'NASDAQ', 'NYSE', 'AMEX', 'US_ETC'];
const LIST_KEY = 'toss_master_v1';
const LIST_TTL = 24 * 3600 * 1000;
let masterList = null; // [[symbol, name, market], ...]
let masterLoading = null;

export function loadStockList() {
  if (masterList) return Promise.resolve(masterList);
  try {
    const c = JSON.parse(localStorage.getItem(LIST_KEY) || 'null');
    if (c && Date.now() - c.ts < LIST_TTL) return Promise.resolve((masterList = c.v));
  } catch {}
  if (!masterLoading) {
    masterLoading = (async () => {
      const all = [];
      for (const m of MARKETS) {
        try {
          const rows = await tossGet(`/api/v1/stocks/all?market=${m}`);
          for (const r of rows || []) all.push([r.symbol, r.name, m]);
        } catch (e) { console.warn(`종목 목록 실패(${m}):`, e.message); }
      }
      if (!all.length) throw new Error('종목 목록을 받지 못했습니다');
      masterList = all;
      try { localStorage.setItem(LIST_KEY, JSON.stringify({ ts: Date.now(), v: all })); } catch {}
      return all;
    })().finally(() => { masterLoading = null; });
  }
  return masterLoading;
}

// 목록이 아직 없으면 null (호출한 쪽에서 기존 검색으로 대체). 결과는 { symbol, name, exchange }
export function searchTossStocks(query, limit = 30) {
  if (!masterList) return null;
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const scored = [];
  for (const [symbol, name, market] of masterList) {
    const sym = symbol.toLowerCase(), nm = (name || '').toLowerCase();
    let score = -1;
    if (sym === q) score = 0;
    else if (nm === q) score = 1;
    else if (nm.startsWith(q) || sym.startsWith(q)) score = 2;
    else if (nm.includes(q)) score = 3;
    if (score >= 0) scored.push({ score, item: { symbol, name, exchange: market } });
  }
  return scored.sort((a, b) => a.score - b.score || a.item.name.length - b.item.name.length).slice(0, limit).map((x) => x.item);
}

// ─── 실시간(WebSocket) ───────────────────────────────────────────────────────
// 게이트웨이와 연결 1개를 공유한다. topics: [{ type: 'trade:kr', codes: ['005930'] }]
// onMessage(frame): frame = { type:'message', topic:'trade:kr:005930', data:{...} }
let sock = null, ready = false, retry = 0, retryTimer = null;
const subs = new Set();
const keysOf = (topics) => new Set(topics.flatMap((t) => t.codes.map((c) => `${t.type}:${c}`)));

function pushSubscriptions() {
  if (!ready || !sock || sock.readyState !== 1) return;
  const byType = {};
  for (const s of subs) for (const t of s.topics) byType[t.type] = [...new Set([...(byType[t.type] || []), ...t.codes])];
  sock.send(JSON.stringify({ type: 'subscribe', topics: Object.entries(byType).map(([type, codes]) => ({ type, codes })) }));
}

async function connectStream() {
  if (sock || !subs.size || typeof window === 'undefined') return;
  const user = auth.currentUser;
  if (!user) return;
  const ws = new WebSocket(`${GATEWAY.replace(/^http/, 'ws')}/ws`);
  sock = ws; ready = false;
  ws.onopen = async () => { try { ws.send(JSON.stringify({ type: 'auth', token: await user.getIdToken() })); } catch { ws.close(); } };
  ws.onmessage = (ev) => {
    let m; try { m = JSON.parse(ev.data); } catch { return; }
    if (m.type === 'ready') { ready = true; retry = 0; pushSubscriptions(); }
    else if (m.type === 'message') for (const s of subs) if (s.keys.has(m.topic)) s.onMessage(m);
  };
  ws.onclose = () => {
    if (sock !== ws) return;
    sock = null; ready = false;
    if (subs.size) { clearTimeout(retryTimer); retryTimer = setTimeout(connectStream, Math.min(30000, 1000 * 2 ** retry++)); }
  };
  ws.onerror = () => {};
}

export function subscribeToss(topics, onMessage) {
  const sub = { topics, keys: keysOf(topics), onMessage };
  subs.add(sub);
  connectStream();
  pushSubscriptions();
  return () => {
    subs.delete(sub);
    if (!subs.size) { clearTimeout(retryTimer); const s = sock; sock = null; ready = false; s?.close(); }
    else pushSubscriptions();
  };
}

// 호가 스냅샷 (WebSocket 은 스냅샷을 주지 않으므로 먼저 한 번 조회). 응답: { asks:[{price,volume}], bids:[...] }
export const fetchOrderbook = (symbol) => tossGet(`/api/v1/orderbook?symbol=${encodeURIComponent(symbol)}`);

// ─── 랭킹 ───────────────────────────────────────────────────────────────────
// 화면의 종류(volume/amount/rise/fall) → 토스 랭킹 타입. 시가총액(marcap)은 토스 랭킹에 없다.
const RANK_TYPE = { volume: 'MARKET_TRADING_VOLUME', amount: 'MARKET_TRADING_AMOUNT', rise: 'TOP_GAINERS', fall: 'TOP_LOSERS' };
export const tossRankable = (type) => !!RANK_TYPE[type];
const ETF_WORDS = ['ETF', 'ETN', 'KODEX', 'TIGER', 'KINDEX', 'KOSEF', 'ARIRANG', 'HANARO', 'KBSTAR', 'SOL', 'ACE', '레버리지', '인버스', '2X', '3X', 'SHORT', 'BEAR', 'BULL', '선물', '채권', '리츠', 'REIT', '머니마켓', 'MMF'];

// /api/top 과 같은 모양의 배열을 반환 (이름·시장은 종목 마스터에서 보충, ETF 류는 제외)
export async function fetchTossRanking(type, country = 'KR') {
  const [res] = await Promise.all([
    tossGet(`/api/v1/rankings?type=${RANK_TYPE[type]}&marketCountry=${country}&duration=${type === 'rise' || type === 'fall' ? '1d' : 'realtime'}&count=100`),
    loadStockList().catch(() => null),
  ]);
  const meta = new Map((masterList || []).map(([s, n, m]) => [s, { name: n, market: m }]));
  return (res?.rankings || [])
    .map((r) => {
      const m = meta.get(r.symbol) || {};
      const last = num(r.price?.lastPrice), rate = num(r.price?.changeRate) * 100;
      return {
        name: m.name || r.symbol, code: r.symbol, market: m.market || (country === 'US' ? 'NASDAQ' : 'KOSPI'), currency: r.currency,
        price: last, change: last - num(r.price?.basePrice),
        changeRate: `${rate >= 0 ? '+' : ''}${rate.toFixed(2)}%`,
        volume: num(r.tradingVolume), amount: Math.round(num(r.tradingAmount) / 1e6),
      };
    })
    .filter((s) => !/_ETC$/.test(s.market) && !ETF_WORDS.some((w) => s.name.toUpperCase().includes(w.toUpperCase())));
}

// ─── 섹터 지도 ──────────────────────────────────────────────────────────────
// /market-map 페이지가 쓰는 모양: [{ name, avgChangePercent, totalMarketCap, stocks: [], tossId }]
// depth: 0 = 대분류, 1 = 중분류. 시가총액은 원화 환산 값이다.
export async function fetchTossSectorMap(country = 'KR', depth = 0) {
  const [list, rank] = await Promise.all([
    tossGet('/api/v1/sectors'),
    tossGet(`/api/v1/sectors/rankings?type=MARKET_TRADING_AMOUNT&marketCountry=${country}&duration=1d`),
  ]);
  const depthOf = new Map((list?.sectors || []).map((s) => [s.sectorId, s.depth]));
  return (rank?.rankings || [])
    .filter((r) => depthOf.get(r.sectorId) === depth && num(r.marketCapitalization) > 0)
    .map((r) => ({
      name: r.name, tossId: r.sectorId,
      avgChangePercent: num(r.changeRate) * 100,
      totalMarketCap: num(r.marketCapitalization),
      stocks: [], stocksLoaded: false,
    }));
}

// 섹터 구성 종목(시가총액 상위). 구성 종목 API 에는 등락률이 없어서 최근 2일 캔들로 계산한다.
export async function fetchTossSectorStocks(sectorId, country = 'KR', limit = 30) {
  const res = await tossGet(`/api/v1/sectors/${encodeURIComponent(sectorId)}/stocks?marketCountry=${country}`);
  const top = (res?.stocks || []).slice(0, limit);
  const prices = new Map();
  if (top.length) {
    const p = await tossGet(`/api/v1/prices?symbols=${top.map((s) => s.symbol).join(',')}`);
    for (const x of p || []) prices.set(x.symbol, num(x.lastPrice));
  }
  const prevClose = await Promise.all(top.map(async (s) => {
    try {
      const c = await tossGet(`/api/v1/candles?symbol=${encodeURIComponent(s.symbol)}&interval=1d&count=2`);
      const bars = c?.candles || []; // 최신순
      return bars.length >= 2 ? num(bars[1].closePrice) : 0;
    } catch { return 0; }
  }));
  return top.map((s, i) => {
    const price = prices.get(s.symbol) || 0;
    return {
      name: s.name, ticker: s.symbol, price, volume: num(s.volume), currency: s.currency,
      changePercent: prevClose[i] && price ? ((price - prevClose[i]) / prevClose[i]) * 100 : 0,
    };
  });
}

// ─── 수급 ───────────────────────────────────────────────────────────────────
// 국내 종목만. records 는 최신순, 수량은 문자열(주). 잠정치(당일)는 individual 등이 null 일 수 있다.
export const fetchInvestorTrading = (symbol, count = 10) =>
  tossGet(`/api/v1/stocks/${encodeURIComponent(symbol)}/investor-trading?count=${count}`);

// 투자자별 순매수/순매도 상위. { foreigner|institution|individual: { rankedAt, netBuyRankings, netSellRankings } }
export const fetchInvestorRanking = (count = 10) => tossGet(`/api/v1/rankings/investor-trading?count=${count}`);

// ─── 시장 상태 / 경고 / 가격제한폭 ──────────────────────────────────────────
// 캘린더: today / previousBusinessDay / nextBusinessDay. 세션이 전부 null 이면 휴장.
export const fetchMarketCalendar = (country = 'KR') => tossGet(`/api/v1/market-calendar/${country}`);
// 경고: [{ warningType, exchange, startDate, endDate }] (국내 종목)
export const fetchStockWarnings = (symbol) => tossGet(`/api/v1/stocks/${encodeURIComponent(symbol)}/warnings`);
// 가격제한폭: { upperLimitPrice, lowerLimitPrice } (미국은 null)
export const fetchPriceLimits = (symbol) => tossGet(`/api/v1/price-limits?symbol=${encodeURIComponent(symbol)}`);

// 현재가 한 종목 (모의 주문 체결가 확인용)
export async function fetchLastPrice(symbol) {
  const r = await tossGet(`/api/v1/prices?symbols=${encodeURIComponent(symbol)}`);
  const p = parseFloat(r?.[0]?.lastPrice);
  return p > 0 ? p : null;
}

// 여러 종목 현재가 한 번에: Map(symbol → 가격)
export async function fetchPrices(symbols) {
  const m = new Map();
  if (!symbols.length) return m;
  const r = await tossGet(`/api/v1/prices?symbols=${symbols.map(encodeURIComponent).join(',')}`);
  for (const x of r || []) { const p = parseFloat(x.lastPrice); if (p > 0) m.set(x.symbol, p); }
  return m;
}

// since(ms) 이후 ~ until(ms) 까지의 봉(최신순 페이지를 모아 반환). reached = since 시점까지 거슬러 올라갔는지
export async function fetchBarsBetween(symbol, interval, sinceMs, untilMs, maxPages = 6) {
  const out = [];
  let before = untilMs < Date.now() - 60000 ? new Date(untilMs).toISOString() : null, reached = false;
  for (let i = 0; i < maxPages; i++) {
    const q = `symbol=${encodeURIComponent(symbol)}&interval=${interval}&count=200${before ? `&before=${encodeURIComponent(before)}` : ''}`;
    const res = await tossGet(`/api/v1/candles?${q}`);
    for (const c of res?.candles || []) {
      const t = +new Date(c.timestamp);
      if (t <= sinceMs) { reached = true; break; }
      if (t <= untilMs) out.push(toBar(c));
    }
    if (reached || !res?.nextBefore) { reached = true; break; }
    before = res.nextBefore;
  }
  return { bars: out, reached };
}

// 일봉 종가표: Map(symbol → [[YYYY-MM-DD(KST), close], ...] 오름차순). 실패한 종목은 빈 배열
export async function fetchDailyCloses(symbols) {
  const m = new Map();
  await Promise.all(symbols.map(async (s) => {
    try {
      const res = await tossGet(`/api/v1/candles?symbol=${encodeURIComponent(s)}&interval=1d&count=200`);
      const rows = (res?.candles || []).map(toBar).filter((b) => b.close > 0)
        .map((b) => [new Date(b.ts).toLocaleDateString('sv-SE', { timeZone: 'Asia/Seoul' }), b.close])
        .sort((a, b) => (a[0] < b[0] ? -1 : 1));
      m.set(s, rows);
    } catch { m.set(s, []); }
  }));
  return m;
}
