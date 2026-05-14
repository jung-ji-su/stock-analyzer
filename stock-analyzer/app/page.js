'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { addBusinessDays } from '@/lib/evalUtils';
import { useSearchParams } from 'next/navigation';
import { doc, getDoc, setDoc, updateDoc, addDoc, collection, serverTimestamp, deleteDoc, arrayUnion, arrayRemove } from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';

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
  const [briefMini, setBriefMini] = useState(null);

  // ── NEW: detail tab state ──
  const [detailTab, setDetailTab] = useState('overview'); // 'overview' | 'analysis' | 'news'

  const [symbol, setSymbol] = useState(null);
  const [searchFocused, setSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState([]);
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const searchTimeout = useRef(null);
  const searchBlurTimeout = useRef(null);
  const searchParams = useSearchParams();
  const symbolFromQuery = searchParams.get('symbol');

  // ─────────────────────────────────────────────────────────────────────────
  // ALL ORIGINAL LOGIC — UNCHANGED
  // ─────────────────────────────────────────────────────────────────────────

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
    setDetailTab('overview');
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

  useEffect(() => {
    if (!user) return;
    fetch('/api/morning-brief')
      .then(r => r.json())
      .then(d => { if (d.briefing?.kospi?.price) setBriefMini(d.briefing); })
      .catch(() => {});
  }, [user]);

  useEffect(() => {
    const q = searchParams.get('q');
    if (q) {
      setQuery(q);
      window.history.replaceState({}, '', '/');
      setTimeout(async () => {
        try {
          const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
          const data = await res.json();
          const results = data.results || [];
          if (results.length > 0) setSelectedStock(results[0]);
        } catch { }
      }, 100);
    }
  }, [searchParams]);

  useEffect(() => {
    if (symbolFromQuery) setSymbol(symbolFromQuery);
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
    return top3.map(p => ({ ...p, strength: Math.round((p.volume / totalVol) * 100) }));
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
      height: 300,
      layout: { background: { color: 'transparent' }, textColor: '#64748b' },
      grid: { vertLines: { color: '#f1f5f9' }, horzLines: { color: '#f1f5f9' } },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#e2e8f0', borderVisible: true },
      leftPriceScale: { visible: false },
      timeScale: { borderColor: '#e2e8f0', timeVisible: true, borderVisible: true },
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
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.75, bottom: 0 }, borderVisible: true, borderColor: '#e5e7eb' });
    volumeSeries.setData(chartData.chartData.map(d => ({
      time: d.time, value: d.volume,
      color: d.close >= d.open ? '#ef444466' : '#3b82f666',
    })));
    chart.timeScale().fitContent();
    const separatorSeries = chart.addSeries(LWC.HistogramSeries, {
      color: 'transparent', priceFormat: { type: 'volume' }, priceScaleId: 'volume',
      lastValueVisible: false, priceLineVisible: false,
    });
    separatorSeries.setData(chartData.chartData.map(d => ({ time: d.time, value: 0 })));
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.75, bottom: 0 }, borderVisible: true, borderColor: '#9ca3af' });
    if (userHolding?.avgPrice) {
      candleSeries.createPriceLine({ price: userHolding.avgPrice, color: '#f59e0b', lineWidth: 2, lineStyle: 1, axisLabelVisible: true, title: `평단가 ${userHolding.avgPrice.toLocaleString()}원` });
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
        candleSeries.createPriceLine({ price: Math.round((profile.priceFrom + profile.priceTo) / 2), color, lineWidth: Math.round((profile.strength / maxStrength) * 5) + 1, lineStyle: 0, axisLabelVisible: true, title: `매물대 ${profile.strength}%` });
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

  const getPrevDateText = () => {
    const d = chartData?.chartData?.[chartData.chartData.length - 2];
    if (!d) return '전일 대비';
    const parts = d.time.slice(5).split('-');
    return `${parts[0]}월 ${parts[1]}일 대비`;
  };

  // ─────────────────────────────────────────────────────────────────────────
  // HELPER COMPONENTS (detail view only)
  // ─────────────────────────────────────────────────────────────────────────

  const fadeUp = {
    hidden: { opacity: 0, y: 16 },
    visible: (i = 0) => ({
      opacity: 1, y: 0,
      transition: { duration: 0.42, delay: i * 0.06, ease: [0.22, 1, 0.36, 1] }
    }),
  };

  const isWished = selectedStock ? !!wishlist.find(w => w.symbol === selectedStock.symbol) : false;
  const priceUp = chartData ? chartData.change >= 0 : true;

  // ─────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────

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
        @keyframes orbPulse { 0%,100%{transform:scale(1);opacity:0.7} 50%{transform:scale(1.5);opacity:0.25} }
        @keyframes statusBlink { 0%,100%{opacity:1} 50%{opacity:0.35} }
        @keyframes briefShimmer { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .detail-tab-btn { transition: all 0.22s ease; }
        .detail-tab-btn:active { transform: scale(0.97); }
        .trade-btn:active { transform: scale(0.97); }
      `}</style>

      <main style={{ minHeight: '100vh', background: '#F0F4F8', paddingBottom: 80 }}>

        {/* ══════════════════════════════════════════════════════
            HEADER — unchanged from original
        ══════════════════════════════════════════════════════ */}
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
                <span style={{ fontSize: 22 }}>📊</span>
                <span style={{ fontSize: 18, fontWeight: 800, color: 'white', letterSpacing: '-0.5px' }}>주식 AI 분석</span>
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
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
                {selectedStock && (
                  <button onClick={loadStockInfo} style={{ padding: '0 14px', borderRadius: 14, fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap', cursor: 'pointer', background: showStockInfo ? 'rgba(99,102,241,0.7)' : 'rgba(255,255,255,0.1)', color: 'white', border: '1.5px solid rgba(255,255,255,0.2)' }}>
                    {stockInfoLoading ? '⏳' : showStockInfo ? '닫기 ▲' : '📋 종목정보'}
                  </button>
                )}
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
                            <button key={stock.code} onMouseDown={() => handleSelectStock({ symbol: stock.code, name: stock.name, exchange: 'KOSPI' })}
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

        {/* ══════════════════════════════════════════════════════
            BODY
        ══════════════════════════════════════════════════════ */}
        <div style={{ padding: '14px 14px 0' }}>

          {/* ── STOCK DETAIL VIEW (redesigned) ── */}
          {selectedStock && (
            <div>
              {/* ── Back + nav ── */}
              <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
                style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
              </motion.div>

              {/* ── Hero Price Card ── */}
              <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible"
                style={{ borderRadius: 24, overflow: 'hidden', marginBottom: 12, position: 'relative',
                  background: 'linear-gradient(145deg, #0f172a 0%, #1e3a5f 55%, #1e40af 100%)',
                  boxShadow: '0 16px 48px rgba(15,23,42,0.25), 0 2px 8px rgba(15,23,42,0.15)' }}>

                {/* Decorative blobs */}
                <div style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', filter: 'blur(60px)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: -30, left: -20, width: 140, height: 140, borderRadius: '50%', background: 'rgba(59,130,246,0.12)', filter: 'blur(40px)', pointerEvents: 'none' }} />

                <div style={{ padding: '20px 20px 18px', position: 'relative' }}>
                  {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div className="sk" style={{ height: 16, width: '40%', opacity: 0.3 }} />
                      <div className="sk" style={{ height: 36, width: '60%', opacity: 0.3 }} />
                      <div className="sk" style={{ height: 14, width: '35%', opacity: 0.3 }} />
                    </div>
                  ) : chartData && (
                    <>
                      {/* Stock identity row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {(() => { const [c1, c2] = getStockColor(selectedStock.name, selectedStock.symbol); return (
                            <div style={{ width: 44, height: 44, borderRadius: 15, background: `linear-gradient(135deg,${c1},${c2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: 'white', flexShrink: 0, boxShadow: `0 6px 20px ${c1}55` }}>
                              {(chartData.nameKr || selectedStock.name || chartData.name)?.charAt(0)}
                            </div>
                          ); })()}
                          <div>
                            <p style={{ fontSize: 17, fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 2 }}>
                              {chartData.nameKr || selectedStock.name || chartData.name}
                            </p>
                            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.04em' }}>{chartData.name} · {selectedStock.symbol}</p>
                          </div>
                        </div>
                        <button onClick={() => toggleWishlist(selectedStock.symbol, chartData.nameKr || chartData.name)}
                          style={{ fontSize: 22, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                            filter: isWished ? 'drop-shadow(0 0 6px #fbbf24)' : 'grayscale(1) opacity(0.4)',
                            animation: isWished ? 'starPulse 2s ease-in-out infinite' : 'none' }}>⭐</button>
                      </div>

                      {/* Price display */}
                      <div style={{ marginBottom: 16 }}>
                        <motion.p key={chartData.currentPrice} initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.35 }}
                          style={{ fontSize: 36, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 6 }}>
                          {chartData.currentPrice?.toLocaleString()}<span style={{ fontSize: 16, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginLeft: 4 }}>원</span>
                        </motion.p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: priceUp ? 'rgba(239,68,68,0.18)' : 'rgba(59,130,246,0.18)', borderRadius: 20, padding: '4px 12px', border: `1px solid ${priceUp ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)'}` }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: priceUp ? '#fca5a5' : '#93c5fd' }}>
                              {priceUp ? '▲' : '▼'} {Math.abs(chartData.change)?.toLocaleString()}원 ({priceUp ? '+' : ''}{chartData.changePercent?.toFixed(2)}%)
                            </span>
                          </div>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{getPrevDateText()}</span>
                        </div>
                      </div>

                      {/* Timeframe selector */}
                      <div style={{ display: 'flex', gap: 6 }}>
                        {[{ key: 'daily', label: '일봉' }, { key: 'weekly', label: '주봉' }, { key: 'monthly', label: '월봉' }, { key: 'yearly', label: '년봉' }].map(t => (
                          <button key={t.key} onClick={() => setTimeframe(t.key)}
                            style={{ padding: '6px 14px', borderRadius: 20, fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'all 0.2s ease',
                              background: timeframe === t.key ? 'rgba(255,255,255,0.95)' : 'rgba(255,255,255,0.1)',
                              color: timeframe === t.key ? '#0f172a' : 'rgba(255,255,255,0.55)',
                              boxShadow: timeframe === t.key ? '0 2px 10px rgba(0,0,0,0.2)' : 'none' }}>
                            {t.label}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              </motion.div>

              {/* ── Holdings Card (if owned) ── */}
              {!loading && chartData && userHolding && (
                <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible"
                  style={{ borderRadius: 20, padding: '16px 18px', marginBottom: 12, overflow: 'hidden', position: 'relative',
                    background: 'linear-gradient(135deg, #f59e0b10, #f97316 08)',
                    border: '1.5px solid #fde68a',
                    boxShadow: '0 4px 20px rgba(245,158,11,0.12)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div>
                      <p style={{ fontSize: 10, color: '#92400e', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>💼 보유 현황</p>
                      <p style={{ fontSize: 15, fontWeight: 800, color: '#78350f', marginBottom: 2 }}>{userHolding.quantity}주 보유중</p>
                      <p style={{ fontSize: 12, color: '#92400e' }}>평균단가 {userHolding.avgPrice?.toLocaleString()}원</p>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      {(() => {
                        const profit = (chartData.currentPrice - userHolding.avgPrice) * userHolding.quantity;
                        const profitRate = ((chartData.currentPrice - userHolding.avgPrice) / userHolding.avgPrice * 100).toFixed(2);
                        const isPos = profit >= 0;
                        return (
                          <div>
                            <p style={{ fontSize: 16, fontWeight: 800, color: '#78350f', marginBottom: 3 }}>{(chartData.currentPrice * userHolding.quantity).toLocaleString()}원</p>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 4, justifyContent: 'flex-end', background: isPos ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)', borderRadius: 20, padding: '3px 10px' }}>
                              <span style={{ fontSize: 13, fontWeight: 800, color: isPos ? '#dc2626' : '#2563eb' }}>{isPos ? '+' : ''}{profit.toLocaleString()}원</span>
                              <span style={{ fontSize: 11, fontWeight: 600, color: isPos ? '#dc2626' : '#2563eb' }}>({isPos ? '+' : ''}{profitRate}%)</span>
                            </div>
                          </div>
                        );
                      })()}
                    </div>
                  </div>
                </motion.div>
              )}

              {/* ── Buy / Sell CTA ── */}
              {!loading && chartData && (
                <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible" style={{ marginBottom: 12 }}>
                  {userProfile && (
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, padding: '0 4px' }}>
                      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>💵 주문가능금액</span>
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#0f172a' }}>{userProfile.cash?.toLocaleString()}원</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', gap: 10 }}>
                    <button className="trade-btn" onClick={() => { setTradeType('buy'); setTradeModal(true); setTradeError(''); setTradeQty(''); setTradePrice(''); setPriceType('market'); }}
                      style={{ flex: 1, padding: '15px', background: 'linear-gradient(135deg,#ef4444,#dc2626)', color: 'white', borderRadius: 18, fontWeight: 800, fontSize: 16, boxShadow: '0 6px 20px rgba(239,68,68,0.35)', border: 'none', cursor: 'pointer', letterSpacing: '-0.3px', transition: 'all 0.2s ease' }}>
                      매수
                    </button>
                    <button className="trade-btn" onClick={() => { if (!userHolding) return; setTradeType('sell'); setTradeModal(true); setTradeError(''); setTradeQty(''); setTradePrice(''); setPriceType('market'); }}
                      style={{ flex: 1, padding: '15px', background: userHolding ? 'linear-gradient(135deg,#3b82f6,#2563eb)' : '#f1f5f9', color: userHolding ? 'white' : '#cbd5e1', borderRadius: 18, fontWeight: 800, fontSize: 16, boxShadow: userHolding ? '0 6px 20px rgba(59,130,246,0.35)' : 'none', border: 'none', cursor: userHolding ? 'pointer' : 'not-allowed', transition: 'all 0.2s ease' }}>
                      매도
                    </button>
                  </div>
                </motion.div>
              )}

              {/* ── Detail Section Tabs ── */}
              {!loading && chartData && (
                <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible"
                  style={{ display: 'flex', background: 'white', borderRadius: 18, padding: 5, marginBottom: 14, border: '1px solid #e2e8f0', boxShadow: '0 1px 6px rgba(0,0,0,0.06)', gap: 4 }}>
                  {[
                    { key: 'overview', label: '차트', icon: '📈' },
                    { key: 'analysis', label: 'AI 분석', icon: '🤖' },
                    { key: 'news', label: '뉴스', icon: '📰' },
                  ].map(t => (
                    <button key={t.key} className="detail-tab-btn" onClick={() => setDetailTab(t.key)}
                      style={{ flex: 1, padding: '11px 4px', borderRadius: 13, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none',
                        background: detailTab === t.key ? 'linear-gradient(135deg,#1e3a5f,#2563eb)' : 'transparent',
                        color: detailTab === t.key ? '#fff' : '#94a3b8',
                        boxShadow: detailTab === t.key ? '0 4px 14px rgba(37,99,235,0.3)' : 'none' }}>
                      {t.icon} {t.label}
                    </button>
                  ))}
                </motion.div>
              )}

              <AnimatePresence mode="wait">

                {/* ══════════ TAB: OVERVIEW (Chart + Stock Info) ══════════ */}
                {detailTab === 'overview' && (
                  <motion.div key="overview" initial={{ opacity: 0, x: -12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 12 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>

                    {/* Chart Card */}
                    <div style={{ background: 'white', borderRadius: 22, border: '1px solid #e2e8f0', boxShadow: '0 2px 16px rgba(0,0,0,0.07)', padding: '14px 12px', marginBottom: 12, overflow: 'hidden' }}>
                      {!loading && chartData?.chartData?.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                          <div style={{ display: 'flex', flexDirection: 'column' }}>
                            <span style={{ fontSize: 10, color: '#94a3b8', fontWeight: 600, letterSpacing: '0.04em' }}>CHART</span>
                            <span style={{ fontSize: 11, color: '#64748b' }}>{chartData.chartData[0]?.time} ~ {chartData.chartData[chartData.chartData.length - 1]?.time}</span>
                          </div>
                          <button onClick={() => setShowVolumeProfile(p => !p)}
                            style={{ padding: '5px 12px', borderRadius: 20, fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer',
                              background: showVolumeProfile ? '#f0f4ff' : '#f1f5f9',
                              color: showVolumeProfile ? '#4f46e5' : '#94a3b8' }}>
                            📊 매물대 {showVolumeProfile ? 'ON' : 'OFF'}
                          </button>
                        </div>
                      )}
                      {loading ? (
                        <div className="sk" style={{ height: 280, borderRadius: 14 }} />
                      ) : (
                        <div ref={chartContainerRef} style={{ width: '100%' }} />
                      )}
                    </div>

                    {/* Stock Info Panel */}
                    {showStockInfo && (
                      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
                        style={{ background: 'white', borderRadius: 22, border: '1px solid #e2e8f0', boxShadow: '0 2px 16px rgba(0,0,0,0.07)', padding: '18px', marginBottom: 12 }}>
                        {stockInfoLoading ? (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                            {[...Array(4)].map((_, i) => <div key={i} className="sk" style={{ height: 14, width: `${70 - i * 10}%` }} />)}
                          </div>
                        ) : stockInfo && (
                          <div>
                            <p style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', marginBottom: 12, letterSpacing: '0.02em' }}>📋 종목 정보</p>
                            {(stockInfo.sector || stockInfo.industry) && (
                              <div style={{ display: 'flex', gap: 6, marginBottom: 12, flexWrap: 'wrap' }}>
                                {stockInfo.sector && <span style={{ padding: '4px 12px', background: '#eff6ff', color: '#3b82f6', fontSize: 11, borderRadius: 20, fontWeight: 700, border: '1px solid #dbeafe' }}>{stockInfo.sector}</span>}
                                {stockInfo.industry && <span style={{ padding: '4px 12px', background: '#f5f3ff', color: '#7c3aed', fontSize: 11, borderRadius: 20, fontWeight: 700, border: '1px solid #ede9fe' }}>{stockInfo.industry}</span>}
                              </div>
                            )}
                            {stockInfo.summary && (
                              <div style={{ marginBottom: 14 }}>
                                <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.65, overflow: 'hidden', display: showFullSummary ? 'block' : '-webkit-box', WebkitLineClamp: showFullSummary ? 'unset' : 3, WebkitBoxOrient: 'vertical' }}>{stockInfo.summary}</p>
                                <button onClick={() => setShowFullSummary(p => !p)} style={{ fontSize: 11, color: '#3b82f6', marginTop: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontWeight: 600 }}>{showFullSummary ? '접기 ▲' : '더보기 ▼'}</button>
                              </div>
                            )}
                            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8, marginBottom: 14 }}>
                              {[
                                { label: 'ROE', value: stockInfo.roe },
                                { label: '영업이익률', value: stockInfo.operatingMargin },
                                { label: '배당수익률', value: stockInfo.dividendYield },
                                { label: '베타', value: stockInfo.beta },
                                { label: '매출성장률', value: stockInfo.revenueGrowth },
                                { label: '목표주가', value: stockInfo.targetMeanPrice || '' },
                              ].filter(item => item.value && item.value !== '').map(({ label, value }) => (
                                <div key={label} style={{ background: '#f8fafc', borderRadius: 14, padding: '12px 10px', textAlign: 'center', border: '1px solid #f1f5f9' }}>
                                  <p style={{ fontSize: 9, color: '#94a3b8', marginBottom: 4, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase' }}>{label}</p>
                                  <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{value}</p>
                                </div>
                              ))}
                            </div>
                            {(stockInfo.high52 || stockInfo.low52) && (
                              <div>
                                <p style={{ fontSize: 11, fontWeight: 700, color: '#64748b', marginBottom: 8 }}>52주 가격 범위</p>
                                <div style={{ background: '#f8fafc', borderRadius: 14, padding: '12px', border: '1px solid #f1f5f9' }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                    <span style={{ fontSize: 11, color: '#3b82f6', fontWeight: 700 }}>최저 {stockInfo.low52}원</span>
                                    <span style={{ fontSize: 11, color: '#dc2626', fontWeight: 700 }}>최고 {stockInfo.high52}원</span>
                                  </div>
                                  {(() => {
                                    const low = stockInfo?.low52Raw || 0;
                                    const high = stockInfo?.high52Raw || 0;
                                    const current = chartData?.currentPrice || 0;
                                    const pct = high > low ? Math.round(((current - low) / (high - low)) * 100) : 50;
                                    return (
                                      <div style={{ position: 'relative', width: '100%', height: 6, background: 'linear-gradient(90deg,#bfdbfe,#fee2e2)', borderRadius: 6 }}>
                                        <div style={{ position: 'absolute', width: 14, height: 14, background: 'white', border: '2.5px solid #0f172a', borderRadius: '50%', top: '50%', transform: 'translate(-50%,-50%)', left: `${Math.max(5, Math.min(95, pct))}%`, boxShadow: '0 2px 6px rgba(0,0,0,0.2)' }} />
                                      </div>
                                    );
                                  })()}
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </motion.div>
                    )}

                    {error && (
                      <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 16, padding: '12px 16px', marginBottom: 12, fontSize: 13, color: '#dc2626', fontWeight: 500 }}>
                        ⚠️ {error}
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ══════════ TAB: AI ANALYSIS ══════════ */}
                {detailTab === 'analysis' && (
                  <motion.div key="analysis" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>

                    {/* Analyze Button */}
                    {!loading && chartData && (
                      <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible" style={{ marginBottom: 14 }}>
                        {analysisCache[selectedStock?.symbol] && (
                          <p style={{ textAlign: 'center', fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>
                            🕐 마지막 분석: {analysisCache[selectedStock?.symbol]?.analyzedAt}
                          </p>
                        )}
                        <button onClick={handleAnalyze} disabled={analyzing}
                          style={{ width: '100%', padding: '17px', background: analyzing ? '#94a3b8' : 'linear-gradient(135deg,#6366f1,#8b5cf6,#a855f7)', color: 'white', borderRadius: 20, fontWeight: 800, fontSize: 16, boxShadow: analyzing ? 'none' : '0 8px 28px rgba(99,102,241,0.4)', border: 'none', cursor: analyzing ? 'not-allowed' : 'pointer', letterSpacing: '-0.3px', transition: 'all 0.25s ease' }}>
                          {analyzing ? '🤖 AI가 분석하는 중...' : analysisCache[selectedStock?.symbol] ? '🔄 AI 재분석하기' : '🔍 AI 분석 시작하기'}
                        </button>
                      </motion.div>
                    )}

                    {!analysis && !analyzing && (
                      <div style={{ textAlign: 'center', padding: '48px 20px', background: 'white', borderRadius: 22, border: '1.5px dashed #e2e8f0' }}>
                        <p style={{ fontSize: 36, marginBottom: 12 }}>🤖</p>
                        <p style={{ fontSize: 14, color: '#94a3b8', fontWeight: 600, marginBottom: 4 }}>AI 분석 결과가 없습니다</p>
                        <p style={{ fontSize: 12, color: '#cbd5e1' }}>위 버튼을 눌러 분석을 시작하세요</p>
                      </div>
                    )}

                    {analysis && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

                        {/* Probability Card */}
                        {analysis.probability && (
                          <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible"
                            style={{ background: 'linear-gradient(145deg,#0f172a,#1e293b)', borderRadius: 22, padding: '20px 18px', boxShadow: '0 12px 40px rgba(15,23,42,0.25)' }}>
                            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14, fontWeight: 700 }}>📊 퀀트 분석 결과</p>

                            {/* Bullish/Bearish bar */}
                            <div style={{ marginBottom: 18 }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171' }} />
                                  <span style={{ fontSize: 12, fontWeight: 700, color: '#fca5a5' }}>상승 {analysis.probability.bullish}%</span>
                                </div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <span style={{ fontSize: 12, fontWeight: 700, color: '#93c5fd' }}>하락 {analysis.probability.bearish}%</span>
                                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#60a5fa' }} />
                                </div>
                              </div>
                              <div style={{ width: '100%', background: 'rgba(255,255,255,0.08)', borderRadius: 8, height: 10, overflow: 'hidden' }}>
                                <motion.div initial={{ width: 0 }} animate={{ width: `${analysis.probability.bullish}%` }}
                                  transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                                  style={{ height: 10, background: 'linear-gradient(90deg,#ef4444,#f97316)', borderRadius: 8 }} />
                              </div>
                            </div>

                            {/* Confidence */}
                            <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: '14px', textAlign: 'center', marginBottom: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
                              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 6, letterSpacing: '0.06em' }}>AI 신뢰도</p>
                              <motion.p key={analysis.confidence} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, delay: 0.2 }}
                                style={{ fontSize: 36, fontWeight: 800, color: '#34d399', lineHeight: 1 }}>
                                {analysis.confidence}<span style={{ fontSize: 18 }}>%</span>
                              </motion.p>
                              {analysis.scoreBreakdown?.atrRatio > 3 && (
                                <p style={{ fontSize: 11, color: '#fbbf24', marginTop: 6 }}>⚡ 변동성 높음 ({analysis.scoreBreakdown.atrRatio}%)</p>
                              )}
                            </div>

                            {/* Score breakdown */}
                            {analysis.scoreBreakdown && (
                              <div style={{ marginBottom: 16 }}>
                                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 10, letterSpacing: '0.06em' }}>레이어별 점수</p>
                                {[
                                  { label: '퀀트팩터', score: analysis.scoreBreakdown.quant?.score, weight: '40%', color: '#a78bfa' },
                                  { label: '기술지표', score: analysis.scoreBreakdown.tech?.score, weight: '30%', color: '#60a5fa' },
                                  { label: '뉴스감성', score: analysis.scoreBreakdown.news?.score, weight: '20%', color: '#34d399' },
                                ].map(({ label, score, weight, color }) => {
                                  const barWidth = Math.min(Math.abs(score || 0) / 10 * 100, 100);
                                  const isPositive = (score || 0) >= 0;
                                  return (
                                    <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                      <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', width: 58, flexShrink: 0 }}>{label}</span>
                                      <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', width: 26, flexShrink: 0 }}>{weight}</span>
                                      <div style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
                                        <motion.div initial={{ width: 0 }} animate={{ width: `${barWidth}%` }} transition={{ duration: 0.7, delay: 0.4 }}
                                          style={{ height: 5, borderRadius: 4, background: isPositive ? color : 'rgba(255,255,255,0.12)' }} />
                                      </div>
                                      <span style={{ fontSize: 11, fontWeight: 700, width: 28, textAlign: 'right', flexShrink: 0, color: isPositive ? '#fca5a5' : '#93c5fd' }}>
                                        {(score || 0) >= 0 ? '+' : ''}{score || 0}
                                      </span>
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* Key signals */}
                            {analysis.keySignals?.length > 0 && (
                              <div>
                                <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 10, letterSpacing: '0.06em' }}>핵심 신호</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                                  {analysis.keySignals.map((signal, i) => (
                                    <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: signal.easy ? 6 : 0 }}>
                                        <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: signal.type === 'bullish' ? '#f87171' : '#60a5fa' }} />
                                        <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', flex: 1, fontWeight: 500 }}>{signal.label}</span>
                                        <span style={{ fontSize: 12, fontWeight: 800, color: signal.type === 'bullish' ? '#fca5a5' : '#93c5fd' }}>{signal.score >= 0 ? '+' : ''}{signal.score}</span>
                                      </div>
                                      {signal.easy && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.45, paddingLeft: 16 }}>💡 {signal.easy}</p>}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {analysis.quantInsight && (
                              <div style={{ marginTop: 14, background: 'rgba(99,102,241,0.18)', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(99,102,241,0.2)' }}>
                                <p style={{ fontSize: 10, fontWeight: 700, color: '#a5b4fc', marginBottom: 5, letterSpacing: '0.04em' }}>📐 퀀트 한줄 요약</p>
                                <p style={{ fontSize: 12, color: 'rgba(165,180,252,0.9)', lineHeight: 1.55 }}>{analysis.quantInsight}</p>
                              </div>
                            )}
                            {analysis.riskWarning && (
                              <div style={{ marginTop: 10, background: 'rgba(245,158,11,0.12)', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(245,158,11,0.2)' }}>
                                <p style={{ fontSize: 10, fontWeight: 700, color: '#fcd34d', marginBottom: 5, letterSpacing: '0.04em' }}>⚠️ 주의사항</p>
                                <p style={{ fontSize: 12, color: 'rgba(253,211,77,0.85)', lineHeight: 1.55 }}>{analysis.riskWarning}</p>
                              </div>
                            )}
                          </motion.div>
                        )}

                        {/* Scenarios */}
                        {analysis.scenarios && (
                          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible"
                            style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                            <div style={{ background: '#fff', border: '1.5px solid #fecaca', borderRadius: 20, padding: '14px', boxShadow: '0 4px 16px rgba(220,38,38,0.08)', overflow: 'hidden', position: 'relative' }}>
                              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,#ef4444,#f87171)' }} />
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <p style={{ fontWeight: 800, color: '#dc2626', fontSize: 13 }}>📈 상승</p>
                                <span style={{ fontSize: 16, fontWeight: 800, color: '#ef4444', background: '#fff1f2', borderRadius: 20, padding: '2px 8px' }}>{analysis.scenarios.scenarioA.probability}%</span>
                              </div>
                              {analysis.scenarios.scenarioA.conditions.map((c, i) => <p key={i} style={{ fontSize: 11, color: '#b91c1c', marginBottom: 3, lineHeight: 1.4 }}>· {c}</p>)}
                              <div style={{ background: '#fff1f2', borderRadius: 12, padding: '10px', textAlign: 'center', marginTop: 10 }}>
                                <p style={{ fontSize: 10, color: '#ef4444', marginBottom: 3, fontWeight: 600 }}>목표가</p>
                                <p style={{ fontSize: 12, fontWeight: 800, color: '#dc2626' }}>{analysis.scenarios.scenarioA.targetRange.low?.toLocaleString()}~{analysis.scenarios.scenarioA.targetRange.high?.toLocaleString()}원</p>
                              </div>
                            </div>
                            <div style={{ background: '#fff', border: '1.5px solid #bfdbfe', borderRadius: 20, padding: '14px', boxShadow: '0 4px 16px rgba(37,99,235,0.08)', overflow: 'hidden', position: 'relative' }}>
                              <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,#3b82f6,#60a5fa)' }} />
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                <p style={{ fontWeight: 800, color: '#1d4ed8', fontSize: 13 }}>📉 하락</p>
                                <span style={{ fontSize: 16, fontWeight: 800, color: '#3b82f6', background: '#eff6ff', borderRadius: 20, padding: '2px 8px' }}>{analysis.scenarios.scenarioB.probability}%</span>
                              </div>
                              {analysis.scenarios.scenarioB.conditions.map((c, i) => <p key={i} style={{ fontSize: 11, color: '#1e40af', marginBottom: 3, lineHeight: 1.4 }}>· {c}</p>)}
                              <div style={{ background: '#eff6ff', borderRadius: 12, padding: '10px', textAlign: 'center', marginTop: 10 }}>
                                <p style={{ fontSize: 10, color: '#3b82f6', marginBottom: 3, fontWeight: 600 }}>하락 구간</p>
                                <p style={{ fontSize: 12, fontWeight: 800, color: '#1d4ed8' }}>{analysis.scenarios.scenarioB.targetRange.low?.toLocaleString()}~{analysis.scenarios.scenarioB.targetRange.high?.toLocaleString()}원</p>
                              </div>
                            </div>
                          </motion.div>
                        )}

                        {/* Summary */}
                        <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible"
                          style={{ background: 'white', borderRadius: 22, border: '1px solid #e2e8f0', boxShadow: '0 2px 16px rgba(0,0,0,0.07)', padding: '18px' }}>
                          <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 10, letterSpacing: '-0.2px' }}>📋 종합 분석</h3>
                          <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.72 }}>{analysis.summary}</p>
                          {analysis.easySummary && (
                            <details style={{ marginTop: 12 }}>
                              <summary style={{ cursor: 'pointer', padding: '9px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, fontSize: 12, fontWeight: 700, color: '#92400e', listStyle: 'none', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>🐣 주린이 설명</span><span>▼</span>
                              </summary>
                              <div style={{ marginTop: 4, padding: '12px 14px', background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12 }}>
                                <p style={{ fontSize: 13, color: '#78350f', lineHeight: 1.65 }}>{analysis.easySummary}</p>
                              </div>
                            </details>
                          )}
                          {analysis.keyPoints?.length > 0 && (
                            <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                              {analysis.keyPoints.map((point, i) => (
                                <span key={i} style={{ padding: '5px 12px', background: '#eff6ff', color: '#2563eb', borderRadius: 20, fontSize: 11, fontWeight: 700, border: '1px solid #dbeafe' }}>{point}</span>
                              ))}
                            </div>
                          )}
                        </motion.div>

                        {/* Time predictions */}
                        <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible"
                          style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 8 }}>
                          {[{ key: 'daily', label: '단기', sub: '1~3일' }, { key: 'weekly', label: '주간', sub: '1주' }, { key: 'monthly', label: '월간', sub: '1개월' }].map(({ key, label, sub }) => {
                            const p = analysis[key]?.prediction;
                            const isUp = p === '상승'; const isDown = p === '하락';
                            return (
                              <div key={key} style={{ borderRadius: 18, border: `1.5px solid ${isUp ? '#fecaca' : isDown ? '#bfdbfe' : '#e2e8f0'}`, padding: '14px 12px', background: isUp ? '#fff1f2' : isDown ? '#eff6ff' : '#f8fafc', position: 'relative', overflow: 'hidden' }}>
                                <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 2, background: isUp ? 'linear-gradient(90deg,#ef4444,#f87171)' : isDown ? 'linear-gradient(90deg,#3b82f6,#60a5fa)' : '#e2e8f0' }} />
                                <p style={{ fontSize: 9, color: '#94a3b8', marginBottom: 1, fontWeight: 600, letterSpacing: '0.04em' }}>{sub}</p>
                                <p style={{ fontSize: 11, fontWeight: 800, color: '#374151', marginBottom: 8 }}>{label}</p>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 8 }}>
                                  <span style={{ fontSize: 16 }}>{p === '상승' ? '📈' : p === '하락' ? '📉' : '➡️'}</span>
                                  <p style={{ fontSize: 14, fontWeight: 800, color: isUp ? '#ef4444' : isDown ? '#3b82f6' : '#6b7280' }}>{p}</p>
                                </div>
                                <p style={{ fontSize: 11, color: '#374151', marginBottom: 6 }}>목표 <strong>{analysis[key]?.targetPrice?.toLocaleString()}원</strong></p>
                                <div style={{ width: '100%', background: 'rgba(0,0,0,0.07)', borderRadius: 4, height: 4, marginBottom: 4, overflow: 'hidden' }}>
                                  <motion.div initial={{ width: 0 }} animate={{ width: `${analysis[key]?.confidence}%` }} transition={{ duration: 0.8, delay: 0.3 }}
                                    style={{ height: 4, borderRadius: 4, background: isUp ? '#ef4444' : isDown ? '#3b82f6' : '#9ca3af' }} />
                                </div>
                                <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 5 }}>신뢰도 {analysis[key]?.confidence}%</p>
                                <p style={{ fontSize: 11, color: '#6b7280', lineHeight: 1.4 }}>{analysis[key]?.reason}</p>
                                {analysis[key]?.easyReason && (
                                  <details style={{ marginTop: 6 }}>
                                    <summary style={{ cursor: 'pointer', fontSize: 11, fontWeight: 700, color: '#d97706', listStyle: 'none' }}>🐣 쉬운설명 ▼</summary>
                                    <p style={{ fontSize: 11, color: '#78350f', marginTop: 4, lineHeight: 1.4 }}>{analysis[key]?.easyReason}</p>
                                  </details>
                                )}
                              </div>
                            );
                          })}
                        </motion.div>

                        {/* Technical Indicators */}
                        {indicators && (
                          <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible"
                            style={{ background: 'white', borderRadius: 22, border: '1px solid #e2e8f0', boxShadow: '0 2px 16px rgba(0,0,0,0.07)', padding: '18px' }}>
                            <h3 style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 14, letterSpacing: '-0.2px' }}>📐 기술 지표</h3>
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
                              {/* RSI */}
                              {(() => {
                                const v = indicators.rsi;
                                const s = v > 70 ? { label: '과매수', color: '#ef4444', bg: '#fff1f2' } : v < 30 ? { label: '과매도', color: '#3b82f6', bg: '#eff6ff' } : v > 60 ? { label: '상승모멘텀', color: '#d97706', bg: '#fffbeb' } : v < 40 ? { label: '하락모멘텀', color: '#d97706', bg: '#fffbeb' } : { label: '중립', color: '#059669', bg: '#ecfdf5' };
                                return (
                                  <div style={{ background: '#f8fafc', borderRadius: 16, padding: '14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                      <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>RSI(14)</p>
                                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: s.bg, color: s.color, fontWeight: 700 }}>{s.label}</span>
                                    </div>
                                    <p style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{v}</p>
                                    {analysis?.indicatorComments?.rsi && <p style={{ fontSize: 11, color: '#60a5fa', marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9', lineHeight: 1.45 }}>💬 {analysis.indicatorComments.rsi}</p>}
                                  </div>
                                );
                              })()}
                              {/* MACD */}
                              {(() => {
                                const hist = indicators.macdHistogram;
                                const s = hist > 0 && indicators.macd > 0 ? { label: '강한상승', color: '#ef4444', bg: '#fff1f2' } : hist > 0 ? { label: '상승전환', color: '#d97706', bg: '#fffbeb' } : hist < 0 && indicators.macd < 0 ? { label: '강한하락', color: '#3b82f6', bg: '#eff6ff' } : { label: '하락전환', color: '#d97706', bg: '#fffbeb' };
                                return (
                                  <div style={{ background: '#f8fafc', borderRadius: 16, padding: '14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                      <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>MACD</p>
                                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: s.bg, color: s.color, fontWeight: 700 }}>{s.label}</span>
                                    </div>
                                    <p style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{indicators.macd}</p>
                                    {analysis?.indicatorComments?.macd && <p style={{ fontSize: 11, color: '#60a5fa', marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9', lineHeight: 1.45 }}>💬 {analysis.indicatorComments.macd}</p>}
                                  </div>
                                );
                              })()}
                              {/* MA */}
                              {(() => {
                                const price = indicators.currentPrice;
                                const a20 = price > indicators.ma20; const a60 = price > indicators.ma60;
                                const s = a20 && a60 ? { label: '정배열', color: '#ef4444', bg: '#fff1f2' } : !a20 && !a60 ? { label: '역배열', color: '#3b82f6', bg: '#eff6ff' } : { label: '혼조', color: '#d97706', bg: '#fffbeb' };
                                return (
                                  <div style={{ background: '#f8fafc', borderRadius: 16, padding: '14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                      <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>이동평균</p>
                                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: s.bg, color: s.color, fontWeight: 700 }}>{s.label}</span>
                                    </div>
                                    <p style={{ fontSize: 16, fontWeight: 800, color: '#0f172a' }}>{price?.toLocaleString()}</p>
                                    <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>MA20: {indicators.ma20?.toLocaleString()} / MA60: {indicators.ma60?.toLocaleString()}</p>
                                    {analysis?.indicatorComments?.ma && <p style={{ fontSize: 11, color: '#60a5fa', marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9', lineHeight: 1.45 }}>💬 {analysis.indicatorComments.ma}</p>}
                                  </div>
                                );
                              })()}
                              {/* Bollinger */}
                              {(() => {
                                const price = indicators.currentPrice;
                                const range = indicators.bbUpper - indicators.bbLower;
                                const pos = range > 0 ? ((price - indicators.bbLower) / range) * 100 : 50;
                                const s = pos > 90 ? { label: '상단돌파', color: '#ef4444', bg: '#fff1f2' } : pos > 70 ? { label: '상단근접', color: '#d97706', bg: '#fffbeb' } : pos < 10 ? { label: '하단돌파', color: '#3b82f6', bg: '#eff6ff' } : pos < 30 ? { label: '하단근접', color: '#d97706', bg: '#fffbeb' } : { label: '중간구간', color: '#059669', bg: '#ecfdf5' };
                                return (
                                  <div style={{ background: '#f8fafc', borderRadius: 16, padding: '14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                      <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>볼린저밴드</p>
                                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: s.bg, color: s.color, fontWeight: 700 }}>{s.label}</span>
                                    </div>
                                    <div style={{ width: '100%', background: 'linear-gradient(90deg,#bfdbfe,#fee2e2)', borderRadius: 4, height: 6, margin: '8px 0' }}>
                                      <div style={{ position: 'relative', height: 6 }}>
                                        <div style={{ position: 'absolute', left: `${Math.min(Math.max(pos, 3), 97)}%`, top: '50%', transform: 'translate(-50%,-50%)', width: 10, height: 10, background: '#0f172a', borderRadius: '50%', border: '2px solid white', boxShadow: '0 1px 4px rgba(0,0,0,0.2)' }} />
                                      </div>
                                    </div>
                                    <p style={{ fontSize: 10, color: '#94a3b8' }}>상단 {indicators.bbUpper?.toLocaleString()} / 하단 {indicators.bbLower?.toLocaleString()}</p>
                                    {analysis?.indicatorComments?.bb && <p style={{ fontSize: 11, color: '#60a5fa', marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9', lineHeight: 1.45 }}>💬 {analysis.indicatorComments.bb}</p>}
                                  </div>
                                );
                              })()}
                              {/* Volume Ratio */}
                              {(() => {
                                const v = indicators.volumeRatio;
                                const s = v > 2 ? { label: '급등', color: '#ef4444', bg: '#fff1f2' } : v > 1.5 ? { label: '증가', color: '#d97706', bg: '#fffbeb' } : v < 0.5 ? { label: '급감', color: '#3b82f6', bg: '#eff6ff' } : v < 0.8 ? { label: '감소', color: '#d97706', bg: '#fffbeb' } : { label: '보통', color: '#059669', bg: '#ecfdf5' };
                                return (
                                  <div style={{ background: '#f8fafc', borderRadius: 16, padding: '14px' }}>
                                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                      <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>거래량</p>
                                      <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: s.bg, color: s.color, fontWeight: 700 }}>{s.label}</span>
                                    </div>
                                    <p style={{ fontSize: 20, fontWeight: 800, color: '#0f172a' }}>{v}x</p>
                                    <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 3 }}>20일 평균 대비</p>
                                    {analysis?.indicatorComments?.volume && <p style={{ fontSize: 11, color: '#60a5fa', marginTop: 8, paddingTop: 8, borderTop: '1px solid #f1f5f9', lineHeight: 1.45 }}>💬 {analysis.indicatorComments.volume}</p>}
                                  </div>
                                );
                              })()}
                              {/* Volume Profile */}
                              <div style={{ background: '#f8fafc', borderRadius: 16, padding: '14px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                                  <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>주요 매물대</p>
                                  <span style={{ fontSize: 10, padding: '2px 8px', borderRadius: 20, background: '#f5f3ff', color: '#7c3aed', fontWeight: 700 }}>집중구간</span>
                                </div>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                                  {indicators.volumeProfile?.map((p, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                      <span style={{ fontSize: 9, color: '#94a3b8', flexShrink: 0, width: 78 }}>{p.priceFrom.toLocaleString()}~{p.priceTo.toLocaleString()}</span>
                                      <div style={{ flex: 1, background: '#e9d5ff', borderRadius: 4, height: 5 }}>
                                        <motion.div initial={{ width: 0 }} animate={{ width: `${p.strength}%` }} transition={{ duration: 0.7, delay: i * 0.1 }}
                                          style={{ height: 5, background: '#8b5cf6', borderRadius: 4 }} />
                                      </div>
                                      <span style={{ fontSize: 10, color: '#7c3aed', fontWeight: 700, flexShrink: 0 }}>{p.strength}%</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}

                        <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 16, padding: '12px 16px', fontSize: 12, color: '#92400e', lineHeight: 1.55 }}>
                          ⚠️ 본 분석은 AI 기반 기술적 분석으로 투자 권유가 아닙니다. 투자 판단은 본인 책임입니다.
                        </div>
                      </div>
                    )}
                  </motion.div>
                )}

                {/* ══════════ TAB: NEWS ══════════ */}
                {detailTab === 'news' && (
                  <motion.div key="news" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }}
                    transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}>

                    {/* AI Sentiment Analysis */}
                    {!newsAnalysis && news.length > 0 && (
                      <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible" style={{ marginBottom: 14 }}>
                        <button onClick={analyzeNews} disabled={newsAnalyzing}
                          style={{ width: '100%', padding: '15px', background: newsAnalyzing ? '#94a3b8' : 'linear-gradient(135deg,#7c3aed,#9333ea)', color: 'white', borderRadius: 18, fontWeight: 800, fontSize: 14, boxShadow: newsAnalyzing ? 'none' : '0 6px 22px rgba(124,58,237,0.38)', border: 'none', cursor: newsAnalyzing ? 'not-allowed' : 'pointer', transition: 'all 0.25s ease' }}>
                          {newsAnalyzing ? '🤖 AI 감성분석 중...' : '🤖 AI 뉴스 감성분석'}
                        </button>
                      </motion.div>
                    )}

                    {newsAnalysis && (
                      <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible"
                        style={{ borderRadius: 22, padding: '18px', marginBottom: 14, position: 'relative', overflow: 'hidden',
                          background: newsAnalysis.sentiment === '긍정' ? 'linear-gradient(145deg,#fff1f2,#fef2f2)' : newsAnalysis.sentiment === '부정' ? 'linear-gradient(145deg,#eff6ff,#f0f9ff)' : '#f8fafc',
                          border: `1.5px solid ${newsAnalysis.sentiment === '긍정' ? '#fecaca' : newsAnalysis.sentiment === '부정' ? '#bfdbfe' : '#e2e8f0'}`,
                          boxShadow: newsAnalysis.sentiment === '긍정' ? '0 4px 20px rgba(239,68,68,0.08)' : '0 4px 20px rgba(59,130,246,0.08)' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                          <div>
                            <p style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>AI 뉴스 감성</p>
                            <p style={{ fontSize: 22, fontWeight: 800, color: newsAnalysis.sentiment === '긍정' ? '#dc2626' : newsAnalysis.sentiment === '부정' ? '#2563eb' : '#6b7280' }}>
                              {newsAnalysis.sentiment === '긍정' ? '😊' : newsAnalysis.sentiment === '부정' ? '😟' : '😐'} {newsAnalysis.sentiment}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right', background: 'white', borderRadius: 16, padding: '10px 14px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                            <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>감성 점수</p>
                            <p style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{newsAnalysis.score}</p>
                          </div>
                        </div>
                        <div style={{ width: '100%', background: 'rgba(255,255,255,0.6)', borderRadius: 6, height: 7, marginBottom: 12, overflow: 'hidden' }}>
                          <motion.div initial={{ width: 0 }} animate={{ width: `${newsAnalysis.score}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                            style={{ height: 7, borderRadius: 6, background: newsAnalysis.score >= 60 ? 'linear-gradient(90deg,#f87171,#ef4444)' : newsAnalysis.score <= 40 ? 'linear-gradient(90deg,#60a5fa,#3b82f6)' : 'linear-gradient(90deg,#9ca3af,#6b7280)' }} />
                        </div>
                        <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.65, marginBottom: 10 }}>{newsAnalysis.summary}</p>
                        <p style={{ fontSize: 12, color: '#4b5563', marginBottom: 10, fontWeight: 500 }}>📊 {newsAnalysis.impact}</p>
                        <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 12px' }}>
                          <p style={{ fontSize: 11, fontWeight: 800, color: '#92400e', marginBottom: 4 }}>🐣 쉬운 설명</p>
                          <p style={{ fontSize: 12, color: '#78350f', lineHeight: 1.55 }}>{newsAnalysis.easyExplain}</p>
                        </div>
                      </motion.div>
                    )}

                    {/* News list */}
                    {newsLoading ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {[...Array(4)].map((_, i) => (
                          <div key={i} style={{ background: 'white', borderRadius: 18, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div className="sk" style={{ height: 14, width: '80%' }} />
                            <div className="sk" style={{ height: 11, width: '55%' }} />
                          </div>
                        ))}
                      </div>
                    ) : news.length === 0 ? (
                      <div style={{ textAlign: 'center', padding: '48px 20px', background: 'white', borderRadius: 22, border: '1.5px dashed #e2e8f0' }}>
                        <p style={{ fontSize: 36, marginBottom: 12 }}>📭</p>
                        <p style={{ fontSize: 14, color: '#94a3b8', fontWeight: 600 }}>관련 뉴스가 없습니다</p>
                      </div>
                    ) : (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {news.map((article, i) => (
                          <motion.a key={i} custom={i} variants={fadeUp} initial="hidden" animate="visible"
                            href={article.link} target="_blank" rel="noopener noreferrer"
                            style={{ display: 'block', padding: '14px 16px', background: 'white', borderRadius: 18, textDecoration: 'none', border: '1px solid #f1f5f9', boxShadow: '0 1px 6px rgba(0,0,0,0.05)', transition: 'all 0.18s ease' }}
                            whileHover={{ y: -1, boxShadow: '0 4px 16px rgba(0,0,0,0.09)' }}>
                            <p style={{ fontWeight: 700, color: '#0f172a', fontSize: 13, lineHeight: 1.55, marginBottom: 5 }}>{article.title}</p>
                            {article.desc && <p style={{ fontSize: 11, color: '#64748b', marginBottom: 7, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{article.desc}</p>}
                            <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#94a3b8', alignItems: 'center' }}>
                              {article.press && <span style={{ background: '#f1f5f9', padding: '2px 7px', borderRadius: 20, fontWeight: 600 }}>{article.press}</span>}
                              {article.time && <span>{article.time}</span>}
                              <span style={{ marginLeft: 'auto', color: '#cbd5e1' }}>→</span>
                            </div>
                          </motion.a>
                        ))}
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          )}

          {/* ══════════════════════════════════════════════════════
              HOME SCREEN — 100% ORIGINAL, UNCHANGED
          ══════════════════════════════════════════════════════ */}
          {!selectedStock && (
            <div style={{ animation: 'fadeSlideUp 0.4s ease-out' }}>

              {/* ── AI 시황 브리핑 위젯 ── */}
              {(() => {
                const kospiPct = Number(briefMini?.kospi?.changePercent || 0);
                const kosdaqPct = Number(briefMini?.kosdaq?.changePercent || 0);
                const kospiUp = kospiPct >= 0;
                const kosdaqUp = kosdaqPct >= 0;
                const bothUp = kospiUp && kosdaqUp;
                const bothDown = !kospiUp && !kosdaqUp;
                const mood = bothUp ? { label: '강세장', sub: '시장이 상승 흐름이에요', color: '#DC2626', glow: 'rgba(220,38,38,0.35)' }
                           : bothDown ? { label: '약세장', sub: '시장이 하락 압력 받는중', color: '#2563EB', glow: 'rgba(37,99,235,0.35)' }
                           : { label: '혼조세', sub: '지수별 방향이 엇갈려요', color: '#D97706', glow: 'rgba(217,119,6,0.35)' };
                return (
                  <motion.div
                    onClick={() => router.push('/briefing')}
                    whileTap={{ scale: 0.98 }}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.45, ease: [0.22,1,0.36,1] }}
                    style={{
                      marginBottom: 14, borderRadius: 22, overflow: 'hidden', cursor: 'pointer',
                      background: 'linear-gradient(135deg, #0F172A 0%, #1E2D6B 60%, #1E3A8A 100%)',
                      position: 'relative', boxShadow: '0 10px 40px rgba(15,23,42,0.22)',
                      border: '1px solid rgba(99,102,241,0.25)',
                    }}
                  >
                    {/* Glow orb */}
                    <div style={{
                      position: 'absolute', top: -24, right: -24, width: 110, height: 110,
                      borderRadius: '50%', background: mood.glow, filter: 'blur(32px)',
                      animation: 'orbPulse 3s ease-in-out infinite',
                    }} />
                    {/* Shimmer line */}
                    <div style={{
                      position: 'absolute', bottom: 0, left: 0, right: 0, height: 2,
                      background: 'linear-gradient(90deg, transparent, rgba(99,102,241,0.6), transparent)',
                      backgroundSize: '200% 100%', animation: 'briefShimmer 2.5s linear infinite',
                    }} />

                    <div style={{ position: 'relative', padding: '16px 18px 18px' }}>
                      {/* Top row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div style={{ position: 'relative', width: 8, height: 8 }}>
                            <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#4ADE80', animation: 'statusBlink 1.8s ease-in-out infinite' }} />
                            <div style={{ position: 'absolute', top: -3, left: -3, width: 14, height: 14, borderRadius: '50%', background: 'rgba(74,222,128,0.25)', animation: 'orbPulse 1.8s ease-in-out infinite' }} />
                          </div>
                          <span style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.45)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>AI Market Brief</span>
                        </div>
                        <span style={{ fontSize: 14, color: 'rgba(255,255,255,0.3)', fontWeight: 300 }}>›</span>
                      </div>

                      {/* Main row */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
                        <div>
                          <div style={{ fontSize: 22, fontWeight: 800, color: '#fff', letterSpacing: '-0.5px', marginBottom: 5 }}>
                            오늘의 시황 브리핑
                          </div>
                          {briefMini?.kospi ? (
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.07)', borderRadius: 20, padding: '4px 10px', border: '1px solid rgba(255,255,255,0.1)' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, color: mood.color }}>{mood.label}</span>
                              <span style={{ width: 3, height: 3, borderRadius: '50%', background: 'rgba(255,255,255,0.2)' }} />
                              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)' }}>{mood.sub}</span>
                            </div>
                          ) : (
                            <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.3)' }}>분석 불러오는 중...</span>
                          )}
                        </div>

                        {/* KOSPI/KOSDAQ mini */}
                        {briefMini?.kospi && (
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <div style={{ marginBottom: 6 }}>
                              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 2, letterSpacing: '0.05em' }}>KOSPI</div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: kospiUp ? '#fca5a5' : '#93c5fd' }}>
                                {kospiUp ? '▲' : '▼'} {Math.abs(kospiPct).toFixed(2)}%
                              </div>
                            </div>
                            <div>
                              <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.35)', marginBottom: 2, letterSpacing: '0.05em' }}>KOSDAQ</div>
                              <div style={{ fontSize: 13, fontWeight: 800, color: kosdaqUp ? '#fca5a5' : '#93c5fd' }}>
                                {kosdaqUp ? '▲' : '▼'} {Math.abs(kosdaqPct).toFixed(2)}%
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  </motion.div>
                );
              })()}

              {wishlistStocks.length > 0 && (
                <div style={{ marginBottom: 16 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 800, color: '#111827', marginBottom: 10 }}>⭐ 관심종목</h2>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {wishlistStocks.map((stock) => (
                      <div key={stock.symbol} style={{ background: 'white', borderRadius: 16, border: '1.5px solid #E2E8F0', boxShadow: '0 1px 8px rgba(0,0,0,0.05)', display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px' }}>
                        <button onClick={() => handleSelectStock({ symbol: stock.symbol, name: stock.name, exchange: '' })}
                          style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          {(() => {
                            const [c1, c2] = getStockColor(stock.name, stock.symbol);
                            return (<div style={{ width: 44, height: 44, borderRadius: '50%', flexShrink: 0, background: `linear-gradient(135deg,${c1},${c2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, fontWeight: 800, color: 'white', boxShadow: `0 4px 14px ${c1}55` }}>{stock.name?.charAt(0)}</div>);
                          })()}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stock.name}</p>
                            <p style={{ fontSize: 12, color: '#94A3B8' }}>{stock.currentPrice?.toLocaleString()}원</p>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0 }}>
                            <p style={{ fontSize: 13, fontWeight: 700, color: stock.change >= 0 ? '#EF4444' : '#3B82F6', marginBottom: 2 }}>{stock.change >= 0 ? '▲' : '▼'} {stock.changePercent?.toFixed(2)}%</p>
                            {stock.registeredReturn !== null && (<p style={{ fontSize: 11, color: Number(stock.registeredReturn) >= 0 ? '#EF4444' : '#3B82F6' }}>등록후 {Number(stock.registeredReturn) >= 0 ? '+' : ''}{stock.registeredReturn}%</p>)}
                          </div>
                        </button>
                        <button onClick={() => toggleWishlist(stock.symbol, stock.name)} style={{ fontSize: 18, flexShrink: 0, background: 'none', border: 'none', cursor: 'pointer', padding: 4 }}>⭐</button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{ background: 'white', borderRadius: 20, border: '1.5px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', padding: '16px' }}>
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <h2 style={{ fontSize: 16, fontWeight: 800, color: '#111827', margin: 0 }}>🔥 실시간 TOP 30</h2>
                    {topUpdatedAt && <p style={{ fontSize: 11, color: '#94A3B8' }}>{topUpdatedAt}</p>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 4 }}>
                    {[{ key: 'volume', label: '거래량' }, { key: 'amount', label: '거래대금' }, { key: 'marcap', label: '시가총액' }, { key: 'rise', label: '📈 상승률' }, { key: 'fall', label: '📉 하락률' }].map(t => (
                      <button key={t.key} onClick={() => setTopType(t.key)} style={{ padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', background: topType === t.key ? '#0F172A' : '#F1F5F9', color: topType === t.key ? 'white' : '#64748B', border: 'none', cursor: 'pointer', flexShrink: 0 }}>{t.label}</button>
                    ))}
                  </div>
                </div>
                {topLoading ? (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {[...Array(5)].map((_, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
                        <div className="sk" style={{ width: 28, height: 28, borderRadius: 8, flexShrink: 0 }} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <div className="sk" style={{ height: 13, width: '50%' }} />
                          <div className="sk" style={{ height: 11, width: '30%' }} />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, alignItems: 'flex-end' }}>
                          <div className="sk" style={{ height: 13, width: 40 }} />
                          <div className="sk" style={{ height: 11, width: 50 }} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column' }}>
                    {topStocks.map((stock, i) => (
                      <button key={stock.code} onClick={() => { setSelectedStock({ symbol: stock.code, name: stock.name, exchange: 'KOSPI' }); setQuery(stock.name); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: i < topStocks.length - 1 ? '1px solid #F1F5F9' : 'none', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', width: '100%', borderBottom: i < topStocks.length - 1 ? '1px solid #F1F5F9' : 'none' }}>
                        <span style={{ width: 28, height: 28, flexShrink: 0, borderRadius: 8, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, background: i === 0 ? 'linear-gradient(135deg,#F59E0B,#D97706)' : i === 1 ? 'linear-gradient(135deg,#9CA3AF,#6B7280)' : i === 2 ? 'linear-gradient(135deg,#F97316,#EA580C)' : '#F1F5F9', color: i < 3 ? 'white' : '#64748B' }}>{i + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14, fontWeight: 700, color: '#111827', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stock.name}</p>
                          <p style={{ fontSize: 11, color: '#94A3B8' }}>{Number(stock.price).toLocaleString()}원</p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ fontSize: 13, fontWeight: 700, color: stock.changeRate?.includes('+') ? '#EF4444' : stock.changeRate?.includes('-') ? '#3B82F6' : '#6B7280', marginBottom: 2 }}>{stock.changeRate?.includes('%') ? stock.changeRate : `${stock.changeRate}%`}</p>
                          <p style={{ fontSize: 11, color: '#9CA3AF' }}>{topType === 'volume' ? `${Number(stock.volume).toLocaleString()}주` : topType === 'amount' ? `${Number(stock.amount).toLocaleString()}백만` : `${Number(stock.marcap).toLocaleString()}억`}</p>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* ══════════════════════════════════════════════════════
            TRADE MODAL — original logic, redesigned shell
        ══════════════════════════════════════════════════════ */}
        {tradeModal && chartData && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 50 }}>
            <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 300 }}
              style={{ background: 'white', borderRadius: '28px 28px 0 0', width: '100%', maxWidth: 480, padding: '0 0 40px', boxShadow: '0 -20px 60px rgba(0,0,0,0.18)', border: '1px solid #e2e8f0', borderBottom: 'none' }}>
              {/* Top accent */}
              <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 0' }}>
                <div style={{ width: 40, height: 4, background: '#e2e8f0', borderRadius: 4 }} />
              </div>
              <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,#bfdbfe,transparent)', margin: '12px 0 0' }} />

              <div style={{ padding: '18px 22px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
                  <div>
                    <p style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4, fontWeight: 700 }}>주문</p>
                    <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>{chartData.nameKr || chartData.name}</h3>
                    <p style={{ fontSize: 11, color: '#94a3b8' }}>{chartData.name} · {selectedStock?.symbol}</p>
                  </div>
                  <div style={{ textAlign: 'right', background: '#f8fafc', borderRadius: 16, padding: '10px 14px', border: '1px solid #e2e8f0' }}>
                    <p style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>{chartData.currentPrice?.toLocaleString()}원</p>
                    <p style={{ fontSize: 12, fontWeight: 700, color: chartData.change >= 0 ? '#dc2626' : '#2563eb' }}>{chartData.change >= 0 ? '+' : ''}{chartData.changePercent?.toFixed(2)}%</p>
                  </div>
                </div>

                {/* Buy / Sell toggle */}
                <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 16, padding: 4, marginBottom: 14, gap: 4 }}>
                  <button onClick={() => setTradeType('buy')} style={{ flex: 1, padding: '11px', borderRadius: 12, fontSize: 14, fontWeight: 800, background: tradeType === 'buy' ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'transparent', color: tradeType === 'buy' ? 'white' : '#94a3b8', border: 'none', cursor: 'pointer', boxShadow: tradeType === 'buy' ? '0 4px 14px rgba(239,68,68,0.35)' : 'none', transition: 'all 0.2s' }}>매수</button>
                  <button onClick={() => setTradeType('sell')} style={{ flex: 1, padding: '11px', borderRadius: 12, fontSize: 14, fontWeight: 800, background: tradeType === 'sell' ? 'linear-gradient(135deg,#3b82f6,#2563eb)' : 'transparent', color: tradeType === 'sell' ? 'white' : '#94a3b8', border: 'none', cursor: 'pointer', boxShadow: tradeType === 'sell' ? '0 4px 14px rgba(59,130,246,0.35)' : 'none', transition: 'all 0.2s' }}>매도</button>
                </div>

                {/* Price type */}
                <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 14, padding: 4, marginBottom: 14, gap: 4 }}>
                  <button onClick={() => setPriceType('market')} style={{ flex: 1, padding: '9px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: priceType === 'market' ? 'white' : 'transparent', color: priceType === 'market' ? '#0f172a' : '#94a3b8', border: 'none', cursor: 'pointer', boxShadow: priceType === 'market' ? '0 1px 6px rgba(0,0,0,0.09)' : 'none', transition: 'all 0.18s' }}>시장가</button>
                  <button onClick={() => setPriceType('limit')} style={{ flex: 1, padding: '9px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: priceType === 'limit' ? 'white' : 'transparent', color: priceType === 'limit' ? '#0f172a' : '#94a3b8', border: 'none', cursor: 'pointer', boxShadow: priceType === 'limit' ? '0 1px 6px rgba(0,0,0,0.09)' : 'none', transition: 'all 0.18s' }}>지정가</button>
                </div>

                {priceType === 'limit' && (
                  <div style={{ marginBottom: 14 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 7, letterSpacing: '0.04em' }}>가격 (원)</label>
                    <input type="number" value={tradePrice} onChange={e => setTradePrice(e.target.value)} placeholder={`${chartData.currentPrice?.toLocaleString()}`}
                      style={{ width: '100%', padding: '13px 16px', borderRadius: 16, border: '1.5px solid #e2e8f0', fontSize: 15, fontWeight: 700, color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#f8fafc' }} />
                  </div>
                )}

                <div style={{ marginBottom: 14 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                    <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.04em' }}>수량 (주)</label>
                    {tradeType === 'sell' && userHolding && <span style={{ fontSize: 11, color: '#94a3b8' }}>보유 {userHolding.quantity}주</span>}
                  </div>
                  <input type="number" value={tradeQty} onChange={e => setTradeQty(e.target.value)} placeholder="0"
                    style={{ width: '100%', padding: '13px 16px', borderRadius: 16, border: '1.5px solid #e2e8f0', fontSize: 16, fontWeight: 700, color: '#0f172a', outline: 'none', marginBottom: 9, boxSizing: 'border-box', background: '#f8fafc' }} />
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7 }}>
                    {[{ label: '10%', pct: 10 }, { label: '25%', pct: 25 }, { label: '50%', pct: 50 }, { label: tradeType === 'buy' ? '최대' : '전량', pct: 100 }].map(({ label, pct }) => {
                      const price = priceType === 'market' ? chartData.currentPrice : (Number(tradePrice) || chartData.currentPrice);
                      const qty = tradeType === 'buy' ? Math.floor((userProfile?.cash || 0) * pct / 100 / price) : Math.floor((userHolding?.quantity || 0) * pct / 100) || (pct === 100 ? userHolding?.quantity : 0);
                      return (<button key={pct} onClick={() => setTradeQty(String(qty || 0))} style={{ padding: '9px 4px', background: '#f1f5f9', color: '#64748b', borderRadius: 12, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}>{label}</button>);
                    })}
                  </div>
                </div>

                {tradeQty && Number(tradeQty) > 0 && (
                  <div style={{ background: '#f8fafc', borderRadius: 18, padding: '16px', marginBottom: 14, border: '1px solid #f1f5f9' }}>
                    {(() => {
                      const price = priceType === 'market' ? chartData.currentPrice : Number(tradePrice);
                      const total = price * Number(tradeQty);
                      const afterCash = tradeType === 'buy' ? userProfile?.cash - total : userProfile?.cash + total;
                      return (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 12, color: '#64748b' }}>주문가격</span>
                            <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{price?.toLocaleString()}원</span>
                          </div>
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 12, color: '#64748b' }}>총 주문금액</span>
                            <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{total?.toLocaleString()}원</span>
                          </div>
                          <div style={{ height: 1, background: '#e2e8f0' }} />
                          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span style={{ fontSize: 12, color: '#64748b' }}>주문 후 잔액</span>
                            <span style={{ fontSize: 13, fontWeight: 800, color: afterCash < 0 ? '#dc2626' : '#0f172a' }}>{afterCash?.toLocaleString()}원</span>
                          </div>
                          {tradeType === 'sell' && userHolding && (() => {
                            const profit = (price - userHolding.avgPrice) * Number(tradeQty);
                            const rate = ((price - userHolding.avgPrice) / userHolding.avgPrice * 100).toFixed(2);
                            return (
                              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span style={{ fontSize: 12, color: '#64748b' }}>예상 손익</span>
                                <span style={{ fontSize: 13, fontWeight: 800, color: profit >= 0 ? '#dc2626' : '#2563eb' }}>{profit >= 0 ? '+' : ''}{profit.toLocaleString()}원 ({profit >= 0 ? '+' : ''}{rate}%)</span>
                              </div>
                            );
                          })()}
                        </div>
                      );
                    })()}
                  </div>
                )}

                {tradeError && <p style={{ fontSize: 12, color: '#dc2626', textAlign: 'center', marginBottom: 12, fontWeight: 600 }}>⚠️ {tradeError}</p>}

                <div style={{ display: 'flex', gap: 10 }}>
                  <button onClick={() => setTradeModal(false)} style={{ padding: '15px 22px', background: '#f1f5f9', color: '#64748b', borderRadius: 18, fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer' }}>취소</button>
                  <button onClick={handleTrade} disabled={tradeProcessing}
                    style={{ flex: 1, padding: '15px', color: 'white', borderRadius: 18, fontWeight: 800, fontSize: 15, border: 'none', cursor: tradeProcessing ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
                      background: tradeProcessing ? '#cbd5e1' : tradeType === 'buy' ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'linear-gradient(135deg,#3b82f6,#2563eb)',
                      boxShadow: tradeProcessing ? 'none' : tradeType === 'buy' ? '0 6px 20px rgba(239,68,68,0.35)' : '0 6px 20px rgba(59,130,246,0.35)' }}>
                    {tradeProcessing ? '처리 중...' : tradeType === 'buy' ? '매수 확정' : '매도 확정'}
                  </button>
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </main>
    </>
  );
}