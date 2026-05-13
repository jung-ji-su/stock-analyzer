'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, getDocs } from 'firebase/firestore';

export default function RankingPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [rankings, setRankings] = useState([]);
  const [rankType, setRankType] = useState('totalReturn');
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState(null);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    loadRankings();
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
      const symbols = [...new Set(allHoldings.map(h => h.symbol))];
      const prices = {};
      const koreanNames = {};

      await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const res = await fetch(`/api/naver-stock?symbol=${symbol}`);
            const data = await res.json();
            if (data.koreanName) koreanNames[symbol] = data.koreanName;
            if (data.currentPrice) {
              const price = typeof data.currentPrice === 'string'
                ? Number(data.currentPrice.replace(/,/g, ''))
                : Number(data.currentPrice);
              if (!isNaN(price) && price > 0) prices[symbol] = price;
            }
          } catch (e) { /* ignore */ }
        })
      );

      const rankData = profiles.map(profile => {
        const userHoldings = allHoldings.filter(h => h.userId === profile.uid);
        const userTrades = allTrades.filter(t => t.userId === profile.uid);
        const evalAmount = userHoldings.reduce((sum, h) => {
          const price = prices[h.symbol] || h.avgPrice;
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
          const currentPrice = prices[h.symbol] || h.avgPrice;
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

  const TABS = [
    { key: 'totalReturn', label: '📈 수익률' },
    { key: 'totalAsset',  label: '💰 총자산' },
    { key: 'winRate',     label: '🎯 승률' },
  ];

  return (
    <main style={{ minHeight: '100vh', background: '#F1F5F9', paddingBottom: 88 }}>
      <style jsx global>{`
        @keyframes goldFloat {
          0%, 100% { transform: translateY(0px); }
          50% { transform: translateY(-5px); }
        }
        @keyframes goldGlow {
          0%, 100% { box-shadow: 0 10px 40px rgba(180,83,9,0.45), 0 4px 12px rgba(0,0,0,0.15); }
          50% { box-shadow: 0 14px 60px rgba(180,83,9,0.65), 0 6px 20px rgba(0,0,0,0.18); }
        }
        @keyframes shimmerSweep {
          0% { left: -80%; }
          100% { left: 140%; }
        }
        @keyframes fadeUp {
          from { opacity: 0; transform: translateY(14px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .champion-float { animation: goldFloat 3.5s ease-in-out infinite; }
        .champion-glow  { animation: goldGlow 2.8s ease-in-out infinite; }
        .fade-up        { animation: fadeUp 0.35s ease both; }
      `}</style>

      {/* ── Header ── */}
      <div style={{
        background: 'linear-gradient(135deg, #0F172A 0%, #1E3A5F 100%)',
        padding: '20px 16px 24px',
        position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position:'absolute', top:-35, right:-35, width:130, height:130, borderRadius:'50%', background:'rgba(251,191,36,0.07)', pointerEvents:'none' }} />
        <div style={{ position:'absolute', bottom:-20, left:10, width:90, height:90, borderRadius:'50%', background:'rgba(99,102,241,0.07)', pointerEvents:'none' }} />
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', position:'relative' }}>
          <div style={{ display:'flex', alignItems:'center', gap:12 }}>
            <div style={{
              width:44, height:44, borderRadius:14,
              background:'rgba(251,191,36,0.15)', border:'1px solid rgba(251,191,36,0.3)',
              display:'flex', alignItems:'center', justifyContent:'center', fontSize:22,
            }}>🏆</div>
            <div>
              <h1 style={{ fontSize:20, fontWeight:800, color:'#fff', margin:0, letterSpacing:'-0.5px' }}>수익률 랭킹</h1>
              <p style={{ fontSize:12, color:'rgba(255,255,255,0.4)', margin:'2px 0 0' }}>전체 {rankings.length}명 참가 중</p>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>👤 {user?.displayName}</span>
            <button onClick={logout} style={{
              fontSize:11, padding:'6px 12px', cursor:'pointer',
              background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.6)',
              borderRadius:8, border:'1px solid rgba(255,255,255,0.12)',
            }}>로그아웃</button>
          </div>
        </div>
      </div>

      <div style={{ maxWidth:640, margin:'0 auto' }}>

        {/* ── My Rank Banner ── */}
        {myRank >= 0 && (
          <div className="fade-up" style={{
            margin: '16px 16px 0',
            borderRadius: 20,
            padding: '16px 20px',
            background: myRank === 0
              ? 'linear-gradient(135deg, #92400E 0%, #D97706 50%, #F59E0B 100%)'
              : myRank <= 2
                ? 'linear-gradient(135deg, #1E3A8A 0%, #2563EB 100%)'
                : 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
            boxShadow: myRank === 0
              ? '0 8px 28px rgba(146,64,14,0.45)'
              : '0 8px 24px rgba(0,0,0,0.28)',
          }}>
            <p style={{ fontSize:10, color:'rgba(255,255,255,0.45)', margin:'0 0 8px', fontWeight:700, letterSpacing:'0.08em' }}>내 순위</p>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ lineHeight:1 }}>
                  <span style={{ fontSize:40, fontWeight:900, color:'#fff', letterSpacing:'-2px' }}>{myRank + 1}</span>
                  <span style={{ fontSize:18, fontWeight:700, color:'rgba(255,255,255,0.75)' }}>위</span>
                </div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>전체 {rankings.length}명 중</div>
              </div>
              <div style={{ textAlign:'right' }}>
                {rankType === 'winRate' ? (
                  <>
                    <div style={{ fontSize:26, fontWeight:900, color:'#fff', letterSpacing:'-1px' }}>{sorted[myRank]?.winRate}%</div>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', marginTop:2 }}>{sorted[myRank]?.winCount}승 {sorted[myRank]?.loseCount}패</div>
                  </>
                ) : (
                  <>
                    <div style={{ fontSize:26, fontWeight:900, letterSpacing:'-1px', color: myRank === 0 ? '#FCD34D' : (sorted[myRank]?.totalReturn >= 0 ? '#6EE7B7' : '#93C5FD') }}>
                      {sorted[myRank]?.totalReturn >= 0 ? '+' : ''}{sorted[myRank]?.totalReturn}%
                    </div>
                    <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', marginTop:2 }}>{sorted[myRank]?.totalAsset?.toLocaleString()}원</div>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── Filter Tabs ── */}
        <div style={{ display:'flex', margin:'14px 16px', background:'rgba(15,23,42,0.07)', borderRadius:14, padding:4, gap:4 }}>
          {TABS.map(t => (
            <button key={t.key} onClick={() => setRankType(t.key)} style={{
              flex:1, padding:'10px 4px', borderRadius:10, border:'none',
              fontSize:12, fontWeight:600, cursor:'pointer',
              background: rankType === t.key ? '#0F172A' : 'transparent',
              color: rankType === t.key ? '#fff' : '#64748B',
              transition:'all 0.2s ease',
              boxShadow: rankType === t.key ? '0 2px 8px rgba(0,0,0,0.22)' : 'none',
            }}>{t.label}</button>
          ))}
        </div>

        {/* ── Content ── */}
        {loading ? (
          <div style={{ textAlign:'center', padding:'60px 0' }}>
            <div style={{ fontSize:36, marginBottom:10 }}>🏆</div>
            <p style={{ fontSize:14, color:'#94A3B8' }}>랭킹 불러오는 중...</p>
          </div>
        ) : sorted.length === 0 ? (
          <div style={{ textAlign:'center', padding:'60px 0', fontSize:14, color:'#94A3B8' }}>
            아직 참여자가 없습니다
          </div>
        ) : (
          <div>

            {/* ── 1st Place Champion ── */}
            {sorted[0] && (
              <div style={{ margin:'0 16px 12px' }} className="fade-up">
                <button
                  onClick={() => toggle(sorted[0])}
                  className="champion-float champion-glow"
                  style={{
                    width:'100%', textAlign:'left', cursor:'pointer',
                    background: 'linear-gradient(135deg, #78350F 0%, #B45309 25%, #D97706 55%, #F59E0B 80%, #FCD34D 100%)',
                    borderRadius: 24,
                    padding: '22px 20px 18px',
                    border: '1.5px solid rgba(253,211,77,0.45)',
                    position: 'relative', overflow: 'hidden',
                  }}>
                  {/* Shine sweep */}
                  <div style={{
                    position:'absolute', top:0, bottom:0, width:'35%',
                    background:'linear-gradient(105deg, transparent 30%, rgba(255,255,255,0.22) 50%, transparent 70%)',
                    animation: 'shimmerSweep 4s ease-in-out infinite',
                    pointerEvents:'none',
                  }} />
                  <div style={{ position:'absolute', top:-25, right:-25, width:110, height:110, borderRadius:'50%', background:'rgba(255,255,255,0.07)', pointerEvents:'none' }} />
                  <div style={{ position:'absolute', bottom:-30, right:30, width:85, height:85, borderRadius:'50%', background:'rgba(0,0,0,0.08)', pointerEvents:'none' }} />

                  <div style={{ position:'relative' }}>
                    {/* Badge row */}
                    <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:14, flexWrap:'wrap' }}>
                      <span style={{ fontSize:30, filter:'drop-shadow(0 2px 6px rgba(0,0,0,0.35))' }}>👑</span>
                      <span style={{
                        fontSize:9, fontWeight:900, letterSpacing:'3px',
                        background:'rgba(0,0,0,0.22)', color:'rgba(255,255,255,0.9)',
                        padding:'4px 10px', borderRadius:6,
                      }}>CHAMPION</span>
                      {isHot(sorted[0]) && (
                        <span style={{ fontSize:9, fontWeight:700, background:'rgba(220,38,38,0.75)', color:'#fff', padding:'4px 8px', borderRadius:6 }}>HOT 🔥</span>
                      )}
                      {sorted[0].isMe && (
                        <span style={{ fontSize:9, fontWeight:700, background:'rgba(255,255,255,0.28)', color:'#fff', padding:'4px 8px', borderRadius:6 }}>나</span>
                      )}
                    </div>

                    {/* Username */}
                    <div style={{ fontSize:22, fontWeight:900, color:'#fff', marginBottom:6, letterSpacing:'-0.5px', textShadow:'0 2px 8px rgba(0,0,0,0.2)' }}>
                      {sorted[0].username}
                    </div>

                    {/* Primary metric */}
                    {rankType === 'winRate' ? (
                      <>
                        <div style={{ fontSize:50, fontWeight:900, color:'#fff', letterSpacing:'-3px', lineHeight:1, textShadow:'0 3px 12px rgba(0,0,0,0.22)' }}>
                          {sorted[0].winRate}<span style={{ fontSize:26 }}>%</span>
                        </div>
                        <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)', marginTop:5 }}>
                          승률 · {sorted[0].winCount}승 {sorted[0].loseCount}패
                        </div>
                      </>
                    ) : rankType === 'totalAsset' ? (
                      <>
                        <div style={{ fontSize:30, fontWeight:900, color:'#fff', letterSpacing:'-1px', lineHeight:1.1, textShadow:'0 3px 12px rgba(0,0,0,0.22)' }}>
                          {sorted[0].totalAsset?.toLocaleString()}원
                        </div>
                        <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)', marginTop:5 }}>
                          총자산 · {sorted[0].totalReturn >= 0 ? '+' : ''}{sorted[0].totalReturn}% 수익
                        </div>
                      </>
                    ) : (
                      <>
                        <div style={{ fontSize:52, fontWeight:900, color:'#fff', letterSpacing:'-3px', lineHeight:1, textShadow:'0 3px 14px rgba(0,0,0,0.22)' }}>
                          {sorted[0].totalReturn >= 0 ? '+' : ''}{sorted[0].totalReturn}<span style={{ fontSize:28 }}>%</span>
                        </div>
                        <div style={{ fontSize:13, color:'rgba(255,255,255,0.75)', marginTop:5 }}>
                          수익률 · {sorted[0].totalAsset?.toLocaleString()}원
                        </div>
                      </>
                    )}

                    {/* Stats chips */}
                    <div style={{ display:'flex', gap:7, marginTop:16, flexWrap:'wrap' }}>
                      {[
                        { label:'보유', value:`${sorted[0].holdingCount}종목` },
                        { label:'매도', value:`${sorted[0].tradeCount}회` },
                        sorted[0].tradeCount > 0 ? { label:'승률', value:`${sorted[0].winRate}%` } : null,
                        sorted[0].tradeCount > 0 ? { label:'평균', value:`${sorted[0].avgProfitRate >= 0 ? '+' : ''}${sorted[0].avgProfitRate}%` } : null,
                      ].filter(Boolean).map(({ label, value }) => (
                        <div key={label} style={{
                          padding:'5px 12px', borderRadius:8,
                          background:'rgba(0,0,0,0.2)',
                          fontSize:11, color:'rgba(255,255,255,0.8)', fontWeight:600,
                        }}>
                          {label} <span style={{ color:'#FCD34D', fontWeight:800 }}>{value}</span>
                        </div>
                      ))}
                    </div>

                    <div style={{ textAlign:'right', marginTop:12 }}>
                      <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>
                        {selectedUser?.uid === sorted[0].uid ? '▲ 닫기' : '▼ 포트폴리오 보기'}
                      </span>
                    </div>
                  </div>
                </button>
                {selectedUser?.uid === sorted[0].uid && (
                  <PortfolioDetail r={sorted[0]} onClose={() => setSelectedUser(null)} router={router} rankType={rankType} />
                )}
              </div>
            )}

            {/* ── 2nd & 3rd Place ── */}
            {(sorted[1] || sorted[2]) && (
              <div style={{ margin:'0 16px 12px' }} className="fade-up">
                <div style={{ display:'grid', gridTemplateColumns: sorted[1] && sorted[2] ? '1fr 1fr' : '1fr', gap:10 }}>
                  {[1, 2].map(rank => sorted[rank] && (
                    <button
                      key={rank}
                      onClick={() => toggle(sorted[rank])}
                      style={{
                        width:'100%', textAlign:'left', cursor:'pointer',
                        background: rank === 1
                          ? 'linear-gradient(145deg, #F8FAFC 0%, #E2E8F0 55%, #94A3B8 100%)'
                          : 'linear-gradient(145deg, #FFEDD5 0%, #FB923C 55%, #C2410C 100%)',
                        borderRadius: 20,
                        padding: '16px 14px',
                        border: rank === 1
                          ? '1px solid rgba(148,163,184,0.55)'
                          : '1px solid rgba(249,115,22,0.4)',
                        boxShadow: rank === 1
                          ? '0 6px 20px rgba(148,163,184,0.28)'
                          : '0 6px 20px rgba(234,88,12,0.28)',
                        position:'relative', overflow:'hidden',
                      }}>
                      <div style={{ position:'absolute', top:-15, right:-15, width:70, height:70, borderRadius:'50%', background: rank === 1 ? 'rgba(148,163,184,0.15)' : 'rgba(255,255,255,0.1)', pointerEvents:'none' }} />

                      <div style={{ position:'relative' }}>
                        <div style={{ fontSize:26, marginBottom:4, filter:'drop-shadow(0 2px 3px rgba(0,0,0,0.18))' }}>
                          {rank === 1 ? '🥈' : '🥉'}
                        </div>
                        <div style={{ fontSize:9, fontWeight:800, letterSpacing:'0.08em', color: rank === 1 ? '#64748B' : 'rgba(255,255,255,0.75)', marginBottom:5 }}>
                          {rank + 1}위
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:6 }}>
                          <span style={{ fontSize:13, fontWeight:800, color: rank === 1 ? '#1E293B' : '#fff', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', maxWidth:'80%' }}>
                            {sorted[rank].username}
                          </span>
                          {sorted[rank].isMe && (
                            <span style={{ fontSize:9, fontWeight:700, background: rank === 1 ? 'rgba(30,41,59,0.12)' : 'rgba(255,255,255,0.25)', color: rank === 1 ? '#1E293B' : '#fff', padding:'2px 5px', borderRadius:4, flexShrink:0 }}>나</span>
                          )}
                        </div>

                        {rankType === 'winRate' ? (
                          <>
                            <div style={{ fontSize:30, fontWeight:900, color: rank === 1 ? '#1E293B' : '#fff', letterSpacing:'-1.5px', lineHeight:1 }}>
                              {sorted[rank].winRate}%
                            </div>
                            <div style={{ fontSize:10, color: rank === 1 ? '#64748B' : 'rgba(255,255,255,0.7)', marginTop:3 }}>
                              {sorted[rank].winCount}승 {sorted[rank].loseCount}패
                            </div>
                          </>
                        ) : rankType === 'totalAsset' ? (
                          <>
                            <div style={{ fontSize:16, fontWeight:900, color: rank === 1 ? '#1E293B' : '#fff', letterSpacing:'-0.5px', lineHeight:1.2 }}>
                              {Math.round(sorted[rank].totalAsset / 10000)}만원
                            </div>
                            <div style={{ fontSize:10, color: rank === 1 ? '#64748B' : 'rgba(255,255,255,0.7)', marginTop:3 }}>
                              {sorted[rank].totalReturn >= 0 ? '+' : ''}{sorted[rank].totalReturn}%
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize:30, fontWeight:900, letterSpacing:'-1.5px', lineHeight:1, color: rank === 1 ? (sorted[rank].totalReturn >= 0 ? '#DC2626' : '#2563EB') : '#fff' }}>
                              {sorted[rank].totalReturn >= 0 ? '+' : ''}{sorted[rank].totalReturn}%
                            </div>
                            <div style={{ fontSize:10, color: rank === 1 ? '#64748B' : 'rgba(255,255,255,0.7)', marginTop:3 }}>
                              {sorted[rank].totalAsset?.toLocaleString()}원
                            </div>
                          </>
                        )}

                        {isHot(sorted[rank]) && (
                          <div style={{ marginTop:8 }}>
                            <span style={{ fontSize:9, fontWeight:700, background: rank === 1 ? 'rgba(220,38,38,0.1)' : 'rgba(220,38,38,0.2)', color: rank === 1 ? '#DC2626' : 'rgba(255,255,255,0.9)', padding:'3px 7px', borderRadius:5 }}>HOT 🔥</span>
                          </div>
                        )}

                        <div style={{ textAlign:'right', marginTop:10, fontSize:10, color: rank === 1 ? '#CBD5E1' : 'rgba(255,255,255,0.35)' }}>
                          {selectedUser?.uid === sorted[rank].uid ? '▲' : '▼'}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>

                {/* 2nd/3rd expansion — full width below grid */}
                {selectedUser && (selectedUser.uid === sorted[1]?.uid || selectedUser.uid === sorted[2]?.uid) && (
                  <PortfolioDetail r={selectedUser} onClose={() => setSelectedUser(null)} router={router} rankType={rankType} />
                )}
              </div>
            )}

            {/* ── 4th–10th List ── */}
            <div style={{ display:'flex', flexDirection:'column', gap:8, margin:'0 16px' }}>
              {sorted.slice(3).map((r, i) => {
                const rank = i + 3;
                const rankNum = rank + 1;
                const isTopBlue = rank <= 4;

                return (
                  <div key={r.uid} className="fade-up" style={{ animationDelay: `${i * 0.05}s` }}>
                    <button
                      onClick={() => toggle(r)}
                      style={{
                        width:'100%', textAlign:'left', cursor:'pointer',
                        background: r.isMe ? 'linear-gradient(135deg, #EFF6FF, #DBEAFE)' : '#fff',
                        borderRadius: 16,
                        padding: '14px 16px',
                        border: r.isMe ? '1.5px solid #BFDBFE' : '1px solid #E2E8F0',
                        boxShadow: '0 2px 8px rgba(0,0,0,0.04)',
                        display:'flex', alignItems:'center', gap:12,
                      }}>
                      <div style={{
                        width:40, height:40, borderRadius:13, flexShrink:0,
                        background: isTopBlue
                          ? 'linear-gradient(135deg, #1E3A8A, #2563EB)'
                          : '#F1F5F9',
                        color: isTopBlue ? '#fff' : '#94A3B8',
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontSize:15, fontWeight:800,
                        boxShadow: isTopBlue ? '0 3px 10px rgba(30,58,138,0.32)' : 'none',
                      }}>
                        {rankNum}
                      </div>

                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ display:'flex', alignItems:'center', gap:5, flexWrap:'wrap' }}>
                          <span style={{ fontSize:14, fontWeight:700, color:'#111827' }}>{r.username}</span>
                          {r.isMe && <span style={{ fontSize:9, fontWeight:700, background:'#2563EB', color:'#fff', padding:'2px 6px', borderRadius:4 }}>나</span>}
                          {isHot(r) && <span style={{ fontSize:9, fontWeight:700, background:'#FEF2F2', color:'#DC2626', padding:'2px 6px', borderRadius:4 }}>HOT 🔥</span>}
                        </div>
                        <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>
                          {r.holdingCount}종목 보유 · 매도 {r.tradeCount}회
                        </div>
                      </div>

                      <div style={{ textAlign:'right', flexShrink:0 }}>
                        {rankType === 'winRate' ? (
                          <>
                            <div style={{ fontSize:17, fontWeight:800, color: r.winRate >= 50 ? '#EF4444' : '#2563EB' }}>{r.winRate}%</div>
                            <div style={{ fontSize:10, color:'#9CA3AF', marginTop:1 }}>{r.winCount}승 {r.loseCount}패</div>
                          </>
                        ) : rankType === 'totalAsset' ? (
                          <>
                            <div style={{ fontSize:15, fontWeight:800, color:'#111827' }}>{Math.round(r.totalAsset / 10000)}만</div>
                            <div style={{ fontSize:10, color: r.totalReturn >= 0 ? '#EF4444' : '#2563EB', marginTop:1 }}>
                              {r.totalReturn >= 0 ? '+' : ''}{r.totalReturn}%
                            </div>
                          </>
                        ) : (
                          <>
                            <div style={{ fontSize:17, fontWeight:800, color: r.totalReturn >= 0 ? '#EF4444' : '#2563EB' }}>
                              {r.totalReturn >= 0 ? '+' : ''}{r.totalReturn}%
                            </div>
                            <div style={{ fontSize:10, color:'#9CA3AF', marginTop:1 }}>{r.totalAsset?.toLocaleString()}원</div>
                          </>
                        )}
                      </div>

                      <span style={{ fontSize:12, color:'#D1D5DB', flexShrink:0 }}>
                        {selectedUser?.uid === r.uid ? '▲' : '▼'}
                      </span>
                    </button>

                    {selectedUser?.uid === r.uid && (
                      <PortfolioDetail r={r} onClose={() => setSelectedUser(null)} router={router} rankType={rankType} />
                    )}
                  </div>
                );
              })}
            </div>

          </div>
        )}
      </div>
    </main>
  );
}

/* ── Portfolio Detail Expansion ── */
function PortfolioDetail({ r, onClose, router, rankType }) {
  const totalStockVal = r.holdingsDetail.reduce((s, h) => s + h.evalAmt, 0);
  const totalPnL = r.realizedProfit + r.unrealizedProfit;

  return (
    <div style={{
      border: '1px solid #E2E8F0',
      borderRadius: 18,
      marginTop: 8,
      padding: '16px',
      background: '#fff',
      boxShadow: '0 6px 20px rgba(0,0,0,0.08)',
    }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
        <span style={{ fontSize:13, fontWeight:700, color:'#374151' }}>{r.username}의 포트폴리오</span>
        <button onClick={onClose} style={{ fontSize:11, color:'#9CA3AF', background:'none', border:'none', cursor:'pointer', padding:'4px 8px', borderRadius:6, background:'#F1F5F9' }}>닫기</button>
      </div>

      {/* Summary chips */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:7, marginBottom:14 }}>
        {[
          { label:'현금', value:`${r.cash?.toLocaleString()}원` },
          { label:'주식', value:`${totalStockVal.toLocaleString()}원` },
          {
            label: rankType === 'winRate' ? '승률' : '총손익',
            value: rankType === 'winRate'
              ? `${r.winRate}%`
              : `${totalPnL >= 0 ? '+' : ''}${totalPnL?.toLocaleString()}원`,
            color: rankType === 'winRate'
              ? (r.winRate >= 50 ? '#EF4444' : '#2563EB')
              : (totalPnL >= 0 ? '#EF4444' : '#2563EB'),
          },
        ].map(({ label, value, color }) => (
          <div key={label} style={{ background:'#F8FAFC', borderRadius:12, padding:'10px 10px' }}>
            <div style={{ fontSize:10, color:'#9CA3AF', marginBottom:3 }}>{label}</div>
            <div style={{ fontSize:12, fontWeight:700, color: color || '#111827', wordBreak:'break-all' }}>{value}</div>
          </div>
        ))}
      </div>

      {r.holdingsDetail.length === 0 ? (
        <div style={{ textAlign:'center', padding:'16px 0', color:'#9CA3AF', fontSize:13 }}>보유 종목 없음</div>
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {r.holdingsDetail.map((h, idx) => (
            <div
              key={idx}
              onClick={() => router.push(`/?stock=${h.symbol}&name=${encodeURIComponent(h.koreanName || h.symbol)}`)}
              style={{
                display:'flex', alignItems:'center', gap:10,
                padding:'11px 12px',
                background:'#F8FAFC', borderRadius:12,
                cursor:'pointer', border:'1px solid #F1F5F9',
                transition:'background 0.15s',
              }}
            >
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600, color:'#111827', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                  {h.koreanName}
                </div>
                <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>
                  {h.quantity}주 · 평균 {h.avgPrice?.toLocaleString()}원 → {h.currentPrice?.toLocaleString()}원
                </div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#111827' }}>{h.evalAmt?.toLocaleString()}원</div>
                <div style={{ fontSize:11, fontWeight:600, color: h.profit >= 0 ? '#EF4444' : '#2563EB', marginTop:1 }}>
                  {h.profit >= 0 ? '+' : ''}{h.profit?.toLocaleString()}원 ({h.profit >= 0 ? '+' : ''}{h.profitRate}%)
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
