'use client';

import { useEffect, useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import MarketTreemap from '@/components/MarketTreemap';

/* ─── Design tokens (inline CSS variables via style prop) ─── */
/* 한국 증시 컨벤션: 상승=빨강, 하락=파랑 */
const token = {
    gain: '#ef4444',
    gainBg: 'rgba(239,68,68,0.08)',
    gainBorder: 'rgba(239,68,68,0.22)',
    loss: '#3b82f6',
    lossBg: 'rgba(59,130,246,0.08)',
    lossBorder: 'rgba(59,130,246,0.22)',
    neutral: '#64748b',
    surface: '#0f1117',
    surfaceElevated: '#161b27',
    surfaceHover: '#1c2333',
    border: 'rgba(255,255,255,0.06)',
    borderHover: 'rgba(255,255,255,0.12)',
    text: '#f1f5f9',
    textMuted: '#64748b',
    textSub: '#94a3b8',
    accent: '#6366f1',
    accentGlow: 'rgba(99,102,241,0.15)',
};

/* ─── Keyframe injection ─── */
const STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');

  * { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }

  .mmp-root {
    min-height: 100svh;
    background: ${token.surface};
    font-family: 'DM Sans', sans-serif;
    color: ${token.text};
    padding-bottom: 5rem;
  }

  /* ── scrollbar ── */
  .mmp-root ::-webkit-scrollbar { width: 4px; }
  .mmp-root ::-webkit-scrollbar-track { background: transparent; }
  .mmp-root ::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.1); border-radius: 4px; }

  /* ── header glass ── */
  .mmp-header {
    position: sticky; top: 0; z-index: 50;
    background: rgba(15,17,23,0.85);
    backdrop-filter: blur(20px) saturate(180%);
    -webkit-backdrop-filter: blur(20px) saturate(180%);
    border-bottom: 1px solid ${token.border};
  }

  /* ── pill buttons ── */
  .pill {
    display: inline-flex; align-items: center; gap: 5px;
    padding: 6px 14px; border-radius: 99px;
    font-size: 13px; font-weight: 500; cursor: pointer;
    border: 1px solid transparent;
    transition: all 0.18s ease;
    background: rgba(255,255,255,0.04);
    color: ${token.textSub};
    user-select: none;
  }
  .pill:hover { background: rgba(255,255,255,0.08); color: ${token.text}; }
  .pill.active {
    background: rgba(99,102,241,0.12);
    border-color: rgba(99,102,241,0.35);
    color: #a5b4fc;
  }
  .pill.gain-active { background: ${token.gainBg}; border-color: ${token.gainBorder}; color: ${token.gain}; }
  .pill.loss-active { background: ${token.lossBg}; border-color: ${token.lossBorder}; color: ${token.loss}; }

  /* ── search input ── */
  .mmp-search-wrap {
    position: relative; flex: 1;
  }
  .mmp-search-wrap svg {
    position: absolute; left: 12px; top: 50%;
    transform: translateY(-50%);
    opacity: 0.4; pointer-events: none;
  }
  .mmp-search {
    width: 100%; height: 40px;
    padding: 0 14px 0 38px;
    background: rgba(255,255,255,0.05);
    border: 1px solid ${token.border};
    border-radius: 10px;
    color: ${token.text};
    font-family: 'DM Sans', sans-serif;
    font-size: 14px;
    outline: none;
    transition: border-color 0.18s, background 0.18s;
  }
  .mmp-search::placeholder { color: ${token.textMuted}; }
  .mmp-search:focus {
    border-color: rgba(99,102,241,0.4);
    background: rgba(99,102,241,0.06);
  }

  /* ── pills scrollbar hidden ── */
  .mmp-pills-row::-webkit-scrollbar { display: none; }

  /* ── sector card ── */
  .sector-card {
    border-radius: 14px;
    background: ${token.surfaceElevated};
    border: 1px solid ${token.border};
    padding: 16px;
    cursor: pointer;
    transition: all 0.22s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative; overflow: hidden;
  }
  .sector-card::before {
    content: '';
    position: absolute; inset: 0; opacity: 0;
    border-radius: 14px;
    transition: opacity 0.22s;
    pointer-events: none;
  }
  .sector-card:hover {
    border-color: ${token.borderHover};
    background: ${token.surfaceHover};
    transform: translateY(-2px);
  }
  .sector-card:active { transform: translateY(0); }

  /* ── stock row ── */
  .stock-row {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 16px;
    border-radius: 12px;
    background: ${token.surfaceElevated};
    border: 1px solid ${token.border};
    cursor: pointer;
    transition: all 0.18s ease;
    margin-bottom: 8px;
  }
  .stock-row:hover {
    border-color: ${token.borderHover};
    background: ${token.surfaceHover};
    transform: translateX(3px);
  }
  .stock-row:active { transform: translateX(1px); }

  /* ── badge ── */
  .badge {
    font-size: 11.5px; font-weight: 500;
    padding: 3px 9px; border-radius: 6px;
    font-family: 'JetBrains Mono', monospace;
    letter-spacing: 0.02em;
  }
  .badge-gain { background: ${token.gainBg}; color: ${token.gain}; border: 1px solid ${token.gainBorder}; }
  .badge-loss { background: ${token.lossBg}; color: ${token.loss}; border: 1px solid ${token.lossBorder}; }
  .badge-neutral { background: rgba(100,116,139,0.1); color: ${token.textSub}; border: 1px solid rgba(100,116,139,0.2); }

  /* ── mono number ── */
  .mono { font-family: 'JetBrains Mono', monospace; }

  /* ── progress bar ── */
  @keyframes shimmer {
    0%   { background-position: -200% 0; }
    100% { background-position:  200% 0; }
  }
  .shimmer {
    background: linear-gradient(90deg, ${token.accent} 0%, #818cf8 40%, ${token.accent} 100%);
    background-size: 200% 100%;
    animation: shimmer 2.2s linear infinite;
  }

  /* ── tip fade ── */
  /* ── credits scroll ── */
  @keyframes creditsScroll {
    0%   { transform: translateY(0); }
    100% { transform: translateY(-50%); }
  }
  .credits-track {
    display: flex;
    flex-direction: column;
    gap: 0;
    animation: creditsScroll 7s linear infinite;
    will-change: transform;
  }
  /* top/bottom fade mask on the viewport */
  .credits-mask {
    -webkit-mask-image: linear-gradient(to bottom,
      transparent 0%, black 18%, black 82%, transparent 100%);
    mask-image: linear-gradient(to bottom,
      transparent 0%, black 18%, black 82%, transparent 100%);
  }

  /* ── back button ── */
  .back-btn {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 7px 14px; border-radius: 9px;
    font-size: 13px; font-weight: 500;
    background: rgba(255,255,255,0.04);
    border: 1px solid ${token.border};
    color: ${token.textSub};
    cursor: pointer;
    transition: all 0.18s ease;
  }
  .back-btn:hover { background: rgba(255,255,255,0.08); color: ${token.text}; border-color: ${token.borderHover}; }

  /* ── legend dots ── */
  .legend-dot { width: 10px; height: 10px; border-radius: 3px; flex-shrink: 0; }

  /* ── stat chips ── */
  .stat-chip {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 10px 18px;
    border-radius: 10px;
    background: rgba(255,255,255,0.03);
    border: 1px solid ${token.border};
    min-width: 80px;
  }

  /* ── empty state ── */
  @keyframes float {
    0%,100% { transform: translateY(0); }
    50%      { transform: translateY(-8px); }
  }
  .float-anim { animation: float 3s ease-in-out infinite; }

  /* ── sector detail header gradient bar ── */
  .detail-bar {
    height: 3px; border-radius: 2px; margin-bottom: 18px;
    transition: width 0.8s cubic-bezier(0.4,0,0.2,1);
  }
`;

/* ─── Helpers ─── */
const pct = (v) => `${v >= 0 ? '+' : ''}${v.toFixed(2)}%`;
const tri = (v) => v >= 0 ? '▲' : '▼';
const fmtCap = (v) => {
    if (!v) return '—';
    const t = v / 1_000_000_000_000;
    return t >= 1 ? `${t.toFixed(1)}조` : `${(v / 100_000_000).toFixed(0)}억`;
};
const fmtVol = (v) => v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${(v / 1000).toFixed(0)}K`;
const changeClass = (v) => v > 0 ? 'badge-gain' : v < 0 ? 'badge-loss' : 'badge-neutral';
const changeColor = (v) => v > 0 ? token.gain : v < 0 ? token.loss : token.textMuted;

/* ─── Loading Screen ─── */
const TIPS = [
    { icon: '↑↓', text: '"매수는 기술, 매도는 예술"' },
    { icon: '❄', text: '"공포에 사서 환희에 팔아라" — 워렌 버핏' },
    { icon: '⌛', text: '"시장은 인내심 없는 자의 돈을 인내심 있는 자에게 옮긴다"' },
    { icon: '◎', text: '"분산투자는 무지에 대한 보호장치다" — 워렌 버핏' },
    { icon: '~', text: '"썰물이 빠지면 누가 발가벗고 수영했는지 알 수 있다"' },
    { icon: '◆', text: '"투자에서 가장 중요한 건 IQ가 아니라 감정 조절이다"' },
    { icon: '→', text: '"시장에 머무는 것이 시장 타이밍보다 중요하다"' },
    { icon: '✦', text: '"좋은 기업을 적정 가격에 사라" — 워렌 버핏' },
    { icon: '◐', text: '"상승장에서는 모두가 천재다"' },
    { icon: '◻', text: '"거품은 터지기 전까지 거품인지 알 수 없다"' },
    { icon: '♠', text: '"기업 분석 없는 투자는 카드를 보지 않고 치는 포커" — 피터 린치' },
    { icon: '△', text: '"큰돈은 매매가 아니라 기다림에서 나온다" — 찰리 멍거' },
    { icon: '○', text: '"시장은 당신이 파산할 때까지 비이성적일 수 있다" — 케인즈' },
    { icon: '▽', text: '"50% 하락을 견디지 못하면 주식을 해선 안 된다" — 찰리 멍거' },
    { icon: '◇', text: '"수익은 언제나 옳다 — 익절은 항상 정당하다"' },
];

function LoadingScreen({ progress }) {
    // 모든 명언을 이어붙여 seamless loop 구현 (2배 복사)
    const allTips = [...TIPS, ...TIPS];

    return (
        <div style={{
            minHeight: '100svh', background: token.surface,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            fontFamily: "'DM Sans', sans-serif",
            overflow: 'hidden',
            position: 'relative',
        }}>
            {/* ── 상단 고정 영역 ── */}
            <div style={{
                position: 'relative', zIndex: 10,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
                marginBottom: 36,
            }}>
                {/* Logo */}
                <div style={{
                    width: 48, height: 48, borderRadius: 14,
                    background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 22, marginBottom: 20, flexShrink: 0,
                    boxShadow: '0 0 32px rgba(99,102,241,0.35)',
                }}>🗺</div>

                {/* Progress bar */}
                <div style={{ width: 200, height: 2, background: 'rgba(255,255,255,0.06)', borderRadius: 2, overflow: 'hidden' }}>
                    <div className="shimmer" style={{ height: '100%', borderRadius: 2, width: `${progress}%`, transition: 'width 0.3s ease-out' }} />
                </div>
            </div>

            {/* ── 엔딩 크레딧 스크롤 영역 ── */}
            <div
                className="credits-mask"
                style={{
                    width: '100%', maxWidth: 320,
                    height: 260,
                    overflow: 'hidden',
                    position: 'relative',
                }}
            >
                <div className="credits-track">
                    {allTips.map((tip, i) => (
                        <div key={i} style={{
                            display: 'flex', alignItems: 'flex-start', gap: 14,
                            padding: '13px 24px',
                            borderBottom: i < allTips.length - 1
                                ? '1px solid rgba(255,255,255,0.04)'
                                : 'none',
                        }}>
                            <span style={{
                                color: token.accent,
                                fontSize: 12, fontWeight: 700,
                                marginTop: 3, flexShrink: 0,
                                width: 14, textAlign: 'center',
                                fontFamily: 'monospace',
                                opacity: 0.75,
                            }}>
                                {tip.icon}
                            </span>
                            <p style={{
                                margin: 0,
                                fontSize: 13, lineHeight: 1.65,
                                color: token.textSub,
                                wordBreak: 'keep-all',
                            }}>
                                {tip.text}
                            </p>
                        </div>
                    ))}
                </div>
            </div>

            {/* ── 하단 상태 텍스트 ── */}
            <p style={{
                marginTop: 28, fontSize: 11, color: token.textMuted,
                letterSpacing: '0.1em', textTransform: 'uppercase',
            }}>
                시장 데이터 불러오는 중
            </p>
        </div>
    );
}

/* ─── Main Page ─── */
export default function MarketMapPage() {
    const router = useRouter();
    const [loading, setLoading]           = useState(true);
    const [sectors, setSectors]           = useState([]);
    const [selectedSector, setSelectedSector] = useState(null);
    const [filter, setFilter]             = useState('all');
    const [sortBy, setSortBy]             = useState('marketCap');
    const [searchQuery, setSearchQuery]   = useState('');
    const [error, setError]               = useState(null);
    const [progress, setProgress]         = useState(0);

    /* ── data fetch ── */
    useEffect(() => {
        async function fetchData(useCache = true) {
            try {
                if (useCache) {
                    const cached = sessionStorage.getItem('market-map-data');
                    if (cached) {
                        const { data, timestamp } = JSON.parse(cached);
                        if (Date.now() - timestamp < 5 * 60 * 1000) {
                            setSectors(data); setLoading(false); return;
                        }
                    }
                }
                setLoading(true); setError(null);
                const res = await fetch('/api/market-overview');
                const result = await res.json();
                if (result.success && result.data) {
                    setSectors(result.data);
                    sessionStorage.setItem('market-map-data', JSON.stringify({ data: result.data, timestamp: Date.now() }));
                }
            } catch (e) {
                setError(e.message);
            } finally {
                setLoading(false);
            }
        }
        fetchData();
        const iv = setInterval(() => fetchData(false), 5 * 60 * 1000);
        return () => clearInterval(iv);
    }, []);

    /* ── progress bar ── */
    useEffect(() => {
        if (!loading) { setProgress(0); return; }
        const t = setInterval(() => setProgress(p => p >= 92 ? p : p + (95 - p) * 0.05), 200);
        return () => clearInterval(t);
    }, [loading]);

    /* ── filter / sort ── */
    const filteredSectors = sectors.filter(s => {
        if (searchQuery) {
            const q = searchQuery.toLowerCase();
            if (!s.name.toLowerCase().includes(q) &&
                !s.stocks?.some(st => st.name.toLowerCase().includes(q) || st.ticker.toLowerCase().includes(q)))
                return false;
        }
        if (filter === 'up'   && s.avgChangePercent <= 0) return false;
        if (filter === 'down' && s.avgChangePercent >= 0) return false;
        return true;
    });
    const sortedSectors = [...filteredSectors].sort((a, b) =>
        sortBy === 'marketCap'
            ? b.totalMarketCap - a.totalMarketCap
            : b.avgChangePercent - a.avgChangePercent
    );

    /* ── market overview stats ── */
    const totalUp   = sectors.filter(s => s.avgChangePercent > 0).length;
    const totalDown = sectors.filter(s => s.avgChangePercent < 0).length;

    /* ── handlers ── */
    const handleStockClick = (name) => {
        const clean = name.replace(/\(.*?\)/g, '').trim();
        router.push(`/?q=${encodeURIComponent(clean)}`);
    };

    if (loading) return (
        <>
            <style>{STYLES}</style>
            <LoadingScreen progress={progress} />
        </>
    );

    if (error) return (
        <>
            <style>{STYLES}</style>
            <div style={{ minHeight: '100svh', background: token.surface, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'DM Sans', sans-serif", padding: '2rem' }}>
                <div style={{ textAlign: 'center', maxWidth: 320 }}>
                    <div style={{ fontSize: 48, marginBottom: 16 }}>⚠</div>
                    <p style={{ color: token.text, fontSize: 17, fontWeight: 600, marginBottom: 8 }}>데이터 로드 실패</p>
                    <p style={{ color: token.textSub, fontSize: 13.5, marginBottom: 24, lineHeight: 1.5 }}>{error}</p>
                    <button
                        onClick={() => window.location.reload()}
                        style={{ padding: '10px 24px', borderRadius: 10, background: token.accent, border: 'none', color: '#fff', fontSize: 14, fontWeight: 600, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                    >
                        다시 시도
                    </button>
                </div>
            </div>
        </>
    );

    return (
        <>
            <style>{STYLES}</style>
            <div className="mmp-root">

                {/* ══ HEADER ══ */}
                <header className="mmp-header">
                    <div style={{ padding: '14px 16px' }}>

                        {selectedSector ? (
                            /* ── sector detail header ── */
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                <button className="back-btn" onClick={() => setSelectedSector(null)}>
                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                        <path d="M9 2L4 7L9 12" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                                    </svg>
                                    뒤로
                                </button>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                    <span style={{ fontSize: 15, fontWeight: 600, color: token.text }}>{selectedSector.name}</span>
                                    <span className={`badge ${changeClass(selectedSector.avgChangePercent)}`}>
                                        {tri(selectedSector.avgChangePercent)} {pct(selectedSector.avgChangePercent)}
                                    </span>
                                </div>
                                <div style={{ width: 64 }} />
                            </div>
                        ) : (
                            /* ── main header ── */
                            <>
                                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                                        <div style={{
                                            width: 32, height: 32, borderRadius: 9,
                                            background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
                                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                                            fontSize: 15, flexShrink: 0,
                                        }}>🗺</div>
                                        <div>
                                            <p style={{ margin: 0, fontSize: 15, fontWeight: 600, color: token.text, lineHeight: 1 }}>시장 지도</p>
                                            <p style={{ margin: 0, fontSize: 11, color: token.textMuted, marginTop: 2 }}>{sectors.length}개 섹터</p>
                                        </div>
                                    </div>
                                    {/* Mini stats */}
                                    <div style={{ display: 'flex', gap: 8 }}>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, background: token.gainBg, border: `1px solid ${token.gainBorder}` }}>
                                            <span style={{ fontSize: 10, color: token.gain }}>▲</span>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: token.gain, fontFamily: 'JetBrains Mono, monospace' }}>{totalUp}</span>
                                        </div>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, background: token.lossBg, border: `1px solid ${token.lossBorder}` }}>
                                            <span style={{ fontSize: 10, color: token.loss }}>▼</span>
                                            <span style={{ fontSize: 12, fontWeight: 600, color: token.loss, fontFamily: 'JetBrains Mono, monospace' }}>{totalDown}</span>
                                        </div>
                                    </div>
                                </div>

                                {/* Search */}
                                <div className="mmp-search-wrap" style={{ marginBottom: 12 }}>
                                    <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                                        <circle cx="6" cy="6" r="4.5" stroke="white" strokeWidth="1.4"/>
                                        <path d="M9.5 9.5L12.5 12.5" stroke="white" strokeWidth="1.4" strokeLinecap="round"/>
                                    </svg>
                                    <input
                                        type="text"
                                        placeholder="섹터 또는 종목 검색…"
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="mmp-search"
                                    />
                                    {searchQuery && (
                                        <button
                                            onClick={() => setSearchQuery('')}
                                            style={{ position: 'absolute', right: 10, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', color: token.textMuted, cursor: 'pointer', fontSize: 16, lineHeight: 1, padding: '2px 4px' }}
                                        >×</button>
                                    )}
                                </div>

                                {/* Filters */}
                                <div style={{ display: 'flex', flexWrap: 'nowrap', gap: 6, overflowX: 'auto', paddingBottom: 4, WebkitOverflowScrolling: 'touch', msOverflowStyle: 'none', scrollbarWidth: 'none' }}>
                                    {/* Filter pills */}
                                    {[
                                        { val: 'all',  label: '전체' },
                                        { val: 'up',   label: '상승' },
                                        { val: 'down', label: '하락' },
                                    ].map(({ val, label }) => (
                                        <button
                                            key={val}
                                            className={`pill ${filter === val ? (val === 'up' ? 'gain-active' : val === 'down' ? 'loss-active' : 'active') : ''}`}
                                            onClick={() => setFilter(val)}
                                            style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                                        >
                                            {val === 'up' && <span style={{ fontSize: 10 }}>▲</span>}
                                            {val === 'down' && <span style={{ fontSize: 10 }}>▼</span>}
                                            {label}
                                        </button>
                                    ))}

                                    {/* Divider */}
                                    <div style={{ width: 1, background: token.border, margin: '4px 2px', flexShrink: 0 }} />

                                    {/* Sort pills */}
                                    {[
                                        { val: 'marketCap', label: '시가총액' },
                                        { val: 'change',    label: '등락률' },
                                    ].map(({ val, label }) => (
                                        <button
                                            key={val}
                                            className={`pill ${sortBy === val ? 'active' : ''}`}
                                            onClick={() => setSortBy(val)}
                                            style={{ flexShrink: 0, whiteSpace: 'nowrap' }}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                            </>
                        )}
                    </div>
                </header>

                {/* ══ MAIN CONTENT ══ */}
                {selectedSector ? (

                    /* ─── SECTOR DETAIL VIEW ─── */
                    <div style={{ padding: '20px 16px' }}>

                        {/* Sector summary card */}
                        <div style={{
                            borderRadius: 16, background: token.surfaceElevated,
                            border: `1px solid ${token.border}`, padding: '20px', marginBottom: 20,
                            position: 'relative', overflow: 'hidden',
                        }}>
                            {/* Ambient glow */}
                            <div style={{
                                position: 'absolute', top: -20, right: -20, width: 120, height: 120,
                                borderRadius: '50%', pointerEvents: 'none',
                                background: selectedSector.avgChangePercent >= 0
                                    ? 'radial-gradient(circle, rgba(239,68,68,0.12) 0%, transparent 70%)'
                                    : 'radial-gradient(circle, rgba(59,130,246,0.12) 0%, transparent 70%)',
                            }} />

                            {/* Progress bar */}
                            <div style={{ height: 2, borderRadius: 2, background: 'rgba(255,255,255,0.06)', marginBottom: 16 }}>
                                <div style={{
                                    height: '100%', borderRadius: 2,
                                    width: `${Math.min(100, Math.abs(selectedSector.avgChangePercent) * 10)}%`,
                                    background: selectedSector.avgChangePercent >= 0 ? token.gain : token.loss,
                                    /* 상승=빨강, 하락=파랑 */
                                    transition: 'width 0.8s cubic-bezier(0.4,0,0.2,1)',
                                }} />
                            </div>

                            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
                                <div>
                                    <p style={{ margin: '0 0 6px', fontSize: 19, fontWeight: 600, color: token.text }}>{selectedSector.name}</p>
                                    <p style={{ margin: 0, fontSize: 12.5, color: token.textMuted }}>종목 {selectedSector.stocks.length}개</p>
                                </div>
                                <div style={{ textAlign: 'right' }}>
                                    <p style={{
                                        margin: '0 0 4px', fontSize: 22, fontWeight: 600,
                                        color: changeColor(selectedSector.avgChangePercent),
                                        fontFamily: 'JetBrains Mono, monospace',
                                    }}>
                                        {pct(selectedSector.avgChangePercent)}
                                    </p>
                                    <p style={{ margin: 0, fontSize: 11.5, color: token.textMuted }}>섹터 평균 등락</p>
                                </div>
                            </div>
                        </div>

                        {/* Stock list */}
                        <p style={{ fontSize: 12, fontWeight: 600, color: token.textMuted, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 12 }}>
                            구성 종목
                        </p>

                        {selectedSector.stocks
                            .sort((a, b) => Math.abs(b.changePercent) - Math.abs(a.changePercent))
                            .map(stock => (
                                <div
                                    key={stock.ticker}
                                    className="stock-row"
                                    onClick={() => handleStockClick(stock.name)}
                                >
                                    {/* Left: name + ticker */}
                                    <div style={{ flex: 1, minWidth: 0 }}>
                                        <p style={{ margin: '0 0 2px', fontSize: 14.5, fontWeight: 500, color: token.text, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                            {stock.name}
                                        </p>
                                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                            <span style={{ fontSize: 11.5, color: token.textMuted, fontFamily: 'JetBrains Mono, monospace' }}>{stock.ticker}</span>
                                            <span style={{ fontSize: 11, color: token.textMuted }}>·</span>
                                            <span style={{ fontSize: 11.5, color: token.textMuted }}>거래량 {fmtVol(stock.volume)}</span>
                                        </div>
                                    </div>

                                    {/* Right: price + change */}
                                    <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 5 }}>
                                        <span style={{ fontSize: 14.5, fontWeight: 600, color: token.text, fontFamily: 'JetBrains Mono, monospace' }}>
                                            {stock.price.toLocaleString()}
                                            <span style={{ fontSize: 11, fontWeight: 400, color: token.textMuted, marginLeft: 3 }}>원</span>
                                        </span>
                                        <span className={`badge ${changeClass(stock.changePercent)}`}>
                                            {tri(stock.changePercent)} {pct(stock.changePercent)}
                                        </span>
                                    </div>

                                    {/* Arrow */}
                                    <div style={{ marginLeft: 12, color: token.textMuted, fontSize: 13, flexShrink: 0 }}>→</div>
                                </div>
                            ))
                        }
                    </div>

                ) : (

                    /* ─── TREEMAP VIEW ─── */
                    <>
                        {sortedSectors.length === 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '55vh', gap: 16 }}>
                                <div className="float-anim" style={{ fontSize: 48, opacity: 0.4 }}>◎</div>
                                <p style={{ color: token.textMuted, fontSize: 14, margin: 0 }}>검색 결과가 없습니다</p>
                                <button
                                    onClick={() => { setSearchQuery(''); setFilter('all'); }}
                                    style={{ padding: '8px 20px', borderRadius: 9, background: 'rgba(255,255,255,0.05)', border: `1px solid ${token.border}`, color: token.textSub, fontSize: 13, cursor: 'pointer', fontFamily: "'DM Sans', sans-serif" }}
                                >
                                    필터 초기화
                                </button>
                            </div>
                        ) : (
                            <div style={{ padding: '0 12px', paddingTop: 12 }}>
                                {/* Treemap container */}
                                <div style={{
                                    width: '100%', height: 'calc(100svh - 210px)',
                                    borderRadius: 16, overflow: 'hidden',
                                    border: `1px solid ${token.border}`,
                                }}>
                                    <MarketTreemap
                                        data={sortedSectors}
                                        sortBy={sortBy}
                                        onSectorClick={(sector) => setSelectedSector(sector)}
                                    />
                                </div>

                                {/* Legend */}
                                <div style={{
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    gap: 20, marginTop: 14, padding: '10px 16px',
                                    borderRadius: 10, background: token.surfaceElevated,
                                    border: `1px solid ${token.border}`,
                                }}>
                                    {[
                                        { color: token.loss, label: '강한 하락' },
                                        { color: '#475569', label: '보합' },
                                        { color: token.gain, label: '강한 상승' },
                                    ].map(({ color, label }) => (
                                        <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                                            <div className="legend-dot" style={{ background: color }} />
                                            <span style={{ fontSize: 12, color: token.textMuted }}>{label}</span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </>
                )}
            </div>
        </>
    );
}