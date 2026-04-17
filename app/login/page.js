'use client';

import { useState } from 'react';
import { auth } from '@/lib/firebase';
import { createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile } from 'firebase/auth';
import { useRouter } from 'next/navigation';

export default function LoginPage() {
  const [isSignup, setIsSignup] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  const handleSubmit = async () => {
    if (!username || !password) {
      setError('아이디와 비밀번호를 입력해주세요');
      return;
    }
    if (password.length < 6) {
      setError('비밀번호는 6자리 이상이어야 합니다');
      return;
    }

    setLoading(true);
    setError('');
    const email = `${username}@family.com`;

    try {
      if (isSignup) {
        const result = await createUserWithEmailAndPassword(auth, email, password);
        await updateProfile(result.user, { displayName: username });
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
      router.push('/');
    } catch (e) {
      if (e.code === 'auth/user-not-found' || e.code === 'auth/wrong-password' || e.code === 'auth/invalid-credential') {
        setError('아이디 또는 비밀번호가 틀렸습니다');
      } else if (e.code === 'auth/email-already-in-use') {
        setError('이미 사용중인 아이디입니다');
      } else {
        setError('오류가 발생했습니다: ' + e.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
      <div className="w-full max-w-sm">

        {/* 🔥 타이틀 */}
        <div className="text-center mb-10">
          <h1 className="text-3xl font-bold text-gray-900">
            Stock Analyzer AI
          </h1>
          <p className="text-sm text-gray-500 mt-2">
            AI로 읽는 시장 흐름
          </p>
        </div>

        {/* 🔥 카드 */}
        <div className="bg-white rounded-2xl shadow-xl p-7 border border-gray-100">

          {/* 탭 */}
          <div className="flex bg-gray-100 rounded-xl p-1 mb-6">
            <button
              onClick={() => { setIsSignup(false); setError(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                !isSignup 
                  ? 'bg-white shadow text-gray-900' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              로그인
            </button>
            <button
              onClick={() => { setIsSignup(true); setError(''); }}
              className={`flex-1 py-2 rounded-lg text-sm font-semibold transition ${
                isSignup 
                  ? 'bg-white shadow text-gray-900' 
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              회원가입
            </button>
          </div>

          <div className="space-y-5">

            {/* 아이디 */}
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">
                아이디
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="아이디 입력"
                className="w-full px-4 py-3 rounded-xl 
                border border-gray-300 
                bg-white
                text-gray-900 
                placeholder-gray-400
                focus:outline-none 
                focus:ring-2 focus:ring-indigo-500 
                focus:border-indigo-500 
                transition text-sm"
              />
            </div>

            {/* 비밀번호 */}
            <div>
              <label className="text-xs font-semibold text-gray-600 mb-1 block">
                비밀번호
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="6자리 이상 입력"
                className="w-full px-4 py-3 rounded-xl 
                border border-gray-300 
                bg-white
                text-gray-900 
                placeholder-gray-400
                focus:outline-none 
                focus:ring-2 focus:ring-indigo-500 
                focus:border-indigo-500 
                transition text-sm"
              />
            </div>

            {/* 에러 */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-xl p-3 text-xs text-red-600">
                ⚠️ {error}
              </div>
            )}

            {/* 버튼 */}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-semibold text-sm text-white
              bg-gradient-to-r from-indigo-500 to-purple-600
              hover:from-indigo-600 hover:to-purple-700
              active:scale-[0.98]
              shadow-md hover:shadow-xl
              transition-all duration-200
              disabled:opacity-60"
            >
              {loading ? '처리 중...' : isSignup ? '회원가입' : '로그인'}
            </button>

            {/* 메시지 */}
            <p className="text-center text-xs text-gray-400 mt-2">
              데이터 기반으로 시장을 분석하세요
            </p>

          </div>
        </div>
      </div>
    </main>
  );
}
