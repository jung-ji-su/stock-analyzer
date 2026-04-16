'use client';

import { useState, useEffect, useRef } from 'react';

export default function Home() {
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
        <div className="mb-8 text-center">
          <h1
            className="text-3xl font-bold text-gray-900 mb-2 cursor-pointer hover:opacity-70 transition-opacity"
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
          <p className="text-gray-500 text-sm">한국 주식 기술적 분석 + AI 예측</p>
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
              {searchResults.length > 0 && (
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
              <div className="flex gap-2 flex-wrap">
                {[
                  { key: 'minute', label: '분봉' },
                  { key: 'daily', label: '일봉' },
                  { key: 'weekly', label: '주봉' },
                  { key: 'monthly', label: '월봉' },
                  { key: 'yearly', label: '년봉' },
                ].map((t) => (
                  <button
                    key={t.key}
                    onClick={() => setTimeframe(t.key)}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${timeframe === t.key ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* 차트 */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 mb-4">
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
              <button
                onClick={handleAnalyze}
                disabled={analyzing}
                className="w-full py-4 bg-gradient-to-r from-blue-500 to-purple-600 text-white rounded-2xl font-bold text-lg shadow-md hover:shadow-lg transition-all disabled:opacity-60 mb-6"
              >
                {analyzing ? '🤖 AI 분석 중...' : '🔍 AI 분석 시작'}
              </button>
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
                    </div>
                  ))}
                </div>

                {/* 기술 지표 */}
                {indicators && (
                  <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
                    <h3 className="font-bold text-gray-900 text-lg mb-4">📐 기술 지표</h3>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      {[
                        { label: 'RSI(14)', value: indicators.rsi, sub: indicators.rsi > 70 ? '과매수' : indicators.rsi < 30 ? '과매도' : '중립' },
                        { label: 'MACD', value: indicators.macd, sub: `Signal: ${indicators.macdSignal}` },
                        { label: 'MA20', value: indicators.ma20?.toLocaleString(), sub: '20일 이평선' },
                        { label: 'MA60', value: indicators.ma60?.toLocaleString(), sub: '60일 이평선' },
                        { label: 'BB 상단', value: indicators.bbUpper?.toLocaleString(), sub: '볼린저 상단' },
                        { label: 'BB 하단', value: indicators.bbLower?.toLocaleString(), sub: '볼린저 하단' },
                        { label: '거래량 비율', value: `${indicators.volumeRatio}x`, sub: '20일 평균 대비' },
                        { label: 'BB 위치', value: `${indicators.priceVsBBUpper}%`, sub: '상단 대비' },
                      ].map((item, i) => (
                        <div key={i} className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs text-gray-500 mb-1">{item.label}</p>
                          <p className="font-bold text-gray-900">{item.value}</p>
                          <p className="text-xs text-gray-400 mt-0.5">{item.sub}</p>
                        </div>
                      ))}
                    </div>

                    {/* 매물대 */}
                    <div className="mt-4">
                      <h4 className="font-medium text-gray-700 mb-3 text-sm">주요 매물대</h4>
                      <div className="space-y-2">
                        {indicators.volumeProfile?.map((p, i) => (
                          <div key={i} className="flex items-center gap-3">
                            <span className="text-xs text-gray-500 w-40">
                              {p.priceFrom.toLocaleString()}~{p.priceTo.toLocaleString()}원
                            </span>
                            <div className="flex-1 bg-gray-100 rounded-full h-2">
                              <div className="bg-purple-400 h-2 rounded-full" style={{ width: `${p.strength}%` }} />
                            </div>
                            <span className="text-xs text-gray-500 w-10">{p.strength}%</span>
                          </div>
                        ))}
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
              <div className="flex justify-between items-center mb-4">
                <h2 className="font-bold text-gray-900 text-lg">🔥 실시간 TOP 10</h2>
                <div className="flex gap-2">
                  {[
                    { key: 'volume', label: '거래량' },
                    { key: 'amount', label: '거래대금' },
                    { key: 'marcap', label: '시가총액' },
                  ].map((t) => (
                    <button
                      key={t.key}
                      onClick={() => setTopType(t.key)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${topType === t.key ? 'bg-blue-500 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
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
                      className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-gray-50 transition-colors text-left"
                    >
                      <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold text-white ${i === 0 ? 'bg-yellow-400' : i === 1 ? 'bg-gray-400' : i === 2 ? 'bg-orange-400' : 'bg-gray-200 text-gray-600'
                        }`}>
                        {i + 1}
                      </span>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900 text-sm">{stock.name}</p>
                        <p className="text-xs text-gray-400">{Number(stock.price).toLocaleString()}원</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-sm font-medium ${stock.change.includes('+') || (!stock.change.includes('-') && stock.changeRate !== '0.00')
                          ? 'text-red-500' : stock.change.includes('-') ? 'text-blue-500' : 'text-gray-500'
                          }`}>
                          {stock.changeRate}%
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