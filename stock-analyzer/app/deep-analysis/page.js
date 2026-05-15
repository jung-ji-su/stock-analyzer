'use client';

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';

const fadeUp = {
  hidden: { opacity: 0, y: 20 },
  visible: (i = 0) => ({ opacity: 1, y: 0, transition: { duration: 0.5, delay: i * 0.1, ease: [0.22, 1, 0.36, 1] } }),
};

const RATING_CONFIG = {
  '강한매수': { color: '#DC2626', bg: 'rgba(220,38,38,0.12)', border: 'rgba(220,38,38,0.25)', label: '강한 매수' },
  '매수':     { color: '#EF4444', bg: 'rgba(239,68,68,0.08)',  border: 'rgba(239,68,68,0.2)',  label: '매수' },
  '중립':     { color: '#6B7280', bg: 'rgba(107,114,128,0.08)', border: 'rgba(107,114,128,0.2)', label: '중립' },
  '매도':     { color: '#2563EB', bg: 'rgba(37,99,235,0.08)',  border: 'rgba(37,99,235,0.2)',  label: '매도' },
  '강한매도': { color: '#1D4ED8', bg: 'rgba(29,78,216,0.12)', border: 'rgba(29,78,216,0.25)', label: '강한 매도' },
};

const SECTION_RATING = {
  bullish:  { color: '#DC2626', label: '강세', icon: '▲' },
  bearish:  { color: '#2563EB', label: '약세', icon: '▼' },
  neutral:  { color: '#6B7280', label: '중립', icon: '—' },
};

const ANALYSIS_STEPS = [
  { icon: '📈', label: '기술적 지표 분석', sub: '이동평균·RSI·MACD·볼린저·일목균형표' },
  { icon: '💹', label: '수급 분석',         sub: '외국인·기관 20거래일 순매수 추이' },
  { icon: '📰', label: '뉴스 센티먼트',     sub: '최근 7일 뉴스·공시 영향 분석' },
  { icon: '🔬', label: 'AI 독자 분석',      sub: '피보나치·OBV·베타·복합 신호' },
  { icon: '🎯', label: '통합 판정 생성',    sub: '목표가·손절가·1주/1개월 시나리오' },
];

function LoadingSteps() {
  const [step, setStep] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setStep(s => Math.min(s + 1, ANALYSIS_STEPS.length - 1)), 4500);
    return () => clearInterval(timer);
  }, []);
  return (
    <div style={{ padding: '32px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
      <motion.div animate={{ rotate: 360 }} transition={{ repeat: Infinity, duration: 1.4, ease: 'linear' }}
        style={{ width: 44, height: 44, borderRadius: '50%', border: '3.5px solid rgba(99,102,241,0.15)', borderTopColor: '#6366F1' }} />
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>딥 분석 진행 중</p>
        <p style={{ fontSize: 12, color: '#94a3b8' }}>최대 30~50초 소요됩니다</p>
      </div>
      <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
        {ANALYSIS_STEPS.map((s, i) => (
          <motion.div key={i} initial={{ opacity: 0.4 }} animate={{ opacity: i <= step ? 1 : 0.35 }}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 16,
              background: i === step ? 'rgba(99,102,241,0.08)' : 'white',
              border: `1.5px solid ${i === step ? 'rgba(99,102,241,0.3)' : '#f1f5f9'}`,
              transition: 'all 0.4s' }}>
            <span style={{ fontSize: 22, flexShrink: 0 }}>{s.icon}</span>
            <div style={{ flex: 1 }}>
              <p style={{ fontSize: 13, fontWeight: 700, color: i <= step ? '#0f172a' : '#94a3b8', marginBottom: 2 }}>{s.label}</p>
              <p style={{ fontSize: 11, color: '#94a3b8' }}>{s.sub}</p>
            </div>
            {i < step && <span style={{ fontSize: 16, color: '#22c55e' }}>✓</span>}
            {i === step && (
              <motion.div animate={{ scale: [1, 1.3, 1] }} transition={{ repeat: Infinity, duration: 0.8 }}
                style={{ width: 8, height: 8, borderRadius: '50%', background: '#6366F1' }} />
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
}

function RatingBadge({ rating, size = 'sm' }) {
  const cfg = RATING_CONFIG[rating] || RATING_CONFIG['중립'];
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: size === 'lg' ? '8px 20px' : '4px 12px',
      borderRadius: 100, fontSize: size === 'lg' ? 15 : 12,
      fontWeight: 800, color: cfg.color,
      background: cfg.bg, border: `1.5px solid ${cfg.border}`,
    }}>{cfg.label}</span>
  );
}

function SectionRating({ rating }) {
  const cfg = SECTION_RATING[rating] || SECTION_RATING.neutral;
  return (
    <span style={{ fontSize: 11, fontWeight: 700, color: cfg.color,
      background: `${cfg.color}15`, border: `1px solid ${cfg.color}30`,
      padding: '3px 10px', borderRadius: 20 }}>
      {cfg.icon} {cfg.label}
    </span>
  );
}

function SectionCard({ icon, title, children, custom }) {
  return (
    <motion.div custom={custom} variants={fadeUp} initial="hidden" animate="visible"
      style={{ background: 'white', borderRadius: 22, border: '1px solid #e2e8f0',
        boxShadow: '0 2px 16px rgba(0,0,0,0.06)', padding: '20px', marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
        <span style={{ fontSize: 18 }}>{icon}</span>
        <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 }}>{title}</h3>
      </div>
      {children}
    </motion.div>
  );
}

function KeySignals({ signals, color }) {
  if (!signals?.length) return null;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 12 }}>
      {signals.map((s, i) => (
        <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
          <span style={{ width: 6, height: 6, borderRadius: '50%', background: color || '#6366f1',
            flexShrink: 0, marginTop: 6 }} />
          <p style={{ fontSize: 12, color: '#374151', lineHeight: 1.6, margin: 0 }}>{s}</p>
        </div>
      ))}
    </div>
  );
}

function ScoreBar({ value, max = 100, color }) {
  return (
    <div style={{ height: 6, background: '#f1f5f9', borderRadius: 6, overflow: 'hidden', marginTop: 8 }}>
      <motion.div initial={{ width: 0 }} animate={{ width: `${(value / max) * 100}%` }}
        transition={{ duration: 1, ease: 'easeOut' }}
        style={{ height: '100%', background: color || '#6366f1', borderRadius: 6 }} />
    </div>
  );
}

export default function DeepAnalysisPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedStock, setSelectedStock] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [topStocks, setTopStocks] = useState([]);
  const debounceRef = useRef(null);

  useEffect(() => { if (!user) router.push('/login'); }, [user]);

  useEffect(() => {
    fetch('/api/top?type=rise')
      .then(r => r.json())
      .then(d => setTopStocks((d.stocks || []).slice(0, 10)))
      .catch(() => {});
  }, []);

  const handleSearch = (val) => {
    setQuery(val);
    clearTimeout(debounceRef.current);
    if (!val.trim()) { setSearchResults([]); return; }
    debounceRef.current = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(val)}`);
        const data = await res.json();
        setSearchResults((data.results || []).slice(0, 6));
      } catch { setSearchResults([]); }
    }, 300);
  };

  const handleSelectStock = (stock) => {
    setSelectedStock(stock);
    setQuery(stock.name);
    setSearchResults([]);
    setResult(null);
    setError(null);
  };

  const handleAnalyze = async () => {
    if (!selectedStock) return;
    setLoading(true);
    setResult(null);
    setError(null);
    try {
      const res = await fetch(`/api/deep-analysis?code=${selectedStock.symbol}&name=${encodeURIComponent(selectedStock.name)}`);
      const data = await res.json();
      if (data.error) throw new Error(data.error);
      setResult(data);
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  const r = result?.report;
  const ind = result?.indicators;
  const inv = result?.investorFlow;
  const bi = result?.basicInfo;

  const overallCfg = r ? (RATING_CONFIG[r.overallRating] || RATING_CONFIG['중립']) : null;

  return (
    <div style={{ minHeight: '100vh', background: '#F0F4F8', fontFamily: "'Pretendard', 'Apple SD Gothic Neo', system-ui, sans-serif", paddingBottom: 100 }}>

      {/* Header */}
      <div style={{ background: 'linear-gradient(145deg, #0F172A 0%, #1e1b4b 60%, #312E81 100%)', padding: '28px 20px 32px', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', top: -30, right: -30, width: 160, height: 160, borderRadius: '50%', background: 'rgba(99,102,241,0.2)', filter: 'blur(50px)' }} />
        <div style={{ position: 'absolute', bottom: -20, left: 0, width: 120, height: 120, borderRadius: '50%', background: 'rgba(139,92,246,0.15)', filter: 'blur(40px)' }} />
        <div style={{ position: 'relative' }}>
          <button onClick={() => router.back()} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 13, cursor: 'pointer', padding: '0 0 14px', display: 'flex', alignItems: 'center', gap: 4 }}>
            ← 뒤로
          </button>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 6 }}>
            <span style={{ fontSize: 24 }}>🔬</span>
            <div>
              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 2 }}>Deep Analysis</p>
              <h1 style={{ fontSize: 22, fontWeight: 800, color: 'white', letterSpacing: '-0.5px', margin: 0 }}>필살기 분석</h1>
            </div>
          </div>
          <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.4)', margin: 0 }}>기술적·수급·뉴스·AI 독자 분석 통합 리포트</p>
        </div>
      </div>

      <div style={{ maxWidth: 480, margin: '0 auto', padding: '16px 14px' }}>

        {/* Search Card */}
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          style={{ background: 'white', borderRadius: 22, border: '1px solid #e2e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '18px', marginBottom: 12, position: 'relative' }}>
          <p style={{ fontSize: 11, fontWeight: 700, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 10 }}>종목 선택</p>
          <div style={{ position: 'relative' }}>
            <input
              value={query}
              onChange={e => handleSearch(e.target.value)}
              placeholder="종목명 또는 종목코드 입력..."
              style={{ width: '100%', padding: '12px 16px', borderRadius: 14, border: '1.5px solid #e2e8f0', fontSize: 15, fontWeight: 600, outline: 'none', boxSizing: 'border-box', background: '#f8fafc', color: '#0f172a' }}
            />
            {searchResults.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, background: 'white', borderRadius: 14, border: '1px solid #e2e8f0', boxShadow: '0 8px 32px rgba(0,0,0,0.12)', zIndex: 10, marginTop: 4, overflow: 'hidden' }}>
                {searchResults.map(s => (
                  <button key={s.symbol} onClick={() => handleSelectStock(s)}
                    style={{ width: '100%', padding: '12px 16px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', borderBottom: '1px solid #f1f5f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>{s.name}</span>
                    <span style={{ fontSize: 11, color: '#94a3b8' }}>{s.symbol}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {selectedStock && !loading && (
            <motion.button initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
              onClick={handleAnalyze} disabled={loading}
              style={{ width: '100%', marginTop: 14, padding: '14px', borderRadius: 16, border: 'none', cursor: 'pointer',
                background: 'linear-gradient(135deg, #4F46E5, #7C3AED)', color: 'white',
                fontSize: 15, fontWeight: 800, letterSpacing: '-0.3px',
                boxShadow: '0 6px 20px rgba(79,70,229,0.35)', transition: 'opacity 0.2s' }}>
              🔬 {result ? '재분석 시작' : '딥 분석 시작'}
            </motion.button>
          )}
        </motion.div>

        {/* TOP 10 추천 종목 */}
        {!result && !loading && topStocks.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
            style={{ background: 'white', borderRadius: 22, border: '1px solid #e2e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', padding: '18px', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
              <span style={{ fontSize: 16 }}>🔥</span>
              <div>
                <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', margin: 0 }}>오늘 분석 추천 종목</p>
                <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>당일 상승률 상위 · 분석 가치 높은 종목</p>
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
              {topStocks.map((s, i) => (
                <button key={s.code} onClick={() => {
                  handleSelectStock({ name: s.name, symbol: s.code, exchange: '' });
                }}
                  style={{ width: '100%', padding: '10px 12px', textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', borderRadius: 12, display: 'flex', alignItems: 'center', gap: 10, transition: 'background 0.15s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8fafc'}
                  onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                  <span style={{ fontSize: 12, fontWeight: 800, color: '#cbd5e1', width: 18, textAlign: 'right', flexShrink: 0 }}>{i + 1}</span>
                  <span style={{ flex: 1, fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{s.name}</span>
                  <span style={{ fontSize: 11, color: '#94a3b8', marginRight: 4 }}>{s.code}</span>
                  <span style={{ fontSize: 12, fontWeight: 800, color: s.changeRate?.startsWith('-') ? '#2563EB' : '#DC2626', minWidth: 50, textAlign: 'right' }}>
                    {s.changeRate?.startsWith('-') ? s.changeRate : `+${s.changeRate}`}
                  </span>
                </button>
              ))}
            </div>
          </motion.div>
        )}

        {/* Loading */}
        <AnimatePresence>
          {loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              style={{ background: 'white', borderRadius: 22, border: '1px solid #e2e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              <LoadingSteps />
            </motion.div>
          )}
        </AnimatePresence>

        {/* Error */}
        {error && (
          <div style={{ background: '#fef2f2', border: '1.5px solid #fca5a5', borderRadius: 18, padding: '14px 18px', marginBottom: 12, fontSize: 13, color: '#dc2626', fontWeight: 600 }}>
            ⚠️ {error}
          </div>
        )}

        {/* Report */}
        {r && ind && !loading && (
          <>
            {/* ── 종목 헤더 카드 ── */}
            <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible"
              style={{ borderRadius: 22, marginBottom: 12, overflow: 'hidden', position: 'relative',
                background: `linear-gradient(145deg, ${overallCfg.color}22 0%, white 100%)`,
                border: `1.5px solid ${overallCfg.border}`,
                boxShadow: '0 8px 32px rgba(0,0,0,0.08)' }}>
              <div style={{ padding: '22px 20px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                  <div>
                    <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, letterSpacing: '0.06em', marginBottom: 4 }}>{result?.basicInfo?.stockCode || selectedStock?.symbol}</p>
                    <h2 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 6px', letterSpacing: '-0.5px' }}>
                      {bi?.stockName || selectedStock?.name}
                    </h2>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
                      <span style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', letterSpacing: '-1px' }}>
                        {Number(bi?.closePrice || ind.currentPrice).toLocaleString()}원
                      </span>
                      {bi?.fluctuationsRatio && (
                        <span style={{ fontSize: 13, fontWeight: 700, color: Number(bi.fluctuationsRatio) >= 0 ? '#DC2626' : '#2563EB' }}>
                          {Number(bi.fluctuationsRatio) >= 0 ? '▲' : '▼'} {Math.abs(Number(bi.fluctuationsRatio))}%
                        </span>
                      )}
                    </div>
                  </div>
                  <RatingBadge rating={r.overallRating} size="lg" />
                </div>

                {/* Confidence Score */}
                <div style={{ background: 'rgba(0,0,0,0.04)', borderRadius: 14, padding: '12px 14px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                    <span style={{ fontSize: 11, fontWeight: 700, color: '#64748b' }}>AI 확신도</span>
                    <span style={{ fontSize: 18, fontWeight: 800, color: overallCfg.color }}>{r.confidenceScore}%</span>
                  </div>
                  <ScoreBar value={r.confidenceScore} color={overallCfg.color} />
                </div>

                {/* 52주 범위 */}
                <div style={{ display: 'flex', gap: 8, marginTop: 12 }}>
                  {[
                    { label: '52주 최고', value: ind.high52?.toLocaleString() + '원', sub: `현재 ${ind.fromHigh52}%` },
                    { label: '52주 최저', value: ind.low52?.toLocaleString() + '원', sub: `현재 +${ind.fromLow52}%` },
                    { label: '베타', value: result.beta ?? 'N/A', sub: 'vs KOSPI' },
                  ].map(item => (
                    <div key={item.label} style={{ flex: 1, background: 'white', borderRadius: 12, padding: '10px 10px', border: '1px solid #f1f5f9', textAlign: 'center' }}>
                      <p style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', marginBottom: 4 }}>{item.label}</p>
                      <p style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>{item.value}</p>
                      <p style={{ fontSize: 10, color: '#94a3b8' }}>{item.sub}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* ── 기술적 분석 ── */}
            <SectionCard icon="📈" title="기술적 분석" custom={1}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                <SectionRating rating={r.technicalAnalysis?.rating} />
                <span style={{ fontSize: 11, color: '#94a3b8' }}>MA·RSI·MACD·BB·일목</span>
              </div>
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: '0 0 12px' }}>{r.technicalAnalysis?.summary}</p>

              {/* 지표 스냅샷 */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6, marginBottom: 12 }}>
                {[
                  { label: 'RSI', value: ind.rsi, note: ind.rsi < 30 ? '과매도' : ind.rsi > 70 ? '과매수' : '중립' },
                  { label: 'MACD', value: ind.macdHistogram > 0 ? `+${ind.macdHistogram}` : ind.macdHistogram, note: ind.macdHistogram > 0 ? '골든' : '데드' },
                  { label: 'BB위치', value: `${ind.bbPosition}%`, note: ind.bbPosition < 20 ? '하단' : ind.bbPosition > 80 ? '상단' : '중간' },
                  { label: 'Stoch RSI', value: ind.stochRsi, note: ind.stochRsi < 20 ? '과매도' : ind.stochRsi > 80 ? '과매수' : '중립' },
                  { label: 'ATR%', value: `${ind.atrPct}%`, note: '일일변동성' },
                  { label: 'MDD', value: `-${ind.mdd}%`, note: '1년최대낙폭' },
                ].map(item => (
                  <div key={item.label} style={{ background: '#f8fafc', borderRadius: 12, padding: '10px 8px', textAlign: 'center', border: '1px solid #f1f5f9' }}>
                    <p style={{ fontSize: 9, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', marginBottom: 3 }}>{item.label}</p>
                    <p style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>{item.value}</p>
                    <p style={{ fontSize: 9, color: '#94a3b8' }}>{item.note}</p>
                  </div>
                ))}
              </div>

              <div style={{ background: '#f8fafc', borderRadius: 14, padding: '12px 14px', marginBottom: 12, border: '1px solid #f1f5f9' }}>
                <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 6 }}>이동평균 배열</p>
                <p style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{ind.maAlignment}</p>
              </div>

              {ind.ichimoku && (
                <div style={{ background: '#f8fafc', borderRadius: 14, padding: '12px 14px', marginBottom: 12, border: '1px solid #f1f5f9' }}>
                  <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 6 }}>일목균형표</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginBottom: 4 }}>{ind.priceVsCloud}</p>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {[
                      { label: '전환선', value: ind.ichimoku.tenkan },
                      { label: '기준선', value: ind.ichimoku.kijun },
                      { label: '선행A', value: ind.ichimoku.spanA },
                      { label: '선행B', value: ind.ichimoku.spanB },
                    ].map(item => (
                      <div key={item.label} style={{ fontSize: 11, color: '#64748b' }}>
                        <span style={{ color: '#94a3b8' }}>{item.label} </span>
                        <span style={{ fontWeight: 700 }}>{item.value?.toLocaleString()}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* 피보나치 */}
              <div style={{ background: '#f8fafc', borderRadius: 14, padding: '12px 14px', border: '1px solid #f1f5f9' }}>
                <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, marginBottom: 8 }}>피보나치 되돌림 (52주 기준)</p>
                {ind.fibonacci?.levels.slice(1, 6).map(lv => (
                  <div key={lv.ratio} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>{lv.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 800, color: lv.price === ind.fibonacci.nearest.price ? '#6366f1' : '#374151' }}>
                      {lv.price?.toLocaleString()}원 {lv.price === ind.fibonacci.nearest.price ? '← 현재 근접' : ''}
                    </span>
                  </div>
                ))}
              </div>

              <KeySignals signals={r.technicalAnalysis?.keySignals} color="#6366f1" />
            </SectionCard>

            {/* ── 수급 분석 ── */}
            <SectionCard icon="💹" title="수급 분석 (최근 20거래일)" custom={2}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <SectionRating rating={r.supplyDemandAnalysis?.rating} />
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 14 }}>
                {[
                  { label: '외국인', total: inv.foreignTotal, trend: inv.foreignTrend, consec: inv.consecForeignBuy > 0 ? `연속 ${inv.consecForeignBuy}일 순매수` : inv.consecForeignSell > 0 ? `연속 ${inv.consecForeignSell}일 순매도` : '' },
                  { label: '기관', total: inv.institutionTotal, trend: inv.institutionTrend, consec: '' },
                  { label: '개인', total: inv.individualTotal, trend: inv.individualTotal > 0 ? '순매수' : '순매도', consec: '' },
                ].map(item => {
                  const isBuy = item.total >= 0;
                  const color = isBuy ? '#DC2626' : '#2563EB';
                  return (
                    <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: '#f8fafc', borderRadius: 14, border: '1px solid #f1f5f9' }}>
                      <div style={{ flex: 1 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{item.label}</span>
                          {item.consec && <span style={{ fontSize: 10, color, fontWeight: 700, background: `${color}10`, padding: '2px 8px', borderRadius: 10 }}>{item.consec}</span>}
                        </div>
                        <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>{item.trend}</p>
                      </div>
                      <span style={{ fontSize: 14, fontWeight: 800, color }}>{isBuy ? '+' : ''}{item.total?.toLocaleString()}주</span>
                    </div>
                  );
                })}
              </div>

              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: 0 }}>{r.supplyDemandAnalysis?.summary}</p>
              <KeySignals signals={r.supplyDemandAnalysis?.keySignals} color="#0891b2" />
            </SectionCard>

            {/* ── 뉴스 센티먼트 ── */}
            <SectionCard icon="📰" title="뉴스 센티먼트 (7일)" custom={3}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                <SectionRating rating={r.newsSentiment?.rating} />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ fontSize: 11, color: '#94a3b8' }}>뉴스 점수</span>
                  <span style={{ fontSize: 18, fontWeight: 800, color: '#0f172a' }}>{r.newsSentiment?.score}<span style={{ fontSize: 11, color: '#94a3b8' }}>/10</span></span>
                </div>
              </div>
              <ScoreBar value={r.newsSentiment?.score} max={10} color="#7c3aed" />
              <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.7, margin: '12px 0 12px' }}>{r.newsSentiment?.summary}</p>
              {result?.news?.slice(0, 5).map((n, i) => (
                <a key={i} href={n.link} target="_blank" rel="noopener noreferrer"
                  style={{ display: 'block', textDecoration: 'none', padding: '9px 0', borderTop: i > 0 ? '1px solid #f1f5f9' : 'none' }}>
                  <p style={{ fontSize: 12, color: '#374151', fontWeight: 600, lineHeight: 1.5, margin: '0 0 3px' }}>{n.title}</p>
                  <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>{n.date}</p>
                </a>
              ))}
            </SectionCard>

            {/* ── AI 독자 분석 ── */}
            <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible"
              style={{ marginBottom: 12, borderRadius: 22, overflow: 'hidden',
                background: 'linear-gradient(145deg, #0F172A 0%, #1e1b4b 60%, #312E81 100%)',
                boxShadow: '0 8px 32px rgba(15,23,42,0.2)' }}>
              <div style={{ position: 'relative' }}>
                <div style={{ position: 'absolute', top: -20, right: -20, width: 100, height: 100, borderRadius: '50%', background: 'rgba(99,102,241,0.3)', filter: 'blur(30px)' }} />
                <div style={{ padding: '20px', position: 'relative' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
                    <div style={{ width: 32, height: 32, borderRadius: 10, background: 'linear-gradient(135deg, #6366F1, #8B5CF6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, boxShadow: '0 4px 12px rgba(99,102,241,0.5)' }}>🔬</div>
                    <div>
                      <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', margin: 0 }}>AI Proprietary Analysis</p>
                      <p style={{ fontSize: 14, fontWeight: 800, color: 'white', margin: 0 }}>{r.proprietaryAnalysis?.title}</p>
                    </div>
                  </div>
                  <div style={{ borderLeft: '2px solid rgba(99,102,241,0.5)', paddingLeft: 14, marginBottom: 14 }}>
                    <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.85)', lineHeight: 1.8, margin: 0 }}>{r.proprietaryAnalysis?.summary}</p>
                  </div>
                  {r.proprietaryAnalysis?.keySignals?.map((s, i) => (
                    <div key={i} style={{ display: 'flex', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#818cf8', flexShrink: 0, marginTop: 5 }} />
                      <p style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, margin: 0 }}>{s}</p>
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>

            {/* ── 최종 판정 ── */}
            <motion.div custom={5} variants={fadeUp} initial="hidden" animate="visible"
              style={{ marginBottom: 12, background: 'white', borderRadius: 22, border: '1px solid #e2e8f0', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', overflow: 'hidden' }}>
              {/* 판정 헤더 */}
              <div style={{ background: `linear-gradient(135deg, ${overallCfg.color}18, ${overallCfg.color}08)`, padding: '20px 20px 16px', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <span style={{ fontSize: 18 }}>🎯</span>
                    <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 }}>최종 통합 판정</h3>
                  </div>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 22, fontWeight: 900, color: overallCfg.color }}>{r.finalVerdict?.direction}</span>
                    <RatingBadge rating={r.overallRating} />
                  </div>
                </div>
                <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.75, margin: 0 }}>{r.finalVerdict?.reasoning}</p>
              </div>

              <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {/* 1주 / 1개월 시나리오 */}
                {[
                  { label: '1주일 예상', data: r.finalVerdict?.week1, icon: '📅' },
                  { label: '1개월 예상', data: r.finalVerdict?.month1, icon: '📆' },
                ].map(({ label, data, icon }) => data && (
                  <div key={label} style={{ background: '#f8fafc', borderRadius: 16, padding: '14px 16px', border: '1px solid #f1f5f9' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <span style={{ fontSize: 14 }}>{icon}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{label}</span>
                      </div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <span style={{ fontSize: 11, color: '#DC2626', fontWeight: 700, background: 'rgba(220,38,38,0.08)', padding: '2px 8px', borderRadius: 8 }}>↑ {data.targetHigh?.toLocaleString()}원</span>
                        <span style={{ fontSize: 11, color: '#2563EB', fontWeight: 700, background: 'rgba(37,99,235,0.08)', padding: '2px 8px', borderRadius: 8 }}>↓ {data.targetLow?.toLocaleString()}원</span>
                      </div>
                    </div>
                    <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, margin: 0 }}>{data.scenario}</p>
                  </div>
                ))}

                {/* 목표가 / 손절가 */}
                <div style={{ display: 'flex', gap: 10 }}>
                  <div style={{ flex: 1, background: 'rgba(220,38,38,0.06)', borderRadius: 16, padding: '16px', border: '1.5px solid rgba(220,38,38,0.15)', textAlign: 'center' }}>
                    <p style={{ fontSize: 10, color: '#DC2626', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>목표가</p>
                    <p style={{ fontSize: 22, fontWeight: 900, color: '#DC2626', letterSpacing: '-0.5px', margin: '0 0 4px' }}>{r.finalVerdict?.targetPrice?.toLocaleString()}원</p>
                    {ind.currentPrice && r.finalVerdict?.targetPrice && (
                      <p style={{ fontSize: 11, color: '#DC2626', fontWeight: 600, margin: 0 }}>
                        +{Math.round(((r.finalVerdict.targetPrice - ind.currentPrice) / ind.currentPrice) * 1000) / 10}%
                      </p>
                    )}
                  </div>
                  <div style={{ flex: 1, background: 'rgba(37,99,235,0.06)', borderRadius: 16, padding: '16px', border: '1.5px solid rgba(37,99,235,0.15)', textAlign: 'center' }}>
                    <p style={{ fontSize: 10, color: '#2563EB', fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>손절가</p>
                    <p style={{ fontSize: 22, fontWeight: 900, color: '#2563EB', letterSpacing: '-0.5px', margin: '0 0 4px' }}>{r.finalVerdict?.stopLoss?.toLocaleString()}원</p>
                    {ind.currentPrice && r.finalVerdict?.stopLoss && (
                      <p style={{ fontSize: 11, color: '#2563EB', fontWeight: 600, margin: 0 }}>
                        {Math.round(((r.finalVerdict.stopLoss - ind.currentPrice) / ind.currentPrice) * 1000) / 10}%
                      </p>
                    )}
                  </div>
                </div>

                {/* 리스크 지표 */}
                <div style={{ background: '#f8fafc', borderRadius: 16, padding: '14px 16px', border: '1px solid #f1f5f9' }}>
                  <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>리스크 지표</p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                    {[
                      { label: '리스크 수준', value: r.finalVerdict?.riskLevel },
                      { label: '1년 MDD', value: `-${ind.mdd}%` },
                      { label: '일일 변동성', value: `${ind.atrPct}%` },
                      { label: '베타(KOSPI)', value: result.beta ?? 'N/A' },
                    ].map(item => (
                      <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: 11, color: '#94a3b8' }}>{item.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* 피벗 지지/저항 */}
                <div style={{ background: '#f8fafc', borderRadius: 16, padding: '14px 16px', border: '1px solid #f1f5f9' }}>
                  <p style={{ fontSize: 10, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>피벗 지지 / 저항선</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                    {[
                      { label: 'R2 (저항2)', value: ind.pivot.r2, color: '#DC2626' },
                      { label: 'R1 (저항1)', value: ind.pivot.r1, color: '#EF4444' },
                      { label: 'Pivot', value: ind.pivot.pivot, color: '#6B7280' },
                      { label: 'S1 (지지1)', value: ind.pivot.s1, color: '#3B82F6' },
                      { label: 'S2 (지지2)', value: ind.pivot.s2, color: '#2563EB' },
                    ].map(item => (
                      <div key={item.label} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '4px 0', borderBottom: '1px solid #f1f5f9' }}>
                        <span style={{ fontSize: 11, color: item.color, fontWeight: 700 }}>{item.label}</span>
                        <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{item.value?.toLocaleString()}원</span>
                      </div>
                    ))}
                  </div>
                </div>

                <p style={{ fontSize: 10, color: '#cbd5e1', textAlign: 'center', margin: '4px 0 0', lineHeight: 1.6 }}>
                  본 분석은 AI 기반 기술적·통계적 분석으로 투자 권유가 아닙니다. 모든 투자 결정과 책임은 본인에게 있습니다.
                </p>
              </div>
            </motion.div>
          </>
        )}
      </div>
    </div>
  );
}
