'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';

export default function Home() {
  const { user, loading, logout } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.push('/login');
    }
  }, [user, loading]);

  const [query, setQuery] = useState('');

  const [searchResults, setSearchResults] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [chartData, setChartData] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [indicators, setIndicators] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [error, setError] = useState(null);
  const [timeframe, setTimeframe] = useState('daily');
  const [topStocks, setTopStocks] = useState([]);
  const [topType, setTopType] = useState('volume');
  const [topLoading, setTopLoading] = useState(false);
  const [topUpdatedAt, setTopUpdatedAt] = useState(null);
  const [analysisCache, setAnalysisCache] = useState({});
  const chartContainerRef = useRef(null);
  const chartRef = useRef(null);
  const searchTimeout = useRef(null);

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

    // 캐시된 분석 결과 불러오기
    const cached = analysisCache[selectedStock.symbol];
    if (cached) {
      setAnalysis(cached.analysis);
      setIndicators(cached.indicators);
    } else {
      setAnalysis(null);
      setIndicators(null);
    }
  }, [selectedStock?.symbol, timeframe]);

  useEffect(() => {
    if (!chartData || !chartContainerRef.current) return;
    initChart();
  }, [chartData]);

  useEffect(() => {
    loadTopStocks();
  }, [topType]);

  const loadTopStocks = async () => {
    setTopLoading(true);
    try {
      const res = await fetch(`/api/top?type=${topType}`);
      const data = await res.json();
      setTopStocks(data.stocks || []);
      const now = new Date();
      setTopUpdatedAt(`${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, '0')}/${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`);
    } catch {
      setTopStocks([]);
    } finally {
      setTopLoading(false);
    }
  };

  const loadChart = async () => {
    setLoading(true);
    setError(null);
    setAnalysis(null);
    try {
      const res = await fetch(`/api/stock?symbol=${selectedStock.symbol}&timeframe=${timeframe}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setChartData(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const initChart = async () => {
    if (!chartContainerRef.current) return;

    if (chartRef.current) {
      chartRef.current.remove();
      chartRef.current = null;
    }

    await new Promise(resolve => setTimeout(resolve, 100));

    const LWC = await import('lightweight-charts');

    const chart = LWC.createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 380,
      layout: {
        background: { color: '#ffffff' },
        textColor: '#374151',
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      crosshair: { mode: 1 },
      rightPriceScale: { borderColor: '#e5e7eb' },
      timeScale: { borderColor: '#e5e7eb', timeVisible: true },
    });

    const candleSeries = chart.addSeries(LWC.CandlestickSeries, {
      upColor: '#ef4444',
      downColor: '#3b82f6',
      borderUpColor: '#ef4444',
      borderDownColor: '#3b82f6',
      wickUpColor: '#ef4444',
      wickDownColor: '#3b82f6',
    });
    candleSeries.setData(chartData.chartData);

    const volumeSeries = chart.addSeries(LWC.HistogramSeries, {
      color: '#6b7280',
      priceFormat: { type: 'volume' },
      priceScaleId: 'volume',
    });
    chart.priceScale('volume').applyOptions({ scaleMargins: { top: 0.8, bottom: 0 } });
    volumeSeries.setData(
      chartData.chartData.map(d => ({
        time: d.time,
        value: d.volume,
        color: d.close >= d.open ? '#ef444466' : '#3b82f666',
      }))
    );

    chart.timeScale().fitContent();
    chartRef.current = chart;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ width: chartContainerRef.current.clientWidth });
      }
    };
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
        body: JSON.stringify({
          chartData: chartData.chartData,
          stockName: chartData.name,
          symbol: selectedStock.symbol,
        }),
      });
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setAnalysis(data.analysis);
      setIndicators(data.indicators);

      // 캐시에 저장
      const now = new Date();
      const dateStr = `${now.getFullYear()}.${String(now.getMonth() + 1).padStart(2, '0')}.${String(now.getDate()).padStart(2, '0')} ${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`;
      setAnalysisCache(prev => ({
        ...prev,
        [selectedStock.symbol]: {
          analysis: data.analysis,
          indicators: data.indicators,
          analyzedAt: dateStr,
        }
      }));
    } catch (e) {
      setError(e.message);
    } finally {
      setAnalyzing(false);
    }
  };

  const getPredictionColor = (prediction) => {
    if (prediction === '상승') return 'text-red-500';
    if (prediction === '하락') return 'text-blue-500';
    return 'text-gray-500';
  };

  const getPredictionBg = (prediction) => {
    if (prediction === '상승') return 'bg-red-50 border-red-200';
    if (prediction === '하락') return 'bg-blue-50 border-blue-200';
    return 'bg-gray-50 border-gray-200';
  };

  const getPredictionEmoji = (prediction) => {
    if (prediction === '상승') return '📈';
    if (prediction === '하락') return '📉';
    return '➡️';
  };

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-5xl mx-auto">

        {/* 헤더 */}
        <div className="mb-6">
          <div className="flex justify-between items-center mb-1">
            <h1
              className="text-2xl font-bold text-gray-900 cursor-pointer hover:opacity-70 transition-opacity"
              onClick={() => {
                setSelectedStock(null);
                setQuery('');
                setChartData(null);
                setAnalysis(null);
                setIndicators(null);
                setError(null);
              }}
            >
              📊 주식 AI 분석기
            </h1>
            <div className="flex items-center gap-2">
              <span className="text-xs text-gray-500">👤 {user?.displayName}</span>
              <button
                onClick={logout}
                className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 transition-colors"
              >
                로그아웃
              </button>
            </div>
          </div>
          <p className="text-gray-500 text-sm mb-3">한국 주식 기술적 분석 + AI 예측</p>
          <div className="flex gap-2">
            <button
              onClick={() => router.push('/invest')}
              className="flex-1 py-2.5 bg-gradient-to-r from-red-500 to-orange-500 text-white rounded-xl text-sm font-bold shadow-sm hover:shadow-md transition-all"
            >
              💰 모의투자
            </button>
            <button
              onClick={() => router.push('/ranking')}
              className="flex-1 py-2.5 bg-gradient-to-r from-yellow-400 to-orange-400 text-white rounded-xl text-sm font-bold shadow-sm hover:shadow-md transition-all"
            >
              🏆 랭킹
            </button>
          </div>
        </div>

        {/* 검색 */}
        <div className="relative mb-6">
          <div className="flex gap-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="종목명 검색 (예: 삼성전자, 카카오, SK하이닉스)"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 bg-white shadow-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-800"
              />
              {searchResults.length > 0 && !selectedStock && (
                <div className="absolute top-full left-0 right-0 mt-1 bg-white rounded-xl border border-gray-200 shadow-lg z-10 overflow-hidden">
                  {searchResults.map((stock) => (
                    <button
                      key={stock.fullSymbol}
                      onClick={() => {
                        setSelectedStock(stock);
                        setQuery(stock.name);
                        setSearchResults([]);
                      }}
                      className="w-full px-4 py-3 text-left hover:bg-gray-50 flex justify-between items-center border-b border-gray-100 last:border-0"
                    >
                      <span className="font-medium text-gray-800">{stock.name}</span>
                      <span className="text-xs text-gray-400">{stock.exchange} · {stock.symbol}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* 종목 선택됐을 때 */}
        {selectedStock && (
          <>
            {/* 종목 정보 + 기간 선택 */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4 flex flex-wrap justify-between items-center gap-3">
              <div>
                {chartData && (
                  <>
                    <h2 className="text-xl font-bold text-gray-900">{chartData.name}</h2>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="text-2xl font-bold text-gray-900">
                        {chartData.currentPrice?.toLocaleString()}원
                      </span>
                      <span className={`text-sm font-medium ${chartData.change >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                        {chartData.change >= 0 ? '+' : ''}{chartData.change?.toFixed(0)}
                        ({chartData.changePercent?.toFixed(2)}%)
                      </span>
                    </div>
                  </>
                )}
              </div>
              <div className="flex gap-1.5 flex-wrap">
                {[
                  { key: 'daily', label: '일봉' },
                  { key: 'weekly', label: '주봉' },
                  { key: 'monthly', label: '월봉' },
                  { key: 'yearly', label: '년봉' },
                ].map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTimeframe(t.key)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap ${timeframe === t.key ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 차트 */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
              {!loading && chartData?.chartData?.length > 0 && (
                <div className="flex justify-between items-center mb-3 text-xs text-gray-400">
                  <span>📅 {chartData.chartData[0]?.time} ~ {chartData.chartData[chartData.chartData.length - 1]?.time}</span>
                  <span>총 {chartData.chartData.length}개 데이터</span>
                </div>
              )}
              {loading ? (
                <div className="h-96 flex items-center justify-center text-gray-400">
                  <div className="text-center">
                    <div className="text-4xl mb-3 animate-spin">⏳</div>
                    <p>차트 불러오는 중...</p>
                  </div>
                </div>
              ) : (
                <div ref={chartContainerRef} className="w-full" />
              )}
            </div>

            {/* 분석 버튼 */}
            {!loading && chartData && (
              <div className="mb-6">
                {/* 분석 정보 안내 */}
                {!analysisCache[selectedStock?.symbol] && (
                  <div className="bg-blue-50 border border-blue-200 rounded-2xl p-4 mb-3">
                    <p className="text-xs font-bold text-blue-700 mb-2">🔬 분석 예정 항목</p>
                    <div className="space-y-1.5">
                      {[
                        { label: '📊 데이터 기간', value: `${chartData.chartData[0]?.time} ~ ${chartData.chartData[chartData.chartData.length - 1]?.time}` },
                        { label: '📈 단기 지표', value: 'RSI · MACD · 볼린저밴드' },
                        { label: '📉 추세 지표', value: 'MA20 · MA60 · 거래량' },
                        { label: '💰 매물대', value: '거래량 프로파일 분석' },
                        { label: '🗓 장기 지표', value: '월봉 MA12 · MA24 · RSI' },
                        { label: '🤖 AI 예측', value: '일봉 · 주봉 · 월봉 예측' },
                      ].map((item, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <span className="text-xs font-medium text-blue-700 whitespace-nowrap w-28 shrink-0">{item.label}</span>
                          <span className="text-xs text-blue-500">{item.value}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {analysisCache[selectedStock?.symbol] && (
                  <p className="text-center text-xs text-gray-400 mb-2">
                    📅 분석일시: {analysisCache[selectedStock?.symbol]?.analyzedAt}
                  </p>
                )}
                <button
                  onClick={handleAnalyze}
                  disabled={analyzing}
                  className="w-full py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-2xl font-bold text-lg shadow-md hover:shadow-lg transition-all disabled:opacity-60"
                >
                  {analyzing ? '🤖 AI 분석 중...' : analysisCache[selectedStock?.symbol] ? '🔄 AI 재분석' : '🔍 AI 분석 시작'}
                </button>
              </div>
            )}

            {/* 에러 */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 text-red-600 text-sm">
                ⚠️ {error}
              </div>
            )}

            {/* 분석 결과 */}
            {analysis && (
              <div className="space-y-4">

                {/* 요약 */}
                <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                  <h3 className="font-bold text-gray-900 text-lg mb-3">📋 종합 분석</h3>
                  <p className="text-gray-700 leading-relaxed">{analysis.summary}</p>
                  {analysis.easySummary && (
                    <details className="mt-3">
                      <summary className="cursor-pointer px-3 py-2 bg-yellow-50 border border-yellow-200 rounded-xl text-xs font-bold text-yellow-700 list-none flex items-center justify-between">
                        <span>🐣 주린이 설명 보기</span>
                        <span className="text-yellow-500">▼</span>
                      </summary>
                      <div className="mt-1 p-3 bg-yellow-50 border border-yellow-200 rounded-xl">
                        <p className="text-sm text-yellow-800 leading-relaxed">{analysis.easySummary}</p>
                      </div>
                    </details>
                  )}
                  <div className="mt-3 flex flex-wrap gap-2">
                    {analysis.keyPoints?.map((point, i) => (
                      <span key={i} className="px-3 py-1 bg-blue-50 text-blue-700 rounded-full text-xs font-medium">
                        {point}
                      </span>
                    ))}
                  </div>
                </div>

                {/* 일/주/월 예측 */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {[
                    { key: 'daily', label: '단기 예측', sub: '1~3일' },
                    { key: 'weekly', label: '주간 예측', sub: '1주일' },
                    { key: 'monthly', label: '월간 예측', sub: '1개월' },
                  ].map(({ key, label, sub }) => (
                    <div key={key} className={`rounded-2xl border p-5 ${getPredictionBg(analysis[key]?.prediction)}`}>
                      <div className="flex justify-between items-start mb-3">
                        <div>
                          <p className="text-xs text-gray-500 font-medium">{sub}</p>
                          <p className="font-bold text-gray-900">{label}</p>
                        </div>
                        <span className="text-2xl">{getPredictionEmoji(analysis[key]?.prediction)}</span>
                      </div>
                      <p className={`text-2xl font-bold mb-1 ${getPredictionColor(analysis[key]?.prediction)}`}>
                        {analysis[key]?.prediction}
                      </p>
                      <p className="text-sm text-gray-600 mb-2">
                        목표가: <span className="font-bold">{analysis[key]?.targetPrice?.toLocaleString()}원</span>
                      </p>
                      <div className="w-full bg-white rounded-full h-2 mb-3">
                        <div
                          className={`h-2 rounded-full ${analysis[key]?.prediction === '상승' ? 'bg-red-400' :
                            analysis[key]?.prediction === '하락' ? 'bg-blue-400' : 'bg-gray-400'
                            }`}
                          style={{ width: `${analysis[key]?.confidence}%` }}
                        />
                      </div>
                      <p className="text-xs text-gray-500 mb-2">신뢰도 {analysis[key]?.confidence}%</p>
                      <p className="text-xs text-gray-600 leading-relaxed">{analysis[key]?.reason}</p>
                      {analysis[key]?.easyReason && (
                        <details className="mt-2">
                          <summary className="cursor-pointer px-2 py-1.5 bg-yellow-50 border border-yellow-200 rounded-lg text-xs font-bold text-yellow-700 list-none flex items-center justify-between">
                            <span>🐣 쉬운 설명 보기</span>
                            <span className="text-yellow-500">▼</span>
                          </summary>
                          <div className="mt-1 p-2 bg-yellow-50 border border-yellow-200 rounded-lg">
                            <p className="text-xs text-yellow-800 leading-relaxed">{analysis[key]?.easyReason}</p>
                          </div>
                        </details>
                      )}
                    </div>
                  ))}
                </div>

                {/* 기술 지표 */}
                {indicators && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                    <h3 className="font-bold text-gray-900 text-lg mb-4">📐 기술 지표</h3>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">

                      {/* RSI */}
                      {(() => {
                        const v = indicators.rsi;
                        const status = v > 70 ? { label: '🔴 과매수', color: 'text-red-500', bg: 'bg-red-50', desc: '너무 많이 올라 조정 가능성' } :
                          v < 30 ? { label: '🔵 과매도', color: 'text-blue-500', bg: 'bg-blue-50', desc: '너무 많이 떨어져 반등 가능성' } :
                            v > 60 ? { label: '🟡 상승 모멘텀', color: 'text-yellow-600', bg: 'bg-yellow-50', desc: '평균보다 강한 상승세' } :
                              v < 40 ? { label: '🟡 하락 모멘텀', color: 'text-yellow-600', bg: 'bg-yellow-50', desc: '평균보다 약한 상태' } :
                                { label: '🟢 중립', color: 'text-green-600', bg: 'bg-green-50', desc: '안정적인 구간' };
                        return (
                          <div className="bg-gray-50 rounded-xl p-3">
                            <div className="flex justify-between items-start mb-1">
                              <p className="text-xs text-gray-500">RSI(14)</p>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}>{status.label}</span>
                            </div>
                            <p className="font-bold text-gray-900 text-lg">{v}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{status.desc}</p>
                            {analysis?.indicatorComments?.rsi && (
                              <p className="text-xs text-blue-600 mt-1.5 border-t border-gray-200 pt-1.5">💬 {analysis.indicatorComments.rsi}</p>
                            )}
                          </div>
                        );
                      })()}

                      {/* MACD */}
                      {(() => {
                        const hist = indicators.macdHistogram;
                        const status = hist > 0 && indicators.macd > 0 ? { label: '🔴 강한 상승', color: 'text-red-500', bg: 'bg-red-50', desc: '상승 추세 진행 중' } :
                          hist > 0 ? { label: '🟡 상승 전환', color: 'text-yellow-600', bg: 'bg-yellow-50', desc: '하락에서 상승으로 전환 신호' } :
                            hist < 0 && indicators.macd < 0 ? { label: '🔵 강한 하락', color: 'text-blue-500', bg: 'bg-blue-50', desc: '하락 추세 진행 중' } :
                              { label: '🟡 하락 전환', color: 'text-yellow-600', bg: 'bg-yellow-50', desc: '상승에서 하락으로 전환 신호' };
                        return (
                          <div className="bg-gray-50 rounded-xl p-3">
                            <div className="flex justify-between items-start mb-1">
                              <p className="text-xs text-gray-500">MACD</p>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}>{status.label}</span>
                            </div>
                            <p className="font-bold text-gray-900 text-lg">{indicators.macd}</p>
                            <p className="text-xs text-gray-400 mt-0.5">Signal: {indicators.macdSignal} / Histogram: {hist}</p>
                            {analysis?.indicatorComments?.macd && (
                              <p className="text-xs text-blue-600 mt-1.5 border-t border-gray-200 pt-1.5">💬 {analysis.indicatorComments.macd}</p>
                            )}
                          </div>
                        );
                      })()}

                      {/* 이동평균선 */}
                      {(() => {
                        const price = indicators.currentPrice;
                        const above20 = price > indicators.ma20;
                        const above60 = price > indicators.ma60;
                        const status = above20 && above60 ? { label: '🔴 정배열', color: 'text-red-500', bg: 'bg-red-50', desc: '주가가 이평선 위 - 상승 추세' } :
                          !above20 && !above60 ? { label: '🔵 역배열', color: 'text-blue-500', bg: 'bg-blue-50', desc: '주가가 이평선 아래 - 하락 추세' } :
                            { label: '🟡 혼조', color: 'text-yellow-600', bg: 'bg-yellow-50', desc: '추세 전환 구간' };
                        return (
                          <div className="bg-gray-50 rounded-xl p-3">
                            <div className="flex justify-between items-start mb-1">
                              <p className="text-xs text-gray-500">이동평균선</p>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}>{status.label}</span>
                            </div>
                            <p className="font-bold text-gray-900 text-lg">{price?.toLocaleString()}원</p>
                            <p className="text-xs text-gray-400 mt-0.5">MA20: {indicators.ma20?.toLocaleString()} / MA60: {indicators.ma60?.toLocaleString()}</p>
                            {analysis?.indicatorComments?.ma && (
                              <p className="text-xs text-blue-600 mt-1.5 border-t border-gray-200 pt-1.5">💬 {analysis.indicatorComments.ma}</p>
                            )}
                          </div>
                        );
                      })()}

                      {/* 볼린저밴드 */}
                      {(() => {
                        const price = indicators.currentPrice;
                        const range = indicators.bbUpper - indicators.bbLower;
                        const pos = range > 0 ? ((price - indicators.bbLower) / range) * 100 : 50;
                        const status = pos > 90 ? { label: '🔴 상단 돌파', color: 'text-red-500', bg: 'bg-red-50', desc: '과열 구간, 조정 가능성' } :
                          pos > 70 ? { label: '🟡 상단 근처', color: 'text-yellow-600', bg: 'bg-yellow-50', desc: '상승세 강하나 주의 구간' } :
                            pos < 10 ? { label: '🔵 하단 돌파', color: 'text-blue-500', bg: 'bg-blue-50', desc: '과매도 구간, 반등 가능성' } :
                              pos < 30 ? { label: '🟡 하단 근처', color: 'text-yellow-600', bg: 'bg-yellow-50', desc: '하락세 강하나 반등 주시' } :
                                { label: '🟢 중간 구간', color: 'text-green-600', bg: 'bg-green-50', desc: '안정적인 가격 범위' };
                        return (
                          <div className="bg-gray-50 rounded-xl p-3">
                            <div className="flex justify-between items-start mb-1">
                              <p className="text-xs text-gray-500">볼린저밴드</p>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}>{status.label}</span>
                            </div>
                            <div className="w-full bg-gray-200 rounded-full h-1.5 my-2">
                              <div className="bg-blue-400 h-1.5 rounded-full" style={{ width: `${Math.min(Math.max(pos, 2), 98)}%` }} />
                            </div>
                            <p className="text-xs text-gray-400">상단 {indicators.bbUpper?.toLocaleString()} / 하단 {indicators.bbLower?.toLocaleString()}</p>
                            <p className="text-xs text-gray-400 mt-0.5">{status.desc}</p>
                            {analysis?.indicatorComments?.bb && (
                              <p className="text-xs text-blue-600 mt-1.5 border-t border-gray-200 pt-1.5">💬 {analysis.indicatorComments.bb}</p>
                            )}
                          </div>
                        );
                      })()}

                      {/* 거래량 */}
                      {(() => {
                        const v = indicators.volumeRatio;
                        const status = v > 2 ? { label: '🔴 급등 거래량', color: 'text-red-500', bg: 'bg-red-50', desc: '평균의 2배 이상 - 강한 관심' } :
                          v > 1.5 ? { label: '🟡 증가', color: 'text-yellow-600', bg: 'bg-yellow-50', desc: '평균보다 많은 거래량' } :
                            v < 0.5 ? { label: '🔵 급감', color: 'text-blue-500', bg: 'bg-blue-50', desc: '평균의 절반 이하 - 관심 저조' } :
                              v < 0.8 ? { label: '🟡 감소', color: 'text-yellow-600', bg: 'bg-yellow-50', desc: '평균보다 적은 거래량' } :
                                { label: '🟢 보통', color: 'text-green-600', bg: 'bg-green-50', desc: '평균적인 거래량' };
                        return (
                          <div className="bg-gray-50 rounded-xl p-3">
                            <div className="flex justify-between items-start mb-1">
                              <p className="text-xs text-gray-500">거래량</p>
                              <span className={`text-xs font-medium px-2 py-0.5 rounded-full ${status.bg} ${status.color}`}>{status.label}</span>
                            </div>
                            <p className="font-bold text-gray-900 text-lg">{v}x</p>
                            <p className="text-xs text-gray-400 mt-0.5">20일 평균 대비 {status.desc}</p>
                            {analysis?.indicatorComments?.volume && (
                              <p className="text-xs text-blue-600 mt-1.5 border-t border-gray-200 pt-1.5">💬 {analysis.indicatorComments.volume}</p>
                            )}
                          </div>
                        );
                      })()}

                      {/* 매물대 */}
                      <div className="bg-gray-50 rounded-xl p-3">
                        <div className="flex justify-between items-start mb-2">
                          <p className="text-xs text-gray-500">주요 매물대</p>
                          <span className="text-xs font-medium px-2 py-0.5 rounded-full bg-purple-50 text-purple-600">거래 집중 구간</span>
                        </div>
                        <div className="space-y-2">
                          {indicators.volumeProfile?.map((p, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <span className="text-xs text-gray-500 w-36 shrink-0">
                                {p.priceFrom.toLocaleString()}~{p.priceTo.toLocaleString()}원
                              </span>
                              <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                                <div className="bg-purple-400 h-1.5 rounded-full" style={{ width: `${p.strength}%` }} />
                              </div>
                              <span className="text-xs text-gray-500 w-8 shrink-0">{p.strength}%</span>
                            </div>
                          ))}
                        </div>
                        {analysis?.indicatorComments?.volumeProfile && (
                          <p className="text-xs text-blue-600 mt-1.5 border-t border-gray-200 pt-1.5">💬 {analysis.indicatorComments.volumeProfile}</p>
                        )}
                      </div>

                    </div>
                  </div>
                )}

                {/* 면책 고지 */}
                <div className="bg-yellow-50 border border-yellow-200 rounded-2xl p-4 text-xs text-yellow-700">
                  ⚠️ 본 분석은 AI 기반 기술적 분석으로 투자 권유가 아닙니다. 실제 투자 결정은 본인의 판단과 책임 하에 이루어져야 합니다.
                </div>
              </div>
            )}
          </>
        )}

        {/* 초기 화면 - TOP 10 */}
        {!selectedStock && (
          <div>
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-4">
              <div className="mb-4">
                <div className="flex justify-between items-center mb-1.5">
                  <h2 className="font-bold text-gray-900 text-lg">🔥 실시간 TOP 30</h2>
                  {topUpdatedAt && (
                    <p className="text-xs text-gray-400">조회 {topUpdatedAt}</p>
                  )}
                </div>
                <div className="flex gap-1.5">
                  {[
                    { key: 'volume', label: '거래량' },
                    { key: 'amount', label: '거래대금' },
                    { key: 'marcap', label: '시가총액' },
                  ].map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTopType(t.key)}
                      className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${topType === t.key ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                    >
                      {t.label}
                    </button>
                  ))}
                </div>
              </div>
              {topLoading ? (
                <div className="text-center py-10 text-gray-400">불러오는 중...</div>
              ) : (
                <div className="space-y-2">
                  {topStocks.map((stock, i) => (
                    <button
                      key={stock.code}
                      onClick={() => {
                        setSelectedStock({ symbol: stock.code, name: stock.name, exchange: 'KOSPI' });
                        setQuery(stock.name);
                      }}
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 active:bg-gray-100 transition-colors text-left"
                    >
                      <span className={`w-7 h-7 shrink-0 rounded-full flex items-center justify-center text-xs font-bold ${i === 0 ? 'bg-yellow-400 text-white' : i === 1 ? 'bg-gray-400 text-white' : i === 2 ? 'bg-orange-400 text-white' : 'bg-gray-100 text-gray-500'
                        }`}>
                        {i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">{stock.name}</p>
                        <p className="text-xs text-gray-400">{Number(stock.price).toLocaleString()}원</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className={`text-sm font-medium ${stock.changeRate.includes('+') ? 'text-red-500' :
                          stock.changeRate.includes('-') ? 'text-blue-500' : 'text-gray-500'
                          }`}>
                          {stock.changeRate.includes('%') ? stock.changeRate : `${stock.changeRate}%`}
                        </p>
                        <p className="text-xs text-gray-400">
                          {topType === 'volume' ? `${Number(stock.volume).toLocaleString()}주` :
                            topType === 'amount' ? `${Number(stock.amount).toLocaleString()}백만` :
                              `${Number(stock.marcap).toLocaleString()}억`}
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
    </main>
  );
}