'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { addBusinessDays } from '@/lib/evalUtils';
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

  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const searchTimeout = useRef(null);

  useEffect(() => {
    if (!loading && !user) router.push('/login');
    if (user) loadWishlist();
  }, [user, loading]);

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
    <main className="min-h-screen bg-gray-50 p-3 md:p-8">
      <div className="max-w-5xl mx-auto">

        {/* 헤더 */}
        <div className="mb-4">
          <div className="flex justify-between items-center mb-2">
            <h1 className="text-xl font-bold text-gray-900 cursor-pointer"
              onClick={() => { setSelectedStock(null); setQuery(''); setChartData(null); setAnalysis(null); setIndicators(null); setError(null); }}>
              📊 주식 AI 분석기
            </h1>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500 hidden sm:block">👤 {user?.displayName}</span>
              <button onClick={logout} className="text-xs px-2.5 py-1.5 bg-gray-100 text-gray-600 rounded-lg">로그아웃</button>
            </div>
          </div>
        </div>

        {/* 검색 */}
        <div className="relative mb-4">
          <div className="flex gap-2">
            <input type="text" value={query} onChange={(e) => setQuery(e.target.value)}
              placeholder="종목명 검색 (삼성전자, 카카오...)"
              className="flex-1 px-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800 text-sm" />
            {selectedStock && (
              <button onClick={loadStockInfo}
                className="shrink-0 px-3 py-2 rounded-xl text-xs font-medium transition-colors whitespace-nowrap"
                style={{
                  background: showStockInfo ? '#3b82f6' : 'white',
                  color: showStockInfo ? 'white' : '#6b7280',
                  border: `1px solid ${showStockInfo ? '#3b82f6' : '#e5e7eb'}`,
                }}>
                {stockInfoLoading ? '⏳' : showStockInfo ? '닫기 ▲' : '📋 종목정보'}
              </button>
            )}
          </div>
          {searchResults.length > 0 && !selectedStock && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-10 overflow-hidden">
              {searchResults.map((stock) => (
                <button key={stock.symbol} onClick={() => { setSelectedStock(stock); setQuery(stock.name); setSearchResults([]); }}
                  className="w-full px-4 py-3 text-left hover:bg-gray-50 flex justify-between items-center border-b border-gray-100 last:border-0">
                  <span className="font-medium text-gray-800 text-sm">{stock.name}</span>
                  <span className="text-xs text-gray-400">{stock.exchange} · {stock.symbol}</span>
                </button>
              ))}
            </div>
          )}
        </div>

        {selectedStock && (
          <>
            {/* 종목 정보 헤더 */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-3">
              {chartData && (
                <div className="flex items-start gap-3">
                  {/* 왼쪽: 종목명 + 가격 */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 mb-0.5">
                      <h2 className="text-base font-bold text-gray-900 truncate">
                        {chartData.nameKr || selectedStock.name || chartData.name}
                      </h2>
                      <button onClick={() => toggleWishlist(selectedStock.symbol, chartData.nameKr || chartData.name)}
                        className="text-2xl transition-all active:scale-125"
                        style={{
                          filter: wishlist.find(w => w.symbol === selectedStock.symbol)
                            ? 'drop-shadow(0 0 6px #fbbf24) drop-shadow(0 0 12px #f59e0b)'
                            : 'grayscale(1) opacity(0.35)',
                          animation: wishlist.find(w => w.symbol === selectedStock.symbol)
                            ? 'starPulse 1.5s ease-in-out infinite'
                            : 'none',
                        }}>
                        ⭐
                        <style>{`
                                @keyframes starPulse {
                                  0%, 100% { filter: drop-shadow(0 0 4px #fbbf24) drop-shadow(0 0 8px #f59e0b); transform: scale(1); }
                                  50% { filter: drop-shadow(0 0 8px #fbbf24) drop-shadow(0 0 20px #f59e0b); transform: scale(1.15); }
                                }
                              `}</style>
                      </button>
                    </div>
                    <p className="text-xs text-gray-400 truncate mb-2">{chartData.name} · {selectedStock.symbol}</p>
                    <div className="flex items-baseline gap-2 flex-wrap">
                      <span className="text-2xl font-bold text-gray-900">{chartData.currentPrice?.toLocaleString()}원</span>
                      <span className={`text-sm font-semibold ${chartData.change >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                        {chartData.change >= 0 ? '+' : ''}{chartData.change?.toLocaleString()}원
                        ({chartData.change >= 0 ? '+' : ''}{chartData.changePercent?.toFixed(2)}%)
                      </span>
                    </div>
                    <p className="text-xs text-gray-400 mt-0.5">{getPrevDateText()}</p>
                  </div>
                  {/* 오른쪽: 봉 선택 */}
                  <div className="flex flex-col gap-1 shrink-0">
                    {[{ key: 'daily', label: '일봉' }, { key: 'weekly', label: '주봉' }, { key: 'monthly', label: '월봉' }, { key: 'yearly', label: '년봉' }].map((t) => (
                      <button key={t.key} onClick={() => setTimeframe(t.key)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${timeframe === t.key ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                        {t.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* 종목 상세 정보 */}
            {showStockInfo && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-3">
                {stockInfoLoading ? (
                  <p className="text-center text-gray-400 py-6 text-sm">📊 종목 정보 불러오는 중...</p>
                ) : stockInfo && (
                  <div className="space-y-4">

                    {/* 기업 개요 */}
                    {(stockInfo.sector || stockInfo.industry) && (
                      <div className="flex gap-2 mb-3">
                        {stockInfo.sector && <span className="px-2.5 py-1 bg-blue-50 text-blue-600 text-xs rounded-full">{stockInfo.sector}</span>}
                        {stockInfo.industry && <span className="px-2.5 py-1 bg-purple-50 text-purple-600 text-xs rounded-full">{stockInfo.industry}</span>}
                      </div>
                    )}
                    {stockInfo.summary && (
                      <div>
                        <p className="text-xs font-bold text-gray-700 mb-1">🏢 기업 개요</p>
                        <p className={`text-xs text-gray-500 leading-relaxed ${showFullSummary ? '' : 'line-clamp-3'}`}>
                          {stockInfo.summary}
                        </p>
                        <button onClick={() => setShowFullSummary(prev => !prev)}
                          className="text-xs text-blue-400 mt-1">
                          {showFullSummary ? '접기 ▲' : '더보기 ▼'}
                        </button>
                      </div>
                    )}

                    {/* 주요 지표 */}
                    <div>
                      <p className="text-xs font-bold text-gray-700 mb-2">📐 주요 지표</p>
                      <div className="grid grid-cols-3 gap-2">
                        {[
                          { label: 'ROE', value: stockInfo.roe },
                          { label: '영업이익률', value: stockInfo.operatingMargin },
                          { label: '배당수익률', value: stockInfo.dividendYield },
                          { label: '베타', value: stockInfo.beta },
                          { label: '매출성장률', value: stockInfo.revenueGrowth },
                          { label: '목표주가', value: stockInfo.targetMeanPrice || '' },
                        ].filter(item => item.value && item.value !== '').map(({ label, value }) => (
                          <div key={label} className="bg-gray-50 rounded-xl p-2.5 text-center">
                            <p className="text-xs text-gray-400 mb-0.5">{label}</p>
                            <p className="text-sm font-bold text-gray-800">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 52주 가격 범위 */}
                    {(stockInfo.high52 || stockInfo.low52) && (
                      <div>
                        <p className="text-xs font-bold text-gray-700 mb-2">📅 52주 가격 범위</p>
                        <div className="bg-gray-50 rounded-xl p-3">
                          <div className="flex justify-between items-center mb-2">
                            <span className="text-xs text-blue-500 font-medium">최저 {stockInfo.low52}원</span>
                            <span className="text-xs text-red-500 font-medium">최고 {stockInfo.high52}원</span>
                          </div>
                          {(() => {
                            const low = stockInfo?.low52Raw || 0;
                            const high = stockInfo?.high52Raw || 0;
                            const current = chartData?.currentPrice || 0;
                            const pct = high > low ? Math.round(((current - low) / (high - low)) * 100) : 50;
                            return (
                              <div className="relative w-full bg-gray-200 rounded-full h-2">
                                <div className="absolute h-2 rounded-full bg-gradient-to-r from-blue-400 to-red-400"
                                  style={{ width: `${pct}%` }} />
                                <div className="absolute w-3 h-3 bg-white border-2 border-gray-700 rounded-full top-1/2 -translate-y-1/2"
                                  style={{ left: `calc(${pct}% - 6px)` }} />
                              </div>
                            );
                          })()}
                          <p className="text-xs text-gray-400 text-center mt-1.5">
                            현재가 52주 범위 내 위치
                          </p>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            {/* 차트 */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-3 mb-3">
              {!loading && chartData?.chartData?.length > 0 && (
                <div className="flex justify-between items-center mb-2">
                  <span className="text-xs text-gray-400">
                    {chartData.chartData[0]?.time} ~ {chartData.chartData[chartData.chartData.length - 1]?.time}
                  </span>
                  <button onClick={() => setShowVolumeProfile(prev => !prev)}
                    className={`px-2 py-1 rounded-lg text-xs font-medium transition-colors ${showVolumeProfile ? 'bg-purple-100 text-purple-600' : 'bg-gray-100 text-gray-400'}`}>
                    📊 매물대 {showVolumeProfile ? 'OFF' : 'ON'}
                  </button>
                </div>
              )}
              {loading ? (
                <div className="h-72 flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <div className="text-3xl mb-2 animate-spin">⏳</div>
                    <p className="text-sm">차트 불러오는 중...</p>
                  </div>
                </div>
              ) : (
                <div className="w-full relative">
                  <div ref={chartContainerRef} className="w-full" />
                  <div className="absolute w-full border-t border-gray-200" style={{ bottom: '72px' }} />
                </div>
              )}
            </div>

            {/* 보유현황 + 매수/매도 */}
            {!loading && chartData && (
              <div className="mb-3">
                {userHolding && (
                  <div className="bg-gray-900 rounded-2xl p-4 mb-2 text-white">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-xs text-gray-400 mb-0.5">보유 현황</p>
                        <p className="font-bold text-sm">{userHolding.quantity}주 · 평균 {userHolding.avgPrice?.toLocaleString()}원</p>
                      </div>
                      <div className="text-right">
                        {(() => {
                          const profit = (chartData.currentPrice - userHolding.avgPrice) * userHolding.quantity;
                          const profitRate = ((chartData.currentPrice - userHolding.avgPrice) / userHolding.avgPrice * 100).toFixed(2);
                          return (
                            <>
                              <p className="font-bold text-sm">{(chartData.currentPrice * userHolding.quantity).toLocaleString()}원</p>
                              <p className={`text-xs font-medium ${profit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                                {profit >= 0 ? '+' : ''}{profit.toLocaleString()}원 ({profit >= 0 ? '+' : ''}{profitRate}%)
                              </p>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                )}
                {userProfile && (
                  <div className="flex justify-between items-center px-1 mb-2">
                    <span className="text-xs text-gray-500">💵 주문가능금액</span>
                    <span className="text-sm font-bold text-gray-700">{userProfile.cash?.toLocaleString()}원</span>
                  </div>
                )}
                <div className="flex gap-2">
                  <button onClick={() => { setTradeType('buy'); setTradeModal(true); setTradeError(''); setTradeQty(''); setTradePrice(''); setPriceType('market'); }}
                    className="flex-1 py-3.5 bg-red-500 text-white rounded-2xl font-bold text-sm">매수</button>
                  <button onClick={() => { if (!userHolding) return; setTradeType('sell'); setTradeModal(true); setTradeError(''); setTradeQty(''); setTradePrice(''); setPriceType('market'); }}
                    className={`flex-1 py-3.5 rounded-2xl font-bold text-sm ${userHolding ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-300 cursor-not-allowed'}`}>매도</button>
                </div>
              </div>
            )}

            {/* AI 분석 버튼 */}
            {!loading && chartData && (
              <div className="mb-4">
                {analysisCache[selectedStock?.symbol] && (
                  <p className="text-center text-xs text-gray-400 mb-2">📅 {analysisCache[selectedStock?.symbol]?.analyzedAt}</p>
                )}
                <button onClick={handleAnalyze} disabled={analyzing}
                  className="w-full py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-2xl font-bold text-base shadow-md disabled:opacity-60">
                  {analyzing ? '🤖 AI 분석 중...' : analysisCache[selectedStock?.symbol] ? '🔄 AI 재분석' : '🔍 AI 분석 시작'}
                </button>
              </div>
            )}

            {error && <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-3 text-red-600 text-sm">⚠️ {error}</div>}

            {/* 뉴스 섹션 */}
            {(news.length > 0 || newsLoading) && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
                <div className="flex justify-between items-center mb-3">
                  <h3 className="font-bold text-gray-900">📰 관련 뉴스</h3>
                  {news.length > 0 && !newsAnalysis && (
                    <button onClick={analyzeNews} disabled={newsAnalyzing}
                      className="px-3 py-1.5 bg-purple-500 text-white rounded-xl text-xs font-bold disabled:opacity-60">
                      {newsAnalyzing ? '분석 중...' : '🤖 AI 감성분석'}
                    </button>
                  )}
                </div>
                {newsAnalysis && (
                  <div className={`rounded-2xl p-4 mb-3 ${newsAnalysis.sentiment === '긍정' ? 'bg-red-50 border border-red-200' : newsAnalysis.sentiment === '부정' ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 border border-gray-200'}`}>
                    <div className="flex justify-between items-center mb-2">
                      <p className={`text-lg font-bold ${newsAnalysis.sentiment === '긍정' ? 'text-red-500' : newsAnalysis.sentiment === '부정' ? 'text-blue-500' : 'text-gray-500'}`}>
                        {newsAnalysis.sentiment === '긍정' ? '😊' : newsAnalysis.sentiment === '부정' ? '😟' : '😐'} {newsAnalysis.sentiment}
                      </p>
                      <p className="text-2xl font-bold text-gray-900">{newsAnalysis.score}</p>
                    </div>
                    <div className="w-full bg-white rounded-full h-2 mb-2">
                      <div className={`h-2 rounded-full ${newsAnalysis.score >= 60 ? 'bg-red-400' : newsAnalysis.score <= 40 ? 'bg-blue-400' : 'bg-gray-400'}`} style={{ width: `${newsAnalysis.score}%` }} />
                    </div>
                    <p className="text-sm text-gray-700 leading-relaxed mb-1">{newsAnalysis.summary}</p>
                    <p className="text-xs text-gray-600 mb-2">📊 {newsAnalysis.impact}</p>
                    <div className="bg-yellow-50 border border-yellow-200 rounded-xl p-2">
                      <p className="text-xs font-bold text-yellow-700 mb-0.5">🐣 쉬운 설명</p>
                      <p className="text-xs text-yellow-800">{newsAnalysis.easyExplain}</p>
                    </div>
                  </div>
                )}
                {newsLoading ? <p className="text-center text-gray-400 py-4 text-sm">뉴스 불러오는 중...</p> : (
                  <div className="space-y-2">
                    {news.map((article, i) => (
                      <a key={i} href={article.link} target="_blank" rel="noopener noreferrer"
                        className="block p-3 bg-gray-50 rounded-xl hover:bg-gray-100 transition-colors">
                        <p className="font-medium text-gray-900 text-sm leading-tight mb-1">{article.title}</p>
                        {article.desc && <p className="text-xs text-gray-500 mb-1 line-clamp-2">{article.desc}</p>}
                        <div className="flex gap-2 text-xs text-gray-400">
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
              <div className="space-y-3">
                {analysis.probability && (
                  <div className="bg-gray-900 rounded-2xl p-4 text-white">
                    <p className="text-xs text-gray-400 mb-3">📊 퀀트 분석 결과</p>
                    <div className="mb-3">
                      <div className="flex justify-between items-center mb-1.5">
                        <span className="text-sm font-medium text-red-400">상승 {analysis.probability.bullish}%</span>
                        <span className="text-sm font-medium text-blue-400">하락 {analysis.probability.bearish}%</span>
                      </div>
                      <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                        <div className="h-3 bg-gradient-to-r from-red-500 to-red-400 rounded-full" style={{ width: `${analysis.probability.bullish}%` }} />
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div className="bg-white bg-opacity-10 rounded-xl p-2.5 text-center col-span-2">
                        <p className="text-xs text-gray-400 mb-1">신뢰도</p>
                        <p className="text-2xl font-bold text-green-400">{analysis.confidence}%</p>
                        {analysis.scoreBreakdown?.atrRatio > 3 && (
                          <p className="text-xs text-yellow-400 mt-0.5">⚡ 변동성 높음 ({analysis.scoreBreakdown.atrRatio}%)</p>
                        )}
                      </div>
                    </div>

                    {/* 레이어별 점수 */}
                    {analysis.scoreBreakdown && (
                      <div className="mb-3">
                        <p className="text-xs text-gray-400 mb-2">레이어별 점수</p>
                        <div className="space-y-1.5">
                          {[
                            { label: '퀀트팩터', score: analysis.scoreBreakdown.quant?.score, weight: '40%', color: 'bg-purple-400' },
                            { label: '기술지표', score: analysis.scoreBreakdown.tech?.score, weight: '30%', color: 'bg-blue-400' },
                            { label: '뉴스감성', score: analysis.scoreBreakdown.news?.score, weight: '20%', color: 'bg-green-400' },
                            { label: 'MTF추세', score: analysis.scoreBreakdown.mtf?.score, weight: '10%', color: 'bg-yellow-400' },
                          ].map(({ label, score, weight, color }) => {
                            const barWidth = Math.min(Math.abs(score || 0) / 10 * 100, 100);
                            const isPositive = (score || 0) >= 0;
                            return (
                              <div key={label} className="flex items-center gap-2">
                                <span className="text-xs text-gray-400 w-14 shrink-0">{label}</span>
                                <span className="text-xs text-gray-500 w-6 shrink-0">{weight}</span>
                                <div className="flex-1 bg-gray-700 rounded-full h-1.5 overflow-hidden">
                                  <div className={`h-1.5 rounded-full ${isPositive ? color : 'bg-gray-500'}`}
                                    style={{ width: `${barWidth}%` }} />
                                </div>
                                <span className={`text-xs font-bold w-8 text-right shrink-0 ${isPositive ? 'text-red-400' : 'text-blue-400'}`}>
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
                        <p className="text-xs text-gray-400 mb-2">핵심 신호</p>
                        <div className="space-y-1.5">
                          {analysis.keySignals.map((signal, i) => (
                            <div key={i}>
                              <div className="flex items-center gap-2">
                                <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${signal.type === 'bullish' ? 'bg-red-400' : 'bg-blue-400'}`} />
                                <span className="text-xs text-gray-300 flex-1">{signal.label}</span>
                                <span className={`text-xs font-bold ${signal.type === 'bullish' ? 'text-red-400' : 'text-blue-400'}`}>
                                  {signal.score >= 0 ? '+' : ''}{signal.score}
                                </span>
                              </div>
                              {signal.easy && (
                                <p className="text-xs text-gray-500 mt-0.5 ml-3.5 leading-relaxed">💡 {signal.easy}</p>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* 퀀트 인사이트 */}
                    {analysis.quantInsight && (
                      <div className="mt-3 bg-blue-900 bg-opacity-40 rounded-xl p-3">
                        <p className="text-xs font-bold text-blue-300 mb-1">📐 퀀트 분석 한줄 요약</p>
                        <p className="text-xs text-blue-100 leading-relaxed">{analysis.quantInsight}</p>
                      </div>
                    )}

                    {/* 리스크 경고 */}
                    {analysis.riskWarning && (
                      <div className="mt-2 bg-yellow-900 bg-opacity-40 rounded-xl p-3">
                        <p className="text-xs font-bold text-yellow-300 mb-1">⚠️ 주의사항</p>
                        <p className="text-xs text-yellow-100 leading-relaxed">{analysis.riskWarning}</p>
                      </div>
                    )}
                  </div>
                )}

                {analysis.scenarios && (
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-3">
                      <div className="flex justify-between items-center mb-2">
                        <p className="font-bold text-red-700 text-sm">📈 상승</p>
                        <span className="text-sm font-bold text-red-500">{analysis.scenarios.scenarioA.probability}%</span>
                      </div>
                      {analysis.scenarios.scenarioA.conditions.map((c, i) => <p key={i} className="text-xs text-red-700 mb-0.5">· {c}</p>)}
                      <div className="bg-red-100 rounded-xl p-2 text-center mt-2">
                        <p className="text-xs text-red-500">목표가</p>
                        <p className="text-xs font-bold text-red-700">{analysis.scenarios.scenarioA.targetRange.low?.toLocaleString()}~{analysis.scenarios.scenarioA.targetRange.high?.toLocaleString()}원</p>
                      </div>
                    </div>
                    <div className="bg-blue-50 border border-blue-200 rounded-2xl p-3">
                      <div className="flex justify-between items-center mb-2">
                        <p className="font-bold text-blue-700 text-sm">📉 하락</p>
                        <span className="text-sm font-bold text-blue-500">{analysis.scenarios.scenarioB.probability}%</span>
                      </div>
                      {analysis.scenarios.scenarioB.conditions.map((c, i) => <p key={i} className="text-xs text-blue-700 mb-0.5">· {c}</p>)}
                      <div className="bg-blue-100 rounded-xl p-2 text-center mt-2">
                        <p className="text-xs text-blue-500">하락구간</p>
                        <p className="text-xs font-bold text-blue-700">{analysis.scenarios.scenarioB.targetRange.low?.toLocaleString()}~{analysis.scenarios.scenarioB.targetRange.high?.toLocaleString()}원</p>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                  <h3 className="font-bold text-gray-900 mb-2">📋 종합 분석</h3>
                  <p className="text-gray-700 text-sm leading-relaxed">{analysis.summary}</p>
                  {analysis.easySummary && (
                    <details className="mt-3">
                      <summary className="cursor-pointer px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-xl text-xs font-bold text-yellow-700 list-none flex items-center justify-between">
                        <span>🐣 주린이 설명</span><span>▼</span>
                      </summary>
                      <div className="mt-1 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                        <p className="text-sm text-yellow-800 leading-relaxed">{analysis.easySummary}</p>
                      </div>
                    </details>
                  )}
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {analysis.keyPoints?.map((point, i) => (
                      <span key={i} className="px-2.5 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">{point}</span>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-2">
                  {[{ key: 'daily', label: '단기', sub: '1~3일' }, { key: 'weekly', label: '주간', sub: '1주' }, { key: 'monthly', label: '월간', sub: '1개월' }].map(({ key, label, sub }) => (
                    <div key={key} className={`rounded-2xl border p-3 ${getPredictionBg(analysis[key]?.prediction)}`}>
                      <p className="text-xs text-gray-400">{sub}</p>
                      <p className="text-xs font-bold text-gray-900 mb-1">{label}</p>
                      <div className="flex items-center gap-1 mb-1">
                        <span className="text-lg">{getPredictionEmoji(analysis[key]?.prediction)}</span>
                        <p className={`text-base font-bold ${getPredictionColor(analysis[key]?.prediction)}`}>{analysis[key]?.prediction}</p>
                      </div>
                      <p className="text-xs text-gray-600 mb-1">목표: <span className="font-bold">{analysis[key]?.targetPrice?.toLocaleString()}원</span></p>
                      <div className="w-full bg-white rounded-full h-1.5 mb-1">
                        <div className={`h-1.5 rounded-full ${analysis[key]?.prediction === '상승' ? 'bg-red-400' : analysis[key]?.prediction === '하락' ? 'bg-blue-400' : 'bg-gray-400'}`}
                          style={{ width: `${analysis[key]?.confidence}%` }} />
                      </div>
                      <p className="text-xs text-gray-400 mb-1">신뢰도 {analysis[key]?.confidence}%</p>
                      <p className="text-xs text-gray-500 leading-relaxed">{analysis[key]?.reason}</p>
                      {analysis[key]?.easyReason && (
                        <details className="mt-1.5">
                          <summary className="cursor-pointer text-xs font-bold text-yellow-600 list-none">🐣 쉬운설명 ▼</summary>
                          <p className="text-xs text-yellow-800 mt-1 leading-relaxed">{analysis[key]?.easyReason}</p>
                        </details>
                      )}
                    </div>
                  ))}
                </div>

                {indicators && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
                    <h3 className="font-bold text-gray-900 mb-3">📐 기술 지표</h3>
                    <div className="grid grid-cols-2 gap-2">
                      {(() => {
                        const v = indicators.rsi;
                        const status = v > 70 ? { label: '과매수', color: 'text-red-500', bg: 'bg-red-50' } :
                          v < 30 ? { label: '과매도', color: 'text-blue-500', bg: 'bg-blue-50' } :
                            v > 60 ? { label: '상승모멘텀', color: 'text-yellow-600', bg: 'bg-yellow-50' } :
                              v < 40 ? { label: '하락모멘텀', color: 'text-yellow-600', bg: 'bg-yellow-50' } :
                                { label: '중립', color: 'text-green-600', bg: 'bg-green-50' };
                        return (
                          <div className="bg-gray-50 rounded-xl p-3">
                            <div className="flex justify-between items-center mb-1">
                              <p className="text-xs text-gray-500">RSI(14)</p>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${status.bg} ${status.color}`}>{status.label}</span>
                            </div>
                            <p className="font-bold text-gray-900">{v}</p>
                            {analysis?.indicatorComments?.rsi && <p className="text-xs text-blue-600 mt-1 pt-1 border-t border-gray-200">💬 {analysis.indicatorComments.rsi}</p>}
                          </div>
                        );
                      })()}
                      {(() => {
                        const hist = indicators.macdHistogram;
                        const status = hist > 0 && indicators.macd > 0 ? { label: '강한상승', color: 'text-red-500', bg: 'bg-red-50' } :
                          hist > 0 ? { label: '상승전환', color: 'text-yellow-600', bg: 'bg-yellow-50' } :
                            hist < 0 && indicators.macd < 0 ? { label: '강한하락', color: 'text-blue-500', bg: 'bg-blue-50' } :
                              { label: '하락전환', color: 'text-yellow-600', bg: 'bg-yellow-50' };
                        return (
                          <div className="bg-gray-50 rounded-xl p-3">
                            <div className="flex justify-between items-center mb-1">
                              <p className="text-xs text-gray-500">MACD</p>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${status.bg} ${status.color}`}>{status.label}</span>
                            </div>
                            <p className="font-bold text-gray-900">{indicators.macd}</p>
                            {analysis?.indicatorComments?.macd && <p className="text-xs text-blue-600 mt-1 pt-1 border-t border-gray-200">💬 {analysis.indicatorComments.macd}</p>}
                          </div>
                        );
                      })()}
                      {(() => {
                        const price = indicators.currentPrice;
                        const above20 = price > indicators.ma20;
                        const above60 = price > indicators.ma60;
                        const status = above20 && above60 ? { label: '정배열', color: 'text-red-500', bg: 'bg-red-50' } :
                          !above20 && !above60 ? { label: '역배열', color: 'text-blue-500', bg: 'bg-blue-50' } :
                            { label: '혼조', color: 'text-yellow-600', bg: 'bg-yellow-50' };
                        return (
                          <div className="bg-gray-50 rounded-xl p-3">
                            <div className="flex justify-between items-center mb-1">
                              <p className="text-xs text-gray-500">이동평균</p>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${status.bg} ${status.color}`}>{status.label}</span>
                            </div>
                            <p className="font-bold text-gray-900 text-sm">{price?.toLocaleString()}</p>
                            <p className="text-xs text-gray-400">MA20: {indicators.ma20?.toLocaleString()} / MA60: {indicators.ma60?.toLocaleString()}</p>
                            {analysis?.indicatorComments?.ma && <p className="text-xs text-blue-600 mt-1 pt-1 border-t border-gray-200">💬 {analysis.indicatorComments.ma}</p>}
                          </div>
                        );
                      })()}
                      {(() => {
                        const price = indicators.currentPrice;
                        const range = indicators.bbUpper - indicators.bbLower;
                        const pos = range > 0 ? ((price - indicators.bbLower) / range) * 100 : 50;
                        const status = pos > 90 ? { label: '상단돌파', color: 'text-red-500', bg: 'bg-red-50' } :
                          pos > 70 ? { label: '상단근접', color: 'text-yellow-600', bg: 'bg-yellow-50' } :
                            pos < 10 ? { label: '하단돌파', color: 'text-blue-500', bg: 'bg-blue-50' } :
                              pos < 30 ? { label: '하단근접', color: 'text-yellow-600', bg: 'bg-yellow-50' } :
                                { label: '중간구간', color: 'text-green-600', bg: 'bg-green-50' };
                        return (
                          <div className="bg-gray-50 rounded-xl p-3">
                            <div className="flex justify-between items-center mb-1">
                              <p className="text-xs text-gray-500">볼린저밴드</p>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${status.bg} ${status.color}`}>{status.label}</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5 my-1.5">
                              <div className="bg-blue-400 h-1.5 rounded-full" style={{ width: `${Math.min(Math.max(pos, 2), 98)}%` }} />
                            </div>
                            <p className="text-xs text-gray-400">상단 {indicators.bbUpper?.toLocaleString()} / 하단 {indicators.bbLower?.toLocaleString()}</p>
                            {analysis?.indicatorComments?.bb && <p className="text-xs text-blue-600 mt-1 pt-1 border-t border-gray-200">💬 {analysis.indicatorComments.bb}</p>}
                          </div>
                        );
                      })()}
                      {(() => {
                        const v = indicators.volumeRatio;
                        const status = v > 2 ? { label: '급등', color: 'text-red-500', bg: 'bg-red-50' } :
                          v > 1.5 ? { label: '증가', color: 'text-yellow-600', bg: 'bg-yellow-50' } :
                            v < 0.5 ? { label: '급감', color: 'text-blue-500', bg: 'bg-blue-50' } :
                              v < 0.8 ? { label: '감소', color: 'text-yellow-600', bg: 'bg-yellow-50' } :
                                { label: '보통', color: 'text-green-600', bg: 'bg-green-50' };
                        return (
                          <div className="bg-gray-50 rounded-xl p-3">
                            <div className="flex justify-between items-center mb-1">
                              <p className="text-xs text-gray-500">거래량</p>
                              <span className={`text-xs px-1.5 py-0.5 rounded-full ${status.bg} ${status.color}`}>{status.label}</span>
                            </div>
                            <p className="font-bold text-gray-900">{v}x</p>
                            <p className="text-xs text-gray-400">20일 평균 대비</p>
                            {analysis?.indicatorComments?.volume && <p className="text-xs text-blue-600 mt-1 pt-1 border-t border-gray-200">💬 {analysis.indicatorComments.volume}</p>}
                          </div>
                        );
                      })()}
                      <div className="bg-gray-50 rounded-xl p-3">
                        <div className="flex justify-between items-center mb-2">
                          <p className="text-xs text-gray-500">주요 매물대</p>
                          <span className="text-xs px-1.5 py-0.5 rounded-full bg-purple-50 text-purple-600">집중구간</span>
                        </div>
                        <div className="space-y-1.5">
                          {indicators.volumeProfile?.map((p, i) => (
                            <div key={i} className="flex items-center gap-1.5">
                              <span className="text-gray-500 shrink-0" style={{ fontSize: '10px' }}>{p.priceFrom.toLocaleString()}~{p.priceTo.toLocaleString()}</span>
                              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                                <div className="bg-purple-400 h-1.5 rounded-full" style={{ width: `${p.strength}%` }} />
                              </div>
                              <span className="text-xs text-gray-500 shrink-0">{p.strength}%</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-3 text-xs text-yellow-700">
                  ⚠️ 본 분석은 AI 기반 기술적 분석으로 투자 권유가 아닙니다.
                </div>
              </div>
            )}
          </>
        )}

        {/* 초기 화면 */}
        {!selectedStock && (
          <>
            {wishlistStocks.length > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-3">
                <h2 className="font-bold text-gray-900 mb-3">⭐ 관심종목</h2>
                <div className="space-y-2">
                  {wishlistStocks.map((stock) => (
                    <div key={stock.symbol} className="flex items-center gap-2 p-3 rounded-xl border border-gray-100 hover:bg-gray-50 transition-colors">
                      <button onClick={() => { setSelectedStock({ symbol: stock.symbol, name: stock.name, exchange: '' }); setQuery(stock.name); }}
                        className="flex-1 min-w-0 flex items-center gap-3 text-left">
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-gray-900 text-sm truncate">{stock.name}</p>
                          <p className="text-xs text-gray-400">{stock.currentPrice?.toLocaleString()}원</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className={`text-xs font-medium ${stock.change >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                            오늘 {stock.change >= 0 ? '+' : ''}{stock.changePercent?.toFixed(2)}%
                          </p>
                          {stock.registeredReturn !== null && (
                            <p className={`text-xs font-medium ${Number(stock.registeredReturn) >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
                              등록후 {Number(stock.registeredReturn) >= 0 ? '+' : ''}{stock.registeredReturn}%
                            </p>
                          )}
                        </div>
                      </button>
                      <button onClick={() => toggleWishlist(stock.symbol, stock.name)} className="text-xl shrink-0 hover:opacity-60">⭐</button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-3">
              <div className="mb-3">
                <div className="flex justify-between items-center mb-2">
                  <h2 className="font-bold text-gray-900">🔥 실시간 TOP 30</h2>
                  {topUpdatedAt && <p className="text-xs text-gray-400">{topUpdatedAt}</p>}
                </div>
                <div className="flex gap-1.5 overflow-x-auto pb-1">
                  {[
                    { key: 'volume', label: '거래량' },
                    { key: 'amount', label: '거래대금' },
                    { key: 'marcap', label: '시가총액' },
                    { key: 'rise', label: '📈 상승률' },
                    { key: 'fall', label: '📉 하락률' },
                  ].map((t) => (
                    <button key={t.key} onClick={() => setTopType(t.key)}
                      className={`flex-1 py-1.5 rounded-xl text-xs font-medium transition-colors ${topType === t.key ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600'}`}>
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              {topLoading ? (
                <div className="text-center py-8 text-gray-400 text-sm">불러오는 중...</div>
              ) : (
                <div className="space-y-1.5">
                  {topStocks.map((stock, i) => (
                    <button key={stock.code} onClick={() => { setSelectedStock({ symbol: stock.code, name: stock.name, exchange: 'KOSPI' }); setQuery(stock.name); }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors text-left">
                      <span className={`w-6 h-6 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-yellow-400 text-white' : i === 1 ? 'bg-gray-400 text-white' : i === 2 ? 'bg-orange-400 text-white' : 'bg-gray-100 text-gray-500'}`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">{stock.name}</p>
                        <p className="text-xs text-gray-400">{Number(stock.price).toLocaleString()}원</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-medium ${stock.changeRate.includes('+') ? 'text-red-500' : stock.changeRate.includes('-') ? 'text-blue-500' : 'text-gray-500'}`}>
                          {stock.changeRate.includes('%') ? stock.changeRate : `${stock.changeRate}%`}
                        </p>
                        <p className="text-xs text-gray-400">
                          {topType === 'volume' ? `${Number(stock.volume).toLocaleString()}주` : topType === 'amount' ? `${Number(stock.amount).toLocaleString()}백만` : `${Number(stock.marcap).toLocaleString()}억`}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* 매수/매도 모달 */}
      {tradeModal && chartData && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-end justify-center z-50">
          <div className="bg-white rounded-t-3xl w-full max-w-md p-5 pb-24" style={{ animation: 'slideUp 0.2s ease-out' }}>
            <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-4" />
            <div className="flex justify-between items-start mb-4">
              <div>
                <h3 className="font-bold text-gray-900">{chartData.nameKr || chartData.name}</h3>
                <p className="text-xs text-gray-400">{chartData.name} · {selectedStock?.symbol}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-gray-900">{chartData.currentPrice?.toLocaleString()}원</p>
                <p className={`text-xs font-medium ${chartData.change >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                  {chartData.change >= 0 ? '+' : ''}{chartData.changePercent?.toFixed(2)}%
                </p>
              </div>
            </div>
            <div className="flex bg-gray-100 rounded-xl p-1 mb-3">
              <button onClick={() => setTradeType('buy')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${tradeType === 'buy' ? 'bg-red-500 text-white shadow-sm' : 'text-gray-500'}`}>매수</button>
              <button onClick={() => setTradeType('sell')} className={`flex-1 py-2 rounded-lg text-sm font-bold transition-colors ${tradeType === 'sell' ? 'bg-blue-500 text-white shadow-sm' : 'text-gray-500'}`}>매도</button>
            </div>
            <div className="flex bg-gray-100 rounded-xl p-1 mb-3">
              <button onClick={() => setPriceType('market')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${priceType === 'market' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>시장가</button>
              <button onClick={() => setPriceType('limit')} className={`flex-1 py-2 rounded-lg text-sm font-medium transition-colors ${priceType === 'limit' ? 'bg-white shadow-sm text-gray-900' : 'text-gray-400'}`}>지정가</button>
            </div>
            {priceType === 'limit' && (
              <div className="mb-3">
                <label className="text-xs font-medium text-gray-500 mb-1.5 block">가격 (원)</label>
                <input type="number" value={tradePrice} onChange={e => setTradePrice(e.target.value)}
                  placeholder={`${chartData.currentPrice?.toLocaleString()}`}
                  className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium" />
              </div>
            )}
            <div className="mb-3">
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-medium text-gray-500">수량 (주)</label>
                {tradeType === 'sell' && userHolding && <span className="text-xs text-gray-400">보유 {userHolding.quantity}주</span>}
              </div>
              <input type="number" value={tradeQty} onChange={e => setTradeQty(e.target.value)} placeholder="0"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium mb-2" />
              <div className="flex gap-2">
                {[{ label: '10%', pct: 10 }, { label: '25%', pct: 25 }, { label: '50%', pct: 50 }, { label: tradeType === 'buy' ? '최대' : '전량', pct: 100 }].map(({ label, pct }) => {
                  const price = priceType === 'market' ? chartData.currentPrice : (Number(tradePrice) || chartData.currentPrice);
                  const qty = tradeType === 'buy'
                    ? Math.floor((userProfile?.cash || 0) * pct / 100 / price)
                    : Math.floor((userHolding?.quantity || 0) * pct / 100) || (pct === 100 ? userHolding?.quantity : 0);
                  return (
                    <button key={pct} onClick={() => setTradeQty(String(qty || 0))}
                      className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium hover:bg-gray-200">
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
            {tradeQty && Number(tradeQty) > 0 && (
              <div className="bg-gray-50 rounded-2xl p-4 mb-3 space-y-2">
                {(() => {
                  const price = priceType === 'market' ? chartData.currentPrice : Number(tradePrice);
                  const total = price * Number(tradeQty);
                  const afterCash = tradeType === 'buy' ? userProfile?.cash - total : userProfile?.cash + total;
                  return (
                    <>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">주문가격</span><span className="font-medium">{price?.toLocaleString()}원</span></div>
                      <div className="flex justify-between text-sm"><span className="text-gray-500">총 주문금액</span><span className="font-bold">{total?.toLocaleString()}원</span></div>
                      <div className="flex justify-between text-sm pt-2 border-t border-gray-200">
                        <span className="text-gray-500">주문 후 잔액</span>
                        <span className={`font-bold ${afterCash < 0 ? 'text-red-500' : 'text-gray-900'}`}>{afterCash?.toLocaleString()}원</span>
                      </div>
                      {tradeType === 'sell' && userHolding && (() => {
                        const profit = (price - userHolding.avgPrice) * Number(tradeQty);
                        const rate = ((price - userHolding.avgPrice) / userHolding.avgPrice * 100).toFixed(2);
                        return (
                          <div className="flex justify-between text-sm">
                            <span className="text-gray-500">예상 손익</span>
                            <span className={`font-bold ${profit >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                              {profit >= 0 ? '+' : ''}{profit.toLocaleString()}원 ({profit >= 0 ? '+' : ''}{rate}%)
                            </span>
                          </div>
                        );
                      })()}
                    </>
                  );
                })()}
              </div>
            )}
            {tradeError && <p className="text-xs text-red-500 mb-3 text-center">⚠️ {tradeError}</p>}
            <div className="flex gap-2">
              <button onClick={() => setTradeModal(false)} className="px-5 py-3.5 bg-gray-100 text-gray-600 rounded-2xl font-medium text-sm">취소</button>
              <button onClick={handleTrade} disabled={tradeProcessing}
                className={`flex-1 py-3.5 text-white rounded-2xl font-bold text-sm disabled:opacity-60 ${tradeType === 'buy' ? 'bg-red-500' : 'bg-blue-500'}`}>
                {tradeProcessing ? '처리 중...' : tradeType === 'buy' ? '매수 확정' : '매도 확정'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}