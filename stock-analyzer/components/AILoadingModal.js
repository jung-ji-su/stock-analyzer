'use client';

import { useEffect, useState, useRef } from 'react';
import { BarChart3, Target, Brain, Zap, TrendingUp } from 'lucide-react';

const STEPS = [
  {
    icon: BarChart3,
    title: '종목 스캔',
    sub: '코스피·코스닥 전 종목 데이터 수집 중',
    accent: '#3B82F6',
    glow: 'rgba(59,130,246,0.35)',
  },
  {
    icon: Target,
    title: 'AI 후보 선정',
    sub: '조건 필터링 및 후보군 압축 중',
    accent: '#8B5CF6',
    glow: 'rgba(139,92,246,0.35)',
  },
  {
    icon: Brain,
    title: '기술적 지표 분석',
    sub: 'RSI · MACD · 볼린저밴드 분석 중',
    accent: '#EC4899',
    glow: 'rgba(236,72,153,0.35)',
  },
  {
    icon: Zap,
    title: 'AI 매매 판단',
    sub: '딥러닝 모델 추론 실행 중',
    accent: '#F59E0B',
    glow: 'rgba(245,158,11,0.35)',
  },
  {
    icon: TrendingUp,
    title: '최종 결정',
    sub: '매수·매도 신호 확정 중',
    accent: '#10B981',
    glow: 'rgba(16,185,129,0.35)',
  },
];

/* 파티클 설정 */
const PARTICLE_COUNT = 18;

export default function AILoadingModal({ isOpen }) {
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [particles, setParticles] = useState([]);
  const [ring, setRing] = useState(0); // 0~1 pulse
  const [visible, setVisible] = useState(false);
  const rafRef = useRef(null);
  const startRef = useRef(null);

  /* 열림/닫힘 처리 */
  useEffect(() => {
    if (isOpen) {
      setStep(0);
      setProgress(0);
      setRing(0);
      initParticles();
      setVisible(true);
    } else {
      setVisible(false);
    }
  }, [isOpen]);

  /* 파티클 초기화 */
  const initParticles = () => {
    setParticles(
      Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        id: i,
        angle: (360 / PARTICLE_COUNT) * i,
        radius: 68 + Math.random() * 28,
        size: 2 + Math.random() * 3,
        speed: 0.18 + Math.random() * 0.22,
        opacity: 0.3 + Math.random() * 0.5,
        offset: Math.random() * Math.PI * 2,
      }))
    );
  };

  /* 진행 애니메이션 */
  useEffect(() => {
    if (!isOpen) return;

    /* 단계 타이머 */
    const stepTimer = setInterval(() => {
      setStep((p) => Math.min(p + 1, STEPS.length - 1));
    }, 3800);

    /* 프로그레스 */
    const progTimer = setInterval(() => {
      setProgress((p) => (p < 95 ? p + 0.6 : p));
    }, 120);

    /* rAF: 파티클 + 링 펄스 */
    const animate = (ts) => {
      if (!startRef.current) startRef.current = ts;
      const t = (ts - startRef.current) / 1000;
      setRing((Math.sin(t * 1.8) + 1) / 2);
      setParticles((prev) =>
        prev.map((p) => ({ ...p, angle: (p.angle + p.speed) % 360 }))
      );
      rafRef.current = requestAnimationFrame(animate);
    };
    rafRef.current = requestAnimationFrame(animate);

    return () => {
      clearInterval(stepTimer);
      clearInterval(progTimer);
      cancelAnimationFrame(rafRef.current);
      startRef.current = null;
    };
  }, [isOpen]);

  if (!visible) return null;

  const cur = STEPS[step];
  const Icon = cur.icon;
  const progressDeg = (progress / 100) * 360;
  const CIRC = 2 * Math.PI * 44; // r=44

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="AI 분석 진행 중"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 9999,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'rgba(8,12,24,0.72)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        padding: '0 20px',
      }}
    >
      <style>{`
        @keyframes ai-fade-in {
          from { opacity:0; transform:scale(0.93) translateY(12px); }
          to   { opacity:1; transform:scale(1)    translateY(0); }
        }
        @keyframes ai-spin-cw  { to { transform: rotate(360deg); } }
        @keyframes ai-spin-ccw { to { transform: rotate(-360deg); } }
        @keyframes ai-text-in  {
          from { opacity:0; transform:translateY(6px); }
          to   { opacity:1; transform:translateY(0); }
        }
        @keyframes ai-shimmer {
          0%   { background-position: -200% center; }
          100% { background-position:  200% center; }
        }
        .ai-modal-card {
          animation: ai-fade-in 0.38s cubic-bezier(.22,1,.36,1) forwards;
        }
        .ai-step-text {
          animation: ai-text-in 0.3s ease forwards;
        }
        .ai-shimmer-bar {
          background: linear-gradient(90deg,
            rgba(255,255,255,0.06) 0%,
            rgba(255,255,255,0.18) 40%,
            rgba(255,255,255,0.06) 80%
          );
          background-size: 200% 100%;
          animation: ai-shimmer 1.6s ease-in-out infinite;
        }
        .ai-ring-outer {
          animation: ai-spin-cw 7s linear infinite;
        }
        .ai-ring-inner {
          animation: ai-spin-ccw 5s linear infinite;
        }
      `}</style>

      {/* ── 카드 ── */}
      <div
        className="ai-modal-card"
        style={{
          width: '100%',
          maxWidth: 360,
          borderRadius: 28,
          padding: '32px 24px 28px',
          position: 'relative',
          overflow: 'hidden',
          /* Glassmorphism */
          background: 'rgba(14,20,40,0.78)',
          border: '1px solid rgba(255,255,255,0.10)',
          boxShadow: `
            0 0 0 1px rgba(255,255,255,0.04),
            0 32px 64px rgba(0,0,0,0.5),
            0 0 80px ${cur.glow}
          `,
          backdropFilter: 'blur(24px)',
          WebkitBackdropFilter: 'blur(24px)',
          transition: 'box-shadow 0.6s ease',
        }}
      >
        {/* ── 배경 그라데이션 오로라 ── */}
        <div
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(ellipse 60% 40% at 50% 0%, ${cur.glow}, transparent 70%)`,
            pointerEvents: 'none',
            transition: 'background 0.6s ease',
          }}
        />

        {/* ── 아이콘 영역 ── */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28, position: 'relative' }}>
          {/* 파티클 레이어 */}
          <svg
            width={160}
            height={160}
            viewBox="-80 -80 160 160"
            style={{ position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%,-50%)' }}
          >
            {particles.map((p) => {
              const rad = (p.angle * Math.PI) / 180;
              const x = Math.cos(rad) * p.radius;
              const y = Math.sin(rad) * p.radius;
              return (
                <circle
                  key={p.id}
                  cx={x} cy={y}
                  r={p.size}
                  fill={cur.accent}
                  opacity={p.opacity * (0.6 + 0.4 * Math.sin(Date.now() / 800 + p.offset))}
                />
              );
            })}
          </svg>

          {/* SVG 원형 프로그레스 */}
          <svg width={100} height={100} viewBox="0 0 100 100" style={{ position: 'relative', zIndex: 2 }}>
            {/* 바깥 회전 링 */}
            <g className="ai-ring-outer" style={{ transformOrigin: '50px 50px' }}>
              <circle cx="50" cy="50" r="48" fill="none" stroke="rgba(255,255,255,0.05)" strokeWidth="1" />
              {[0, 45, 90, 135, 180, 225, 270, 315].map((a) => {
                const rx = 50 + 48 * Math.cos((a * Math.PI) / 180);
                const ry = 50 + 48 * Math.sin((a * Math.PI) / 180);
                return <circle key={a} cx={rx} cy={ry} r="1.5" fill="rgba(255,255,255,0.2)" />;
              })}
            </g>

            {/* 안쪽 회전 링 */}
            <g className="ai-ring-inner" style={{ transformOrigin: '50px 50px' }}>
              {[0, 60, 120, 180, 240, 300].map((a) => {
                const rx = 50 + 38 * Math.cos((a * Math.PI) / 180);
                const ry = 50 + 38 * Math.sin((a * Math.PI) / 180);
                return <circle key={a} cx={rx} cy={ry} r="1" fill={cur.accent} opacity="0.5" />;
              })}
            </g>

            {/* 트랙 */}
            <circle
              cx="50" cy="50" r="44"
              fill="none"
              stroke="rgba(255,255,255,0.07)"
              strokeWidth="4"
              strokeLinecap="round"
            />
            {/* 진행 호 */}
            <circle
              cx="50" cy="50" r="44"
              fill="none"
              stroke={cur.accent}
              strokeWidth="4"
              strokeLinecap="round"
              strokeDasharray={CIRC}
              strokeDashoffset={CIRC - (progress / 100) * CIRC}
              transform="rotate(-90 50 50)"
              style={{ transition: 'stroke-dashoffset 0.4s ease, stroke 0.6s ease', filter: `drop-shadow(0 0 6px ${cur.accent})` }}
            />
            {/* 펄스 링 */}
            <circle
              cx="50" cy="50" r="44"
              fill="none"
              stroke={cur.accent}
              strokeWidth={2 + ring * 4}
              opacity={0.12 + ring * 0.18}
              strokeDasharray={CIRC}
              strokeDashoffset={0}
              style={{ transition: 'stroke 0.6s ease' }}
            />

            {/* 아이콘 배경 */}
            <circle cx="50" cy="50" r="30" fill="rgba(255,255,255,0.04)" />
            <circle cx="50" cy="50" r="30" fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
          </svg>

          {/* 아이콘 (절대 중앙) */}
          <div
            style={{
              position: 'absolute',
              top: '50%', left: '50%',
              transform: 'translate(-50%,-50%)',
              zIndex: 3,
              width: 44, height: 44,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              borderRadius: 14,
              background: `linear-gradient(135deg, ${cur.accent}22, ${cur.accent}44)`,
              border: `1px solid ${cur.accent}55`,
              boxShadow: `0 0 24px ${cur.glow}`,
              transition: 'background 0.5s ease, box-shadow 0.5s ease',
            }}
          >
            <Icon size={22} color={cur.accent} strokeWidth={2} style={{ transition: 'color 0.5s ease' }} />
          </div>
        </div>

        {/* ── 텍스트 ── */}
        <div key={step} className="ai-step-text" style={{ textAlign: 'center', marginBottom: 24 }}>
          <h2 style={{
            fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px',
            color: '#fff', margin: '0 0 6px',
          }}>
            {cur.title}
          </h2>
          <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', margin: 0, lineHeight: 1.5 }}>
            {cur.sub}
          </p>
        </div>

        {/* ── 프로그레스 바 ── */}
        <div style={{ marginBottom: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
            <span style={{ fontSize: 11, fontWeight: 600, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.05em' }}>
              PROGRESS
            </span>
            <span style={{ fontSize: 11, fontWeight: 700, color: cur.accent, transition: 'color 0.5s' }}>
              {Math.round(progress)}%
            </span>
          </div>
          {/* 트랙 */}
          <div style={{
            height: 5, borderRadius: 99,
            background: 'rgba(255,255,255,0.07)',
            overflow: 'hidden',
            position: 'relative',
          }}>
            {/* 채워진 바 */}
            <div style={{
              position: 'absolute', top: 0, left: 0, bottom: 0,
              width: `${progress}%`,
              borderRadius: 99,
              background: `linear-gradient(90deg, ${cur.accent}cc, ${cur.accent})`,
              boxShadow: `0 0 10px ${cur.glow}`,
              transition: 'width 0.3s ease, background 0.5s ease',
            }} />
            {/* 시머 오버레이 */}
            <div
              className="ai-shimmer-bar"
              style={{
                position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
                borderRadius: 99,
                pointerEvents: 'none',
              }}
            />
          </div>
        </div>

        {/* ── 단계 인디케이터 ── */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 6, marginBottom: 20 }}>
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            return (
              <div
                key={i}
                style={{
                  borderRadius: 99,
                  transition: 'all 0.35s cubic-bezier(.22,1,.36,1)',
                  width: active ? 24 : done ? 8 : 6,
                  height: active ? 6 : done ? 6 : 5,
                  background: active
                    ? cur.accent
                    : done
                    ? `${cur.accent}88`
                    : 'rgba(255,255,255,0.15)',
                  boxShadow: active ? `0 0 8px ${cur.glow}` : 'none',
                }}
              />
            );
          })}
        </div>

        {/* ── 스텝 리스트 (Skeleton 스타일) ── */}
        <div style={{
          background: 'rgba(255,255,255,0.04)',
          border: '1px solid rgba(255,255,255,0.07)',
          borderRadius: 16, padding: '12px 14px',
          display: 'flex', flexDirection: 'column', gap: 10,
        }}>
          {STEPS.map((s, i) => {
            const done = i < step;
            const active = i === step;
            const StepIcon = s.icon;
            return (
              <div
                key={i}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  opacity: done ? 0.6 : active ? 1 : 0.3,
                  transition: 'opacity 0.4s ease',
                }}
              >
                {/* 아이콘 */}
                <div style={{
                  width: 26, height: 26, borderRadius: 8, flexShrink: 0,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  background: active ? `${cur.accent}22` : 'rgba(255,255,255,0.05)',
                  border: `1px solid ${active ? cur.accent + '44' : 'transparent'}`,
                  transition: 'all 0.4s ease',
                }}>
                  <StepIcon size={13} color={active ? cur.accent : done ? 'rgba(255,255,255,0.6)' : 'rgba(255,255,255,0.25)'} strokeWidth={2} />
                </div>

                {/* 텍스트 or 스켈레톤 */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  {done || active ? (
                    <span style={{
                      fontSize: 12, fontWeight: active ? 600 : 400,
                      color: active ? '#fff' : 'rgba(255,255,255,0.5)',
                      whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                      display: 'block',
                    }}>
                      {s.title}
                    </span>
                  ) : (
                    <div style={{
                      height: 10, borderRadius: 5,
                      background: 'rgba(255,255,255,0.1)',
                      width: `${50 + (i * 13) % 35}%`,
                    }} className="ai-shimmer-bar" />
                  )}
                </div>

                {/* 완료 체크 */}
                <div style={{
                  width: 16, height: 16, borderRadius: 8, flexShrink: 0,
                  background: done ? '#10B981' : 'rgba(255,255,255,0.07)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  transition: 'all 0.3s ease',
                }}>
                  {done && (
                    <svg width="10" height="10" viewBox="0 0 10 10" fill="none">
                      <path d="M2 5l2.5 2.5L8 3" stroke="#fff" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* ── 하단 도트 애니메이션 ── */}
        <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 5, marginTop: 18 }}>
          {[0, 1, 2].map((i) => (
            <div
              key={i}
              style={{
                width: 5, height: 5, borderRadius: 99,
                background: cur.accent,
                opacity: 0.6,
                animation: `ai-fade-in 0.6s ease ${i * 0.18}s infinite alternate`,
                transition: 'background 0.5s ease',
              }}
            />
          ))}
          <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginLeft: 8, letterSpacing: '0.03em' }}>
            AI 분석 중
          </span>
        </div>
      </div>
    </div>
  );
}