'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/db';
import { authFetch } from '@/lib/authFetch';
import { addBusinessDays } from '@/lib/evalUtils';
import { prepareOrder, executeFill, placeLimitOrder } from '@/lib/paperTrade';
import { fmtPx } from '@/lib/currency';
import StockInfoTab from '@/components/StockInfoTab';
import { useToast } from '@/components/Toast';
import { fetchPrices as fetchTossPrices, fetchFxRate, fetchTossStock, canUseToss, isUsStock, loadStockList, searchTossStocks, subscribeToss, isMinuteTf, keyers, fetchTossRanking, tossRankable, fetchSupplySummary } from '@/lib/toss';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc, setDoc, addDoc, collection, serverTimestamp } from 'firebase/firestore';
import HomeScreen from '@/components/home/HomeScreen';
import PriceHero from '@/components/stock/PriceHero';
import ChartCard from '@/components/stock/ChartCard';
import OrderCard from '@/components/stock/OrderCard';
import AIAnalysisCard from '@/components/stock/AIAnalysisCard';
import MarketCard from '@/components/stock/MarketCard';
import NewsCard from '@/components/stock/NewsCard';
import StockModals from '@/components/stock/StockModals';
import { motion } from 'framer-motion';
import { normalizeWishlist, hasWish, loadWishlist as loadWishlistOf, saveWishlist, toggleWish } from '@/lib/wishlist';
import { rsi as calcRsiSeries, volumeProfile } from '@/lib/indicators';

// ─── 상수 ───────────────────────────────────────────────────────────────────

const OVERLAY_INFO = {
  vp:   { title: '📊 매물대 (Volume Profile)', color: '#8b5cf6', desc: '과거 거래량이 가장 많이 집중된 가격대입니다. 해당 구간은 강한 지지·저항으로 작용할 가능성이 높아요.' },
  ma:   { title: '〰 이평선 (MA 5/20/60)',     color: '#f59e0b', desc: '빨강(5일) · 노랑(20일) · 파랑(60일) 이동평균선입니다. 단기가 중·장기 위에 있는 정배열이면 상승 추세, 아래면 하락 추세 신호예요.' },
  bb:   { title: '🔵 볼린저 밴드 (20일, 2σ)', color: '#3b82f6', desc: '20일 기준 표준편차 2배 범위를 파란 점선으로 표시합니다. 상단 이탈은 과열, 하단 이탈은 과매도로 반등 가능성이 높아요.' },
  rsi:  { title: '📈 RSI (14)', color: '#eab308', desc: '최근 14봉의 상승·하락 힘을 0~100으로 나타냅니다. 70 이상은 과열(과매수), 30 이하는 침체(과매도) 구간으로 봐요.' },
  macd: { title: '📉 MACD (12, 26, 9)', color: '#ec4899', desc: '단기·장기 이동평균의 차이(MACD선)와 그 평균(시그널선)입니다. MACD선이 시그널선을 위로 뚫으면 매수, 아래로 뚫으면 매도 신호로 봐요. 막대는 둘의 차이예요.' },
  vwap: { title: '🎯 VWAP',                   color: '#06b6d4', desc: '최근 20일 거래량 기준 평균 매수 단가입니다. 기관·스마트머니의 기준선으로, 현재가가 이 선 위면 매수 우위, 아래면 매도 압력이 있어요.' },
  hl:   { title: '📏 기간 고점/저점',          color: '#22c55e', desc: '조회 기간 내 최고가(빨강)·최저가(초록) 수평선입니다. 심리적 저항·지지 구간이며, 돌파 또는 이탈 시 강한 추세 전환 신호가 됩니다.' },
};

// ── 차트 공통 ──
const CHART_H = 440; // 가격 + 거래량 영역 합계
const SUB_PANE_H = 110; // RSI·MACD 영역 하나당 추가 높이
const MINUTE_TFS = [{ key: 'm1', label: '1분' }, { key: 'm3', label: '3분' }, { key: 'm5', label: '5분' }, { key: 'm10', label: '10분' }, { key: 'm15', label: '15분' }, { key: 'm30', label: '30분' }, { key: 'm60', label: '60분' }];
// 차트 시간값 → { y, m, d, hh, mm }. 분봉은 KST 를 더한 unix 초, 일봉 이상은 'YYYY-MM-DD' 또는 { year, month, day }
const timeParts = (t) => {
  if (typeof t === 'number') { const d = new Date(t * 1000); return { y: d.getUTCFullYear(), m: d.getUTCMonth() + 1, d: d.getUTCDate(), hh: d.getUTCHours(), mm: d.getUTCMinutes() }; }
  if (typeof t === 'string') { const [y, m, d] = t.split('-').map(Number); return { y, m, d }; }
  return { y: t.year, m: t.month, d: t.day };
};
const p2 = (n) => String(n).padStart(2, '0');
// 축 눈금: 연(2026) · 월(11월) · 일(12일) · 시각(15:00)
const tickLabel = (t, type) => {
  const x = timeParts(t);
  if (type === 0) return `${x.y}`;
  if (type === 1) return `${x.m}월`;
  if (type === 2) return `${x.d}일`;
  return x.hh != null ? `${p2(x.hh)}:${p2(x.mm)}` : `${x.d}일`;
};
// 지수이동평균 (SMA 로 시작). null 은 건너뜀
const ema = (arr, n) => {
  const out = Array(arr.length).fill(null), k = 2 / (n + 1);
  let prev = null, cnt = 0, sum = 0;
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (v == null) continue;
    if (prev == null) { sum += v; cnt++; if (cnt === n) { prev = sum / n; out[i] = prev; } continue; }
    prev = v * k + prev * (1 - k); out[i] = prev;
  }
  return out;
};
const calcMacd = (c, f = 12, sl = 26, sg = 9) => {
  const ef = ema(c, f), es = ema(c, sl);
  const macd = c.map((_, i) => (ef[i] != null && es[i] != null ? ef[i] - es[i] : null));
  const signal = ema(macd, sg);
  const hist = macd.map((v, i) => (v != null && signal[i] != null ? v - signal[i] : null));
  return { macd, signal, hist };
};
// 십자선 시간 라벨
const crossLabel = (t) => {
  const x = timeParts(t);
  return x.hh != null ? `${p2(x.m)}.${p2(x.d)} ${p2(x.hh)}:${p2(x.mm)}` : `${x.y}.${p2(x.m)}.${p2(x.d)}`;
};


export default function Home() {
  const { user, logout, loading: authLoading } = useAuth();
  const { addToast } = useToast();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [indicators, setIndicators] = useState(null);
  const [loading, setLoading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [timeframe, setTimeframe] = useState('daily');
  const [topStocks, setTopStocks] = useState([]);
  const [topType, setTopType] = useState('volume');
  const [topCountry, setTopCountry] = useState('KR');
  const [topLoading, setTopLoading] = useState(false);
  const [topUpdatedAt, setTopUpdatedAt] = useState(null);
  const [analysisCache, setAnalysisCache] = useState({});
  const [tradeModal, setTradeModal] = useState(false);
  const [tradeType, setTradeType] = useState('buy');
  const [priceType, setPriceType] = useState('market');
  const [tradePrice, setTradePrice] = useState('');
  const [tradeQty, setTradeQty] = useState('');
  const [userProfile, setUserProfile] = useState(null);
  const [userHolding, setUserHolding] = useState(null);
  const [ocoModal, setOcoModal] = useState(false);
  const [fx, setFx] = useState(null); // 원/달러 (미국 종목 선택 시에만 조회)
  const [tradeProcessing, setTradeProcessing] = useState(false);
  const [tradeError, setTradeError] = useState('');
  const [wishlist, setWishlist] = useState([]);
  const [wishlistStocks, setWishlistStocks] = useState([]);
  const [news, setNews] = useState([]);
  const [allNews, setAllNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsAnalysis, setNewsAnalysis] = useState(null);
  const [newsAnalyzing, setNewsAnalyzing] = useState(false);
  const [newsError, setNewsError] = useState('');
  const [showVolumeProfile, setShowVolumeProfile] = useState(false); // 축 라벨을 많이 차지해서 기본은 끔
  const [showMA, setShowMA] = useState(true); // 증권사 차트처럼 이평선은 기본으로 표시
  const [showBB, setShowBB] = useState(false);
  const [showVWAP, setShowVWAP] = useState(false);
  const [showRSI, setShowRSI] = useState(false);
  const [showMACD, setShowMACD] = useState(false);
  const [showHL, setShowHL] = useState(false);
  const [minutePicker, setMinutePicker] = useState(false);
  const [chartFs, setChartFs] = useState(false); // 차트 전체화면
  const [portrait, setPortrait] = useState(true);
  const [lastMinute, setLastMinute] = useState('m1'); // 분봉 버튼에 표시할 마지막 선택
  const [activeTooltip, setActiveTooltip] = useState(null);
  const [chartVolumeProfile, setChartVolumeProfile] = useState([]);
  const [infoTab, setInfoTab] = useState('chart'); // chart | info (국내 종목만 종목정보 탭)
  const [briefMini, setBriefMini] = useState(null);
  const [liveIdx, setLiveIdx] = useState({}); // 실시간 지수 (코스피·코스닥·미국)
  const [wishlistLoading, setWishlistLoading] = useState(false);
  const [homeTab, setHomeTab] = useState(() => { try { return localStorage.getItem('ui:home-tab') === 'top' ? 'top' : 'wish'; } catch { return 'wish'; } });
  const pickHomeTab = (k) => { setHomeTab(k); try { localStorage.setItem('ui:home-tab', k); } catch {} };
  // 관심종목 정렬(기기에 기억)·그룹 필터·그룹 지정 시트
  const [wishSort, setWishSort] = useState(() => { try { return localStorage.getItem('ui:wish-sort') || 'added'; } catch { return 'added'; } });
  const pickWishSort = (k) => { setWishSort(k); try { localStorage.setItem('ui:wish-sort', k); } catch {} };
  const [wishGroup, setWishGroup] = useState('all');
  const [groupSheet, setGroupSheet] = useState(null); // { symbol, name } | null
  // 종목 화면의 시세 카드 탭(호가·체결·수급)과 뉴스 펼침
  // 수급을 맨 앞(기본)으로 옮기면서 저장 키를 바꿔 예전에 고른 탭('호가')이 남지 않게 했다
  const [marketTab, setMarketTab] = useState(() => { try { return localStorage.getItem('ui:market-tab2') || 'flow'; } catch { return 'flow'; } });
  const pickMarketTab = (k) => { setMarketTab(k); try { localStorage.setItem('ui:market-tab2', k); } catch {} };
  const [newsAll, setNewsAll] = useState(false);
  const [newGroupName, setNewGroupName] = useState('');
  const [searchFocused, setSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const chartContainerRef = useRef(null);
  const ohlcRef = useRef(null);
  const chartRef = useRef(null);
  const initTokenRef = useRef(0);
  const candleSeriesRef = useRef(null);
  const volumeSeriesRef = useRef(null);
  const [live, setLive] = useState(null); // 실시간 체결가 { price, prevClose }
  const searchTimeout = useRef(null);
  const searchBlurTimeout = useRef(null);
  const tooltipTimer = useRef(null);
  const resizeHandlerRef = useRef(null);
  const searchParams = useSearchParams();

  // ─── 모든 원본 로직 그대로 유지 ───────────────────────────────────────────

  useEffect(() => {
    if (!authLoading && !user) router.push('/login');
    if (user) loadWishlist();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 의도적으로 표시한 값이 바뀔 때만 실행 (함수는 매 렌더 새로 만들어져 넣으면 무한 반복)
  }, [user, authLoading]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('recentStockSearches') || '[]');
      setRecentSearches(stored);
    } catch {}
  }, []);

  const loadWishlist = async () => {
    if (!user) return;
    try {
      setWishlist(await loadWishlistOf(user.uid));
    } catch (e) { console.error(e); }
  };

  useEffect(() => {
    if (user) loadStockList().catch((e) => console.warn('토스 종목 목록:', e.message));
  }, [user]);

  useEffect(() => {
    if (query.length < 1) { setSearchResults([]); return; }
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      try {
        // 토스 종목 목록이 준비돼 있으면 우선 사용(국내+미국), 아니면 기존 검색
        const toss = searchTossStocks(query);
        if (toss && toss.length) { setSearchResults(toss); return; }
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch { setSearchResults([]); }
    }, 300);
    return () => clearTimeout(searchTimeout.current);
  }, [query]);

  // 하단 홈 버튼: 페이지를 다시 불러오지 않고 첫 화면(종목 선택 전)으로 돌아가 데이터를 새로고침
  const refreshHomeRef = useRef(null);
  refreshHomeRef.current = () => {
    setSelectedStock(null); setQuery(''); setChartData(null); setAnalysis(null); setIndicators(null);
    setError(null); setInfoTab('chart'); setChartFs(false); setTradeModal(false);
    loadWishlistStocks();
    loadTopStocks();
  };
  useEffect(() => {
    const onHome = () => refreshHomeRef.current?.();
    window.addEventListener('home-refresh', onHome);
    return () => window.removeEventListener('home-refresh', onHome);
  }, []);

  useEffect(() => {
    if (!selectedStock) return;
    loadChart();
    loadUserData(selectedStock.symbol);
    // 미국 종목은 회사 이름만으로 검색하면 제품 기사가 섞여서 '주가'를 붙인다
    loadNews(isUsStock(selectedStock) ? `${selectedStock.name || query} 주가` : (selectedStock.name || query));
    setNewsAnalysis(null);
    setNewsAll(false);
    const cached = analysisCache[selectedStock.symbol];
    if (cached) { setAnalysis(cached.analysis); setIndicators(cached.indicators); }
    else { setAnalysis(null); setIndicators(null); }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 의도적으로 표시한 값이 바뀔 때만 실행 (함수는 매 렌더 새로 만들어져 넣으면 무한 반복)
  }, [selectedStock?.symbol, timeframe]);

  useEffect(() => {
    if (!chartData || !chartContainerRef.current) return;
    initChart();
    return () => {
      // eslint-disable-next-line react-hooks/exhaustive-deps -- 증가시킬 카운터일 뿐 DOM 참조가 아님
      initTokenRef.current++;
      if (resizeHandlerRef.current) {
        window.removeEventListener('resize', resizeHandlerRef.current);
        resizeHandlerRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 의도적으로 표시한 값이 바뀔 때만 실행 (함수는 매 렌더 새로 만들어져 넣으면 무한 반복)
  }, [chartData, indicators, showVolumeProfile, chartVolumeProfile, showMA, showBB, showVWAP, showHL, showRSI, showMACD, chartFs, infoTab]);

  // 전체화면: 뒤 페이지 스크롤 막기 + 지원하는 기기(안드로이드 등)는 실제 전체화면 + 가로 고정.
  // 아이폰은 둘 다 지원하지 않아서 화면을 덮는 레이어로 보여주고, 폰을 돌리면 가로로 꽉 차게 된다.
  useEffect(() => {
    if (!chartFs) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const el = document.documentElement;
    if (el.requestFullscreen && !document.fullscreenElement) {
      el.requestFullscreen().then(() => screen.orientation?.lock?.('landscape')).catch(() => {});
    }
    const onFsChange = () => { if (!document.fullscreenElement) setChartFs(false); }; // 안드로이드 뒤로가기 등
    const onOrient = () => {
      setPortrait(window.innerHeight > window.innerWidth);
      setTimeout(() => resizeHandlerRef.current?.(), 150); // 회전 후 크기 다시 맞춤
    };
    const onKey = (e) => { if (e.key === 'Escape') setChartFs(false); };
    onOrient();
    document.addEventListener('fullscreenchange', onFsChange);
    window.addEventListener('resize', onOrient);
    window.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('fullscreenchange', onFsChange);
      window.removeEventListener('resize', onOrient);
      window.removeEventListener('keydown', onKey);
      try { screen.orientation?.unlock?.(); } catch {}
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [chartFs]);

  // 실시간 체결가 → 마지막 캔들과 헤더 가격만 갱신 (chartData 는 건드리지 않아 차트가 다시 그려지지 않음)
  useEffect(() => {
    if (!chartData?.chartData?.length || !canUseToss(selectedStock)) return;
    const topic = { type: `trade:${isUsStock(selectedStock) ? 'us' : 'kr'}`, codes: [selectedStock.symbol] };
    const prevClose = chartData.currentPrice - chartData.change;
    const last = { ...chartData.chartData[chartData.chartData.length - 1] };
    let timer = null, price = 0;
    const paint = () => {
      candleSeriesRef.current?.update({ ...last });
      volumeSeriesRef.current?.update({ time: last.time, value: last.volume, color: last.close >= last.open ? '#ef444499' : '#3b82f699' });
      setLive({ price, prevClose });
    };
    // 끊겼다 다시 연결되면 그 사이 움직인 현재가를 한 번 받아 반영
    const onResync = () => fetchTossPrices([selectedStock.symbol]).then((m) => {
      const p = m.get(selectedStock.symbol);
      if (!p) return;
      price = p; last.close = p; last.high = Math.max(last.high, p); last.low = Math.min(last.low, p);
      paint();
    }).catch(() => {});
    const unsub = subscribeToss([topic], (msg) => {
      price = parseFloat(msg.data?.price);
      if (!price) return;
      const vol = parseFloat(msg.data?.volume) || 0; // 체결 1건의 수량 (누적 아님)
      // 분봉은 봉이 바뀌는 시점(새 5분 등)에 새 봉을 시작한다 (일·주·월봉은 미국 종목의 날짜 기준이 달라 마지막 봉만 갱신)
      const kind = timeframe === 'minute' ? 'm60' : keyers[timeframe] ? timeframe : 'daily';
      const bucket = msg.data?.timestamp ? keyers[kind]({ ts: msg.data.timestamp }).time : last.time;
      if (isMinuteTf(kind) && bucket > last.time) { last.time = bucket; last.open = last.high = last.low = price; last.volume = 0; }
      last.volume = (last.volume || 0) + vol;
      last.close = price; last.high = Math.max(last.high, price); last.low = Math.min(last.low, price);
      if (timer) return;
      timer = setTimeout(() => { timer = null; paint(); }, 500);
    }, { onResync });
    return () => { clearTimeout(timer); unsub(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 의도적으로 표시한 값이 바뀔 때만 실행 (함수는 매 렌더 새로 만들어져 넣으면 무한 반복)
  }, [chartData, selectedStock?.symbol, timeframe]);

  // eslint-disable-next-line react-hooks/exhaustive-deps -- 의도적으로 표시한 값이 바뀔 때만 실행 (함수는 매 렌더 새로 만들어져 넣으면 무한 반복)
  useEffect(() => { loadTopStocks(); }, [topType, topCountry]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const stock = params.get('stock');
    const name = params.get('name');
    if (stock && name) {
      setSelectedStock({ symbol: stock, name: decodeURIComponent(name), exchange: '' });
      setQuery(decodeURIComponent(name));
    }
  }, []);

  useEffect(() => {
    if (wishlist.length === 0) { setWishlistStocks([]); setWishlistLoading(false); return; }
    loadWishlistStocks();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 의도적으로 표시한 값이 바뀔 때만 실행 (함수는 매 렌더 새로 만들어져 넣으면 무한 반복)
  }, [wishlist]);

  useEffect(() => {
    fetch('/api/morning-brief?home=1')
      .then(r => r.json())
      .then(d => { if (d.briefing) setBriefMini(d.briefing); })
      .catch(() => {});
    // 위젯의 지수 숫자는 저장된 브리핑이 아니라 실시간으로 (미국 포함)
    fetch('/api/indices')
      .then(r => r.json())
      .then(d => setLiveIdx(Object.fromEntries((d.indices || []).map(i => [i.key, i]))))
      .catch(() => {});
  }, []);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setQuery(q);
      window.history.replaceState({}, '', '/');
      setTimeout(async () => {
        try {
          // 토스 종목 목록(국내·미국·ETF 포함)을 먼저 쓰고, 없으면 기존 검색
          await loadStockList().catch(() => null);
          let results = searchTossStocks(q) || [];
          if (!results.length) {
            const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
            results = (await res.json()).results || [];
          }
          if (results.length > 0) setSelectedStock(results[0]);
        } catch { }
      }, 100);
    }
  }, [searchParams]);

  const PRICE_TTL = 5 * 60 * 1000;
  const getPriceCache = (symbol) => {
    try { const c = JSON.parse(localStorage.getItem(`wl_${symbol}`) || 'null'); if (c && Date.now() - c.ts < PRICE_TTL) return c.v; } catch {}
    return null;
  };
  const setPriceCache = (symbol, data) => {
    try { localStorage.setItem(`wl_${symbol}`, JSON.stringify({ v: data, ts: Date.now() })); } catch {}
  };

  const loadWishlistStocks = async () => {
    setWishlistLoading(true);
    const cached = wishlist.map(item => {
      const c = getPriceCache(item.symbol);
      if (!c) return null;
      return { ...c, registeredReturn: item.registeredPrice > 0 ? ((c.currentPrice - item.registeredPrice) / item.registeredPrice * 100).toFixed(2) : null };
    });
    const allCached = cached.every(Boolean);
    if (allCached) { setWishlistStocks(cached); setWishlistLoading(false); return; }
    if (cached.some(Boolean)) { setWishlistStocks(cached.filter(Boolean)); setWishlistLoading(false); }
    const stocks = await Promise.all(wishlist.map(async (item, i) => {
      if (cached[i]) return cached[i];
      try {
        const res = await fetch(`/api/stock?symbol=${item.symbol}&timeframe=daily`);
        const data = await res.json();
        const result = { symbol: item.symbol, name: data.nameKr || data.name, currentPrice: data.currentPrice, change: data.change, changePercent: data.changePercent, registeredPrice: item.registeredPrice, registeredReturn: item.registeredPrice > 0 ? ((data.currentPrice - item.registeredPrice) / item.registeredPrice * 100).toFixed(2) : null };
        setPriceCache(item.symbol, result);
        return result;
      } catch { return null; }
    }));
    setWishlistStocks(stocks.filter(Boolean));
    setWishlistLoading(false);
  };

  const loadTopStocks = async () => {
    setTopLoading(true);
    try {
      // 토스 랭킹 우선(국내+미국), 시가총액이거나 실패하면 기존 KRX 경로
      let list = null;
      if (tossRankable(topType)) {
        try { list = await fetchTossRanking(topType, topCountry); }
        catch (e) { console.warn('토스 랭킹 실패, 기존 경로 사용:', e.message); }
      }
      if (!list && topCountry === 'KR') {
        const res = await fetch(`/api/top?type=${topType}`);
        list = (await res.json()).stocks || [];
      }
      setTopStocks(list || []);
      const now = new Date();
      setTopUpdatedAt(`${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    } catch { setTopStocks([]); } finally { setTopLoading(false); }
  };

  // 대기 주문이 체결·취소되면 현금/보유를 다시 읽는다
  useEffect(() => {
    const reload = () => { if (selectedStock) loadUserData(selectedStock.symbol); };
    window.addEventListener('paper-orders-changed', reload);
    return () => window.removeEventListener('paper-orders-changed', reload);
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 의도적으로 표시한 값이 바뀔 때만 실행 (함수는 매 렌더 새로 만들어져 넣으면 무한 반복)
  }, [selectedStock?.symbol, user]);

  const us = isUsStock(selectedStock);
  useEffect(() => {
    if (!us) return;
    let off = false;
    const load = () => fetchFxRate().then((v) => { if (!off) setFx(v); }).catch(() => {});
    load();
    const id = setInterval(load, 60000);
    return () => { off = true; clearInterval(id); };
  }, [us]);

  const loadUserData = async (symbol) => {
    if (!user) return;
    try {
      const profileRef = doc(db, 'profiles', user.uid);
      const profileSnap = await getDoc(profileRef);
      if (profileSnap.exists()) {
        setWishlist(normalizeWishlist(profileSnap.data().wishlist));
        setUserProfile(profileSnap.data());
      } else {
        await setDoc(profileRef, { username: user.displayName, cash: 10000000, initialAsset: 10000000, createdAt: serverTimestamp() });
        setUserProfile({ cash: 10000000, initialAsset: 10000000 });
      }
      const holdingSnap = await getDoc(doc(db, 'holdings', `${user.uid}_${symbol}`));
      setUserHolding(holdingSnap.exists() ? holdingSnap.data() : null);
    } catch (e) { console.error(e); }
  };

  const loadNews = async (stockName) => {
    setNewsLoading(true);
    setNews([]);
    setAllNews([]);
    try {
      const res = await fetch(`/api/news?q=${encodeURIComponent(stockName)}`);
      const data = await res.json();
      setNews(data.articles || []);
      setAllNews(data.allArticles || data.articles || []);
    } catch (e) { console.error(e); } finally { setNewsLoading(false); }
  };

  const analyzeNews = async () => {
    if (news.length === 0) return;
    setNewsAnalyzing(true);
    setNewsError('');
    try {
      const res = await authFetch('/api/news/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ news: allNews, stockName: chartData?.name }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setNewsAnalysis(data);
    } catch (e) { console.error(e); setNewsError('감성분석에 실패했어요. 잠시 후 다시 시도해 주세요.'); } finally { setNewsAnalyzing(false); }
  };


  const loadChart = async () => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    setLive(null);
    try {
      // 토스(게이트웨이) 우선, 실패하면 기존 /api/stock 으로 대체
      let data = null;
      if (canUseToss(selectedStock)) {
        try { data = await fetchTossStock(selectedStock.symbol, timeframe); }
        catch (e) { console.warn('토스 차트 실패, 기존 경로 사용:', e.message); }
      }
      if (!data) {
        const res = await fetch(`/api/stock?symbol=${selectedStock.symbol}&timeframe=${isMinuteTf(timeframe) ? 'minute' : timeframe}`);
        data = await res.json();
        if (data.error) throw new Error(data.error);
      }
      setChartData(data);
      if (data.chartData?.length > 0) setChartVolumeProfile(volumeProfile(data.chartData, 10, isUsStock(selectedStock)));
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const initChart = async () => {
    if (!chartContainerRef.current) return;
    const token = ++initTokenRef.current;
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    await new Promise(resolve => setTimeout(resolve, 100));
    const LWC = await import('lightweight-charts');
    // 대기 중에 다시 호출됐다면 이전 호출은 버린다 (차트가 겹겹이 생기는 것 방지)
    if (token !== initTokenRef.current || !chartContainerRef.current) return;
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    const chart = LWC.createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      // 전체화면이면 남은 화면 높이를 모두 쓴다
      height: chartFs ? Math.max(200, chartContainerRef.current.clientHeight) : CHART_H + SUB_PANE_H * ((showRSI ? 1 : 0) + (showMACD ? 1 : 0)),
      // 터치: 세로 스크롤은 페이지에 양보하고 가로 드래그/핀치만 차트가 처리
      handleScroll: { mouseWheel: true, pressedMouseMove: true, horzTouchDrag: true, vertTouchDrag: false },
      handleScale: { mouseWheel: true, pinch: true, axisPressedMouseMove: true },
      kineticScroll: { touch: true, mouse: false },
      grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
      crosshair: { mode: 1, vertLine: { color: 'rgba(255,255,255,0.25)', labelBackgroundColor: '#334155' }, horzLine: { color: 'rgba(255,255,255,0.25)', labelBackgroundColor: '#334155' } },
      rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)', borderVisible: true, scaleMargins: { top: 0.1, bottom: 0.06 } },
      leftPriceScale: { visible: false },
      // 가격 차트와 거래량 차트를 별도 영역(pane)으로 나누고 사이에 구분선을 둔다. 구분선은 끌어서 높이 조절 가능
      layout: { background: { color: '#0F172A' }, textColor: 'rgba(255,255,255,0.5)', panes: { separatorColor: 'rgba(255,255,255,0.14)', separatorHoverColor: 'rgba(255,255,255,0.25)', enableResize: true } },
      timeScale: { borderColor: 'rgba(255,255,255,0.1)', timeVisible: true, borderVisible: true, rightOffset: 4, minBarSpacing: 2, fixLeftEdge: true, tickMarkFormatter: (t, type) => tickLabel(t, type) },
      localization: { priceFormatter: (price) => isUsStock(selectedStock) ? price.toFixed(2) : Math.round(price).toLocaleString('ko-KR'), timeFormatter: (t) => crossLabel(t) },
    });
    chartRef.current = chart;
    const candleSeries = chart.addSeries(LWC.CandlestickSeries, {
      upColor: '#ef4444', downColor: '#3b82f6',
      borderUpColor: '#ef4444', borderDownColor: '#3b82f6',
      wickUpColor: '#ef4444', wickDownColor: '#3b82f6',
    });
    candleSeries.setData(chartData.chartData);
    candleSeriesRef.current = candleSeries;
    // 거래량: 아래쪽 별도 영역(pane 1) + 거래량 20 이평선
    const volumeSeries = chart.addSeries(LWC.HistogramSeries, {
      color: '#6b7280', priceFormat: { type: 'volume' }, priceLineVisible: false,
    }, 1);
    volumeSeriesRef.current = volumeSeries;
    volumeSeries.setData(chartData.chartData.map(d => ({
      time: d.time, value: d.volume ?? 0,
      color: d.close >= d.open ? '#ef444499' : '#3b82f699',
    })));
    const vols = chartData.chartData.map(d => d.volume ?? 0);
    if (vols.length >= 20) {
      const volMa = chart.addSeries(LWC.LineSeries, { color: '#a855f7', lineWidth: 1, priceFormat: { type: 'volume' }, priceLineVisible: false, lastValueVisible: false, crosshairMarkerVisible: false }, 1);
      let sum = 0;
      volMa.setData(chartData.chartData.map((d, i) => { sum += vols[i]; if (i >= 20) sum -= vols[i - 20]; return i >= 19 ? { time: d.time, value: sum / 20 } : { time: d.time }; }));
    }
    chart.priceScale('right', 1).applyOptions({ scaleMargins: { top: 0.15, bottom: 0 } });
    // 보조지표 영역 (거래량 아래로 하나씩)
    const closesAll = chartData.chartData.map(d => d.close);
    let nextPane = 2;
    if (showRSI && closesAll.length > 15) {
      const rsi = calcRsiSeries(closesAll, 14);
      const s1 = chart.addSeries(LWC.LineSeries, { color: '#eab308', lineWidth: 1.5, priceLineVisible: false, title: 'RSI 14', priceFormat: { type: 'price', precision: 1, minMove: 0.1 }, autoscaleInfoProvider: () => ({ priceRange: { minValue: 0, maxValue: 100 } }) }, nextPane);
      s1.setData(chartData.chartData.map((d, i) => (rsi[i] == null ? { time: d.time } : { time: d.time, value: rsi[i] })));
      s1.createPriceLine({ price: 70, color: '#f8717188', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
      s1.createPriceLine({ price: 30, color: '#60a5fa88', lineWidth: 1, lineStyle: 2, axisLabelVisible: false });
      nextPane++;
    }
    if (showMACD && closesAll.length > 35) {
      const { macd, signal, hist } = calcMacd(closesAll);
      const prec = isUsStock(selectedStock) ? { type: 'price', precision: 2, minMove: 0.01 } : { type: 'price', precision: 0, minMove: 1 };
      const h = chart.addSeries(LWC.HistogramSeries, { priceLineVisible: false, lastValueVisible: false, priceFormat: prec }, nextPane);
      h.setData(chartData.chartData.map((d, i) => (hist[i] == null ? { time: d.time } : { time: d.time, value: hist[i], color: hist[i] >= 0 ? '#ef444488' : '#3b82f688' })));
      const m = chart.addSeries(LWC.LineSeries, { color: '#ec4899', lineWidth: 1.5, priceLineVisible: false, title: 'MACD', priceFormat: prec }, nextPane);
      m.setData(chartData.chartData.map((d, i) => (macd[i] == null ? { time: d.time } : { time: d.time, value: macd[i] })));
      const sg = chart.addSeries(LWC.LineSeries, { color: '#94a3b8', lineWidth: 1, priceLineVisible: false, lastValueVisible: false, priceFormat: prec }, nextPane);
      sg.setData(chartData.chartData.map((d, i) => (signal[i] == null ? { time: d.time } : { time: d.time, value: signal[i] })));
      nextPane++;
    }
    const panes = chart.panes();
    const subs = panes.length - 2;
    if (panes.length > 1) {
      panes[0].setStretchFactor(subs ? 0.56 - (subs - 1) * 0.08 : 0.76);
      panes[1].setStretchFactor(subs ? 0.16 : 0.24);
      for (let k = 2; k < panes.length; k++) panes[k].setStretchFactor(subs === 1 ? 0.28 : 0.2);
    }
    // 처음엔 최근 구간만 크게 보여주고, 왼쪽으로 밀면 과거 데이터가 나온다
    const total = chartData.chartData.length;
    const showBars = { m1: 120, m3: 100, m5: 90, m10: 90, m15: 80, m30: 80, m60: 70, daily: 90, weekly: 80, monthly: 60, yearly: 30 }[timeframe] || 90;
    chart.timeScale().setVisibleLogicalRange({ from: Math.max(0, total - showBars), to: total + 4 });
    // 시가/고가/저가/종가 정보 줄: 십자선이 가리키는 봉(없으면 마지막 봉)을 DOM 에 직접 써서 페이지를 다시 그리지 않는다
    const bars = chartData.chartData;
    const idxByTime = new Map(bars.map((d, i) => [d.time, i]));
    const fmtP = (n) => (isUsStock(selectedStock) ? n.toFixed(2) : Math.round(n).toLocaleString('ko-KR'));
    const fmtT = (t) => (typeof t === 'number' ? new Date(t * 1000).toISOString().slice(5, 16).replace('T', ' ') : String(t));
    const showBar = (i) => {
      const d = bars[i];
      if (!d || !ohlcRef.current) return;
      const prev = i > 0 ? bars[i - 1].close : d.open;
      const pct = prev ? ((d.close - prev) / prev) * 100 : 0;
      const col = pct >= 0 ? '#fca5a5' : '#93c5fd';
      ohlcRef.current.innerHTML = `<b style="color:#fff">${fmtT(d.time)}</b> 시 ${fmtP(d.open)} 고 ${fmtP(d.high)} 저 ${fmtP(d.low)} 종 <b style="color:${col}">${fmtP(d.close)} (${pct >= 0 ? '+' : ''}${pct.toFixed(2)}%)</b> 거래량 ${Math.round(d.volume || 0).toLocaleString()}`;
    };
    showBar(bars.length - 1);
    chart.subscribeCrosshairMove((p) => {
      const i = p.time !== undefined ? idxByTime.get(p.time) : undefined;
      showBar(i !== undefined ? i : bars.length - 1);
    });
    if (userHolding?.avgPrice) {
      candleSeries.createPriceLine({ price: userHolding.avgPrice, color: '#f59e0b', lineWidth: 2, lineStyle: 1, axisLabelVisible: true, title: `평단가 ${fmtPx(userHolding.avgPrice, userHolding.market === 'US')}` });
    }
    if (userHolding?.avgPrice && chartData?.currentPrice) {
      const profitRate = ((chartData.currentPrice - userHolding.avgPrice) / userHolding.avgPrice * 100).toFixed(2);
      candleSeries.createPriceLine({ price: chartData.currentPrice, color: chartData.currentPrice >= userHolding.avgPrice ? '#ef4444' : '#3b82f6', lineWidth: 1, lineStyle: 2, axisLabelVisible: true, title: `현재가 (${profitRate >= 0 ? '+' : ''}${profitRate}%)` });
    }
    const profileData = chartVolumeProfile.length > 0 ? chartVolumeProfile : (indicators?.volumeProfile || []);
    if (showVolumeProfile && profileData.length > 0) {
      const maxStrength = Math.max(...profileData.map(p => p.strength));
      profileData.forEach((profile) => {
        const alpha = Math.round((profile.strength / maxStrength) * 180);
        const alphaHex = alpha.toString(16).padStart(2, '0');
        const color = `#8b5cf6${alphaHex}`;
        candleSeries.createPriceLine({ price: profile.priceTo, color, lineWidth: 1, lineStyle: 0, axisLabelVisible: false });
        candleSeries.createPriceLine({ price: profile.priceFrom, color, lineWidth: 1, lineStyle: 0, axisLabelVisible: false });
        candleSeries.createPriceLine({ price: isUsStock(selectedStock) ? Math.round((profile.priceFrom + profile.priceTo) * 50) / 100 : Math.round((profile.priceFrom + profile.priceTo) / 2), color, lineWidth: Math.round((profile.strength / maxStrength) * 5) + 1, lineStyle: 0, axisLabelVisible: true, title: `매물대 ${profile.strength}%` });
      });
    }
    if (showMA && chartData.chartData.length >= 5) {
      const maCloses = chartData.chartData.map(d => d.close);
      const smaOf = (period) => maCloses.map((_, i) =>
        i < period - 1 ? null : maCloses.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period
      );
      [{ period: 5, color: '#ef4444' }, { period: 20, color: '#f59e0b' }, { period: 60, color: '#3b82f6' }].forEach(({ period, color }) => {
        if (maCloses.length < period) return;
        const vals = smaOf(period);
        const maSeries = chart.addSeries(LWC.LineSeries, { color, lineWidth: 1, priceLineVisible: false, lastValueVisible: false });
        maSeries.setData(chartData.chartData.map((d, i) => ({ time: d.time, value: vals[i] })).filter(d => d.value !== null));
      });
    }
    if (showBB && chartData.chartData.length >= 20) {
      const bbCloses = chartData.chartData.map(d => d.close);
      const upperData = [], lowerData = [];
      for (let i = 19; i < bbCloses.length; i++) {
        const slice = bbCloses.slice(i - 19, i + 1);
        const mean = slice.reduce((a, b) => a + b, 0) / 20;
        const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - mean, 2), 0) / 20);
        upperData.push({ time: chartData.chartData[i].time, value: mean + 2 * std });
        lowerData.push({ time: chartData.chartData[i].time, value: mean - 2 * std });
      }
      const bbOpts = { color: '#3b82f699', lineWidth: 1, lineStyle: 2, priceLineVisible: false, lastValueVisible: false };
      chart.addSeries(LWC.LineSeries, bbOpts).setData(upperData);
      chart.addSeries(LWC.LineSeries, bbOpts).setData(lowerData);
    }
    if (showVWAP) {
      const recent = chartData.chartData.slice(-20);
      const totalVol = recent.reduce((a, d) => a + (d.volume || 0), 0);
      const vwap = totalVol > 0
        ? recent.reduce((a, d) => a + ((d.high + d.low + d.close) / 3) * (d.volume || 0), 0) / totalVol
        : chartData.currentPrice;
      candleSeries.createPriceLine({ price: isUsStock(selectedStock) ? Math.round(vwap * 100) / 100 : Math.round(vwap), color: '#06b6d4', lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: `VWAP ${fmtP(vwap)}` });
    }
    if (showHL) {
      const allCandles = chartData.chartData;
      const high52 = Math.max(...allCandles.map(d => d.high));
      const low52  = Math.min(...allCandles.map(d => d.low));
      candleSeries.createPriceLine({ price: high52, color: '#ef444488', lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: `고점 ${high52.toLocaleString()}` });
      candleSeries.createPriceLine({ price: low52,  color: '#22c55e88', lineWidth: 1, lineStyle: 3, axisLabelVisible: true, title: `저점 ${low52.toLocaleString()}` });
    }
    // 마커: 화면에 보이는 구간의 최고·최저가(현재가 대비 %) + AI 예측. 화면을 밀거나 확대하면 다시 계산
    const aiMarker = [];
    if (analysis?.daily?.prediction && bars.length > 0) {
      const pred = analysis.daily.prediction, isUp = pred === '상승', flat = pred === '횡보';
      aiMarker.push({ time: bars[bars.length - 1].time, position: isUp ? 'belowBar' : 'aboveBar', color: flat ? '#94a3b8' : isUp ? '#ef4444' : '#3b82f6', shape: flat ? 'circle' : isUp ? 'arrowUp' : 'arrowDown', text: `AI ${pred}`, size: flat ? 1 : 2 });
    }
    const markers = LWC.createSeriesMarkers(candleSeries, aiMarker);
    const cur = bars[bars.length - 1]?.close || 0;
    let raf = 0;
    const markHiLo = () => {
      raf = 0;
      const r = chart.timeScale().getVisibleLogicalRange();
      if (!r) return;
      const from = Math.max(0, Math.ceil(r.from)), to = Math.min(bars.length - 1, Math.floor(r.to));
      if (to <= from) return;
      let hi = from, lo = from;
      for (let i = from; i <= to; i++) { if (bars[i].high > bars[hi].high) hi = i; if (bars[i].low < bars[lo].low) lo = i; }
      const pct = (p) => { const v = ((cur - p) / p) * 100; return `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`; };
      const hl = [
        { time: bars[hi].time, position: 'aboveBar', color: '#f87171', shape: 'arrowDown', size: 0.6, text: `최고 ${fmtP(bars[hi].high)} (${pct(bars[hi].high)})` },
        { time: bars[lo].time, position: 'belowBar', color: '#60a5fa', shape: 'arrowUp', size: 0.6, text: `최저 ${fmtP(bars[lo].low)} (${pct(bars[lo].low)})` },
      ];
      markers.setMarkers([...hl, ...aiMarker].sort((a, b) => (a.time > b.time ? 1 : a.time < b.time ? -1 : 0)));
    };
    markHiLo();
    chart.timeScale().subscribeVisibleLogicalRangeChange(() => { if (!raf) raf = requestAnimationFrame(markHiLo); });
    const handleResize = () => {
      const el = chartContainerRef.current;
      if (el) chart.applyOptions(chartFs ? { width: el.clientWidth, height: Math.max(200, el.clientHeight) } : { width: el.clientWidth });
    };
    if (resizeHandlerRef.current) window.removeEventListener('resize', resizeHandlerRef.current);
    resizeHandlerRef.current = handleResize;
    window.addEventListener('resize', handleResize);
  };

  const handleChipToggle = (key, currentActive, setter) => {
    if (tooltipTimer.current) clearTimeout(tooltipTimer.current);
    const next = !currentActive;
    setter(next);
    if (next) {
      setActiveTooltip(key);
      tooltipTimer.current = setTimeout(() => setActiveTooltip(null), 4500);
    } else {
      setActiveTooltip(k => k === key ? null : k);
    }
  };

  const handleAnalyze = async () => {
    if (!chartData) return;
    setAnalyzing(true);
    setError(null);
    try {
      // 분석은 항상 일봉으로 한다 (분봉·주봉 차트를 보고 있어도 지표는 일 단위여야 함)
      let bars = chartData.chartData;
      if (timeframe !== 'daily') {
        let daily = null;
        if (canUseToss(selectedStock)) daily = await fetchTossStock(selectedStock.symbol, 'daily').catch(() => null);
        if (!daily) daily = await fetch(`/api/stock?symbol=${selectedStock.symbol}&timeframe=daily`).then((r) => r.json()).catch(() => null);
        if (!daily?.chartData?.length) throw new Error('일봉 데이터를 불러오지 못했습니다');
        bars = daily.chartData;
      }
      // 마지막 봉을 지금 가격으로 맞춘다 (분석 기준가 = 기록에 남는 현재가)
      const priceNow = live?.price || chartData.currentPrice;
      if (priceNow > 0) {
        const last = bars[bars.length - 1];
        bars = [...bars.slice(0, -1), { ...last, close: priceNow, high: Math.max(last.high, priceNow), low: Math.min(last.low, priceNow) }];
      }
      // 지표(이평·RSI 등)를 만들려면 일봉이 최소 10개는 있어야 한다 (막 상장한 종목은 며칠치뿐)
      if (bars.length < 10) throw new Error(`상장한 지 얼마 안 돼서 일봉이 ${bars.length}개뿐이에요. 거래일이 10일 넘게 쌓이면 분석할 수 있어요.`);
      // 국내 종목은 토스 수급을 같이 보낸다 (실패해도 분석은 진행)
      const supply = !us && canUseToss(selectedStock) ? await fetchSupplySummary(selectedStock.symbol).catch(() => null) : null;
      const res = await authFetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chartData: bars, stockName: chartData.name, symbol: selectedStock.symbol, newsData: allNews, market: us ? 'US' : 'KR',
          supply: supply?.text || '', supplyNet: supply?.net || null,
          newsSentiment: newsAnalysis ? { sentiment: newsAnalysis.sentiment, score: newsAnalysis.score } : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok || data.error) throw new Error(data.error || `서버 오류 (${res.status})`);
      setAnalysis(data.analysis);
      setIndicators(data.indicators);
      const now = new Date();
      const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setAnalysisCache(prev => ({ ...prev, [selectedStock.symbol]: { analysis: data.analysis, indicators: data.indicators, analyzedAt: dateStr } }));
      if (user) {
        try {
          const n = new Date();
          await addDoc(collection(db, 'analysisHistory'), {
            userId: user.uid, symbol: selectedStock.symbol, engine: 2,
            name: chartData.name, nameKr: selectedStock.name || chartData.nameKr || chartData.name,
            analyzedAt: serverTimestamp(), analyzedAtStr: dateStr, currentPrice: data.indicators?.currentPrice || chartData.currentPrice,
            summary: data.analysis.summary, probability: data.analysis.probability,
            confidence: data.analysis.confidence, keySignals: data.analysis.keySignals || [],
            indicatorScore: data.analysis.indicatorScore ?? null, newsScore: data.analysis.scoreBreakdown?.news?.score ?? null,
            daily: { ...data.analysis.daily, evalStatus: 'pending', evalPrice: null, evalAt: null, evalDueAt: addBusinessDays(n, 1).toISOString() },
            weekly: { ...data.analysis.weekly, evalStatus: 'pending', evalPrice: null, evalAt: null, evalDueAt: addBusinessDays(n, 5).toISOString() },
            monthly: { ...data.analysis.monthly, evalStatus: 'pending', evalPrice: null, evalAt: null, evalDueAt: addBusinessDays(n, 20).toISOString() },
          });
        } catch (e) { console.error(e); }
      }
    } catch (e) {
      // 'Load failed'(Safari) / 'Failed to fetch'(Chrome): 응답을 받기 전에 연결이 끊김 (기다리는 동안 화면을 끄거나 앱을 바꾼 경우 등)
      setError(/load failed|failed to fetch|networkerror/i.test(e.message) ? '분석 응답을 받기 전에 연결이 끊겼어요. 다시 눌러 주세요.' : e.message);
    } finally { setAnalyzing(false); }
  };

  const handleTrade = async () => {
    if (!userProfile) { setTradeError('사용자 정보를 불러오는 중입니다'); return; }
    if (!tradePrice && priceType === 'limit') { setTradeError('가격을 입력해주세요'); return; }
    if (!tradeQty || Number(tradeQty) <= 0 || !Number.isInteger(Number(tradeQty))) { setTradeError('수량을 정수로 입력해주세요'); return; }
    const qty = Number(tradeQty);
    if (tradeType === 'sell' && (!userHolding || qty > userHolding.quantity)) { setTradeError('보유 수량이 부족합니다'); return; }
    setTradeProcessing(true);
    setTradeError('');
    try {
      const name = chartData.name;
      const { mode, price } = await prepareOrder({
        symbol: selectedStock.symbol, name, type: tradeType, priceType, limitPrice: tradePrice,
        fallbackPrice: live?.price || chartData.currentPrice, us,
      });
      if (mode === 'rest') {
        await placeLimitOrder({ uid: user.uid, symbol: selectedStock.symbol, name, type: tradeType, price, qty, us });
        addToast(`${tradeType === 'buy' ? '매수' : '매도'} ${fmtPx(price, us)} ${qty}주 미체결 주문 등록`, 'info');
      } else {
        await executeFill({ uid: user.uid, symbol: selectedStock.symbol, name, type: tradeType, price, qty, orderType: priceType, us });
      }
      setTradeModal(false); setTradeQty(''); setTradePrice(''); setTradeError('');
      await loadUserData(selectedStock.symbol);
    } catch (e) { setTradeError(e.message || '처리 실패'); } finally { setTradeProcessing(false); }
  };

  // 관심종목 추가/해제. 추가할 때는 지금 보고 있는 종목의 현재가를 등록가로 남긴다
  const toggleWishlist = async (symbol, name) => {
    if (!user) return;
    const price = selectedStock?.symbol === symbol ? chartData?.currentPrice : 0;
    try { setWishlist(await toggleWish(user.uid, wishlist, { symbol, name, price })); } catch (e) { console.error(e); }
  };

  // 관심종목 그룹 지정 (group 이 '' 이면 그룹 해제). profiles.wishlist 항목에 group 필드로 저장
  const setStockGroup = async (symbol, group) => {
    if (!user) return;
    const updated = wishlist.map(w => w.symbol === symbol ? { ...w, group: group || '' } : w);
    try {
      setWishlist(await saveWishlist(user.uid, updated));
    } catch (e) { console.error(e); addToast('그룹을 저장하지 못했어요', 'error'); }
    setGroupSheet(null); setNewGroupName('');
  };

  const handleSelectStock = (stock) => {
    const item = { symbol: stock.symbol, name: stock.name, exchange: stock.exchange || '' };
    const updated = [item, ...recentSearches.filter(s => s.symbol !== stock.symbol)].slice(0, 6);
    setRecentSearches(updated);
    try { localStorage.setItem('recentStockSearches', JSON.stringify(updated)); } catch {}
    setSelectedStock(stock);
    setQuery(stock.name);
    setSearchResults([]);
    setSearchFocused(false);
  };

  const removeRecentSearch = (symbol) => {
    const updated = recentSearches.filter(s => s.symbol !== symbol);
    setRecentSearches(updated);
    try { localStorage.setItem('recentStockSearches', JSON.stringify(updated)); } catch {}
  };

  const getStockColor = (name, symbol) => {
    const n = (name || '').toLowerCase();
    if (/반도체|하이닉스|soc|sk하이/.test(n)) return ['#0EA5E9', '#6366F1'];
    if (/전자|삼성|lg전/.test(n)) return ['#6366F1', '#8B5CF6'];
    if (/바이오|제약|메디|헬스/.test(n)) return ['#10B981', '#06B6D4'];
    if (/카카오|네이버|크래프/.test(n)) return ['#F59E0B', '#F97316'];
    if (/자동차|현대|기아|모빌/.test(n)) return ['#EF4444', '#F97316'];
    if (/금융|은행|증권|보험|캐피/.test(n)) return ['#8B5CF6', '#EC4899'];
    if (/에너지|화학|케미|배터리|셀/.test(n)) return ['#A855F7', '#6366F1'];
    if (/건설|대림|포스/.test(n)) return ['#F97316', '#EF4444'];
    const palettes = [
      ['#6366F1','#8B5CF6'], ['#0EA5E9','#06B6D4'], ['#10B981','#34D399'],
      ['#F59E0B','#F97316'], ['#EF4444','#EC4899'], ['#14B8A6','#06B6D4'],
    ];
    const seed = ((symbol || name || '').charCodeAt(0) || 0) + ((symbol || '').charCodeAt(1) || 0);
    return palettes[seed % palettes.length];
  };

  const getPrevDateText = () => {
    const d = chartData?.chartData?.[chartData.chartData.length - 2];
    if (!d || typeof d.time !== 'string') return '전일 대비'; // 분봉은 시각이 숫자
    const parts = d.time.slice(5).split('-');
    return `${parts[0]}월 ${parts[1]}일 대비`;
  };

  const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    visible: (i = 0) => ({
      opacity: 1, y: 0,
      transition: { duration: 0.42, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }
    }),
  };

  const isWished = selectedStock ? hasWish(wishlist, selectedStock.symbol) : false;
  const wishMeta = new Map(wishlist.map((w, i) => [w.symbol, { group: w.group || '', order: i }]));
  const wishGroups = [...new Set(wishlist.map(w => w.group).filter(Boolean))];
  const activeWishGroup = wishGroup !== 'all' && !wishGroups.includes(wishGroup) ? 'all' : wishGroup;
  const shownWishStocks = wishlistStocks
    .filter(s => activeWishGroup === 'all' || wishMeta.get(s.symbol)?.group === activeWishGroup)
    .sort((a, b) => {
      if (wishSort === 'up') return (b.changePercent ?? -999) - (a.changePercent ?? -999);
      if (wishSort === 'down') return (a.changePercent ?? 999) - (b.changePercent ?? 999);
      if (wishSort === 'return') return (Number(b.registeredReturn) || -999) - (Number(a.registeredReturn) || -999);
      if (wishSort === 'name') return String(a.name).localeCompare(String(b.name), 'ko');
      return (wishMeta.get(b.symbol)?.order ?? 0) - (wishMeta.get(a.symbol)?.order ?? 0); // 최근 등록순
    });
  const shownPrice = live ? live.price : chartData?.currentPrice;
  const shownChange = live ? live.price - live.prevClose : chartData?.change;
  const shownPct = live ? (live.prevClose ? (shownChange / live.prevClose) * 100 : 0) : chartData?.changePercent;
  const priceUp = chartData ? shownChange >= 0 : true;

  // ─── 트레이드 바가 보이는지 여부 ─────────────────────────────────────────
  const showTradeBar = selectedStock && !loading && chartData;
  // 대기 주문이 묶어둔 금액·수량은 뺀 값
  const orderableCash = (userProfile?.cash || 0) - (userProfile?.reservedCash || 0);
  const sellableQty = (userHolding?.quantity || 0) - (userHolding?.reservedQty || 0);

  return (
    <>
      <style>{`
        @keyframes fadeSlideUp {
          from { opacity: 0; transform: translateY(14px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to { transform: translateY(0); }
        }
        @keyframes starPulse {
          0%, 100% { filter: drop-shadow(0 0 4px #fbbf24) drop-shadow(0 0 8px #f59e0b); transform: scale(1); }
          50% { filter: drop-shadow(0 0 8px #fbbf24) drop-shadow(0 0 20px #f59e0b); transform: scale(1.15); }
        }
        @keyframes shimmerAnim {
          0% { background-position: -200% 0; }
          100% { background-position: 200% 0; }
        }
        .sk { background: linear-gradient(90deg, #F0F4F8 25%, #E2E8F0 50%, #F0F4F8 75%); background-size: 200% 100%; animation: shimmerAnim 1.4s infinite; border-radius: 8px; }
        .trade-btn { transition: all 0.18s ease; }
        .trade-btn:active { transform: scale(0.97); opacity: 0.9; }
      `}</style>

      {/*
        ✅ [FIX 1] paddingBottom을 동적으로 조절
        - 종목 선택시: 네비게이션(66) + 트레이드바(130) + 여유(12) = 208px
        - 홈화면: 기존 80px 유지
      */}
      <main style={{
        minHeight: '100vh',
        background: '#F0F4F8',
        paddingBottom: '80px',
      }}>

        {/* ══════════════════ HEADER ══════════════════ */}
        <div style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E3A5F 100%)', position: 'relative' }}>
          <div style={{ position: 'absolute', inset: 0, overflow: 'hidden', pointerEvents: 'none' }}>
            <div style={{ position: 'absolute', top: -40, right: -40, width: 140, height: 140, borderRadius: '50%', background: 'rgba(99,102,241,0.18)', filter: 'blur(50px)' }} />
            <div style={{ position: 'absolute', bottom: -20, left: 10, width: 90, height: 90, borderRadius: '50%', background: 'rgba(59,130,246,0.13)', filter: 'blur(35px)' }} />
          </div>
          <div style={{ position: 'relative', zIndex: 10, padding: '16px 16px 22px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <button
                onClick={() => { setSelectedStock(null); setQuery(''); setChartData(null); setAnalysis(null); setIndicators(null); setError(null); setSearchFocused(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <span style={{ fontSize: 18, fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>주식 AI 분석</span>
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button
                  aria-label="강력 새로고침"
                  onClick={async () => {
                    try { const ks = await caches.keys(); await Promise.all(ks.map((k) => caches.delete(k))); } catch {}
                    window.location.replace(`${window.location.pathname}?r=${Date.now()}`);
                  }}
                  style={{ fontSize: 13, padding: '3px 8px', marginRight: 6, background: 'rgba(255,255,255,0.1)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }}
                >🔄</button>
                <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>👤 {user?.displayName}</span>
                <button onClick={logout} style={{ fontSize: 11, padding: '5px 10px', background: 'rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.8)', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', cursor: 'pointer' }}>로그아웃</button>
              </div>
            </div>
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  type="text" value={query}
                  onChange={(e) => { setQuery(e.target.value); if (selectedStock) setSelectedStock(null); }}
                  onFocus={() => { clearTimeout(searchBlurTimeout.current); setSearchFocused(true); }}
                  onBlur={() => { searchBlurTimeout.current = setTimeout(() => setSearchFocused(false), 180); }}
                  placeholder="종목명 검색 (삼성전자, 카카오...)"
                  style={{ flex: 1, padding: '12px 16px', borderRadius: 14, border: searchFocused ? '1.5px solid rgba(255,255,255,0.5)' : '1.5px solid rgba(255,255,255,0.2)', background: searchFocused ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.1)', backdropFilter: 'blur(10px)', color: 'white', fontSize: 14, outline: 'none', transition: 'all 0.2s ease' }}
                />
              </div>
              {searchFocused && !selectedStock && (searchResults.length > 0 || recentSearches.length > 0 || topStocks.length > 0) && (
                <div style={{ position: 'fixed', left: 14, right: 14, top: 'auto', marginTop: 6, background: 'white', borderRadius: 18, border: '1px solid #E2E8F0', boxShadow: '0 12px 48px rgba(0,0,0,0.18)', zIndex: 9999, overflow: 'hidden', animation: 'fadeSlideUp 0.15s ease-out', maxHeight: '70vh', overflowY: 'auto' }}>
                  {searchResults.length > 0 ? (
                    <div>
                      <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', padding: '10px 16px 4px', letterSpacing: '0.5px' }}>검색 결과</p>
                      {searchResults.map((stock) => (
                        <button key={stock.symbol} onMouseDown={() => handleSelectStock(stock)}
                          style={{ width: '100%', padding: '11px 16px', textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', border: 'none', borderBottom: '1px solid #F8FAFC' }}
                          onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                          onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                            {(() => { const [c1, c2] = getStockColor(stock.name, stock.symbol); return (<div style={{ width: 30, height: 30, borderRadius: '50%', background: `linear-gradient(135deg,${c1},${c2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: 'white', flexShrink: 0 }}>{stock.name?.charAt(0)}</div>); })()}
                            <span style={{ fontWeight: 600, color: '#111827', fontSize: 14 }}>{stock.name}</span>
                          </div>
                          <span style={{ fontSize: 11, color: '#9CA3AF' }}>{stock.exchange} · {stock.symbol}</span>
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div>
                      {recentSearches.length > 0 && (
                        <div>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 16px 4px' }}>
                            <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', letterSpacing: '0.5px' }}>최근 검색</p>
                            <button onMouseDown={() => { setRecentSearches([]); try { localStorage.removeItem('recentStockSearches'); } catch {} }} style={{ fontSize: 10, color: '#CBD5E1', background: 'none', border: 'none', cursor: 'pointer' }}>전체 삭제</button>
                          </div>
                          {recentSearches.map((stock) => (
                            <div key={stock.symbol} style={{ display: 'flex', alignItems: 'center', padding: '8px 16px', borderBottom: '1px solid #F8FAFC' }}>
                              <button onMouseDown={() => handleSelectStock(stock)} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 10, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}>
                                {(() => { const [c1, c2] = getStockColor(stock.name, stock.symbol); return (<div style={{ width: 28, height: 28, borderRadius: '50%', background: `linear-gradient(135deg,${c1},${c2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 800, color: 'white', flexShrink: 0, opacity: 0.7 }}>{stock.name?.charAt(0)}</div>); })()}
                                <span style={{ fontSize: 13, fontWeight: 600, color: '#374151' }}>{stock.name}</span>
                                <span style={{ fontSize: 11, color: '#CBD5E1', marginLeft: 4 }}>{stock.symbol}</span>
                              </button>
                              <button onMouseDown={() => removeRecentSearch(stock.symbol)} style={{ fontSize: 14, color: '#D1D5DB', background: 'none', border: 'none', cursor: 'pointer', padding: '0 0 0 8px' }}>×</button>
                            </div>
                          ))}
                        </div>
                      )}
                      {topStocks.length > 0 && (
                        <div>
                          <p style={{ fontSize: 11, fontWeight: 700, color: '#94A3B8', padding: '10px 16px 4px', letterSpacing: '0.5px' }}>🔥 지금 핫한 종목</p>
                          {topStocks.slice(0, 5).map((stock, i) => (
                            <button key={stock.code} onMouseDown={() => handleSelectStock({ symbol: stock.code, name: stock.name, exchange: stock.market || 'KOSPI' })}
                              style={{ width: '100%', padding: '9px 16px', display: 'flex', alignItems: 'center', gap: 10, background: 'white', border: 'none', borderBottom: '1px solid #F8FAFC', cursor: 'pointer', textAlign: 'left' }}
                              onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                              onMouseLeave={e => e.currentTarget.style.background = 'white'}>
                              <span style={{ width: 20, height: 20, borderRadius: 6, background: i < 3 ? 'linear-gradient(135deg,#F59E0B,#F97316)' : '#F1F5F9', color: i < 3 ? 'white' : '#94A3B8', fontSize: 10, fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{i + 1}</span>
                              <span style={{ fontSize: 13, fontWeight: 600, color: '#111827', flex: 1 }}>{stock.name}</span>
                              <span style={{ fontSize: 12, fontWeight: 700, color: stock.changeRate?.includes('+') ? '#EF4444' : '#3B82F6' }}>{stock.changeRate?.includes('%') ? stock.changeRate : `${stock.changeRate}%`}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ══════════════════ BODY ══════════════════ */}
        <div style={{ padding: '14px 14px 0' }}>

          {/* ── STOCK DETAIL VIEW ── */}
          {selectedStock && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

              <PriceHero chartData={chartData} fadeUp={fadeUp} getPrevDateText={getPrevDateText} getStockColor={getStockColor} isWished={isWished} loading={loading} priceUp={priceUp} selectedStock={selectedStock} shownChange={shownChange} shownPct={shownPct} shownPrice={shownPrice} toggleWishlist={toggleWishlist} />
              {error && (
                <div style={{ background: '#fef2f2', border: '1px solid #fca5a5', borderRadius: 16, padding: '12px 16px', fontSize: 13, color: '#dc2626', fontWeight: 500 }}>
                  ⚠️ {error}
                </div>
              )}

              {/* 차트 | 종목정보 탭 (국내 종목) */}
              {!us && (
                <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: 14, padding: 3 }}>
                  {[['chart', '차트'], ['info', '종목정보']].map(([k, label]) => (
                    <button key={k} onClick={() => setInfoTab(k)}
                      style={{ flex: 1, padding: '9px 0', fontSize: 13, fontWeight: 800, borderRadius: 11, border: 'none', cursor: 'pointer',
                        background: infoTab === k ? 'white' : 'transparent', color: infoTab === k ? '#0f172a' : '#64748b',
                        boxShadow: infoTab === k ? '0 1px 4px rgba(0,0,0,0.1)' : 'none', transition: 'background 0.2s ease, color 0.2s ease' }}>{label}</button>
                  ))}
                </div>
              )}

              {infoTab === 'info' && !us ? (
                <motion.div key="tab-info" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}>
                  <StockInfoTab key={selectedStock.symbol} symbol={selectedStock.symbol} name={selectedStock.name || query}
                    onPick={(st) => { setSelectedStock({ ...st, exchange: '' }); setQuery(st.name); }} />
                </motion.div>
              ) : (<motion.div key="tab-chart" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}
                style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <ChartCard CHART_H={CHART_H} MINUTE_TFS={MINUTE_TFS} OVERLAY_INFO={OVERLAY_INFO} activeTooltip={activeTooltip} chartContainerRef={chartContainerRef} chartData={chartData} chartFs={chartFs} handleChipToggle={handleChipToggle} lastMinute={lastMinute} loading={loading} minutePicker={minutePicker} ohlcRef={ohlcRef} portrait={portrait} setActiveTooltip={setActiveTooltip} setChartFs={setChartFs} setLastMinute={setLastMinute} setMinutePicker={setMinutePicker} setShowBB={setShowBB} setShowHL={setShowHL} setShowMA={setShowMA} setShowMACD={setShowMACD} setShowRSI={setShowRSI} setShowVWAP={setShowVWAP} setShowVolumeProfile={setShowVolumeProfile} setTimeframe={setTimeframe} showBB={showBB} showHL={showHL} showMA={showMA} showMACD={showMACD} showRSI={showRSI} showVWAP={showVWAP} showVolumeProfile={showVolumeProfile} shownChange={shownChange} shownPct={shownPct} shownPrice={shownPrice} timeframe={timeframe} tooltipTimer={tooltipTimer} us={us} />
              <OrderCard chartData={chartData} fx={fx} loading={loading} orderableCash={orderableCash} selectedStock={selectedStock} sellableQty={sellableQty} setOcoModal={setOcoModal} setPriceType={setPriceType} setTradeError={setTradeError} setTradeModal={setTradeModal} setTradePrice={setTradePrice} setTradeQty={setTradeQty} setTradeType={setTradeType} showTradeBar={showTradeBar} us={us} user={user} userHolding={userHolding} userProfile={userProfile} />
              <AIAnalysisCard analysis={analysis} analysisCache={analysisCache} analyzing={analyzing} chartData={chartData} fadeUp={fadeUp} handleAnalyze={handleAnalyze} loading={loading} selectedStock={selectedStock} us={us} />
              <MarketCard chartData={chartData} loading={loading} marketTab={marketTab} pickMarketTab={pickMarketTab} selectedStock={selectedStock} setQuery={setQuery} setSelectedStock={setSelectedStock} />
              <NewsCard analyzeNews={analyzeNews} chartData={chartData} fadeUp={fadeUp} loading={loading} news={news} newsAll={newsAll} newsAnalysis={newsAnalysis} newsAnalyzing={newsAnalyzing} newsError={newsError} newsLoading={newsLoading} setNewsAll={setNewsAll} />
              </motion.div>)}
            </div>
          )}

          <HomeScreen activeWishGroup={activeWishGroup} briefMini={briefMini} getStockColor={getStockColor} handleSelectStock={handleSelectStock} homeTab={homeTab} liveIdx={liveIdx} pickHomeTab={pickHomeTab} pickWishSort={pickWishSort} router={router} selectedStock={selectedStock} setGroupSheet={setGroupSheet} setNewGroupName={setNewGroupName} setQuery={setQuery} setSelectedStock={setSelectedStock} setTopCountry={setTopCountry} setTopType={setTopType} setWishGroup={setWishGroup} shownWishStocks={shownWishStocks} toggleWishlist={toggleWishlist} topCountry={topCountry} topLoading={topLoading} topStocks={topStocks} topType={topType} topUpdatedAt={topUpdatedAt} wishGroups={wishGroups} wishMeta={wishMeta} wishSort={wishSort} wishlistLoading={wishlistLoading} wishlistStocks={wishlistStocks} />
        </div>

      </main>

      {/* ══════════════════════════════════════════════════════
          TRADE MODAL — 원본 로직 유지, 셸 개선
      ══════════════════════════════════════════════════════ */}
      <StockModals addToast={addToast} chartData={chartData} fx={fx} groupSheet={groupSheet} handleTrade={handleTrade} live={live} newGroupName={newGroupName} ocoModal={ocoModal} orderableCash={orderableCash} priceType={priceType} selectedStock={selectedStock} sellableQty={sellableQty} setGroupSheet={setGroupSheet} setNewGroupName={setNewGroupName} setOcoModal={setOcoModal} setPriceType={setPriceType} setStockGroup={setStockGroup} setTradeModal={setTradeModal} setTradePrice={setTradePrice} setTradeQty={setTradeQty} setTradeType={setTradeType} tradeError={tradeError} tradeModal={tradeModal} tradePrice={tradePrice} tradeProcessing={tradeProcessing} tradeQty={tradeQty} tradeType={tradeType} us={us} user={user} userHolding={userHolding} wishGroups={wishGroups} wishMeta={wishMeta} />
    </>
  );
}