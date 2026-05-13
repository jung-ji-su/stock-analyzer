'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { addBusinessDays } from '@/lib/evalUtils';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc, setDoc, updateDoc, addDoc, collection, serverTimestamp, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';

export default function Home() {
  const { user, logout } = useAuth();
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
  const [tradeProcessing, setTradeProcessing] = useState(false);
  const [tradeError, setTradeError] = useState('');
  const [wishlist, setWishlist] = useState([]);
  const [wishlistStocks, setWishlistStocks] = useState([]);
  const [news, setNews] = useState([]);
  const [allNews, setAllNews] = useState([]);
  const [newsLoading, setNewsLoading] = useState(false);
  const [newsAnalysis, setNewsAnalysis] = useState(null);
  const [newsAnalyzing, setNewsAnalyzing] = useState(false);
  const [showVolumeProfile, setShowVolumeProfile] = useState(true);
  const [chartVolumeProfile, setChartVolumeProfile] = useState([]);
  const [stockInfo, setStockInfo] = useState(null);
  const [showStockInfo, setShowStockInfo] = useState(false);
  const [stockInfoLoading, setStockInfoLoading] = useState(false);
  const [showFullSummary, setShowFullSummary] = useState(false);

  const [symbol, setSymbol] = useState(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const searchTimeout = useRef(null);
  const searchBlurTimeout = useRef(null);
  const searchParams = useSearchParams();
  const symbolFromQuery = searchParams.get('symbol');

  useEffect(() => {
    if (!loading && !user) router.push('/login');
    if (user) loadWishlist();
  }, [user, loading]);

  useEffect(() => {
    try {
      const stored = JSON.parse(localStorage.getItem('recentStockSearches') || '[]');
      setRecentSearches(stored);
    } catch {}
  }, []);

  const loadWishlist = async () => {
    if (!user) return;
    try {
      const profileSnap = await getDoc(doc(db, 'profiles', user.uid));
      if (profileSnap.exists()) {
        const w = profileSnap.data().wishlist || [];
        setWishlist(w.map(item => typeof item === 'string' ? { symbol: item, name: item, registeredPrice: 0 } : item));
      }
    } catch (e) { console.error(e); }
  };

  const loadStockInfo = async () => {
    if (stockInfo) { setShowStockInfo(prev => !prev); return; }
    setStockInfoLoading(true);
    setShowStockInfo(true);
    setShowFullSummary(false);
    try {
      const [infoRes, invRes] = await Promise.all([
        fetch(`/api/stock-info?symbol=${selectedStock.symbol}`),
        fetch(`/api/investor?symbol=${selectedStock.symbol}`),
      ]);
      const [info, inv] = await Promise.all([infoRes.json(), invRes.json()]);
      setStockInfo(info);
    } catch (e) { console.error(e); }
    finally { setStockInfoLoading(false); }
  };

  useEffect(() => {
    if (query.length < 1) { setSearchResults([]); return; }
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(query)}`);
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch { setSearchResults([]); }
    }, 300);
  }, [query]);

  useEffect(() => {
    if (!selectedStock) return;
    loadChart();
    loadUserData(selectedStock.symbol);
    loadNews(selectedStock.name || query);
    setNewsAnalysis(null);
    setStockInfo(null);
    setShowStockInfo(false);
    setShowFullSummary(false);
    setStockInfoLoading(false);
    const cached = analysisCache[selectedStock.symbol];
    if (cached) { setAnalysis(cached.analysis); setIndicators(cached.indicators); }
    else { setAnalysis(null); setIndicators(null); }
  }, [selectedStock?.symbol, timeframe]);

  useEffect(() => {
    if (!chartData || !chartContainerRef.current) return;
    initChart();
  }, [chartData, indicators, showVolumeProfile, chartVolumeProfile]);

  useEffect(() => { loadTopStocks(); }, [topType]);

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
    if (wishlist.length === 0) { setWishlistStocks([]); return; }
    loadWishlistStocks();
  }, [wishlist]);

  // 백과사전에서 종목 클릭 시 자동 검색
  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setQuery(q);
      window.history.replaceState({}, '', '/');

      // 검색 결과 나오면 자동으로 첫 번째 종목 선택
      setTimeout(async () => {
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
          const data = await res.json();
          const results = data.results || [];
          if (results.length > 0) {
            // 첫 번째 결과 자동 선택 (기존에 종목 클릭 시 실행하는 함수 호출)
            setSelectedStock(results[0]);
          }
        } catch { }
      }, 100);
    }
  }, [searchParams]);

  useEffect(() => {
    if (symbolFromQuery) {
      setSymbol(symbolFromQuery); // 해당 종목 선택
    }
  }, [symbolFromQuery]);

  const loadWishlistStocks = async () => {
    const stocks = await Promise.all(wishlist.map(async (item) => {
      try {
        const res = await fetch(`/api/stock?symbol=${item.symbol}&timeframe=daily`);
        const data = await res.json();
        const registeredReturn = item.registeredPrice > 0
          ? ((data.currentPrice - item.registeredPrice) / item.registeredPrice * 100).toFixed(2) : null;
        return { symbol: item.symbol, name: data.nameKr || data.name, currentPrice: data.currentPrice, change: data.change, changePercent: data.changePercent, registeredPrice: item.registeredPrice, registeredReturn };
      } catch { return null; }
    }));
    setWishlistStocks(stocks.filter(Boolean));
  };

  const loadTopStocks = async () => {
    setTopLoading(true);
    try {
      const res = await fetch(`/api/top?type=${topType}`);
      const data = await res.json();
      setTopStocks(data.stocks || []);
      const now = new Date();
      setTopUpdatedAt(`${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    } catch { setTopStocks([]); } finally { setTopLoading(false); }
  };

  const loadUserData = async (symbol) => {
    if (!user) return;
    try {
      const profileRef = doc(db, 'profiles', user.uid);
      const profileSnap = await getDoc(profileRef);
      if (profileSnap.exists()) {
        const w = profileSnap.data().wishlist || [];
        setWishlist(w.map(item => typeof item === 'string' ? { symbol: item, name: item, registeredPrice: 0 } : item));
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
    try {
      const res = await fetch('/api/news/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ news: allNews, stockName: chartData?.name }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setNewsAnalysis(data);
    } catch (e) { console.error(e); } finally { setNewsAnalyzing(false); }
  };

  function calcVolumeProfile(chartData, bins = 10) {
    const prices = chartData.map(d => d.close);
    const minP = Math.min(...prices);
    const maxP = Math.max(...prices);
    const binSize = (maxP - minP) / bins;
    const profile = Array(bins).fill(0).map((_, i) => ({
      priceFrom: Math.round(minP + i * binSize),
      priceTo: Math.round(minP + (i + 1) * binSize),
      volume: 0,
    }));
    chartData.forEach(d => {
      const idx = Math.min(Math.floor((d.close - minP) / binSize), bins - 1);
      profile[idx].volume += d.volume;
    });

    const top3 = profile.sort((a, b) => b.volume - a.volume).slice(0, 5);
    const totalVol = top3.reduce((a, p) => a + p.volume, 0);

    return top3.map(p => ({
      ...p,
      strength: Math.round((p.volume / totalVol) * 100),
    }));
  }

  const loadChart = async () => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await fetch(`/api/stock?symbol=${selectedStock.symbol}&timeframe=${timeframe}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setChartData(data);
      if (data.chartData?.length > 0) setChartVolumeProfile(calcVolumeProfile(data.chartData));
    } catch (e) { setError(e.message); } finally { setLoading(false); }
  };

  const initChart = async () => {
    if (!chartContainerRef.current) return;
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    await new Promise(resolve => setTimeout(resolve, 100));
    const LWC = await import('lightweight-charts');
    const chart = LWC.createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 320,
      layout: { background: { color: '#ffffff' }, textColor: '#374151' },
      grid: { vertLines: { color: '#f3f4f6' }, horzLines: { color: '#f3f4f6' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#d1d5db', borderVisible: true },
      leftPriceScale: { visible: false },
      timeScale: { borderColor: '#d1d5db', timeVisible: true, borderVisible: true },
      localization: { priceFormatter: (price) => Math.round(price).toLocaleString('ko-KR') },
    });
    const candleSeries = chart.addSeries(LWC.CandlestickSeries, {
      upColor: '#ef4444', downColor: '#3b82f6',
      borderUpColor: '#ef4444', borderDownColor: '#3b82f6',
      wickUpColor: '#ef4444', wickDownColor: '#3b82f6',
    });
    candleSeries.setData(chartData.chartData);
    const volumeSeries = chart.addSeries(LWC.HistogramSeries, {
      color: '#6b7280', priceFormat: { type: 'volume' }, priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.75, bottom: 0 },
      borderVisible: true,
      borderColor: '#e5e7eb',
    });
    volumeSeries.setData(chartData.chartData.map(d => ({
      time: d.time, value: d.volume,
      color: d.close >= d.open ? '#ef444466' : '#3b82f666',
    })));
    chart.timeScale().fitContent();

    // 캔들 / 거래량 구분선
    const separatorSeries = chart.addSeries(LWC.HistogramSeries, {
      color: 'transparent',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
      lastValueVisible: false,
      priceLineVisible: false,
    });
    separatorSeries.setData(chartData.chartData.map(d => ({ time: d.time, value: 0 })));
    chart.priceScale('volume').applyOptions({
      scaleMargins: { top: 0.75, bottom: 0 },
      borderVisible: true,
      borderColor: '#9ca3af',
    });

    if (userHolding?.avgPrice) {
      candleSeries.createPriceLine({
        price: userHolding.avgPrice, color: '#f59e0b', lineWidth: 2, lineStyle: 1,
        axisLabelVisible: true, title: `평단가 ${userHolding.avgPrice.toLocaleString()}원`,
      });
    }
    if (userHolding?.avgPrice && chartData?.currentPrice) {
      const profitRate = ((chartData.currentPrice - userHolding.avgPrice) / userHolding.avgPrice * 100).toFixed(2);
      candleSeries.createPriceLine({
        price: chartData.currentPrice,
        color: chartData.currentPrice >= userHolding.avgPrice ? '#ef4444' : '#3b82f6',
        lineWidth: 1, lineStyle: 2, axisLabelVisible: true,
        title: `현재가 (${profitRate >= 0 ? '+' : ''}${profitRate}%)`,
      });
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
        candleSeries.createPriceLine({
          price: Math.round((profile.priceFrom + profile.priceTo) / 2), color,
          lineWidth: Math.round((profile.strength / maxStrength) * 5) + 1,
          lineStyle: 0, axisLabelVisible: true, title: `매물대 ${profile.strength}%`,
        });
      });
    }

    chartRef.current = chart;
    const handleResize = () => { if (chartContainerRef.current) chart.applyOptions({ width: chartContainerRef.current.clientWidth }); };
    window.addEventListener('resize', handleResize);
  };

  const handleAnalyze = async () => {
    if (!chartData) return;
    setAnalyzing(true);
    setError(null);
    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chartData: chartData.chartData, stockName: chartData.name, symbol: selectedStock.symbol, newsData: allNews }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnalysis(data.analysis);
      setIndicators(data.indicators);
      const now = new Date();
      const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setAnalysisCache(prev => ({ ...prev, [selectedStock.symbol]: { analysis: data.analysis, indicators: data.indicators, analyzedAt: dateStr } }));
      if (user) {
        try {
          const n = new Date();
          await addDoc(collection(db, 'analysisHistory'), {
            userId: user.uid, symbol: selectedStock.symbol,
            name: chartData.name, nameKr: selectedStock.name || chartData.nameKr || chartData.name,
            analyzedAt: serverTimestamp(), analyzedAtStr: dateStr, currentPrice: chartData.currentPrice,
            summary: data.analysis.summary, probability: data.analysis.probability,
            confidence: data.analysis.confidence, keySignals: data.analysis.keySignals || [],
            indicatorScore: data.analysis.indicatorScore || null, newsScore: data.analysis.newsScore || null,
            daily: { ...data.analysis.daily, evalStatus: 'pending', evalPrice: null, evalAt: null, evalDueAt: addBusinessDays(n, 1).toISOString() },
            weekly: { ...data.analysis.weekly, evalStatus: 'pending', evalPrice: null, evalAt: null, evalDueAt: addBusinessDays(n, 5).toISOString() },
            monthly: { ...data.analysis.monthly, evalStatus: 'pending', evalPrice: null, evalAt: null, evalDueAt: addBusinessDays(n, 20).toISOString() },
          });
        } catch (e) { console.error(e); }
      }
    } catch (e) { setError(e.message); } finally { setAnalyzing(false); }
  };

  const handleTrade = async () => {
    if (!tradePrice && priceType === 'limit') { setTradeError('가격을 입력해주세요'); return; }
    if (!tradeQty || Number(tradeQty) <= 0) { setTradeError('수량을 입력해주세요'); return; }
    const price = priceType === 'market' ? chartData.currentPrice : Number(tradePrice);
    const qty = Number(tradeQty);
    const total = price * qty;
    if (tradeType === 'buy' && total > userProfile.cash) { setTradeError('보유 현금이 부족합니다'); return; }
    if (tradeType === 'sell' && (!userHolding || qty > userHolding.quantity)) { setTradeError('보유 수량이 부족합니다'); return; }
    setTradeProcessing(true);
    setTradeError('');
    try {
      const profileRef = doc(db, 'profiles', user.uid);
      const holdingRef = doc(db, 'holdings', `${user.uid}_${selectedStock.symbol}`);
      if (tradeType === 'buy') {
        await addDoc(collection(db, 'trades'), { userId: user.uid, symbol: selectedStock.symbol, name: chartData.name, type: 'buy', price, quantity: qty, amount: total, createdAt: serverTimestamp() });
        const holdingSnap = await getDoc(holdingRef);
        if (holdingSnap.exists()) {
          const existing = holdingSnap.data();
          const newQty = existing.quantity + qty;
          const newAvg = Math.round((existing.avgPrice * existing.quantity + price * qty) / newQty);
          await updateDoc(holdingRef, { quantity: newQty, avgPrice: newAvg, totalInvested: existing.totalInvested + total });
        } else {
          await setDoc(holdingRef, { userId: user.uid, symbol: selectedStock.symbol, name: chartData.name, quantity: qty, avgPrice: price, totalInvested: total });
        }
        await updateDoc(profileRef, { cash: userProfile.cash - total });
        setUserProfile(prev => ({ ...prev, cash: prev.cash - total }));
      } else {
        const sellAmount = price * qty;
        const buyAmount = userHolding.avgPrice * qty;
        const profit = sellAmount - buyAmount;
        await addDoc(collection(db, 'trades'), { userId: user.uid, symbol: selectedStock.symbol, name: chartData.name, type: 'sell', price, quantity: qty, amount: sellAmount, profit, profitRate: ((profit / buyAmount) * 100).toFixed(2), createdAt: serverTimestamp() });
        const newQty = userHolding.quantity - qty;
        if (newQty <= 0) { await deleteDoc(holdingRef); setUserHolding(null); }
        else { await updateDoc(holdingRef, { quantity: newQty, totalInvested: userHolding.avgPrice * newQty }); setUserHolding(prev => ({ ...prev, quantity: newQty })); }
        await updateDoc(profileRef, { cash: userProfile.cash + sellAmount });
        setUserProfile(prev => ({ ...prev, cash: prev.cash + sellAmount }));
      }
      setTradeModal(false); setTradeQty(''); setTradePrice(''); setTradeError('');
      await loadUserData(selectedStock.symbol);
    } catch (e) { setTradeError('처리 실패: ' + e.message); } finally { setTradeProcessing(false); }
  };

  const toggleWishlist = async (symbol, name) => {
    if (!user) return;
    const profileRef = doc(db, 'profiles', user.uid);
    const isWished = wishlist.find(w => w.symbol === symbol);
    try {
      if (isWished) {
        const updated = wishlist.filter(w => w.symbol !== symbol);
        await updateDoc(profileRef, { wishlist: updated });
        setWishlist(updated);
      } else {
        const newItem = { symbol, name, registeredPrice: chartData?.currentPrice || 0, registeredAt: new Date().toISOString() };
        const updated = [...wishlist, newItem];
        await updateDoc(profileRef, { wishlist: updated });
        setWishlist(updated);
      }
    } catch (e) { console.error(e); }
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

  const getPredictionColor = (p) => p === '상승' ? 'text-red-500' : p === '하락' ? 'text-blue-500' : 'text-gray-500';
  const getPredictionBg = (p) => p === '상승' ? 'bg-red-50 border-red-200' : p === '하락' ? 'bg-blue-50 border-blue-200' : 'bg-gray-50 border-gray-200';
  const getPredictionEmoji = (p) => p === '상승' ? '📈' : p === '하락' ? '📉' : '➡️';

  const getPrevDateText = () => {
    const d = chartData?.chartData?.[chartData.chartData.length - 2];
    if (!d) return '전일 대비';
    const parts = d.time.slice(5).split('-');
    return `${parts[0]}월 ${parts[1]}일 대비`;
  };

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
    `}</style>
    <main style={{ minHeight:'100vh', background:'#F0F4F8', paddingBottom:80 }}>

      {/* 헤더 */}
      <div style={{ background:'linear-gradient(135deg, #0F172A 0%, #1E3A5F 100%)', position:'relative' }}>
        {/* 장식용 블러 블롭 - overflow:hidden 래퍼로 분리 */}
        <div style={{ position:'absolute', inset:0, overflow:'hidden', pointerEvents:'none' }}>
          <div style={{ position:'absolute', top:-40, right:-40, width:140, height:140, borderRadius:'50%', background:'rgba(99,102,241,0.18)', filter:'blur(50px)' }} />
          <div style={{ position:'absolute', bottom:-20, left:10, width:90, height:90, borderRadius:'50%', background:'rgba(59,130,246,0.13)', filter:'blur(35px)' }} />
        </div>
        {/* 실제 컨텐츠 - overflow visible로 드롭다운이 헤더 밖으로 나올 수 있음 */}
        <div style={{ position:'relative', zIndex:10, padding:'16px 16px 22px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
            <button
              onClick={() => { setSelectedStock(null); setQuery(''); setChartData(null); setAnalysis(null); setIndicators(null); setError(null); setSearchFocused(false); }}
              style={{ display:'flex', alignItems:'center', gap:8, background:'none', border:'none', cursor:'pointer', padding:0 }}
            >
              <span style={{ fontSize:22 }}>📊</span>
              <span style={{ fontSize:18, fontWeight:800, color:'white', letterSpacing:'-0.5px' }}>주식 AI 분석</span>
            </button>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:11, color:'rgba(255,255,255,0.55)' }}>👤 {user?.displayName}</span>
              <button onClick={logout} style={{ fontSize:11, padding:'5px 10px', background:'rgba(255,255,255,0.1)', color:'rgba(255,255,255,0.8)', borderRadius:8, border:'1px solid rgba(255,255,255,0.15)', cursor:'pointer' }}>로그아웃</button>
            </div>
          </div>

          {/* 검색 */}
          <div style={{ position:'relative' }}>
            <div style={{ display:'flex', gap:8 }}>
              <input
                type="text" value={query}
                onChange={(e) => { setQuery(e.target.value); if (selectedStock) setSelectedStock(null); }}
                onFocus={() => { clearTimeout(searchBlurTimeout.current); setSearchFocused(true); }}
                onBlur={() => { searchBlurTimeout.current = setTimeout(() => setSearchFocused(false), 180); }}
                placeholder="종목명 검색 (삼성전자, 카카오...)"
                style={{
                  flex:1, padding:'12px 16px', borderRadius:14,
                  border: searchFocused ? '1.5px solid rgba(255,255,255,0.5)' : '1.5px solid rgba(255,255,255,0.2)',
                  background: searchFocused ? 'rgba(255,255,255,0.18)' : 'rgba(255,255,255,0.1)',
                  backdropFilter:'blur(10px)', color:'white', fontSize:14, outline:'none',
                  transition:'all 0.2s ease',
                }}
              />
              {selectedStock && (
                <button onClick={loadStockInfo} style={{
                  padding:'0 14px', borderRadius:14, fontSize:12, fontWeight:600,
                  whiteSpace:'nowrap', cursor:'pointer',
                  background: showStockInfo ? 'rgba(99,102,241,0.7)' : 'rgba(255,255,255,0.1)',
                  color:'white', border:'1.5px solid rgba(255,255,255,0.2)',
                }}>
                  {stockInfoLoading ? '⏳' : showStockInfo ? '닫기 ▲' : '📋 종목정보'}
                </button>
              )}
            </div>

            {/* 검색 드롭다운 - fixed position으로 overflow 문제 완전 해결 */}
            {searchFocused && !selectedStock && (searchResults.length > 0 || recentSearches.length > 0 || topStocks.length > 0) && (
              <div style={{
                position:'fixed', left:14, right:14,
                top: 'auto', marginTop:6,
                background:'white', borderRadius:18, border:'1px solid #E2E8F0',
                boxShadow:'0 12px 48px rgba(0,0,0,0.18)', zIndex:9999, overflow:'hidden',
                animation:'fadeSlideUp 0.15s ease-out',
                maxHeight:'70vh', overflowY:'auto',
              }}>
                {searchResults.length > 0 ? (
                  /* 검색 결과 */
                  <div>
                    <p style={{ fontSize:11, fontWeight:700, color:'#94A3B8', padding:'10px 16px 4px', letterSpacing:'0.5px' }}>검색 결과</p>
                    {searchResults.map((stock) => (
                      <button key={stock.symbol}
                        onMouseDown={() => handleSelectStock(stock)}
                        style={{
                          width:'100%', padding:'11px 16px', textAlign:'left', cursor:'pointer',
                          display:'flex', justifyContent:'space-between', alignItems:'center',
                          background:'white', border:'none', borderBottom:'1px solid #F8FAFC',
                        }}
                        onMouseEnter={e => e.currentTarget.style.background='#F8FAFC'}
                        onMouseLeave={e => e.currentTarget.style.background='white'}
                      >
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          {(() => { const [c1,c2] = getStockColor(stock.name, stock.symbol); return (
                            <div style={{ width:30, height:30, borderRadius:'50%', background:`linear-gradient(135deg,${c1},${c2})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800, color:'white', flexShrink:0 }}>
                              {stock.name?.charAt(0)}
                            </div>
                          ); })()}
                          <span style={{ fontWeight:600, color:'#111827', fontSize:14 }}>{stock.name}</span>
                        </div>
                        <span style={{ fontSize:11, color:'#9CA3AF' }}>{stock.exchange} · {stock.symbol}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  /* 검색어 없을 때: 최근 검색 + 인기 종목 */
                  <div>
                    {recentSearches.length > 0 && (
                      <div>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'10px 16px 4px' }}>
                          <p style={{ fontSize:11, fontWeight:700, color:'#94A3B8', letterSpacing:'0.5px' }}>최근 검색</p>
                          <button onMouseDown={() => { setRecentSearches([]); try { localStorage.removeItem('recentStockSearches'); } catch {} }}
                            style={{ fontSize:10, color:'#CBD5E1', background:'none', border:'none', cursor:'pointer' }}>전체 삭제</button>
                        </div>
                        {recentSearches.map((stock) => (
                          <div key={stock.symbol} style={{ display:'flex', alignItems:'center', padding:'8px 16px', borderBottom:'1px solid #F8FAFC' }}>
                            <button onMouseDown={() => handleSelectStock(stock)}
                              style={{ flex:1, display:'flex', alignItems:'center', gap:10, background:'none', border:'none', cursor:'pointer', textAlign:'left', padding:0 }}>
                              {(() => { const [c1,c2] = getStockColor(stock.name, stock.symbol); return (
                                <div style={{ width:28, height:28, borderRadius:'50%', background:`linear-gradient(135deg,${c1},${c2})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:800, color:'white', flexShrink:0, opacity:0.7 }}>
                                  {stock.name?.charAt(0)}
                                </div>
                              ); })()}
                              <span style={{ fontSize:13, fontWeight:600, color:'#374151' }}>{stock.name}</span>
                              <span style={{ fontSize:11, color:'#CBD5E1', marginLeft:4 }}>{stock.symbol}</span>
                            </button>
                            <button onMouseDown={() => removeRecentSearch(stock.symbol)}
                              style={{ fontSize:14, color:'#D1D5DB', background:'none', border:'none', cursor:'pointer', padding:'0 0 0 8px' }}>×</button>
                          </div>
                        ))}
                      </div>
                    )}
                    {topStocks.length > 0 && (
                      <div>
                        <p style={{ fontSize:11, fontWeight:700, color:'#94A3B8', padding:'10px 16px 4px', letterSpacing:'0.5px' }}>🔥 지금 핫한 종목</p>
                        {topStocks.slice(0, 5).map((stock, i) => (
                          <button key={stock.code}
                            onMouseDown={() => handleSelectStock({ symbol:stock.code, name:stock.name, exchange:'KOSPI' })}
                            style={{ width:'100%', padding:'9px 16px', display:'flex', alignItems:'center', gap:10, background:'white', border:'none', borderBottom:'1px solid #F8FAFC', cursor:'pointer', textAlign:'left' }}
                            onMouseEnter={e => e.currentTarget.style.background='#F8FAFC'}
                            onMouseLeave={e => e.currentTarget.style.background='white'}
                          >
                            <span style={{ width:20, height:20, borderRadius:6, background: i<3 ? 'linear-gradient(135deg,#F59E0B,#F97316)' : '#F1F5F9', color: i<3 ? 'white' : '#94A3B8', fontSize:10, fontWeight:800, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>{i+1}</span>
                            <span style={{ fontSize:13, fontWeight:600, color:'#111827', flex:1 }}>{stock.name}</span>
                            <span style={{ fontSize:12, fontWeight:700, color: stock.changeRate?.includes('+') ? '#EF4444' : '#3B82F6' }}>
                              {stock.changeRate?.includes('%') ? stock.changeRate : `${stock.changeRate}%`}
                            </span>
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

      {/* 본문 */}
      <div style={{ padding:'14px 14px 0' }}>

        {/* 종목 선택 시 퀵 네비 */}
        {selectedStock && (
          <div style={{ display:'flex', gap:8, marginBottom:12 }}>
            <button
              onClick={() => { setSelectedStock(null); setQuery(''); setChartData(null); setAnalysis(null); setIndicators(null); setError(null); }}
              style={{ padding:'8px 14px', borderRadius:10, fontSize:12, fontWeight:700, background:'white', color:'#64748B', border:'1.5px solid #E2E8F0', cursor:'pointer' }}
            >← 홈</button>
            <button
              onClick={() => router.push(`/financial?query=${encodeURIComponent(selectedStock.name || selectedStock.code)}`)}
              style={{ flex:1, padding:'8px', borderRadius:10, fontSize:12, fontWeight:700, background:'linear-gradient(135deg,#7C3AED,#9333EA)', color:'white', border:'none', cursor:'pointer' }}
            >📊 재무분석</button>
            <button
              onClick={() => router.push('/scanner')}
              style={{ flex:1, padding:'8px', borderRadius:10, fontSize:12, fontWeight:700, background:'linear-gradient(135deg,#059669,#10B981)', color:'white', border:'none', cursor:'pointer' }}
            >🔍 스캐너</button>
          </div>
        )}

        {selectedStock && (
          <div style={{ animation:'fadeSlideUp 0.3s ease-out' }}>
            {/* 종목 정보 헤더 */}
            <div style={{ background:'white', borderRadius:20, border:'1.5px solid #E2E8F0', boxShadow:'0 2px 12px rgba(0,0,0,0.06)', padding:'16px', marginBottom:12 }}>
              {loading ? (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  <div className="sk" style={{ height:20, width:'55%' }} />
                  <div className="sk" style={{ height:13, width:'35%' }} />
                  <div className="sk" style={{ height:30, width:'50%', marginTop:4 }} />
                </div>
              ) : chartData && (
                <div style={{ display:'flex', alignItems:'flex-start', gap:12 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4 }}>
                      <h2 style={{ fontSize:17, fontWeight:800, color:'#111827', margin:0 }}>
                        {chartData.nameKr || selectedStock.name || chartData.name}
                      </h2>
                      <button onClick={() => toggleWishlist(selectedStock.symbol, chartData.nameKr || chartData.name)}
                        style={{ fontSize:20, background:'none', border:'none', cursor:'pointer', padding:0,
                          filter: wishlist.find(w => w.symbol === selectedStock.symbol) ? 'drop-shadow(0 0 6px #fbbf24) drop-shadow(0 0 12px #f59e0b)' : 'grayscale(1) opacity(0.35)',
                          animation: wishlist.find(w => w.symbol === selectedStock.symbol) ? 'starPulse 1.5s ease-in-out infinite' : 'none',
                        }}>⭐</button>
                    </div>
                    <p style={{ fontSize:11, color:'#94A3B8', marginBottom:10 }}>{chartData.name} · {selectedStock.symbol}</p>
                    <div style={{ display:'flex', alignItems:'baseline', gap:10, flexWrap:'wrap' }}>
                      <span style={{ fontSize:26, fontWeight:800, color:'#111827', letterSpacing:'-0.5px' }}>{chartData.currentPrice?.toLocaleString()}원</span>
                      <span style={{ fontSize:14, fontWeight:700, color: chartData.change >= 0 ? '#EF4444' : '#3B82F6' }}>
                        {chartData.change >= 0 ? '▲' : '▼'} {Math.abs(chartData.change)?.toLocaleString()}원
                        ({chartData.change >= 0 ? '+' : ''}{chartData.changePercent?.toFixed(2)}%)
                      </span>
                    </div>
                    <p style={{ fontSize:11, color:'#94A3B8', marginTop:4 }}>{getPrevDateText()}</p>
                  </div>
                  <div style={{ display:'flex', flexDirection:'column', gap:6, flexShrink:0 }}>
                    {[{ key:'daily', label:'일봉' }, { key:'weekly', label:'주봉' }, { key:'monthly', label:'월봉' }, { key:'yearly', label:'년봉' }].map(t => (
                      <button key={t.key} onClick={() => setTimeframe(t.key)} style={{
                        padding:'6px 10px', borderRadius:8, fontSize:11, fontWeight:700, border:'none', cursor:'pointer',
                        background: timeframe === t.key ? '#1E3A5F' : '#F1F5F9',
                        color: timeframe === t.key ? 'white' : '#64748B',
                      }}>{t.label}</button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 종목 상세 정보 */}
            {showStockInfo && (
              <div style={{ background:'white', borderRadius:20, border:'1.5px solid #E2E8F0', boxShadow:'0 2px 12px rgba(0,0,0,0.06)', padding:'16px', marginBottom:12, animation:'fadeSlideUp 0.25s ease-out' }}>
                {stockInfoLoading ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    <div className="sk" style={{ height:15, width:'30%' }} />
                    <div className="sk" style={{ height:11, width:'100%' }} />
                    <div className="sk" style={{ height:11, width:'75%' }} />
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8, marginTop:6 }}>
                      {[...Array(6)].map((_,i)=><div key={i} className="sk" style={{ height:50 }} />)}
                    </div>
                  </div>
                ) : stockInfo && (
                  <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
                    {(stockInfo.sector || stockInfo.industry) && (
                      <div style={{ display:'flex', gap:6 }}>
                        {stockInfo.sector && <span style={{ padding:'4px 10px', background:'#EFF6FF', color:'#3B82F6', fontSize:11, borderRadius:20, fontWeight:600 }}>{stockInfo.sector}</span>}
                        {stockInfo.industry && <span style={{ padding:'4px 10px', background:'#F5F3FF', color:'#7C3AED', fontSize:11, borderRadius:20, fontWeight:600 }}>{stockInfo.industry}</span>}
                      </div>
                    )}
                    {stockInfo.summary && (
                      <div>
                        <p style={{ fontSize:12, fontWeight:700, color:'#374151', marginBottom:4 }}>🏢 기업 개요</p>
                        <p style={{ fontSize:12, color:'#6B7280', lineHeight:1.6, overflow:'hidden', display: showFullSummary ? 'block' : '-webkit-box', WebkitLineClamp: showFullSummary ? 'unset' : 3, WebkitBoxOrient:'vertical' }}>{stockInfo.summary}</p>
                        <button onClick={() => setShowFullSummary(p=>!p)} style={{ fontSize:11, color:'#60A5FA', marginTop:4, background:'none', border:'none', cursor:'pointer', padding:0 }}>{showFullSummary ? '접기 ▲' : '더보기 ▼'}</button>
                      </div>
                    )}
                    <div>
                      <p style={{ fontSize:12, fontWeight:700, color:'#374151', marginBottom:8 }}>📐 주요 지표</p>
                      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                        {[
                          { label:'ROE', value:stockInfo.roe },
                          { label:'영업이익률', value:stockInfo.operatingMargin },
                          { label:'배당수익률', value:stockInfo.dividendYield },
                          { label:'베타', value:stockInfo.beta },
                          { label:'매출성장률', value:stockInfo.revenueGrowth },
                          { label:'목표주가', value:stockInfo.targetMeanPrice || '' },
                        ].filter(item => item.value && item.value !== '').map(({ label, value }) => (
                          <div key={label} style={{ background:'#F8FAFC', borderRadius:12, padding:'10px 8px', textAlign:'center' }}>
                            <p style={{ fontSize:10, color:'#94A3B8', marginBottom:3 }}>{label}</p>
                            <p style={{ fontSize:13, fontWeight:700, color:'#111827' }}>{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    {(stockInfo.high52 || stockInfo.low52) && (
                      <div>
                        <p style={{ fontSize:12, fontWeight:700, color:'#374151', marginBottom:8 }}>📅 52주 가격 범위</p>
                        <div style={{ background:'#F8FAFC', borderRadius:14, padding:12 }}>
                          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                            <span style={{ fontSize:11, color:'#3B82F6', fontWeight:600 }}>최저 {stockInfo.low52}원</span>
                            <span style={{ fontSize:11, color:'#EF4444', fontWeight:600 }}>최고 {stockInfo.high52}원</span>
                          </div>
                          {(() => {
                            const low = stockInfo?.low52Raw || 0;
                            const high = stockInfo?.high52Raw || 0;
                            const current = chartData?.currentPrice || 0;
                            const pct = high > low ? Math.round(((current - low) / (high - low)) * 100) : 50;
                            return (
                              <div style={{ position:'relative', width:'100%', height:6, background:'#E2E8F0', borderRadius:3 }}>
                                <div style={{ position:'absolute', height:6, borderRadius:3, background:'linear-gradient(90deg,#60A5FA,#EF4444)', width:`${pct}%` }} />
                                <div style={{ position:'absolute', width:14, height:14, background:'white', border:'2px solid #374151', borderRadius:'50%', top:'50%', transform:'translate(-50%,-50%)', left:`${pct}%` }} />
                              </div>
                            );
                          })()}
                          <p style={{ fontSize:10, color:'#94A3B8', textAlign:'center', marginTop:8 }}>현재가 52주 범위 내 위치</p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 차트 */}
            <div style={{ background:'white', borderRadius:20, border:'1.5px solid #E2E8F0', boxShadow:'0 2px 12px rgba(0,0,0,0.06)', padding:'12px', marginBottom:12 }}>
              {!loading && chartData?.chartData?.length > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                  <span style={{ fontSize:11, color:'#94A3B8' }}>{chartData.chartData[0]?.time} ~ {chartData.chartData[chartData.chartData.length-1]?.time}</span>
                  <button onClick={() => setShowVolumeProfile(p=>!p)} style={{ padding:'4px 10px', borderRadius:8, fontSize:11, fontWeight:600, border:'none', cursor:'pointer', background: showVolumeProfile ? '#F5F3FF' : '#F1F5F9', color: showVolumeProfile ? '#7C3AED' : '#9CA3AF' }}>
                    📊 매물대 {showVolumeProfile ? 'OFF' : 'ON'}
                  </button>
                </div>
              )}
              {loading ? (
                <div className="sk" style={{ height:280, borderRadius:12 }} />
              ) : (
                <div style={{ position:'relative' }}>
                  <div ref={chartContainerRef} style={{ width:'100%' }} />
                  <div style={{ position:'absolute', width:'100%', borderTop:'1px solid #E5E7EB', bottom:72 }} />
                </div>
              )}
            </div>

            {/* 보유현황 + 매수/매도 */}
            {!loading && chartData && (
              <div style={{ marginBottom:12 }}>
                {userHolding && (
                  <div style={{ background:'linear-gradient(135deg,#0F172A,#1E3A5F)', borderRadius:16, padding:'14px 16px', marginBottom:8, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                    <div>
                      <p style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginBottom:3 }}>보유 현황</p>
                      <p style={{ fontSize:14, fontWeight:700, color:'white' }}>{userHolding.quantity}주 · 평균 {userHolding.avgPrice?.toLocaleString()}원</p>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      {(() => {
                        const profit = (chartData.currentPrice - userHolding.avgPrice) * userHolding.quantity;
                        const profitRate = ((chartData.currentPrice - userHolding.avgPrice) / userHolding.avgPrice * 100).toFixed(2);
                        return (
                          <>
                            <p style={{ fontSize:14, fontWeight:700, color:'white' }}>{(chartData.currentPrice * userHolding.quantity).toLocaleString()}원</p>
                            <p style={{ fontSize:12, fontWeight:600, color: profit >= 0 ? '#34D399' : '#F87171' }}>{profit >= 0 ? '+' : ''}{profit.toLocaleString()}원 ({profit >= 0 ? '+' : ''}{profitRate}%)</p>
                          </>
                        );
                      })()}
                    </div>
                  </div>
                )}
                {userProfile && (
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'0 4px', marginBottom:8 }}>
                    <span style={{ fontSize:12, color:'#64748B' }}>💵 주문가능금액</span>
                    <span style={{ fontSize:14, fontWeight:700, color:'#111827' }}>{userProfile.cash?.toLocaleString()}원</span>
                  </div>
                )}
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => { setTradeType('buy'); setTradeModal(true); setTradeError(''); setTradeQty(''); setTradePrice(''); setPriceType('market'); }}
                    style={{ flex:1, padding:'14px', background:'linear-gradient(135deg,#EF4444,#DC2626)', color:'white', borderRadius:16, fontWeight:800, fontSize:15, boxShadow:'0 4px 14px rgba(239,68,68,0.35)', border:'none', cursor:'pointer' }}>매수</button>
                  <button onClick={() => { if (!userHolding) return; setTradeType('sell'); setTradeModal(true); setTradeError(''); setTradeQty(''); setTradePrice(''); setPriceType('market'); }}
                    style={{ flex:1, padding:'14px', background: userHolding ? 'linear-gradient(135deg,#3B82F6,#2563EB)' : '#F1F5F9', color: userHolding ? 'white' : '#CBD5E1', borderRadius:16, fontWeight:800, fontSize:15, boxShadow: userHolding ? '0 4px 14px rgba(59,130,246,0.35)' : 'none', border:'none', cursor: userHolding ? 'pointer' : 'not-allowed' }}>매도</button>
                </div>
              </div>
            )}

            {/* AI 분석 버튼 */}
            {!loading && chartData && (
              <div style={{ marginBottom:16 }}>
                {analysisCache[selectedStock?.symbol] && (
                  <p style={{ textAlign:'center', fontSize:11, color:'#94A3B8', marginBottom:6 }}>📅 {analysisCache[selectedStock?.symbol]?.analyzedAt}</p>
                )}
                <button onClick={handleAnalyze} disabled={analyzing}
                  style={{ width:'100%', padding:'16px', background: analyzing ? '#94A3B8' : 'linear-gradient(135deg,#6366F1,#8B5CF6,#A855F7)', color:'white', borderRadius:18, fontWeight:800, fontSize:16, boxShadow: analyzing ? 'none' : '0 6px 24px rgba(99,102,241,0.4)', border:'none', cursor: analyzing ? 'not-allowed' : 'pointer', letterSpacing:'-0.3px' }}>
                  {analyzing ? '🤖 AI 분석 중...' : analysisCache[selectedStock?.symbol] ? '🔄 AI 재분석' : '🔍 AI 분석 시작'}
                </button>
              </div>
            )}

            {error && <div style={{ background:'#FEF2F2', border:'1.5px solid #FCA5A5', borderRadius:14, padding:'12px 14px', marginBottom:12, fontSize:13, color:'#DC2626' }}>⚠️ {error}</div>}

            {/* 뉴스 섹션 */}
            {(news.length > 0 || newsLoading) && (
              <div style={{ background:'white', borderRadius:20, border:'1.5px solid #E2E8F0', boxShadow:'0 2px 12px rgba(0,0,0,0.06)', padding:'16px', marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                  <h3 style={{ fontSize:15, fontWeight:800, color:'#111827', margin:0 }}>📰 관련 뉴스</h3>
                  {news.length > 0 && !newsAnalysis && (
                    <button onClick={analyzeNews} disabled={newsAnalyzing}
                      style={{ padding:'6px 12px', background:'linear-gradient(135deg,#7C3AED,#9333EA)', color:'white', borderRadius:8, fontSize:11, fontWeight:700, border:'none', cursor:'pointer', opacity: newsAnalyzing ? 0.6 : 1 }}>
                      {newsAnalyzing ? '분석 중...' : '🤖 AI 감성분석'}
                    </button>
                  )}
                </div>
                {newsAnalysis && (
                  <div style={{ borderRadius:16, padding:'14px', marginBottom:12,
                    background: newsAnalysis.sentiment === '긍정' ? '#FEF2F2' : newsAnalysis.sentiment === '부정' ? '#EFF6FF' : '#F8FAFC',
                    border: `1.5px solid ${newsAnalysis.sentiment === '긍정' ? '#FCA5A5' : newsAnalysis.sentiment === '부정' ? '#BFDBFE' : '#E2E8F0'}`,
                  }}>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                      <p style={{ fontSize:16, fontWeight:800, color: newsAnalysis.sentiment === '긍정' ? '#EF4444' : newsAnalysis.sentiment === '부정' ? '#3B82F6' : '#6B7280' }}>
                        {newsAnalysis.sentiment === '긍정' ? '😊' : newsAnalysis.sentiment === '부정' ? '😟' : '😐'} {newsAnalysis.sentiment}
                      </p>
                      <p style={{ fontSize:22, fontWeight:800, color:'#111827' }}>{newsAnalysis.score}</p>
                    </div>
                    <div style={{ width:'100%', background:'rgba(255,255,255,0.7)', borderRadius:4, height:6, marginBottom:8, overflow:'hidden' }}>
                      <div style={{ height:6, borderRadius:4, background: newsAnalysis.score >= 60 ? '#EF4444' : newsAnalysis.score <= 40 ? '#3B82F6' : '#9CA3AF', width:`${newsAnalysis.score}%` }} />
                    </div>
                    <p style={{ fontSize:13, color:'#374151', lineHeight:1.6, marginBottom:6 }}>{newsAnalysis.summary}</p>
                    <p style={{ fontSize:12, color:'#4B5563', marginBottom:8 }}>📊 {newsAnalysis.impact}</p>
                    <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, padding:'8px 10px' }}>
                      <p style={{ fontSize:11, fontWeight:700, color:'#92400E', marginBottom:2 }}>🐣 쉬운 설명</p>
                      <p style={{ fontSize:11, color:'#78350F' }}>{newsAnalysis.easyExplain}</p>
                    </div>
                  </div>
                )}
                {newsLoading ? (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {[...Array(3)].map((_,i) => (
                      <div key={i} style={{ display:'flex', flexDirection:'column', gap:4 }}>
                        <div className="sk" style={{ height:13, width:'80%' }} />
                        <div className="sk" style={{ height:11, width:'55%' }} />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                    {news.map((article, i) => (
                      <a key={i} href={article.link} target="_blank" rel="noopener noreferrer"
                        style={{ display:'block', padding:'10px 12px', background:'#F8FAFC', borderRadius:12, textDecoration:'none', border:'1px solid #F1F5F9' }}>
                        <p style={{ fontWeight:600, color:'#111827', fontSize:13, lineHeight:1.5, marginBottom:4 }}>{article.title}</p>
                        {article.desc && <p style={{ fontSize:11, color:'#6B7280', marginBottom:4, overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{article.desc}</p>}
                        <div style={{ display:'flex', gap:8, fontSize:11, color:'#9CA3AF' }}>
                          {article.press && <span>{article.press}</span>}
                          {article.time && <span>· {article.time}</span>}
                        </div>
                      </a>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* 분석 결과 */}
            {analysis && (
              <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
                {analysis.probability && (
                  <div style={{ background:'linear-gradient(135deg,#0F172A,#1E293B)', borderRadius:20, padding:'18px 16px', color:'white' }}>
                    <p style={{ fontSize:11, color:'rgba(255,255,255,0.45)', marginBottom:12 }}>📊 퀀트 분석 결과</p>
                    <div style={{ marginBottom:14 }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                        <span style={{ fontSize:13, fontWeight:600, color:'#F87171' }}>상승 {analysis.probability.bullish}%</span>
                        <span style={{ fontSize:13, fontWeight:600, color:'#60A5FA' }}>하락 {analysis.probability.bearish}%</span>
                      </div>
                      <div style={{ width:'100%', background:'rgba(255,255,255,0.1)', borderRadius:6, height:10, overflow:'hidden' }}>
                        <div style={{ height:10, background:'linear-gradient(90deg,#EF4444,#F97316)', borderRadius:6, width:`${analysis.probability.bullish}%` }} />
                      </div>
                    </div>
                    <div style={{ background:'rgba(255,255,255,0.07)', borderRadius:14, padding:'12px', textAlign:'center', marginBottom:12 }}>
                      <p style={{ fontSize:11, color:'rgba(255,255,255,0.45)', marginBottom:4 }}>신뢰도</p>
                      <p style={{ fontSize:28, fontWeight:800, color:'#34D399' }}>{analysis.confidence}%</p>
                      {analysis.scoreBreakdown?.atrRatio > 3 && (
                        <p style={{ fontSize:11, color:'#FBBF24', marginTop:4 }}>⚡ 변동성 높음 ({analysis.scoreBreakdown.atrRatio}%)</p>
                      )}
                    </div>
                    {analysis.scoreBreakdown && (
                      <div style={{ marginBottom:12 }}>
                        <p style={{ fontSize:11, color:'rgba(255,255,255,0.35)', marginBottom:8 }}>레이어별 점수</p>
                        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                          {[
                            { label:'퀀트팩터', score:analysis.scoreBreakdown.quant?.score, weight:'40%', color:'#A78BFA' },
                            { label:'기술지표', score:analysis.scoreBreakdown.tech?.score, weight:'30%', color:'#60A5FA' },
                            { label:'뉴스감성', score:analysis.scoreBreakdown.news?.score, weight:'20%', color:'#34D399' },
                          ].map(({ label, score, weight, color }) => {
                            const barWidth = Math.min(Math.abs(score || 0) / 10 * 100, 100);
                            const isPositive = (score || 0) >= 0;
                            return (
                              <div key={label} style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)', width:56, flexShrink:0 }}>{label}</span>
                                <span style={{ fontSize:11, color:'rgba(255,255,255,0.25)', width:24, flexShrink:0 }}>{weight}</span>
                                <div style={{ flex:1, background:'rgba(255,255,255,0.1)', borderRadius:4, height:5, overflow:'hidden' }}>
                                  <div style={{ height:5, borderRadius:4, background: isPositive ? color : 'rgba(255,255,255,0.15)', width:`${barWidth}%` }} />
                                </div>
                                <span style={{ fontSize:11, fontWeight:700, width:28, textAlign:'right', flexShrink:0, color: isPositive ? '#F87171' : '#60A5FA' }}>
                                  {(score || 0) >= 0 ? '+' : ''}{score || 0}
                                </span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {analysis.keySignals?.length > 0 && (
                      <div>
                        <p style={{ fontSize:11, color:'rgba(255,255,255,0.35)', marginBottom:8 }}>핵심 신호</p>
                        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                          {analysis.keySignals.map((signal, i) => (
                            <div key={i}>
                              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <span style={{ width:6, height:6, borderRadius:'50%', flexShrink:0, background: signal.type === 'bullish' ? '#F87171' : '#60A5FA' }} />
                                <span style={{ fontSize:12, color:'rgba(255,255,255,0.8)', flex:1 }}>{signal.label}</span>
                                <span style={{ fontSize:12, fontWeight:700, color: signal.type === 'bullish' ? '#F87171' : '#60A5FA' }}>{signal.score >= 0 ? '+' : ''}{signal.score}</span>
                              </div>
                              {signal.easy && <p style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:3, marginLeft:14, lineHeight:1.4 }}>💡 {signal.easy}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {analysis.quantInsight && (
                      <div style={{ marginTop:12, background:'rgba(99,102,241,0.2)', borderRadius:12, padding:'10px 12px' }}>
                        <p style={{ fontSize:11, fontWeight:700, color:'#A5B4FC', marginBottom:4 }}>📐 퀀트 분석 한줄 요약</p>
                        <p style={{ fontSize:12, color:'rgba(165,180,252,0.9)', lineHeight:1.5 }}>{analysis.quantInsight}</p>
                      </div>
                    )}
                    {analysis.riskWarning && (
                      <div style={{ marginTop:8, background:'rgba(245,158,11,0.15)', borderRadius:12, padding:'10px 12px' }}>
                        <p style={{ fontSize:11, fontWeight:700, color:'#FCD34D', marginBottom:4 }}>⚠️ 주의사항</p>
                        <p style={{ fontSize:12, color:'rgba(253,211,77,0.9)', lineHeight:1.5 }}>{analysis.riskWarning}</p>
                      </div>
                    )}
                  </div>
                )}

                {analysis.scenarios && (
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                    <div style={{ background:'#FEF2F2', border:'1.5px solid #FCA5A5', borderRadius:16, padding:'12px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                        <p style={{ fontWeight:800, color:'#DC2626', fontSize:13 }}>📈 상승</p>
                        <span style={{ fontSize:14, fontWeight:800, color:'#EF4444' }}>{analysis.scenarios.scenarioA.probability}%</span>
                      </div>
                      {analysis.scenarios.scenarioA.conditions.map((c, i) => <p key={i} style={{ fontSize:11, color:'#B91C1C', marginBottom:3 }}>· {c}</p>)}
                      <div style={{ background:'#FEE2E2', borderRadius:10, padding:'8px', textAlign:'center', marginTop:8 }}>
                        <p style={{ fontSize:11, color:'#EF4444', marginBottom:2 }}>목표가</p>
                        <p style={{ fontSize:11, fontWeight:700, color:'#DC2626' }}>{analysis.scenarios.scenarioA.targetRange.low?.toLocaleString()}~{analysis.scenarios.scenarioA.targetRange.high?.toLocaleString()}원</p>
                      </div>
                    </div>
                    <div style={{ background:'#EFF6FF', border:'1.5px solid #BFDBFE', borderRadius:16, padding:'12px' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                        <p style={{ fontWeight:800, color:'#1D4ED8', fontSize:13 }}>📉 하락</p>
                        <span style={{ fontSize:14, fontWeight:800, color:'#3B82F6' }}>{analysis.scenarios.scenarioB.probability}%</span>
                      </div>
                      {analysis.scenarios.scenarioB.conditions.map((c, i) => <p key={i} style={{ fontSize:11, color:'#1E40AF', marginBottom:3 }}>· {c}</p>)}
                      <div style={{ background:'#DBEAFE', borderRadius:10, padding:'8px', textAlign:'center', marginTop:8 }}>
                        <p style={{ fontSize:11, color:'#3B82F6', marginBottom:2 }}>하락구간</p>
                        <p style={{ fontSize:11, fontWeight:700, color:'#1D4ED8' }}>{analysis.scenarios.scenarioB.targetRange.low?.toLocaleString()}~{analysis.scenarios.scenarioB.targetRange.high?.toLocaleString()}원</p>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ background:'white', borderRadius:20, border:'1.5px solid #E2E8F0', boxShadow:'0 2px 12px rgba(0,0,0,0.06)', padding:'16px' }}>
                  <h3 style={{ fontSize:15, fontWeight:800, color:'#111827', marginBottom:8 }}>📋 종합 분석</h3>
                  <p style={{ fontSize:13, color:'#374151', lineHeight:1.7 }}>{analysis.summary}</p>
                  {analysis.easySummary && (
                    <details style={{ marginTop:10 }}>
                      <summary style={{ cursor:'pointer', padding:'8px 12px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, fontSize:12, fontWeight:700, color:'#92400E', listStyle:'none', display:'flex', justifyContent:'space-between' }}>
                        <span>🐣 주린이 설명</span><span>▼</span>
                      </summary>
                      <div style={{ marginTop:4, padding:'10px 12px', background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10 }}>
                        <p style={{ fontSize:13, color:'#78350F', lineHeight:1.6 }}>{analysis.easySummary}</p>
                      </div>
                    </details>
                  )}
                  <div style={{ marginTop:10, display:'flex', flexWrap:'wrap', gap:6 }}>
                    {analysis.keyPoints?.map((point, i) => (
                      <span key={i} style={{ padding:'4px 10px', background:'#EFF6FF', color:'#3B82F6', borderRadius:20, fontSize:11, fontWeight:600 }}>{point}</span>
                    ))}
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:8 }}>
                  {[{ key:'daily', label:'단기', sub:'1~3일' }, { key:'weekly', label:'주간', sub:'1주' }, { key:'monthly', label:'월간', sub:'1개월' }].map(({ key, label, sub }) => {
                    const p = analysis[key]?.prediction;
                    const isUp = p === '상승'; const isDown = p === '하락';
                    return (
                      <div key={key} style={{ borderRadius:16, border:`1.5px solid ${isUp ? '#FCA5A5' : isDown ? '#BFDBFE' : '#E2E8F0'}`, padding:'12px 10px', background: isUp ? '#FEF2F2' : isDown ? '#EFF6FF' : '#F8FAFC' }}>
                        <p style={{ fontSize:10, color:'#94A3B8', marginBottom:1 }}>{sub}</p>
                        <p style={{ fontSize:11, fontWeight:700, color:'#374151', marginBottom:6 }}>{label}</p>
                        <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:6 }}>
                          <span style={{ fontSize:16 }}>{getPredictionEmoji(p)}</span>
                          <p style={{ fontSize:14, fontWeight:800, color: isUp ? '#EF4444' : isDown ? '#3B82F6' : '#6B7280' }}>{p}</p>
                        </div>
                        <p style={{ fontSize:11, color:'#374151', marginBottom:6 }}>목표: <strong>{analysis[key]?.targetPrice?.toLocaleString()}원</strong></p>
                        <div style={{ width:'100%', background:'rgba(0,0,0,0.06)', borderRadius:4, height:4, marginBottom:4, overflow:'hidden' }}>
                          <div style={{ height:4, borderRadius:4, background: isUp ? '#EF4444' : isDown ? '#3B82F6' : '#9CA3AF', width:`${analysis[key]?.confidence}%` }} />
                        </div>
                        <p style={{ fontSize:10, color:'#94A3B8', marginBottom:4 }}>신뢰도 {analysis[key]?.confidence}%</p>
                        <p style={{ fontSize:11, color:'#6B7280', lineHeight:1.4 }}>{analysis[key]?.reason}</p>
                        {analysis[key]?.easyReason && (
                          <details style={{ marginTop:6 }}>
                            <summary style={{ cursor:'pointer', fontSize:11, fontWeight:700, color:'#D97706', listStyle:'none' }}>🐣 쉬운설명 ▼</summary>
                            <p style={{ fontSize:11, color:'#78350F', marginTop:4, lineHeight:1.4 }}>{analysis[key]?.easyReason}</p>
                          </details>
                        )}
                      </div>
                    );
                  })}
                </div>

                {indicators && (
                  <div style={{ background:'white', borderRadius:20, border:'1.5px solid #E2E8F0', boxShadow:'0 2px 12px rgba(0,0,0,0.06)', padding:'16px' }}>
                    <h3 style={{ fontSize:15, fontWeight:800, color:'#111827', marginBottom:12 }}>📐 기술 지표</h3>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                      {(() => {
                        const v = indicators.rsi;
                        const s = v > 70 ? { label:'과매수', color:'#EF4444', bg:'#FEF2F2' } : v < 30 ? { label:'과매도', color:'#3B82F6', bg:'#EFF6FF' } : v > 60 ? { label:'상승모멘텀', color:'#D97706', bg:'#FFFBEB' } : v < 40 ? { label:'하락모멘텀', color:'#D97706', bg:'#FFFBEB' } : { label:'중립', color:'#059669', bg:'#ECFDF5' };
                        return (
                          <div style={{ background:'#F8FAFC', borderRadius:14, padding:12 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                              <p style={{ fontSize:11, color:'#94A3B8' }}>RSI(14)</p>
                              <span style={{ fontSize:10, padding:'2px 6px', borderRadius:10, background:s.bg, color:s.color, fontWeight:700 }}>{s.label}</span>
                            </div>
                            <p style={{ fontSize:16, fontWeight:800, color:'#111827' }}>{v}</p>
                            {analysis?.indicatorComments?.rsi && <p style={{ fontSize:11, color:'#60A5FA', marginTop:6, paddingTop:6, borderTop:'1px solid #E2E8F0' }}>💬 {analysis.indicatorComments.rsi}</p>}
                          </div>
                        );
                      })()}
                      {(() => {
                        const hist = indicators.macdHistogram;
                        const s = hist > 0 && indicators.macd > 0 ? { label:'강한상승', color:'#EF4444', bg:'#FEF2F2' } : hist > 0 ? { label:'상승전환', color:'#D97706', bg:'#FFFBEB' } : hist < 0 && indicators.macd < 0 ? { label:'강한하락', color:'#3B82F6', bg:'#EFF6FF' } : { label:'하락전환', color:'#D97706', bg:'#FFFBEB' };
                        return (
                          <div style={{ background:'#F8FAFC', borderRadius:14, padding:12 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                              <p style={{ fontSize:11, color:'#94A3B8' }}>MACD</p>
                              <span style={{ fontSize:10, padding:'2px 6px', borderRadius:10, background:s.bg, color:s.color, fontWeight:700 }}>{s.label}</span>
                            </div>
                            <p style={{ fontSize:16, fontWeight:800, color:'#111827' }}>{indicators.macd}</p>
                            {analysis?.indicatorComments?.macd && <p style={{ fontSize:11, color:'#60A5FA', marginTop:6, paddingTop:6, borderTop:'1px solid #E2E8F0' }}>💬 {analysis.indicatorComments.macd}</p>}
                          </div>
                        );
                      })()}
                      {(() => {
                        const price = indicators.currentPrice;
                        const a20 = price > indicators.ma20; const a60 = price > indicators.ma60;
                        const s = a20 && a60 ? { label:'정배열', color:'#EF4444', bg:'#FEF2F2' } : !a20 && !a60 ? { label:'역배열', color:'#3B82F6', bg:'#EFF6FF' } : { label:'혼조', color:'#D97706', bg:'#FFFBEB' };
                        return (
                          <div style={{ background:'#F8FAFC', borderRadius:14, padding:12 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                              <p style={{ fontSize:11, color:'#94A3B8' }}>이동평균</p>
                              <span style={{ fontSize:10, padding:'2px 6px', borderRadius:10, background:s.bg, color:s.color, fontWeight:700 }}>{s.label}</span>
                            </div>
                            <p style={{ fontSize:14, fontWeight:800, color:'#111827' }}>{price?.toLocaleString()}</p>
                            <p style={{ fontSize:10, color:'#94A3B8', marginTop:2 }}>MA20: {indicators.ma20?.toLocaleString()} / MA60: {indicators.ma60?.toLocaleString()}</p>
                            {analysis?.indicatorComments?.ma && <p style={{ fontSize:11, color:'#60A5FA', marginTop:6, paddingTop:6, borderTop:'1px solid #E2E8F0' }}>💬 {analysis.indicatorComments.ma}</p>}
                          </div>
                        );
                      })()}
                      {(() => {
                        const price = indicators.currentPrice;
                        const range = indicators.bbUpper - indicators.bbLower;
                        const pos = range > 0 ? ((price - indicators.bbLower) / range) * 100 : 50;
                        const s = pos > 90 ? { label:'상단돌파', color:'#EF4444', bg:'#FEF2F2' } : pos > 70 ? { label:'상단근접', color:'#D97706', bg:'#FFFBEB' } : pos < 10 ? { label:'하단돌파', color:'#3B82F6', bg:'#EFF6FF' } : pos < 30 ? { label:'하단근접', color:'#D97706', bg:'#FFFBEB' } : { label:'중간구간', color:'#059669', bg:'#ECFDF5' };
                        return (
                          <div style={{ background:'#F8FAFC', borderRadius:14, padding:12 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                              <p style={{ fontSize:11, color:'#94A3B8' }}>볼린저밴드</p>
                              <span style={{ fontSize:10, padding:'2px 6px', borderRadius:10, background:s.bg, color:s.color, fontWeight:700 }}>{s.label}</span>
                            </div>
                            <div style={{ width:'100%', background:'#E2E8F0', borderRadius:4, height:5, margin:'6px 0' }}>
                              <div style={{ height:5, background:'#60A5FA', borderRadius:4, width:`${Math.min(Math.max(pos,2),98)}%` }} />
                            </div>
                            <p style={{ fontSize:10, color:'#94A3B8' }}>상단 {indicators.bbUpper?.toLocaleString()} / 하단 {indicators.bbLower?.toLocaleString()}</p>
                            {analysis?.indicatorComments?.bb && <p style={{ fontSize:11, color:'#60A5FA', marginTop:6, paddingTop:6, borderTop:'1px solid #E2E8F0' }}>💬 {analysis.indicatorComments.bb}</p>}
                          </div>
                        );
                      })()}
                      {(() => {
                        const v = indicators.volumeRatio;
                        const s = v > 2 ? { label:'급등', color:'#EF4444', bg:'#FEF2F2' } : v > 1.5 ? { label:'증가', color:'#D97706', bg:'#FFFBEB' } : v < 0.5 ? { label:'급감', color:'#3B82F6', bg:'#EFF6FF' } : v < 0.8 ? { label:'감소', color:'#D97706', bg:'#FFFBEB' } : { label:'보통', color:'#059669', bg:'#ECFDF5' };
                        return (
                          <div style={{ background:'#F8FAFC', borderRadius:14, padding:12 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                              <p style={{ fontSize:11, color:'#94A3B8' }}>거래량</p>
                              <span style={{ fontSize:10, padding:'2px 6px', borderRadius:10, background:s.bg, color:s.color, fontWeight:700 }}>{s.label}</span>
                            </div>
                            <p style={{ fontSize:16, fontWeight:800, color:'#111827' }}>{v}x</p>
                            <p style={{ fontSize:10, color:'#94A3B8', marginTop:2 }}>20일 평균 대비</p>
                            {analysis?.indicatorComments?.volume && <p style={{ fontSize:11, color:'#60A5FA', marginTop:6, paddingTop:6, borderTop:'1px solid #E2E8F0' }}>💬 {analysis.indicatorComments.volume}</p>}
                          </div>
                        );
                      })()}
                      <div style={{ background:'#F8FAFC', borderRadius:14, padding:12 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                          <p style={{ fontSize:11, color:'#94A3B8' }}>주요 매물대</p>
                          <span style={{ fontSize:10, padding:'2px 6px', borderRadius:10, background:'#F5F3FF', color:'#7C3AED', fontWeight:700 }}>집중구간</span>
                        </div>
                        <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                          {indicators.volumeProfile?.map((p, i) => (
                            <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <span style={{ fontSize:9, color:'#6B7280', flexShrink:0, width:80 }}>{p.priceFrom.toLocaleString()}~{p.priceTo.toLocaleString()}</span>
                              <div style={{ flex:1, background:'#E2E8F0', borderRadius:4, height:4 }}>
                                <div style={{ height:4, background:'#A78BFA', borderRadius:4, width:`${p.strength}%` }} />
                              </div>
                              <span style={{ fontSize:10, color:'#94A3B8', flexShrink:0 }}>{p.strength}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div style={{ background:'#FFFBEB', border:'1.5px solid #FDE68A', borderRadius:14, padding:'10px 14px', fontSize:12, color:'#92400E' }}>
                  ⚠️ 본 분석은 AI 기반 기술적 분석으로 투자 권유가 아닙니다.
                </div>
              </div>
            )}
          </div>
        )}

        {/* 홈 화면 */}
        {!selectedStock && (
          <div style={{ animation:'fadeSlideUp 0.4s ease-out' }}>
            {/* 인사말 */}
            <div style={{ background:'linear-gradient(135deg,#EFF6FF,#F0FDF4)', borderRadius:18, padding:'14px 16px', marginBottom:14, border:'1.5px solid #BFDBFE' }}>
              <p style={{ fontSize:13, color:'#1E40AF', fontWeight:700, marginBottom:3 }}>안녕하세요 👋 {user?.displayName?.split(' ')[0] || user?.displayName}님</p>
              <p style={{ fontSize:12, color:'#60A5FA' }}>오늘도 현명한 투자 하세요 💼</p>
            </div>

            {/* 관심종목 */}
            {wishlistStocks.length > 0 && (
              <div style={{ marginBottom:16 }}>
                <h2 style={{ fontSize:16, fontWeight:800, color:'#111827', marginBottom:10 }}>⭐ 관심종목</h2>
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {wishlistStocks.map((stock) => (
                    <div key={stock.symbol} style={{ background:'white', borderRadius:16, border:'1.5px solid #E2E8F0', boxShadow:'0 1px 8px rgba(0,0,0,0.05)', display:'flex', alignItems:'center', gap:12, padding:'12px 14px' }}>
                      <button onClick={() => handleSelectStock({ symbol:stock.symbol, name:stock.name, exchange:'' })}
                        style={{ flex:1, minWidth:0, display:'flex', alignItems:'center', gap:12, textAlign:'left', background:'none', border:'none', cursor:'pointer', padding:0 }}>
                        {(() => {
                          const [c1,c2] = getStockColor(stock.name, stock.symbol);
                          return (
                            <div style={{ width:44, height:44, borderRadius:'50%', flexShrink:0, background:`linear-gradient(135deg,${c1},${c2})`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:800, color:'white', boxShadow:`0 4px 14px ${c1}55`, flexShrink:0 }}>
                              {stock.name?.charAt(0)}
                            </div>
                          );
                        })()}
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ fontSize:14, fontWeight:700, color:'#111827', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{stock.name}</p>
                          <p style={{ fontSize:12, color:'#94A3B8' }}>{stock.currentPrice?.toLocaleString()}원</p>
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0 }}>
                          <p style={{ fontSize:13, fontWeight:700, color: stock.change >= 0 ? '#EF4444' : '#3B82F6', marginBottom:2 }}>
                            {stock.change >= 0 ? '▲' : '▼'} {stock.changePercent?.toFixed(2)}%
                          </p>
                          {stock.registeredReturn !== null && (
                            <p style={{ fontSize:11, color: Number(stock.registeredReturn) >= 0 ? '#EF4444' : '#3B82F6' }}>
                              등록후 {Number(stock.registeredReturn) >= 0 ? '+' : ''}{stock.registeredReturn}%
                            </p>
                          )}
                        </div>
                      </button>
                      <button onClick={() => toggleWishlist(stock.symbol, stock.name)} style={{ fontSize:18, flexShrink:0, background:'none', border:'none', cursor:'pointer', padding:4 }}>⭐</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* TOP 30 */}
            <div style={{ background:'white', borderRadius:20, border:'1.5px solid #E2E8F0', boxShadow:'0 2px 12px rgba(0,0,0,0.06)', padding:'16px' }}>
              <div style={{ marginBottom:12 }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                  <h2 style={{ fontSize:16, fontWeight:800, color:'#111827', margin:0 }}>🔥 실시간 TOP 30</h2>
                  {topUpdatedAt && <p style={{ fontSize:11, color:'#94A3B8' }}>{topUpdatedAt}</p>}
                </div>
                <div style={{ display:'flex', gap:6, overflowX:'auto', paddingBottom:4 }}>
                  {[
                    { key:'volume', label:'거래량' },
                    { key:'amount', label:'거래대금' },
                    { key:'marcap', label:'시가총액' },
                    { key:'rise', label:'📈 상승률' },
                    { key:'fall', label:'📉 하락률' },
                  ].map(t => (
                    <button key={t.key} onClick={() => setTopType(t.key)} style={{ padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:700, whiteSpace:'nowrap', background: topType === t.key ? '#0F172A' : '#F1F5F9', color: topType === t.key ? 'white' : '#64748B', border:'none', cursor:'pointer', flexShrink:0 }}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              {topLoading ? (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {[...Array(5)].map((_,i) => (
                    <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0' }}>
                      <div className="sk" style={{ width:28, height:28, borderRadius:8, flexShrink:0 }} />
                      <div style={{ flex:1, display:'flex', flexDirection:'column', gap:5 }}>
                        <div className="sk" style={{ height:13, width:'50%' }} />
                        <div className="sk" style={{ height:11, width:'30%' }} />
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', gap:4, alignItems:'flex-end' }}>
                        <div className="sk" style={{ height:13, width:40 }} />
                        <div className="sk" style={{ height:11, width:50 }} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column' }}>
                  {topStocks.map((stock, i) => (
                    <button key={stock.code} onClick={() => { setSelectedStock({ symbol:stock.code, name:stock.name, exchange:'KOSPI' }); setQuery(stock.name); }}
                      style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom: i < topStocks.length - 1 ? '1px solid #F1F5F9' : 'none', background:'none', border:'none', cursor:'pointer', textAlign:'left', width:'100%', borderBottom: i < topStocks.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                      <span style={{ width:28, height:28, flexShrink:0, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:12, fontWeight:800,
                        background: i === 0 ? 'linear-gradient(135deg,#F59E0B,#D97706)' : i === 1 ? 'linear-gradient(135deg,#9CA3AF,#6B7280)' : i === 2 ? 'linear-gradient(135deg,#F97316,#EA580C)' : '#F1F5F9',
                        color: i < 3 ? 'white' : '#64748B' }}>
                        {i + 1}
                      </span>
                      <div style={{ flex:1, minWidth:0 }}>
                        <p style={{ fontSize:14, fontWeight:700, color:'#111827', marginBottom:2, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{stock.name}</p>
                        <p style={{ fontSize:11, color:'#94A3B8' }}>{Number(stock.price).toLocaleString()}원</p>
                      </div>
                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        <p style={{ fontSize:13, fontWeight:700, color: stock.changeRate?.includes('+') ? '#EF4444' : stock.changeRate?.includes('-') ? '#3B82F6' : '#6B7280', marginBottom:2 }}>
                          {stock.changeRate?.includes('%') ? stock.changeRate : `${stock.changeRate}%`}
                        </p>
                        <p style={{ fontSize:11, color:'#9CA3AF' }}>
                          {topType === 'volume' ? `${Number(stock.volume).toLocaleString()}주` : topType === 'amount' ? `${Number(stock.amount).toLocaleString()}백만` : `${Number(stock.marcap).toLocaleString()}억`}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* 매수/매도 모달 */}
      {tradeModal && chartData && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:50 }}>
          <div style={{ background:'white', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:480, padding:'20px 20px 40px', animation:'slideUp 0.25s ease-out' }}>
            <div style={{ width:40, height:4, background:'#E2E8F0', borderRadius:2, margin:'0 auto 16px' }} />
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:16 }}>
              <div>
                <h3 style={{ fontSize:16, fontWeight:800, color:'#111827', marginBottom:4 }}>{chartData.nameKr || chartData.name}</h3>
                <p style={{ fontSize:11, color:'#9CA3AF' }}>{chartData.name} · {selectedStock?.symbol}</p>
              </div>
              <div style={{ textAlign:'right' }}>
                <p style={{ fontSize:16, fontWeight:800, color:'#111827', marginBottom:2 }}>{chartData.currentPrice?.toLocaleString()}원</p>
                <p style={{ fontSize:12, fontWeight:600, color: chartData.change >= 0 ? '#EF4444' : '#3B82F6' }}>{chartData.change >= 0 ? '+' : ''}{chartData.changePercent?.toFixed(2)}%</p>
              </div>
            </div>
            <div style={{ display:'flex', background:'#F1F5F9', borderRadius:12, padding:3, marginBottom:12 }}>
              <button onClick={() => setTradeType('buy')} style={{ flex:1, padding:'9px', borderRadius:10, fontSize:14, fontWeight:800, background: tradeType === 'buy' ? 'linear-gradient(135deg,#EF4444,#DC2626)' : 'transparent', color: tradeType === 'buy' ? 'white' : '#94A3B8', border:'none', cursor:'pointer' }}>매수</button>
              <button onClick={() => setTradeType('sell')} style={{ flex:1, padding:'9px', borderRadius:10, fontSize:14, fontWeight:800, background: tradeType === 'sell' ? 'linear-gradient(135deg,#3B82F6,#2563EB)' : 'transparent', color: tradeType === 'sell' ? 'white' : '#94A3B8', border:'none', cursor:'pointer' }}>매도</button>
            </div>
            <div style={{ display:'flex', background:'#F1F5F9', borderRadius:12, padding:3, marginBottom:12 }}>
              <button onClick={() => setPriceType('market')} style={{ flex:1, padding:'8px', borderRadius:10, fontSize:13, fontWeight:600, background: priceType === 'market' ? 'white' : 'transparent', color: priceType === 'market' ? '#111827' : '#94A3B8', border:'none', cursor:'pointer', boxShadow: priceType === 'market' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>시장가</button>
              <button onClick={() => setPriceType('limit')} style={{ flex:1, padding:'8px', borderRadius:10, fontSize:13, fontWeight:600, background: priceType === 'limit' ? 'white' : 'transparent', color: priceType === 'limit' ? '#111827' : '#94A3B8', border:'none', cursor:'pointer', boxShadow: priceType === 'limit' ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>지정가</button>
            </div>
            {priceType === 'limit' && (
              <div style={{ marginBottom:12 }}>
                <label style={{ fontSize:12, fontWeight:600, color:'#64748B', display:'block', marginBottom:6 }}>가격 (원)</label>
                <input type="number" value={tradePrice} onChange={e => setTradePrice(e.target.value)} placeholder={`${chartData.currentPrice?.toLocaleString()}`}
                  style={{ width:'100%', padding:'12px 14px', borderRadius:12, border:'1.5px solid #E2E8F0', fontSize:14, fontWeight:700, color:'#111827', outline:'none', boxSizing:'border-box' }} />
              </div>
            )}
            <div style={{ marginBottom:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <label style={{ fontSize:12, fontWeight:600, color:'#64748B' }}>수량 (주)</label>
                {tradeType === 'sell' && userHolding && <span style={{ fontSize:11, color:'#94A3B8' }}>보유 {userHolding.quantity}주</span>}
              </div>
              <input type="number" value={tradeQty} onChange={e => setTradeQty(e.target.value)} placeholder="0"
                style={{ width:'100%', padding:'12px 14px', borderRadius:12, border:'1.5px solid #E2E8F0', fontSize:14, fontWeight:700, color:'#111827', outline:'none', marginBottom:8, boxSizing:'border-box' }} />
              <div style={{ display:'flex', gap:6 }}>
                {[{ label:'10%', pct:10 }, { label:'25%', pct:25 }, { label:'50%', pct:50 }, { label: tradeType === 'buy' ? '최대' : '전량', pct:100 }].map(({ label, pct }) => {
                  const price = priceType === 'market' ? chartData.currentPrice : (Number(tradePrice) || chartData.currentPrice);
                  const qty = tradeType === 'buy' ? Math.floor((userProfile?.cash || 0) * pct / 100 / price) : Math.floor((userHolding?.quantity || 0) * pct / 100) || (pct === 100 ? userHolding?.quantity : 0);
                  return (
                    <button key={pct} onClick={() => setTradeQty(String(qty || 0))}
                      style={{ flex:1, padding:'8px 4px', background:'#F1F5F9', color:'#64748B', borderRadius:10, fontSize:12, fontWeight:600, border:'none', cursor:'pointer' }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {tradeQty && Number(tradeQty) > 0 && (
              <div style={{ background:'#F8FAFC', borderRadius:14, padding:'14px', marginBottom:12 }}>
                {(() => {
                  const price = priceType === 'market' ? chartData.currentPrice : Number(tradePrice);
                  const total = price * Number(tradeQty);
                  const afterCash = tradeType === 'buy' ? userProfile?.cash - total : userProfile?.cash + total;
                  return (
                    <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                      <div style={{ display:'flex', justifyContent:'space-between' }}>
                        <span style={{ fontSize:13, color:'#64748B' }}>주문가격</span>
                        <span style={{ fontSize:13, fontWeight:600, color:'#111827' }}>{price?.toLocaleString()}원</span>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between' }}>
                        <span style={{ fontSize:13, color:'#64748B' }}>총 주문금액</span>
                        <span style={{ fontSize:13, fontWeight:800, color:'#111827' }}>{total?.toLocaleString()}원</span>
                      </div>
                      <div style={{ display:'flex', justifyContent:'space-between', paddingTop:8, borderTop:'1px solid #E2E8F0' }}>
                        <span style={{ fontSize:13, color:'#64748B' }}>주문 후 잔액</span>
                        <span style={{ fontSize:13, fontWeight:800, color: afterCash < 0 ? '#EF4444' : '#111827' }}>{afterCash?.toLocaleString()}원</span>
                      </div>
                      {tradeType === 'sell' && userHolding && (() => {
                        const profit = (price - userHolding.avgPrice) * Number(tradeQty);
                        const rate = ((price - userHolding.avgPrice) / userHolding.avgPrice * 100).toFixed(2);
                        return (
                          <div style={{ display:'flex', justifyContent:'space-between' }}>
                            <span style={{ fontSize:13, color:'#64748B' }}>예상 손익</span>
                            <span style={{ fontSize:13, fontWeight:800, color: profit >= 0 ? '#EF4444' : '#3B82F6' }}>{profit >= 0 ? '+' : ''}{profit.toLocaleString()}원 ({profit >= 0 ? '+' : ''}{rate}%)</span>
                          </div>
                        );
                      })()}
                    </div>
                  );
                })()}
              </div>
            )}
            {tradeError && <p style={{ fontSize:12, color:'#EF4444', textAlign:'center', marginBottom:12 }}>⚠️ {tradeError}</p>}
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setTradeModal(false)} style={{ padding:'14px 20px', background:'#F1F5F9', color:'#64748B', borderRadius:14, fontWeight:700, fontSize:14, border:'none', cursor:'pointer' }}>취소</button>
              <button onClick={handleTrade} disabled={tradeProcessing}
                style={{ flex:1, padding:'14px', color:'white', borderRadius:14, fontWeight:800, fontSize:15, border:'none', cursor: tradeProcessing ? 'not-allowed' : 'pointer',
                  background: tradeProcessing ? '#CBD5E1' : tradeType === 'buy' ? 'linear-gradient(135deg,#EF4444,#DC2626)' : 'linear-gradient(135deg,#3B82F6,#2563EB)',
                  boxShadow: tradeProcessing ? 'none' : tradeType === 'buy' ? '0 4px 14px rgba(239,68,68,0.35)' : '0 4px 14px rgba(59,130,246,0.35)',
                }}>
                {tradeProcessing ? '처리 중...' : tradeType === 'buy' ? '매수 확정' : '매도 확정'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
    </>
  );
}