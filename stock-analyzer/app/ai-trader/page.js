'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, orderBy, onSnapshot, getDocs } from 'firebase/firestore';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { TrendingUp, TrendingDown, Bot, User, Activity, DollarSign, Percent, Play, Check, Clock } from 'lucide-react';

export default function AITraderPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [aiPortfolio, setAiPortfolio] = useState(null);
  const [userPortfolio, setUserPortfolio] = useState(null);
  const [performanceData, setPerformanceData] = useState([]);
  const [timeframe, setTimeframe] = useState('week');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) return;

    const aiPortfolioRef = collection(db, 'aiTrader');
    const q = query(aiPortfolioRef, where('userId', '==', userId));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      if (!snapshot.empty) {
        const data = snapshot.docs[0].data();
        setAiPortfolio(data);
        calculatePerformance(data);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const calculatePerformance = (data) => {
    const mockData = [
      { date: '05/01', ai: 0, user: 0 },
      { date: '05/02', ai: 1.2, user: 0.8 },
      { date: '05/03', ai: 2.5, user: 1.5 },
      { date: '05/04', ai: 3.8, user: 2.3 },
      { date: '05/05', ai: 5.1, user: 3.9 },
      { date: '05/06', ai: 7.2, user: 5.1 },
      { date: '05/07', ai: 9.5, user: 6.8 },
      { date: '05/08', ai: 12.5, user: 8.3 },
    ];
    setPerformanceData(mockData);
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
        {activeTab === 'dashboard' && <DashboardTab data={performanceData} timeframe={timeframe} setTimeframe={setTimeframe} aiPortfolio={aiPortfolio} />}
        {activeTab === 'history' && <HistoryTab />}
        {activeTab === 'analysis' && <AnalysisTab />}
      </div>
    </div>
  );
}

function DashboardTab({ data, timeframe, setTimeframe, aiPortfolio }) {
  const latestData = data[data.length - 1] || {};
  const aiReturn = latestData.ai || 0;
  const userReturn = latestData.user || 0;

  return (
    <div className="space-y-6">
      {/* Performance Chart */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <div className="flex items-center justify-between mb-6">
          <h2 className="font-bold text-xl text-gray-900">수익률 비교</h2>
          <div className="flex gap-2">
            {['일', '주', '월', '년'].map((label, idx) => {
              const value = ['day', 'week', 'month', 'year'][idx];
              return (
                <button
                  key={value}
                  onClick={() => setTimeframe(value)}
                  className={`px-4 py-2 text-sm font-semibold rounded-xl transition-all ${
                    timeframe === value
                      ? 'bg-blue-600 text-white shadow-md'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {label}
                </button>
              );
            })}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={280}>
          <LineChart data={data}>
            <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
            <XAxis 
              dataKey="date" 
              stroke="#6b7280" 
              fontSize={13}
              fontWeight={600}
            />
            <YAxis 
              stroke="#6b7280" 
              fontSize={13}
              fontWeight={600}
              tickFormatter={(value) => `${value}%`}
            />
            <Tooltip 
              contentStyle={{ 
                backgroundColor: '#fff', 
                border: '2px solid #e5e7eb', 
                borderRadius: '12px',
                boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
              }}
              formatter={(value) => [`${value.toFixed(2)}%`, '']}
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
              name="🤖 AI 트레이더"
              dot={{ fill: '#2563eb', r: 5, strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 7 }}
            />
            <Line 
              type="monotone" 
              dataKey="user" 
              stroke="#10b981" 
              strokeWidth={3} 
              name="👤 내 투자"
              dot={{ fill: '#10b981', r: 5, strokeWidth: 2, stroke: '#fff' }}
              activeDot={{ r: 7 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      {/* Performance Cards */}
      <div className="grid grid-cols-2 gap-4">
        <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <Bot className="w-6 h-6" />
            </div>
            <span className="text-sm font-bold opacity-90">AI 트레이더</span>
          </div>
          <div className="text-4xl font-black mb-2">+{aiReturn.toFixed(1)}%</div>
          <div className="space-y-1 text-sm font-medium opacity-90">
            <div>승률 65% · 평균 +3.5%</div>
            <div>MDD -8% · 거래 15회</div>
          </div>
        </div>

        <div className="bg-gradient-to-br from-green-600 to-emerald-700 rounded-2xl p-6 text-white shadow-lg">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center">
              <User className="w-6 h-6" />
            </div>
            <span className="text-sm font-bold opacity-90">내 투자</span>
          </div>
          <div className="text-4xl font-black mb-2">+{userReturn.toFixed(1)}%</div>
          <div className="space-y-1 text-sm font-medium opacity-90">
            <div>승률 58% · 평균 +2.1%</div>
            <div>MDD -12% · 거래 23회</div>
          </div>
        </div>
      </div>

      {/* AI Portfolio */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 bg-blue-100 rounded-xl flex items-center justify-center">
            <Bot className="w-6 h-6 text-blue-600" />
          </div>
          <h3 className="font-bold text-lg text-gray-900">AI 현재 포트폴리오</h3>
        </div>
        
        <div className="space-y-3">
          {aiPortfolio?.holdings?.length > 0 ? (
            aiPortfolio.holdings.map((holding, idx) => (
              <div key={idx} className="flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200 hover:bg-gray-100 transition-colors">
                <div>
                  <div className="font-bold text-gray-900 text-base">{holding.name}</div>
                  <div className="text-sm text-gray-600 mt-1">
                    {holding.quantity}주 · 평단 {holding.avgPrice.toLocaleString()}원
                  </div>
                </div>
                <div className="text-right">
                  <div className={`font-black text-lg ${holding.profitRate >= 0 ? 'text-red-600' : 'text-blue-600'}`}>
                    {holding.profitRate >= 0 ? '+' : ''}{holding.profitRate.toFixed(2)}%
                  </div>
                  <div className="text-sm font-semibold text-gray-500 mt-1">비중 {holding.weight}%</div>
                </div>
              </div>
            ))
          ) : (
            <div className="text-center py-12 text-gray-500">
              <div className="w-16 h-16 bg-gray-100 rounded-full mx-auto mb-4 flex items-center justify-center">
                <Activity className="w-8 h-8 text-gray-400" />
              </div>
              <p className="font-medium">보유 종목이 없습니다</p>
              <p className="text-sm mt-1">AI가 매수 기회를 찾고 있어요</p>
            </div>
          )}
          
          <div className="flex items-center justify-between p-4 bg-gradient-to-r from-gray-100 to-gray-50 rounded-xl border border-gray-200">
            <div className="font-bold text-gray-900">현금</div>
            <div className="font-black text-gray-700">💰 {aiPortfolio?.cashRate || 100}%</div>
          </div>
        </div>
      </div>

      {/* AI Status */}
      <div className={`rounded-2xl p-5 border-2 shadow-md ${
        aiPortfolio?.status?.active 
          ? 'bg-gradient-to-r from-green-50 to-emerald-50 border-green-300' 
          : 'bg-gradient-to-r from-red-50 to-rose-50 border-red-300'
      }`}>
        <div className="flex items-center gap-3 mb-2">
          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
            aiPortfolio?.status?.active ? 'bg-green-100' : 'bg-red-100'
          }`}>
            {aiPortfolio?.status?.active ? (
              <Check className="w-6 h-6 text-green-600" />
            ) : (
              <Clock className="w-6 h-6 text-red-600" />
            )}
          </div>
          <span className={`font-black text-lg ${
            aiPortfolio?.status?.active ? 'text-green-800' : 'text-red-800'
          }`}>
            {aiPortfolio?.status?.active ? 'AI 트레이더 활성' : 'AI 트레이더 일시 중지'}
          </span>
        </div>
        <div className={`text-sm font-semibold ${
          aiPortfolio?.status?.active ? 'text-green-700' : 'text-red-700'
        }`}>
          {aiPortfolio?.status?.active 
            ? `다음 분석: 내일 08:30 | 보유: ${aiPortfolio?.holdings?.length || 0}종목`
            : `사유: ${aiPortfolio?.status?.pauseReason || '수동 중지'}`
          }
        </div>
      </div>
    </div>
  );
}

function HistoryTab() {
  const [transactions, setTransactions] = useState([]);

  useEffect(() => {
    const mockTransactions = [
      {
        id: 1,
        date: '2026-05-08 14:30',
        action: 'sell',
        code: '005930',
        name: '삼성전자',
        price: 70000,
        quantity: 50,
        profitRate: 2.94,
        holdDays: 3,
        aiScore: 45,
        aiReasons: ['단기 과열 징후', 'RSI 75 과매수', '섹터 모멘텀 약화'],
        triggerType: 'AI',
      },
      {
        id: 2,
        date: '2026-05-05 09:05',
        action: 'buy',
        code: '005930',
        name: '삼성전자',
        price: 68000,
        quantity: 50,
        aiScore: 82,
        aiReasons: ['반도체 섹터 강세 지속', '볼륨프로파일 지지구간 근처', 'Quant Score 85 (상위 5%)'],
      },
    ];
    setTransactions(mockTransactions);
  }, []);

  return (
    <div className="space-y-4">
      {transactions.map((tx) => (
        <div key={tx.id} className="bg-white rounded-2xl shadow-md p-5 border border-gray-100 hover:shadow-lg transition-shadow">
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
                <div className="text-sm font-medium text-gray-500 mt-0.5">{tx.date}</div>
              </div>
            </div>
            {tx.profitRate !== undefined && (
              <div className="text-right">
                <div className={`font-black text-2xl ${tx.profitRate >= 0 ? 'text-red-600' : 'text-blue-600'}`}>
                  {tx.profitRate >= 0 ? '+' : ''}{tx.profitRate}%
                </div>
                <div className="text-sm font-semibold text-gray-500">{tx.holdDays}일 보유</div>
              </div>
            )}
          </div>

          <div className="bg-gray-50 rounded-xl p-4 mb-4 border border-gray-200">
            <div className="font-semibold text-gray-900">
              {tx.action === 'buy' 
                ? `${tx.price.toLocaleString()}원 | ${tx.quantity}주`
                : `${(tx.price * 0.97).toLocaleString()}원 → ${tx.price.toLocaleString()}원`
              }
            </div>
          </div>

          <div className="border-t border-gray-200 pt-4">
            <div className="flex items-center gap-2 mb-3">
              <Bot className="w-5 h-5 text-blue-600" />
              <span className="text-sm font-bold text-gray-900">
                {tx.action === 'buy' ? '매수 근거' : '매도 이유'} (AI 점수: {tx.aiScore}/100)
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

          {tx.triggerType && (
            <div className="mt-4">
              <span className={`inline-block px-3 py-1.5 text-sm font-bold rounded-lg ${
                tx.triggerType === 'AI' ? 'bg-blue-100 text-blue-700' :
                tx.triggerType === 'auto_stop_loss' ? 'bg-red-100 text-red-700' :
                'bg-green-100 text-green-700'
              }`}>
                {tx.triggerType === 'AI' ? '🤖 AI 판단' :
                 tx.triggerType === 'auto_stop_loss' ? '⚙️ 자동 손절' :
                 '🎯 자동 익절'}
              </span>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function AnalysisTab() {
  return (
    <div className="space-y-6">
      {/* Sector Comparison */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <h3 className="font-bold text-lg text-gray-900 mb-5">📊 섹터별 투자 비중</h3>
        <div className="space-y-4">
          {[
            { sector: '반도체', ai: 30, user: 45, warning: '과다' },
            { sector: '2차전지', ai: 20, user: 10, warning: null },
            { sector: '바이오', ai: 10, user: 30, warning: '과다' },
            { sector: '현금', ai: 40, user: 15, warning: '부족' },
          ].map(({ sector, ai, user, warning }) => (
            <div key={sector} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
              <span className="font-bold text-gray-900 w-20">{sector}</span>
              <div className="flex-1 flex items-center gap-3">
                <div className="text-sm font-bold text-blue-600 w-20 text-right">AI {ai}%</div>
                <div className="text-sm font-semibold text-gray-400">vs</div>
                <div className="text-sm font-bold text-green-600 w-20">나 {user}%</div>
                {warning && (
                  <span className="text-sm font-black text-red-600">({warning})</span>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Trading Style */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <h3 className="font-bold text-lg text-gray-900 mb-5">🎯 매매 스타일 차이</h3>
        <div className="space-y-4">
          <div className="flex justify-between p-3 bg-gray-50 rounded-xl">
            <span className="font-semibold text-gray-700">평균 보유 기간</span>
            <div className="flex gap-4">
              <span className="font-bold text-blue-600">AI: 7.2일</span>
              <span className="font-bold text-green-600">나: 3.5일</span>
            </div>
          </div>
          <div className="flex justify-between p-3 bg-gray-50 rounded-xl">
            <span className="font-semibold text-gray-700">손절 집행률</span>
            <div className="flex gap-4">
              <span className="font-bold text-blue-600">AI: 100%</span>
              <span className="font-bold text-green-600">나: 60%</span>
            </div>
          </div>
          <div className="flex justify-between p-3 bg-gray-50 rounded-xl">
            <span className="font-semibold text-gray-700">종목 회전율</span>
            <div className="flex gap-4">
              <span className="font-bold text-blue-600">AI: 낮음</span>
              <span className="font-bold text-green-600">나: 높음</span>
            </div>
          </div>
        </div>
      </div>

      {/* Best Trades */}
      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <h3 className="font-bold text-lg text-gray-900 mb-5">💡 AI가 잘한 거래 TOP 3</h3>
        <div className="space-y-3">
          {[
            { rank: 1, name: 'SK하이닉스', profit: 18.5, days: 12, reason: '반도체 모멘텀 포착' },
            { rank: 2, name: 'LG에너지', profit: 12.3, days: 8, reason: '섹터 강세 판단' },
            { rank: 3, name: '포스코DX', profit: 9.1, days: 15, reason: '기술적 돌파 확인' },
          ].map(({ rank, name, profit, days, reason }) => (
            <div key={rank} className="flex items-center gap-4 p-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl border border-blue-200">
              <div className="w-10 h-10 bg-blue-600 text-white rounded-xl flex items-center justify-center font-black text-lg">
                {rank}
              </div>
              <div className="flex-1">
                <div className="font-bold text-gray-900">{name}</div>
                <div className="text-sm font-medium text-gray-600 mt-0.5">{reason}</div>
              </div>
              <div className="text-right">
                <div className="font-black text-xl text-red-600">+{profit}%</div>
                <div className="text-sm font-semibold text-gray-500">{days}일</div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="bg-white rounded-2xl shadow-md p-6 border border-gray-100">
        <h3 className="font-bold text-lg text-gray-900 mb-5">😅 AI가 못한 거래 TOP 3</h3>
        <div className="space-y-3">
          {[
            { rank: 1, name: 'POSCO홀딩스', profit: -7.0, reason: '섹터 급락 예측 실패', type: '손절' },
            { rank: 2, name: '카카오', profit: -5.2, reason: '악재 대응 미흡', type: null },
            { rank: 3, name: '네이버', profit: -3.1, reason: '과열 판단 지연', type: null },
          ].map(({ rank, name, profit, reason, type }) => (
            <div key={rank} className="flex items-center gap-4 p-4 bg-gray-50 rounded-xl border border-gray-200">
              <div className="w-10 h-10 bg-gray-300 text-gray-700 rounded-xl flex items-center justify-center font-black text-lg">
                {rank}
              </div>
              <div className="flex-1">
                <div className="font-bold text-gray-900">{name}</div>
                <div className="text-sm font-medium text-gray-600 mt-0.5">{reason}</div>
              </div>
              <div className="text-right">
                <div className="font-black text-xl text-blue-600">{profit}%</div>
                {type && <div className="text-sm font-semibold text-red-500">{type}</div>}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}