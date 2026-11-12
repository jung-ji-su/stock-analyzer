'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/Toast';
import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { ComposedChart, Line, BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, ReferenceLine } from 'recharts';
import { evaluateFinancials } from './evaluate';

// 차트 공통 스타일 (모바일에서 읽기 쉽게: 세로 격자 없음, 작은 축 글씨, 0 기준선)
const AXIS = { tick: { fontSize: 10, fill: '#94a3b8' }, axisLine: false, tickLine: false };
const GRID = { vertical: false, stroke: '#f1f5f9' };
const LEGEND = { iconType: 'circle', iconSize: 8, wrapperStyle: { fontSize: 11, paddingTop: 6 }, formatter: (v) => <span style={{ color: '#475569' }}>{v}</span> };
const TIP = { contentStyle: { borderRadius: 12, border: '1px solid #e2e8f0', fontSize: 12, padding: '8px 10px' }, cursor: { fill: 'rgba(148,163,184,0.12)' } };
const fmtAxis = (v) => (Math.abs(v) >= 1000 ? `${(v / 1000).toFixed(v % 1000 === 0 ? 0 : 1)}k` : v);

// 화면 공통 스타일 (홈·종목 화면과 동일)
const CARD = { background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(15,23,42,0.06)', padding: 16 };
const H2 = { fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 };
const fade = { initial: { opacity: 0, y: 10 }, animate: { opacity: 1, y: 0 }, transition: { duration: 0.35, ease: [0.22, 1, 0.36, 1] } };

const GRADE_COLOR = { 'A+': '#4ade80', A: '#4ade80', 'B+': '#a3e635', B: '#facc15', 'C+': '#fb923c', C: '#fb923c', D: '#f87171' };

// 지표 평가 (좋음/보통/주의)
const TONE = { good: { c: '#16a34a', bg: '#f0fdf4', t: '좋음' }, mid: { c: '#ca8a04', bg: '#fefce8', t: '보통' }, bad: { c: '#dc2626', bg: '#fef2f2', t: '주의' } };
const rate = {
  roe: (v) => (v >= 15 ? 'good' : v >= 5 ? 'mid' : 'bad'),
  opm: (v) => (v >= 10 ? 'good' : v >= 3 ? 'mid' : 'bad'),
  debt: (v) => (v < 100 ? 'good' : v < 200 ? 'mid' : 'bad'),
  cf: (v) => (v >= 80 ? 'good' : v >= 50 ? 'mid' : 'bad'),
};

const GUIDE = [
  ['ROE (자기자본이익률)', '당기순이익 ÷ 자본총계', '내 돈(자본)으로 얼마나 벌었는지. 15% 이상이면 우수'],
  ['ROA (총자산이익률)', '당기순이익 ÷ 총자산', '가진 자산 전체로 얼마나 벌었는지. 5% 이상이면 양호'],
  ['영업이익률', '영업이익 ÷ 매출액', '본업으로 남기는 비율. 10% 이상이면 양호'],
  ['순이익률', '당기순이익 ÷ 매출액', '세금 등을 다 빼고 최종으로 남는 비율'],
  ['부채비율', '부채총계 ÷ 자본총계', '빚이 자본의 몇 %인지. 100% 미만 안정, 200% 이상 주의'],
  ['자산회전율', '매출액 ÷ 총자산', '자산을 얼마나 잘 굴려 매출을 내는지. 1.0 이상 양호'],
  ['현금전환율', '영업현금흐름 ÷ 당기순이익', '장부상 이익이 실제 현금으로 들어오는지. 80% 이상 우수'],
];

const formatNumber = (num) => {
  if (!num) return '-';
  const abs = Math.abs(num), sign = num < 0 ? '-' : '';
  if (abs >= 1e12) return `${sign}${(abs / 1e12).toFixed(1)}조`;
  return `${sign}${Math.round(abs / 1e8).toLocaleString()}억`;
};
const growth = (cur, prev) => (prev && prev.revenue ? ((cur.revenue - prev.revenue) / prev.revenue) * 100 : null);

export default function FinancialPage() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const router = useRouter();
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [evalResult, setEvalResult] = useState(null);
  const [topStocks, setTopStocks] = useState([]);
  const [showGuide, setShowGuide] = useState(false);
  const [trendTab, setTrendTab] = useState('amount'); // amount | ratio
  const [wishlist, setWishlist] = useState(null); // 홈 화면 관심종목(profiles.wishlist)과 같은 목록

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    fetch('/api/top?type=volume').then((r) => r.json()).then((d) => setTopStocks((d.stocks || []).slice(0, 30))).catch(() => {});
    getDoc(doc(db, 'profiles', user.uid)).then((s) => setWishlist(s.data()?.wishlist || [])).catch(() => setWishlist([]));
    const q = new URLSearchParams(window.location.search).get('query');
    if (q) { setSearchQuery(q); fetchFinancial(q); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  const fetchFinancial = async (query) => {
    if (!query.trim()) return;
    setLoading(true); setResult(null); setEvalResult(null); setShowGuide(false);
    try {
      const res = await fetch(`/api/financial?query=${encodeURIComponent(query)}`);
      const data = await res.json();
      if (!res.ok) { addToast(data.error || '데이터를 가져올 수 없습니다', 'error'); return; }
      setResult(data);
      setSearchQuery(data.corpName || query);
      try { setEvalResult(evaluateFinancials(data)); } catch (e) { console.error('평가 오류:', e); }
    } catch (e) {
      console.error(e);
      addToast('오류가 발생했습니다', 'error');
    } finally {
      setLoading(false);
    }
  };

  const isWished = !!(result && wishlist?.some((w) => (typeof w === 'string' ? w : w.symbol) === result.stockCode));
  const toggleWish = async () => {
    if (!user || !result || !wishlist) return;
    const updated = isWished
      ? wishlist.filter((w) => (typeof w === 'string' ? w : w.symbol) !== result.stockCode)
      : [...wishlist, { symbol: result.stockCode, name: result.corpName, registeredPrice: 0, registeredAt: new Date().toISOString() }];
    try {
      await updateDoc(doc(db, 'profiles', user.uid), { wishlist: updated });
      setWishlist(updated);
      addToast(isWished ? '관심종목에서 뺐어요' : '관심종목에 추가했어요', 'success');
    } catch { addToast('관심종목을 저장하지 못했어요', 'error'); }
  };

  if (!user) return null;

  const isLargeCorp = result && result.summary[0].revenue > 1e12;
  const chartUnit = isLargeCorp ? 1e12 : 1e8;
  const chartUnitLabel = isLargeCorp ? '조원' : '억원';
  const r1 = (v) => Math.round((v / chartUnit) * 10) / 10;

  const chartData = result?.summary.map((s) => ({ year: `${s.year}`, 매출액: r1(s.revenue), 영업이익: r1(s.operatingIncome), 당기순이익: r1(s.netIncome) })).reverse();
  const ratioData = result?.summary.map((s) => ({
    year: `${s.year}`,
    ROE: s.totalEquity > 0 ? Math.round((s.netIncome / s.totalEquity) * 1000) / 10 : 0,
    영업이익률: s.revenue > 0 ? Math.round((s.operatingIncome / s.revenue) * 1000) / 10 : 0,
    순이익률: s.revenue > 0 ? Math.round((s.netIncome / s.revenue) * 1000) / 10 : 0,
  })).reverse();
  const quarterChartData = result?.quarterData?.slice(0, 8).map((q) => ({
    period: `'${String(q.year).slice(2)} ${q.quarter}${q.derived ? '*' : ''}`,
    매출액: r1(q.revenue), 영업이익: r1(q.operatingIncome),
    영업이익률: q.revenue > 0 ? Math.round((q.operatingIncome / q.revenue) * 1000) / 10 : null,
  })).reverse();
  const hasDerivedQ = result?.quarterData?.slice(0, 8).some((q) => q.derived);
  const unitTip = (v, name) => [/률|ROE/.test(name) ? `${v}%` : `${Number(v).toLocaleString()} ${chartUnitLabel}`, name];

  const lq = result?.latestQuarter;
  const yoy = lq && result.quarterData?.length ? growth(result.quarterData[0], result.quarterData.find((q) => q.year === result.quarterData[0].year - 1 && q.quarter === result.quarterData[0].quarter)) : null;
  const qoq = lq && result.quarterData?.length > 1 ? growth(result.quarterData[0], result.quarterData[1]) : null;
  const chip = (label, v) => v == null ? null : (
    <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 9px', borderRadius: 999, background: v >= 0 ? '#fef2f2' : '#eff6ff', color: v >= 0 ? '#dc2626' : '#2563eb' }}>
      {label} {v >= 0 ? '+' : ''}{v.toFixed(1)}%
    </span>
  );

  const m = evalResult?.metrics;
  const metricTiles = m ? [
    ['ROE', `${m.roe.toFixed(1)}%`, rate.roe(m.roe)],
    ['영업이익률', `${m.operatingMargin.toFixed(1)}%`, rate.opm(m.operatingMargin)],
    ['부채비율', `${m.debtRatio.toFixed(1)}%`, rate.debt(m.debtRatio)],
    ['현금전환율', m.operatingCF ? `${m.cfRatio.toFixed(0)}%` : '-', m.operatingCF ? rate.cf(m.cfRatio) : null],
  ] : [];

  const tableRows = result ? [
    ['매출액', (s) => formatNumber(s.revenue)],
    ['영업이익', (s) => formatNumber(s.operatingIncome), (s) => s.operatingIncome < 0],
    ['당기순이익', (s) => formatNumber(s.netIncome), (s) => s.netIncome < 0],
    ['총자산', (s) => formatNumber(s.totalAssets)],
    null,
    ['ROE', (s) => (s.totalEquity > 0 ? `${((s.netIncome / s.totalEquity) * 100).toFixed(1)}%` : '-'), (s) => s.netIncome < 0],
    ['ROA', (s) => (s.totalAssets > 0 ? `${((s.netIncome / s.totalAssets) * 100).toFixed(1)}%` : '-'), (s) => s.netIncome < 0],
    ['영업이익률', (s) => (s.revenue > 0 ? `${((s.operatingIncome / s.revenue) * 100).toFixed(1)}%` : '-'), (s) => s.operatingIncome < 0],
    ['순이익률', (s) => (s.revenue > 0 ? `${((s.netIncome / s.revenue) * 100).toFixed(1)}%` : '-'), (s) => s.netIncome < 0],
    ['부채비율', (s) => (s.totalEquity > 0 ? `${((s.totalLiabilities / s.totalEquity) * 100).toFixed(1)}%` : '-'), (s) => s.totalEquity > 0 && s.totalLiabilities / s.totalEquity > 2],
    ['자산회전율', (s) => (s.totalAssets > 0 ? (s.revenue / s.totalAssets).toFixed(2) : '-')],
  ] : [];

  const listBlock = (title, color, items) => items.length > 0 && (
    <div>
      <p style={{ fontSize: 12, fontWeight: 800, color, margin: '0 0 6px' }}>{title}</p>
      {items.map((s, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'flex-start', marginBottom: 5 }}>
          <span style={{ width: 5, height: 5, borderRadius: 3, background: color, flexShrink: 0, marginTop: 7 }} />
          <p style={{ fontSize: 13, color: '#334155', lineHeight: 1.55, margin: 0 }}>{s}</p>
        </div>
      ))}
    </div>
  );

  return (
    <main style={{ minHeight: '100vh', background: '#F0F4F8', paddingBottom: 96 }}>
      <div style={{ maxWidth: 640, margin: '0 auto', padding: '20px 14px 0', display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* 제목 + 검색 */}
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', margin: '0 0 2px', letterSpacing: '-0.4px' }}>📊 재무분석</h1>
          <p style={{ fontSize: 12, color: '#94a3b8', margin: 0 }}>DART 공시 기준 · 최근 5년 연간 + 8개 분기</p>
        </div>
        <form onSubmit={(e) => { e.preventDefault(); fetchFinancial(searchQuery); }}
          style={{ display: 'flex', gap: 8, background: 'white', borderRadius: 16, border: '1px solid #e2e8f0', padding: 6, boxShadow: '0 2px 12px rgba(15,23,42,0.06)' }}>
          <input value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} placeholder="종목명 또는 코드 (예: 삼성전자, 005930)" disabled={loading}
            style={{ flex: 1, minWidth: 0, border: 'none', outline: 'none', fontSize: 14, padding: '8px 10px', background: 'transparent', color: '#0f172a' }} />
          <button type="submit" disabled={loading || !searchQuery.trim()}
            style={{ flexShrink: 0, padding: '0 18px', borderRadius: 12, border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer', color: 'white', background: loading || !searchQuery.trim() ? '#cbd5e1' : '#6366f1' }}>
            {loading ? '조회 중' : '분석'}
          </button>
        </form>

        {/* 로딩 스켈레톤 */}
        {loading && (
          <>
            <div className="fin-sk" style={{ height: 150, borderRadius: 20 }} />
            <div className="fin-sk" style={{ height: 90, borderRadius: 20 }} />
            <div className="fin-sk" style={{ height: 260, borderRadius: 20 }} />
          </>
        )}

        {/* 검색 전: 거래량 상위 */}
        {!result && !loading && topStocks.length > 0 && (
          <motion.div {...fade} style={{ ...CARD, padding: '14px 16px 4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', marginBottom: 4 }}>
              <h2 style={H2}>🔥 거래량 상위 종목</h2>
              <span style={{ fontSize: 11, color: '#94a3b8' }}>눌러서 바로 분석</span>
            </div>
            {topStocks.map((s, i) => {
              const rateStr = String(s.changeRate ?? '');
              const col = rateStr.includes('+') ? '#ef4444' : rateStr.includes('-') ? '#3b82f6' : '#94a3b8';
              return (
                <button key={s.code} onClick={() => { setSearchQuery(s.name); fetchFinancial(s.name); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, width: '100%', padding: '11px 0', background: 'none', border: 'none', borderTop: i ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ width: 22, textAlign: 'center', fontSize: 13, fontWeight: 800, color: i < 3 ? '#6366f1' : '#94a3b8' }}>{i + 1}</span>
                  <span style={{ flex: 1, minWidth: 0, fontSize: 14, fontWeight: 700, color: '#0f172a', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>
                  {rateStr && <span style={{ fontSize: 12, fontWeight: 700, color: col }}>{rateStr.includes('%') ? rateStr : `${rateStr}%`}</span>}
                </button>
              );
            })}
          </motion.div>
        )}

        {result && !loading && (
          <>
            {/* 회사 + 종합 점수 */}
            <motion.div {...fade} style={{ borderRadius: 20, overflow: 'hidden', position: 'relative', background: 'linear-gradient(145deg, #0f172a 0%, #1e3a5f 55%, #1e40af 100%)', boxShadow: '0 8px 24px rgba(15,23,42,0.18)' }}>
              <div style={{ position: 'absolute', top: -40, right: -40, width: 160, height: 160, borderRadius: '50%', background: 'rgba(99,102,241,0.2)', filter: 'blur(48px)', pointerEvents: 'none' }} />
              <div style={{ position: 'relative', padding: '18px 18px 16px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ fontSize: 19, fontWeight: 800, color: '#fff', margin: '0 0 2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{result.corpName}</p>
                    <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', margin: 0 }}>
                      {result.stockCode} · {result.summary[0].year}년 사업보고서{lq ? ` · 최신 ${lq.reportDate}` : ''}
                    </p>
                  </div>
                  {evalResult && (
                    <div style={{ textAlign: 'center', flexShrink: 0 }}>
                      <div style={{ width: 62, height: 62, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: `conic-gradient(${GRADE_COLOR[evalResult.grade]} ${evalResult.score * 3.6}deg, rgba(255,255,255,0.1) 0deg)` }}>
                        <div style={{ width: 52, height: 52, borderRadius: '50%', background: '#16274a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 18, fontWeight: 800, color: GRADE_COLOR[evalResult.grade], lineHeight: 1 }}>{evalResult.grade}</span>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', marginTop: 2 }}>{evalResult.score}점</span>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
                {evalResult && <p style={{ fontSize: 13, color: 'rgba(255,255,255,0.8)', lineHeight: 1.6, margin: '12px 0 0' }}>{evalResult.verdict}</p>}
                <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
                  <button onClick={() => router.push(`/?stock=${result.stockCode}&name=${encodeURIComponent(result.corpName)}`)}
                    style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer', background: 'rgba(255,255,255,0.14)', color: '#fff' }}>📈 차트 보기</button>
                  <button onClick={toggleWish} disabled={!wishlist} aria-label="관심종목"
                    style={{ flex: 1, padding: '10px 0', borderRadius: 12, border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer', background: isWished ? 'rgba(251,191,36,0.2)' : 'rgba(255,255,255,0.14)', color: isWished ? '#fcd34d' : '#fff' }}>
                    {isWished ? '⭐ 관심종목' : '☆ 관심 추가'}
                  </button>
                </div>
              </div>
            </motion.div>

            {/* 핵심 지표 */}
            {metricTiles.length > 0 && (
              <motion.div {...fade} style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 8 }}>
                {metricTiles.map(([label, val, tone]) => (
                  <div key={label} style={{ ...CARD, padding: '12px 14px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                      <span style={{ fontSize: 12, color: '#64748b', fontWeight: 600 }}>{label}</span>
                      {tone && <span style={{ fontSize: 10, fontWeight: 800, color: TONE[tone].c, background: TONE[tone].bg, padding: '2px 7px', borderRadius: 999 }}>{TONE[tone].t}</span>}
                    </div>
                    <p style={{ fontSize: 20, fontWeight: 800, color: '#0f172a', margin: 0, fontVariantNumeric: 'tabular-nums' }}>{val}</p>
                  </div>
                ))}
              </motion.div>
            )}

            {/* 최신 분기 */}
            {lq && (
              <motion.div {...fade} style={CARD}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, gap: 8, flexWrap: 'wrap' }}>
                  <h2 style={H2}>🆕 {lq.reportDate} 실적</h2>
                  <div style={{ display: 'flex', gap: 6 }}>{chip('전년비', yoy)}{chip('전분기비', qoq)}</div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
                  {[['매출액', lq.revenue], ['영업이익', lq.operatingIncome], ['순이익', lq.netIncome]].map(([label, v]) => (
                    <div key={label} style={{ background: '#f8fafc', borderRadius: 12, padding: '10px 10px' }}>
                      <p style={{ fontSize: 11, color: '#94a3b8', margin: '0 0 3px' }}>{label}</p>
                      <p style={{ fontSize: 15, fontWeight: 800, margin: 0, color: v < 0 ? '#2563eb' : '#0f172a', fontVariantNumeric: 'tabular-nums' }}>{formatNumber(v)}</p>
                    </div>
                  ))}
                </div>
                {quarterChartData?.length > 0 && (
                  <>
                    <p style={{ fontSize: 12, fontWeight: 700, color: '#64748b', margin: '16px 0 8px' }}>분기별 추이 <span style={{ fontWeight: 500, color: '#94a3b8' }}>({chartUnitLabel})</span></p>
                    <ResponsiveContainer width="100%" height={220}>
                      <ComposedChart data={quarterChartData} margin={{ top: 4, right: 0, left: -12, bottom: 0 }}>
                        <CartesianGrid {...GRID} />
                        <XAxis dataKey="period" {...AXIS} interval={0} tick={{ fontSize: 9, fill: '#94a3b8' }} />
                        <YAxis yAxisId="amt" {...AXIS} tickFormatter={fmtAxis} />
                        <YAxis yAxisId="pct" orientation="right" {...AXIS} unit="%" width={36} />
                        <Tooltip {...TIP} formatter={unitTip} />
                        <Legend {...LEGEND} />
                        <ReferenceLine yAxisId="amt" y={0} stroke="#cbd5e1" />
                        <Bar yAxisId="amt" dataKey="매출액" fill="#c7d2fe" radius={[4, 4, 0, 0]} maxBarSize={22} />
                        <Bar yAxisId="amt" dataKey="영업이익" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={22}>
                          {quarterChartData.map((d, i) => <Cell key={`qc-${i}`} fill={d.영업이익 >= 0 ? '#6366f1' : '#ef4444'} />)}
                        </Bar>
                        <Line yAxisId="pct" type="monotone" dataKey="영업이익률" stroke="#f59e0b" strokeWidth={2} dot={{ r: 2.5 }} connectNulls />
                      </ComposedChart>
                    </ResponsiveContainer>
                    <p style={{ fontSize: 10, color: '#94a3b8', margin: '4px 0 0' }}>막대 = 금액(왼쪽), 선 = 영업이익률(오른쪽){hasDerivedQ ? ' · * 4분기는 연간에서 1~3분기를 빼서 계산' : ''}</p>
                  </>
                )}
              </motion.div>
            )}

            {/* 종합 평가 */}
            {evalResult && (
              <motion.div {...fade} style={{ ...CARD, display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div>
                  <h2 style={H2}>🧾 종합 평가</h2>
                  <p style={{ fontSize: 13, color: '#475569', lineHeight: 1.6, margin: '6px 0 0' }}>{evalResult.summary}</p>
                </div>
                {listBlock('강점', '#16a34a', evalResult.strengths)}
                {listBlock('약점', '#ea580c', evalResult.weaknesses)}
                {listBlock('위험 신호', '#dc2626', evalResult.risks)}
                {listBlock('눈여겨볼 점', '#6366f1', evalResult.insights)}
                <p style={{ fontSize: 11, color: '#94a3b8', margin: 0 }}>공시된 재무제표 숫자로 규칙에 따라 계산한 평가예요. 투자 권유가 아니에요.</p>
              </motion.div>
            )}

            {/* 연간 추이: 금액 | 수익성 */}
            {chartData && (
              <motion.div {...fade} style={CARD}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                  <h2 style={H2}>📈 연간 추이</h2>
                  <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 2 }}>
                    {[['amount', '금액'], ['ratio', '수익성']].map(([k, label]) => (
                      <button key={k} onClick={() => setTrendTab(k)}
                        style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', transition: 'background 0.2s ease',
                          background: trendTab === k ? 'white' : 'transparent', color: trendTab === k ? '#0f172a' : '#94a3b8', boxShadow: trendTab === k ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>{label}</button>
                    ))}
                  </div>
                </div>
                <ResponsiveContainer width="100%" height={230}>
                  {trendTab === 'amount' ? (
                    <BarChart data={chartData} margin={{ top: 4, right: 0, left: -12, bottom: 0 }}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="year" {...AXIS} />
                      <YAxis {...AXIS} tickFormatter={fmtAxis} />
                      <Tooltip {...TIP} formatter={unitTip} />
                      <Legend {...LEGEND} />
                      <ReferenceLine y={0} stroke="#cbd5e1" />
                      <Bar dataKey="매출액" fill="#c7d2fe" radius={[4, 4, 0, 0]} maxBarSize={24} />
                      <Bar dataKey="영업이익" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={24} />
                      <Bar dataKey="당기순이익" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={24} />
                    </BarChart>
                  ) : (
                    <BarChart data={ratioData} margin={{ top: 4, right: 0, left: -18, bottom: 0 }}>
                      <CartesianGrid {...GRID} />
                      <XAxis dataKey="year" {...AXIS} />
                      <YAxis {...AXIS} unit="%" />
                      <Tooltip {...TIP} formatter={unitTip} />
                      <Legend {...LEGEND} />
                      <ReferenceLine y={0} stroke="#cbd5e1" />
                      <Bar dataKey="ROE" fill="#6366f1" radius={[4, 4, 0, 0]} maxBarSize={18} />
                      <Bar dataKey="영업이익률" fill="#10b981" radius={[4, 4, 0, 0]} maxBarSize={18} />
                      <Bar dataKey="순이익률" fill="#f59e0b" radius={[4, 4, 0, 0]} maxBarSize={18} />
                    </BarChart>
                  )}
                </ResponsiveContainer>
                {trendTab === 'amount' && <p style={{ fontSize: 10, color: '#94a3b8', margin: '4px 0 0' }}>단위: {chartUnitLabel}</p>}
              </motion.div>
            )}

            {/* 재무제표 표 */}
            <motion.div {...fade} style={CARD}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                <h2 style={H2}>📋 연간 재무제표</h2>
                <button onClick={() => setShowGuide((v) => !v)}
                  style={{ fontSize: 12, fontWeight: 700, color: '#6366f1', background: '#eef2ff', border: 'none', borderRadius: 999, padding: '5px 11px', cursor: 'pointer' }}>
                  {showGuide ? '설명 닫기' : '지표 설명'}
                </button>
              </div>
              {showGuide && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} style={{ background: '#f8fafc', borderRadius: 14, padding: '4px 12px', marginBottom: 10 }}>
                  {GUIDE.map(([name, formula, desc], i) => (
                    <div key={name} style={{ padding: '9px 0', borderTop: i ? '1px solid #eef2f7' : 'none' }}>
                      <p style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', margin: '0 0 2px' }}>{name} <span style={{ fontWeight: 500, color: '#94a3b8' }}>= {formula}</span></p>
                      <p style={{ fontSize: 12, color: '#475569', margin: 0, lineHeight: 1.5 }}>{desc}</p>
                    </div>
                  ))}
                </motion.div>
              )}
              <div style={{ overflowX: 'auto', margin: '0 -16px', padding: '0 16px' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, fontVariantNumeric: 'tabular-nums', minWidth: 'max-content' }}>
                  <thead>
                    <tr>
                      <th style={{ position: 'sticky', left: 0, background: 'white', textAlign: 'left', padding: '8px 10px 8px 0', fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>구분</th>
                      {result.summary.map((s) => <th key={s.year} style={{ textAlign: 'right', padding: '8px 0 8px 14px', fontSize: 11, color: '#94a3b8', fontWeight: 700 }}>{s.year}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {tableRows.map((row, i) => row === null ? (
                      <tr key={`sep-${i}`}><td colSpan={result.summary.length + 1} style={{ padding: 0, height: 8, borderTop: '1px solid #e2e8f0' }} /></tr>
                    ) : (
                      <tr key={row[0]} style={{ borderTop: '1px solid #f1f5f9' }}>
                        <td style={{ position: 'sticky', left: 0, background: 'white', padding: '9px 10px 9px 0', fontWeight: 700, color: '#475569', whiteSpace: 'nowrap' }}>{row[0]}</td>
                        {result.summary.map((s) => (
                          <td key={s.year} style={{ textAlign: 'right', padding: '9px 0 9px 14px', whiteSpace: 'nowrap', fontWeight: 600, color: row[2]?.(s) ? '#dc2626' : '#0f172a' }}>{row[1](s)}</td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </motion.div>
          </>
        )}
      </div>
      <style>{`
        .fin-sk { background: linear-gradient(90deg, #e9eef5 25%, #f4f7fb 50%, #e9eef5 75%); background-size: 200% 100%; animation: finSk 1.4s infinite; }
        @keyframes finSk { 0% { background-position: 200% 0; } 100% { background-position: -200% 0; } }
      `}</style>
    </main>
  );
}
