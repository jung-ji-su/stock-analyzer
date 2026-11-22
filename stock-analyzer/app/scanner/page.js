'use client';

import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useAuth } from '@/lib/AuthContext';
import { loadWishlist, saveWishlist, hasWish, toggleWish } from '@/lib/wishlist';
import DbScreens from '@/components/DbScreens';
import { runAnalysis } from '@/lib/analysisEngine';
import { buyScore, scoreGrade, BUY_THRESHOLD } from '@/lib/engineScore';
import { useToast } from '@/components/Toast';
import { useRouter } from 'next/navigation';

// ╔══════════════════════════════════════════════════════════
// ║ 1. 점수: 홈 AI 분석·AI 트레이더와 같은 엔진 (lib/analysisEngine.js, 백테스트로 검증)
// ╚══════════════════════════════════════════════════════════
// 뉴스는 빼고 계산한다 (100종목 뉴스를 다 불러오면 너무 느림) — AI 트레이더와 같은 조건.
// 점수 = 50 + 종합점수×5 ± 1주 전망 10 (lib/engineScore.js), BUY_THRESHOLD(85) 이상이면 AI 트레이더 매수 구간.
function scanStock(bars, name) {
  const r = runAnalysis({ chartData: bars, newsData: [], stockName: name });
  const score = buyScore(r);
  const sb = r.scoreBreakdown, ex = r.extras;
  const signals = r.allSignals.filter((s) => s.type !== 'neutral').sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  const pick = (h) => ({ prediction: h.prediction, probs: h.probs, confidence: h.confidence });
  return {
    score, grade: scoreGrade(score), confidence: r.confidence,
    breakdown: { tech: sb.tech.score, quant: sb.quant.score, total: sb.total },
    weekly: pick(r.horizons.weekly), monthly: pick(r.horizons.monthly),
    reasons: signals.slice(0, 3).map((s) => `${s.label} — ${s.easy}`),
    signals,
    rsi: r.indicators.rsi, volumeRatio: r.indicators.volumeRatio,
    momentum: ex.momentum, ret5: ex.ret5, bbPos: ex.bbPos, sigmaD: ex.sigmaD,
  };
}

// 등급 → 필터 키
const GRADE_KEY = { '강력매수': 'strong_buy', '매수고려': 'buy', '관망': 'watch', '매도주의': 'caution', '강력주의': 'strong_caution' };
const STORE_KEY = 'scanner_v2'; // 점수 체계가 바뀌어서 예전 저장 결과(scanner_results)는 쓰지 않는다
const fmtScanAt = (iso) => (iso ? new Date(iso).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '');
const fmtBasDd = (d) => (d && d.length === 8 ? `${Number(d.slice(4, 6))}/${Number(d.slice(6))}` : '');

// ╔══════════════════════════════════════════════════════════
// ║ 6. 디자인 상수
// ╚══════════════════════════════════════════════════════════

const C = {
  bg:        '#F0F4F8',
  surface:   '#F1F5F9',
  card:      '#FFFFFF',
  cardHover: '#F8FAFC',
  border:    '#E2E8F0',
  borderHi:  '#D1D5DB',
  rise:      '#DC2626',
  riseDim:   'rgba(220,38,38,0.08)',
  fall:      '#2563EB',
  fallDim:   'rgba(37,99,235,0.08)',
  neutral:   '#64748B',
  neutralDim:'rgba(100,116,139,0.08)',
  gold:      '#D97706',
  accent:    '#4F46E5',
  accentDim: 'rgba(79,70,229,0.1)',
  green:     '#059669',
  t1:        '#111827',
  t2:        '#6B7280',
  t3:        '#9CA3AF',
};

// 등급별 스타일 맵
const GRADE_STYLE = {
  '강력매수': { color: C.rise,    dim: C.riseDim,    label: 'STRONG BUY',  icon: '🔥' },
  '매수고려': { color: '#FF8C42', dim: 'rgba(255,140,66,0.15)', label: 'BUY',   icon: '📈' },
  '관망':     { color: C.neutral, dim: C.neutralDim, label: 'NEUTRAL',     icon: '➡️' },
  '매도주의': { color: C.fall,    dim: C.fallDim,    label: 'CAUTION',     icon: '📉' },
  '강력주의': { color: '#2563EB', dim: 'rgba(37,99,235,0.2)', label: 'STRONG CAUTION', icon: '❄️' },
};

const SCAN_TYPES = [
  { key: 'volume', label: '거래량', icon: '📊' },
  { key: 'amount', label: '거래대금', icon: '💰' },
  { key: 'marcap', label: '시가총액', icon: '🏢' },
  { key: 'rise', label: '상승률', icon: '🚀' },
  { key: 'fall', label: '하락률', icon: '📉' },
];

const SCAN_COUNT = 100;
const BATCH_SIZE = 10;

// ╔══════════════════════════════════════════════════════════
// ║ 7. UI 서브 컴포넌트
// ╚══════════════════════════════════════════════════════════

/* ── Score Arc Gauge ── */
function ScoreArc({ score, size = 80, delay = 0 }) {
  const r = 30;
  const cx = size / 2;
  const cy = size / 2 - 2;
  const circumference = Math.PI * r;
  const dash = Math.max(0, Math.min(1, score / 100)) * circumference;
  const color = GRADE_STYLE[scoreGrade(score)].color;

  return (
    <svg width={size} height={size * 0.62} viewBox={`0 0 ${size} ${size * 0.62}`} style={{ overflow: 'visible' }}>
      {/* Track */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={C.border} strokeWidth="7" strokeLinecap="round"
      />
      {/* Glow */}
      <path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
        strokeDasharray={`${dash} ${circumference}`}
        style={{ filter: `drop-shadow(0 0 6px ${color}80)`, opacity: 0.3 }}
      />
      {/* Main fill */}
      <motion.path
        d={`M ${cx - r} ${cy} A ${r} ${r} 0 0 1 ${cx + r} ${cy}`}
        fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
        initial={{ strokeDasharray: `0 ${circumference}` }}
        animate={{ strokeDasharray: `${dash} ${circumference}` }}
        transition={{ duration: 1.2, ease: [0.34, 1.56, 0.64, 1], delay }}
      />
      {/* Score number */}
      <text x={cx} y={cy + 2} textAnchor="middle" fill={color}
        fontSize="14" fontWeight="800" fontFamily="'DM Mono', monospace" letterSpacing="-0.5">
        {score}
      </text>
      <text x={cx} y={cy + 14} textAnchor="middle" fill={C.t3}
        fontSize="8" fontWeight="600" fontFamily="system-ui" letterSpacing="1">
        SCORE
      </text>
    </svg>
  );
}

/* ── 기간 전망 (상승·횡보·하락 확률) ── */
function OutlookBar({ label, h }) {
  if (!h) return null;
  const color = h.prediction === '상승' ? C.rise : h.prediction === '하락' ? C.fall : C.neutral;
  const parts = [['up', C.rise], ['side', '#CBD5E1'], ['down', C.fall]];
  return (
    <div style={{ marginBottom: 8 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
        <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>{label}</span>
        <span style={{ fontSize: 11, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
          {h.prediction} {h.confidence}%
        </span>
      </div>
      <div style={{ display: 'flex', height: 5, borderRadius: 99, overflow: 'hidden', background: C.surface }}>
        {parts.map(([k, c]) => <div key={k} style={{ width: `${h.probs[k]}%`, background: c }} />)}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 9, color: C.t3, marginTop: 3, fontVariantNumeric: 'tabular-nums' }}>
        <span>상승 {h.probs.up}%</span><span>횡보 {h.probs.side}%</span><span>하락 {h.probs.down}%</span>
      </div>
    </div>
  );
}

/* ── 레이어 점수 (엔진 −10~+10) ── */
function BreakdownGrid({ breakdown }) {
  const CATS = [
    { key: 'tech',  label: '기술지표' },
    { key: 'quant', label: '퀀트팩터' },
    { key: 'total', label: '종합' },
  ];
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 6 }}>
      {CATS.map(({ key, label }) => {
        const val = breakdown?.[key] || 0;
        const isPos = val > 0;
        const isNeg = val < 0;
        const color = isPos ? C.rise : isNeg ? C.fall : C.neutral;
        const bg = isPos ? C.riseDim : isNeg ? C.fallDim : '#F3F4F6';
        return (
          <div key={key} style={{ background: bg, borderRadius: 8, padding: '6px 2px', textAlign: 'center', border: `1px solid ${isPos ? 'rgba(255,59,92,0.2)' : isNeg ? 'rgba(59,130,246,0.2)' : 'transparent'}` }}>
            <div style={{ fontSize: 9, color: C.t3, marginBottom: 2, fontWeight: 600 }}>{label}</div>
            <div style={{ fontSize: 12, fontWeight: 800, color, fontVariantNumeric: 'tabular-nums' }}>
              {val > 0 ? '+' : ''}{val.toFixed(1)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/* ── Metric Tag ── */
function MetricTag({ label, good, tooltip }) {
  const [show, setShow] = useState(false);
  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <motion.button
        onClick={() => setShow(s => !s)}
        whileTap={{ scale: 0.94 }}
        style={{
          fontSize: 10, fontWeight: 700,
          padding: '3px 9px', borderRadius: 99,
          background: good ? C.riseDim : C.fallDim,
          color: good ? C.rise : C.fall,
          border: `1px solid ${good ? 'rgba(220,38,38,0.25)' : 'rgba(37,99,235,0.25)'}`,
          cursor: 'pointer',
          fontVariantNumeric: 'tabular-nums',
          letterSpacing: '0.2px',
        }}
      >
        {label}
      </motion.button>
      <AnimatePresence>
        {show && tooltip && (
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.95 }}
            style={{
              position: 'absolute', bottom: '110%', left: '50%', transform: 'translateX(-50%)',
              background: C.card, border: `1px solid ${C.borderHi}`,
              borderRadius: 8, padding: '6px 10px', fontSize: 10, color: C.t2,
              whiteSpace: 'nowrap', zIndex: 50,
              boxShadow: '0 8px 24px rgba(0,0,0,0.1)',
            }}
          >
            {tooltip}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ── Scanning Skeleton ── */
function ScanSkeleton() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {[0, 1, 2].map(i => (
        <motion.div
          key={i}
          style={{ background: C.card, borderRadius: 20, padding: 20, border: `1px solid ${C.border}` }}
          animate={{ opacity: [0.4, 0.7, 0.4] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.2 }}
        >
          <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 16 }}>
            <div style={{ width: 44, height: 44, borderRadius: 12, background: C.surface }} />
            <div style={{ flex: 1 }}>
              <div style={{ height: 14, width: '60%', background: C.surface, borderRadius: 6, marginBottom: 8 }} />
              <div style={{ height: 10, width: '40%', background: '#EFF1F5', borderRadius: 6 }} />
            </div>
          </div>
          <div style={{ height: 8, background: C.surface, borderRadius: 99 }} />
        </motion.div>
      ))}
    </div>
  );
}

/* ── Progress Ring ── */
function ProgressRing({ progress }) {
  const r = 24;
  const circumference = 2 * Math.PI * r;
  const dash = (progress / 100) * circumference;
  return (
    <svg width={60} height={60} viewBox="0 0 60 60" style={{ transform: 'rotate(-90deg)' }}>
      <circle cx={30} cy={30} r={r} fill="none" stroke={C.border} strokeWidth={5} />
      <motion.circle
        cx={30} cy={30} r={r} fill="none"
        stroke={C.accent} strokeWidth={5} strokeLinecap="round"
        style={{ filter: `drop-shadow(0 0 8px ${C.accent}80)` }}
        animate={{ strokeDasharray: `${dash} ${circumference}` }}
        transition={{ duration: 0.3, ease: 'easeOut' }}
      />
      <text
        x={30} y={30}
        textAnchor="middle" dominantBaseline="middle"
        fill={C.t1} fontSize={11} fontWeight={800}
        style={{ transform: 'rotate(90deg)', transformOrigin: '30px 30px' }}
        fontFamily="'DM Mono', monospace"
      >
        {progress}%
      </text>
    </svg>
  );
}

// ╔══════════════════════════════════════════════════════════
// ║ 8. 메인 컴포넌트
// ╚══════════════════════════════════════════════════════════

const SORT_OPTIONS = [
  { value: 'score',      label: '매수점수 순' },
  { value: 'confidence', label: '신뢰도 순' },
  { value: 'rsi',        label: 'RSI 낮은 순' },
  { value: 'volume',     label: '거래량 순' },
  { value: 'change',     label: '등락률 순' },
];

const GRADE_FILTERS = [
  { key: 'all',           label: '전체',    emoji: '◉' },
  { key: 'strong_buy',    label: '강력매수', emoji: '🔥' },
  { key: 'buy',           label: '매수고려', emoji: '📈' },
  { key: 'watch',         label: '관망',    emoji: '➡️' },
  { key: 'caution',       label: '매도주의', emoji: '📉' },
  { key: 'strong_caution',label: '강력주의', emoji: '❄️' },
];

export default function ScannerPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const router = useRouter();

  const [scanning,          setScanning]          = useState(false);
  const [results,           setResults]           = useState([]);
  const [filter,            setFilter]            = useState('all');
  const [scanType,          setScanType]          = useState('volume');
  const [progress,          setProgress]          = useState(0);
  const [scannedAt,         setScannedAt]         = useState(null);
  const [listDate,          setListDate]          = useState('');
  const [expandedId,        setExpandedId]        = useState(null);
  const [sortBy,            setSortBy]            = useState('score');
  const [showFavoritesOnly, setShowFavoritesOnly] = useState(false);
  const [showSortMenu,      setShowSortMenu]      = useState(false);
  const [mode,              setMode]              = useState('quant');
  const [favorites,         setFavorites]         = useState([]); // 계정 관심종목 (홈 화면과 같은 목록)

  useEffect(() => {
    if (!user) return;
    (async () => {
      let list = await loadWishlist(user.uid);
      // 예전 스캐너 ⭐ 는 이 브라우저에만 저장됐다 → 한 번 계정 관심종목으로 옮기고 지운다
      try {
        const old = JSON.parse(localStorage.getItem('favorites') || '[]');
        const add = (Array.isArray(old) ? old : []).filter((f) => f?.code && !hasWish(list, f.code));
        if (add.length) list = await saveWishlist(user.uid, [...list, ...add.map((f) => ({ symbol: f.code, name: f.name || f.code, registeredPrice: 0, registeredAt: new Date().toISOString() }))]);
        localStorage.removeItem('favorites');
      } catch { /* 옮기지 못하면 다음에 다시 시도 */ }
      setFavorites(list);
    })().catch(() => {});
  }, [user]);
  const isFavorite = (code) => hasWish(favorites, code);
  const toggleFavorite = async ({ code, name }) => {
    const was = isFavorite(code);
    try {
      setFavorites(await toggleWish(user.uid, favorites, { symbol: code, name }));
      addToast(was ? '관심종목 해제' : '⭐ 관심종목 추가', 'success');
    } catch { addToast('관심종목을 저장하지 못했어요', 'error'); }
  };

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    try {
      ['scanner_results', 'scanner_scannedAt', 'scanner_type'].forEach((k) => localStorage.removeItem(k));
      const saved = JSON.parse(localStorage.getItem(STORE_KEY) || 'null');
      if (saved?.results?.length) {
        setResults(saved.results.map((r) => ({ ...r, grade: scoreGrade(r.score) }))); // 등급 기준이 바뀌어도 저장된 결과에 맞게
        setScannedAt(saved.scannedAt);
        setListDate(saved.listDate || '');
        if (saved.type) setScanType(saved.type);
      }
    } catch { /* 저장된 결과가 없거나 깨졌으면 무시 */ }
  }, [user, router]);

  const startScan = async () => {
    setScanning(true);
    setResults([]);
    setProgress(0);
    setExpandedId(null);

    try {
      const topRes  = await fetch(`/api/top?type=${scanType}`);
      const topData = await topRes.json();
      if (!topRes.ok) throw new Error(topData.error || `목록 조회 실패 (${topRes.status})`);
      const stocks  = (topData.stocks || []).slice(0, SCAN_COUNT);
      setListDate(topData.date || '');

      const scanResults = [];
      for (let i = 0; i < stocks.length; i += BATCH_SIZE) {
        const batch = stocks.slice(i, i + BATCH_SIZE);
        const batchResults = await Promise.all(
          batch.map(async (stock) => {
            try {
              const chartRes  = await fetch(`/api/stock?symbol=${stock.code}&timeframe=daily`);
              const chartData = await chartRes.json();
              if (!chartData.chartData || chartData.chartData.length < 30) return null;
              return {
                code: stock.code, name: stock.name,
                price: chartData.currentPrice || 0,
                change: chartData.change || 0,
                changePercent: chartData.changePercent || 0,
                ...scanStock(chartData.chartData, stock.name),
              };
            } catch (e) { console.error(`${stock.name} 스캔 실패:`, e.message); return null; }
          })
        );
        scanResults.push(...batchResults.filter(r => r !== null));
        setResults([...scanResults].sort((a, b) => b.score - a.score));
        setProgress(Math.min(100, Math.round(((i + BATCH_SIZE) / stocks.length) * 100)));
        if (i + BATCH_SIZE < stocks.length) await new Promise(r => setTimeout(r, 250));
      }

      scanResults.sort((a, b) => b.score - a.score);
      setResults(scanResults);

      if (!scanResults.length) { addToast('분석된 종목이 없어요. 잠시 후 다시 시도해 주세요', 'error'); return; }
      const now = new Date().toISOString();
      setScannedAt(now);
      try {
        localStorage.setItem(STORE_KEY, JSON.stringify({ results: scanResults, scannedAt: now, type: scanType, listDate: topData.date || '' }));
      } catch { /* 저장 공간이 부족하면 이번 결과만 화면에 둔다 */ }
      addToast(`${scanResults.length}개 종목 스캔 완료!`, 'success');
    } catch (e) {
      console.error(e);
      addToast(`스캔 중 오류가 발생했습니다 (${e.message})`, 'error');
    } finally {
      setScanning(false);
    }
  };

  const getFilteredResults = () => {
    // 결과 상태 배열을 직접 정렬하지 않도록 복사본을 만든다
    let filtered = filter === 'all' ? [...results] : results.filter(r => GRADE_KEY[r.grade] === filter);
    if (showFavoritesOnly) filtered = filtered.filter(r => isFavorite(r.code));
    filtered.sort((a, b) => {
      if (sortBy === 'score')      return b.score - a.score;
      if (sortBy === 'confidence') return (b.confidence || 0) - (a.confidence || 0);
      if (sortBy === 'rsi')        return (a.rsi ?? 50) - (b.rsi ?? 50);
      if (sortBy === 'volume')     return (b.volumeRatio || 0) - (a.volumeRatio || 0);
      if (sortBy === 'change')     return Math.abs(b.changePercent) - Math.abs(a.changePercent);
      return 0;
    });
    return filtered;
  };

  const filtered    = getFilteredResults();
  const gradeCounts = Object.fromEntries(Object.values(GRADE_KEY).map((k) => [k, results.filter((r) => GRADE_KEY[r.grade] === k).length]));
  const currentSortLabel = SORT_OPTIONS.find(o => o.value === sortBy)?.label || '정렬';

  return (
    <div style={{ background: C.bg, minHeight: '100vh', paddingBottom: 100 }}>
      <style>{`
        * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
        ::-webkit-scrollbar { display: none; }
        body { background: ${C.bg}; }
      `}</style>

      <div className="scanner-page" style={{ maxWidth: 480, margin: '0 auto', padding: '0 14px' }}>

        {/* ══ Header ══ */}
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', padding: '20px 0 12px' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: C.t1, margin: '0 0 2px', letterSpacing: '-0.4px' }}>🔍 퀀트 스캐너</h1>
            <p style={{ fontSize: 12, color: C.t3, margin: 0 }}>AI 분석 엔진으로 상위 {SCAN_COUNT}종목을 한 번에 점검</p>
          </div>
          {scannedAt && mode === 'quant' && <span style={{ fontSize: 11, color: C.t3 }}>마지막 스캔 {fmtScanAt(scannedAt)}</span>}
        </div>

        {/* ══ 모드: 지표 스캔(브라우저에서 계산) / 수급·신고가(VM 수집기 DB) ══ */}
        <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: 12, padding: 3, marginBottom: 12 }}>
          {[['quant', '📈 지표 스캔'], ['db', '🏦 수급·신고가']].map(([k, label]) => (
            <button key={k} onClick={() => setMode(k)}
              style={{ flex: 1, padding: '8px 0', borderRadius: 10, border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 800,
                background: mode === k ? 'white' : 'transparent', color: mode === k ? C.t1 : C.t3, boxShadow: mode === k ? '0 1px 4px rgba(0,0,0,0.08)' : 'none' }}>{label}</button>
          ))}
        </div>

        {mode === 'db' && <DbScreens />}
        {mode === 'quant' && <>

        {/* ══ Scan Config ══ */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          style={{
            background: C.card,
            borderRadius: 20,
            border: `1px solid ${C.border}`,
            padding: 16,
            marginBottom: 12,
            boxShadow: '0 2px 12px rgba(15,23,42,0.06)',
          }}
        >
          <div style={{ fontSize: 13, color: C.t1, fontWeight: 800, marginBottom: 10 }}>
            무엇을 기준으로 고를까요?
          </div>

          {/* Scan Type Pills */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 14, overflowX: 'auto' }}>
            {SCAN_TYPES.map(t => {
              const active = scanType === t.key;
              return (
                <motion.button
                  key={t.key}
                  onClick={() => !scanning && setScanType(t.key)}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    flexShrink: 0,
                    padding: '7px 13px',
                    borderRadius: 999,
                    border: 'none',
                    background: active ? '#0f172a' : '#f1f5f9',
                    color: active ? '#fff' : '#64748b',
                    fontSize: 12, fontWeight: 700, cursor: 'pointer',
                    transition: 'all 0.2s',
                    whiteSpace: 'nowrap',
                    display: 'flex', alignItems: 'center', gap: 5,
                  }}
                >
                  <span>{t.label}</span>
                </motion.button>
              );
            })}
          </div>

          {/* Scan Button */}
          <motion.button
            onClick={startScan}
            disabled={scanning}
            whileTap={{ scale: scanning ? 1 : 0.97 }}
            style={{
              width: '100%', padding: '16px',
              borderRadius: 14, border: 'none',
              background: scanning ? C.surface : '#6366f1',
              color: scanning ? C.t2 : '#fff',
              fontSize: 15, fontWeight: 800,
              cursor: scanning ? 'not-allowed' : 'pointer',
              letterSpacing: '-0.3px',
              transition: 'all 0.2s',
            }}
          >
            {scanning ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <ProgressRing progress={progress} />
                <div style={{ textAlign: 'left' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>분석 중...</div>
                  <div style={{ fontSize: 11, color: C.t3, fontVariantNumeric: 'tabular-nums' }}>
                    {results.length}개 완료
                  </div>
                </div>
              </div>
            ) : (
              <span>{results.length > 0 ? '🔄 재스캔' : '🚀 퀀트 스캔 시작'}</span>
            )}
          </motion.button>

          {/* Progress Bar */}
          {scanning && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              style={{ marginTop: 14 }}
            >
              <div style={{ height: 2, background: C.surface, borderRadius: 99, overflow: 'hidden' }}>
                <motion.div
                  style={{ height: '100%', borderRadius: 99, background: `linear-gradient(90deg, ${C.accent}, #8B5CF6)` }}
                  animate={{ width: `${progress}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </motion.div>
          )}
        </motion.div>

        {/* ══ Results ══ */}
        <AnimatePresence>
          {results.length > 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
            >
              {/* Summary Cards */}
              <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: 0.1 }}
                style={{
                  background: C.card,
                  borderRadius: 20,
                  border: `1px solid ${C.border}`,
                  padding: '16px 14px',
                  marginBottom: 12,
                  boxShadow: '0 2px 12px rgba(15,23,42,0.06)',
                }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <span style={{ fontSize: 12, fontWeight: 700, color: C.t1 }}>
                    스캔 결과 <span style={{ color: C.accent, fontVariantNumeric: 'tabular-nums' }}>{results.length}</span>종목
                  </span>
                  <span style={{ fontSize: 10, color: C.t3, fontVariantNumeric: 'tabular-nums' }}>{fmtScanAt(scannedAt)}</span>
                </div>
                {listDate && (
                  <div style={{ fontSize: 10, color: C.t3, margin: '-6px 0 10px' }}>
                    종목 목록은 {fmtBasDd(listDate)} 장 마감 기준(KRX), 점수는 오늘 시세 기준 · {BUY_THRESHOLD}점 이상 = AI 트레이더 매수 구간
                  </div>
                )}
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5,1fr)', gap: 6 }}>
                  {[
                    { key: 'strong_buy',    emoji: '🔥', label: '강매수', color: C.rise },
                    { key: 'buy',           emoji: '📈', label: '매수',   color: '#FF8C42' },
                    { key: 'watch',         emoji: '➡️', label: '관망',   color: C.neutral },
                    { key: 'caution',       emoji: '📉', label: '주의',   color: C.fall },
                    { key: 'strong_caution',emoji: '❄️', label: '강주의', color: '#2563EB' },
                  ].map(({ key, emoji, label, color }) => (
                    <motion.button
                      key={key}
                      onClick={() => setFilter(filter === key ? 'all' : key)}
                      whileTap={{ scale: 0.93 }}
                      style={{
                        background: filter === key ? `${color}15` : '#F9FAFB',
                        borderRadius: 12, padding: '10px 4px', textAlign: 'center',
                        border: `1px solid ${filter === key ? `${color}40` : C.border}`,
                        cursor: 'pointer',
                        transition: 'all 0.2s',
                      }}
                    >
                      <div style={{ fontSize: 16, lineHeight: 1 }}>{emoji}</div>
                      <motion.div
                        key={gradeCounts[key]}
                        initial={{ scale: 1.3, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        style={{ fontSize: 18, fontWeight: 900, color, marginTop: 4, fontVariantNumeric: 'tabular-nums', lineHeight: 1 }}
                      >
                        {gradeCounts[key]}
                      </motion.div>
                      <div style={{ fontSize: 9, color: C.t3, marginTop: 3, fontWeight: 600 }}>{label}</div>
                    </motion.button>
                  ))}
                </div>
              </motion.div>

              {/* Filter + Sort Row */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 14, alignItems: 'center' }}>
                {/* Sort button */}
                <div style={{ position: 'relative', flexShrink: 0 }}>
                  <motion.button
                    onClick={() => setShowSortMenu(s => !s)}
                    whileTap={{ scale: 0.95 }}
                    style={{
                      padding: '8px 12px', borderRadius: 12,
                      background: C.card, border: `1px solid ${C.borderHi}`,
                      color: C.t1, fontSize: 11, fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', gap: 5,
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <span style={{ fontSize: 14 }}>⇅</span>
                    <span style={{ maxWidth: 72, overflow: 'hidden', textOverflow: 'ellipsis' }}>{currentSortLabel}</span>
                  </motion.button>
                  <AnimatePresence>
                    {showSortMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: -6, scale: 0.96 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: -6, scale: 0.96 }}
                        style={{
                          position: 'absolute', top: '110%', left: 0, zIndex: 50,
                          background: C.card, border: `1px solid ${C.borderHi}`,
                          borderRadius: 14, padding: 6, minWidth: 160,
                          boxShadow: '0 16px 48px rgba(0,0,0,0.1)',
                        }}
                      >
                        {SORT_OPTIONS.map(opt => (
                          <button
                            key={opt.value}
                            onClick={() => { setSortBy(opt.value); setShowSortMenu(false); }}
                            style={{
                              width: '100%', textAlign: 'left',
                              padding: '9px 12px', borderRadius: 10, border: 'none',
                              background: sortBy === opt.value ? C.accentDim : 'transparent',
                              color: sortBy === opt.value ? C.accent : C.t2,
                              fontSize: 12, fontWeight: 600, cursor: 'pointer',
                            }}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>

                {/* Favorites toggle */}
                <motion.button
                  onClick={() => setShowFavoritesOnly(s => !s)}
                  whileTap={{ scale: 0.95 }}
                  style={{
                    flexShrink: 0,
                    padding: '8px 12px', borderRadius: 12,
                    background: showFavoritesOnly ? 'rgba(245,158,11,0.15)' : C.card,
                    border: `1px solid ${showFavoritesOnly ? 'rgba(245,158,11,0.4)' : C.borderHi}`,
                    color: showFavoritesOnly ? C.gold : C.t2,
                    fontSize: 11, fontWeight: 700, cursor: 'pointer',
                    display: 'flex', alignItems: 'center', gap: 4,
                  }}
                >
                  ⭐ {favorites.length}
                </motion.button>

                {/* Filter pills (scrollable) */}
                <div style={{ display: 'flex', gap: 6, overflowX: 'auto', flex: 1 }}>
                  {GRADE_FILTERS.map(f => {
                    const count = f.key === 'all' ? results.length : gradeCounts[f.key];
                    const active = filter === f.key;
                    return (
                      <motion.button
                        key={f.key}
                        onClick={() => setFilter(f.key)}
                        whileTap={{ scale: 0.93 }}
                        style={{
                          flexShrink: 0,
                          padding: '7px 11px', borderRadius: 10, border: 'none',
                          background: active ? C.accent : C.surface,
                          color: active ? '#fff' : C.t2,
                          fontSize: 11, fontWeight: 700, cursor: 'pointer',
                          display: 'flex', alignItems: 'center', gap: 4,
                          boxShadow: active ? `0 4px 14px ${C.accent}50` : 'none',
                          transition: 'all 0.2s',
                        }}
                      >
                        <span style={{ fontSize: 12 }}>{f.emoji}</span>
                        <span style={{
                          background: active ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.06)',
                          borderRadius: 6, padding: '0 4px', fontSize: 10,
                          fontVariantNumeric: 'tabular-nums',
                        }}>{count}</span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>

              {/* Stock Cards */}
              {scanning && results.length < 5 ? (
                <ScanSkeleton />
              ) : filtered.length === 0 ? (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  style={{ textAlign: 'center', padding: '60px 0' }}
                >
                  <div style={{ fontSize: 48, marginBottom: 12 }}>🔍</div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: C.t2, marginBottom: 6 }}>
                    {showFavoritesOnly ? '관심 종목이 없어요' : '해당 조건의 종목 없음'}
                  </div>
                  <div style={{ fontSize: 12, color: C.t3 }}>필터를 변경해보세요</div>
                </motion.div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                  {filtered.map((stock, idx) => (
                    <StockCard
                      key={stock.code}
                      stock={stock}
                      idx={idx}
                      expanded={expandedId === stock.code}
                      onToggle={() => setExpandedId(expandedId === stock.code ? null : stock.code)}
                      isFav={isFavorite(stock.code)}
                      onFav={() => toggleFavorite({ code: stock.code, name: stock.name })}
                      onChart={() => router.push(`/?stock=${stock.code}&name=${encodeURIComponent(stock.name)}`)}
                      onFinancial={() => router.push(`/financial?query=${encodeURIComponent(stock.name)}`)}
                    />
                  ))}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        {/* ══ Empty State ══ */}
        {!scanning && results.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.2 }}
          >
            <div style={{ textAlign: 'center', padding: '40px 0 32px' }}>
              <div style={{
                width: 80, height: 80,
                background: 'linear-gradient(135deg, rgba(99,102,241,0.2) 0%, rgba(79,70,229,0.1) 100%)',
                borderRadius: 24, display: 'flex', alignItems: 'center', justifyContent: 'center',
                margin: '0 auto 20px', fontSize: 36,
                border: '1px solid rgba(99,102,241,0.2)',
              }}>🔍</div>
              <div style={{ fontFamily: 'Syne, sans-serif', fontSize: 20, fontWeight: 800, color: C.t1, marginBottom: 8 }}>
                스캔 준비 완료
              </div>
              <div style={{ fontSize: 13, color: C.t3, lineHeight: 1.6, marginBottom: 32 }}>
                홈 AI 분석·AI 트레이더와 같은 엔진으로<br />최대 100개 종목을 점수화해요
              </div>
            </div>

            {/* Indicator Info Cards */}
            <div style={{
              background: C.card, borderRadius: 20,
              border: `1px solid ${C.border}`, overflow: 'hidden',
            }}>
              <div style={{ padding: '16px 18px 10px', borderBottom: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 12, fontWeight: 800, color: C.t1, letterSpacing: '-0.2px' }}>
                  📐 분석 지표 구성
                </div>
              </div>
              {[
                { icon: '📈', label: '기술지표', weight: '35%', desc: 'RSI · MACD · 이평 배열 · 볼린저 · 거래량(장중 환산) · 매물대', color: '#818CF8' },
                { icon: '🚀', label: '퀀트팩터', weight: '40%', desc: '5일 과열도 · 20일 VWAP · 1·3개월 모멘텀 · 52주 위치', color: '#34D399' },
                { icon: '📰', label: '뉴스', weight: '25%', desc: '스캔에서는 빼요 (속도 때문, AI 트레이더와 같은 조건)', color: '#94A3B8' },
                { icon: '🎯', label: '매수점수', weight: '0~100', desc: `50 + 종합점수×5 ± 1주 전망 10. ${BUY_THRESHOLD}점 이상이면 AI 트레이더가 사요 (백테스트로 정한 기준)`, color: '#F472B6' },
              ].map(({ icon, label, weight, desc, color }, i) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 18px',
                    borderBottom: i < 3 ? `1px solid ${C.border}` : 'none',
                  }}
                >
                  <div style={{
                    width: 38, height: 38, borderRadius: 11, flexShrink: 0,
                    background: `${color}18`, display: 'flex', alignItems: 'center',
                    justifyContent: 'center', fontSize: 18,
                  }}>{icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 3 }}>
                      <span style={{ fontSize: 13, fontWeight: 700, color: C.t1 }}>{label}</span>
                      <span style={{
                        fontSize: 10, fontWeight: 800, color,
                        background: `${color}18`, padding: '1px 6px', borderRadius: 6,
                        fontVariantNumeric: 'tabular-nums',
                      }}>{weight}</span>
                    </div>
                    <div style={{ fontSize: 11, color: C.t3, lineHeight: 1.4 }}>{desc}</div>
                  </div>
                </motion.div>
              ))}
              <div style={{ padding: '12px 18px', background: 'rgba(99,102,241,0.08)', borderTop: `1px solid ${C.border}` }}>
                <div style={{ fontSize: 11, color: C.accent, fontWeight: 600, lineHeight: 1.5 }}>
                  ★ 기간별 전망 확률은 시총 상위 100종목 약 2년치 백테스트로 맞춘 값이에요
                </div>
              </div>
            </div>
          </motion.div>
        )}
        </>}
      </div>
    </div>
  );
}

// ╔══════════════════════════════════════════════════════════
// ║ 9. 종목 카드 컴포넌트
// ╚══════════════════════════════════════════════════════════

function StockCard({ stock, idx, expanded, onToggle, isFav, onFav, onChart, onFinancial }) {
  const gs       = GRADE_STYLE[stock.grade] || GRADE_STYLE['관망'];
  const isRise   = (stock.changePercent || 0) >= 0;
  const priceColor = isRise ? C.rise : C.fall;

  const sign = (v) => (v > 0 ? '+' : '');
  const metricTags = [
    stock.rsi != null && { label: `RSI ${Math.round(stock.rsi)}`, good: stock.rsi < 50, tooltip: 'RSI: 30 이하 과매도 / 70 이상 과매수' },
    stock.momentum != null && { label: `모멘텀 ${sign(stock.momentum)}${Math.round(stock.momentum)}%`, good: stock.momentum > 0, tooltip: '1개월 40% + 3개월 60% 수익률' },
    stock.ret5 != null && { label: `5일 ${sign(stock.ret5)}${stock.ret5}%`, good: stock.ret5 > 0, tooltip: '최근 5거래일 수익률' },
    stock.bbPos != null && { label: `밴드 ${stock.bbPos}`, good: stock.bbPos < 50, tooltip: '볼린저밴드 안 위치 (0 하단 ~ 100 상단)' },
    stock.volumeRatio != null && { label: `거래량 ${stock.volumeRatio.toFixed(1)}x`, good: stock.volumeRatio > 1.2, tooltip: '직전 20일 평균 대비 (장중이면 하루치로 환산)' },
    stock.sigmaD != null && { label: `변동성 ±${stock.sigmaD}%`, good: stock.sigmaD < 3, tooltip: '최근 20일 하루 수익률 표준편차' },
  ].filter(Boolean);

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: [0.22, 1, 0.36, 1], delay: Math.min(idx * 0.04, 0.3) }}
      layout
      style={{
        background: C.card,
        borderRadius: 20,
        border: `1px solid ${expanded ? gs.color + '40' : C.border}`,
        overflow: 'hidden',
        boxShadow: '0 2px 12px rgba(15,23,42,0.06)',
        transition: 'box-shadow 0.3s, border-color 0.3s',
      }}
    >
      {/* ── Card Body ── */}
      <div style={{ padding: '18px 18px 14px' }}>

        {/* Row 1: Name + Price */}
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>

          {/* Score Arc */}
          <div style={{ flexShrink: 0 }}>
            <ScoreArc score={stock.score} size={76} delay={idx * 0.04} />
          </div>

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0, paddingTop: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 5, flexWrap: 'wrap' }}>
              <span style={{ fontSize: 15, fontWeight: 800, color: C.t1, letterSpacing: '-0.3px' }}>
                {stock.name}
              </span>
              <span style={{
                fontSize: 9, fontWeight: 800, letterSpacing: '0.8px',
                color: gs.color, background: gs.dim,
                padding: '2px 7px', borderRadius: 6,
                border: `1px solid ${gs.color}30`,
              }}>{gs.label}</span>
            </div>

            <div style={{ fontSize: 10, color: C.t3, marginBottom: 8, fontVariantNumeric: 'tabular-nums' }}>
              {stock.code}
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: 8 }}>
              <span style={{ fontSize: 16, fontWeight: 800, color: C.t1, fontVariantNumeric: 'tabular-nums', letterSpacing: '-0.5px' }}>
                {(stock.price || 0).toLocaleString()}원
              </span>
              <span style={{
                fontSize: 12, fontWeight: 700, color: priceColor,
                fontVariantNumeric: 'tabular-nums',
              }}>
                {isRise ? '+' : ''}{(stock.changePercent || 0).toFixed(2)}%
              </span>
            </div>
          </div>

          {/* Fav button */}
          <motion.button
            onClick={onFav}
            whileTap={{ scale: 0.8 }}
            animate={{ scale: isFav ? [1, 1.3, 1] : 1 }}
            transition={{ duration: 0.3 }}
            style={{
              flexShrink: 0, width: 36, height: 36, borderRadius: 10,
              background: isFav ? 'rgba(217,119,6,0.1)' : '#F3F4F6',
              border: `1px solid ${isFav ? 'rgba(245,158,11,0.4)' : C.border}`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', fontSize: 16,
            }}
          >
            {isFav ? '⭐' : '☆'}
          </motion.button>
        </div>

        {/* Row 2: 기간별 전망 */}
        <OutlookBar label="1주 전망" h={stock.weekly} />
        <OutlookBar label="1달 전망" h={stock.monthly} />
        {/* Row 3: Confidence Bar */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontSize: 11, color: C.t2, fontWeight: 600 }}>신뢰도</span>
            <span style={{
              fontSize: 11, fontWeight: 800, fontVariantNumeric: 'tabular-nums',
              color: (stock.confidence || 0) >= 70 ? C.green : (stock.confidence || 0) >= 50 ? C.gold : C.t3,
            }}>
              {stock.confidence}%
            </span>
          </div>
          <div style={{ height: 3, background: C.surface, borderRadius: 99, overflow: 'hidden' }}>
            <motion.div
              style={{
                height: '100%', borderRadius: 99,
                background: (stock.confidence || 0) >= 70 ? C.green : (stock.confidence || 0) >= 50 ? C.gold : C.neutral,
              }}
              initial={{ width: 0 }}
              animate={{ width: `${stock.confidence}%` }}
              transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
            />
          </div>
        </div>

        {/* Row 4: Breakdown Grid */}
        <div style={{ marginBottom: 14 }}>
          <BreakdownGrid breakdown={stock.breakdown} />
        </div>

        {/* Row 5: Analysis Reasons */}
        {stock.reasons && stock.reasons.length > 0 && (
          <div style={{
            background: '#F8FAFC', borderRadius: 14,
            padding: '12px 14px', marginBottom: 14,
            border: `1px solid ${C.border}`,
          }}>
            <div style={{ fontSize: 11, fontWeight: 800, color: C.t2, marginBottom: 10, letterSpacing: '0.3px' }}>
              💡 주요 신호
            </div>
            {stock.reasons.map((reason, i) => (
              <div key={i} style={{ display: 'flex', gap: 8, marginBottom: i < stock.reasons.length - 1 ? 8 : 0 }}>
                <span style={{
                  flexShrink: 0, width: 18, height: 18, borderRadius: 6,
                  background: gs.dim, color: gs.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 9, fontWeight: 900, fontVariantNumeric: 'tabular-nums',
                }}>{i + 1}</span>
                <span style={{ fontSize: 12, color: C.t2, lineHeight: 1.55 }}>{reason}</span>
              </div>
            ))}
          </div>
        )}

        {/* Row 6: Metric Tags */}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginBottom: 12 }}>
          {metricTags.map(({ label, good, tooltip }, j) => (
            <MetricTag key={j} label={label} good={good} tooltip={tooltip} />
          ))}
        </div>

        {/* Row 7: Expand Toggle */}
        <motion.button
          onClick={onToggle}
          whileTap={{ scale: 0.97 }}
          style={{
            width: '100%', padding: '9px', borderRadius: 10, border: `1px solid ${C.border}`,
            background: '#F8FAFC', color: C.t3, fontSize: 11, fontWeight: 700,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
          }}
        >
          <motion.span
            animate={{ rotate: expanded ? 180 : 0 }}
            transition={{ duration: 0.25 }}
            style={{ display: 'inline-block', fontSize: 12 }}
          >▼</motion.span>
          {expanded ? '신호 닫기' : `세부 신호 ${stock.signals?.length || 0}개 보기`}
        </motion.button>
      </div>

      {/* ── Expanded Signal List ── */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            style={{ overflow: 'hidden' }}
          >
            <div style={{
              padding: '0 18px 16px',
              borderTop: `1px solid ${C.border}`,
            }}>
              <div style={{ paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 6 }}>
                {(stock.signals || []).map((sig, j) => {
                  const sigColor = sig.type === 'bullish' ? C.rise : sig.type === 'bearish' ? C.fall : C.neutral;
                  return (
                    <motion.div
                      key={j}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: j * 0.03 }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: '8px 10px', borderRadius: 10,
                        background: `${sigColor}08`,
                        border: `1px solid ${sigColor}18`,
                      }}
                    >
                      <span style={{
                        width: 6, height: 6, borderRadius: '50%',
                        background: sigColor, flexShrink: 0,
                        boxShadow: `0 0 6px ${sigColor}`,
                      }} />
                      <span style={{ fontSize: 12, color: C.t2, fontWeight: 500 }}>{sig.label}</span>
                    </motion.div>
                  );
                })}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Action Buttons ── */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', borderTop: `1px solid ${C.border}` }}>
        <motion.button
          onClick={onChart}
          whileTap={{ scale: 0.97 }}
          style={{
            padding: '14px 0', border: 'none', borderRight: `1px solid ${C.border}`,
            background: 'transparent', color: C.accent, fontSize: 12, fontWeight: 800,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = C.accentDim}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          📈 차트
        </motion.button>
        <motion.button
          onClick={onFinancial}
          whileTap={{ scale: 0.97 }}
          style={{
            padding: '14px 0', border: 'none',
            background: 'transparent', color: '#A78BFA', fontSize: 12, fontWeight: 800,
            cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = 'rgba(167,139,250,0.08)'}
          onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
        >
          📊 재무
        </motion.button>
      </div>
    </motion.div>
  );
}