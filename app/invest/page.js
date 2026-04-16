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
  const [tab, setTab] = useState('portfolio');
  const [profile, setProfile] = useState(null);
  const [holdings, setHoldings] = useState([]);
  const [trades, setTrades] = useState([]);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(true);
  const [buyModal, setBuyModal] = useState(false);
  const [sellModal, setSellModal] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [buyPrice, setBuyPrice] = useState('');
  const [buyQty, setBuyQty] = useState('');
  const [sellQty, setSellQty] = useState('');
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState('');
  const searchTimeout = useRef(null);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    initProfile();
  }, [user]);

  useEffect(() => {
    if (holdings.length > 0) fetchPrices();
  }, [holdings]);

  useEffect(() => {
    if (searchQuery.length < 1) { setSearchResults([]); return; }
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
        const data = await res.json();
        setSearchResults(data.results || []);
      } catch { setSearchResults([]); }
    }, 300);
  }, [searchQuery]);

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
    const q = query(
      collection(db, 'trades'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const snap = await getDocs(q);
    setTrades(snap.docs.map(d => ({ id: d.id, ...d.data() })));
  };

  const fetchPrices = async () => {
    const newPrices = {};
    await Promise.all(
      holdings.map(async (h) => {
        try {
          const res = await fetch(`/api/stock?symbol=${h.symbol}&timeframe=daily`);
          const data = await res.json();
          if (data.currentPrice) newPrices[h.symbol] = data.currentPrice;
        } catch {}
      })
    );
    setPrices(newPrices);
  };

  const handleBuy = async () => {
    if (!selectedStock || !buyPrice || !buyQty) {
      setError('모든 항목을 입력해주세요'); return;
    }
    const price = Number(buyPrice);
    const qty = Number(buyQty);
    const total = price * qty;

    if (total > profile.cash) {
      setError('보유 현금이 부족합니다'); return;
    }

    setProcessing(true);
    setError('');
    try {
      // 거래 기록
      await addDoc(collection(db, 'trades'), {
        userId: user.uid,
        symbol: selectedStock.symbol,
        name: selectedStock.name,
        type: 'buy',
        price,
        quantity: qty,
        amount: total,
        createdAt: serverTimestamp(),
      });

      // 보유 종목 업데이트
      const holdingRef = doc(db, 'holdings', `${user.uid}_${selectedStock.symbol}`);
      const holdingSnap = await getDoc(holdingRef);

      if (holdingSnap.exists()) {
        const existing = holdingSnap.data();
        const newQty = existing.quantity + qty;
        const newAvg = (existing.avgPrice * existing.quantity + price * qty) / newQty;
        await updateDoc(holdingRef, {
          quantity: newQty,
          avgPrice: Math.round(newAvg),
          totalInvested: existing.totalInvested + total,
        });
      } else {
        await setDoc(holdingRef, {
          userId: user.uid,
          symbol: selectedStock.symbol,
          name: selectedStock.name,
          quantity: qty,
          avgPrice: price,
          totalInvested: total,
        });
      }

      // 현금 차감
      const profileRef = doc(db, 'profiles', user.uid);
      await updateDoc(profileRef, { cash: profile.cash - total });
      setProfile(prev => ({ ...prev, cash: prev.cash - total }));

      setBuyModal(false);
      setSelectedStock(null);
      setBuyPrice('');
      setBuyQty('');
      setSearchQuery('');
      await loadHoldings();
    } catch (e) {
      setError('매수 실패: ' + e.message);
    } finally {
      setProcessing(false);
    }
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

  const realizedProfit = trades
    .filter(t => t.type === 'sell')
    .reduce((sum, t) => sum + (t.profit || 0), 0);

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
            <button onClick={() => router.push('/')} className="text-gray-400 hover:text-gray-600">
              ← 홈
            </button>
            <h1 className="text-xl font-bold text-gray-900">💰 모의투자</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">👤 {user?.displayName}</span>
            <button onClick={logout} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg">로그아웃</button>
          </div>
        </div>

        {/* 탭 */}
        <div className="flex bg-white rounded-2xl border border-gray-200 p-1 mb-4 gap-1">
          {[
            { key: 'portfolio', label: '📊 포트폴리오' },
            { key: 'trades', label: '📋 거래내역' },
          ].map(t => (
            <button key={t.key} onClick={() => setTab(t.key)}
              className={`flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors ${
                tab === t.key ? 'bg-blue-500 text-white' : 'text-gray-500 hover:bg-gray-50'
              }`}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === 'portfolio' && (
          <>
            {/* 자산 요약 */}
            <div className="bg-gray-900 rounded-2xl p-5 mb-4 text-white">
              <p className="text-sm opacity-80 mb-1">총 자산</p>
              <p className="text-3xl font-bold mb-3">{totalAsset.toLocaleString()}원</p>
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-white bg-opacity-20 rounded-xl p-3">
                  <p className="text-xs opacity-70">수익률</p>
                  <p className={`text-lg font-bold ${Number(totalReturn) >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {Number(totalReturn) >= 0 ? '+' : ''}{totalReturn}%
                  </p>
                </div>
                <div className="bg-white bg-opacity-20 rounded-xl p-3">
                  <p className="text-xs opacity-70">보유 현금</p>
                  <p className="text-lg font-bold">{profile?.cash?.toLocaleString()}원</p>
                </div>
                <div className="bg-white bg-opacity-20 rounded-xl p-3">
                  <p className="text-xs opacity-70">미실현 손익</p>
                  <p className={`text-lg font-bold ${unrealizedProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {unrealizedProfit >= 0 ? '+' : ''}{unrealizedProfit.toLocaleString()}원
                  </p>
                </div>
                <div className="bg-white bg-opacity-20 rounded-xl p-3">
                  <p className="text-xs opacity-70">실현 손익</p>
                  <p className={`text-lg font-bold ${realizedProfit >= 0 ? 'text-green-400' : 'text-red-400'}`}>
                    {realizedProfit >= 0 ? '+' : ''}{realizedProfit.toLocaleString()}원
                  </p>
                </div>
              </div>
            </div>

            {/* 보유 종목 */}
            <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
              <h3 className="font-bold text-gray-900 mb-4">보유 종목</h3>
              {holdings.length === 0 ? (
                <p className="text-center text-gray-400 py-8 text-sm">보유 종목이 없습니다</p>
              ) : (
                <div className="space-y-3">
                  {holdings.map(h => {
                    const currentPrice = prices[h.symbol] || h.avgPrice;
                    const evalAmt = currentPrice * h.quantity;
                    const profit = evalAmt - h.totalInvested;
                    const profitRate = ((profit / h.totalInvested) * 100).toFixed(2);
                    return (
                      <div key={h.id} className="border border-gray-100 rounded-xl p-4">
                        <div className="flex justify-between items-start mb-3">
                          <div>
                            <p className="font-bold text-gray-900">{h.name}</p>
                            <p className="text-xs text-gray-400">{h.symbol} · {h.quantity}주</p>
                          </div>
                          <div className="text-right">
                            <p className="font-bold text-gray-900">{evalAmt.toLocaleString()}원</p>
                            <p className={`text-sm font-medium ${profit >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                              {profit >= 0 ? '+' : ''}{profit.toLocaleString()}원 ({profit >= 0 ? '+' : ''}{profitRate}%)
                            </p>
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2 mb-3">
                          <div className="bg-gray-50 rounded-lg p-2">
                            <p className="text-xs text-gray-400">평균매수가</p>
                            <p className="text-sm font-medium text-gray-700">{h.avgPrice.toLocaleString()}원</p>
                          </div>
                          <div className="bg-gray-50 rounded-lg p-2">
                            <p className="text-xs text-gray-400">현재가</p>
                            <p className="text-sm font-medium text-gray-700">{currentPrice.toLocaleString()}원</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <button
                            onClick={() => router.push(`/?stock=${h.symbol}`)}
                            className="flex-1 py-2 bg-gray-100 text-gray-600 rounded-lg text-xs font-medium"
                          >
                            차트 보기
                          </button>
                          <button
                            onClick={() => { setSellModal(h); setSellQty(String(h.quantity)); }}
                            className="flex-1 py-2 bg-blue-500 text-white rounded-lg text-xs font-medium"
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

        {tab === 'trades' && (
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
            <h3 className="font-bold text-gray-900 mb-4">거래 내역</h3>
            {trades.length === 0 ? (
              <p className="text-center text-gray-400 py-8 text-sm">거래 내역이 없습니다</p>
            ) : (
              <div className="space-y-2">
                {trades.map(t => (
                  <div key={t.id} className="flex items-center gap-3 p-3 bg-gray-50 rounded-xl">
                    <span className={`w-10 h-10 shrink-0 rounded-full flex items-center justify-center text-xs font-bold text-white ${
                      t.type === 'buy' ? 'bg-red-500' : 'bg-blue-500'
                    }`}>
                      {t.type === 'buy' ? '매수' : '매도'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-gray-900 text-sm truncate">{t.name}</p>
                      <p className="text-xs text-gray-400">
                        {t.price?.toLocaleString()}원 × {t.quantity}주
                      </p>
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
                ))}
              </div>
            )}
          </div>
        )}

        {/* 매수 모달 */}
        {buyModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-gray-900">매수하기</h3>
                <button onClick={() => { setBuyModal(false); setSelectedStock(null); setSearchQuery(''); setError(''); }}
                  className="text-gray-400 text-xl">✕</button>
              </div>

              {!selectedStock ? (
                <div>
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="종목명 검색"
                    className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm mb-2"
                    autoFocus
                  />
                  {searchResults.length > 0 && (
                    <div className="border border-gray-200 rounded-xl overflow-hidden">
                      {searchResults.map(s => (
                        <button key={s.symbol} onClick={() => {
                          setSelectedStock(s);
                          setSearchQuery(s.name);
                          setSearchResults([]);
                        }}
                          className="w-full px-4 py-3 text-left hover:bg-gray-50 flex justify-between border-b border-gray-100 last:border-0">
                          <span className="font-medium text-sm text-gray-800">{s.name}</span>
                          <span className="text-xs text-gray-400">{s.exchange} · {s.symbol}</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="bg-blue-50 rounded-xl p-3 flex justify-between items-center">
                    <div>
                      <p className="font-bold text-gray-900">{selectedStock.name}</p>
                      <p className="text-xs text-gray-500">{selectedStock.symbol}</p>
                    </div>
                    <button onClick={() => setSelectedStock(null)} className="text-xs text-blue-500">변경</button>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">매수가격 (원)</label>
                    <input type="number" value={buyPrice} onChange={e => setBuyPrice(e.target.value)}
                      placeholder="매수 가격 입력"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                  </div>
                  <div>
                    <label className="text-xs font-medium text-gray-700 mb-1 block">매수수량 (주)</label>
                    <input type="number" value={buyQty} onChange={e => setBuyQty(e.target.value)}
                      placeholder="매수 수량 입력"
                      className="w-full px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                  </div>
                  {buyPrice && buyQty && (
                    <div className="bg-gray-50 rounded-xl p-3">
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-gray-500">총 매수금액</span>
                        <span className="font-bold text-gray-900">{(Number(buyPrice) * Number(buyQty)).toLocaleString()}원</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">매수 후 잔액</span>
                        <span className={`font-bold ${profile.cash - Number(buyPrice) * Number(buyQty) < 0 ? 'text-red-500' : 'text-gray-900'}`}>
                          {(profile.cash - Number(buyPrice) * Number(buyQty)).toLocaleString()}원
                        </span>
                      </div>
                    </div>
                  )}
                  {error && <p className="text-xs text-red-500">⚠️ {error}</p>}
                  <button onClick={handleBuy} disabled={processing}
                    className="w-full py-3.5 bg-red-500 text-white rounded-xl font-bold text-sm disabled:opacity-60">
                    {processing ? '처리 중...' : '매수 확정'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* 매도 모달 */}
        {sellModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-end justify-center z-50 p-4">
            <div className="bg-white rounded-2xl w-full max-w-md p-5">
              <div className="flex justify-between items-center mb-4">
                <h3 className="font-bold text-gray-900">매도하기</h3>
                <button onClick={() => { setSellModal(null); setSellQty(''); }} className="text-gray-400 text-xl">✕</button>
              </div>
              <div className="bg-blue-50 rounded-xl p-3 mb-3">
                <p className="font-bold text-gray-900">{sellModal.name}</p>
                <p className="text-xs text-gray-500">보유수량: {sellModal.quantity}주 · 평균단가: {sellModal.avgPrice.toLocaleString()}원</p>
              </div>
              <div className="mb-3">
                <label className="text-xs font-medium text-gray-700 mb-1 block">매도수량</label>
                <div className="flex gap-2">
                  <input type="number" value={sellQty} onChange={e => setSellQty(e.target.value)}
                    max={sellModal.quantity}
                    className="flex-1 px-4 py-3 rounded-xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm" />
                  <button onClick={() => setSellQty(String(sellModal.quantity))}
                    className="px-3 py-2 bg-gray-100 text-gray-600 rounded-xl text-xs font-medium">전량</button>
                </div>
              </div>
              {sellQty && (
                <div className="bg-gray-50 rounded-xl p-3 mb-3 space-y-1">
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
                          <span className="font-medium">{sellAmt.toLocaleString()}원</span>
                        </div>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-500">실현 손익</span>
                          <span className={`font-bold ${profit >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                            {profit >= 0 ? '+' : ''}{profit.toLocaleString()}원 ({profit >= 0 ? '+' : ''}{rate}%)
                          </span>
                        </div>
                      </>
                    );
                  })()}
                </div>
              )}
              <button
                onClick={() => handleSell(sellModal, Number(sellQty))}
                disabled={processing || !sellQty || Number(sellQty) > sellModal.quantity}
                className="w-full py-3.5 bg-blue-500 text-white rounded-xl font-bold text-sm disabled:opacity-60"
              >
                {processing ? '처리 중...' : '매도 확정'}
              </button>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}