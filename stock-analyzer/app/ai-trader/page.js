'use client';

import { authFetch } from '@/lib/authFetch';
import { useState, useEffect, useRef } from 'react';
import { auth } from '@/lib/firebase';
import { db } from '@/lib/db';
import {
  collection, query, where, onSnapshot,
  getDocs, getDoc, limit, doc,
} from 'firebase/firestore';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, ReferenceLine,
} from 'recharts';
import {
  TrendingUp, TrendingDown, Bot, User, Activity,
  DollarSign, Check, Clock, Play,
  Loader2, Info,
} from 'lucide-react';
import AILoadingModal from '@/components/AILoadingModal';
import { calcTraderReport } from '@/lib/traderStats';
import { fetchKrQuotes, fetchHoldingQuotes } from '@/lib/quotes';
import { toKrwView } from '@/lib/currency';

/* ─── Design Tokens ──────────────────────────────────────────────── */
const tokens = {
  bgPage: '#F0F4F8',
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
  border: '#E2E8F0',
  borderLight: '#F3F4F6',
  shadowSm: '0 2px 12px rgba(15,23,42,0.06)',
  shadowMd: '0 4px 12px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)',
};

const card = {
  background: tokens.bgCard,
  borderRadius: 20,
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

/* AI 보유 종목 실시간 가격 & 수익률 재계산 (Firestore 저장값은 매수 시점 값) */
async function enrichAIHoldings(portfolio) {
  if (!portfolio?.holdings?.length) {
    return { holdings: [], liveReturn: '0.00', totalAsset: portfolio?.cash ?? 10_000_000 };
  }
  const symbols = [...new Set(portfolio.holdings.map(h => h.symbol ?? h.code))];
  const { prices, names: koreanNames } = await fetchKrQuotes(symbols);

  const enriched = portfolio.holdings.map(h => {
    const sym        = h.symbol ?? h.code;
    const cp         = prices[sym] ?? h.currentPrice ?? h.avgPrice;
    const profitRate = parseFloat((((cp - h.avgPrice) / h.avgPrice) * 100).toFixed(2));
    return { ...h, currentPrice: cp, profitRate, koreanName: koreanNames[sym] || h.name };
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
  const [aiStats,           setAiStats]           = useState(null);
  const [userStats,         setUserStats]         = useState(null);
  const [historyData,       setHistoryData]       = useState([]);
  const [performanceData,   setPerformanceData]   = useState([]);
  const [loading,           setLoading]           = useState(true);
  const [executing,         setExecuting]         = useState(false);

  const [userProfile,    setUserProfile]    = useState(null);

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

    /* AI 매매 기록. 스냅샷을 그대로 써야 초기화(삭제)도 바로 반영된다 */
    const unsubAITx = onSnapshot(
      query(collection(db, 'aiTransactions'), where('userId', '==', userId)),
      (snap) => {
        const txs = snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.date) - new Date(a.date));
        setAiTransactions(txs);
        calculateAIStats(txs);
      }
    );

    /* aiPortfolioHistory */
    const unsubHistory = onSnapshot(
      query(collection(db, 'aiPortfolioHistory'), where('userId', '==', userId)),
      (snap) => {
        const h = snap.docs.map(d => d.data()).sort((a, b) => new Date(a.date) - new Date(b.date));
        setHistoryData(h);
      }
    );

    /* user trades + profile (1회 fetch) */
    (async () => {
      const [tradesSnap, profileSnap] = await Promise.all([
        getDocs(query(collection(db, 'trades'), where('userId', '==', userId), limit(50))),
        getDoc(doc(db, 'profiles', userId)),
      ]);
      const txs = tradesSnap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a, b) => new Date(b.date) - new Date(a.date));
      calculateUserStats(txs);
      if (profileSnap.exists()) setUserProfile(profileSnap.data());
      setLoading(false);
    })();

    return () => { unsubAI(); unsubHoldings(); unsubAITx(); unsubHistory(); };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 의도적으로 표시한 값이 바뀔 때만 실행 (함수는 매 렌더 새로 만들어져 넣으면 무한 반복)
  }, []);

  // 내 모의투자 보유 종목 평가 (미국 종목은 원화로 환산, 시세를 못 구하면 투자원금 기준)
  const enrichUserHoldings = async (holdings) => {
    const q = await fetchHoldingQuotes(holdings);
    const { prices, holdings: hs } = toKrwView(holdings, q.prices, q.fx);
    setUserHoldingsDetail(
      hs.map(h => {
        const cp   = prices[h.symbol] || h.avgPrice;
        const ea   = cp * h.quantity;
        const prof = ea - h.totalInvested;
        const avg  = h.totalInvested / h.quantity;
        return {
          ...h, currentPrice: cp, evalAmt: ea, profit: prof,
          profitRate: parseFloat(((prof / h.totalInvested) * 100).toFixed(2)),
          koreanName: q.names[h.symbol] || h.name,
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
    const stockVal   = userHoldingsDetail.reduce((s, h) => s + (h.evalAmt ?? 0), 0);
    const totalAsset = (userProfile?.cash ?? 0) + stockVal;
    const initial    = userProfile?.initialAsset ?? 10_000_000;
    const userRet    = initial > 0 ? ((totalAsset - initial) / initial * 100).toFixed(2) : '0.00';
    const series     = buildChartSeries(historyData, aiTransactions, chartPeriod, liveAiReturn, userRet);
    setPerformanceData(series);
  }, [historyData, aiTransactions, chartPeriod, liveAiReturn, userHoldingsDetail, userProfile]);

  const handleManualStart = async () => {
    if (executing) return;
    setExecuting(true);
    try {
      const res = await authFetch('/api/ai-trader/manual-start', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: auth.currentUser?.uid }),
      });
      const r = await res.json();
      alert(r.success ? `✅ ${r.message}` : `❌ 실행 실패: ${r.error}`);
    } catch (e) { alert(`❌ 오류: ${e.message}`); }
    finally { setExecuting(false); }
  };

  const handleResetPortfolio = async () => {
    if (!confirm('AI 포트폴리오를 초기화하면 모든 보유 종목과 거래내역이 삭제됩니다.\n계속하시겠습니까?')) return;
    try {
      const res = await authFetch('/api/ai-trader/reset', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: auth.currentUser?.uid }),
      });
      const r = await res.json();
      alert(r.success ? '✅ AI 포트폴리오가 초기화되었습니다.' : `❌ 초기화 실패: ${r.error}`);
    } catch (e) { alert(`❌ 오류: ${e.message}`); }
  };

  const handleCheckStops = async () => {
    try {
      const res = await authFetch('/api/ai-trader/check-stops', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: auth.currentUser?.uid }),
      });
      const r = await res.json();
      if (r.triggered > 0) alert(`✅ 자동 매도 실행: ${r.triggered}개 (손절/익절 조건 충족)`);
      else alert(`✅ ${r.message || '조건 미충족 — 매도 없음'}`);
    } catch (e) { alert(`❌ 오류: ${e.message}`); }
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
    { id: 'dashboard', label: '대시보드' },
    { id: 'history',   label: '매매내역' },
    { id: 'analysis',  label: '비교분석' },
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

      <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 14px 0' }}>
        <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 2px', letterSpacing: '-0.4px' }}>🤖 AI 트레이더</h1>
        <p style={{ fontSize: 12, color: '#94a3b8', margin: '0 0 12px' }}>AI가 자동으로 사고파는 모의투자, 나와 수익률 비교</p>
        <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: 14, padding: 3 }}>
          {TABS.map(({ id, label }) => {
            const active = activeTab === id;
            return (
              <button key={id} onClick={() => setActiveTab(id)} style={{
                flex: 1, padding: '9px 0', borderRadius: 11, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 800,
                transition: 'background 0.2s ease, color 0.2s ease',
                background: active ? '#fff' : 'transparent', color: active ? '#0f172a' : '#64748b', boxShadow: active ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
              }}>{label}</button>
            );
          })}
        </div>
      </div>

      {/* ── Content ── */}
      <div key={activeTab} style={{ maxWidth: 640, margin: '0 auto', padding:'12px 14px 0', animation:'fadeIn 0.25s ease' }}>
        {activeTab === 'dashboard' && (
          <DashboardTab
            aiPortfolio={aiPortfolio}
            liveAiHoldings={liveAiHoldings}
            liveAiReturn={liveAiReturn}
            liveAiAsset={liveAiAsset}
            userHoldingsDetail={userHoldingsDetail}
            userProfile={userProfile}
            aiStats={aiStats} userStats={userStats}
            performanceData={performanceData}
            chartPeriod={chartPeriod} setChartPeriod={setChartPeriod}
            executing={executing} handleManualStart={handleManualStart}
            handleResetPortfolio={handleResetPortfolio}
            handleCheckStops={handleCheckStops}
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
        {activeTab === 'analysis' && (
          <AnalysisTab
            aiStats={aiStats} userStats={userStats}
            liveAiReturn={liveAiReturn}
            liveAiHoldings={liveAiHoldings}
            aiTransactions={aiTransactions}
            userProfile={userProfile}
            userHoldingsDetail={userHoldingsDetail}
            historyData={historyData}
          />
        )}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════
   📊 Dashboard Tab
   ═══════════════════════════════════════════════════════════════════ */
function DashboardTab({
  aiPortfolio, liveAiHoldings, liveAiReturn, liveAiAsset,
  userHoldingsDetail, userProfile, aiStats, userStats,
  performanceData, chartPeriod, setChartPeriod,
  executing, handleManualStart, handleResetPortfolio, handleCheckStops,
}) {
  const aiReturnVal   = parseFloat(liveAiReturn);
  const stockVal      = userHoldingsDetail.reduce((s, h) => s + (h.evalAmt ?? 0), 0);
  const userTotalAsset = (userProfile?.cash ?? 0) + stockVal;
  const userInitial    = userProfile?.initialAsset ?? 10_000_000;
  const userReturn     = userInitial > 0 ? ((userTotalAsset - userInitial) / userInitial * 100).toFixed(1) : '0.0';
  const userReturnVal  = parseFloat(userReturn);

  /* AI=파랑 고정, 나=초록 고정 — 수익/손실 상관없이 항상 구분 가능 */
  const aiLineColor   = tokens.blue;   // #2563EB
  const userLineColor = tokens.green;  // #10B981

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
                padding:'5px 12px', borderRadius:999, border:'none',
                fontSize:12, fontWeight:700, cursor:'pointer',
                background: chartPeriod === id ? '#0f172a' : '#f1f5f9',
                color: chartPeriod === id ? '#fff' : '#64748b',
                transition:'all 0.15s',
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
        {/* AI — 항상 파랑 */}
        <div style={{
          background: 'linear-gradient(145deg, #0f172a 0%, #1e3a5f 55%, #1e40af 100%)',
          borderRadius:20, padding:'14px 14px',
          boxShadow: '0 8px 24px rgba(15,23,42,0.18)',
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
            <span style={{ fontSize:12, fontWeight:700, color:'rgba(255,255,255,0.6)' }}>🤖 AI</span>
          </div>
          <div style={{ fontSize:26, fontWeight:900, color: aiReturnVal >= 0 ? '#fca5a5' : '#93c5fd', letterSpacing:'-1px', lineHeight:1 }}>
            {aiReturnVal >= 0 ? '+' : ''}{parseFloat(liveAiReturn).toFixed(1)}%
          </div>
          {aiStats?.totalTrades > 0 ? (
            <div style={{ marginTop:8, fontSize:11, color:'rgba(255,255,255,0.6)', lineHeight:1.6 }}>
              <div>승률 {aiStats.winRate}% · 평균 {aiStats.avgProfit >= 0 ? '+' : ''}{aiStats.avgProfit}%</div>
              <div>보유 {aiStats.avgHoldDays}일 · {aiStats.totalTrades}회</div>
            </div>
          ) : (
            <div style={{ marginTop:8, fontSize:11, color:'rgba(255,255,255,0.5)' }}>
              {aiDisplayHoldings.length > 0 ? `보유 ${aiDisplayHoldings.length}종목` : '분석 대기 중'}
            </div>
          )}
        </div>

        {/* 나 — 항상 초록 */}
        <div style={{
          background: '#fff', border: `1px solid ${tokens.border}`,
          borderRadius:20, padding:'14px 14px',
          boxShadow: tokens.shadowSm,
        }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
            <span style={{ fontSize:12, fontWeight:700, color:'#64748b' }}>👤 나</span>
          </div>
          <div style={{ fontSize:26, fontWeight:900, color: userReturnVal >= 0 ? tokens.rise : tokens.fall, letterSpacing:'-1px', lineHeight:1 }}>
            {userReturnVal >= 0 ? '+' : ''}{userReturn}%
          </div>
          {userStats?.totalTrades > 0 ? (
            <div style={{ marginTop:8, fontSize:11, color:'#64748b', lineHeight:1.6 }}>
              <div>승률 {userStats.winRate}% · 평균 {userStats.avgProfit >= 0 ? '+' : ''}{userStats.avgProfit}%</div>
              <div>{userStats.totalTrades}회</div>
            </div>
          ) : <div style={{ marginTop:8, fontSize:11, color:'#94a3b8' }}>거래 내역 없음</div>}
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
          background: executing ? '#CBD5E1' : '#6366f1',
          color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', gap:8,
          transition:'all 0.15s', letterSpacing:'-0.2px',
        }}>
          {executing
            ? <><Loader2 size={16} style={{ animation:'spin 1s linear infinite' }} /> 분석 중...</>
            : <><Play size={16} /> {aiPortfolio?.status?.active ? 'AI 재분석 시작' : 'AI 분석 시작'}</>}
        </button>
        <div style={{ display:'flex', gap:8, marginTop:8 }}>
          <button onClick={handleCheckStops} style={{
            flex:1, padding:'10px 0', borderRadius:12,
            border:`1px solid #BBF7D0`, background:'#F0FDF4',
            fontSize:13, fontWeight:600, color:'#166534',
            cursor:'pointer', transition:'all 0.15s',
          }}>
            🎯 손절/익절 체크
          </button>
          <button onClick={handleResetPortfolio} style={{
            flex:1, padding:'10px 0', borderRadius:12,
            border:`1px solid ${tokens.border}`, background:'#fff',
            fontSize:13, fontWeight:600, color:tokens.textSecondary,
            cursor:'pointer', transition:'all 0.15s',
          }}>
            🔄 초기화
          </button>
        </div>
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
              <HoldingRow key={i} name={h.koreanName || h.name} quantity={h.quantity} avgPrice={h.avgPrice}
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
        name:       h.koreanName || h.name,
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
function AnalysisTab({ aiStats, userStats, liveAiReturn, liveAiHoldings, aiTransactions, userProfile, userHoldingsDetail, historyData }) {
  const aiReturnVal   = parseFloat(liveAiReturn ?? 0);
  const stockVal      = (userHoldingsDetail ?? []).reduce((s, h) => s + (h.evalAmt ?? 0), 0);
  const userInitial   = userProfile?.initialAsset ?? 10_000_000;
  const userTotal     = (userProfile?.cash ?? 0) + stockVal;
  const userReturnVal = parseFloat(((userTotal - userInitial) / userInitial * 100).toFixed(1));

  const hasAiSells    = (aiStats?.totalTrades ?? 0) > 0;
  const hasUserTrades = (userStats?.totalTrades ?? 0) > 0;

  /* AI 활동 지표 (매수 포함) */
  const aiBuyCount    = (aiTransactions ?? []).filter(t => (t.action || t.type) === 'buy').length;
  const aiHoldCount   = (liveAiHoldings ?? []).length;
  const aiTotalAct    = aiBuyCount + aiHoldCount;  // 매수 기록 + 현재 보유
  const hasAiActivity = aiTotalAct > 0;

  /* 미실현 평균 수익률 (보유 중인 종목) */
  const unrealizedAvg = aiHoldCount > 0
    ? ((liveAiHoldings ?? []).reduce((s, h) => s + (h.profitRate ?? 0), 0) / aiHoldCount).toFixed(1)
    : null;

  const aiWinRate     = parseFloat(aiStats?.winRate    ?? 0);
  const userWinRate   = parseFloat(userStats?.winRate  ?? 0);
  const aiAvgProfit   = parseFloat(aiStats?.avgProfit  ?? 0);
  const userAvgProfit = parseFloat(userStats?.avgProfit ?? 0);

  /* AI sub 레이블: 매도 이력 or 현재 보유 현황 */
  const aiSub = hasAiSells
    ? `${aiStats.totalTrades}회 매도 · 승률 ${aiStats.winRate}%`
    : aiHoldCount > 0
      ? `보유 ${aiHoldCount}종목 · 미실현 ${parseFloat(unrealizedAvg) >= 0 ? '+' : ''}${unrealizedAvg}%`
      : aiBuyCount > 0
        ? `${aiBuyCount}회 매수 (매도 대기 중)`
        : '분석 대기 중';

  const userSub = hasUserTrades
    ? `${userStats.totalTrades}회 매도 · 승률 ${userStats.winRate}%`
    : '거래 없음';

  /* 지표 행 */
  const metrics = [
    {
      label: '현재 수익률',
      aiVal: aiReturnVal,
      aiStr: `${aiReturnVal >= 0 ? '+' : ''}${aiReturnVal.toFixed(1)}%`,
      userVal: userReturnVal,
      userStr: `${userReturnVal >= 0 ? '+' : ''}${userReturnVal.toFixed(1)}%`,
      isReturn: true,
    },
    {
      label: '총 거래',
      aiVal:   hasAiSells ? aiStats.totalTrades : (hasAiActivity ? aiTotalAct : 0),
      aiStr:   hasAiSells ? `${aiStats.totalTrades}회 매도` : hasAiActivity ? `${aiTotalAct}회` : '없음',
      userVal: userStats?.totalTrades ?? 0,
      userStr: hasUserTrades ? `${userStats.totalTrades}회` : '없음',
    },
    ...(hasAiSells || hasUserTrades ? [{
      label: '승률',
      aiVal:   aiWinRate,
      aiStr:   hasAiSells ? `${aiStats.winRate}%` : '-',
      userVal: userWinRate,
      userStr: hasUserTrades ? `${userStats.winRate}%` : '-',
      showBar: true, max: 100,
    }] : []),
    ...(hasAiSells || hasUserTrades ? [{
      label: '평균 매도 수익률',
      aiVal:   aiAvgProfit,
      aiStr:   hasAiSells ? `${aiAvgProfit >= 0 ? '+' : ''}${aiAvgProfit}%` : '-',
      userVal: userAvgProfit,
      userStr: hasUserTrades ? `${userAvgProfit >= 0 ? '+' : ''}${userAvgProfit}%` : '-',
    }] : []),
    ...(aiHoldCount > 0 ? [{
      label: '미실현 수익 (보유 중)',
      aiVal:   parseFloat(unrealizedAvg),
      aiStr:   `${parseFloat(unrealizedAvg) >= 0 ? '+' : ''}${unrealizedAvg}% (${aiHoldCount}종목)`,
      userVal: 0,
      userStr: userHoldingsDetail?.length > 0
        ? `${userHoldingsDetail.length}종목 보유`
        : '-',
    }] : []),
    ...(hasAiSells && aiStats?.avgHoldDays != null ? [{
      label: '평균 보유 기간',
      aiVal:   aiStats.avgHoldDays,
      aiStr:   `${aiStats.avgHoldDays}일`,
      userVal: 0,
      userStr: '-',
    }] : []),
  ];

  return (
    <div style={{ paddingBottom: 20 }}>

      {/* ─ 수익률 헤더 카드 ─ */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
        {[
          { label:'🤖 AI 트레이더', ret:aiReturnVal,   Icon:Bot,  sub:aiSub,   bg:'linear-gradient(145deg,#2563EB,#4F46E5)', shadow:'rgba(37,99,235,0.28)' },
          { label:'👤 내 수익률',   ret:userReturnVal, Icon:User, sub:userSub, bg:'linear-gradient(145deg,#10B981,#059669)', shadow:'rgba(16,185,129,0.28)' },
        ].map(({ label, ret, Icon, sub, bg, shadow }) => (
          <div key={label} style={{ background:bg, borderRadius:20, padding:'18px 14px', boxShadow:`0 6px 20px ${shadow}` }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:10 }}>
              <div style={{ width:24, height:24, borderRadius:8, background:'rgba(255,255,255,0.2)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <Icon size={13} color="#fff" />
              </div>
              <span style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.85)', letterSpacing:'0.02em' }}>{label}</span>
            </div>
            {/* 수익률 숫자 — 흰색 고정, 방향은 부호로만 */}
            <div style={{ fontSize:30, fontWeight:900, color:'#fff', letterSpacing:'-1.5px', lineHeight:1 }}>
              {ret >= 0 ? '+' : ''}{ret.toFixed(1)}%
            </div>
            {/* 방향 뱃지 */}
            <div style={{ display:'inline-flex', alignItems:'center', gap:4, marginTop:6, padding:'2px 8px', borderRadius:6, background: ret >= 0 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0.15)' }}>
              <span style={{ fontSize:10, color:'rgba(255,255,255,0.9)', fontWeight:600 }}>{ret >= 0 ? '▲ 수익' : '▼ 손실'}</span>
            </div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.55)', marginTop:6, lineHeight:1.4 }}>{sub}</div>
          </div>
        ))}
      </div>

      {/* ─ 지표 비교 ─ */}
      <div style={{ ...card, padding:'18px 16px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <span style={{ fontSize:14, fontWeight:700, color:tokens.textPrimary }}>성과 비교</span>
          <div style={{ display:'flex', gap:12 }}>
            <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:tokens.textTertiary }}>
              <div style={{ width:8, height:8, borderRadius:2, background:tokens.blue }} />AI
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:4, fontSize:11, color:tokens.textTertiary }}>
              <div style={{ width:8, height:8, borderRadius:2, background:tokens.green }} />나
            </div>
          </div>
        </div>

        <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
          {metrics.map(({ label, aiVal, aiStr, userVal: uVal, userStr, showBar, max, isReturn }) => {
            /* 수익률 행: 양수가 우위 */
            const aiWins   = isReturn ? aiVal > uVal : aiVal > uVal;
            const userWins = isReturn ? uVal > aiVal : uVal > aiVal;
            const barMax   = max ?? Math.max(Math.abs(aiVal), Math.abs(uVal), 1);
            return (
              <div key={label}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom: showBar ? 8 : 0 }}>
                  <span style={{ fontSize:12, color:tokens.textTertiary, fontWeight:500 }}>{label}</span>
                  <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                    <div style={{
                      display:'flex', alignItems:'center', gap:4,
                      background: aiWins ? '#EFF6FF' : tokens.bgCardAlt,
                      border: aiWins ? `1px solid ${tokens.blueMid}30` : `1px solid ${tokens.borderLight}`,
                      borderRadius:8, padding:'4px 10px',
                    }}>
                      <Bot size={10} color={aiWins ? tokens.blue : tokens.textTertiary} />
                      <span style={{ fontSize:13, fontWeight:700, color: aiWins ? tokens.blue : tokens.textSecondary }}>{aiStr}</span>
                    </div>
                    <span style={{ fontSize:10, color:tokens.textTertiary }}>vs</span>
                    <div style={{
                      display:'flex', alignItems:'center', gap:4,
                      background: userWins ? '#F0FDF4' : tokens.bgCardAlt,
                      border: userWins ? `1px solid ${tokens.green}30` : `1px solid ${tokens.borderLight}`,
                      borderRadius:8, padding:'4px 10px',
                    }}>
                      <User size={10} color={userWins ? tokens.green : tokens.textTertiary} />
                      <span style={{ fontSize:13, fontWeight:700, color: userWins ? tokens.green : tokens.textSecondary }}>{userStr}</span>
                    </div>
                  </div>
                </div>
                {showBar && (
                  <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                    {[{ val:aiVal, str:aiStr, Icon:Bot, grad:`${tokens.blue},${tokens.blueMid}` }, { val:uVal, str:userStr, Icon:User, grad:`${tokens.green},${tokens.greenDark}` }].map(({ val, str, Icon, grad }, idx) => (
                      <div key={idx} style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <Icon size={9} color={tokens.textTertiary} style={{ flexShrink:0 }} />
                        <div style={{ flex:1, height:5, background:tokens.bgCardAlt, borderRadius:4, overflow:'hidden' }}>
                          <div style={{ height:'100%', width:`${Math.min((val / barMax) * 100, 100)}%`, background:`linear-gradient(90deg,${grad})`, borderRadius:4, transition:'width 0.8s ease' }} />
                        </div>
                        <span style={{ fontSize:10, color:tokens.textTertiary, width:36, textAlign:'right' }}>{str}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <ReportCard report={calcTraderReport(aiTransactions, historyData)} />

      {/* 아직 매도 없을 때 — 보유 현황 안내 */}
      {!hasAiSells && hasAiActivity && (
        <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:14, padding:'14px 16px', display:'flex', gap:10, alignItems:'flex-start' }}>
          <Info size={14} color={tokens.blue} style={{ flexShrink:0, marginTop:1 }} />
          <div>
            <p style={{ fontSize:13, fontWeight:700, color:'#1E3A8A', margin:0 }}>AI 매도 실적 대기 중</p>
            <p style={{ fontSize:12, color:'#1D4ED8', margin:'4px 0 0', lineHeight:1.5 }}>
              현재 {aiHoldCount}종목 보유 중입니다. 목표가 또는 손절가 도달 시 자동 매도되며 실적이 기록됩니다.
            </p>
          </div>
        </div>
      )}
      {!hasAiSells && !hasAiActivity && (
        <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:14, padding:'14px 16px', display:'flex', gap:10, alignItems:'flex-start' }}>
          <Info size={14} color="#D97706" style={{ flexShrink:0, marginTop:1 }} />
          <div>
            <p style={{ fontSize:13, fontWeight:700, color:'#92400E', margin:0 }}>AI 거래 데이터 없음</p>
            <p style={{ fontSize:12, color:'#B45309', margin:'4px 0 0', lineHeight:1.5 }}>
              대시보드에서 AI 분석을 시작하면 매매 성과가 여기에 기록됩니다.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
/* ─── AI 성적표: 최대 낙폭·손익비·매도 이유별·매수 점수별 ─────────── */
function ReportCard({ report: r }) {
  if (!r.sells && r.mdd == null) return null;
  const pct = (v) => (v == null ? '-' : `${v > 0 ? '+' : ''}${v}%`);
  const col = (v) => (v == null || v === 0 ? tokens.textPrimary : v > 0 ? tokens.rise : tokens.fall);
  const Row = ({ label, n, winRate, avg }) => (
    <div style={{ display:'flex', alignItems:'center', padding:'8px 0', borderTop:`1px solid ${tokens.borderLight}`, fontSize:13 }}>
      <span style={{ flex:1, color:tokens.textSecondary }}>{label}</span>
      <span style={{ width:44, textAlign:'right', color:tokens.textTertiary }}>{n}건</span>
      <span style={{ width:56, textAlign:'right', color:tokens.textSecondary }}>{n ? `승 ${winRate}%` : '-'}</span>
      <span style={{ width:60, textAlign:'right', fontWeight:700, color:col(avg) }}>{pct(avg)}</span>
    </div>
  );
  const tiles = [
    ['최대 낙폭', r.mdd == null ? '-' : `${r.mdd}%`, r.mdd ? tokens.fall : tokens.textPrimary, r.mdd == null ? '기록 2일 이상 필요' : `${r.days}일 기록 기준`],
    ['손익비', r.payoff == null ? '-' : `${r.payoff}배`, tokens.textPrimary, r.payoff == null ? '이익·손실 거래 모두 필요' : `평균 ${pct(r.avgWin)} / ${pct(r.avgLoss)}`],
  ];
  return (
    <div style={card}>
      <SectionTitle icon={Activity} label="AI 성적표" />
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:14 }}>
        {tiles.map(([label, val, c, sub]) => (
          <div key={label} style={{ background:tokens.bgCardAlt, borderRadius:14, padding:'12px 14px' }}>
            <div style={{ fontSize:11, color:tokens.textTertiary }}>{label}</div>
            <div style={{ fontSize:20, fontWeight:800, color:c, margin:'2px 0' }}>{val}</div>
            <div style={{ fontSize:10, color:tokens.textTertiary }}>{sub}</div>
          </div>
        ))}
      </div>
      {r.sells > 0 && (
        <>
          <div style={{ fontSize:12, fontWeight:700, color:tokens.textPrimary, marginBottom:2 }}>매도 이유별</div>
          {r.reasons.map((x) => <Row key={x.label} {...x} />)}
          <div style={{ fontSize:12, fontWeight:700, color:tokens.textPrimary, margin:'14px 0 2px' }}>매수 점수별 <span style={{ fontWeight:400, color:tokens.textTertiary }}>· 점수가 높을수록 잘 맞아야 정상</span></div>
          {r.scores.map((x) => <Row key={x.label} {...x} />)}
          {r.best && (
            <div style={{ display:'flex', gap:8, marginTop:14, fontSize:12 }}>
              {[['최고', r.best], ['최악', r.worst]].filter(([, s]) => s).map(([label, s]) => (
                <div key={label} style={{ flex:1, background:tokens.bgCardAlt, borderRadius:12, padding:'10px 12px' }}>
                  <div style={{ color:tokens.textTertiary, fontSize:11 }}>{label} 거래</div>
                  <div style={{ fontWeight:700, color:tokens.textPrimary, margin:'2px 0', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{s.name || s.code}</div>
                  <div style={{ fontWeight:800, color:col(s.rate) }}>{pct(s.rate)}</div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
