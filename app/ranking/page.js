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

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    loadRankings();
  }, [user]);

  const loadRankings = async () => {
    setLoading(true);
    try {
      // 모든 프로필 가져오기
      const profilesSnap = await getDocs(collection(db, 'profiles'));
      const profiles = profilesSnap.docs.map(d => ({ uid: d.id, ...d.data() }));

      // 모든 보유종목 가져오기
      const holdingsSnap = await getDocs(collection(db, 'holdings'));
      const allHoldings = holdingsSnap.docs.map(d => d.data());

      // 모든 거래내역 가져오기
      const tradesSnap = await getDocs(collection(db, 'trades'));
      const allTrades = tradesSnap.docs.map(d => d.data());

      // 현재가 가져오기
      const symbols = [...new Set(allHoldings.map(h => h.symbol))];
      const prices = {};
      await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const res = await fetch(`/api/stock?symbol=${symbol}&timeframe=daily`);
            const data = await res.json();
            if (data.currentPrice) prices[symbol] = data.currentPrice;
          } catch {}
        })
      );

      // 랭킹 계산
      const rankData = profiles.map(profile => {
        const userHoldings = allHoldings.filter(h => h.userId === profile.uid);
        const userTrades = allTrades.filter(t => t.userId === profile.uid && t.type === 'sell');

        const evalAmount = userHoldings.reduce((sum, h) => {
          const price = prices[h.symbol] || h.avgPrice;
          return sum + price * h.quantity;
        }, 0);

        const totalAsset = (profile.cash || 0) + evalAmount;
        const totalReturn = (((totalAsset - profile.initialAsset) / profile.initialAsset) * 100).toFixed(2);
        const realizedProfit = userTrades.reduce((sum, t) => sum + (t.profit || 0), 0);
        const totalInvested = userHoldings.reduce((sum, h) => sum + h.totalInvested, 0);
        const unrealizedProfit = evalAmount - totalInvested;

        return {
          uid: profile.uid,
          username: profile.username,
          totalAsset,
          totalReturn: Number(totalReturn),
          realizedProfit,
          unrealizedProfit,
          holdingCount: userHoldings.length,
          tradeCount: userTrades.length,
          isMe: profile.uid === user.uid,
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
      return 0;
    });
  };

  const getRankEmoji = (rank) => {
    if (rank === 0) return '🥇';
    if (rank === 1) return '🥈';
    if (rank === 2) return '🥉';
    return `${rank + 1}위`;
  };

  const sorted = getSortedRankings();
  const myRank = sorted.findIndex(r => r.isMe);

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">

        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="text-gray-400 hover:text-gray-600">
              ← 홈
            </button>
            <h1 className="text-xl font-bold text-gray-900">🏆 수익률 랭킹</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">👤 {user?.displayName}</span>
            <button onClick={logout} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg">로그아웃</button>
          </div>
        </div>

        {/* 내 순위 요약 */}
        {myRank >= 0 && (
          <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl p-5 mb-4 text-white">
            <p className="text-sm opacity-80 mb-1">내 순위</p>
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold">{getRankEmoji(myRank)}</p>
                <p className="text-sm opacity-80 mt-1">전체 {rankings.length}명 중</p>
              </div>
              <div className="text-right">
                <p className={`text-2xl font-bold ${sorted[myRank]?.totalReturn >= 0 ? 'text-yellow-300' : 'text-red-300'}`}>
                  {sorted[myRank]?.totalReturn >= 0 ? '+' : ''}{sorted[myRank]?.totalReturn}%
                </p>
                <p className="text-sm opacity-80">{sorted[myRank]?.totalAsset?.toLocaleString()}원</p>
              </div>
            </div>
          </div>
        )}

        {/* 랭킹 기준 선택 */}
        <div className="flex bg-white rounded-2xl border border-gray-200 p-1 mb-4 gap-1">
          {[
            { key: 'totalReturn', label: '📈 수익률 기준' },
            { key: 'totalAsset', label: '💰 총자산 기준' },
          ].map(t => (
            <button key={t.key} onClick={() => setRankType(t.key)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                rankType === t.key ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}>
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
                <div key={r.uid} className={`rounded-2xl p-4 border ${
                  r.isMe ? 'border-blue-300 bg-blue-50' : 'border-gray-100 bg-gray-50'
                }`}>
                  <div className="flex items-center gap-3">
                    <span className="text-2xl w-8 text-center">{getRankEmoji(i)}</span>
                    <div className="flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-900">{r.username}</p>
                        {r.isMe && <span className="text-xs bg-blue-500 text-white px-2 py-0.5 rounded-full">나</span>}
                      </div>
                      <p className="text-xs text-gray-400">
                        보유 {r.holdingCount}종목 · 매도 {r.tradeCount}회
                      </p>
                    </div>
                    <div className="text-right">
                      <p className={`text-lg font-bold ${r.totalReturn >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                        {r.totalReturn >= 0 ? '+' : ''}{r.totalReturn}%
                      </p>
                      <p className="text-xs text-gray-500">{r.totalAsset?.toLocaleString()}원</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    <div className="bg-white rounded-xl p-2 text-center">
                      <p className="text-xs text-gray-400">실현손익</p>
                      <p className={`text-sm font-bold ${r.realizedProfit >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                        {r.realizedProfit >= 0 ? '+' : ''}{r.realizedProfit?.toLocaleString()}원
                      </p>
                    </div>
                    <div className="bg-white rounded-xl p-2 text-center">
                      <p className="text-xs text-gray-400">미실현손익</p>
                      <p className={`text-sm font-bold ${r.unrealizedProfit >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                        {r.unrealizedProfit >= 0 ? '+' : ''}{r.unrealizedProfit?.toLocaleString()}원
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}