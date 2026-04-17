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

const INITIAL_ASSET = 10000000;

export default function InvestPage() {

  const { user, logout } = useAuth();
  const router = useRouter();
  const searchTimeout = useRef(null);
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
        await setDoc(profileRef, {
          username: user.displayName,
          cash: INITIAL_ASSET,
          initialAsset: INITIAL_ASSET,
          createdAt: serverTimestamp(),
        });
        setProfile({ cash: INITIAL_ASSET, initialAsset: INITIAL_ASSET });
      } else {
        setProfile(profileSnap.data());
      }
      await loadHoldings();
      await loadTrades();
      await loadAssetHistory();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const loadHoldings = async () => {
    const q = query(collection(db, 'holdings'), where('userId', '==', user.uid));
    const snap = await getDocs(q);
    setHoldings(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const loadTrades = async () => {
    try {
      const q = query(
        collection(db, 'trades'),
        where('userId', '==', user.uid),
        orderBy('createdAt', 'desc')
      );
      const snap = await getDocs(q);
      setTrades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    } catch (e) {
      console.error(e);
    }
  };

  const loadAssetHistory = async () => {
    try {
      const q = query(
        collection(db, 'trades'),
        where('userId', '==', user.uid)
      );
      const snap = await getDocs(q);
      const allTrades = snap.docs
        .map(d => d.data())
        .sort((a, b) => {
          const aTime = a.createdAt?.toDate?.() || new Date(0);
          const bTime = b.createdAt?.toDate?.() || new Date(0);
          return aTime - bTime;
        });

      // 날짜별 자산 계산
      let cash = INITIAL_ASSET;
      const history = [{ date: '시작', asset: INITIAL_ASSET, cash: INITIAL_ASSET }];

      allTrades.forEach(t => {
        if (t.type === 'buy') {
          cash -= t.amount;
        } else {
          cash += t.amount;
        }
        const date = t.createdAt?.toDate?.();
        const dateStr = date ? `${date.getMonth() + 1}/${date.getDate()}` : '?';
        history.push({ date: dateStr, asset: cash, cash, trade: t });
      });

      setAssetHistory(history);
    } catch (e) {
      console.error(e);
    }
  };

  const fetchPrices = async () => {
    const newPrices = {};
    await Promise.all(
      holdings.map(async (h) => {
        try {
          const res = await fetch(`/api/stock?symbol=${h.symbol}&timeframe=daily`);
          const data = await res.json();
          if (data.currentPrice) newPrices[h.symbol] = data.currentPrice;
        } catch { }
      })
    );
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
        userId: user.uid,
        symbol: holding.symbol,
        name: holding.name,
        type: 'sell',
        price,
        quantity: qty,
        amount: sellAmount,
        profit,
        profitRate: ((profit / buyAmount) * 100).toFixed(2),
        createdAt: serverTimestamp(),
      });

      const holdingRef = doc(db, 'holdings', `${user.uid}_${holding.symbol}`);
      const newQty = holding.quantity - qty;
      if (newQty <= 0) {
        await deleteDoc(holdingRef);
      } else {
        await updateDoc(holdingRef, {
          quantity: newQty,
          totalInvested: holding.avgPrice * newQty,
        });
      }

      const profileRef = doc(db, 'profiles', user.uid);
      await updateDoc(profileRef, { cash: profile.cash + sellAmount });
      setProfile(prev => ({ ...prev, cash: prev.cash + sellAmount }));

      setSellModal(null);
      setSellQty('');
      await loadHoldings();
      await loadTrades();
      await loadAssetHistory();
    } catch (e) {
      console.error(e);
    } finally {
      setProcessing(false);
    }
  };

  // 자산 계산
  const evalAmount = holdings.reduce((sum, h) => {
    const price = prices[h.symbol] || h.avgPrice;
    return sum + price * h.quantity;
  }, 0);
  const totalAsset = (profile?.cash || 0) + evalAmount;
  const totalInvested = holdings.reduce((sum, h) => sum + h.totalInvested, 0);
  const unrealizedProfit = evalAmount - totalInvested;
  const totalReturn = profile ? ((totalAsset - profile.initialAsset) / profile.initialAsset * 100).toFixed(2) : 0;
  const realizedProfit = trades.filter(t => t.type === 'sell').reduce((sum, t) => sum + (t.profit || 0), 0);

  if (loading) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <p className="text-gray-400">불러오는 중...</p>
    </div>
  );

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
      <div className="max-w-3xl mx-auto">

        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
          <div className="flex items-center gap-3">
            <button onClick={() => router.push('/')} className="text-gray-400 hover:text-gray-600 text-sm">← 홈</button>
            <h1 className="text-xl font-bold text-gray-900">💰 모의투자</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">👤 {user?.displayName}</span>
            <button onClick={logout} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg">로그아웃</button>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex bg-white rounded-2xl border border-gray-200 p-1 mb-4 gap-1">
          {[{ key: 'portfolio', label: '📊 포트폴리오' }, { key: 'trades', label: '📋 거래내역' }].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${tab === t.key ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-50'}`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'portfolio' && (
          <>
            {/* 총 자산 카드 */}
            <div className="bg-gray-900 rounded-2xl p-5 mb-4 text-white">
              <p className="text-xs text-gray-400 mb-1">총 자산</p>
              <p className="text-3xl font-bold mb-1">{totalAsset.toLocaleString()}원</p>
              <p className={`text-sm font-medium mb-4 ${Number(totalReturn) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                {Number(totalReturn) >= 0 ? '+' : ''}{totalReturn}% (초기 {profile?.initialAsset?.toLocaleString()}원 대비)
              </p>

              {/* 자산 구성 */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white bg-opacity-10 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">💵 보유 현금</p>
                  <p className="font-bold text-white">{profile?.cash?.toLocaleString()}원</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {totalAsset > 0 ? ((profile?.cash / totalAsset) * 100).toFixed(1) : 0}% 비중
                  </p>
                </div>
                <div className="bg-white bg-opacity-10 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">📈 주식 평가금액</p>
                  <p className="font-bold text-white">{evalAmount.toLocaleString()}원</p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {totalAsset > 0 ? ((evalAmount / totalAsset) * 100).toFixed(1) : 0}% 비중
                  </p>
                </div>
                <div className="bg-white bg-opacity-10 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">📊 미실현 손익</p>
                  <p className={`font-bold ${unrealizedProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {unrealizedProfit >= 0 ? '+' : ''}{unrealizedProfit.toLocaleString()}원
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">
                    {totalInvested > 0 ? ((unrealizedProfit / totalInvested) * 100).toFixed(2) : 0}% 수익률
                  </p>
                </div>
                <div className="bg-white bg-opacity-10 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">💰 실현 손익</p>
                  <p className={`font-bold ${realizedProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {realizedProfit >= 0 ? '+' : ''}{realizedProfit.toLocaleString()}원
                  </p>
                  <p className="text-xs text-gray-400 mt-0.5">매도 완료 기준</p>
                </div>
              </div>
            </div>

            {/* 자산 비중 바 */}
            {totalAsset > 0 && (
              <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
                <p className="text-xs font-medium text-gray-500 mb-2">자산 구성 비중</p>
                <div className="flex rounded-full overflow-hidden h-3 mb-2">
                  <div className="bg-blue-400 transition-all" style={{ width: `${(profile?.cash / totalAsset) * 100}%` }} />
                  <div className="bg-green-400 transition-all" style={{ width: `${(evalAmount / totalAsset) * 100}%` }} />
                </div>
                <div className="flex gap-4">
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
                    <span className="text-xs text-gray-500">현금 {((profile?.cash / totalAsset) * 100).toFixed(1)}%</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <div className="w-2.5 h-2.5 rounded-full bg-green-400" />
                    <span className="text-xs text-gray-500">주식 {((evalAmount / totalAsset) * 100).toFixed(1)}%</span>
                  </div>
                </div>
              </div>
            )}

            {/* 자산 변화 히스토리 */}
            {assetHistory.length > 1 && (
              <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5 mb-4">
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  className="w-full flex justify-between items-center"
                >
                  <h3 className="font-bold text-gray-900">📈 자산 변화 히스토리</h3>
                  <span className="text-gray-400 text-sm">{showHistory ? '▲ 닫기' : '▼ 펼치기'}</span>
                </button>

                {showHistory && (
                  <div className="mt-4">
                    {/* 최고/최저 자산 */}
                    <div className="grid grid-cols-3 gap-2 mb-4">
                      <div className="bg-gray-50 rounded-xl p-3 text-center">
                        <p className="text-xs text-gray-400">시작</p>
                        <p className="text-sm font-bold text-gray-700">{INITIAL_ASSET.toLocaleString()}원</p>
                      </div>
                      <div className="bg-red-50 rounded-xl p-3 text-center">
                        <p className="text-xs text-gray-400">최고</p>
                        <p className="text-sm font-bold text-red-500">
                          {Math.max(...assetHistory.map(h => h.asset)).toLocaleString()}원
                        </p>
                      </div>
                      <div className="bg-blue-50 rounded-xl p-3 text-center">
                        <p className="text-xs text-gray-400">최저</p>
                        <p className="text-sm font-bold text-blue-500">
                          {Math.min(...assetHistory.map(h => h.asset)).toLocaleString()}원
                        </p>
                      </div>
                    </div>

                    {/* 간단한 바 그래프 */}
                    <div className="space-y-2">
                      {assetHistory.map((h, i) => {
                        const max = Math.max(...assetHistory.map(x => x.asset));
                        const min = Math.min(...assetHistory.map(x => x.asset));
                        const range = max - min || 1;
                        const pct = ((h.asset - min) / range) * 100;
                        const isProfit = h.asset >= INITIAL_ASSET;
                        return (
                          <div key={i} className="flex items-center gap-2">
                            <span className="text-xs text-gray-400 w-10 shrink-0 text-right">{h.date}</span>
                            <div className="flex-1 bg-gray-100 rounded-full h-5 relative">
                              <div
                                className={`h-5 rounded-full transition-all ${isProfit ? 'bg-red-400' : 'bg-blue-400'}`}
                                style={{ width: `${Math.max(pct, 2)}%` }}
                              />
                              <span className="absolute right-2 top-0 bottom-0 flex items-center text-xs font-medium text-gray-600">
                                {h.asset.toLocaleString()}원
                              </span>
                            </div>
                            {h.trade && (
                              <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${h.trade.type === 'buy' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'}`}>
                                {h.trade.type === 'buy' ? '매수' : '매도'}
                              </span>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    <p className="text-xs text-gray-400 mt-3 text-center">* 현금 기준 자산 변화 (보유주식 평가금액 제외)</p>
                  </div>
                )}
              </div>
            )}


            {/* 보유 종목 */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-bold text-gray-900 mb-4">보유 종목 {holdings.length > 0 && <span className="text-sm font-normal text-gray-400">({holdings.length}종목)</span>}</h3>
              {holdings.length === 0 ? (
                <div className="text-center py-10">
                  <p className="text-gray-400 text-sm mb-1">보유 종목이 없습니다</p>
                  <p className="text-xs text-gray-300">홈에서 주식을 검색하고 매수해보세요</p>
                </div>
              ) : (
                <div className="space-y-3">
                  {holdings.map(h => {
                    const currentPrice = prices[h.symbol] || h.avgPrice;
                    const evalAmt = currentPrice * h.quantity;
                    const profit = evalAmt - h.totalInvested;
                    const profitRate = ((profit / h.totalInvested) * 100).toFixed(2);
                    return (
                      <div key={h.id} className="border border-gray-100 rounded-2xl p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-bold text-gray-900">{h.name}</p>
                            <p className="text-xs text-gray-400">{h.symbol} · {h.quantity}주 보유</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-gray-900">{evalAmt.toLocaleString()}원</p>
                            <p className={`text-sm font-medium ${profit >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                              {profit >= 0 ? '+' : ''}{profit.toLocaleString()}원
                            </p>
                            <p className={`text-xs font-medium ${profit >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
                              ({profit >= 0 ? '+' : ''}{profitRate}%)
                            </p>
                          </div>
                        </div>

                        {/* 수익률 바 */}
                        <div className="mb-3">
                          <div className="flex justify-between text-xs text-gray-400 mb-1">
                            <span>매수가 {h.avgPrice.toLocaleString()}원</span>
                            <span>현재가 {currentPrice.toLocaleString()}원</span>
                          </div>
                          <div className="w-full bg-gray-100 rounded-full h-1.5">
                            <div
                              className={`h-1.5 rounded-full ${profit >= 0 ? 'bg-red-400' : 'bg-blue-400'}`}
                              style={{ width: `${Math.min(Math.abs(Number(profitRate)) * 2, 100)}%` }}
                            />
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-2 mb-3 text-center">
                          <div className="bg-gray-50 rounded-xl p-2">
                            <p className="text-xs text-gray-400">매수금액</p>
                            <p className="text-xs font-medium text-gray-700">{h.totalInvested.toLocaleString()}원</p>
                          </div>
                          <div className="bg-gray-50 rounded-xl p-2">
                            <p className="text-xs text-gray-400">평가금액</p>
                            <p className="text-xs font-medium text-gray-700">{evalAmt.toLocaleString()}원</p>
                          </div>
                          <div className="bg-gray-50 rounded-xl p-2">
                            <p className="text-xs text-gray-400">손익</p>
                            <p className={`text-xs font-medium ${profit >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                              {profit >= 0 ? '+' : ''}{profitRate}%
                            </p>
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={() => router.push(`/?stock=${h.symbol}&name=${encodeURIComponent(h.name)}`)}
                            className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium hover:bg-gray-200"
                          >
                            차트 보기
                          </button>
                          <button
                            onClick={() => { setSellModal(h); setSellQty(String(h.quantity)); }}
                            className="flex-1 py-2 bg-blue-500 text-white rounded-xl text-xs font-medium hover:bg-blue-600"
                          >
                            매도하기
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </>
        )}

        {/* 거래내역 */}
        {tab === 'trades' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h3 className="font-bold text-gray-900 mb-4">거래 내역 {trades.length > 0 && <span className="text-sm font-normal text-gray-400">({trades.length}건)</span>}</h3>
            {trades.length === 0 ? (
              <div className="text-center py-10">
                <p className="text-gray-400 text-sm">거래 내역이 없습니다</p>
              </div>
            ) : (
              <div className="space-y-2">
                {trades.map(t => {
                  const date = t.createdAt?.toDate ? t.createdAt.toDate() : new Date();
                  const dateStr = `${date.getFullYear()}.${String(date.getMonth() + 1).padStart(2, '0')}.${String(date.getDate()).padStart(2, '0')} ${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
                  return (
                    <div key={t.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                      <span className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white ${t.type === 'buy' ? 'bg-red-500' : 'bg-blue-500'}`}>
                        {t.type === 'buy' ? '매수' : '매도'}
                      </span>
                      <div className="flex-1 min-w-0">
                        <p className="font-medium text-gray-900 text-sm truncate">{t.name}</p>
                        <p className="text-xs text-gray-400">{t.price?.toLocaleString()}원 × {t.quantity}주 · {dateStr}</p>
                      </div>
                      <div className="text-right shrink-0">
                        <p className="text-sm font-medium text-gray-900">{t.amount?.toLocaleString()}원</p>
                        {t.type === 'sell' && (
                          <p className={`text-xs font-medium ${Number(t.profit) >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                            {Number(t.profit) >= 0 ? '+' : ''}{Number(t.profit)?.toLocaleString()}원
                          </p>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 매도 모달 */}
      {sellModal && (
        <div className="fixed inset-0 bg-black bg-opacity-60 flex items-end justify-center z-50">
          <div className="bg-white rounded-t-3xl w-full max-w-md p-6 pb-8" style={{ animation: 'slideUp 0.2s ease-out' }}>
            <style>{`@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }`}</style>
            <div className="w-10 h-1 bg-gray-200 rounded-full mx-auto mb-5" />

            <div className="flex justify-between items-start mb-5">
              <div>
                <h3 className="font-bold text-gray-900 text-lg">{sellModal.name}</h3>
                <p className="text-xs text-gray-400">보유 {sellModal.quantity}주 · 평균 {sellModal.avgPrice?.toLocaleString()}원</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-gray-900">{(prices[sellModal.symbol] || sellModal.avgPrice)?.toLocaleString()}원</p>
                <p className="text-xs text-gray-400">현재가</p>
              </div>
            </div>

            <div className="mb-4">
              <div className="flex justify-between items-center mb-1.5">
                <label className="text-xs font-medium text-gray-500">매도 수량</label>
                <span className="text-xs text-gray-400">최대 {sellModal.quantity}주</span>
              </div>
              <input type="number" value={sellQty} onChange={e => setSellQty(e.target.value)}
                max={sellModal.quantity} placeholder="0"
                className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm font-medium mb-2" />
              <div className="flex gap-2">
                {[{ label: '10%', pct: 10 }, { label: '25%', pct: 25 }, { label: '50%', pct: 50 }, { label: '전량', pct: 100 }].map(({ label, pct }) => {
                  const qty = pct === 100 ? sellModal.quantity : Math.floor(sellModal.quantity * pct / 100);
                  return (
                    <button key={pct} onClick={() => setSellQty(String(qty))}
                      className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium hover:bg-gray-200">
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>

            {sellQty && Number(sellQty) > 0 && (
              <div className="bg-gray-50 rounded-2xl p-4 mb-4 space-y-2">
                {(() => {
                  const price = prices[sellModal.symbol] || sellModal.avgPrice;
                  const sellAmt = price * Number(sellQty);
                  const buyAmt = sellModal.avgPrice * Number(sellQty);
                  const profit = sellAmt - buyAmt;
                  const rate = ((profit / buyAmt) * 100).toFixed(2);
                  return (
                    <>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">매도가격</span>
                        <span className="font-medium">{price.toLocaleString()}원</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">총 매도금액</span>
                        <span className="font-bold text-gray-900">{sellAmt.toLocaleString()}원</span>
                      </div>
                      <div className="flex justify-between text-sm border-t border-gray-200 pt-2">
                        <span className="text-gray-500">실현 손익</span>
                        <span className={`font-bold ${profit >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                          {profit >= 0 ? '+' : ''}{profit.toLocaleString()}원 ({profit >= 0 ? '+' : ''}{rate}%)
                        </span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">매도 후 잔액</span>
                        <span className="font-bold text-gray-900">{(profile.cash + sellAmt).toLocaleString()}원</span>
                      </div>
                    </>
                  );
                })()}
              </div>
            )}

            <div className="flex gap-2">
              <button onClick={() => { setSellModal(null); setSellQty(''); }}
                className="px-6 py-3.5 bg-gray-100 text-gray-600 rounded-2xl font-medium text-sm">
                취소
              </button>
              <button onClick={() => handleSell(sellModal, Number(sellQty))}
                disabled={processing || !sellQty || Number(sellQty) > sellModal.quantity || Number(sellQty) <= 0}
                className="flex-1 py-3.5 bg-blue-500 text-white rounded-2xl font-bold text-sm disabled:opacity-60 hover:bg-blue-600">
                {processing ? '처리 중...' : '매도 확정'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}