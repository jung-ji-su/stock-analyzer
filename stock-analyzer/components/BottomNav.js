'use client';

import { useRouter, usePathname } from 'next/navigation';
import { useState } from 'react';

const mainMenus = [
  { path: '/', label: '홈', icon: '🏠' },
  { path: '/scanner', label: '스캐너', icon: '🔍' },
  { path: '/invest', label: '모의투자', icon: '💰' },
  { path: '/ranking', label: '랭킹', icon: '🏆' },
];

const moreMenus = [
  { path: '/history', label: 'AI기록', icon: '🤖' },
  { path: '/admin', label: '관리자', icon: '⚙️' },
];

export default function BottomNav() {
  const router = useRouter();
  const pathname = usePathname();
  const [showMore, setShowMore] = useState(false);

  // 로그인 페이지에서는 숨김
  if (pathname === '/login') return null;

  return (
    <>
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
              {pathname === menu.path && (
                <div className="absolute top-0 w-8 h-0.5 bg-blue-500 rounded-full" />
              )}
            </button>
          ))}
          {/* 더보기 버튼 */}
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

      {/* 하단 네비 높이만큼 여백 */}
      <div className="h-16" />
    </>
  );
}