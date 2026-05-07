'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';
import { useAuth } from '@/lib/AuthContext';

const mainMenus = [
  { path: '/', label: '홈', icon: '🏠' },
  { path: '/scanner', label: '스캐너', icon: '🔍' },
  { path: '/invest', label: '모의투자', icon: '💰' },
  { path: '/ranking', label: '랭킹', icon: '🏆' },
  { path: '/wiki', label: '백과사전', icon: '📖' },
];

const moreMenus = [
  { path: '/financial', icon: '📊', label: '재무분석' },  
  { path: '/history', label: 'AI기록', icon: '🤖' },
  { path: '/market-map', icon: '🗺️', label: '시장지도'},
];

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const { user } = useAuth();
  const [showMore, setShowMore] = useState(false);
  const [showAdminAlert, setShowAdminAlert] = useState(false);

  if (pathname === '/login') return null;

  return (
    <>
      {/* 관리자 접근 불가 알림 */}
      {showAdminAlert && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[60] p-4"
          onClick={() => setShowAdminAlert(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-xl"
            onClick={e => e.stopPropagation()}>
            <p className="text-3xl mb-3">🔒</p>
            <p className="font-bold text-gray-900 mb-2">접근 불가</p>
            <p className="text-sm text-gray-500 mb-4">관리자만 접근 가능합니다</p>
            <button onClick={() => setShowAdminAlert(false)}
              className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium">
              확인
            </button>
          </div>
        </div>
      )}

      {/* 더보기 드로어 */}
      {showMore && (
        <div className="fixed inset-0 z-40" onClick={() => setShowMore(false)}>
          <div className="absolute bottom-16 left-0 right-0 bg-white border-t border-gray-200 shadow-xl rounded-t-2xl p-4"
            onClick={e => e.stopPropagation()}>
            <div className="w-10 h-1 bg-gray-300 rounded-full mx-auto mb-4" />
            <p className="text-xs text-gray-400 font-medium mb-3 px-2">더보기</p>
            <div className="grid grid-cols-4 gap-2">
              {moreMenus.map((menu) => (
                <button key={menu.path}
                  onClick={() => { router.push(menu.path); setShowMore(false); }}
                  className={`flex flex-col items-center gap-1.5 p-3 rounded-2xl transition-colors ${
                    pathname === menu.path ? 'bg-blue-50' : 'hover:bg-gray-50'
                  }`}>
                  <span className="text-2xl">{menu.icon}</span>
                  <span className={`text-xs font-medium ${pathname === menu.path ? 'text-blue-500' : 'text-gray-600'}`}>
                    {menu.label}
                  </span>
                </button>
              ))}

              {/* 관리자 버튼 */}
              <button
                onClick={async () => {
                  if (!user) return;
                  try {
                    const { db } = await import('@/lib/firebase');
                    const { doc, getDoc } = await import('firebase/firestore');
                    const snap = await getDoc(doc(db, 'profiles', user.uid));
                    if (snap.exists() && snap.data().role === 'admin') {
                      router.push('/admin');
                      setShowMore(false);
                    } else {
                      setShowAdminAlert(true);
                    }
                  } catch (e) {
                    setShowAdminAlert(true);
                  }
                }}
                className="flex flex-col items-center gap-1.5 p-3 rounded-2xl hover:bg-gray-50">
                <span className="text-2xl">⚙️</span>
                <span className="text-xs font-medium text-gray-600">관리자</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 하단 네비게이션 */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-200 shadow-lg">
        <div className="max-w-5xl mx-auto flex items-center">
          {mainMenus.map((menu) => (
            <button key={menu.path}
              onClick={() => { router.push(menu.path); setShowMore(false); }}
              className={`flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors ${
                pathname === menu.path ? 'text-blue-500' : 'text-gray-400'
              }`}>
              <span className="text-xl">{menu.icon}</span>
              <span className={`text-xs font-medium ${pathname === menu.path ? 'text-blue-500' : 'text-gray-400'}`}>
                {menu.label}
              </span>
            </button>
          ))}
          <button
            onClick={() => setShowMore(prev => !prev)}
            className={`flex-1 flex flex-col items-center gap-1 py-2.5 transition-colors ${
              showMore ? 'text-blue-500' : 'text-gray-400'
            }`}>
            <span className="text-xl">☰</span>
            <span className={`text-xs font-medium ${showMore ? 'text-blue-500' : 'text-gray-400'}`}>
              더보기
            </span>
          </button>
        </div>
      </nav>

      <div className="h-16" />
    </>
  );
}