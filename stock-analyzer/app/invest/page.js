'use client';

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import {
  doc, getDoc, setDoc, collection,
  addDoc, getDocs, updateDoc, deleteDoc,
  query, where, orderBy, serverTimestamp
} from 'firebase/firestore';
import { motion, AnimatePresence } from 'framer-motion';

const INITIAL_ASSET = 10000000;

const fmt = (n) => Math.round(n).toLocaleString('ko-KR');
const fmtRate = (n) => (Number(n) >= 0 ? '+' : '') + Number(n).toFixed(2) + '%';

// ── Animation variants ──────────────────────────────────────────────────────
const fadeUp = {
  hidden: { opacity: 0, y: 22 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.45, delay: i * 0.07, ease: [0.22, 1, 0.36, 1] }
  }),
};
const scaleIn = {
  hidden: { opacity: 0, scale: 0.94 },
  visible: { opacity: 1, scale: 1, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } },
  exit:   { opacity: 0, scale: 0.94, transition: { duration: 0.2 } },
};

// ── Spark line mini chart ───────────────────────────────────────────────────
function Sparkline({ data = [], color = '#3b82f6', height = 36 }) {
  if (data.length < 2) return null;
  const w = 120, h = height;
  const min = Math.min(...data), max = Math.max(...data);
  const range = max - min || 1;
  const pts = data.map((v, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((v - min) / range) * (h - 6) - 3;
    return `${x},${y}`;
  }).join(' ');
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} fill="none">
      <polyline points={pts} stroke={color} strokeWidth="1.8" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
      <polygon points={`${pts} ${w},${h} 0,${h}`} fill={color} opacity="0.10" />
    </svg>
  );
}

// ── Progress ring ───────────────────────────────────────────────────────────
function Ring({ pct, size = 52, stroke = 4, color = '#3b82f6', bg = '#e5e7eb', children }) {
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  return (
    <svg width={size} height={size} className="shrink-0">
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={bg} strokeWidth={stroke} />
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform={`rotate(-90 ${size/2} ${size/2})`} />
      <foreignObject x="0" y="0" width={size} height={size}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'center', width:'100%', height:'100%', fontSize:9, fontWeight:700, color }}>
          {Math.round(pct)}%
        </div>
      </foreignObject>
    </svg>
  );
}

// ── Stat chip ───────────────────────────────────────────────────────────────
function StatChip({ label, value, sub, positive, accent }) {
  return (
    <div style={{ background:'#f8fafc', borderRadius:16, padding:'14px 16px', border:'1px solid #e5e7eb' }}>
      <p style={{ fontSize:11, color:'#9ca3af', marginBottom:4, letterSpacing:'0.04em', textTransform:'uppercase' }}>{label}</p>
      <p style={{ fontSize:15, fontWeight:700, color: accent ? '#2563eb' : positive == null ? '#111827' : positive ? '#dc2626' : '#2563eb', lineHeight:1.2 }}>{value}</p>
      {sub && <p style={{ fontSize:10, color:'#9ca3af', marginTop:3 }}>{sub}</p>}
    </div>
  );
}

export default function InvestPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState('portfolio');
  const [profile, setProfile] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [trades, setTrades] = useState([]);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [sellModal, setSellModal] = useState(null);
  const [sellQty, setSellQty] = useState('');
  const [processing, setProcessing] = useState(false);
  const [assetHistory, setAssetHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedHolding, setExpandedHolding] = useState(null);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    initProfile();
  }, [user]);

  useEffect(() => {
    if (holdings.length > 0) fetchPrices();
  }, [holdings]);

  const initProfile = async () => {
    setLoading(true);
    try {
      const profileRef = doc(db, 'profiles', user.uid);
      const profileSnap = await getDoc(profileRef);
      if (!profileSnap.exists()) {
        await setDoc(profileRef, { username: user.displayName, cash: INITIAL_ASSET, initialAsset: INITIAL_ASSET, createdAt: serverTimestamp() });
        setProfile({ cash: INITIAL_ASSET, initialAsset: INITIAL_ASSET });
      } else {
        setProfile(profileSnap.data());
      }
      await loadHoldings();
      await loadTrades();
      await loadAssetHistory();
    } catch (e) { console.error(e); }
    finally { setLoading(false); }
  };

  const loadHoldings = async () => {
    const q = query(collection(db, 'holdings'), where('userId', '==', user.uid));
    const snap = await getDocs(q);
    setHoldings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const loadTrades = async () => {
    try {
      const q = query(collection(db, 'trades'), where('userId', '==', user.uid), orderBy('createdAt', 'desc'));
      const snap = await getDocs(q);
      setTrades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) { console.error(e); }
  };

  const loadAssetHistory = async () => {
    try {
      const q = query(collection(db, 'trades'), where('userId', '==', user.uid));
      const snap = await getDocs(q);
      const allTrades = snap.docs.map(d => d.data()).sort((a, b) => {
        const aTime = a.createdAt?.toDate?.() || new Date(0);
        const bTime = b.createdAt?.toDate?.() || new Date(0);
        return aTime - bTime;
      });
      let cash = INITIAL_ASSET;
      const hMap = {};
      const history = [{ date: '시작', asset: INITIAL_ASSET, cash: INITIAL_ASSET, stockValue: 0 }];
      allTrades.forEach(t => {
        if (t.type === 'buy') {
          cash -= t.amount;
          if (!hMap[t.symbol]) hMap[t.symbol] = { qty: 0, avgPrice: 0 };
          const ex = hMap[t.symbol];
          const newQty = ex.qty + t.quantity;
          hMap[t.symbol] = { qty: newQty, avgPrice: (ex.avgPrice * ex.qty + t.price * t.quantity) / newQty };
        } else {
          cash += t.amount;
          if (hMap[t.symbol]) { hMap[t.symbol].qty -= t.quantity; if (hMap[t.symbol].qty <= 0) delete hMap[t.symbol]; }
        }
        const stockValue = Object.values(hMap).reduce((s, h) => s + h.qty * h.avgPrice, 0);
        const totalAsset = Math.round(cash + stockValue);
        const date = t.createdAt?.toDate?.();
        const dateStr = date ? `${date.getMonth() + 1}/${date.getDate()}` : '?';
        history.push({ date: dateStr, asset: totalAsset, cash: Math.round(cash), stockValue: Math.round(stockValue), trade: t });
      });
      setAssetHistory(history);
    } catch (e) { console.error(e); }
  };

  const fetchPrices = async () => {
    const newPrices = {};
    await Promise.all(holdings.map(async (h) => {
      try {
        const res = await fetch(`/api/stock?symbol=${h.symbol}&timeframe=daily`);
        const data = await res.json();
        if (data.currentPrice) newPrices[h.symbol] = data.currentPrice;
      } catch {}
    }));
    setPrices(newPrices);
  };

  const handleSell = async (holding, qty) => {
    const price = prices[holding.symbol] || holding.avgPrice;
    const sellAmount = price * qty;
    const buyAmount = holding.avgPrice * qty;
    const profit = sellAmount - buyAmount;
    setProcessing(true);
    try {
      await addDoc(collection(db, 'trades'), {
        userId: user.uid, symbol: holding.symbol, name: holding.name, type: 'sell',
        price, quantity: qty, amount: sellAmount, profit,
        profitRate: ((profit / buyAmount) * 100).toFixed(2), createdAt: serverTimestamp(),
      });
      const holdingRef = doc(db, 'holdings', `${user.uid}_${holding.symbol}`);
      const newQty = holding.quantity - qty;
      if (newQty <= 0) { await deleteDoc(holdingRef); }
      else { await updateDoc(holdingRef, { quantity: newQty, totalInvested: holding.avgPrice * newQty }); }
      const profileRef = doc(db, 'profiles', user.uid);
      await updateDoc(profileRef, { cash: profile.cash + sellAmount });
      setProfile(prev => ({ ...prev, cash: prev.cash + sellAmount }));
      setSellModal(null); setSellQty('');
      await loadHoldings(); await loadTrades(); await loadAssetHistory();
    } catch (e) { console.error(e); }
    finally { setProcessing(false); }
  };

  const evalAmount = holdings.reduce((sum, h) => sum + (prices[h.symbol] || h.avgPrice) * h.quantity, 0);
  const totalAsset = (profile?.cash || 0) + evalAmount;
  const totalInvested = holdings.reduce((sum, h) => sum + h.totalInvested, 0);
  const unrealizedProfit = evalAmount - totalInvested;
  const totalReturn = profile ? ((totalAsset - profile.initialAsset) / profile.initialAsset * 100).toFixed(2) : 0;
  const realizedProfit = trades.filter(t => t.type === 'sell').reduce((sum, t) => sum + (t.profit || 0), 0);
  const sparkData = assetHistory.map(h => h.asset);
  const cashPct = totalAsset > 0 ? (profile?.cash / totalAsset) * 100 : 100;
  const stockPct = totalAsset > 0 ? (evalAmount / totalAsset) * 100 : 0;

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#f8fafc', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:16 }}>
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1, ease:'linear' }}
        style={{ width:32, height:32, borderRadius:'50%', border:'2px solid rgba(59,130,246,0.15)', borderTopColor:'#3b82f6' }} />
      <p style={{ color:'#9ca3af', fontSize:13, fontFamily:'system-ui', letterSpacing:'0.05em' }}>불러오는 중</p>
    </div>
  );

  // ── Main ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight:'100vh', background:'#f8fafc', fontFamily:"'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif", overflowX:'hidden' }}>

      {/* Background ambient */}
      <div style={{ position:'fixed', inset:0, pointerEvents:'none', zIndex:0,
        background:'radial-gradient(ellipse 80% 60% at 50% -10%, rgba(59,130,246,0.05) 0%, transparent 70%), radial-gradient(ellipse 60% 40% at 80% 80%, rgba(99,102,241,0.04) 0%, transparent 60%)' }} />

      <main style={{ position:'relative', zIndex:1, maxWidth:480, margin:'0 auto', padding:'0 0 120px' }}>

        {/* ── Header ─────────────────────────────────────────────────────── */}
        <motion.div initial={{ opacity:0, y:-16 }} animate={{ opacity:1, y:0 }} transition={{ duration:0.5, ease:[0.22,1,0.36,1] }}
          style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'20px 20px 8px' }}>
          <div style={{ display:'flex', alignItems:'center', gap:10 }}>
            <div style={{ width:32, height:32, borderRadius:10, background:'linear-gradient(135deg, #3b82f6, #6366f1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:15 }}>💼</div>
            <div>
              <p style={{ fontSize:16, fontWeight:800, color:'#111827', lineHeight:1 }}>모의투자</p>
              <p style={{ fontSize:10, color:'#9ca3af', marginTop:2 }}>Paper Trading</p>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <div style={{ display:'flex', alignItems:'center', gap:6, background:'#f1f5f9', borderRadius:20, padding:'6px 12px', border:'1px solid #e5e7eb' }}>
              <div style={{ width:18, height:18, borderRadius:'50%', background:'linear-gradient(135deg,#3b82f6,#6366f1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:9 }}>👤</div>
              <span style={{ fontSize:11, color:'#4b5563', fontWeight:500 }}>{user?.displayName}</span>
            </div>
            <button onClick={logout}
              style={{ fontSize:11, padding:'6px 12px', background:'#f1f5f9', color:'#6b7280', borderRadius:20, border:'1px solid #e5e7eb', cursor:'pointer' }}>
              로그아웃
            </button>
          </div>
        </motion.div>

        {/* ── Hero Asset Card ─────────────────────────────────────────────── */}
        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible"
          style={{ margin:'12px 16px', borderRadius:28, overflow:'hidden', position:'relative',
            background:'linear-gradient(145deg, #ffffff 0%, #eff6ff 60%, #f0f9ff 100%)',
            border:'1px solid rgba(59,130,246,0.18)',
            boxShadow:'0 8px 32px rgba(59,130,246,0.08), 0 1px 0 rgba(255,255,255,0.9) inset' }}>

          {/* Top gradient accent */}
          <div style={{ position:'absolute', top:0, left:0, right:0, height:2, background:'linear-gradient(90deg, transparent, #3b82f6, #6366f1, transparent)' }} />

          <div style={{ padding:'24px 22px 20px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
              <p style={{ fontSize:11, color:'#9ca3af', letterSpacing:'0.08em', textTransform:'uppercase', fontWeight:600 }}>총 자산</p>
              <div style={{ display:'flex', alignItems:'center', gap:4, background: Number(totalReturn) >= 0 ? 'rgba(239,68,68,0.08)' : 'rgba(59,130,246,0.08)',
                borderRadius:20, padding:'3px 10px', border:`1px solid ${Number(totalReturn) >= 0 ? 'rgba(239,68,68,0.18)' : 'rgba(59,130,246,0.18)'}` }}>
                <span style={{ fontSize:10, fontWeight:700, color: Number(totalReturn) >= 0 ? '#dc2626' : '#2563eb' }}>
                  {Number(totalReturn) >= 0 ? '▲' : '▼'} {Math.abs(Number(totalReturn)).toFixed(2)}%
                </span>
              </div>
            </div>

            <motion.p key={totalAsset} initial={{ opacity:0, scale:0.97 }} animate={{ opacity:1, scale:1 }} transition={{ duration:0.4 }}
              style={{ fontSize:32, fontWeight:800, color:'#111827', letterSpacing:'-0.02em', lineHeight:1.1, marginBottom:4 }}>
              {fmt(totalAsset)}<span style={{ fontSize:14, fontWeight:500, color:'#9ca3af', marginLeft:4 }}>원</span>
            </motion.p>

            <p style={{ fontSize:11, color:'#9ca3af', marginBottom:18 }}>
              초기 {fmt(profile?.initialAsset)}원 대비 {Number(totalReturn) >= 0 ? '+' : ''}{fmt(totalAsset - (profile?.initialAsset || 0))}원
            </p>

            {/* Sparkline */}
            {sparkData.length > 2 && (
              <div style={{ marginBottom:18, opacity:0.8 }}>
                <Sparkline data={sparkData} color={Number(totalReturn) >= 0 ? '#ef4444' : '#3b82f6'} height={40} />
              </div>
            )}

            {/* Allocation bar */}
            <div style={{ marginBottom:18 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
                <span style={{ fontSize:10, color:'#9ca3af', letterSpacing:'0.04em' }}>자산 배분</span>
                <span style={{ fontSize:10, color:'#9ca3af' }}>현금 {cashPct.toFixed(1)}% · 주식 {stockPct.toFixed(1)}%</span>
              </div>
              <div style={{ display:'flex', borderRadius:6, overflow:'hidden', height:6, gap:2 }}>
                <motion.div initial={{ width:0 }} animate={{ width:`${cashPct}%` }} transition={{ duration:0.8, ease:[0.22,1,0.36,1] }}
                  style={{ height:6, background:'linear-gradient(90deg, #60a5fa, #3b82f6)', borderRadius:6 }} />
                <motion.div initial={{ width:0 }} animate={{ width:`${stockPct}%` }} transition={{ duration:0.8, delay:0.1, ease:[0.22,1,0.36,1] }}
                  style={{ height:6, background:'linear-gradient(90deg, #f87171, #ef4444)', borderRadius:6 }} />
              </div>
            </div>

            {/* Stats grid */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              <StatChip label="보유 현금" value={`${fmt(profile?.cash)}원`} sub={`${cashPct.toFixed(1)}% 비중`} />
              <StatChip label="주식 평가금액" value={`${fmt(evalAmount)}원`} sub={`${stockPct.toFixed(1)}% 비중`} />
              <StatChip label="미실현 손익" value={`${unrealizedProfit >= 0 ? '+' : ''}${fmt(unrealizedProfit)}원`}
                sub={totalInvested > 0 ? `${((unrealizedProfit/totalInvested)*100).toFixed(2)}%` : '-'} positive={unrealizedProfit >= 0} />
              <StatChip label="실현 손익" value={`${realizedProfit >= 0 ? '+' : ''}${fmt(realizedProfit)}원`} sub="매도 기준" positive={realizedProfit >= 0} />
            </div>
          </div>
        </motion.div>

        {/* ── Tabs ───────────────────────────────────────────────────────── */}
        <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible"
          style={{ display:'flex', margin:'16px 16px 12px', background:'#f1f5f9', borderRadius:18, padding:4, border:'1px solid #e5e7eb' }}>
          {[{ key:'portfolio', label:'포트폴리오', icon:'📊' }, { key:'trades', label:'거래내역', icon:'📋' }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ flex:1, padding:'11px 0', borderRadius:14, fontSize:13, fontWeight:600, cursor:'pointer', border:'none', transition:'all 0.25s ease',
              background: tab === t.key ? 'linear-gradient(135deg, #2563eb, #4f46e5)' : 'transparent',
              color: tab === t.key ? '#fff' : '#6b7280',
              boxShadow: tab === t.key ? '0 4px 20px rgba(59,130,246,0.25)' : 'none' }}>
              {t.icon} {t.label}
            </button>
          ))}
        </motion.div>

        <AnimatePresence mode="wait">
          {tab === 'portfolio' && (
            <motion.div key="portfolio" initial={{ opacity:0, x:-12 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:12 }}
              transition={{ duration:0.3, ease:[0.22,1,0.36,1] }}>

              {/* Asset History */}
              {assetHistory.length > 1 && (
                <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible"
                  style={{ margin:'0 16px 12px', borderRadius:22, overflow:'hidden',
                    background:'#ffffff', border:'1px solid #e5e7eb' }}>
                  <button onClick={() => setShowHistory(!showHistory)}
                    style={{ width:'100%', padding:'16px 18px', display:'flex', justifyContent:'space-between', alignItems:'center', background:'none', border:'none', cursor:'pointer' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:13 }}>📈</span>
                      <span style={{ fontSize:13, fontWeight:700, color:'#111827' }}>자산 변화 히스토리</span>
                      <span style={{ fontSize:10, background:'rgba(59,130,246,0.08)', color:'#2563eb', padding:'2px 8px', borderRadius:20, border:'1px solid rgba(59,130,246,0.15)' }}>
                        {assetHistory.length - 1}건
                      </span>
                    </div>
                    <motion.span animate={{ rotate: showHistory ? 180 : 0 }} transition={{ duration:0.25 }}
                      style={{ color:'#9ca3af', fontSize:12 }}>▼</motion.span>
                  </button>

                  <AnimatePresence>
                    {showHistory && (
                      <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }}
                        transition={{ duration:0.35, ease:[0.22,1,0.36,1] }} style={{ overflow:'hidden' }}>
                        <div style={{ padding:'0 18px 18px' }}>
                          {/* Peak / Trough */}
                          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:16 }}>
                            {[
                              { label:'시작', val:INITIAL_ASSET, color:'#6b7280' },
                              { label:'최고', val:Math.max(...assetHistory.map(h => h.asset)), color:'#dc2626' },
                              { label:'최저', val:Math.min(...assetHistory.map(h => h.asset)), color:'#2563eb' },
                            ].map(({ label, val, color }) => (
                              <div key={label} style={{ background:'#f8fafc', borderRadius:14, padding:'10px 12px', textAlign:'center', border:'1px solid #f3f4f6' }}>
                                <p style={{ fontSize:10, color:'#9ca3af', marginBottom:4 }}>{label}</p>
                                <p style={{ fontSize:12, fontWeight:700, color }}>{fmt(val)}원</p>
                              </div>
                            ))}
                          </div>
                          {/* Bars */}
                          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                            {assetHistory.map((h, i) => {
                              const maxA = Math.max(...assetHistory.map(x => x.asset));
                              const minA = Math.min(...assetHistory.map(x => x.asset));
                              const pct = ((h.asset - minA) / (maxA - minA || 1)) * 100;
                              const isPos = h.asset >= INITIAL_ASSET;
                              return (
                                <motion.div key={i} initial={{ opacity:0, x:-10 }} animate={{ opacity:1, x:0 }} transition={{ delay: i * 0.03 }}
                                  style={{ display:'flex', alignItems:'center', gap:8 }}>
                                  <span style={{ fontSize:10, color:'#9ca3af', width:28, textAlign:'right', flexShrink:0 }}>{h.date}</span>
                                  <div style={{ flex:1, height:24, background:'#f1f5f9', borderRadius:6, position:'relative', overflow:'hidden' }}>
                                    <motion.div initial={{ width:0 }} animate={{ width:`${Math.max(pct, 3)}%` }} transition={{ duration:0.6, delay: i * 0.03, ease:[0.22,1,0.36,1] }}
                                      style={{ height:'100%', borderRadius:6, background: isPos ? 'linear-gradient(90deg,rgba(239,68,68,0.4),rgba(239,68,68,0.2))' : 'linear-gradient(90deg,rgba(59,130,246,0.4),rgba(59,130,246,0.2))' }} />
                                    <span style={{ position:'absolute', right:8, top:0, bottom:0, display:'flex', alignItems:'center', fontSize:10, fontWeight:600, color:'#4b5563' }}>
                                      {fmt(h.asset)}원
                                    </span>
                                  </div>
                                  {h.trade && (
                                    <span style={{ fontSize:9, padding:'2px 6px', borderRadius:20, flexShrink:0, fontWeight:700,
                                      background: h.trade.type === 'buy' ? 'rgba(239,68,68,0.08)' : 'rgba(59,130,246,0.08)',
                                      color: h.trade.type === 'buy' ? '#dc2626' : '#2563eb',
                                      border:`1px solid ${h.trade.type === 'buy' ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)'}` }}>
                                      {h.trade.type === 'buy' ? '매수' : '매도'}
                                    </span>
                                  )}
                                </motion.div>
                              );
                            })}
                          </div>
                        </div>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </motion.div>
              )}

              {/* Holdings */}
              <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible" style={{ margin:'0 16px' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, padding:'0 4px' }}>
                  <p style={{ fontSize:13, fontWeight:700, color:'#374151', letterSpacing:'0.02em' }}>
                    보유 종목
                    {holdings.length > 0 && <span style={{ marginLeft:6, fontSize:11, color:'#9ca3af', fontWeight:500 }}>{holdings.length}개</span>}
                  </p>
                </div>

                {holdings.length === 0 ? (
                  <div style={{ textAlign:'center', padding:'52px 0', background:'#ffffff', borderRadius:22, border:'1px dashed #e5e7eb' }}>
                    <p style={{ fontSize:32, marginBottom:12 }}>📭</p>
                    <p style={{ fontSize:14, color:'#9ca3af', fontWeight:500, marginBottom:4 }}>보유 종목이 없습니다</p>
                    <p style={{ fontSize:11, color:'#d1d5db' }}>홈에서 주식을 검색하고 매수해보세요</p>
                  </div>
                ) : (
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {holdings.map((h, idx) => {
                      const currentPrice = prices[h.symbol] || h.avgPrice;
                      const evalAmt = currentPrice * h.quantity;
                      const profit = evalAmt - h.totalInvested;
                      const profitRate = ((profit / h.totalInvested) * 100).toFixed(2);
                      const isPos = profit >= 0;
                      const isExpanded = expandedHolding === h.id;

                      return (
                        <motion.div key={h.id} custom={idx} variants={fadeUp} initial="hidden" animate="visible"
                          style={{ borderRadius:22, overflow:'hidden', border:`1px solid ${isPos ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)'}`,
                            background:'#ffffff',
                            boxShadow: isExpanded ? `0 8px 24px ${isPos ? 'rgba(239,68,68,0.08)' : 'rgba(59,130,246,0.08)'}` : '0 1px 4px rgba(0,0,0,0.04)' }}>

                          {/* Card top accent */}
                          <div style={{ height:2, background: isPos ? 'linear-gradient(90deg,rgba(239,68,68,0.6),transparent)' : 'linear-gradient(90deg,rgba(59,130,246,0.6),transparent)' }} />

                          <div style={{ padding:'16px 18px' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:14 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                                <div style={{ width:40, height:40, borderRadius:14, background: isPos ? 'rgba(239,68,68,0.08)' : 'rgba(59,130,246,0.08)',
                                  border:`1px solid ${isPos ? 'rgba(239,68,68,0.15)' : 'rgba(59,130,246,0.15)'}`,
                                  display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:800,
                                  color: isPos ? '#dc2626' : '#2563eb' }}>
                                  {h.symbol.slice(0,2)}
                                </div>
                                <div>
                                  <p style={{ fontSize:14, fontWeight:700, color:'#111827', marginBottom:2 }}>{h.name}</p>
                                  <p style={{ fontSize:10, color:'#9ca3af' }}>{h.symbol} · {h.quantity}주</p>
                                </div>
                              </div>

                              <div style={{ textAlign:'right' }}>
                                <p style={{ fontSize:15, fontWeight:800, color:'#111827', marginBottom:2 }}>{fmt(evalAmt)}원</p>
                                <div style={{ display:'flex', alignItems:'center', gap:4, justifyContent:'flex-end' }}>
                                  <Ring pct={Math.min(Math.abs(Number(profitRate)) * 5, 100)} size={40} stroke={3}
                                    color={isPos ? '#ef4444' : '#3b82f6'} bg='#e5e7eb' />
                                  <div>
                                    <p style={{ fontSize:12, fontWeight:700, color: isPos ? '#dc2626' : '#2563eb' }}>
                                      {isPos ? '+' : ''}{profitRate}%
                                    </p>
                                    <p style={{ fontSize:10, color: isPos ? '#ef4444' : '#3b82f6' }}>
                                      {isPos ? '+' : ''}{fmt(profit)}원
                                    </p>
                                  </div>
                                </div>
                              </div>
                            </div>

                            {/* Price bar */}
                            <div style={{ marginBottom:14 }}>
                              <div style={{ display:'flex', justifyContent:'space-between', fontSize:10, color:'#9ca3af', marginBottom:6 }}>
                                <span>매수가 {fmt(h.avgPrice)}원</span>
                                <span>현재가 {fmt(currentPrice)}원</span>
                              </div>
                              <div style={{ height:4, background:'#f1f5f9', borderRadius:4, overflow:'hidden' }}>
                                <motion.div initial={{ width:0 }} animate={{ width:`${Math.min(Math.abs(Number(profitRate)) * 3, 100)}%` }}
                                  transition={{ duration:0.8, ease:[0.22,1,0.36,1] }}
                                  style={{ height:4, background: isPos ? 'linear-gradient(90deg,#ef4444,#f87171)' : 'linear-gradient(90deg,#3b82f6,#60a5fa)', borderRadius:4 }} />
                              </div>
                            </div>

                            {/* Expand toggle */}
                            <button onClick={() => setExpandedHolding(isExpanded ? null : h.id)}
                              style={{ width:'100%', background:'#f8fafc', border:'1px solid #e5e7eb', borderRadius:12, padding:'8px', fontSize:11,
                                color:'#9ca3af', cursor:'pointer', marginBottom:isExpanded ? 12 : 0, display:'flex', alignItems:'center', justifyContent:'center', gap:4 }}>
                              <motion.span animate={{ rotate: isExpanded ? 180 : 0 }} transition={{ duration:0.25 }}>▼</motion.span>
                              {isExpanded ? '상세 접기' : '상세 보기'}
                            </button>

                            <AnimatePresence>
                              {isExpanded && (
                                <motion.div initial={{ height:0, opacity:0 }} animate={{ height:'auto', opacity:1 }} exit={{ height:0, opacity:0 }}
                                  transition={{ duration:0.3, ease:[0.22,1,0.36,1] }} style={{ overflow:'hidden' }}>
                                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8, marginBottom:12 }}>
                                    {[
                                      { label:'매수금액', val:`${fmt(h.totalInvested)}원` },
                                      { label:'평가금액', val:`${fmt(evalAmt)}원` },
                                      { label:'평균단가', val:`${fmt(h.avgPrice)}원` },
                                    ].map(({ label, val }) => (
                                      <div key={label} style={{ background:'#f8fafc', borderRadius:12, padding:'10px', textAlign:'center', border:'1px solid #f3f4f6' }}>
                                        <p style={{ fontSize:9, color:'#9ca3af', marginBottom:4, letterSpacing:'0.04em' }}>{label}</p>
                                        <p style={{ fontSize:11, fontWeight:700, color:'#374151' }}>{val}</p>
                                      </div>
                                    ))}
                                  </div>
                                  <div style={{ display:'flex', gap:8 }}>
                                    <button onClick={() => router.push(`/?stock=${h.symbol}&name=${encodeURIComponent(h.name)}`)}
                                      style={{ flex:1, padding:'11px', background:'#f1f5f9', border:'1px solid #e5e7eb', borderRadius:14, fontSize:12, fontWeight:600, color:'#4b5563', cursor:'pointer' }}>
                                      📉 차트 보기
                                    </button>
                                    <button onClick={() => { setSellModal(h); setSellQty(String(h.quantity)); }}
                                      style={{ flex:1, padding:'11px', background:'linear-gradient(135deg,#2563eb,#4f46e5)', border:'none', borderRadius:14, fontSize:12, fontWeight:700, color:'#fff', cursor:'pointer',
                                        boxShadow:'0 4px 16px rgba(59,130,246,0.3)' }}>
                                      💸 매도하기
                                    </button>
                                  </div>
                                </motion.div>
                              )}
                            </AnimatePresence>

                            {!isExpanded && (
                              <div style={{ display:'flex', gap:8, marginTop:0 }}>
                                <button onClick={() => router.push(`/?stock=${h.symbol}&name=${encodeURIComponent(h.name)}`)}
                                  style={{ flex:1, padding:'11px', background:'#f1f5f9', border:'1px solid #e5e7eb', borderRadius:14, fontSize:12, fontWeight:600, color:'#4b5563', cursor:'pointer', marginTop:8 }}>
                                  📉 차트
                                </button>
                                <button onClick={() => { setSellModal(h); setSellQty(String(h.quantity)); }}
                                  style={{ flex:1, padding:'11px', background:'linear-gradient(135deg,#2563eb,#4f46e5)', border:'none', borderRadius:14, fontSize:12, fontWeight:700, color:'#fff', cursor:'pointer', marginTop:8,
                                    boxShadow:'0 4px 16px rgba(59,130,246,0.25)' }}>
                                  💸 매도
                                </button>
                              </div>
                            )}
                          </div>
                        </motion.div>
                      );
                    })}
                  </div>
                )}
              </motion.div>
            </motion.div>
          )}

          {tab === 'trades' && (
            <motion.div key="trades" initial={{ opacity:0, x:12 }} animate={{ opacity:1, x:0 }} exit={{ opacity:0, x:-12 }}
              transition={{ duration:0.3, ease:[0.22,1,0.36,1] }} style={{ margin:'0 16px' }}>

              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, padding:'0 4px' }}>
                <p style={{ fontSize:13, fontWeight:700, color:'#374151' }}>
                  거래 내역
                  {trades.length > 0 && <span style={{ marginLeft:6, fontSize:11, color:'#9ca3af', fontWeight:500 }}>{trades.length}건</span>}
                </p>
                {trades.length > 0 && (
                  <div style={{ display:'flex', gap:8 }}>
                    <span style={{ fontSize:10, background:'rgba(239,68,68,0.08)', color:'#dc2626', padding:'3px 8px', borderRadius:20, border:'1px solid rgba(239,68,68,0.15)' }}>
                      매수 {trades.filter(t=>t.type==='buy').length}
                    </span>
                    <span style={{ fontSize:10, background:'rgba(59,130,246,0.08)', color:'#2563eb', padding:'3px 8px', borderRadius:20, border:'1px solid rgba(59,130,246,0.15)' }}>
                      매도 {trades.filter(t=>t.type==='sell').length}
                    </span>
                  </div>
                )}
              </div>

              {trades.length === 0 ? (
                <div style={{ textAlign:'center', padding:'52px 0', background:'#ffffff', borderRadius:22, border:'1px dashed #e5e7eb' }}>
                  <p style={{ fontSize:32, marginBottom:12 }}>📭</p>
                  <p style={{ fontSize:14, color:'#9ca3af', fontWeight:500 }}>거래 내역이 없습니다</p>
                </div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
                  {trades.map((t, idx) => {
                    const date = t.createdAt?.toDate ? t.createdAt.toDate() : new Date();
                    const dateStr = `${date.getMonth()+1}/${date.getDate()} ${String(date.getHours()).padStart(2,'0')}:${String(date.getMinutes()).padStart(2,'0')}`;
                    const isBuy = t.type === 'buy';
                    return (
                      <motion.div key={t.id} custom={idx} variants={fadeUp} initial="hidden" animate="visible"
                        style={{ display:'flex', alignItems:'center', gap:12, padding:'14px 16px', background:'#ffffff',
                          borderRadius:18, border:`1px solid ${isBuy ? 'rgba(239,68,68,0.1)' : 'rgba(59,130,246,0.1)'}`,
                          boxShadow:'0 1px 4px rgba(0,0,0,0.04)' }}>
                        <div style={{ width:38, height:38, flexShrink:0, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:800, color:'#fff',
                          background: isBuy ? 'linear-gradient(135deg,#dc2626,#ef4444)' : 'linear-gradient(135deg,#2563eb,#3b82f6)',
                          boxShadow: isBuy ? '0 4px 12px rgba(239,68,68,0.25)' : '0 4px 12px rgba(59,130,246,0.25)' }}>
                          {isBuy ? '매수' : '매도'}
                        </div>
                        <div style={{ flex:1, minWidth:0 }}>
                          <p style={{ fontSize:13, fontWeight:700, color:'#111827', marginBottom:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{t.name}</p>
                          <p style={{ fontSize:10, color:'#9ca3af' }}>{fmt(t.price)}원 × {t.quantity}주 · {dateStr}</p>
                        </div>
                        <div style={{ textAlign:'right', flexShrink:0 }}>
                          <p style={{ fontSize:13, fontWeight:700, color:'#111827', marginBottom:2 }}>{fmt(t.amount)}원</p>
                          {!isBuy && (
                            <p style={{ fontSize:11, fontWeight:600, color: Number(t.profit) >= 0 ? '#dc2626' : '#2563eb' }}>
                              {Number(t.profit) >= 0 ? '+' : ''}{fmt(t.profit)}원
                            </p>
                          )}
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* ── Sell Modal ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {sellModal && (
          <>
            <motion.div initial={{ opacity:0 }} animate={{ opacity:1 }} exit={{ opacity:0 }}
              onClick={() => { setSellModal(null); setSellQty(''); }}
              style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', backdropFilter:'blur(6px)', zIndex:50 }} />

            <motion.div initial={{ y:'100%', opacity:0 }} animate={{ y:0, opacity:1 }} exit={{ y:'100%', opacity:0 }}
              transition={{ type:'spring', damping:28, stiffness:300 }}
              style={{ position:'fixed', bottom:0, left:'50%', transform:'translateX(-50%)', width:'100%', maxWidth:480,
                background:'linear-gradient(180deg, #ffffff 0%, #f8fafc 100%)',
                borderRadius:'28px 28px 0 0', zIndex:51, padding:'0 0 40px',
                border:'1px solid rgba(59,130,246,0.12)', borderBottom:'none',
                boxShadow:'0 -8px 32px rgba(0,0,0,0.1)' }}>

              {/* Handle */}
              <div style={{ display:'flex', justifyContent:'center', padding:'16px 0 0' }}>
                <div style={{ width:40, height:4, background:'#d1d5db', borderRadius:4 }} />
              </div>

              {/* Top accent */}
              <div style={{ height:1, background:'linear-gradient(90deg,transparent,rgba(59,130,246,0.3),transparent)', margin:'12px 0 0' }} />

              <div style={{ padding:'20px 22px' }}>
                {/* Header */}
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20 }}>
                  <div>
                    <p style={{ fontSize:11, color:'#9ca3af', letterSpacing:'0.06em', textTransform:'uppercase', marginBottom:4 }}>매도 주문</p>
                    <p style={{ fontSize:18, fontWeight:800, color:'#111827', marginBottom:2 }}>{sellModal.name}</p>
                    <p style={{ fontSize:11, color:'#9ca3af' }}>보유 {sellModal.quantity}주 · 평균 {fmt(sellModal.avgPrice)}원</p>
                  </div>
                  <div style={{ textAlign:'right', background:'#f8fafc', borderRadius:16, padding:'10px 14px', border:'1px solid #e5e7eb' }}>
                    <p style={{ fontSize:16, fontWeight:800, color:'#111827', marginBottom:2 }}>{fmt(prices[sellModal.symbol] || sellModal.avgPrice)}원</p>
                    <p style={{ fontSize:10, color:'#9ca3af' }}>현재가</p>
                  </div>
                </div>

                {/* Quantity input */}
                <div style={{ marginBottom:16 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                    <p style={{ fontSize:11, fontWeight:600, color:'#6b7280', letterSpacing:'0.04em' }}>매도 수량</p>
                    <p style={{ fontSize:11, color:'#9ca3af' }}>최대 {sellModal.quantity}주</p>
                  </div>
                  <input type="number" value={sellQty} onChange={e => setSellQty(e.target.value)}
                    max={sellModal.quantity} placeholder="0"
                    style={{ width:'100%', padding:'14px 16px', background:'#f8fafc', border:'1px solid #e5e7eb',
                      borderRadius:16, fontSize:16, fontWeight:700, color:'#111827', outline:'none', boxSizing:'border-box',
                      WebkitAppearance:'none' }} />
                  <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginTop:8 }}>
                    {[{ label:'10%', pct:10 },{ label:'25%', pct:25 },{ label:'50%', pct:50 },{ label:'전량', pct:100 }].map(({ label, pct }) => {
                      const qty = pct === 100 ? sellModal.quantity : Math.floor(sellModal.quantity * pct / 100);
                      return (
                        <button key={pct} onClick={() => setSellQty(String(qty))}
                          style={{ padding:'9px 0', background:'#f1f5f9', border:'1px solid #e5e7eb', borderRadius:12,
                            fontSize:12, fontWeight:600, color:'#6b7280', cursor:'pointer' }}>
                          {label}
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Preview */}
                <AnimatePresence>
                  {sellQty && Number(sellQty) > 0 && (
                    <motion.div initial={{ opacity:0, height:0 }} animate={{ opacity:1, height:'auto' }} exit={{ opacity:0, height:0 }}
                      style={{ overflow:'hidden', marginBottom:16 }}>
                      {(() => {
                        const price = prices[sellModal.symbol] || sellModal.avgPrice;
                        const sellAmt = price * Number(sellQty);
                        const buyAmt = sellModal.avgPrice * Number(sellQty);
                        const profit = sellAmt - buyAmt;
                        const rate = ((profit / buyAmt) * 100).toFixed(2);
                        return (
                          <div style={{ background:'#f8fafc', borderRadius:18, padding:'16px', border:'1px solid #e5e7eb' }}>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                              <span style={{ fontSize:12, color:'#9ca3af' }}>매도가격</span>
                              <span style={{ fontSize:12, fontWeight:700, color:'#111827' }}>{fmt(price)}원</span>
                            </div>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                              <span style={{ fontSize:12, color:'#9ca3af' }}>총 매도금액</span>
                              <span style={{ fontSize:14, fontWeight:800, color:'#111827' }}>{fmt(sellAmt)}원</span>
                            </div>
                            <div style={{ height:1, background:'#e5e7eb', marginBottom:10 }} />
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                              <span style={{ fontSize:12, color:'#9ca3af' }}>실현 손익</span>
                              <span style={{ fontSize:13, fontWeight:800, color: profit >= 0 ? '#dc2626' : '#2563eb' }}>
                                {profit >= 0 ? '+' : ''}{fmt(profit)}원 ({profit >= 0 ? '+' : ''}{rate}%)
                              </span>
                            </div>
                            <div style={{ display:'flex', justifyContent:'space-between' }}>
                              <span style={{ fontSize:12, color:'#9ca3af' }}>매도 후 잔액</span>
                              <span style={{ fontSize:12, fontWeight:700, color:'#374151' }}>{fmt(profile.cash + sellAmt)}원</span>
                            </div>
                          </div>
                        );
                      })()}
                    </motion.div>
                  )}
                </AnimatePresence>

                {/* Actions */}
                <div style={{ display:'flex', gap:10 }}>
                  <button onClick={() => { setSellModal(null); setSellQty(''); }}
                    style={{ padding:'15px 22px', background:'#f1f5f9', border:'1px solid #e5e7eb', borderRadius:18, fontSize:13, fontWeight:600, color:'#6b7280', cursor:'pointer' }}>
                    취소
                  </button>
                  <button onClick={() => handleSell(sellModal, Number(sellQty))}
                    disabled={processing || !sellQty || Number(sellQty) > sellModal.quantity || Number(sellQty) <= 0}
                    style={{ flex:1, padding:'15px', background: processing ? 'rgba(59,130,246,0.3)' : 'linear-gradient(135deg,#2563eb,#4f46e5)',
                      border:'none', borderRadius:18, fontSize:14, fontWeight:800, color:'#fff', cursor: processing ? 'not-allowed' : 'pointer',
                      opacity: (!sellQty || Number(sellQty) > sellModal.quantity || Number(sellQty) <= 0) ? 0.4 : 1,
                      boxShadow: processing ? 'none' : '0 6px 20px rgba(59,130,246,0.3)', transition:'all 0.2s' }}>
                    {processing ? (
                      <span style={{ display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                        <motion.span animate={{ rotate:360 }} transition={{ repeat:Infinity, duration:0.8, ease:'linear' }}
                          style={{ display:'inline-block', width:14, height:14, border:'2px solid rgba(255,255,255,0.3)', borderTopColor:'#fff', borderRadius:'50%' }} />
                        처리 중
                      </span>
                    ) : '매도 확정'}
                  </button>
                </div>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
