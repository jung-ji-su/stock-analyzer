'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import {
  collection, getDocs, query, where,
  doc, deleteDoc, updateDoc, getDoc
} from 'firebase/firestore';

const INITIAL_CASH = 10000000;

export default function AdminPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminLoading, setAdminLoading] = useState(true);
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [confirm, setConfirm] = useState(null);
  const [toast, setToast] = useState(null);
  const [expandedUser, setExpandedUser] = useState(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState('name'); // name, return, asset

  // 관리자 권한 체크
  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    checkAdmin();
  }, [user]);

  const checkAdmin = async () => {
    try {
      const profileRef = doc(db, 'profiles', user.uid);
      const profileSnap = await getDoc(profileRef);
      if (profileSnap.exists() && profileSnap.data().role === 'admin') {
        setIsAdmin(true);
        loadUsers();
      } else {
        router.push('/');
      }
    } catch (e) {
      router.push('/');
    } finally {
      setAdminLoading(false);
    }
  };

  const showToast = (msg, type = 'success') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  // 전체 사용자 목록 조회 (올바른 수익률 계산 포함)
  const loadUsers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'profiles'));
      const allHoldings = (await getDocs(collection(db, 'holdings'))).docs.map(d => d.data());
      const allTrades = (await getDocs(collection(db, 'trades'))).docs.map(d => d.data());
      
      // Naver API로 현재가 가져오기
      const symbols = [...new Set(allHoldings.map(h => h.symbol))];
      const prices = {};
      await Promise.all(
        symbols.map(async (symbol) => {
          try {
            const res = await fetch(`/api/naver-stock?symbol=${symbol}`);
            const data = await res.json();
            if (data.currentPrice) {
              prices[symbol] = typeof data.currentPrice === 'string'
                ? Number(data.currentPrice.replace(/,/g, ''))
                : Number(data.currentPrice);
            }
          } catch (e) {
            console.log(`가격 fetch 실패 [${symbol}]:`, e);
          }
        })
      );

      const userList = await Promise.all(snap.docs.map(async (d) => {
        const data = d.data();
        const userHoldings = allHoldings.filter(h => h.userId === d.id);
        const userTrades = allTrades.filter(t => t.userId === d.id);

        // 보유 주식 평가금액 계산
        const stockValue = userHoldings.reduce((sum, h) => {
          const currentPrice = prices[h.symbol] || (h.totalInvested / h.quantity);
          return sum + (currentPrice * h.quantity);
        }, 0);

        const totalAsset = (data.cash || 0) + stockValue;
        const totalReturn = data.initialAsset > 0
          ? ((totalAsset - data.initialAsset) / data.initialAsset * 100).toFixed(2)
          : '0.00';

        // 분석 수 조회
        const analysisSnap = await getDocs(
          query(collection(db, 'analysisHistory'), where('userId', '==', d.id))
        );

        // 보유종목 상세
        const holdingsDetail = userHoldings.map(h => {
          const currentPrice = prices[h.symbol] || (h.totalInvested / h.quantity);
          const avgPrice = h.totalInvested / h.quantity;
          const evalAmt = currentPrice * h.quantity;
          const profit = evalAmt - h.totalInvested;
          const profitRate = ((profit / h.totalInvested) * 100).toFixed(2);
          return { ...h, currentPrice, avgPrice, evalAmt, profit, profitRate };
        }).sort((a, b) => b.evalAmt - a.evalAmt);

        return {
          uid: d.id,
          username: data.username || '이름없음',
          cash: data.cash || 0,
          initialAsset: data.initialAsset || INITIAL_CASH,
          totalAsset,
          stockValue,
          role: data.role || 'user',
          createdAt: data.createdAt?.toDate?.()?.toLocaleDateString('ko-KR') || '-',
          holdingsCount: userHoldings.length,
          tradesCount: userTrades.filter(t => t.type === 'sell').length,
          analysisCount: analysisSnap.size,
          totalReturn: Number(totalReturn),
          wishlistCount: (data.wishlist || []).length,
          holdingsDetail,
        };
      }));

      setUsers(userList);
    } catch (e) {
      console.error(e);
      showToast('데이터 로드 실패: ' + e.message, 'error');
    } finally {
      setLoading(false);
    }
  };

  // 모의투자 초기화 (관심종목은 유지)
  const resetInvestment = async (userId, userName) => {
    setActionLoading(prev => ({ ...prev, [`reset_${userId}`]: true }));
    try {
      console.log(`[초기화 시작] ${userName} (${userId})`);
      
      // 보유종목 삭제
      const holdingsSnap = await getDocs(
        query(collection(db, 'holdings'), where('userId', '==', userId))
      );
      console.log(`삭제할 보유종목: ${holdingsSnap.size}개`);
      await Promise.all(holdingsSnap.docs.map(d => deleteDoc(d.ref)));

      // 거래내역 삭제
      const tradesSnap = await getDocs(
        query(collection(db, 'trades'), where('userId', '==', userId))
      );
      console.log(`삭제할 거래내역: ${tradesSnap.size}개`);
      await Promise.all(tradesSnap.docs.map(d => deleteDoc(d.ref)));

      // 자산 초기화 - 상세 로깅
      console.log(`[Firebase 업데이트 시작] cash: ${INITIAL_CASH}, initialAsset: ${INITIAL_CASH}`);
      const profileRef = doc(db, 'profiles', userId);
      
      // 현재 데이터 확인
      const profileSnap = await getDoc(profileRef);
      if (!profileSnap.exists()) {
        throw new Error('프로필 문서를 찾을 수 없습니다');
      }
      console.log(`[현재 데이터] cash: ${profileSnap.data().cash}, initialAsset: ${profileSnap.data().initialAsset}`);
      
      // 업데이트 실행
      await updateDoc(profileRef, {
        cash: INITIAL_CASH,
        initialAsset: INITIAL_CASH,
      });
      console.log(`[Firebase 업데이트 완료] ${INITIAL_CASH}원으로 초기화됨`);

      // 업데이트 확인
      const updatedSnap = await getDoc(profileRef);
      console.log(`[업데이트 후 데이터] cash: ${updatedSnap.data().cash}, initialAsset: ${updatedSnap.data().initialAsset}`);

      showToast(`${userName}님의 모의투자가 초기화되었습니다`);
      
      // 데이터 새로고침 완료 후 confirm 닫기
      console.log(`[데이터 새로고침 시작]`);
      await loadUsers();
      console.log(`[데이터 새로고침 완료]`);
      setConfirm(null);
    } catch (e) {
      console.error('[초기화 실패]', e);
      console.error('[에러 상세]', e.message, e.code);
      showToast('초기화 실패: ' + e.message, 'error');
      setConfirm(null);
    } finally {
      setActionLoading(prev => ({ ...prev, [`reset_${userId}`]: false }));
    }
  };

  // 사용자 삭제
  const deleteUser = async (userId, userName) => {
    setActionLoading(prev => ({ ...prev, [`delete_${userId}`]: true }));
    try {
      console.log(`[계정 삭제 시작] ${userName} (${userId})`);
      
      // holdings 삭제
      const holdingsSnap = await getDocs(
        query(collection(db, 'holdings'), where('userId', '==', userId))
      );
      await Promise.all(holdingsSnap.docs.map(d => deleteDoc(d.ref)));

      // trades 삭제
      const tradesSnap = await getDocs(
        query(collection(db, 'trades'), where('userId', '==', userId))
      );
      await Promise.all(tradesSnap.docs.map(d => deleteDoc(d.ref)));

      // analysisHistory 삭제
      const analysisSnap = await getDocs(
        query(collection(db, 'analysisHistory'), where('userId', '==', userId))
      );
      await Promise.all(analysisSnap.docs.map(d => deleteDoc(d.ref)));

      // profiles 삭제
      await deleteDoc(doc(db, 'profiles', userId));
      console.log(`계정 삭제 완료`);

      showToast(`${userName}님의 계정이 삭제되었습니다`);
      
      // 데이터 새로고침 완료 후 confirm 닫기
      await loadUsers();
      setConfirm(null);
    } catch (e) {
      console.error('[삭제 실패]', e);
      showToast('삭제 실패: ' + e.message, 'error');
      setConfirm(null);
    } finally {
      setActionLoading(prev => ({ ...prev, [`delete_${userId}`]: false }));
    }
  };

  // 전체 랭킹 초기화
  const resetAllRankings = async () => {
    setActionLoading(prev => ({ ...prev, resetAll: true }));
    try {
      console.log('[전체 랭킹 초기화 시작]');
      
      // 모든 사용자 자산 초기화
      const snap = await getDocs(collection(db, 'profiles'));
      await Promise.all(snap.docs.map(d =>
        updateDoc(d.ref, { cash: INITIAL_CASH, initialAsset: INITIAL_CASH })
      ));
      console.log(`${snap.size}명 자산 초기화 완료`);

      // 모든 holdings 삭제
      const holdingsSnap = await getDocs(collection(db, 'holdings'));
      await Promise.all(holdingsSnap.docs.map(d => deleteDoc(d.ref)));
      console.log(`${holdingsSnap.size}개 보유종목 삭제 완료`);

      // 모든 trades 삭제
      const tradesSnap = await getDocs(collection(db, 'trades'));
      await Promise.all(tradesSnap.docs.map(d => deleteDoc(d.ref)));
      console.log(`${tradesSnap.size}개 거래내역 삭제 완료`);

      showToast('전체 랭킹이 초기화되었습니다');
      
      // 데이터 새로고침 완료 후 confirm 닫기
      await loadUsers();
      setConfirm(null);
    } catch (e) {
      console.error('[전체 초기화 실패]', e);
      showToast('초기화 실패: ' + e.message, 'error');
      setConfirm(null);
    } finally {
      setActionLoading(prev => ({ ...prev, resetAll: false }));
    }
  };

  // 필터링 및 정렬
  const getFilteredAndSortedUsers = () => {
    let filtered = users.filter(u => 
      u.username.toLowerCase().includes(searchTerm.toLowerCase())
    );

    filtered.sort((a, b) => {
      if (a.role === 'admin') return -1;
      if (b.role === 'admin') return 1;
      
      if (sortBy === 'return') return b.totalReturn - a.totalReturn;
      if (sortBy === 'asset') return b.totalAsset - a.totalAsset;
      return a.username.localeCompare(b.username);
    });

    return filtered;
  };

  if (adminLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">권한 확인 중...</p>
      </div>
    );
  }

  if (!isAdmin) return null;

  const filteredUsers = getFilteredAndSortedUsers();
  const totalCash = users.reduce((s, u) => s + u.cash, 0);
  const totalStock = users.reduce((s, u) => s + u.stockValue, 0);
  const avgReturn = users.length > 0 
    ? (users.reduce((s, u) => s + u.totalReturn, 0) / users.length).toFixed(2)
    : '0.00';

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8 pb-24">
      <div className="max-w-4xl mx-auto">

        {/* 토스트 */}
        {toast && (
          <div className={`fixed top-4 right-4 z-50 px-4 py-3 rounded-xl shadow-lg text-sm font-medium text-white transition-all ${
            toast.type === 'error' ? 'bg-red-500' : 'bg-green-500'
          }`}>
            {toast.type === 'error' ? '⚠️' : '✅'} {toast.msg}
          </div>
        )}

        {/* 확인 모달 */}
        {confirm && (
          <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
              <p className="font-bold text-gray-900 mb-2">
                {confirm.type === 'delete' && '🗑️ 계정 삭제'}
                {confirm.type === 'reset' && '🔄 모의투자 초기화'}
                {confirm.type === 'resetAll' && '⚠️ 전체 랭킹 초기화'}
              </p>
              <p className="text-sm text-gray-600 mb-5">
                {confirm.type === 'resetAll'
                  ? '모든 사용자의 모의투자 데이터가 초기화됩니다. 이 작업은 되돌릴 수 없습니다.'
                  : `${confirm.userName}님의 ${confirm.type === 'delete' ? '모든 데이터를 삭제' : '모의투자를 초기화'}합니다. 되돌릴 수 없습니다.`
                }
              </p>
              <div className="flex gap-2">
                <button onClick={() => setConfirm(null)}
                  className="flex-1 py-2.5 bg-gray-100 text-gray-600 rounded-xl text-sm font-medium">
                  취소
                </button>
                <button
                  onClick={() => {
                    if (confirm.type === 'delete') deleteUser(confirm.userId, confirm.userName);
                    if (confirm.type === 'reset') resetInvestment(confirm.userId, confirm.userName);
                    if (confirm.type === 'resetAll') resetAllRankings();
                  }}
                  className={`flex-1 py-2.5 text-white rounded-xl text-sm font-bold ${
                    confirm.type === 'delete' ? 'bg-red-500' : 'bg-orange-500'
                  }`}>
                  확인
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">⚙️ 관리자 페이지</h1>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">👤 {user?.displayName}</span>
            <button onClick={logout} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg">로그아웃</button>
          </div>
        </div>

        {/* 통계 요약 */}
        <div className="grid grid-cols-2 gap-3 mb-4">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">전체 사용자</p>
            <p className="text-2xl font-bold text-gray-900">{users.length}명</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">평균 수익률</p>
            <p className={`text-2xl font-bold ${Number(avgReturn) >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
              {Number(avgReturn) >= 0 ? '+' : ''}{avgReturn}%
            </p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">총 보유 현금</p>
            <p className="text-lg font-bold text-gray-900">{totalCash.toLocaleString()}원</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4">
            <p className="text-xs text-gray-400 mb-1">총 주식 평가액</p>
            <p className="text-lg font-bold text-gray-900">{totalStock.toLocaleString()}원</p>
          </div>
        </div>

        {/* 전체 랭킹 초기화 */}
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-4 flex justify-between items-center">
          <div>
            <p className="font-bold text-red-700 text-sm">⚠️ 전체 랭킹 초기화</p>
            <p className="text-xs text-red-500 mt-0.5">모든 사용자의 모의투자 초기화</p>
          </div>
          <button
            onClick={() => setConfirm({ type: 'resetAll', userName: '전체' })}
            disabled={actionLoading.resetAll}
            className="px-4 py-2 bg-red-500 text-white rounded-xl text-xs font-bold disabled:opacity-60 shrink-0"
          >
            {actionLoading.resetAll ? '처리중...' : '전체 초기화'}
          </button>
        </div>

        {/* 검색 및 정렬 */}
        <div className="bg-white rounded-2xl border border-gray-200 p-4 mb-4">
          <div className="flex gap-2 mb-3">
            <input
              type="text"
              placeholder="사용자 검색..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-sm"
            />
            <button onClick={loadUsers} className="px-4 py-2 bg-blue-500 text-white rounded-xl text-xs font-bold">
              🔄 새로고침
            </button>
          </div>
          <div className="flex gap-2">
            {[
              { key: 'name', label: '이름순' },
              { key: 'return', label: '수익률순' },
              { key: 'asset', label: '총자산순' },
            ].map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSortBy(key)}
                className={`flex-1 py-2 rounded-xl text-xs font-medium transition-colors ${
                  sortBy === key ? 'bg-blue-500 text-white' : 'bg-gray-50 text-gray-600'
                }`}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* 사용자 목록 */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <h2 className="font-bold text-gray-900 mb-4">👥 사용자 목록 ({filteredUsers.length})</h2>

          {loading ? (
            <p className="text-center text-gray-400 py-8">불러오는 중...</p>
          ) : filteredUsers.length === 0 ? (
            <p className="text-center text-gray-400 py-8 text-sm">검색 결과가 없습니다</p>
          ) : (
            <div className="space-y-3">
              {filteredUsers.map((u) => (
                <div key={u.uid} className={`rounded-2xl border p-4 ${
                  u.role === 'admin' ? 'border-purple-200 bg-purple-50' : 'border-gray-100 bg-gray-50'
                }`}>
                  {/* 유저 기본정보 */}
                  <button
                    onClick={() => setExpandedUser(expandedUser === u.uid ? null : u.uid)}
                    className="w-full"
                  >
                    <div className="flex justify-between items-start mb-3">
                      <div className="text-left">
                        <div className="flex items-center gap-2">
                          <p className="font-bold text-gray-900">{u.username}</p>
                          {u.role === 'admin' && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-200 text-purple-700">
                              👑 관리자
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-gray-400 mt-0.5">가입: {u.createdAt}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-gray-800">{u.totalAsset.toLocaleString()}원</p>
                        <p className={`text-xs font-medium ${u.totalReturn >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                          {u.totalReturn >= 0 ? '+' : ''}{u.totalReturn}%
                        </p>
                      </div>
                    </div>

                    {/* 데이터 현황 */}
                    <div className="grid grid-cols-4 gap-2">
                      {[
                        { label: '보유', value: u.holdingsCount },
                        { label: '매도', value: u.tradesCount },
                        { label: '분석', value: u.analysisCount },
                        { label: '관심', value: u.wishlistCount },
                      ].map(({ label, value }) => (
                        <div key={label} className="bg-white rounded-xl p-2 text-center">
                          <p className="text-sm font-bold text-gray-800">{value}</p>
                          <p className="text-xs text-gray-400">{label}</p>
                        </div>
                      ))}
                    </div>
                  </button>

                  {/* 상세 포트폴리오 */}
                  {expandedUser === u.uid && (
                    <div className="mt-3 pt-3 border-t border-gray-200">
                      <div className="grid grid-cols-2 gap-2 mb-3">
                        <div className="bg-white rounded-xl p-3">
                          <p className="text-xs text-gray-400">보유 현금</p>
                          <p className="font-bold text-gray-900 text-sm">{u.cash.toLocaleString()}원</p>
                        </div>
                        <div className="bg-white rounded-xl p-3">
                          <p className="text-xs text-gray-400">주식 평가액</p>
                          <p className="font-bold text-gray-900 text-sm">{u.stockValue.toLocaleString()}원</p>
                        </div>
                      </div>

                      {u.holdingsDetail.length > 0 && (
                        <div className="space-y-2 mb-3">
                          <p className="text-xs font-bold text-gray-600">보유 종목</p>
                          {u.holdingsDetail.map((h, idx) => (
                            <div key={idx} className="flex items-center gap-2 p-2 bg-white rounded-xl text-xs">
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 truncate">{h.name}</p>
                                <p className="text-gray-400">{h.quantity}주 · 평균 {h.avgPrice.toLocaleString()}원</p>
                              </div>
                              <div className="text-right">
                                <p className="font-bold text-gray-900">{h.evalAmt.toLocaleString()}원</p>
                                <p className={`font-medium ${h.profit >= 0 ? 'text-red-500' : 'text-blue-500'}`}>
                                  {h.profit >= 0 ? '+' : ''}{h.profitRate}%
                                </p>
                              </div>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {/* 액션 버튼 (관리자 제외) */}
                  {u.role !== 'admin' && (
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={() => setConfirm({ type: 'reset', userId: u.uid, userName: u.username })}
                        disabled={actionLoading[`reset_${u.uid}`]}
                        className="flex-1 py-2 bg-orange-100 text-orange-600 rounded-xl text-xs font-medium hover:bg-orange-200 disabled:opacity-60"
                      >
                        {actionLoading[`reset_${u.uid}`] ? '처리중...' : '💰 투자 초기화'}
                      </button>
                      <button
                        onClick={() => setConfirm({ type: 'delete', userId: u.uid, userName: u.username })}
                        disabled={actionLoading[`delete_${u.uid}`]}
                        className="flex-1 py-2 bg-red-100 text-red-600 rounded-xl text-xs font-medium hover:bg-red-200 disabled:opacity-60"
                      >
                        {actionLoading[`delete_${u.uid}`] ? '처리중...' : '🗑️ 계정 삭제'}
                      </button>
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