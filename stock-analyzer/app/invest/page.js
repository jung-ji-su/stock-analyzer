'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import {
  doc, getDoc, setDoc, collection,
  getDocs,
  query, where, orderBy, serverTimestamp
} from 'firebase/firestore';
import { motion } from 'framer-motion';
import { Page, PageHeader, Segmented, Empty, Skel, Sheet, Avatar, CARD, DARK_CARD, H2, MUTED, UP, DOWN, fade, signColor } from '@/components/ui';
import { useToast } from '@/components/Toast';
import { prepareOrder, executeFill } from '@/lib/paperTrade';
import OpenOrders from '@/components/OpenOrders';
import PerformanceReport from '@/components/PerformanceReport';
import { fetchPrices as fetchTossPrices, fetchFxRate } from '@/lib/toss';
import { fmtPx, isUsHolding, toKrwView } from '@/lib/currency';

const INITIAL_ASSET = 10000000;

const fmt = (n) => Math.round(n).toLocaleString('ko-KR');

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
    <svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" fill="none">
      <polyline points={pts} stroke={color} strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinejoin="round" strokeLinecap="round" opacity="0.85" />
      <polygon points={`${pts} ${w},${h} 0,${h}`} fill={color} opacity="0.10" />
    </svg>
  );
}

export default function InvestPage() {
  const { addToast } = useToast();
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState('portfolio');
  const [profile, setProfile] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [trades, setTrades] = useState([]);
  const [prices, setPrices] = useState({}); // 종목별 현지통화 현재가 (미국은 달러)
  const [fx, setFx] = useState(null); // 원/달러
  const [loading, setLoading] = useState(true);
  const [sellModal, setSellModal] = useState(null);
  const [sellQty, setSellQty] = useState('');
  const [processing, setProcessing] = useState(false);
  const [assetHistory, setAssetHistory] = useState([]);
  const [showHistory, setShowHistory] = useState(false);
  const [expandedHolding, setExpandedHolding] = useState(null);
  const [koreanNames, setKoreanNames] = useState({});

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    initProfile();
  }, [user]);

  useEffect(() => {
    if (holdings.length > 0) {
      fetchPrices();
      fetchKoreanNames(holdings);
    }
  }, [holdings]);

  // 대기 주문이 체결·취소되면 화면 데이터를 다시 읽는다
  useEffect(() => {
    if (!user) return;
    const reload = async () => {
      try {
        const snap = await getDoc(doc(db, 'profiles', user.uid));
        if (snap.exists()) setProfile(snap.data());
        await loadHoldings(); await loadTrades(); await loadAssetHistory();
      } catch (e) { console.error(e); }
    };
    window.addEventListener('paper-orders-changed', reload);
    return () => window.removeEventListener('paper-orders-changed', reload);
  }, [user]);

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
        // 수수료·세금이 반영된 거래는 cashDelta 로, 이전 거래는 amount 로 계산
        const delta = t.cashDelta ?? (t.type === 'buy' ? -t.amount : t.amount);
        if (t.type === 'buy') {
          cash += delta;
          if (!hMap[t.symbol]) hMap[t.symbol] = { qty: 0, avgPrice: 0 };
          const ex = hMap[t.symbol];
          const newQty = ex.qty + t.quantity;
          hMap[t.symbol] = { qty: newQty, avgPrice: (ex.avgPrice * ex.qty + t.price * (t.market === 'US' ? t.fx || 1 : 1) * t.quantity) / newQty }; // 미국은 거래 당시 환율로 원화 환산
        } else {
          cash += delta;
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

  const fetchKoreanNames = async (holdingsList) => {
    const map = {};
    await Promise.all(holdingsList.map(async (h) => {
      try {
        const res = await fetch(`/api/naver-stock?symbol=${h.symbol}`);
        const data = await res.json();
        if (data.koreanName) map[h.symbol] = data.koreanName;
      } catch {}
    }));
    setKoreanNames(prev => ({ ...prev, ...map }));
  };

  const fetchPrices = async () => {
    const newPrices = {};
    const usSyms = holdings.filter(isUsHolding).map((h) => h.symbol);
    if (usSyms.length) {
      // 미국 보유 종목은 토스 시세 + 환율 (실패하면 투자원금 기준으로 평가)
      try { for (const [sym, p] of await fetchTossPrices(usSyms)) newPrices[sym] = p; } catch {}
      try { setFx(await fetchFxRate()); } catch {}
    }
    await Promise.all(holdings.filter((h) => !isUsHolding(h)).map(async (h) => {
      try {
        const res = await fetch(`/api/stock?symbol=${h.symbol}&timeframe=daily`);
        const data = await res.json();
        if (data.currentPrice) newPrices[h.symbol] = data.currentPrice;
      } catch {}
    }));
    setPrices(newPrices);
  };

  const handleSell = async (holding, qty) => {
    setProcessing(true);
    try {
      const { price } = await prepareOrder({
        symbol: holding.symbol, name: holding.name, type: 'sell', priceType: 'market', us: isUsHolding(holding),
        fallbackPrice: prices[holding.symbol] || (isUsHolding(holding) ? holding.usdAvg : holding.avgPrice),
      });
      const r = await executeFill({ uid: user.uid, symbol: holding.symbol, name: holding.name, type: 'sell', price, qty, orderType: 'market', us: isUsHolding(holding) });
      setProfile(prev => ({ ...prev, cash: prev.cash + r.cashDelta }));
      setSellModal(null); setSellQty('');
      await loadHoldings(); await loadTrades(); await loadAssetHistory();
    } catch (e) { console.error(e); addToast(e.message || '매도 실패', 'error'); }
    finally { setProcessing(false); }
  };

  // 화면 계산은 모두 원화 기준: 미국 종목은 달러 시세×환율, 평균단가는 투자원금÷수량
  const { prices: pk, holdings: hs } = toKrwView(holdings, prices, fx);
  const evalAmount = hs.reduce((sum, h) => sum + (pk[h.symbol] || h.avgPrice) * h.quantity, 0);
  const totalAsset = (profile?.cash || 0) + evalAmount;
  const totalInvested = holdings.reduce((sum, h) => sum + h.totalInvested, 0);
  const unrealizedProfit = evalAmount - totalInvested;
  const totalReturn = profile ? ((totalAsset - profile.initialAsset) / profile.initialAsset * 100).toFixed(2) : 0;
  const realizedProfit = trades.filter(t => t.type === 'sell').reduce((sum, t) => sum + (t.profit || 0), 0);
  const sparkData = assetHistory.map(h => h.asset);
  const cashPct = totalAsset > 0 ? (profile?.cash / totalAsset) * 100 : 100;
  const stockPct = totalAsset > 0 ? (evalAmount / totalAsset) * 100 : 0;

  const totalUp = Number(totalReturn) >= 0;
  const pickHolding = (h) => setExpandedHolding(expandedHolding === h.id ? null : h.id);
  const goChart = (h) => router.push(`/?stock=${h.symbol}&name=${encodeURIComponent(koreanNames[h.symbol] || h.name)}`);

  // ── Loading ──────────────────────────────────────────────────────────────
  if (loading) return (
    <Page max={480}>
      <PageHeader title="💰 모의투자" sub="가상 자산 1,000만 원으로 연습하는 투자" />
      <Skel h={230} r={20} />
      <Skel h={44} r={14} />
      <Skel h={220} r={20} />
    </Page>
  );

  return (
    <Page max={480}>
      <PageHeader title="💰 모의투자" sub="가상 자산 1,000만 원으로 연습하는 투자" />

      {/* 총 자산 */}
      <motion.div {...fade} style={DARK_CARD}>
        <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: totalUp ? 'rgba(239,68,68,0.18)' : 'rgba(59,130,246,0.22)', filter: 'blur(48px)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative', padding: '18px 18px 16px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: 600 }}>총 자산</span>
            <span style={{ fontSize: 12, fontWeight: 800, color: totalUp ? '#fca5a5' : '#93c5fd', background: 'rgba(255,255,255,0.08)', borderRadius: 999, padding: '3px 10px' }}>
              {totalUp ? '▲' : '▼'} {Math.abs(Number(totalReturn)).toFixed(2)}%
            </span>
          </div>
          <p style={{ fontSize: 30, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em', lineHeight: 1.1, margin: '0 0 4px', fontVariantNumeric: 'tabular-nums' }}>
            {fmt(totalAsset)}<span style={{ fontSize: 14, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginLeft: 4 }}>원</span>
          </p>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0 }}>
            시작 {fmt(profile?.initialAsset)}원 대비 <span style={{ color: totalUp ? '#fca5a5' : '#93c5fd', fontWeight: 700 }}>{totalUp ? '+' : ''}{fmt(totalAsset - (profile?.initialAsset || 0))}원</span>
          </p>
          {sparkData.length > 2 && (
            <div style={{ margin: '14px 0 2px' }}>
              <Sparkline data={sparkData} color={totalUp ? '#fca5a5' : '#93c5fd'} height={42} />
            </div>
          )}
          <div style={{ margin: '14px 0' }}>
            <div style={{ display: 'flex', height: 6, borderRadius: 3, overflow: 'hidden', background: 'rgba(255,255,255,0.08)' }}>
              <div style={{ width: `${stockPct}%`, background: '#a5b4fc', transition: 'width 0.6s ease' }} />
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 5 }}>
              <span>주식 {stockPct.toFixed(1)}%</span><span>현금 {cashPct.toFixed(1)}%</span>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
            {[
              ['보유 현금', `${fmt(profile?.cash)}원`, null],
              ['주식 평가', `${fmt(evalAmount)}원`, null],
              ['평가 손익', `${unrealizedProfit >= 0 ? '+' : ''}${fmt(unrealizedProfit)}원`, unrealizedProfit, totalInvested > 0 ? `${((unrealizedProfit / totalInvested) * 100).toFixed(2)}%` : null],
              ['실현 손익', `${realizedProfit >= 0 ? '+' : ''}${fmt(realizedProfit)}원`, realizedProfit, '매도 기준'],
            ].map(([label, val, sign, sub]) => (
              <div key={label} style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: '9px 11px' }}>
                <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: '0 0 2px' }}>{label}</p>
                <p style={{ fontSize: 14, fontWeight: 800, margin: 0, fontVariantNumeric: 'tabular-nums', color: sign == null ? '#fff' : sign >= 0 ? '#fca5a5' : '#93c5fd' }}>{val}</p>
                {sub && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', margin: '1px 0 0' }}>{sub}</p>}
              </div>
            ))}
          </div>
        </div>
      </motion.div>

      <Segmented value={tab} onChange={setTab}
        items={[['portfolio', `보유 ${holdings.length || ''}`.trim()], ['trades', '거래내역'], ['report', '성과']]} />

      <motion.div key={tab} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}
        style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {tab === 'portfolio' && (holdings.length === 0 ? (
          <Empty title="보유 종목이 없어요" sub="홈에서 종목을 검색하고 매수해 보세요" />
        ) : (
          <div style={{ ...CARD, padding: '4px 16px' }}>
            {hs.map((h, i) => {
              const currentPrice = pk[h.symbol] || h.avgPrice;
              const evalAmt = currentPrice * h.quantity;
              const profit = evalAmt - h.totalInvested;
              const profitRate = h.totalInvested ? (profit / h.totalInvested) * 100 : 0;
              const open = expandedHolding === h.id;
              const name = koreanNames[h.symbol] || h.name;
              const usH = isUsHolding(h);
              return (
                <div key={h.id} style={{ borderTop: i ? '1px solid #f1f5f9' : 'none' }}>
                  <button onClick={() => pickHolding(h)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '13px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <Avatar name={name} symbol={h.symbol} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{name}</p>
                      <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>{h.quantity}주 · 평균 {usH ? fmtPx(h.usdAvg, true) : `${fmt(h.avgPrice)}원`}</p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                      <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', margin: '0 0 2px' }}>{fmt(evalAmt)}원</p>
                      <p style={{ fontSize: 12, fontWeight: 700, color: signColor(profit), margin: 0 }}>{profit >= 0 ? '+' : ''}{fmt(profit)} ({profitRate >= 0 ? '+' : ''}{profitRate.toFixed(2)}%)</p>
                    </div>
                  </button>
                  {open && (
                    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ overflow: 'hidden' }}>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 8 }}>
                        {[['투자원금', `${fmt(h.totalInvested)}원`], ['현재가', usH && prices[h.symbol] ? fmtPx(prices[h.symbol], true) : `${fmt(currentPrice)}원`], ['평균단가', usH ? fmtPx(h.usdAvg, true) : `${fmt(h.avgPrice)}원`]].map(([l, v]) => (
                          <div key={l} style={{ background: '#f8fafc', borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
                            <p style={{ fontSize: 10, color: MUTED, margin: '0 0 2px' }}>{l}</p>
                            <p style={{ fontSize: 12, fontWeight: 700, color: '#334155', margin: 0 }}>{v}</p>
                          </div>
                        ))}
                      </div>
                      <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                        <button onClick={() => goChart(h)}
                          style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: 'none', background: '#f1f5f9', color: '#334155', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>📈 차트</button>
                        <button onClick={() => { setSellModal(h); setSellQty(String(h.quantity)); }}
                          style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: 'none', background: DOWN, color: '#fff', fontSize: 13, fontWeight: 800, cursor: 'pointer' }}>매도</button>
                      </div>
                    </motion.div>
                  )}
                </div>
              );
            })}
          </div>
        ))}

        {tab === 'portfolio' && assetHistory.length > 1 && (
          <div style={CARD}>
            <button onClick={() => setShowHistory(!showHistory)}
              style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'none', border: 'none', padding: 0, cursor: 'pointer' }}>
              <span style={H2}>📈 자산 변화 <span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>{assetHistory.length - 1}건</span></span>
              <span style={{ fontSize: 12, color: MUTED }}>{showHistory ? '접기' : '펼치기'}</span>
            </button>
            {showHistory && (() => {
              const maxA = Math.max(...assetHistory.map((x) => x.asset)), minA = Math.min(...assetHistory.map((x) => x.asset));
              return (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ marginTop: 12 }}>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
                    {[['시작', INITIAL_ASSET, '#334155'], ['최고', maxA, UP], ['최저', minA, DOWN]].map(([l, v, c]) => (
                      <div key={l} style={{ background: '#f8fafc', borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
                        <p style={{ fontSize: 10, color: MUTED, margin: '0 0 2px' }}>{l}</p>
                        <p style={{ fontSize: 12, fontWeight: 700, color: c, margin: 0 }}>{fmt(v)}원</p>
                      </div>
                    ))}
                  </div>
                  {assetHistory.map((h, i) => {
                    const pct = ((h.asset - minA) / (maxA - minA || 1)) * 100;
                    return (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 10, color: MUTED, width: 30, textAlign: 'right', flexShrink: 0 }}>{h.date}</span>
                        <div style={{ flex: 1, height: 22, background: '#f1f5f9', borderRadius: 6, position: 'relative', overflow: 'hidden' }}>
                          <div style={{ width: `${Math.max(pct, 3)}%`, height: '100%', borderRadius: 6, background: h.asset >= INITIAL_ASSET ? 'rgba(239,68,68,0.22)' : 'rgba(59,130,246,0.22)' }} />
                          <span style={{ position: 'absolute', right: 8, top: 0, bottom: 0, display: 'flex', alignItems: 'center', fontSize: 10, fontWeight: 600, color: '#475569' }}>{fmt(h.asset)}원</span>
                        </div>
                        <span style={{ width: 28, fontSize: 10, fontWeight: 700, flexShrink: 0, color: h.trade ? (h.trade.type === 'buy' ? UP : DOWN) : 'transparent' }}>{h.trade ? (h.trade.type === 'buy' ? '매수' : '매도') : ''}</span>
                      </div>
                    );
                  })}
                </motion.div>
              );
            })()}
          </div>
        )}

        {tab === 'report' && (
          <PerformanceReport trades={trades} holdings={hs} prices={pk} fx={fx} initial={profile?.initialAsset || INITIAL_ASSET} />
        )}

        {tab === 'trades' && (
          <>
            <OpenOrders uid={user.uid} />
            {trades.length === 0 ? (
              <Empty title="거래 내역이 없어요" />
            ) : (
              <div style={{ ...CARD, padding: '12px 16px 4px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <span style={H2}>거래 내역 <span style={{ fontSize: 12, fontWeight: 600, color: MUTED }}>{trades.length}건</span></span>
                  <span style={{ fontSize: 11, color: MUTED }}>매수 {trades.filter((t) => t.type === 'buy').length} · 매도 {trades.filter((t) => t.type === 'sell').length}</span>
                </div>
                {trades.map((t, i) => {
                  const date = t.createdAt?.toDate ? t.createdAt.toDate() : new Date();
                  const dateStr = `${date.getMonth() + 1}/${date.getDate()} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                  const isBuy = t.type === 'buy';
                  return (
                    <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '11px 0', borderTop: i ? '1px solid #f1f5f9' : 'none' }}>
                      <span style={{ flexShrink: 0, fontSize: 11, fontWeight: 800, padding: '4px 8px', borderRadius: 8, background: isBuy ? '#fef2f2' : '#eff6ff', color: isBuy ? '#dc2626' : '#2563eb' }}>{isBuy ? '매수' : '매도'}</span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.name}</p>
                        <p style={{ fontSize: 11, color: MUTED, margin: 0 }}>{fmtPx(t.price, t.market === 'US')} × {t.quantity}주 · {dateStr}</p>
                      </div>
                      <div style={{ textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                        <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: '0 0 2px' }}>{t.market === 'US' ? fmtPx(t.amount, true) : `${fmt(t.amount)}원`}</p>
                        {!isBuy && <p style={{ fontSize: 11, fontWeight: 700, color: signColor(Number(t.profit)), margin: 0 }}>{Number(t.profit) >= 0 ? '+' : ''}{fmt(t.profit)}원</p>}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </motion.div>

      {/* 매도 시트 */}
      <Sheet open={!!sellModal} onClose={() => { setSellModal(null); setSellQty(''); }}>
        {sellModal && (() => {
          const price = pk[sellModal.symbol] || sellModal.avgPrice;
          const q = Number(sellQty);
          const valid = q > 0 && q <= sellModal.quantity;
          const sellAmt = price * (q || 0), buyAmt = sellModal.avgPrice * (q || 0), profit = sellAmt - buyAmt;
          return (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
                <div>
                  <p style={{ fontSize: 12, color: MUTED, margin: '0 0 2px' }}>매도 주문 · 시장가</p>
                  <p style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', margin: '0 0 2px' }}>{koreanNames[sellModal.symbol] || sellModal.name}</p>
                  <p style={{ fontSize: 12, color: MUTED, margin: 0 }}>보유 {sellModal.quantity}주 · 평균 {fmt(sellModal.avgPrice)}원</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 11, color: MUTED, margin: '0 0 2px' }}>현재가</p>
                  <p style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', margin: 0 }}>{fmt(price)}원</p>
                </div>
              </div>
              <input type="number" inputMode="numeric" value={sellQty} onChange={(e) => setSellQty(e.target.value)} placeholder="수량"
                style={{ width: '100%', boxSizing: 'border-box', padding: '13px 14px', borderRadius: 14, border: '1.5px solid #e2e8f0', fontSize: 16, fontWeight: 700, color: '#0f172a', outline: 'none' }} />
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 6, margin: '8px 0 14px' }}>
                {[10, 25, 50, 100].map((p) => (
                  <button key={p} onClick={() => setSellQty(String(p === 100 ? sellModal.quantity : Math.floor(sellModal.quantity * p / 100)))}
                    style={{ padding: '8px 0', borderRadius: 10, border: 'none', background: '#f1f5f9', fontSize: 12, fontWeight: 700, color: '#475569', cursor: 'pointer' }}>{p === 100 ? '전량' : `${p}%`}</button>
                ))}
              </div>
              {valid && (
                <div style={{ background: '#f8fafc', borderRadius: 14, padding: '12px 14px', marginBottom: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {[['예상 매도금액', `${fmt(sellAmt)}원`, '#0f172a'], ['예상 손익', `${profit >= 0 ? '+' : ''}${fmt(profit)}원 (${buyAmt ? ((profit / buyAmt) * 100).toFixed(2) : 0}%)`, signColor(profit)], ['매도 후 현금', `${fmt((profile?.cash || 0) + sellAmt)}원`, '#475569']].map(([l, v, c]) => (
                    <div key={l} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13 }}>
                      <span style={{ color: MUTED }}>{l}</span><span style={{ fontWeight: 800, color: c }}>{v}</span>
                    </div>
                  ))}
                  <p style={{ fontSize: 10, color: MUTED, margin: '2px 0 0' }}>수수료·세금은 체결 때 반영돼요</p>
                </div>
              )}
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setSellModal(null); setSellQty(''); }}
                  style={{ padding: '14px 20px', borderRadius: 14, border: 'none', background: '#f1f5f9', color: '#475569', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}>취소</button>
                <button onClick={() => handleSell(sellModal, q)} disabled={processing || !valid}
                  style={{ flex: 1, padding: '14px 0', borderRadius: 14, border: 'none', fontSize: 15, fontWeight: 800, cursor: processing || !valid ? 'not-allowed' : 'pointer', color: '#fff', background: processing || !valid ? '#cbd5e1' : DOWN }}>
                  {processing ? '처리 중…' : '매도하기'}
                </button>
              </div>
            </>
          );
        })()}
      </Sheet>
    </Page>
  );
}
