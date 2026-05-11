'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, onSnapshot, getDocs, limit, doc } from 'firebase/firestore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Bot, User, Activity, DollarSign, Percent, Check, Clock, AlertCircle, Play, Loader2, BarChart3 } from 'lucide-react';

export default function AITraderPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [chartPeriod, setChartPeriod] = useState('week'); // day, week, month
  const [aiPortfolio, setAiPortfolio] = useState(null);
  const [userHoldings, setUserHoldings] = useState([]);
  const [userHoldingsDetail, setUserHoldingsDetail] = useState([]);
  const [aiTransactions, setAiTransactions] = useState([]);
  const [userTransactions, setUserTransactions] = useState([]);
  const [aiStats, setAiStats] = useState(null);
  const [userStats, setUserStats] = useState(null);
  const [performanceData, setPerformanceData] = useState([]);
  const [historyData, setHistoryData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [executing, setExecuting] = useState(false);

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) {
      setLoading(false);
      return;
    }

    // AI 포트폴리오 구독 (Document ID = userId)
    const aiPortfolioDocRef = doc(db, 'aiTrader', userId);
    const unsubAI = onSnapshot(aiPortfolioDocRef, (snapshot) => {
      if (snapshot.exists()) {
        setAiPortfolio(snapshot.data());
      } else {
        setAiPortfolio(null);
      }
    });

    // 사용자 보유 주식 구독
    const holdingsRef = collection(db, 'holdings');
    const holdingsQuery = query(holdingsRef, where('userId', '==', userId));
    const unsubHoldings = onSnapshot(holdingsQuery, async (snapshot) => {
      const holdings = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setUserHoldings(holdings);
      
      if (holdings.length > 0) {
        await enrichHoldingsData(holdings);
      } else {
        setUserHoldingsDetail([]);
      }
    });

    // AI 거래 내역
    const fetchAITransactions = async () => {
      const txRef = collection(db, 'aiTransactions');
      const txQuery = query(txRef, where('userId', '==', userId), limit(50));
      const txSnapshot = await getDocs(txQuery);
      const txs = txSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      setAiTransactions(txs);
      calculateAIStats(txs);
    };

    // 사용자 거래 내역
    const fetchUserTransactions = async () => {
      const txRef = collection(db, 'trades');
      const txQuery = query(txRef, where('userId', '==', userId), limit(50));
      const txSnapshot = await getDocs(txQuery);
      const txs = txSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      setUserTransactions(txs);
      calculateUserStats(txs);
    };

    // 일별 포트폴리오 히스토리 가져오기
    const fetchHistory = async () => {
      const historyRef = collection(db, 'aiPortfolioHistory');
      const historyQuery = query(
        historyRef,
        where('userId', '==', userId),
        limit(90)
      );
      
      try {
        const historySnapshot = await getDocs(historyQuery);
        const history = historySnapshot.docs
          .map(doc => doc.data())
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        setHistoryData(history);
      } catch (error) {
        console.error('히스토리 로드 실패:', error);
        setHistoryData([]);
      }
    };

    fetchAITransactions();
    fetchUserTransactions();
    fetchHistory();
    setLoading(false);

    return () => {
      unsubAI();
      unsubHoldings();
    };
  }, []);

  // Holdings 데이터 보강
  const enrichHoldingsData = async (holdings) => {
    const symbols = [...new Set(holdings.map(h => h.symbol))];
    const prices = {};
    const koreanNames = {};

    await Promise.all(
      symbols.map(async (symbol) => {
        try {
          const res = await fetch(`/api/naver-stock?symbol=${symbol}`);
          const data = await res.json();

          if (data.koreanName) {
            koreanNames[symbol] = data.koreanName;
          }

          if (data.currentPrice) {
            const price = typeof data.currentPrice === 'string'
              ? Number(data.currentPrice.replace(/,/g, ''))
              : Number(data.currentPrice);

            if (!isNaN(price) && price > 0) {
              prices[symbol] = price;
            }
          }
        } catch (e) {
          console.log(`❌ [${symbol}] API 실패:`, e.message);
        }
      })
    );

    const enriched = holdings.map(h => {
      const currentPrice = prices[h.symbol] || h.avgPrice;
      const evalAmt = currentPrice * h.quantity;
      const profit = evalAmt - h.totalInvested;
      const profitRate = ((profit / h.totalInvested) * 100).toFixed(2);
      const correctAvgPrice = h.totalInvested / h.quantity;

      return {
        ...h,
        currentPrice,
        evalAmt,
        profit,
        profitRate: parseFloat(profitRate),
        koreanName: koreanNames[h.symbol] || h.name,
        avgPrice: correctAvgPrice
      };
    }).sort((a, b) => b.evalAmt - a.evalAmt);

    setUserHoldingsDetail(enriched);
  };

  // AI 통계 계산
  const calculateAIStats = (transactions) => {
    if (!transactions || transactions.length === 0) {
      setAiStats({ totalTrades: 0, winRate: 0, avgProfit: 0, mdd: 0 });
      return;
    }

    const sellTrades = transactions.filter(tx => tx.action === 'sell' && tx.profitRate !== undefined);
    const wins = sellTrades.filter(tx => parseFloat(tx.profitRate) > 0).length;
    const winRate = sellTrades.length > 0 ? (wins / sellTrades.length * 100).toFixed(0) : 0;
    const avgProfit = sellTrades.length > 0
      ? (sellTrades.reduce((sum, tx) => sum + parseFloat(tx.profitRate), 0) / sellTrades.length).toFixed(1)
      : 0;

    setAiStats({
      totalTrades: sellTrades.length,
      winRate,
      avgProfit,
      mdd: 0,
    });
  };

  // 사용자 통계 계산
  const calculateUserStats = (transactions) => {
    if (!transactions || transactions.length === 0) {
      setUserStats({ totalTrades: 0, winRate: 0, avgProfit: 0, mdd: 0 });
      return;
    }

    const sellTrades = transactions.filter(tx => tx.type === 'sell' && tx.profitRate !== undefined);
    const wins = sellTrades.filter(tx => parseFloat(tx.profitRate) > 0).length;
    const winRate = sellTrades.length > 0 ? (wins / sellTrades.length * 100).toFixed(0) : 0;
    const avgProfit = sellTrades.length > 0
      ? (sellTrades.reduce((sum, tx) => sum + parseFloat(tx.profitRate), 0) / sellTrades.length).toFixed(1)
      : 0;

    setUserStats({
      totalTrades: sellTrades.length,
      winRate,
      avgProfit,
      mdd: 0,
    });
  };

  // 그래프 데이터 계산
  useEffect(() => {
    if (historyData.length === 0) {
      // 히스토리 없으면 시작-현재 데이터만 (기간 필터 무효)
      const aiReturn = aiPortfolio
        ? ((aiPortfolio.totalAsset - 10000000) / 10000000 * 100)
        : 0;

      const userTotalValue = userHoldingsDetail.reduce((sum, h) => sum + h.evalAmt, 0);
      const userReturn = userTotalValue > 0
        ? ((userTotalValue - 10000000) / 10000000 * 100)
        : 0;

      if (aiReturn !== 0 || userReturn !== 0) {
        setPerformanceData([
          { date: '시작', ai: 0, user: 0 },
          { date: '현재', ai: parseFloat(aiReturn.toFixed(2)), user: parseFloat(userReturn.toFixed(2)) },
        ]);
      } else {
        setPerformanceData([]);
      }
      return;
    }

    // 히스토리 데이터로 그래프 생성
    let filteredData = [...historyData];
    
    if (chartPeriod === 'day') {
      filteredData = filteredData.slice(-7); // 최근 7일
    } else if (chartPeriod === 'week') {
      filteredData = filteredData.slice(-28); // 최근 4주
    } else if (chartPeriod === 'month') {
      filteredData = filteredData.slice(-90); // 최근 3개월
    }

    const chartData = filteredData.map(h => ({
      date: new Date(h.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
      ai: parseFloat(h.returnRate),
      user: 0, // TODO: 사용자 히스토리 추가
    }));

    setPerformanceData(chartData);
  }, [historyData, chartPeriod, aiPortfolio, userHoldingsDetail]);

  // 수동 실행
  const handleManualStart = async () => {
    if (executing) return;
    
    setExecuting(true);
    try {
      const userId = auth.currentUser?.uid;
      const response = await fetch('/api/ai-trader/manual-start', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });

      const result = await response.json();
      
      if (result.success) {
        alert('✅ AI 트레이더가 시작되었습니다!');
      } else {
        alert(`❌ 실행 실패: ${result.error}`);
      }
    } catch (error) {
      alert(`❌ 오류: ${error.message}`);
    } finally {
      setExecuting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-50">
        <div className="text-center">
          <Activity className="w-16 h-16 animate-spin mx-auto mb-4 text-blue-600" />
          <p className="text-lg font-semibold text-gray-800">AI 트레이더 로딩 중...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="pb-24 bg-gradient-to-br from-blue-50 via-white to-indigo-50 min-h-screen">
      {/* Header */}
      <div className="bg-gradient-to-r from-blue-600 via-blue-700 to-indigo-700 text-white px-6 py-8 shadow-lg">
        <div className="flex items-center gap-4 mb-3">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center backdrop-blur-sm">
            <Bot className="w-8 h-8" />
          </div>
          <div>
            <h1 className="text-3xl font-bold">AI 트레이더</h1>
            <p className="text-sm text-blue-100 mt-1">인공지능 자동 매매 시스템</p>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white border-b sticky top-0 z-10 shadow-sm">
        <div className="flex">
          {[
            { id: 'dashboard', label: '대시보드', icon: Activity },
            { id: 'history', label: '매매내역', icon: DollarSign },
            { id: 'analysis', label: '비교분석', icon: Percent },
          ].map(({ id, label, icon: Icon }) => (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              className={`flex-1 py-4 flex items-center justify-center gap-2 text-sm font-bold transition-all ${
                activeTab === id
                  ? 'text-blue-600 border-b-3 border-blue-600 bg-blue-50/50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <Icon className="w-5 h-5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div className="px-4 py-6 max-w-5xl mx-auto">
        {activeTab === 'dashboard' && (
          <DashboardTab
            aiPortfolio={aiPortfolio}
            userHoldingsDetail={userHoldingsDetail}
            aiStats={aiStats}
            userStats={userStats}
            performanceData={performanceData}
            chartPeriod={chartPeriod}
            setChartPeriod={setChartPeriod}
            executing={executing}
            handleManualStart={handleManualStart}
          />
        )}
        {activeTab === 'history' && <HistoryTab aiTransactions={aiTransactions} />}
        {activeTab === 'analysis' && <AnalysisTab aiStats={aiStats} userStats={userStats} />}
      </div>
    </div>
  );
}

function DashboardTab({ aiPortfolio, userHoldingsDetail, aiStats, userStats, performanceData, chartPeriod, setChartPeriod, executing, handleManualStart }) {
  const aiReturn = aiPortfolio
    ? ((aiPortfolio.totalAsset - 10000000) / 10000000 * 100).toFixed(1)
    : '0.0';

  const userTotalValue = userHoldingsDetail.reduce((sum, h) => sum + h.evalAmt, 0);
  const userReturn = userTotalValue > 0
    ? ((userTotalValue - 10000000) / 10000000 * 100).toFixed(1)
    : '0.0';

  return (
    <div className="space-y-6">
      {/* Performance Chart */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-bold text-xl text-gray-900">누적 수익률 추이</h2>
          
          {/* Period Selector */}
          <div className="flex gap-2">
            {[
              { id: 'day', label: '일간' },
              { id: 'week', label: '주간' },
              { id: 'month', label: '월간' },
            ].map(({ id, label }) => (
              <button
                key={id}
                onClick={() => setChartPeriod(id)}
                className={`px-4 py-2 rounded-lg text-sm font-bold transition-all ${
                  chartPeriod === id
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {performanceData.length === 0 ? (
          <div className="h-64 flex flex-col items-center justify-center text-gray-500">
            <AlertCircle className="w-16 h-16 mb-4 text-gray-300" />
            <p className="font-semibold text-lg">거래 데이터 수집 중</p>
            <p className="text-sm mt-2">투자를 시작하면 차트가 표시됩니다</p>
          </div>
        ) : performanceData.length === 2 && performanceData[0].date === '시작' ? (
          <div>
            <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-sm text-blue-800 font-semibold">
                ℹ️ 매일 15시에 수익률이 기록됩니다. 며칠 후 일/주/월 그래프를 확인하세요!
              </p>
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                stroke="#6b7280"
                fontSize={13}
                fontWeight={600}
                tick={{ fill: '#374151' }}
              />
              <YAxis
                stroke="#6b7280"
                fontSize={13}
                fontWeight={600}
                tickFormatter={(value) => `${value}%`}
                tick={{ fill: '#374151' }}
                label={{
                  value: '수익률 (%)',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fill: '#374151', fontWeight: 700, fontSize: 14 }
                }}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '2px solid #e5e7eb',
                  borderRadius: '12px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                }}
                formatter={(value) => [`${value}%`, '']}
                labelStyle={{ fontWeight: 'bold', color: '#1f2937' }}
              />
              <Legend
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="circle"
              />
              <Line
                type="monotone"
                dataKey="ai"
                stroke="#2563eb"
                strokeWidth={3}
                name="🤖 AI"
                dot={{ fill: '#2563eb', r: 5, strokeWidth: 2, stroke: '#fff' }}
              />
              <Line
                type="monotone"
                dataKey="user"
                stroke="#10b981"
                strokeWidth={3}
                name="👤 나"
                dot={{ fill: '#10b981', r: 5, strokeWidth: 2, stroke: '#fff' }}
              />
            </LineChart>
          </ResponsiveContainer>
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={performanceData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
              <XAxis
                dataKey="date"
                stroke="#6b7280"
                fontSize={13}
                fontWeight={600}
                tick={{ fill: '#374151' }}
              />
              <YAxis
                stroke="#6b7280"
                fontSize={13}
                fontWeight={600}
                tickFormatter={(value) => `${value}%`}
                tick={{ fill: '#374151' }}
                label={{
                  value: '수익률 (%)',
                  angle: -90,
                  position: 'insideLeft',
                  style: { fill: '#374151', fontWeight: 700, fontSize: 14 }
                }}
                domain={['auto', 'auto']}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#fff',
                  border: '2px solid #e5e7eb',
                  borderRadius: '12px',
                  boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
                }}
                formatter={(value) => [`${value}%`, '']}
                labelStyle={{ fontWeight: 'bold', color: '#1f2937' }}
              />
              <Legend
                wrapperStyle={{ paddingTop: '20px' }}
                iconType="circle"
              />
              <Line
                type="monotone"
                dataKey="ai"
                stroke="#2563eb"
                strokeWidth={3}
                name="🤖 AI"
                dot={{ fill: '#2563eb', r: 5, strokeWidth: 2, stroke: '#fff' }}
              />
              <Line
                type="monotone"
                dataKey="user"
                stroke="#10b981"
                strokeWidth={3}
                name="👤 나"
                dot={{ fill: '#10b981', r: 5, strokeWidth: 2, stroke: '#fff' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Performance Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Bot className="w-6 h-6" />
            </div>
            <span className="text-sm font-bold opacity-90">AI</span>
          </div>
          <div className="text-4xl font-black mb-2">
            {parseFloat(aiReturn) >= 0 ? '+' : ''}{aiReturn}%
          </div>
          {aiStats && aiStats.totalTrades > 0 ? (
            <div className="space-y-1 text-sm font-medium opacity-90">
              <div>승률 {aiStats.winRate}% · 평균 {aiStats.avgProfit >= 0 ? '+' : ''}{aiStats.avgProfit}%</div>
              <div>거래 {aiStats.totalTrades}회</div>
            </div>
          ) : (
            <div className="text-sm font-medium opacity-75">거래 내역 없음</div>
          )}
        </div>

        <div className="bg-gradient-to-br from-green-600 to-emerald-700 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <User className="w-6 h-6" />
            </div>
            <span className="text-sm font-bold opacity-90">나</span>
          </div>
          <div className="text-4xl font-black mb-2">
            {parseFloat(userReturn) >= 0 ? '+' : ''}{userReturn}%
          </div>
          {userStats && userStats.totalTrades > 0 ? (
            <div className="space-y-1 text-sm font-medium opacity-90">
              <div>승률 {userStats.winRate}% · 평균 {userStats.avgProfit >= 0 ? '+' : ''}{userStats.avgProfit}%</div>
              <div>거래 {userStats.totalTrades}회</div>
            </div>
          ) : (
            <div className="text-sm font-medium opacity-75">거래 내역 없음</div>
          )}
        </div>
      </div>

      {/* AI Status & Manual Execution */}
      <div className={`rounded-2xl p-5 border-2 shadow-md ${
        aiPortfolio?.status?.active
          ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300'
          : 'bg-gradient-to-r from-gray-50 to-gray-100 border-gray-300'
      }`}>
        <div className="flex items-center gap-3 mb-4">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            aiPortfolio?.status?.active ? 'bg-green-100' : 'bg-gray-100'
          }`}>
            {aiPortfolio?.status?.active ? (
              <Check className="w-6 h-6 text-green-600" />
            ) : (
              <Clock className="w-6 h-6 text-gray-600" />
            )}
          </div>
          <div className="flex-1">
            <span className={`font-black text-lg ${
              aiPortfolio?.status?.active ? 'text-green-800' : 'text-gray-800'
            }`}>
              {aiPortfolio?.status?.active ? 'AI 트레이더 활성' : 'AI 트레이더 대기 중'}
            </span>
            <div className={`text-sm font-semibold ${
              aiPortfolio?.status?.active ? 'text-green-700' : 'text-gray-700'
            }`}>
              {aiPortfolio?.status?.active
                ? `보유: ${aiPortfolio?.holdings?.length || 0}종목`
                : '매수 기회를 찾고 있습니다'
              }
            </div>
          </div>
        </div>

        {!aiPortfolio?.status?.active && (
          <button
            onClick={handleManualStart}
            disabled={executing}
            className={`w-full py-4 rounded-xl font-black text-lg transition-all ${
              executing
                ? 'bg-gray-400 text-white cursor-not-allowed'
                : 'bg-gradient-to-r from-blue-600 to-indigo-600 text-white hover:from-blue-700 hover:to-indigo-700 shadow-lg hover:shadow-xl active:scale-95'
            }`}
          >
            {executing ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2 className="w-6 h-6 animate-spin" />
                분석 중...
              </span>
            ) : (
              <span className="flex items-center justify-center gap-2">
                <Play className="w-6 h-6" />
                AI 분석 시작하기
              </span>
            )}
          </button>
        )}
      </div>

      {/* AI Portfolio */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Bot className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="font-bold text-lg text-gray-900">AI 포트폴리오</h3>
        </div>

        <div className="space-y-3">
          {aiPortfolio?.holdings?.length > 0 ? (
            aiPortfolio.holdings.map((holding, idx) => (
              <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-gray-900 text-lg">{holding.name}</div>
                  <div className={`font-black text-xl ${holding.profitRate >= 0 ? 'text-red-600' : 'text-blue-600'}`}>
                    {holding.profitRate >= 0 ? '+' : ''}{holding.profitRate.toFixed(2)}%
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  보유: <span className="font-semibold text-gray-800">{holding.quantity}주</span> · 
                  평단: <span className="font-semibold text-gray-800">{holding.avgPrice.toLocaleString()}원</span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                <DollarSign className="w-8 h-8 text-gray-400" />
              </div>
              <p className="font-bold text-gray-900 mb-1">보유 종목 없음</p>
              <p className="text-sm text-gray-500">현금: {(aiPortfolio?.cash || 10000000).toLocaleString()}원</p>
            </div>
          )}
        </div>
      </div>

      {/* User Portfolio */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-green-100 rounded-xl flex items-center justify-center">
            <User className="w-6 h-6 text-green-600" />
          </div>
          <h3 className="font-bold text-lg text-gray-900">내 포트폴리오</h3>
        </div>

        <div className="space-y-3">
          {userHoldingsDetail.length > 0 ? (
            userHoldingsDetail.map((holding, idx) => (
              <div key={idx} className="p-4 bg-gray-50 rounded-xl border border-gray-200">
                <div className="flex items-center justify-between mb-2">
                  <div className="font-bold text-gray-900 text-lg">{holding.koreanName}</div>
                  <div className={`font-black text-xl ${holding.profitRate >= 0 ? 'text-red-600' : 'text-blue-600'}`}>
                    {holding.profitRate >= 0 ? '+' : ''}{holding.profitRate}%
                  </div>
                </div>
                <div className="text-sm text-gray-600">
                  보유: <span className="font-semibold text-gray-800">{holding.quantity}주</span> · 
                  평단: <span className="font-semibold text-gray-800">{holding.avgPrice.toLocaleString()}원</span> · 
                  현재: <span className="font-semibold text-gray-800">{holding.currentPrice.toLocaleString()}원</span>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12">
              <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                <DollarSign className="w-8 h-8 text-gray-400" />
              </div>
              <p className="font-bold text-gray-900 mb-1">보유 종목 없음</p>
              <p className="text-sm text-gray-500">현금: 10,000,000원</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function HistoryTab({ aiTransactions }) {
  if (!aiTransactions || aiTransactions.length === 0) {
    return (
      <div className="text-center py-20">
        <Activity className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="font-bold text-gray-900 text-lg">거래 내역 없음</p>
        <p className="text-sm text-gray-500 mt-2">AI가 매매를 시작하면 내역이 표시됩니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {aiTransactions.map((tx) => (
        <div key={tx.id} className="bg-white rounded-2xl shadow-md p-5 border border-gray-100">
          {/* Header */}
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              {tx.action === 'buy' ? (
                <div className="w-12 h-12 bg-red-100 rounded-xl flex items-center justify-center">
                  <TrendingUp className="w-6 h-6 text-red-600" />
                </div>
              ) : (
                <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                  <TrendingDown className="w-6 h-6 text-blue-600" />
                </div>
              )}
              <div>
                <div className="font-black text-lg text-gray-900">
                  {tx.action === 'buy' ? '🟢 매수' : '🔴 매도'}: {tx.name}
                </div>
                <div className="text-sm font-medium text-gray-500 mt-0.5">
                  {new Date(tx.date).toLocaleString('ko-KR')}
                </div>
              </div>
            </div>
            {tx.profitRate && (
              <div className="text-right">
                <div className={`font-black text-2xl ${parseFloat(tx.profitRate) >= 0 ? 'text-red-600' : 'text-blue-600'}`}>
                  {parseFloat(tx.profitRate) >= 0 ? '+' : ''}{parseFloat(tx.profitRate).toFixed(2)}%
                </div>
                {tx.holdDays && (
                  <div className="text-sm font-semibold text-gray-500">{tx.holdDays}일 보유</div>
                )}
              </div>
            )}
          </div>

          {/* Price Info */}
          {tx.action === 'buy' && (
            <div className="grid grid-cols-3 gap-3 mb-4 p-3 bg-gray-50 rounded-lg">
              <div className="text-center">
                <div className="text-xs font-semibold text-gray-500 mb-1">📍 매수가</div>
                <div className="text-sm font-bold text-gray-900">{tx.price?.toLocaleString()}원</div>
              </div>
              <div className="text-center border-l border-gray-300">
                <div className="text-xs font-semibold text-gray-500 mb-1">🎯 목표가</div>
                <div className="text-sm font-bold text-green-600">{tx.takeProfit?.toLocaleString() || '-'}원</div>
              </div>
              <div className="text-center border-l border-gray-300">
                <div className="text-xs font-semibold text-gray-500 mb-1">⛔ 손절가</div>
                <div className="text-sm font-bold text-red-600">{tx.stopLoss?.toLocaleString() || '-'}원</div>
              </div>
            </div>
          )}

          {/* AI Reasons */}
          {tx.aiReasons && tx.aiReasons.length > 0 && (
            <div className="border-t border-gray-200 pt-4">
              <div className="flex items-center gap-2 mb-3">
                <Bot className="w-5 h-5 text-blue-600" />
                <span className="text-sm font-bold text-gray-900">
                  {tx.action === 'buy' ? 'AI 매수 근거' : 'AI 매도 이유'}
                </span>
                <span className="ml-auto text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded">
                  AI 점수: {tx.aiScore || 0}/100
                </span>
              </div>
              <div className="space-y-2">
                {tx.aiReasons.map((reason, idx) => (
                  <div key={idx} className="text-sm font-medium text-gray-700 flex items-start gap-2">
                    <span className="text-blue-600 font-bold">•</span>
                    <span>{reason}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AnalysisTab({ aiStats, userStats }) {
  const hasData = (aiStats && aiStats.totalTrades > 0) || (userStats && userStats.totalTrades > 0);

  if (!hasData) {
    return (
      <div className="text-center py-20">
        <Percent className="w-16 h-16 text-gray-300 mx-auto mb-4" />
        <p className="font-bold text-gray-900 text-lg">분석 데이터 부족</p>
        <p className="text-sm text-gray-500 mt-2">매매 데이터가 쌓이면 비교 분석이 가능합니다</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <h3 className="font-bold text-lg text-gray-900 mb-5">🎯 매매 성과 비교</h3>
        <div className="space-y-4">
          <div className="flex justify-between p-3 bg-gray-50 rounded-xl">
            <span className="font-semibold text-gray-700">총 거래 횟수</span>
            <div className="flex gap-4">
              <span className="font-bold text-blue-600">AI: {aiStats?.totalTrades || 0}회</span>
              <span className="font-bold text-green-600">나: {userStats?.totalTrades || 0}회</span>
            </div>
          </div>
          <div className="flex justify-between p-3 bg-gray-50 rounded-xl">
            <span className="font-semibold text-gray-700">승률</span>
            <div className="flex gap-4">
              <span className="font-bold text-blue-600">AI: {aiStats?.winRate || 0}%</span>
              <span className="font-bold text-green-600">나: {userStats?.winRate || 0}%</span>
            </div>
          </div>
          <div className="flex justify-between p-3 bg-gray-50 rounded-xl">
            <span className="font-semibold text-gray-700">평균 수익률</span>
            <div className="flex gap-4">
              <span className="font-bold text-blue-600">AI: {aiStats?.avgProfit >= 0 ? '+' : ''}{aiStats?.avgProfit || 0}%</span>
              <span className="font-bold text-green-600">나: {userStats?.avgProfit >= 0 ? '+' : ''}{userStats?.avgProfit || 0}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}