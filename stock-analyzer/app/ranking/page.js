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

  // --- 기존 로직 유지 (절대 수정 금지 구역) ---
  const loadRankings = async () => {
    setLoading(true);
    try {
      const profilesSnap = await await getDocs(collection(db, 'profiles'));
      const profiles = profilesSnap.docs.map(d => ({ uid: d.id, ...d.data() }));
      const holdingsSnap = await getDocs(collection(db, 'holdings'));
      const allHoldings = holdingsSnap.docs.map(d => d.data());
      const tradesSnap = await getDocs(collection(db, 'trades'));
      const allTrades = tradesSnap.docs.map(d => d.data());
      const symbols = [...new Set(allHoldings.map(h => h.symbol))];
      const prices = {};
      await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const res = await fetch(`/api/stock?symbol=${symbol}&timeframe=daily`);
            const data = await res.json();
            if (data.currentPrice) prices[symbol] = data.currentPrice;
          } catch { }
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
          return { ...h, currentPrice, evalAmt, profit, profitRate };
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
          tradeCount: userTrades.filter(t => t.type === 'sell').length,
          holdingsDetail,
          prices,
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
        return b.tradeCount - a.tradeCount; // 승률 같으면 거래 많은 순
      }
      return 0;
    });
  };
  // ------------------------------------------

  // UI 수정을 위한 메달 렌더링 함수 (스타일만 적용)
  const getRankEmoji = (rank, isLarge = false) => {
    const size = isLarge ? "w-14 h-14 text-3xl" : "w-10 h-10 text-2xl";

    if (rank === 0) return (
      <div className={`relative ${size} flex items-center justify-center bg-gradient-to-br from-yellow-300 via-yellow-500 to-yellow-600 rounded-full shadow-[0_0_15px_rgba(234,179,8,0.5)] animate-bounce-subtle overflow-hidden border-2 border-yellow-200`}>
        🥇
        <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/40 to-transparent -translate-x-full animate-shine" />
      </div>
    );
    if (rank === 1) return (
      <div className={`${size} flex items-center justify-center bg-gradient-to-br from-gray-100 via-gray-300 to-gray-400 rounded-full shadow-[0_0_10px_rgba(156,163,175,0.3)] animate-pulse-subtle border-2 border-gray-100`}>
        🥈
      </div>
    );
    if (rank === 2) return (
      <div className={`${size} flex items-center justify-center bg-gradient-to-br from-orange-200 via-orange-400 to-orange-500 rounded-full border-2 border-orange-200 shadow-sm`}>
        🥉
      </div>
    );

    // 4등부터: 효과 없는 회색 원형 뱃지
    return (
      <div className={`${isLarge ? 'w-10 h-10 text-lg' : 'w-8 h-8 text-xs'} bg-gray-200 text-gray-500 rounded-full flex items-center justify-center font-bold border border-gray-300`}>
        {rank + 1}
      </div>
    );
  };

  const sorted = getSortedRankings();
  const myRank = sorted.findIndex(r => r.isMe);

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      {/* 애니메이션 Keyframes */}
      <style jsx global>{`
        @keyframes shine { 0% { transform: translateX(-100%); } 100% { transform: translateX(100%); } }
        @keyframes bounce-subtle { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-5px); } }
        @keyframes pulse-subtle { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(1.05); opacity: 0.9; } }
        .animate-shine { animation: shine 2s infinite; }
        .animate-bounce-subtle { animation: bounce-subtle 3s ease-in-out infinite; }
        .animate-pulse-subtle { animation: pulse-subtle 2s ease-in-out infinite; }
      `}</style>

      <div className="max-w-3xl mx-auto">
        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">🏆 수익률 랭킹</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">👤 {user?.displayName}</span>
            <button onClick={logout} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg">로그아웃</button>
          </div>
        </div>

        {/* 내 순위 요약 */}
        {myRank >= 0 && (
          <div className={`rounded-2xl p-5 mb-4 text-white transition-colors duration-500 ${myRank === 0 ? 'bg-gradient-to-r from-yellow-600 to-yellow-500 shadow-lg' : 'bg-gray-900'}`}>
            <p className="text-xs text-gray-400 mb-2">내 순위</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-4">
                {getRankEmoji(myRank, true)}
                <div>
                  <p className="text-3xl font-bold">{myRank + 1}위</p>
                  <p className="text-sm text-gray-400 mt-1">전체 {rankings.length}명 중</p>
                </div>
              </div>
              <div className="text-right">
                {rankType === 'winRate' ? (
                  <>
                    <p className={`text-2xl font-bold ${sorted[myRank]?.winRate >= 50 ? 'text-green-400' : 'text-red-400'}`}>
                      승률 {sorted[myRank]?.winRate}%
                    </p>
                    <p className="text-sm text-gray-400">{sorted[myRank]?.winCount}승 {sorted[myRank]?.loseCount}패</p>
                  </>
                ) : (
                  <>
                    <p className={`text-2xl font-bold ${sorted[myRank]?.totalReturn >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                      {sorted[myRank]?.totalReturn >= 0 ? '+' : ''}{sorted[myRank]?.totalReturn}%
                    </p>
                    <p className="text-sm text-gray-400">{sorted[myRank]?.totalAsset?.toLocaleString()}원</p>
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* 랭킹 기준 */}
        <div className="flex bg-white rounded-2xl border border-gray-200 p-1 mb-4 gap-1">
          {[
            { key: 'totalReturn', label: '📈 수익률' },
            { key: 'totalAsset', label: '💰 총자산' },
            { key: 'winRate', label: '🎯 승률' },
          ].map(t => (
            <button key={t.key} onClick={() => setRankType(t.key)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${rankType === t.key ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {/* 랭킹 리스트 */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          {loading ? (
            <p className="text-center text-gray-400 py-8">불러오는 중...</p>
          ) : sorted.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">아직 참여자가 없습니다</p>
          ) : (
            <div className="space-y-3">
              {sorted.map((r, i) => (
                <div key={r.uid}>
                  <button
                    onClick={() => setSelectedUser(selectedUser?.uid === r.uid ? null : r)}
                    className={`w-full rounded-2xl p-4 border text-left transition-all ${r.isMe ? 'border-blue-300 bg-blue-50' : 'border-gray-100 bg-gray-50 hover:bg-gray-100'}`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-12 flex justify-center items-center">
                        {getRankEmoji(i)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-gray-900">{r.username}</p>
                          {r.isMe && <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full">나</span>}
                        </div>
                        <p className="text-xs text-gray-400">{r.holdingCount}종목 보유 · 매도 {r.tradeCount}회</p>
                      </div>
                      <div className="text-right">
                        <p className={`text-lg font-bold ${r.totalReturn >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                          {r.totalReturn >= 0 ? '+' : ''}{r.totalReturn}%
                        </p>
                        <p className="text-xs text-gray-500">{r.totalAsset?.toLocaleString()}원</p>
                      </div>
                      <span className="text-gray-300 text-sm ml-1">
                        {selectedUser?.uid === r.uid ? '▲' : '▼'}
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2 mt-3">
                      {rankType === 'winRate' ? (
                        <>
                          <div className="bg-white rounded-xl p-2 text-center">
                            <p className="text-xs text-gray-400">승률</p>
                            <p className={`text-xs font-bold ${r.winRate >= 50 ? 'text-red-500' : 'text-blue-500'}`}>
                              {r.winRate}%
                            </p>
                          </div>
                          <div className="bg-white rounded-xl p-2 text-center">
                            <p className="text-xs text-gray-400">승/패</p>
                            <p className="text-xs font-bold text-gray-700">
                              <span className="text-red-500">{r.winCount}승</span> / <span className="text-blue-500">{r.loseCount}패</span>
                            </p>
                          </div>
                          <div className="bg-white rounded-xl p-2 text-center border border-gray-200">
                            <p className="text-xs text-gray-400">평균수익률</p>
                            <p className={`text-xs font-bold ${r.avgProfitRate >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                              {r.avgProfitRate >= 0 ? '+' : ''}{r.avgProfitRate}%
                            </p>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="bg-white rounded-xl p-2 text-center">
                            <p className="text-xs text-gray-400">실현손익</p>
                            <p className={`text-xs font-bold ${r.realizedProfit >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                              {r.realizedProfit >= 0 ? '+' : ''}{r.realizedProfit?.toLocaleString()}원
                            </p>
                          </div>
                          <div className="bg-white rounded-xl p-2 text-center">
                            <p className="text-xs text-gray-400">미실현손익</p>
                            <p className={`text-xs font-bold ${r.unrealizedProfit >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                              {r.unrealizedProfit >= 0 ? '+' : ''}{r.unrealizedProfit?.toLocaleString()}원
                            </p>
                          </div>
                          <div className="bg-white rounded-xl p-2 text-center border border-gray-200">
                            <p className="text-xs text-gray-400">총손익</p>
                            <p className={`text-xs font-bold ${(r.realizedProfit + r.unrealizedProfit) >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                              {(r.realizedProfit + r.unrealizedProfit) >= 0 ? '+' : ''}{(r.realizedProfit + r.unrealizedProfit)?.toLocaleString()}원
                            </p>
                          </div>
                        </>
                      )}
                    </div>
                  </button>

                  {/* 포트폴리오 상세 */}
                  {selectedUser?.uid === r.uid && (
                    <div className="border border-gray-200 rounded-2xl mt-2 p-4 bg-white">
                      <p className="text-sm font-bold text-gray-700 mb-3">{r.username}의 포트폴리오</p>
                      <div className="grid grid-cols-2 gap-2 mb-4">
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs text-gray-400">보유 현금</p>
                          <p className="font-bold text-gray-900 text-sm">{r.cash?.toLocaleString()}원</p>
                        </div>
                        <div className="bg-gray-50 rounded-xl p-3">
                          <p className="text-xs text-gray-400">주식 평가금액</p>
                          <p className="font-bold text-gray-900 text-sm">
                            {r.holdingsDetail.reduce((s, h) => s + h.evalAmt, 0).toLocaleString()}원
                          </p>
                        </div>
                      </div>

                      {r.holdingsDetail.length === 0 ? (
                        <p className="text-center text-gray-400 text-xs py-4">보유 종목 없음</p>
                      ) : (
                        <div className="space-y-2">
                          {r.holdingsDetail.map((h, idx) => (
                            <div key={idx} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 text-sm truncate">{h.name}</p>
                                <p className="text-xs text-gray-400">
                                  {h.quantity}주 · 평균 {h.avgPrice?.toLocaleString()}원 → 현재 {h.currentPrice?.toLocaleString()}원
                                </p>
                              </div>
                              <div className="text-right shrink-0">
                                <p className="text-sm font-bold text-gray-900">{h.evalAmt?.toLocaleString()}원</p>
                                <p className={`text-xs font-medium ${h.profit >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                                  {h.profit >= 0 ? '+' : ''}{h.profit?.toLocaleString()}원 ({h.profit >= 0 ? '+' : ''}{h.profitRate}%)
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                      <button onClick={() => setSelectedUser(null)} className="w-full mt-3 py-2 bg-gray-100 text-gray-500 rounded-xl text-xs font-medium">닫기</button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}