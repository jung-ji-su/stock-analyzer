'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.45, delay: i * 0.08, ease: [0.22, 1, 0.36, 1] } }),
};

function MiniSparkline({ isUp }) {
  const color = isUp ? '#DC2626' : '#2563EB';
  const d = isUp
    ? 'M2,18 C8,16 14,13 20,11 C26,9 32,7 38,5 C44,3 50,4 58,3'
    : 'M2,4 C8,5 14,8 20,10 C26,12 32,14 38,16 C44,18 50,17 58,19';
  const fill = isUp
    ? 'M2,18 C8,16 14,13 20,11 C26,9 32,7 38,5 C44,3 50,4 58,3 L58,22 L2,22 Z'
    : 'M2,4 C8,5 14,8 20,10 C26,12 32,14 38,16 C44,18 50,17 58,19 L58,0 L2,0 Z';
  return (
    <svg width="60" height="22" viewBox="0 0 60 22" fill="none" style={{ display: 'block' }}>
      <defs>
        <linearGradient id={`sg${isUp ? 'u' : 'd'}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity={isUp ? "0.2" : "0.15"} />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path d={fill} fill={`url(#sg${isUp ? 'u' : 'd'})`} />
      <path d={d} stroke={color} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" fill="none" />
    </svg>
  );
}

function IndexCard({ label, data, onClick }) {
  const isUp = Number(data?.changePercent || 0) >= 0;
  const pct = Math.abs(Number(data?.changePercent || 0)).toFixed(2);
  const color = isUp ? '#DC2626' : '#2563EB';
  return (
    <div onClick={onClick} style={{
      flex: 1, borderRadius: 18, padding: '14px 14px 12px', cursor: 'pointer',
      background: isUp ? 'rgba(220,38,38,0.04)' : 'rgba(37,99,235,0.04)',
      border: `1px solid ${isUp ? 'rgba(220,38,38,0.1)' : 'rgba(37,99,235,0.1)'}`,
      transition: 'opacity 0.15s',
      WebkitTapHighlightColor: 'transparent',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
        <div style={{ fontSize: 10, fontWeight: 700, color: '#9CA3AF', letterSpacing: '0.06em' }}>{label}</div>
        <MiniSparkline isUp={isUp} />
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#111827', letterSpacing: '-0.5px', marginBottom: 5 }}>
        {data?.price?.toLocaleString() ?? '—'}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        <span style={{ fontSize: 16, color, lineHeight: 1 }}>{isUp ? '▲' : '▼'}</span>
        <span style={{ fontSize: 14, fontWeight: 800, color }}>{pct}%</span>
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

const TIMEFRAMES = ['1년', '3년', '5년', '10년'];
const TF_YEARS = { '1년': 1, '3년': 3, '5년': 5, '10년': 10 };

function IndexChartModal({ symbol, label, data, onClose }) {
  const containerRef = useRef(null);
  const chartRef = useRef(null);
  const [rawData, setRawData] = useState(null);
  const [loadingChart, setLoadingChart] = useState(true);
  const [tf, setTf] = useState('10년');
  const isUp = Number(data?.changePercent || 0) >= 0;
  const accentColor = isUp ? '#ef4444' : '#3b82f6';

  useEffect(() => {
    (async () => {
      setLoadingChart(true);
      try {
        const res = await fetch(`/api/stock?symbol=${symbol}&timeframe=monthly`);
        const d = await res.json();
        setRawData(d.chartData || []);
      } catch (e) {
        console.error('index chart load failed:', e.message);
      } finally {
        setLoadingChart(false);
      }
    })();
  }, [symbol]);

  useEffect(() => {
    if (!rawData || !containerRef.current) return;
    if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; }
    (async () => {
      const LWC = await import('lightweight-charts');
      const chart = LWC.createChart(containerRef.current, {
        width: containerRef.current.clientWidth,
        height: 240,
        layout: { background: { color: 'transparent' }, textColor: 'rgba(255,255,255,0.4)' },
        grid: { vertLines: { color: 'rgba(255,255,255,0.04)' }, horzLines: { color: 'rgba(255,255,255,0.04)' } },
        crosshair: { mode: 1 },
        rightPriceScale: { borderColor: 'rgba(255,255,255,0.1)', borderVisible: true },
        leftPriceScale: { visible: false },
        timeScale: { borderColor: 'rgba(255,255,255,0.08)', timeVisible: false, borderVisible: true },
        localization: { priceFormatter: (p) => Math.round(p).toLocaleString('ko-KR') },
        handleScroll: true,
        handleScale: true,
      });
      chartRef.current = chart;

      const cutoff = new Date();
      cutoff.setFullYear(cutoff.getFullYear() - TF_YEARS[tf]);
      const cutoffStr = cutoff.toISOString().slice(0, 10);
      const filtered = rawData.filter(d => d.time >= cutoffStr);

      const areaSeries = chart.addSeries(LWC.AreaSeries, {
        lineColor: accentColor,
        topColor: `${accentColor}33`,
        bottomColor: 'transparent',
        lineWidth: 2,
        priceLineVisible: false,
        lastValueVisible: true,
        crosshairMarkerVisible: true,
        crosshairMarkerRadius: 4,
        crosshairMarkerBorderColor: accentColor,
        crosshairMarkerBackgroundColor: accentColor,
      });
      areaSeries.setData(filtered.map(d => ({ time: d.time, value: d.close })));
      chart.timeScale().fitContent();
    })();
    return () => { if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; } };
  }, [rawData, tf]);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 300, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end' }}
      onClick={onClose}>
      {/* 백드롭 */}
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(6px)' }} />

      {/* 바텀 시트 */}
      <motion.div
        initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        onClick={e => e.stopPropagation()}
        style={{
          position: 'relative', background: '#0F172A',
          borderRadius: '24px 24px 0 0',
          paddingBottom: 40, overflow: 'hidden',
          boxShadow: '0 -8px 48px rgba(0,0,0,0.4)',
        }}>
        {/* 핸들 */}
        <div style={{ width: 36, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', margin: '12px auto 0' }} />

        {/* 헤더 */}
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', padding: '16px 20px 10px' }}>
          <div>
            <div style={{ fontSize: 10, fontWeight: 700, color: 'rgba(255,255,255,0.35)', letterSpacing: '0.12em', marginBottom: 4 }}>{label}</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#fff', letterSpacing: '-0.8px', lineHeight: 1 }}>
              {data?.price?.toLocaleString() ?? '—'}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 6 }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: accentColor }}>
                {isUp ? '▲' : '▼'} {Math.abs(Number(data?.changePercent || 0)).toFixed(2)}%
              </span>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.3)' }}>
                ({Number(data?.change || 0) >= 0 ? '+' : ''}{data?.change ?? 0})
              </span>
            </div>
          </div>
          <button onClick={onClose}
            style={{ width: 30, height: 30, borderRadius: '50%', background: 'rgba(255,255,255,0.08)', border: 'none', color: 'rgba(255,255,255,0.7)', fontSize: 14, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            ✕
          </button>
        </div>

        {/* 기간 탭 */}
        <div style={{ display: 'flex', gap: 6, padding: '0 20px 14px' }}>
          {TIMEFRAMES.map(t => (
            <button key={t} onClick={() => setTf(t)} style={{
              fontSize: 11, fontWeight: 700, padding: '5px 13px', borderRadius: 20, border: 'none', cursor: 'pointer',
              background: tf === t ? `${accentColor}28` : 'rgba(255,255,255,0.06)',
              color: tf === t ? accentColor : 'rgba(255,255,255,0.35)',
              transition: 'all 0.15s',
            }}>{t}</button>
          ))}
        </div>

        {/* 차트 영역 */}
        <div style={{ padding: '0 4px', position: 'relative', minHeight: 240 }}>
          {loadingChart ? (
            <div style={{ height: 240, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.2, ease: 'linear' }}
                style={{ width: 28, height: 28, borderRadius: '50%', border: `3px solid ${accentColor}33`, borderTopColor: accentColor }} />
            </div>
          ) : (
            <div ref={containerRef} style={{ height: 240 }} />
          )}
        </div>

        {/* 월봉 안내 */}
        <div style={{ textAlign: 'center', marginTop: 8, fontSize: 10, color: 'rgba(255,255,255,0.2)' }}>
          월봉 · Yahoo Finance
        </div>
      </motion.div>
    </div>
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
  const [indexModal, setIndexModal] = useState(null); // { symbol, label, data }

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
              <IndexCard label="KOSPI" data={briefing?.kospi}
                onClick={() => setIndexModal({ symbol: 'KS11', label: 'KOSPI', data: briefing?.kospi })} />
              <IndexCard label="KOSDAQ" data={briefing?.kosdaq}
                onClick={() => setIndexModal({ symbol: 'KQ11', label: 'KOSDAQ', data: briefing?.kosdaq })} />
            </div>
          )}
        </motion.div>

        {/* ── AI 브리핑 ── */}
        {briefing?.aiComment && (
          <motion.div custom={1} variants={fadeUp} initial="hidden" animate="visible"
            style={{ borderRadius: 20, marginBottom: 12, overflow: 'hidden', position: 'relative',
              background: 'linear-gradient(135deg, #0F172A 0%, #1E2D6B 60%, #312E81 100%)',
              boxShadow: '0 8px 32px rgba(15,23,42,0.18)',
            }}>
            {/* Glow */}
            <div style={{ position: 'absolute', top: -20, right: -20, width: 80, height: 80, borderRadius: '50%', background: 'rgba(99,102,241,0.4)', filter: 'blur(25px)', pointerEvents: 'none' }} />
            <div style={{ position: 'relative', padding: '18px 20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <div style={{ width: 28, height: 28, borderRadius: 9, background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, boxShadow: '0 4px 12px rgba(99,102,241,0.5)' }}>🤖</div>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'rgba(255,255,255,0.9)', letterSpacing: '0.02em' }}>AI 시황 분석</span>
                <div style={{ marginLeft: 'auto', fontSize: 9, color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.07)', padding: '3px 8px', borderRadius: 20, border: '1px solid rgba(255,255,255,0.1)' }}>Gemini Flash</div>
              </div>
              <div style={{ borderLeft: '2px solid rgba(99,102,241,0.7)', paddingLeft: 14 }}>
                <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.85)', lineHeight: 1.85, margin: 0, letterSpacing: '0.01em' }}>{briefing.aiComment}</p>
              </div>
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
                  <span style={{ fontSize: 11, fontWeight: 700, color: !s.changeRate?.startsWith('-') ? '#DC2626' : '#2563EB' }}>
                    {!s.changeRate?.startsWith('-') ? '+' : ''}{s.changeRate}
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

      {/* 지수 차트 모달 */}
      <AnimatePresence>
        {indexModal && (
          <IndexChartModal
            key={indexModal.symbol}
            symbol={indexModal.symbol}
            label={indexModal.label}
            data={indexModal.data}
            onClose={() => setIndexModal(null)}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
