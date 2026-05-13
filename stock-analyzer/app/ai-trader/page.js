'use client';

import { useState, useEffect, useRef } from 'react';
import { db, auth } from '@/lib/firebase';
import {
  collection, query, where, onSnapshot,
  getDocs, limit, doc,
} from 'firebase/firestore';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Bot, User, Activity,
  DollarSign, Percent, Check, Clock, Play,
  Loader2, Info,
} from 'lucide-react';
import AILoadingModal from '@/components/AILoadingModal';

/* ─── Design Tokens ──────────────────────────────────────────────── */
const tokens = {
  bgPage: '#F5F6FA',
  bgCard: '#FFFFFF',
  bgCardAlt: '#F9FAFB',
  blue: '#2563EB',
  blueMid: '#3B82F6',
  blueLight: '#EFF6FF',
  indigo: '#4F46E5',
  rise: '#EF4444',   // 한국식: 상승=빨강
  riseBg: '#FEF2F2',
  fall: '#2563EB',   // 한국식: 하락=파랑
  fallBg: '#EFF6FF',
  green: '#10B981',
  greenDark: '#059669',
  textPrimary: '#111827',
  textSecondary: '#6B7280',
  textTertiary: '#9CA3AF',
  border: '#E5E7EB',
  borderLight: '#F3F4F6',
  shadowSm: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)',
  shadowMd: '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
};

const card = {
  background: tokens.bgCard,
  borderRadius: 16,
  border: `1px solid ${tokens.border}`,
  boxShadow: tokens.shadowSm,
  padding: '16px',
  marginBottom: 12,
};

/* ═══════════════════════════════════════════════════════════════════
   📊 FIX #1 — 차트 시계열 빌더
   - historyData(Firestore 일별 스냅샷)가 충분하면 그대로 사용
   - 없으면 transactions에서 누적 수익률을 재구성
   - 항상 period에 맞는 날짜 라벨 N개를 생성
   ═══════════════════════════════════════════════════════════════════ */
function fmtDateLabel(date) {
  return date.toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' });
}

function buildChartSeries(historyData, transactions, period, currentAiRet, currentUserRet) {
  const now = new Date();
  const periodDays = { day: 7, week: 28, month: 90 }[period] ?? 28;
  const startMs = now.getTime() - periodDays * 86400000;

  /* 1) 실제 히스토리가 기간 안에 2개 이상이면 그대로 사용 */
  const inRange = (historyData || []).filter(h => new Date(h.date).getTime() >= startMs);
  if (inRange.length >= 2) {
    const pts = inRange.map(h => ({
      date: fmtDateLabel(new Date(h.date)),
      ai:   parseFloat(h.returnRate ?? 0),
      user: parseFloat(h.userReturnRate ?? 0),
    }));
    pts.push({ date: '현재', ai: parseFloat(currentAiRet), user: parseFloat(currentUserRet) });
    return pts;
  }

  /* 2) 히스토리 부족 → transactions에서 누적 수익 재구성 */
  const numPts = { day: 7, week: 8, month: 10 }[period] ?? 8;
  const stepMs = (now.getTime() - startMs) / (numPts - 1);

  const sellTx = (transactions || [])
    .filter(t => (t.action || t.type) === 'sell' && t.profitRate !== undefined)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  const pts = [];
  for (let i = 0; i < numPts; i++) {
    const ptMs  = startMs + i * stepMs;
    const isLast = i === numPts - 1;

    if (isLast) {
      pts.push({ date: '현재', ai: parseFloat(currentAiRet), user: parseFloat(currentUserRet) });
      continue;
    }

    const sellsBefore = sellTx.filter(t => new Date(t.date).getTime() <= ptMs);
    let cumulativeAi = 0;
    if (sellsBefore.length > 0) {
      const profit = sellsBefore.reduce((sum, t) => {
        const amount = t.totalAmount || (parseFloat(t.price || 0) * parseFloat(t.quantity || 0));
        return sum + (amount * parseFloat(t.profitRate) / 100);
      }, 0);
      cumulativeAi = parseFloat(((profit / 10_000_000) * 100).toFixed(2));
    }

    pts.push({ date: fmtDateLabel(new Date(ptMs)), ai: cumulativeAi, user: 0 });
  }
  return pts;
}

/* ═══════════════════════════════════════════════════════════════════
   💰 FIX #3 — AI 보유 종목 실시간 가격 조회 & 수익률 재계산
   Firestore 저장값은 매수 시점 캐시이므로 /api/naver-stock 재조회
   ═══════════════════════════════════════════════════════════════════ */
async function fetchLivePrices(symbols) {
  const prices = {};
  await Promise.all(symbols.map(async (sym) => {
    try {
      const data = await (await fetch(`/api/stock?symbol=${sym}&timeframe=daily`)).json();
      if (data.currentPrice) {
        const p = Number(String(data.currentPrice).replace(/,/g, ''));
        if (!isNaN(p) && p > 0) prices[sym] = p;
      }
    } catch { /* ignore */ }
  }));
  return prices;
}

async function enrichAIHoldings(portfolio) {
  if (!portfolio?.holdings?.length) {
    return { holdings: [], liveReturn: '0.00', totalAsset: portfolio?.cash ?? 10_000_000 };
  }
  const symbols = [...new Set(portfolio.holdings.map(h => h.symbol))];
  const prices  = await fetchLivePrices(symbols);

  const enriched = portfolio.holdings.map(h => {
    const cp         = prices[h.symbol] ?? h.currentPrice ?? h.avgPrice;
    const profitRate = parseFloat((((cp - h.avgPrice) / h.avgPrice) * 100).toFixed(2));
    return { ...h, currentPrice: cp, profitRate };
  });

  const stockVal   = enriched.reduce((s, h) => s + h.currentPrice * h.quantity, 0);
  const totalAsset = (portfolio.cash ?? 0) + stockVal;
  const liveReturn = ((totalAsset - 10_000_000) / 10_000_000 * 100).toFixed(2);
  return { holdings: enriched, liveReturn, totalAsset };
}

/* ─── Profit Badge ───────────────────────────────────────────────── */
function ProfitBadge({ value, size = 'md' }) {
  const isPos = parseFloat(value) >= 0;
  const fs = size === 'sm' ? 12 : size === 'lg' ? 20 : 14;
  return (
    <span style={{
      fontSize: fs, fontWeight: 700,
      color: isPos ? tokens.rise : tokens.fall,
      background: isPos ? tokens.riseBg : tokens.fallBg,
      padding: '3px 8px', borderRadius: 8, letterSpacing: '-0.3px',
    }}>
      {isPos ? '+' : ''}{parseFloat(value).toFixed(2)}%
    </span>
  );
}

function SectionTitle({ icon: Icon, label, color = tokens.blue }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
      <div style={{ width: 32, height: 32, borderRadius: 10, background: `${color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={16} color={color} />
      </div>
      <span style={{ fontSize: 15, fontWeight: 700, color: tokens.textPrimary }}>{label}</span>
    </div>
  );
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: tokens.bgCard, border: `1px solid ${tokens.border}`, borderRadius: 14, padding: '12px 16px', boxShadow: '0 8px 24px rgba(0,0,0,0.12)', fontSize: 13, minWidth: 160 }}>
      <p style={{ margin: 0, marginBottom: 10, color: tokens.textSecondary, fontSize: 11, fontWeight: 600, borderBottom: `1px solid ${tokens.borderLight}`, paddingBottom: 6 }}>{label}</p>
      {payload.map((p, i) => {
        const val = parseFloat(p.value);
        const isPos = val >= 0;
        return (
          <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 14, marginBottom: i < payload.length - 1 ? 6 : 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: p.color, display: 'inline-block', flexShrink: 0 }} />
              <span style={{ color: tokens.textSecondary, fontSize: 12 }}>{p.name}</span>
            </div>
            <span style={{ fontWeight: 800, fontSize: 14, color: isPos ? tokens.rise : tokens.fall, letterSpacing: '-0.3px' }}>
              {isPos ? '+' : ''}{val.toFixed(2)}%
            </span>
          </div>
        );
      })}
    </div>
  );
}

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

/* ═══════════════════════════════════════════════════════════════════
   🏠 Main Component
   ═══════════════════════════════════════════════════════════════════ */
export default function AITraderPage() {
  const [activeTab,         setActiveTab]         = useState('dashboard');
  const [chartPeriod,       setChartPeriod]       = useState('week');
  const [aiPortfolio,       setAiPortfolio]       = useState(null);
  const [userHoldingsDetail,setUserHoldingsDetail] = useState([]);
  const [aiTransactions,    setAiTransactions]    = useState([]);
  const [userTransactions,  setUserTransactions]  = useState([]);
  const [aiStats,           setAiStats]           = useState(null);
  const [userStats,         setUserStats]         = useState(null);
  const [historyData,       setHistoryData]       = useState([]);
  const [performanceData,   setPerformanceData]   = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [executing,         setExecuting]         = useState(false);

  /* FIX #3 states */
  const [liveAiReturn,   setLiveAiReturn]   = useState('0.00');
  const [liveAiHoldings, setLiveAiHoldings] = useState([]);
  const [liveAiAsset,    setLiveAiAsset]    = useState(10_000_000);
  const enrichingRef = useRef(false);

  useEffect(() => {
    const userId = auth.currentUser?.uid;
    if (!userId) { setLoading(false); return; }

    /* aiTrader doc */
    const unsubAI = onSnapshot(doc(db, 'aiTrader', userId), async (snap) => {
      const data = snap.exists() ? snap.data() : null;
      setAiPortfolio(data);

      /* FIX #3: 실시간 가격 조회 */
      if (data?.holdings?.length && !enrichingRef.current) {
        enrichingRef.current = true;
        try {
          const { holdings, liveReturn, totalAsset } = await enrichAIHoldings(data);
          setLiveAiHoldings(holdings);
          setLiveAiReturn(liveReturn);
          setLiveAiAsset(totalAsset);
        } finally {
          enrichingRef.current = false;
        }
      } else if (!data?.holdings?.length) {
        const cash = data?.cash ?? 10_000_000;
        setLiveAiHoldings([]);
        setLiveAiAsset(cash);
        setLiveAiReturn(((cash - 10_000_000) / 10_000_000 * 100).toFixed(2));
      }
    });

    /* user holdings */
    const unsubHoldings = onSnapshot(
      query(collection(db, 'holdings'), where('userId', '==', userId)),
      async (snap) => {
        const holdings = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        if (holdings.length) await enrichUserHoldings(holdings);
        else setUserHoldingsDetail([]);
      }
    );

    /* ═══════════════════════════════════════════════════════════
       FIX #2: 'aiTransactions' + 'aiTrades' 두 컬렉션 병합 구독
       Firestore 컬렉션명이 어느 쪽이든 커버한다.
       ═══════════════════════════════════════════════════════════ */
    const txMap = new Map();
    const mergeTx = (newTxs) => {
      newTxs.forEach(t => txMap.set(t.id, t));
      const merged = [...txMap.values()].sort((a, b) => new Date(b.date) - new Date(a.date));
      setAiTransactions(merged);
      calculateAIStats(merged);
    };

    const unsubAITx1 = onSnapshot(
      query(collection(db, 'aiTransactions'), where('userId', '==', userId)),
      (snap) => mergeTx(snap.docs.map(d => ({ id: d.id, ...d.data() })))
    );

    /* aiPortfolioHistory */
    const unsubHistory = onSnapshot(
      query(collection(db, 'aiPortfolioHistory'), where('userId', '==', userId)),
      (snap) => {
        const h = snap.docs.map(d => d.data()).sort((a, b) => new Date(a.date) - new Date(b.date));
        setHistoryData(h);
      }
    );

    /* user trades (1회 fetch) */
    (async () => {
      const snap = await getDocs(query(collection(db, 'trades'), where('userId', '==', userId), limit(50)));
      const txs  = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.date) - new Date(a.date));
      setUserTransactions(txs);
      calculateUserStats(txs);
      setLoading(false);
    })();

    return () => { unsubAI(); unsubHoldings(); unsubAITx1(); unsubHistory(); };
  }, []);

  const enrichUserHoldings = async (holdings) => {
    const symbols = [...new Set(holdings.map(h => h.symbol))];
    const prices  = await fetchLivePrices(symbols);
    const names   = {};
    await Promise.all(symbols.map(async (sym) => {
      try {
        const data = await (await fetch(`/api/naver-stock?symbol=${sym}`)).json();
        if (data.koreanName) names[sym] = data.koreanName;
      } catch { /* ignore */ }
    }));
    setUserHoldingsDetail(
      holdings.map(h => {
        const cp   = prices[h.symbol] || h.avgPrice;
        const ea   = cp * h.quantity;
        const prof = ea - h.totalInvested;
        const avg  = h.totalInvested / h.quantity;
        return {
          ...h, currentPrice: cp, evalAmt: ea, profit: prof,
          profitRate: parseFloat(((prof / h.totalInvested) * 100).toFixed(2)),
          koreanName: names[h.symbol] || h.name,
          avgPrice: avg,
        };
      }).sort((a, b) => b.evalAmt - a.evalAmt)
    );
  };

  const getAction = (tx) => tx.action || tx.type;

  const calculateAIStats = (txs) => {
    if (!txs?.length) { setAiStats({ totalTrades: 0, winRate: 0, avgProfit: 0, avgHoldDays: 0 }); return; }
    const buyTxs   = txs.filter(t => getAction(t) === 'buy');
    const sellTxs  = txs.filter(t => getAction(t) === 'sell');
    const withRate  = sellTxs.filter(t => t.profitRate !== undefined);
    const wins      = withRate.filter(t => parseFloat(t.profitRate) > 0).length;
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
      winRate:     withRate.length ? (wins / withRate.length * 100).toFixed(0) : 0,
      avgProfit:   withRate.length ? (withRate.reduce((s, t) => s + parseFloat(t.profitRate), 0) / withRate.length).toFixed(1) : 0,
      avgHoldDays: cnt ? Math.round(totalDays / cnt) : 0,
    });
  };

  const calculateUserStats = (txs) => {
    if (!txs?.length) { setUserStats({ totalTrades: 0, winRate: 0, avgProfit: 0 }); return; }
    const sells = txs.filter(t => t.type === 'sell' && t.profitRate !== undefined);
    const wins  = sells.filter(t => parseFloat(t.profitRate) > 0).length;
    setUserStats({
      totalTrades: sells.length,
      winRate:     sells.length ? (wins / sells.length * 100).toFixed(0) : 0,
      avgProfit:   sells.length ? (sells.reduce((s, t) => s + parseFloat(t.profitRate), 0) / sells.length).toFixed(1) : 0,
    });
  };

  /* FIX #1 + #3 연동: 차트 데이터 재계산 */
  useEffect(() => {
    const userVal = userHoldingsDetail.reduce((s, h) => s + h.evalAmt, 0);
    const userRet = userVal > 0 ? ((userVal - 10_000_000) / 10_000_000 * 100).toFixed(2) : '0.00';
    const series  = buildChartSeries(historyData, aiTransactions, chartPeriod, liveAiReturn, userRet);
    setPerformanceData(series);
  }, [historyData, aiTransactions, chartPeriod, liveAiReturn, userHoldingsDetail]);

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
    { id: 'history',   label: '매매내역',   icon: TrendingUp },
    { id: 'analysis',  label: '비교분석',   icon: Percent },
  ];

  return (
    <div style={{ background: tokens.bgPage, minHeight: '100vh', paddingBottom: 88 }}>
      <style>{`
        @keyframes spin   { to { transform: rotate(360deg); } }
        @keyframes fadeIn { from { opacity:0; transform:translateY(6px); } to { opacity:1; transform:translateY(0); } }
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { width: 0; }
      `}</style>
      <AILoadingModal isOpen={executing} />

      {/* ── Header ── */}
      <div style={{ background: `linear-gradient(135deg, ${tokens.blue} 0%, ${tokens.indigo} 100%)`, padding: '20px 16px 24px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position:'absolute', top:-30, right:-30, width:120, height:120, borderRadius:'50%', background:'rgba(255,255,255,0.06)' }} />
        <div style={{ position:'absolute', bottom:-20, right:40, width:80, height:80, borderRadius:'50%', background:'rgba(255,255,255,0.04)' }} />
        <div style={{ display:'flex', alignItems:'center', gap:12, position:'relative' }}>
          <div style={{ width:44, height:44, borderRadius:14, background:'rgba(255,255,255,0.2)', backdropFilter:'blur(8px)', display:'flex', alignItems:'center', justifyContent:'center', border:'1px solid rgba(255,255,255,0.3)' }}>
            <Bot size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize:20, fontWeight:800, color:'#fff', margin:0, letterSpacing:'-0.5px' }}>AI 트레이더</h1>
            <p style={{ fontSize:12, color:'rgba(255,255,255,0.7)', margin:0, marginTop:2 }}>인공지능 자동 매매 시스템</p>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ background:tokens.bgCard, position:'sticky', top:0, zIndex:50, borderBottom:`1px solid ${tokens.border}`, display:'flex' }}>
        {TABS.map(({ id, label, icon: Icon }) => {
          const active = activeTab === id;
          return (
            <button key={id} onClick={() => setActiveTab(id)} style={{
              flex:1, padding:'12px 4px', border:'none', background:'none',
              cursor:'pointer', display:'flex', flexDirection:'column', alignItems:'center', gap:3,
              color: active ? tokens.blue : tokens.textTertiary,
              borderBottom: active ? `2px solid ${tokens.blue}` : '2px solid transparent',
              transition:'all 0.15s ease',
            }}>
              <Icon size={17} />
              <span style={{ fontSize:11, fontWeight: active ? 700 : 500 }}>{label}</span>
            </button>
          );
        })}
      </div>

      {/* ── Content ── */}
      <div style={{ padding:'14px 14px 0', animation:'fadeIn 0.2s ease' }}>
        {activeTab === 'dashboard' && (
          <DashboardTab
            aiPortfolio={aiPortfolio}
            liveAiHoldings={liveAiHoldings}
            liveAiReturn={liveAiReturn}
            liveAiAsset={liveAiAsset}
            userHoldingsDetail={userHoldingsDetail}
            aiStats={aiStats} userStats={userStats}
            performanceData={performanceData}
            chartPeriod={chartPeriod} setChartPeriod={setChartPeriod}
            executing={executing} handleManualStart={handleManualStart}
          />
        )}
        {activeTab === 'history' && (
          <HistoryTab
            aiTransactions={aiTransactions}
            aiPortfolio={aiPortfolio}
            liveAiHoldings={liveAiHoldings}
            getAction={getAction}
          />
        )}
        {activeTab === 'analysis' && <AnalysisTab aiStats={aiStats} userStats={userStats} />}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   📊 Dashboard Tab
   ═══════════════════════════════════════════════════════════════════ */
function DashboardTab({
  aiPortfolio, liveAiHoldings, liveAiReturn, liveAiAsset,
  userHoldingsDetail, aiStats, userStats,
  performanceData, chartPeriod, setChartPeriod,
  executing, handleManualStart,
}) {
  const aiReturnVal   = parseFloat(liveAiReturn);
  const userVal       = userHoldingsDetail.reduce((s, h) => s + h.evalAmt, 0);
  const userReturn    = userVal > 0 ? ((userVal - 10_000_000) / 10_000_000 * 100).toFixed(1) : '0.0';
  const userReturnVal = parseFloat(userReturn);

  /* 한국식: 상승=빨강, 하락=파랑 */
  const aiLineColor   = aiReturnVal   >= 0 ? tokens.rise : tokens.fall;
  const userLineColor = userReturnVal >= 0 ? tokens.rise : tokens.fall;

  /* Y축 동적 도메인 */
  const allVals = performanceData.flatMap(d => [
    typeof d.ai   === 'number' ? d.ai   : 0,
    typeof d.user === 'number' ? d.user : 0,
  ]);
  const minV = Math.min(...allVals, 0);
  const maxV = Math.max(...allVals, 0);
  const pad  = Math.max(Math.abs(maxV - minV) * 0.2, 3);
  const yDomain = [parseFloat((minV - pad).toFixed(1)), parseFloat((maxV + pad).toFixed(1))];

  const xInterval = performanceData.length <= 8 ? 0
    : performanceData.length <= 15 ? 1
    : Math.floor(performanceData.length / 6);

  const isFlatLine = performanceData.every(d => d.ai === 0 && d.user === 0);

  /* AI 포트폴리오 표시용: live 가격 반영된 목록 우선 */
  const aiDisplayHoldings = liveAiHoldings.length > 0 ? liveAiHoldings : (aiPortfolio?.holdings ?? []);

  return (
    <div>
      {/* ─ 차트 카드 ─ */}
      <div style={{ ...card, padding:'16px 12px 14px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
          <span style={{ fontSize:14, fontWeight:700, color:tokens.textPrimary }}>누적 수익률 추이</span>
          <div style={{ display:'flex', gap:4 }}>
            {[{ id:'day', label:'일' }, { id:'week', label:'주' }, { id:'month', label:'월' }].map(({ id, label }) => (
              <button key={id} onClick={() => setChartPeriod(id)} style={{
                padding:'5px 12px', borderRadius:8, border:'none',
                fontSize:12, fontWeight:600, cursor:'pointer',
                background: chartPeriod === id ? tokens.blue : tokens.bgCardAlt,
                color: chartPeriod === id ? '#fff' : tokens.textSecondary,
                transition:'all 0.15s',
                boxShadow: chartPeriod === id ? `0 2px 8px ${tokens.blue}40` : 'none',
              }}>{label}</button>
            ))}
          </div>
        </div>

        <ResponsiveContainer width="100%" height={240}>
          <AreaChart data={performanceData} margin={{ top:10, right:24, left:-10, bottom:4 }}>
            <defs>
              <linearGradient id="gradAI" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={aiLineColor}   stopOpacity={0.20} />
                <stop offset="80%"  stopColor={aiLineColor}   stopOpacity={0.03} />
                <stop offset="100%" stopColor={aiLineColor}   stopOpacity={0} />
              </linearGradient>
              <linearGradient id="gradUser" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%"   stopColor={userLineColor} stopOpacity={0.16} />
                <stop offset="80%"  stopColor={userLineColor} stopOpacity={0.02} />
                <stop offset="100%" stopColor={userLineColor} stopOpacity={0} />
              </linearGradient>
              <filter id="shadowAI">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={aiLineColor}   floodOpacity="0.28" />
              </filter>
              <filter id="shadowUser">
                <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor={userLineColor} floodOpacity="0.28" />
              </filter>
            </defs>

            <CartesianGrid strokeDasharray="3 3" stroke={tokens.borderLight} vertical={false} />
            {/* 0% 기준선 */}
            <ReferenceLine y={0} stroke="#94A3B8" strokeWidth={1.5} />

            <XAxis dataKey="date" tick={{ fontSize:10, fill:tokens.textTertiary }} axisLine={false} tickLine={false} interval={xInterval} />
            <YAxis domain={yDomain} tick={{ fontSize:10, fill:tokens.textTertiary }} axisLine={false} tickLine={false} tickFormatter={v => `${v}%`} />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke:tokens.border, strokeWidth:1, strokeDasharray:'4 3' }} />

            <Area type="monotone" dataKey="user" stroke={userLineColor} strokeWidth={2.5}
              fill="url(#gradUser)" name="👤 나" dot={false}
              activeDot={{ r:5, fill:userLineColor, stroke:'#fff', strokeWidth:2, filter:'url(#shadowUser)' }} />
            <Area type="monotone" dataKey="ai" stroke={aiLineColor} strokeWidth={2.5}
              fill="url(#gradAI)" name="🤖 AI" dot={false}
              activeDot={{ r:5, fill:aiLineColor, stroke:'#fff', strokeWidth:2, filter:'url(#shadowAI)' }} />
          </AreaChart>
        </ResponsiveContainer>

        {/* 범례 */}
        <div style={{ display:'flex', justifyContent:'center', gap:18, marginTop:10 }}>
          {[{ color:aiLineColor, label:'🤖 AI' }, { color:userLineColor, label:'👤 나' }].map(({ color, label }) => (
            <div key={label} style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:tokens.textSecondary }}>
              <div style={{ width:22, height:3, borderRadius:2, background:color, boxShadow:`0 1px 4px ${color}60` }} />
              {label}
            </div>
          ))}
        </div>

        {isFlatLine && (
          <div style={{ display:'flex', alignItems:'center', gap:6, marginTop:10, padding:'7px 10px', background:tokens.blueLight, borderRadius:8, border:'1px solid #BFDBFE' }}>
            <Info size={12} color="#2563EB" style={{ flexShrink:0 }} />
            <span style={{ fontSize:11, color:'#1D4ED8', lineHeight:1.4 }}>
              매일 15시에 수익률이 기록됩니다. 며칠 후 그래프를 확인하세요!
            </span>
          </div>
        )}
      </div>

      {/* ─ 수익률 카드 ─ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:12 }}>
        {/* AI */}
        <div style={{
          background: aiReturnVal >= 0
            ? 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
            : 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
          borderRadius:16, padding:'14px 12px',
          boxShadow: aiReturnVal >= 0 ? '0 4px 14px rgba(239,68,68,0.30)' : '0 4px 14px rgba(37,99,235,0.30)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
            <div style={{ width:26, height:26, borderRadius:8, background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <Bot size={14} color="#fff" />
            </div>
            <span style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.85)' }}>AI</span>
          </div>
          <div style={{ fontSize:26, fontWeight:900, color:'#fff', letterSpacing:'-1px', lineHeight:1 }}>
            {aiReturnVal >= 0 ? '+' : ''}{parseFloat(liveAiReturn).toFixed(1)}%
          </div>
          {aiStats?.totalTrades > 0 ? (
            <div style={{ marginTop:8, fontSize:11, color:'rgba(255,255,255,0.75)', lineHeight:1.6 }}>
              <div>승률 {aiStats.winRate}% · 평균 {aiStats.avgProfit >= 0 ? '+' : ''}{aiStats.avgProfit}%</div>
              <div>보유 {aiStats.avgHoldDays}일 · {aiStats.totalTrades}회</div>
            </div>
          ) : (
            <div style={{ marginTop:6, fontSize:11, color:'rgba(255,255,255,0.55)' }}>
              {aiDisplayHoldings.length > 0 ? `보유 ${aiDisplayHoldings.length}종목` : '거래 내역 없음'}
            </div>
          )}
        </div>

        {/* 나 */}
        <div style={{
          background: userReturnVal >= 0
            ? 'linear-gradient(135deg, #EF4444 0%, #DC2626 100%)'
            : 'linear-gradient(135deg, #2563EB 0%, #1D4ED8 100%)',
          borderRadius:16, padding:'14px 12px',
          boxShadow: userReturnVal >= 0 ? '0 4px 14px rgba(239,68,68,0.30)' : '0 4px 14px rgba(37,99,235,0.30)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
            <div style={{ width:26, height:26, borderRadius:8, background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
              <User size={14} color="#fff" />
            </div>
            <span style={{ fontSize:12, fontWeight:600, color:'rgba(255,255,255,0.85)' }}>나</span>
          </div>
          <div style={{ fontSize:26, fontWeight:900, color:'#fff', letterSpacing:'-1px', lineHeight:1 }}>
            {userReturnVal >= 0 ? '+' : ''}{userReturn}%
          </div>
          {userStats?.totalTrades > 0 ? (
            <div style={{ marginTop:8, fontSize:11, color:'rgba(255,255,255,0.75)', lineHeight:1.6 }}>
              <div>승률 {userStats.winRate}% · 평균 {userStats.avgProfit >= 0 ? '+' : ''}{userStats.avgProfit}%</div>
              <div>{userStats.totalTrades}회</div>
            </div>
          ) : <div style={{ marginTop:6, fontSize:11, color:'rgba(255,255,255,0.55)' }}>거래 내역 없음</div>}
        </div>
      </div>

      {/* ─ AI 상태 + 실행 버튼 ─ */}
      <div style={{ ...card, background: aiPortfolio?.status?.active ? '#F0FDF4' : tokens.bgCard, border:`1px solid ${aiPortfolio?.status?.active ? '#BBF7D0' : tokens.border}` }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
          <div style={{ width:36, height:36, borderRadius:12, background: aiPortfolio?.status?.active ? '#DCFCE7' : tokens.bgCardAlt, display:'flex', alignItems:'center', justifyContent:'center' }}>
            {aiPortfolio?.status?.active ? <Check size={18} color={tokens.greenDark} /> : <Clock size={18} color={tokens.textSecondary} />}
          </div>
          <div>
            <div style={{ fontSize:14, fontWeight:700, color: aiPortfolio?.status?.active ? '#166534' : tokens.textPrimary }}>
              {aiPortfolio?.status?.active ? 'AI 트레이더 활성' : 'AI 트레이더 대기 중'}
            </div>
            <div style={{ fontSize:12, color: aiPortfolio?.status?.active ? '#16A34A' : tokens.textSecondary, marginTop:1 }}>
              {aiPortfolio?.status?.active
                ? `보유 ${aiDisplayHoldings.length}종목`
                : aiPortfolio?.status?.pauseReason || '매수 기회를 탐색 중'}
            </div>
          </div>
        </div>
        <button onClick={handleManualStart} disabled={executing} style={{
          width:'100%', padding:'13px 0', borderRadius:12, border:'none',
          fontSize:14, fontWeight:700, cursor: executing ? 'not-allowed' : 'pointer',
          background: executing ? '#CBD5E1' : `linear-gradient(135deg, ${tokens.blue} 0%, ${tokens.indigo} 100%)`,
          color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          boxShadow: executing ? 'none' : `0 4px 12px ${tokens.blue}40`,
          transition:'all 0.15s', letterSpacing:'-0.2px',
        }}>
          {executing
            ? <><Loader2 size={16} style={{ animation:'spin 1s linear infinite' }} /> 분석 중...</>
            : <><Play size={16} /> {aiPortfolio?.status?.active ? 'AI 재분석 시작' : 'AI 분석 시작'}</>}
        </button>
      </div>

      {/* ─ AI 포트폴리오 (FIX #3: live 가격 반영) ─ */}
      <div style={{ ...card }}>
        <SectionTitle icon={Bot} label="AI 포트폴리오" />
        <div style={{ background:tokens.blueLight, borderRadius:12, padding:'10px 14px', marginBottom:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontSize:12, color:'#1E40AF' }}>총 자산</span>
            <span style={{ fontSize:15, fontWeight:800, color:'#1E3A8A', letterSpacing:'-0.5px' }}>
              {Math.round(liveAiAsset).toLocaleString()}원
            </span>
          </div>
          <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
            <span style={{ fontSize:11, color:'#3B82F6' }}>현금</span>
            <span style={{ fontSize:11, color:'#1D4ED8', fontWeight:600 }}>
              {(aiPortfolio?.cash ?? 10_000_000).toLocaleString()}원
            </span>
          </div>
        </div>
        {aiDisplayHoldings.length > 0 ? (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {aiDisplayHoldings.map((h, i) => (
              <HoldingRow key={i} name={h.name} quantity={h.quantity} avgPrice={h.avgPrice}
                profitRate={h.profitRate ?? 0} currentPrice={h.currentPrice} weight={h.weight} />
            ))}
          </div>
        ) : (
          <EmptyState icon={DollarSign} message="보유 종목 없음" sub={`현금 ${(aiPortfolio?.cash ?? 10_000_000).toLocaleString()}원`} />
        )}
      </div>

      {/* ─ 내 포트폴리오 ─ */}
      <div style={{ ...card }}>
        <SectionTitle icon={User} label="내 포트폴리오" color={tokens.green} />
        {userHoldingsDetail.length > 0 ? (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
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
  return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', background:tokens.bgCardAlt, borderRadius:12, border:`1px solid ${tokens.borderLight}` }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:14, fontWeight:700, color:tokens.textPrimary, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{name}</div>
        <div style={{ fontSize:11, color:tokens.textTertiary, marginTop:2 }}>
          {quantity}주 · 평단 {Math.round(avgPrice).toLocaleString()}원
          {currentPrice && ` · 현재 ${Math.round(currentPrice).toLocaleString()}원`}
          {weight && ` · ${weight}%`}
        </div>
      </div>
      <ProfitBadge value={profitRate} />
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   📋 History Tab
   FIX #2: aiTransactions가 비어 있을 때
           aiPortfolio.holdings 기반 합성 매수 엔트리 fallback 표시
   ═══════════════════════════════════════════════════════════════════ */
function HistoryTab({ aiTransactions, aiPortfolio, liveAiHoldings, getAction }) {
  const hasRealTx      = aiTransactions?.length > 0;
  const activeHoldings = liveAiHoldings?.length > 0 ? liveAiHoldings : (aiPortfolio?.holdings ?? []);
  const hasHoldings    = activeHoldings.length > 0;

  if (!hasRealTx && !hasHoldings) {
    return <EmptyState icon={Activity} message="거래 내역 없음" sub="AI가 매매를 시작하면 내역이 표시됩니다" />;
  }

  /* aiTransactions가 없을 때 holdings → 합성 buy 엔트리 */
  const syntheticBuyTx = !hasRealTx
    ? activeHoldings.map((h, i) => ({
        id:         `synth_${i}`,
        action:     'buy',
        symbol:     h.symbol,
        name:       h.name,
        price:      h.avgPrice,
        quantity:   h.quantity,
        date:       h.buyDate || h.createdAt || new Date().toISOString(),
        takeProfit: h.takeProfit,
        stopLoss:   h.stopLoss,
        aiReasons:  h.aiReasons || h.reasons,
        aiScore:    h.aiScore,
        aiAnalysis: h.aiAnalysis,
        _synthetic: true,
      }))
    : [];

  const displayTx = hasRealTx ? aiTransactions : syntheticBuyTx;

  const TRIGGER_MAP = {
    AI:               { label:'🤖 AI 판단',   bg:'#EFF6FF', color:'#1D4ED8' },
    auto_stop_loss:   { label:'⚙️ 자동 손절', bg:tokens.riseBg, color:'#B91C1C' },
    auto_take_profit: { label:'🎯 자동 익절', bg:'#F0FDF4', color:'#166534' },
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
      {/* 합성 데이터 안내 배너 */}
      {!hasRealTx && hasHoldings && (
        <div style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 12px', background:'#FFF7ED', borderRadius:10, border:'1px solid #FED7AA' }}>
          <Info size={13} color="#C2410C" style={{ flexShrink:0 }} />
          <span style={{ fontSize:11, color:'#9A3412', lineHeight:1.45 }}>
            매매 기록이 동기화되지 않아 현재 보유 종목 기준으로 표시합니다.
          </span>
        </div>
      )}

      {displayTx.map((tx) => {
        const isBuy   = (tx.action || tx.type || getAction?.(tx)) === 'buy';
        const trigger = tx.triggerType ? TRIGGER_MAP[tx.triggerType] : null;

        return (
          <div key={tx.id} style={{ ...card, marginBottom:0 }}>
            <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:10 }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:36, height:36, borderRadius:12, flexShrink:0, background: isBuy ? '#FEF2F2' : '#EFF6FF', display:'flex', alignItems:'center', justifyContent:'center' }}>
                  {isBuy ? <TrendingUp size={18} color={tokens.rise} /> : <TrendingDown size={18} color={tokens.fall} />}
                </div>
                <div>
                  <div style={{ fontSize:14, fontWeight:700, color:tokens.textPrimary }}>
                    <span style={{ color: isBuy ? tokens.rise : tokens.fall }}>{isBuy ? '매수' : '매도'}</span>
                    {' · '}{tx.name || tx.symbol}
                  </div>
                  <div style={{ fontSize:11, color:tokens.textTertiary, marginTop:2 }}>
                    {new Date(tx.date).toLocaleString('ko-KR', { month:'short', day:'numeric', hour:'2-digit', minute:'2-digit' })}
                    {tx._synthetic && <span style={{ marginLeft:6, color:'#F97316', fontWeight:600 }}>현재 보유 중</span>}
                  </div>
                </div>
              </div>
              {/* 실제 tx: 매도 수익률 / 합성 tx: live 현재 수익률 */}
              {!tx._synthetic && tx.profitRate != null && (
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <ProfitBadge value={tx.profitRate} />
                  {tx.holdDays && <div style={{ fontSize:11, color:tokens.textTertiary, marginTop:3 }}>{tx.holdDays}일 보유</div>}
                </div>
              )}
              {tx._synthetic && (() => {
                const live = liveAiHoldings?.find(h => h.symbol === tx.symbol);
                return live?.profitRate != null ? <ProfitBadge value={live.profitRate} /> : null;
              })()}
            </div>

            {/* 매수 가격 정보 */}
            {isBuy && tx.price && (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:6, marginBottom:10, background:tokens.bgCardAlt, borderRadius:10, padding:'10px 12px' }}>
                {[
                  { label:'📍 매수가', value: tx.price,      color: tokens.textPrimary },
                  { label:'🎯 목표가', value: tx.takeProfit, color: tokens.greenDark },
                  { label:'⛔ 손절가', value: tx.stopLoss,   color: tokens.rise },
                ].map(({ label, value, color }) => (
                  <div key={label} style={{ textAlign:'center' }}>
                    <div style={{ fontSize:10, color:tokens.textTertiary, marginBottom:3 }}>{label}</div>
                    <div style={{ fontSize:12, fontWeight:700, color: value ? color : tokens.textTertiary }}>
                      {value ? Number(value).toLocaleString() : '-'}원
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* 매도 가격 */}
            {!isBuy && tx.price && (
              <div style={{ background:tokens.bgCardAlt, borderRadius:10, padding:'8px 12px', marginBottom:10, fontSize:12, color:tokens.textSecondary }}>
                {Number(tx.price).toLocaleString()}원 · {tx.quantity}주
                {tx.totalAmount && ` · 총 ${Number(tx.totalAmount).toLocaleString()}원`}
              </div>
            )}

            {/* AI 분석 근거 */}
            {(tx.aiReasons?.length > 0 || tx.aiAnalysis?.reasons?.length > 0) && (
              <div style={{ borderTop:`1px solid ${tokens.borderLight}`, paddingTop:10 }}>
                <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <Bot size={13} color={tokens.blue} />
                    <span style={{ fontSize:12, fontWeight:700, color:tokens.textPrimary }}>
                      {isBuy ? 'AI 매수 근거' : 'AI 매도 이유'}
                    </span>
                  </div>
                  {(tx.aiScore || tx.aiAnalysis?.score) && (
                    <span style={{ fontSize:11, fontWeight:700, background:tokens.blueLight, color:tokens.blue, padding:'2px 8px', borderRadius:6 }}>
                      {tx.aiScore || tx.aiAnalysis.score}/100
                    </span>
                  )}
                </div>
                <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                  {(tx.aiReasons || tx.aiAnalysis?.reasons || []).map((r, i) => (
                    <div key={i} style={{ display:'flex', gap:6, fontSize:12, color:tokens.textSecondary, lineHeight:1.5 }}>
                      <span style={{ color:tokens.blue, flexShrink:0, fontWeight:700 }}>·</span>
                      <span>{r}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {trigger && (
              <div style={{ marginTop:10 }}>
                <span style={{ fontSize:11, fontWeight:600, padding:'3px 10px', borderRadius:8, background:trigger.bg, color:trigger.color }}>
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
    { label:'총 거래 횟수', ai:`${aiStats?.totalTrades || 0}회`,  user:`${userStats?.totalTrades || 0}회` },
    { label:'승률',         ai:`${aiStats?.winRate || 0}%`,         user:`${userStats?.winRate || 0}%` },
    {
      label:'평균 수익률',
      ai:   `${aiStats?.avgProfit   >= 0 ? '+' : ''}${aiStats?.avgProfit   || 0}%`,
      user: `${userStats?.avgProfit >= 0 ? '+' : ''}${userStats?.avgProfit || 0}%`,
    },
    ...(aiStats?.avgHoldDays !== undefined
      ? [{ label:'평균 보유 기간', ai:`${aiStats.avgHoldDays}일`, user:'-' }]
      : []),
  ];

  return (
    <div>
      <div style={{ ...card }}>
        <SectionTitle icon={Percent} label="매매 성과 비교" />
        <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
          {rows.map(({ label, ai, user }) => (
            <div key={label} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', background:tokens.bgCardAlt, borderRadius:10 }}>
              <span style={{ fontSize:13, color:tokens.textSecondary, fontWeight:500 }}>{label}</span>
              <div style={{ display:'flex', gap:12 }}>
                <span style={{ fontSize:13, fontWeight:700, color:tokens.blue }}>AI {ai}</span>
                <span style={{ fontSize:13, fontWeight:700, color:tokens.green }}>나 {user}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}