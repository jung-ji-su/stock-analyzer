'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';
import { toKrwView } from '@/lib/currency';
import { fetchHoldingQuotes } from '@/lib/quotes';
import { motion } from 'framer-motion';
import { Page, PageHeader, Segmented, Empty, Skel, CARD, DARK_CARD, MUTED, fade, signColor } from '@/components/ui';

export default function RankingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [rankings, setRankings] = useState([]);
  const [rankType, setRankType] = useState('totalReturn');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    loadRankings();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- 의도적으로 표시한 값이 바뀔 때만 실행 (함수는 매 렌더 새로 만들어져 넣으면 무한 반복)
  }, [user]);

  const loadRankings = async () => {
    setLoading(true);
    try {
      const profilesSnap = await getDocs(collection(db, 'profiles'));
      const profiles = profilesSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
      const holdingsSnap = await getDocs(collection(db, 'holdings'));
      const allHoldings = holdingsSnap.docs.map(d => d.data());
      const tradesSnap = await getDocs(collection(db, 'trades'));
      const allTrades = tradesSnap.docs.map(d => d.data());
      // 현재가: 국내 네이버, 미국 토스 시세 × 환율 (토스는 본인 로그인 전용이라 실패하면 투자원금 기준)
      const { prices, names: koreanNames, fx } = await fetchHoldingQuotes(allHoldings);

      const rankData = profiles.map(profile => {
        const { prices: pk, holdings: userHoldings } = toKrwView(allHoldings.filter(h => h.userId === profile.uid), prices, fx);
        const userTrades = allTrades.filter(t => t.userId === profile.uid);
        const evalAmount = userHoldings.reduce((sum, h) => {
          const price = pk[h.symbol] || h.avgPrice;
          return sum + price * h.quantity;
        }, 0);
        const totalAsset = (profile.cash || 0) + evalAmount;
        const totalReturn = (((totalAsset - profile.initialAsset) / profile.initialAsset) * 100).toFixed(2);
        const realizedProfit = userTrades.filter(t => t.type === 'sell').reduce((sum, t) => sum + (t.profit || 0), 0);
        const sellTrades = userTrades.filter(t => t.type === 'sell');
        const winTrades = sellTrades.filter(t => (t.profit || 0) > 0);
        const winRate = sellTrades.length > 0 ? ((winTrades.length / sellTrades.length) * 100).toFixed(1) : 0;
        const avgProfitRate = sellTrades.length > 0
          ? (sellTrades.reduce((sum, t) => sum + Number(t.profitRate || 0), 0) / sellTrades.length).toFixed(2)
          : 0;
        const totalInvested = userHoldings.reduce((sum, h) => sum + h.totalInvested, 0);
        const unrealizedProfit = evalAmount - totalInvested;
        const holdingsDetail = userHoldings.map(h => {
          const currentPrice = pk[h.symbol] || h.avgPrice;
          const evalAmt = currentPrice * h.quantity;
          const profit = evalAmt - h.totalInvested;
          const profitRate = ((profit / h.totalInvested) * 100).toFixed(2);
          const correctAvgPrice = h.totalInvested / h.quantity;
          return {
            ...h, currentPrice, evalAmt, profit, profitRate,
            koreanName: koreanNames[h.symbol] || h.name,
            avgPrice: correctAvgPrice,
          };
        }).sort((a, b) => b.evalAmt - a.evalAmt);

        return {
          uid: profile.uid,
          username: profile.username,
          cash: profile.cash,
          totalAsset,
          totalReturn: Number(totalReturn),
          realizedProfit,
          unrealizedProfit,
          holdingCount: userHoldings.length,
          tradeCount: sellTrades.length,
          holdingsDetail,
          isMe: profile.uid === user.uid,
          winRate: Number(winRate),
          winCount: winTrades.length,
          loseCount: sellTrades.length - winTrades.length,
          avgProfitRate: Number(avgProfitRate),
        };
      });
      setRankings(rankData);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const getSortedRankings = () => {
    return [...rankings].sort((a, b) => {
      if (rankType === 'totalReturn') return b.totalReturn - a.totalReturn;
      if (rankType === 'totalAsset') return b.totalAsset - a.totalAsset;
      if (rankType === 'winRate') {
        if (b.winRate !== a.winRate) return b.winRate - a.winRate;
        return b.tradeCount - a.tradeCount;
      }
      return 0;
    });
  };

  const isHot = (r) => r.totalReturn > 10 || r.winRate > 70;
  const toggle = (r) => setSelectedUser(selectedUser?.uid === r.uid ? null : r);

  const sorted = getSortedRankings();
  const myRank = sorted.findIndex(r => r.isMe);

  const metric = (r) => rankType === 'winRate'
    ? { main: `${r.winRate}%`, sub: `${r.winCount}승 ${r.loseCount}패`, color: r.tradeCount ? signColor(r.winRate - 50) : '#64748b' }
    : rankType === 'totalAsset'
      ? { main: `${Math.round(r.totalAsset / 10000).toLocaleString()}만원`, sub: `${r.totalReturn >= 0 ? '+' : ''}${r.totalReturn}%`, color: '#0f172a', subColor: signColor(r.totalReturn) }
      : { main: `${r.totalReturn >= 0 ? '+' : ''}${r.totalReturn}%`, sub: `${Math.round(r.totalAsset).toLocaleString()}원`, color: signColor(r.totalReturn) };
  const me = myRank >= 0 ? sorted[myRank] : null;
  const medal = ['🥇', '🥈', '🥉'];

  return (
    <Page>
      <PageHeader title="🏆 랭킹" sub={`모의투자 참가자 ${rankings.length}명`} />

      {loading ? (
        <>
          <Skel h={110} r={20} />
          <Skel h={44} r={14} />
          <Skel h={300} r={20} />
        </>
      ) : sorted.length === 0 ? (
        <Empty icon="🏆" title="아직 참가자가 없어요" />
      ) : (
        <>
          {/* 내 순위 */}
          {me && (
            <motion.div {...fade} style={DARK_CARD}>
              <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: myRank === 0 ? 'rgba(251,191,36,0.25)' : 'rgba(99,102,241,0.22)', filter: 'blur(48px)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', padding: '16px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.55)', fontWeight: 600, margin: '0 0 4px' }}>내 순위 {myRank < 3 ? medal[myRank] : ''}</p>
                  <p style={{ margin: 0, color: '#fff', lineHeight: 1 }}>
                    <span style={{ fontSize: 36, fontWeight: 800, letterSpacing: '-1px' }}>{myRank + 1}</span>
                    <span style={{ fontSize: 15, fontWeight: 700, color: 'rgba(255,255,255,0.7)', marginLeft: 2 }}>위</span>
                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)', marginLeft: 8 }}>/ {rankings.length}명</span>
                  </p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 22, fontWeight: 800, margin: '0 0 2px', fontVariantNumeric: 'tabular-nums',
                    color: rankType === 'totalAsset' ? '#fff' : (rankType === 'winRate' ? me.winRate >= 50 : me.totalReturn >= 0) ? '#fca5a5' : '#93c5fd' }}>{metric(me).main}</p>
                  <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', margin: 0 }}>{metric(me).sub}</p>
                </div>
              </div>
            </motion.div>
          )}

          <Segmented value={rankType} onChange={(k) => { setRankType(k); setSelectedUser(null); }}
            items={[['totalReturn', '수익률'], ['totalAsset', '총자산'], ['winRate', '승률']]} />

          {/* 전체 순위 */}
          <motion.div key={rankType} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }} style={{ ...CARD, padding: '4px 16px' }}>
            {sorted.map((r, i) => {
              const m = metric(r);
              const open = selectedUser?.uid === r.uid;
              return (
                <div key={r.uid} style={{ borderTop: i ? '1px solid #f1f5f9' : 'none', margin: r.isMe ? '0 -16px' : 0, padding: r.isMe ? '0 16px' : 0, background: r.isMe ? '#f5f7ff' : 'transparent' }}>
                  <button onClick={() => toggle(r)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '13px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                    <span style={{ width: 28, flexShrink: 0, textAlign: 'center', fontSize: i < 3 ? 22 : 14, fontWeight: 800, color: MUTED }}>{i < 3 ? medal[i] : i + 1}</span>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.username}</span>
                        {r.isMe && <span style={{ fontSize: 10, fontWeight: 800, color: '#fff', background: '#6366f1', padding: '1px 6px', borderRadius: 6, flexShrink: 0 }}>나</span>}
                        {isHot(r) && <span style={{ fontSize: 10, fontWeight: 800, color: '#dc2626', background: '#fef2f2', padding: '1px 6px', borderRadius: 6, flexShrink: 0 }}>🔥</span>}
                      </div>
                      <p style={{ fontSize: 11, color: MUTED, margin: '2px 0 0' }}>{r.holdingCount}종목 보유 · 매도 {r.tradeCount}회</p>
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                      <p style={{ fontSize: 15, fontWeight: 800, color: m.color, margin: '0 0 2px' }}>{m.main}</p>
                      <p style={{ fontSize: 11, color: m.subColor || MUTED, margin: 0 }}>{m.sub}</p>
                    </div>
                  </button>
                  {open && <PortfolioDetail r={r} router={router} rankType={rankType} />}
                </div>
              );
            })}
          </motion.div>
        </>
      )}
    </Page>
  );
}

/* ── 참가자 포트폴리오 (목록 안에서 펼침) ── */
function PortfolioDetail({ r, router, rankType }) {
  const totalStockVal = r.holdingsDetail.reduce((s, h) => s + h.evalAmt, 0);
  const totalPnL = r.realizedProfit + r.unrealizedProfit;
  const won = (v) => `${Math.round(v || 0).toLocaleString()}원`;
  return (
    <motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ overflow: 'hidden', paddingBottom: 12 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 8 }}>
        {[
          ['현금', won(r.cash)],
          ['주식', won(totalStockVal)],
          rankType === 'winRate' ? ['승률', `${r.winRate}%`, signColor(r.winRate - 50)] : ['총손익', `${totalPnL >= 0 ? '+' : ''}${won(totalPnL)}`, signColor(totalPnL)],
        ].map(([label, value, color]) => (
          <div key={label} style={{ background: '#f8fafc', borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
            <p style={{ fontSize: 10, color: MUTED, margin: '0 0 2px' }}>{label}</p>
            <p style={{ fontSize: 12, fontWeight: 700, color: color || '#334155', margin: 0, wordBreak: 'break-all' }}>{value}</p>
          </div>
        ))}
      </div>
      {r.holdingsDetail.length === 0 ? (
        <p style={{ textAlign: 'center', padding: '10px 0', color: MUTED, fontSize: 12, margin: 0 }}>보유 종목 없음</p>
      ) : r.holdingsDetail.map((h, idx) => (
        <button key={idx} onClick={() => router.push(`/?stock=${h.symbol}&name=${encodeURIComponent(h.koreanName || h.symbol)}`)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 10px', marginTop: 4, background: '#f8fafc', borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left' }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 700, color: '#0f172a', margin: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{h.koreanName}</p>
            <p style={{ fontSize: 11, color: MUTED, margin: '2px 0 0' }}>{h.quantity}주 · 평균 {won(h.avgPrice)}</p>
          </div>
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <p style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', margin: 0 }}>{won(h.evalAmt)}</p>
            <p style={{ fontSize: 11, fontWeight: 700, color: signColor(h.profit), margin: '1px 0 0' }}>{h.profit >= 0 ? '+' : ''}{h.profitRate}%</p>
          </div>
        </button>
      ))}
    </motion.div>
  );
}
