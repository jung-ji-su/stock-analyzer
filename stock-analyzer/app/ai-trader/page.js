'use client';

import { useState, useEffect } from 'react';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, onSnapshot, getDocs, limit, doc } from 'firebase/firestore';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Bot, User, Activity,
  DollarSign, Percent, Check, Clock, Play,
  Loader2, ChevronRight,
} from 'lucide-react';
import AILoadingModal from '@/components/AILoadingModal';

/* ─── Design Tokens ──────────────────────────────────────────────── */
const tokens = {
  // 배경
  bgPage: '#F5F6FA',
  bgCard: '#FFFFFF',
  bgCardAlt: '#F9FAFB',
  // 브랜드
  blue: '#2563EB',
  blueMid: '#3B82F6',
  blueLight: '#EFF6FF',
  indigo: '#4F46E5',
  // 수익 컬러 (한국식: 상승=빨, 하락=파)
  rise: '#EF4444',
  riseBg: '#FEF2F2',
  fall: '#2563EB',
  fallBg: '#EFF6FF',
  // 그린 (사용자)
  green: '#10B981',
  greenDark: '#059669',
  greenLight: '#ECFDF5',
  // 텍스트
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  // 보더
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  // 그림자
  shadowSm: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  shadowMd: '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
};

/* ─── 공통 스타일 ─────────────────────────────────────────────────── */
const card = {
  background: tokens.bgCard,
  borderRadius: 16,
  border: `1px solid ${tokens.border}`,
  boxShadow: tokens.shadowSm,
  padding: '16px',
  marginBottom: 12,
};

/* ─── Profit Badge ────────────────────────────────────────────────── */
function ProfitBadge({ value, size = 'md' }) {
  const isPos = parseFloat(value) >= 0;
  const fs = size === 'sm' ? 12 : size === 'lg' ? 20 : 14;
  return (
    <span style={{
      fontSize: fs,
      fontWeight: 700,
      color: isPos ? tokens.rise : tokens.fall,
      background: isPos ? tokens.riseBg : tokens.fallBg,
      padding: '3px 8px',
      borderRadius: 8,
      letterSpacing: '-0.3px',
    }}>
      {isPos ? '+' : ''}{parseFloat(value).toFixed(2)}%
    </span>
  );
}

/* ─── 섹션 헤더 ───────────────────────────────────────────────────── */
function SectionTitle({ icon: Icon, label, color = tokens.blue }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <div style={{
        width: 32, height: 32, borderRadius: 10,
        background: `${color}18`,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <Icon size={16} color={color} />
      </div>
      <span style={{ fontSize: 15, fontWeight: 700, color: tokens.textPrimary }}>{label}</span>
    </div>
  );
}

/* ─── 차트 커스텀 툴팁 ────────────────────────────────────────────── */
function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{
      background: tokens.bgCard,
      border: `1px solid ${tokens.border}`,
      borderRadius: 12,
      padding: '10px 14px',
      boxShadow: tokens.shadowMd,
      fontSize: 13,
    }}>
      <p style={{ margin: 0, color: tokens.textSecondary, marginBottom: 6 }}>{label}</p>
      {payload.map((p, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 2 }}>
          <span style={{ width: 8, height: 8, borderRadius: 4, background: p.color, display: 'inline-block' }} />
          <span style={{ color: tokens.textSecondary }}>{p.name}:</span>
          <span style={{ fontWeight: 700, color: parseFloat(p.value) >= 0 ? tokens.rise : tokens.fall }}>
            {parseFloat(p.value) >= 0 ? '+' : ''}{parseFloat(p.value).toFixed(2)}%
          </span>
        </div>
      ))}
    </div>
  );
}

/* ─── 메인 컴포넌트 ───────────────────────────────────────────────── */
export default function AITraderPage() {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [chartPeriod, setChartPeriod] = useState('week');
  const [aiPortfolio, setAiPortfolio] = useState(null);
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
    if (!userId) { setLoading(false); return; }

    const unsubAI = onSnapshot(doc(db, 'aiTrader', userId), (snap) => {
      setAiPortfolio(snap.exists() ? snap.data() : null);
    });

    const unsubHoldings = onSnapshot(
      query(collection(db, 'holdings'), where('userId', '==', userId)),
      async (snap) => {
        const holdings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        holdings.length ? await enrichHoldingsData(holdings) : setUserHoldingsDetail([]);
      }
    );

    const unsubAITx = onSnapshot(
      query(collection(db, 'aiTransactions'), where('userId', '==', userId)),
      (snap) => {
        const txs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
          .sort((a, b) => new Date(b.date) - new Date(a.date));
        setAiTransactions(txs);
        calculateAIStats(txs);
      }
    );

    const unsubHistory = onSnapshot(
      query(collection(db, 'aiPortfolioHistory'), where('userId', '==', userId)),
      (snap) => {
        const h = snap.docs.map(d => d.data()).sort((a, b) => new Date(a.date) - new Date(b.date));
        setHistoryData(h);
      }
    );

    (async () => {
      const snap = await getDocs(query(collection(db, 'trades'), where('userId', '==', userId), limit(50)));
      const txs = snap.docs.map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      setUserTransactions(txs);
      calculateUserStats(txs);
      setLoading(false);
    })();

    return () => { unsubAI(); unsubHoldings(); unsubAITx(); unsubHistory(); };
  }, []);

  const enrichHoldingsData = async (holdings) => {
    const symbols = [...new Set(holdings.map(h => h.symbol))];
    const prices = {}, names = {};
    await Promise.all(symbols.map(async (sym) => {
      try {
        const data = await (await fetch(`/api/naver-stock?symbol=${sym}`)).json();
        if (data.koreanName) names[sym] = data.koreanName;
        if (data.currentPrice) {
          const p = Number(String(data.currentPrice).replace(/,/g, ''));
          if (!isNaN(p) && p > 0) prices[sym] = p;
        }
      } catch (e) { /* ignore */ }
    }));
    setUserHoldingsDetail(
      holdings.map(h => {
        const cp = prices[h.symbol] || h.avgPrice;
        const ea = cp * h.quantity;
        const prof = ea - h.totalInvested;
        return {
          ...h, currentPrice: cp, evalAmt: ea, profit: prof,
          profitRate: parseFloat(((prof / h.totalInvested) * 100).toFixed(2)),
          koreanName: names[h.symbol] || h.name,
          avgPrice: h.totalInvested / h.quantity,
        };
      }).sort((a, b) => b.evalAmt - a.evalAmt)
    );
  };

  const getAction = (tx) => tx.action || tx.type;

  const calculateAIStats = (txs) => {
    if (!txs?.length) { setAiStats({ totalTrades: 0, winRate: 0, avgProfit: 0, avgHoldDays: 0 }); return; }
    const buyTxs = txs.filter(t => getAction(t) === 'buy');
    const sellTxs = txs.filter(t => getAction(t) === 'sell');
    const withRate = sellTxs.filter(t => t.profitRate !== undefined);
    const wins = withRate.filter(t => parseFloat(t.profitRate) > 0).length;
    let totalDays = 0, cnt = 0;
    sellTxs.forEach(s => {
      if (s.holdDays) { totalDays += s.holdDays; cnt++; }
      else {
        const b = buyTxs.find(b => b.symbol === s.symbol);
        if (b) { const d = Math.floor((new Date(s.date) - new Date(b.date)) / 86400000); if (d >= 0) { totalDays += d; cnt++; } }
      }
    });
    setAiStats({
      totalTrades: withRate.length,
      winRate: withRate.length ? (wins / withRate.length * 100).toFixed(0) : 0,
      avgProfit: withRate.length ? (withRate.reduce((s, t) => s + parseFloat(t.profitRate), 0) / withRate.length).toFixed(1) : 0,
      avgHoldDays: cnt ? Math.round(totalDays / cnt) : 0,
    });
  };

  const calculateUserStats = (txs) => {
    if (!txs?.length) { setUserStats({ totalTrades: 0, winRate: 0, avgProfit: 0 }); return; }
    const sells = txs.filter(t => t.type === 'sell' && t.profitRate !== undefined);
    const wins = sells.filter(t => parseFloat(t.profitRate) > 0).length;
    setUserStats({
      totalTrades: sells.length,
      winRate: sells.length ? (wins / sells.length * 100).toFixed(0) : 0,
      avgProfit: sells.length ? (sells.reduce((s, t) => s + parseFloat(t.profitRate), 0) / sells.length).toFixed(1) : 0,
    });
  };

  useEffect(() => {
    const aiAsset = aiPortfolio
      ? aiPortfolio.cash + (aiPortfolio.holdings || []).reduce((s, h) => s + ((h.currentPrice || h.avgPrice) * h.quantity), 0)
      : 10000000;
    const aiRet = ((aiAsset - 10000000) / 10000000 * 100).toFixed(2);
    const userVal = userHoldingsDetail.reduce((s, h) => s + h.evalAmt, 0);
    const userRet = userVal > 0 ? ((userVal - 10000000) / 10000000 * 100).toFixed(2) : '0.00';

    if (!historyData.length) {
      setPerformanceData([{ date: '시작', ai: 0, user: 0 }, { date: '현재', ai: parseFloat(aiRet), user: parseFloat(userRet) }]);
      return;
    }
    let fd = [...historyData];
    if (chartPeriod === 'day') fd = fd.slice(-7);
    else if (chartPeriod === 'week') fd = fd.slice(-28);
    else fd = fd.slice(-90);
    const cd = fd.map(h => ({
      date: new Date(h.date).toLocaleDateString('ko-KR', { month: 'short', day: 'numeric' }),
      ai: parseFloat(h.returnRate || 0), user: 0,
    }));
    cd.push({ date: '현재', ai: parseFloat(aiRet), user: parseFloat(userRet) });
    setPerformanceData(cd);
  }, [historyData, chartPeriod, aiPortfolio, userHoldingsDetail]);

  const handleManualStart = async () => {
    if (executing) return;
    setExecuting(true);
    try {
      const res = await fetch('/api/ai-trader/manual-start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: auth.currentUser?.uid }),
      });
      const r = await res.json();
      alert(r.success ? '✅ 분석완료!' : `❌ 실행 실패: ${r.error}`);
    } catch (e) { alert(`❌ 오류: ${e.message}`); }
    finally { setExecuting(false); }
  };

  if (loading) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: tokens.bgPage }}>
      <div style={{ textAlign: 'center' }}>
        <Activity size={40} color={tokens.blue} style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: 12, color: tokens.textSecondary, fontSize: 14 }}>AI 트레이더 로딩 중...</p>
      </div>
    </div>
  );

  const TABS = [
    { id: 'dashboard', label: '대시보드', icon: Activity },
    { id: 'history', label: '매매내역', icon: TrendingUp },
    { id: 'analysis', label: '비교분석', icon: Percent },
  ];

  return (
    <div style={{ background: tokens.bgPage, minHeight: '100vh', paddingBottom: 88 }}>
      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { width: 0; }
      `}</style>

      <AILoadingModal isOpen={executing} />

      {/* ── Header ── */}
      <div style={{
        background: `linear-gradient(135deg, ${tokens.blue} 0%, ${tokens.indigo} 100%)`,
        padding: '20px 16px 24px',
        position: 'relative', overflow: 'hidden',
      }}>
        {/* 배경 장식 */}
        <div style={{
          position: 'absolute', top: -30, right: -30,
          width: 120, height: 120, borderRadius: '50%',
          background: 'rgba(255,255,255,0.06)',
        }} />
        <div style={{
          position: 'absolute', bottom: -20, right: 40,
          width: 80, height: 80, borderRadius: '50%',
          background: 'rgba(255,255,255,0.04)',
        }} />
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, position: 'relative' }}>
          <div style={{
            width: 44, height: 44, borderRadius: 14,
            background: 'rgba(255,255,255,0.2)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            border: '1px solid rgba(255,255,255,0.3)',
          }}>
            <Bot size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 800, color: '#fff', margin: 0, letterSpacing: '-0.5px' }}>AI 트레이더</h1>
            <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', margin: 0, marginTop: 2 }}>인공지능 자동 매매 시스템</p>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{
        background: tokens.bgCard, position: 'sticky', top: 0, zIndex: 50,
        borderBottom: `1px solid ${tokens.border}`,
        display: 'flex',
      }}>
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button
              key={id}
              onClick={() => setActiveTab(id)}
              style={{
                flex: 1, padding: '12px 4px', border: 'none', background: 'none',
                cursor: 'pointer', display: 'flex', flexDirection: 'column',
                alignItems: 'center', gap: 3,
                color: active ? tokens.blue : tokens.textTertiary,
                borderBottom: active ? `2px solid ${tokens.blue}` : '2px solid transparent',
                transition: 'all 0.15s ease',
              }}
            >
              <Icon size={17} />
              <span style={{ fontSize: 11, fontWeight: active ? 700 : 500 }}>{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div style={{ padding: '14px 14px 0', animation: 'fadeIn 0.2s ease' }}>
        {activeTab === 'dashboard' && (
          <DashboardTab
            aiPortfolio={aiPortfolio} userHoldingsDetail={userHoldingsDetail}
            aiStats={aiStats} userStats={userStats}
            performanceData={performanceData} chartPeriod={chartPeriod}
            setChartPeriod={setChartPeriod} executing={executing}
            handleManualStart={handleManualStart}
          />
        )}
        {activeTab === 'history' && <HistoryTab aiTransactions={aiTransactions} getAction={t => t.action || t.type} />}
        {activeTab === 'analysis' && <AnalysisTab aiStats={aiStats} userStats={userStats} />}
      </div>
    </div>
  );
}

/* ─── Dashboard Tab ──────────────────────────────────────────────── */
function DashboardTab({ aiPortfolio, userHoldingsDetail, aiStats, userStats, performanceData, chartPeriod, setChartPeriod, executing, handleManualStart }) {
  const aiAsset = aiPortfolio
    ? aiPortfolio.cash + (aiPortfolio.holdings || []).reduce((s, h) => s + ((h.currentPrice || h.avgPrice) * h.quantity), 0)
    : 10000000;
  const aiReturn = ((aiAsset - 10000000) / 10000000 * 100).toFixed(1);
  const userVal = userHoldingsDetail.reduce((s, h) => s + h.evalAmt, 0);
  const userReturn = userVal > 0 ? ((userVal - 10000000) / 10000000 * 100).toFixed(1) : '0.0';
  const isInitial = performanceData.length === 2 && performanceData[0]?.date === '시작';

  return (
    <div>
      {/* ─ 차트 카드 ─ */}
      <div style={{ ...card }}>
        {/* 기간 선택 */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
          <span style={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}>누적 수익률 추이</span>
          <div style={{ display: 'flex', gap: 4 }}>
            {[{ id: 'day', label: '일' }, { id: 'week', label: '주' }, { id: 'month', label: '월' }].map(({ id, label }) => (
              <button key={id} onClick={() => setChartPeriod(id)} style={{
                padding: '4px 10px', borderRadius: 8, border: 'none',
                fontSize: 12, fontWeight: 600, cursor: 'pointer',
                background: chartPeriod === id ? tokens.blue : tokens.bgCardAlt,
                color: chartPeriod === id ? '#fff' : tokens.textSecondary,
                transition: 'all 0.15s',
              }}>{label}</button>
            ))}
          </div>
        </div>
        {isInitial && (
          <div style={{
            background: tokens.blueLight, borderRadius: 10, padding: '8px 12px',
            fontSize: 12, color: '#1D4ED8', marginBottom: 10, lineHeight: 1.5,
          }}>
            ℹ️ 매일 15시에 수익률이 기록됩니다. 며칠 후 그래프를 확인하세요!
          </div>
        )}
        <ResponsiveContainer width="100%" height={200}>
          <LineChart data={performanceData} margin={{ top: 4, right: 4, left: -24, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke={tokens.borderLight} vertical={false} />
            <XAxis dataKey="date" tick={{ fontSize: 10, fill: tokens.textTertiary }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: tokens.textTertiary }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
            <Tooltip content={<CustomTooltip />} />
            <Line type="monotone" dataKey="ai" stroke={tokens.blue} strokeWidth={2.5} name="🤖 AI" dot={false} activeDot={{ r: 4, fill: tokens.blue }} />
            <Line type="monotone" dataKey="user" stroke={tokens.green} strokeWidth={2.5} name="👤 나" dot={false} activeDot={{ r: 4, fill: tokens.green }} />
          </LineChart>
        </ResponsiveContainer>
        {/* 범례 */}
        <div style={{ display: 'flex', justifyContent: 'center', gap: 16, marginTop: 8 }}>
          {[{ color: tokens.blue, label: '🤖 AI' }, { color: tokens.green, label: '👤 나' }].map(({ color, label }) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: tokens.textSecondary }}>
              <div style={{ width: 20, height: 2.5, borderRadius: 2, background: color }} />
              {label}
            </div>
          ))}
        </div>
      </div>

      {/* ─ 수익률 카드 ─ */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 12 }}>
        {/* AI */}
        <div style={{
          background: `linear-gradient(135deg, ${tokens.blue} 0%, ${tokens.indigo} 100%)`,
          borderRadius: 16, padding: '14px 12px',
          boxShadow: `0 4px 14px ${tokens.blue}30`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <div style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Bot size={14} color="#fff" />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>AI</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: '-1px', lineHeight: 1 }}>
            {parseFloat(aiReturn) >= 0 ? '+' : ''}{aiReturn}%
          </div>
          {aiStats?.totalTrades > 0 ? (
            <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
              <div>승률 {aiStats.winRate}% · 평균 {aiStats.avgProfit >= 0 ? '+' : ''}{aiStats.avgProfit}%</div>
              <div>보유 {aiStats.avgHoldDays}일 · {aiStats.totalTrades}회</div>
            </div>
          ) : <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>거래 내역 없음</div>}
        </div>

        {/* 나 */}
        <div style={{
          background: `linear-gradient(135deg, ${tokens.green} 0%, ${tokens.greenDark} 100%)`,
          borderRadius: 16, padding: '14px 12px',
          boxShadow: `0 4px 14px ${tokens.green}30`,
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
            <div style={{ width: 26, height: 26, borderRadius: 8, background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <User size={14} color="#fff" />
            </div>
            <span style={{ fontSize: 12, fontWeight: 600, color: 'rgba(255,255,255,0.85)' }}>나</span>
          </div>
          <div style={{ fontSize: 26, fontWeight: 900, color: '#fff', letterSpacing: '-1px', lineHeight: 1 }}>
            {parseFloat(userReturn) >= 0 ? '+' : ''}{userReturn}%
          </div>
          {userStats?.totalTrades > 0 ? (
            <div style={{ marginTop: 8, fontSize: 11, color: 'rgba(255,255,255,0.75)', lineHeight: 1.6 }}>
              <div>승률 {userStats.winRate}% · 평균 {userStats.avgProfit >= 0 ? '+' : ''}{userStats.avgProfit}%</div>
              <div>{userStats.totalTrades}회</div>
            </div>
          ) : <div style={{ marginTop: 6, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>거래 내역 없음</div>}
        </div>
      </div>

      {/* ─ AI 상태 + 실행 버튼 ─ */}
      <div style={{
        ...card,
        background: aiPortfolio?.status?.active ? '#F0FDF4' : tokens.bgCard,
        border: `1px solid ${aiPortfolio?.status?.active ? '#BBF7D0' : tokens.border}`,
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 12,
            background: aiPortfolio?.status?.active ? '#DCFCE7' : tokens.bgCardAlt,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {aiPortfolio?.status?.active
              ? <Check size={18} color={tokens.greenDark} />
              : <Clock size={18} color={tokens.textSecondary} />}
          </div>
          <div>
            <div style={{ fontSize: 14, fontWeight: 700, color: aiPortfolio?.status?.active ? '#166534' : tokens.textPrimary }}>
              {aiPortfolio?.status?.active ? 'AI 트레이더 활성' : 'AI 트레이더 대기 중'}
            </div>
            <div style={{ fontSize: 12, color: aiPortfolio?.status?.active ? '#16A34A' : tokens.textSecondary, marginTop: 1 }}>
              {aiPortfolio?.status?.active
                ? `보유 ${aiPortfolio?.holdings?.length || 0}종목`
                : aiPortfolio?.status?.pauseReason || '매수 기회를 탐색 중'}
            </div>
          </div>
        </div>
        <button
          onClick={handleManualStart} disabled={executing}
          style={{
            width: '100%', padding: '13px 0', borderRadius: 12, border: 'none',
            fontSize: 14, fontWeight: 700, cursor: executing ? 'not-allowed' : 'pointer',
            background: executing ? '#CBD5E1' : `linear-gradient(135deg, ${tokens.blue} 0%, ${tokens.indigo} 100%)`,
            color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            boxShadow: executing ? 'none' : `0 4px 12px ${tokens.blue}40`,
            transition: 'all 0.15s',
            letterSpacing: '-0.2px',
          }}
        >
          {executing
            ? <><Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} /> 분석 중...</>
            : <><Play size={16} /> {aiPortfolio?.status?.active ? 'AI 재분석 시작' : 'AI 분석 시작'}</>}
        </button>
      </div>

      {/* ─ AI 포트폴리오 ─ */}
      <div style={{ ...card }}>
        <SectionTitle icon={Bot} label="AI 포트폴리오" />
        {/* 자산 요약 */}
        <div style={{
          background: tokens.blueLight, borderRadius: 12, padding: '10px 14px', marginBottom: 12,
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, color: '#1E40AF' }}>총 자산</span>
            <span style={{ fontSize: 15, fontWeight: 800, color: '#1E3A8A', letterSpacing: '-0.5px' }}>
              {(aiPortfolio ? aiPortfolio.cash + (aiPortfolio.holdings || []).reduce((s, h) => s + ((h.currentPrice || h.avgPrice) * h.quantity), 0) : 10000000).toLocaleString()}원
            </span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 4 }}>
            <span style={{ fontSize: 11, color: '#3B82F6' }}>현금</span>
            <span style={{ fontSize: 11, color: '#1D4ED8', fontWeight: 600 }}>{(aiPortfolio?.cash || 10000000).toLocaleString()}원</span>
          </div>
        </div>

        {aiPortfolio?.holdings?.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {aiPortfolio.holdings.map((h, i) => (
              <HoldingRow key={i} name={h.name} quantity={h.quantity} avgPrice={h.avgPrice} profitRate={h.profitRate} weight={h.weight} />
            ))}
          </div>
        ) : (
          <EmptyState icon={DollarSign} message="보유 종목 없음" sub={`현금 ${(aiPortfolio?.cash || 10000000).toLocaleString()}원`} />
        )}
      </div>

      {/* ─ 내 포트폴리오 ─ */}
      <div style={{ ...card }}>
        <SectionTitle icon={User} label="내 포트폴리오" color={tokens.green} />
        {userHoldingsDetail.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {userHoldingsDetail.map((h, i) => (
              <HoldingRow key={i} name={h.koreanName} quantity={h.quantity} avgPrice={h.avgPrice}
                profitRate={h.profitRate} currentPrice={h.currentPrice} />
            ))}
          </div>
        ) : (
          <EmptyState icon={DollarSign} message="보유 종목 없음" sub="현금 10,000,000원" />
        )}
      </div>
    </div>
  );
}

/* ─── Holding Row ────────────────────────────────────────────────── */
function HoldingRow({ name, quantity, avgPrice, profitRate, currentPrice, weight }) {
  const isPos = parseFloat(profitRate) >= 0;
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '10px 12px', background: tokens.bgCardAlt,
      borderRadius: 12, border: `1px solid ${tokens.borderLight}`,
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{name}</div>
        <div style={{ fontSize: 11, color: tokens.textTertiary, marginTop: 2 }}>
          {quantity}주 · 평단 {Math.round(avgPrice).toLocaleString()}원
          {currentPrice && ` · 현재 ${currentPrice.toLocaleString()}원`}
          {weight && ` · ${weight}%`}
        </div>
      </div>
      <ProfitBadge value={profitRate} />
    </div>
  );
}

/* ─── Empty State ─────────────────────────────────────────────────── */
function EmptyState({ icon: Icon, message, sub }) {
  return (
    <div style={{ textAlign: 'center', padding: '24px 0' }}>
      <div style={{ width: 48, height: 48, borderRadius: 16, background: tokens.bgCardAlt, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 10px' }}>
        <Icon size={22} color={tokens.textTertiary} />
      </div>
      <p style={{ fontSize: 14, fontWeight: 600, color: tokens.textPrimary, margin: 0 }}>{message}</p>
      {sub && <p style={{ fontSize: 12, color: tokens.textTertiary, margin: '4px 0 0' }}>{sub}</p>}
    </div>
  );
}

/* ─── History Tab ────────────────────────────────────────────────── */
function HistoryTab({ aiTransactions, getAction }) {
  if (!aiTransactions?.length) return (
    <EmptyState icon={Activity} message="거래 내역 없음" sub="AI가 매매를 시작하면 내역이 표시됩니다" />
  );

  const TRIGGER_MAP = {
    AI: { label: '🤖 AI 판단', bg: '#EFF6FF', color: '#1D4ED8' },
    auto_stop_loss: { label: '⚙️ 자동 손절', bg: tokens.riseBg, color: '#B91C1C' },
    auto_take_profit: { label: '🎯 자동 익절', bg: '#F0FDF4', color: '#166534' },
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {aiTransactions.map((tx) => {
        const isBuy = getAction(tx) === 'buy';
        const trigger = tx.triggerType ? TRIGGER_MAP[tx.triggerType] : null;
        return (
          <div key={tx.id} style={{ ...card, marginBottom: 0 }}>
            {/* 헤더 */}
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 36, height: 36, borderRadius: 12, flexShrink: 0,
                  background: isBuy ? '#FEF2F2' : '#EFF6FF',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  {isBuy
                    ? <TrendingUp size={18} color={tokens.rise} />
                    : <TrendingDown size={18} color={tokens.fall} />}
                </div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 700, color: tokens.textPrimary }}>
                    <span style={{ color: isBuy ? tokens.rise : tokens.fall }}>
                      {isBuy ? '매수' : '매도'}
                    </span>
                    {' · '}{tx.name || tx.symbol}
                  </div>
                  <div style={{ fontSize: 11, color: tokens.textTertiary, marginTop: 2 }}>
                    {new Date(tx.date).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>
              </div>
              {tx.profitRate != null && (
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <ProfitBadge value={tx.profitRate} />
                  {tx.holdDays && <div style={{ fontSize: 11, color: tokens.textTertiary, marginTop: 3 }}>{tx.holdDays}일 보유</div>}
                </div>
              )}
            </div>

            {/* 매수 가격 정보 */}
            {isBuy && tx.price && (
              <div style={{
                display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 10,
                background: tokens.bgCardAlt, borderRadius: 10, padding: '10px 12px',
              }}>
                {[
                  { label: '📍 매수가', value: tx.price, color: tokens.textPrimary },
                  { label: '🎯 목표가', value: tx.takeProfit, color: tokens.greenDark },
                  { label: '⛔ 손절가', value: tx.stopLoss, color: tokens.rise },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ textAlign: 'center' }}>
                    <div style={{ fontSize: 10, color: tokens.textTertiary, marginBottom: 3 }}>{label}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: value ? color : tokens.textTertiary }}>
                      {value ? value.toLocaleString() : '-'}원
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 매도 가격 */}
            {!isBuy && tx.price && (
              <div style={{
                background: tokens.bgCardAlt, borderRadius: 10, padding: '8px 12px',
                marginBottom: 10, fontSize: 12, color: tokens.textSecondary,
              }}>
                {tx.price.toLocaleString()}원 · {tx.quantity}주
                {tx.totalAmount && ` · 총 ${tx.totalAmount.toLocaleString()}원`}
              </div>
            )}

            {/* AI 분석 */}
            {(tx.aiReasons?.length > 0 || tx.aiAnalysis?.reasons?.length > 0) && (
              <div style={{ borderTop: `1px solid ${tokens.borderLight}`, paddingTop: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <Bot size={13} color={tokens.blue} />
                    <span style={{ fontSize: 12, fontWeight: 700, color: tokens.textPrimary }}>
                      {isBuy ? 'AI 매수 근거' : 'AI 매도 이유'}
                    </span>
                  </div>
                  {(tx.aiScore || tx.aiAnalysis?.score) && (
                    <span style={{
                      fontSize: 11, fontWeight: 700,
                      background: tokens.blueLight, color: tokens.blue,
                      padding: '2px 8px', borderRadius: 6,
                    }}>
                      {tx.aiScore || tx.aiAnalysis.score}/100
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {(tx.aiReasons || tx.aiAnalysis?.reasons || []).map((r, i) => (
                    <div key={i} style={{ display: 'flex', gap: 6, fontSize: 12, color: tokens.textSecondary, lineHeight: 1.5 }}>
                      <span style={{ color: tokens.blue, flexShrink: 0, fontWeight: 700 }}>·</span>
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* triggerType 배지 */}
            {trigger && (
              <div style={{ marginTop: 10 }}>
                <span style={{
                  fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 8,
                  background: trigger.bg, color: trigger.color,
                }}>
                  {trigger.label}
                </span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

/* ─── Analysis Tab ───────────────────────────────────────────────── */
function AnalysisTab({ aiStats, userStats }) {
  const hasData = (aiStats?.totalTrades > 0) || (userStats?.totalTrades > 0);
  if (!hasData) return (
    <EmptyState icon={Percent} message="분석 데이터 부족" sub="매매 데이터가 쌓이면 비교 분석이 표시됩니다" />
  );

  const rows = [
    { label: '총 거래 횟수', ai: `${aiStats?.totalTrades || 0}회`, user: `${userStats?.totalTrades || 0}회` },
    { label: '승률', ai: `${aiStats?.winRate || 0}%`, user: `${userStats?.winRate || 0}%` },
    {
      label: '평균 수익률',
      ai: `${aiStats?.avgProfit >= 0 ? '+' : ''}${aiStats?.avgProfit || 0}%`,
      user: `${userStats?.avgProfit >= 0 ? '+' : ''}${userStats?.avgProfit || 0}%`,
    },
    ...(aiStats?.avgHoldDays !== undefined
      ? [{ label: '평균 보유 기간', ai: `${aiStats.avgHoldDays}일`, user: '-' }]
      : []),
  ];

  return (
    <div>
      <div style={{ ...card }}>
        <SectionTitle icon={Percent} label="매매 성과 비교" />
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {rows.map(({ label, ai, user }) => (
            <div key={label} style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              padding: '10px 12px', background: tokens.bgCardAlt, borderRadius: 10,
            }}>
              <span style={{ fontSize: 13, color: tokens.textSecondary, fontWeight: 500 }}>{label}</span>
              <div style={{ display: 'flex', gap: 12 }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: tokens.blue }}>AI {ai}</span>
                <span style={{ fontSize: 13, fontWeight: 700, color: tokens.green }}>나 {user}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}