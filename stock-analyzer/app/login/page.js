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
    if (!username || !password) { setError('아이디와 비밀번호를 입력해주세요'); return; }
    if (password.length < 6) { setError('비밀번호는 6자리 이상이어야 합니다'); return; }
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
    <main className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #0f0c29, #302b63, #24243e)' }}>

      {/* 배경 장식 원 */}
      <div className="absolute top-[-100px] right-[-100px] w-96 h-96 rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, #6366f1, transparent)' }} />
      <div className="absolute bottom-[-80px] left-[-80px] w-80 h-80 rounded-full opacity-20"
        style={{ background: 'radial-gradient(circle, #8b5cf6, transparent)' }} />
      <div className="absolute top-1/2 left-[-150px] w-72 h-72 rounded-full opacity-10"
        style={{ background: 'radial-gradient(circle, #06b6d4, transparent)' }} />

      <div className="w-full max-w-sm relative z-10">

        {/* 로고/타이틀 */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: 'linear-gradient(135deg, #6366f1, #8b5cf6)', boxShadow: '0 8px 32px rgba(99,102,241,0.4)' }}>
            <span className="text-3xl">📊</span>
          </div>
          <h1 className="text-3xl font-bold text-white mb-1">Stock AI</h1>
          <p className="text-sm" style={{ color: 'rgba(255,255,255,0.5)' }}>퀀트 분석 · AI 예측 · 모의투자</p>

          {/* 실시간 지표 뱃지 */}
          <div className="flex items-center justify-center gap-2 mt-4">
            {[
              { label: 'KOSPI', value: '+1.2%', up: true },
              { label: 'AI분석', value: '실시간', up: true },
              { label: '퀀트', value: '4레이어', up: true },
            ].map(({ label, value, up }) => (
              <div key={label} className="flex items-center gap-1 px-2.5 py-1 rounded-full text-xs"
                style={{ background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.12)', color: 'rgba(255,255,255,0.7)' }}>
                <span style={{ color: up ? '#34d399' : '#f87171', fontSize: '10px' }}>●</span>
                <span>{label}</span>
                <span style={{ color: up ? '#34d399' : '#f87171' }}>{value}</span>
              </div>
            ))}
          </div>
        </div>

        {/* 카드 */}
        <div className="rounded-3xl p-6"
          style={{
            background: 'rgba(255,255,255,0.07)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255,255,255,0.12)',
            boxShadow: '0 25px 50px rgba(0,0,0,0.5)',
          }}>

          {/* 탭 */}
          <div className="flex rounded-2xl p-1 mb-6"
            style={{ background: 'rgba(0,0,0,0.3)' }}>
            {['로그인', '회원가입'].map((label, i) => (
              <button key={label}
                onClick={() => { setIsSignup(i === 1); setError(''); }}
                className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
                style={{
                  background: (i === 0 ? !isSignup : isSignup) ? 'linear-gradient(135deg, #6366f1, #8b5cf6)' : 'transparent',
                  color: (i === 0 ? !isSignup : isSignup) ? 'white' : 'rgba(255,255,255,0.5)',
                  boxShadow: (i === 0 ? !isSignup : isSignup) ? '0 4px 15px rgba(99,102,241,0.4)' : 'none',
                }}>
                {label}
              </button>
            ))}
          </div>

          <div className="space-y-4">
            {/* 아이디 */}
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'rgba(255,255,255,0.6)' }}>
                아이디
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="아이디 입력"
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-gray-500 outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.8)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
              {isSignup && (
                <p className="text-xs mt-1.5 px-1" style={{ color: 'rgba(255,255,255,0.4)' }}>
                  💡 앱에서 다른 사람에게 보여지는 이름이에요
                </p>
              )}
            </div>

            {/* 비밀번호 */}
            <div>
              <label className="text-xs font-medium mb-1.5 block" style={{ color: 'rgba(255,255,255,0.6)' }}>
                비밀번호
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
                placeholder="6자리 이상 입력"
                className="w-full px-4 py-3 rounded-xl text-sm text-white placeholder-gray-500 outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(99,102,241,0.8)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
            </div>

            {/* 에러 */}
            {error && (
              <div className="px-4 py-3 rounded-xl text-xs"
                style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
                ⚠️ {error}
              </div>
            )}

            {/* 버튼 */}
            <button
              onClick={handleSubmit}
              disabled={loading}
              className="w-full py-3.5 rounded-xl font-bold text-sm text-white transition-all disabled:opacity-60"
              style={{
                background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
                boxShadow: '0 8px 24px rgba(99,102,241,0.4)',
              }}>
              {loading ? '처리 중...' : isSignup ? '시작하기 →' : '로그인 →'}
            </button>
          </div>
        </div>

        {/* 하단 기능 소개 */}
        <div className="grid grid-cols-3 gap-2 mt-6">
          {[
            { icon: '🔍', label: '종목 스캐너' },
            { icon: '🤖', label: 'AI 분석' },
            { icon: '💰', label: '모의투자' },
          ].map(({ icon, label }) => (
            <div key={label} className="text-center py-3 rounded-2xl"
              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)' }}>
              <p className="text-xl mb-1">{icon}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>{label}</p>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}