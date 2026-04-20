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
  const [confirm, setConfirm] = useState(null); // { type, userId, userName }
  const [toast, setToast] = useState(null);

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

  // 전체 사용자 목록 조회
  const loadUsers = async () => {
    setLoading(true);
    try {
      const snap = await getDocs(collection(db, 'profiles'));
      const userList = await Promise.all(snap.docs.map(async (d) => {
        const data = d.data();

        // 보유종목 수
        const holdingsSnap = await getDocs(
          query(collection(db, 'holdings'), where('userId', '==', d.id))
        );

        // 거래내역 수
        const tradesSnap = await getDocs(
          query(collection(db, 'trades'), where('userId', '==', d.id))
        );

        // 분석 수
        const analysisSnap = await getDocs(
          query(collection(db, 'analysisHistory'), where('userId', '==', d.id))
        );

        // 수익률 계산
        const totalReturn = data.initialAsset > 0
          ? ((data.cash - data.initialAsset) / data.initialAsset * 100).toFixed(2)
          : '0';

        return {
          uid: d.id,
          username: data.username || '이름없음',
          cash: data.cash || 0,
          initialAsset: data.initialAsset || INITIAL_CASH,
          role: data.role || 'user',
          createdAt: data.createdAt?.toDate?.()?.toLocaleDateString('ko-KR') || '-',
          holdingsCount: holdingsSnap.size,
          tradesCount: tradesSnap.size,
          analysisCount: analysisSnap.size,
          totalReturn,
          wishlistCount: (data.wishlist || []).length,
        };
      }));

      // 관리자 먼저, 나머지는 가나다순
      userList.sort((a, b) => {
        if (a.role === 'admin') return -1;
        if (b.role === 'admin') return 1;
        return a.username.localeCompare(b.username);
      });

      setUsers(userList);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  // 모의투자 초기화
  const resetInvestment = async (userId, userName) => {
    setActionLoading(prev => ({ ...prev, [`reset_${userId}`]: true }));
    try {
      // 보유종목 삭제
      const holdingsSnap = await getDocs(
        query(collection(db, 'holdings'), where('userId', '==', userId))
      );
      await Promise.all(holdingsSnap.docs.map(d => deleteDoc(d.ref)));

      // 거래내역 삭제
      const tradesSnap = await getDocs(
        query(collection(db, 'trades'), where('userId', '==', userId))
      );
      await Promise.all(tradesSnap.docs.map(d => deleteDoc(d.ref)));

      // 자산 초기화
      await updateDoc(doc(db, 'profiles', userId), {
        cash: INITIAL_CASH,
        initialAsset: INITIAL_CASH,
      });

      showToast(`${userName} 모의투자 초기화 완료`);
      loadUsers();
    } catch (e) {
      showToast('초기화 실패: ' + e.message, 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [`reset_${userId}`]: false }));
      setConfirm(null);
    }
  };

  // 분석 히스토리 초기화
  const resetAnalysis = async (userId, userName) => {
    setActionLoading(prev => ({ ...prev, [`analysis_${userId}`]: true }));
    try {
      const snap = await getDocs(
        query(collection(db, 'analysisHistory'), where('userId', '==', userId))
      );
      await Promise.all(snap.docs.map(d => deleteDoc(d.ref)));
      showToast(`${userName} 분석 히스토리 초기화 완료`);
      loadUsers();
    } catch (e) {
      showToast('초기화 실패: ' + e.message, 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [`analysis_${userId}`]: false }));
      setConfirm(null);
    }
  };

  // 사용자 삭제 (모든 데이터 삭제)
  const deleteUser = async (userId, userName) => {
    setActionLoading(prev => ({ ...prev, [`delete_${userId}`]: true }));
    try {
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

      showToast(`${userName} 계정 삭제 완료`);
      loadUsers();
    } catch (e) {
      showToast('삭제 실패: ' + e.message, 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, [`delete_${userId}`]: false }));
      setConfirm(null);
    }
  };

  // 전체 랭킹 초기화 (모든 유저 자산 초기화)
  const resetAllRankings = async () => {
    setActionLoading(prev => ({ ...prev, resetAll: true }));
    try {
      const snap = await getDocs(collection(db, 'profiles'));
      await Promise.all(snap.docs.map(d =>
        updateDoc(d.ref, { cash: INITIAL_CASH, initialAsset: INITIAL_CASH })
      ));

      // 모든 holdings, trades 삭제
      const holdingsSnap = await getDocs(collection(db, 'holdings'));
      await Promise.all(holdingsSnap.docs.map(d => deleteDoc(d.ref)));

      const tradesSnap = await getDocs(collection(db, 'trades'));
      await Promise.all(tradesSnap.docs.map(d => deleteDoc(d.ref)));

      showToast('전체 랭킹 초기화 완료');
      loadUsers();
    } catch (e) {
      showToast('초기화 실패: ' + e.message, 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, resetAll: false }));
      setConfirm(null);
    }
  };

  if (adminLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <p className="text-gray-400">권한 확인 중...</p>
      </div>
    );
  }

  if (!isAdmin) return null;

  return (
    <main className="min-h-screen bg-gray-50 p-4 md:p-8">
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
                {confirm.type === 'analysis' && '🗂️ 분석 기록 초기화'}
                {confirm.type === 'resetAll' && '⚠️ 전체 랭킹 초기화'}
              </p>
              <p className="text-sm text-gray-600 mb-5">
                {confirm.type === 'resetAll'
                  ? '모든 사용자의 모의투자 데이터가 초기화됩니다. 이 작업은 되돌릴 수 없습니다.'
                  : `${confirm.userName}의 데이터를 ${confirm.type === 'delete' ? '삭제' : '초기화'}합니다. 이 작업은 되돌릴 수 없습니다.`
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
                    if (confirm.type === 'analysis') resetAnalysis(confirm.userId, confirm.userName);
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
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold text-gray-900">⚙️ 관리자 페이지</h1>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500">👤 {user?.displayName}</span>
            <button onClick={logout} className="text-xs px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg">로그아웃</button>
          </div>
        </div>

        {/* 통계 요약 */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">{users.length}</p>
            <p className="text-xs text-gray-400 mt-1">전체 사용자</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {users.reduce((a, u) => a + u.tradesCount, 0)}
            </p>
            <p className="text-xs text-gray-400 mt-1">전체 거래 수</p>
          </div>
          <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-4 text-center">
            <p className="text-2xl font-bold text-gray-900">
              {users.reduce((a, u) => a + u.analysisCount, 0)}
            </p>
            <p className="text-xs text-gray-400 mt-1">전체 분석 수</p>
          </div>
        </div>

        {/* 전체 랭킹 초기화 */}
        <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mb-6 flex justify-between items-center">
          <div>
            <p className="font-bold text-red-700 text-sm">⚠️ 전체 랭킹 초기화</p>
            <p className="text-xs text-red-500 mt-0.5">모든 사용자의 모의투자 데이터를 초기화합니다</p>
          </div>
          <button
            onClick={() => setConfirm({ type: 'resetAll', userName: '전체' })}
            disabled={actionLoading.resetAll}
            className="px-4 py-2 bg-red-500 text-white rounded-xl text-xs font-bold disabled:opacity-60 shrink-0"
          >
            {actionLoading.resetAll ? '처리중...' : '전체 초기화'}
          </button>
        </div>

        {/* 사용자 목록 */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          <div className="flex justify-between items-center mb-4">
            <h2 className="font-bold text-gray-900">👥 사용자 목록</h2>
            <button onClick={loadUsers} className="text-xs text-blue-500 hover:text-blue-700">
              🔄 새로고침
            </button>
          </div>

          {loading ? (
            <p className="text-center text-gray-400 py-8">불러오는 중...</p>
          ) : (
            <div className="space-y-3">
              {users.map((u) => (
                <div key={u.uid} className={`rounded-2xl border p-4 ${
                  u.role === 'admin' ? 'border-purple-200 bg-purple-50' : 'border-gray-100 bg-gray-50'
                }`}>
                  {/* 유저 기본정보 */}
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-bold text-gray-900">{u.username}</p>
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                          u.role === 'admin'
                            ? 'bg-purple-200 text-purple-700'
                            : 'bg-gray-200 text-gray-600'
                        }`}>
                          {u.role === 'admin' ? '👑 관리자' : '👤 일반'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">가입: {u.createdAt}</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-gray-800">{u.cash?.toLocaleString()}원</p>
                      <p className={`text-xs font-medium ${
                        Number(u.totalReturn) >= 0 ? 'text-red-500' : 'text-blue-500'
                      }`}>
                        {Number(u.totalReturn) >= 0 ? '+' : ''}{u.totalReturn}%
                      </p>
                    </div>
                  </div>

                  {/* 데이터 현황 */}
                  <div className="grid grid-cols-4 gap-2 mb-3">
                    {[
                      { label: '보유종목', value: u.holdingsCount },
                      { label: '거래내역', value: u.tradesCount },
                      { label: 'AI분석', value: u.analysisCount },
                      { label: '관심종목', value: u.wishlistCount },
                    ].map(({ label, value }) => (
                      <div key={label} className="bg-white rounded-xl p-2 text-center">
                        <p className="text-sm font-bold text-gray-800">{value}</p>
                        <p className="text-xs text-gray-400">{label}</p>
                      </div>
                    ))}
                  </div>

                  {/* 액션 버튼 (관리자 제외) */}
                  {u.role !== 'admin' && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => setConfirm({ type: 'reset', userId: u.uid, userName: u.username })}
                        disabled={actionLoading[`reset_${u.uid}`]}
                        className="flex-1 py-2 bg-orange-100 text-orange-600 rounded-xl text-xs font-medium hover:bg-orange-200 disabled:opacity-60"
                      >
                        {actionLoading[`reset_${u.uid}`] ? '처리중...' : '💰 투자 초기화'}
                      </button>
                      <button
                        onClick={() => setConfirm({ type: 'analysis', userId: u.uid, userName: u.username })}
                        disabled={actionLoading[`analysis_${u.uid}`]}
                        className="flex-1 py-2 bg-blue-100 text-blue-600 rounded-xl text-xs font-medium hover:bg-blue-200 disabled:opacity-60"
                      >
                        {actionLoading[`analysis_${u.uid}`] ? '처리중...' : '🤖 분석 초기화'}
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