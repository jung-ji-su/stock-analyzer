'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.45, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] } }),
};

function IndexCard({ label, data }) {
  const isUp = Number(data?.changePercent || 0) >= 0;
  const pct = Math.abs(Number(data?.changePercent || 0)).toFixed(2);
  return (
    <div style={{
      flex: 1, borderRadius: 18, padding: '16px 14px',
      background: isUp ? 'rgba(220,38,38,0.05)' : 'rgba(37,99,235,0.05)',
      border: `1px solid ${isUp ? 'rgba(220,38,38,0.12)' : 'rgba(37,99,235,0.12)'}`,
    }}>
      <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.06em', marginBottom: 8 }}>{label}</div>
      <div style={{ fontSize: 22, fontWeight: 800, color: '#111827', letterSpacing: '-0.5px', marginBottom: 6 }}>
        {data?.price?.toLocaleString() ?? '—'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 18, color: isUp ? '#DC2626' : '#2563EB', lineHeight: 1 }}>{isUp ? '▲' : '▼'}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color: isUp ? '#DC2626' : '#2563EB' }}>{pct}%</span>
        <span style={{ fontSize: 11, color: '#9CA3AF', marginLeft: 2 }}>
          ({Number(data?.change || 0) >= 0 ? '+' : ''}{data?.change ?? '0'})
        </span>
      </div>
    </div>
  );
}

function StockRow({ stock, rank, onClick }) {
  return (
    <motion.button
      onClick={onClick}
      whileTap={{ scale: 0.98 }}
      style={{
        width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '11px 14px', background: 'rgba(220,38,38,0.04)', borderRadius: 14,
        border: '1px solid rgba(220,38,38,0.08)', cursor: 'pointer', marginBottom: 8,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ width: 20, height: 20, borderRadius: 6, background: 'rgba(220,38,38,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 800, color: '#DC2626', flexShrink: 0 }}>{rank}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: '#111827' }}>{stock.name}</span>
        <span style={{ fontSize: 10, color: '#9CA3AF' }}>{stock.code}</span>
      </div>
      <span style={{ fontSize: 14, fontWeight: 800, color: '#DC2626' }}>▲ {stock.changeRate}</span>
    </motion.button>
  );
}

function NewsItem({ article, isLast }) {
  return (
    <a href={article.link} target="_blank" rel="noopener noreferrer" style={{ display: 'block', textDecoration: 'none' }}>
      <div style={{ padding: '12px 0', borderBottom: isLast ? 'none' : '1px solid #F3F4F6' }}>
        <p style={{ fontSize: 13, fontWeight: 600, color: '#111827', lineHeight: 1.55, margin: '0 0 5px' }}>{article.title}</p>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ fontSize: 10, color: '#9CA3AF' }}>{article.press}</span>
          <span style={{ width: 2, height: 2, borderRadius: '50%', background: '#D1D5DB' }} />
          <span style={{ fontSize: 10, color: '#9CA3AF' }}>{article.time}</span>
        </div>
      </div>
    </a>
  );
}

function LoadingScreen() {
  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20 }}>
      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
        style={{ width: 36, height: 36, borderRadius: '50%', border: '3px solid rgba(79,70,229,0.15)', borderTopColor: '#4F46E5' }}
      />
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 15, fontWeight: 700, color: '#374151', marginBottom: 4 }}>시황 분석 중</p>
        <p style={{ fontSize: 12, color: '#9CA3AF' }}>AI가 오늘의 시장을 분석하고 있어요</p>
      </div>
      <div style={{ display: 'flex', gap: 8 }}>
        {['📊 지수 분석', '📰 뉴스 수집', '🤖 AI 요약'].map((step, i) => (
          <motion.div key={step} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: i * 0.4 }}
            style={{ fontSize: 11, color: '#6B7280', background: '#F1F5F9', padding: '4px 10px', borderRadius: 20 }}>
            {step}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

export default function BriefingPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [briefing, setBriefing] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    load();
  }, [user]);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/morning-brief');
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setBriefing(data.briefing);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const dateStr = kstNow.toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'long' });
  const timeStr = briefing?.generatedAt
    ? new Date(briefing.generatedAt).toLocaleTimeString('ko-KR', { timeZone: 'Asia/Seoul', hour: '2-digit', minute: '2-digit' })
    : null;

  if (loading) return <LoadingScreen />;

  return (
    <div style={{ minHeight: '100vh', background: '#F8FAFC', fontFamily: "'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif", paddingBottom: 100 }}>

      {/* ── 헤더 ── */}
      <div style={{
        background: 'linear-gradient(145deg, #1E3A5F 0%, #0F172A 100%)',
        padding: '28px 20px 44px', position: 'relative', overflow: 'hidden',
      }}>
        <div style={{ position: 'absolute', top: -40, right: -30, width: 180, height: 180, borderRadius: '50%', background: 'rgba(251,191,36,0.07)', filter: 'blur(50px)', pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', bottom: -20, left: -10, width: 140, height: 140, borderRadius: '50%', background: 'rgba(99,102,241,0.1)', filter: 'blur(35px)', pointerEvents: 'none' }} />
        <div style={{ position: 'relative' }}>
          <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', fontWeight: 700, letterSpacing: '0.15em', marginBottom: 8, textTransform: 'uppercase' }}>Daily Market Brief</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: '#fff', letterSpacing: '-0.6px', lineHeight: 1.1, marginBottom: 6 }}>오늘의 시황</div>
          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.45)' }}>{dateStr}</div>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>

        {/* ── 시장 지수 (헤더에 올라타는 카드) ── */}
        <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible"
          style={{
            marginTop: 16, marginBottom: 14,
            background: '#fff', borderRadius: 24, padding: '20px',
            border: '1px solid #E5E7EB',
            boxShadow: '0 4px 24px rgba(0,0,0,0.07)',
          }}>
          <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.08em', marginBottom: 14, textTransform: 'uppercase' }}>Market Pulse</div>
          {error ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <p style={{ fontSize: 13, color: '#EF4444', marginBottom: 12 }}>데이터를 불러오지 못했어요</p>
              <button onClick={load} style={{ fontSize: 12, color: '#4F46E5', background: 'none', border: '1px solid #4F46E5', borderRadius: 10, padding: '6px 14px', cursor: 'pointer', fontWeight: 600 }}>다시 시도</button>
            </div>
          ) : (
            <div style={{ display: 'flex', gap: 10 }}>
              <IndexCard label="KOSPI" data={briefing?.kospi} />
              <IndexCard label="KOSDAQ" data={briefing?.kosdaq} />
            </div>
          )}
        </motion.div>

        {/* ── AI 브리핑 ── */}
        {briefing?.aiComment && (
          <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible"
            style={{ background: '#fff', borderRadius: 20, padding: '18px 20px', border: '1px solid #E5E7EB', marginBottom: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <div style={{ width: 28, height: 28, borderRadius: 8, background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13 }}>🤖</div>
              <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>AI 브리핑</span>
            </div>
            <div style={{ borderLeft: '3px solid #4F46E5', paddingLeft: 14 }}>
              <p style={{ fontSize: 14, color: '#374151', lineHeight: 1.8, margin: 0 }}>{briefing.aiComment}</p>
            </div>
          </motion.div>
        )}

        {/* ── 상승률 TOP 3 ── */}
        {briefing?.topRise?.length > 0 && (
          <motion.div custom={2} variants={fadeUp} initial="hidden" animate="visible"
            style={{ background: '#fff', borderRadius: 20, padding: '16px 18px', border: '1px solid #E5E7EB', marginBottom: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.06em', marginBottom: 14, textTransform: 'uppercase' }}>🚀 상승률 Top 5</div>
            {briefing.topRise.map((s, i) => (
              <StockRow key={s.code} stock={s} rank={i + 1}
                onClick={() => router.push(`/?stock=${s.code}&name=${encodeURIComponent(s.name)}`)} />
            ))}
          </motion.div>
        )}

        {/* ── 거래량 급등 ── */}
        {briefing?.topVolume?.length > 0 && (
          <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible"
            style={{ background: '#fff', borderRadius: 20, padding: '16px 18px', border: '1px solid #E5E7EB', marginBottom: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.06em', marginBottom: 12, textTransform: 'uppercase' }}>📊 거래량 급등</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {briefing.topVolume.map(s => (
                <motion.button key={s.code} whileTap={{ scale: 0.95 }}
                  onClick={() => router.push(`/?stock=${s.code}&name=${encodeURIComponent(s.name)}`)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '8px 12px', borderRadius: 20, border: '1px solid #E5E7EB',
                    background: '#F8FAFC', cursor: 'pointer',
                  }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#374151' }}>{s.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, color: Number(s.change) >= 0 ? '#DC2626' : '#2563EB' }}>
                    {Number(s.change) >= 0 ? '+' : ''}{s.changeRate}
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── 주요 뉴스 ── */}
        {briefing?.news?.length > 0 && (
          <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible"
            style={{ background: '#fff', borderRadius: 20, padding: '16px 18px', border: '1px solid #E5E7EB', marginBottom: 12, boxShadow: '0 2px 12px rgba(0,0,0,0.04)' }}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.06em', marginBottom: 4, textTransform: 'uppercase' }}>📰 주요 뉴스</div>
            {briefing.news.map((item, i) => (
              <NewsItem key={i} article={item} isLast={i === briefing.news.length - 1} />
            ))}
          </motion.div>
        )}

        {/* ── 푸터 ── */}
        <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible"
          style={{ textAlign: 'center', padding: '12px 0 24px' }}>
          {timeStr && (
            <p style={{ fontSize: 11, color: '#D1D5DB', marginBottom: 10 }}>
              마지막 업데이트 {timeStr} · 매일 오전 8시 자동 생성
            </p>
          )}
          <motion.button whileTap={{ scale: 0.95 }} onClick={async () => {
            setLoading(true);
            setError(null);
            try {
              const res = await fetch('/api/morning-brief?force=1');
              const data = await res.json();
              if (data.error) throw new Error(data.error);
              setBriefing(data.briefing);
            } catch (e) { setError(e.message); } finally { setLoading(false); }
          }}
            style={{ fontSize: 12, color: '#4F46E5', background: 'rgba(79,70,229,0.06)', border: '1px solid rgba(79,70,229,0.15)', borderRadius: 20, padding: '8px 18px', cursor: 'pointer', fontWeight: 700 }}>
            🔄 새로고침
          </motion.button>
        </motion.div>
      </div>
    </div>
  );
}
