'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';
import { addBusinessDays, judgeResult, calcAccuracy } from '@/lib/evalUtils';
import { motion, AnimatePresence } from 'framer-motion';

function getRatingInfo(bullish) {
  if (bullish >= 65) return { label: '강한매수', bg: '#fef2f2', color: '#dc2626', border: '#dc262628' };
  if (bullish >= 55) return { label: '매수',     bg: '#fff5f5', color: '#ef4444', border: '#ef444428' };
  if (bullish >= 45) return { label: '중립',     bg: '#f8fafc', color: '#64748b', border: '#64748b28' };
  if (bullish >= 35) return { label: '매도',     bg: '#eff6ff', color: '#3b82f6', border: '#3b82f628' };
  return               { label: '강한매도',  bg: '#eff6ff', color: '#1d4ed8', border: '#1d4ed828' };
}

const STATUS_STYLE = {
  hit:     { icon: '✅', label: '적중',  bg: 'rgba(34,197,94,0.08)',  border: '#22c55e30', color: '#16a34a' },
  miss:    { icon: '❌', label: '빗나감', bg: 'rgba(239,68,68,0.08)',  border: '#ef444430', color: '#dc2626' },
  pending: { icon: '⏳', label: null,    bg: 'rgba(245,158,11,0.06)', border: '#f59e0b28', color: '#d97706' },
};

const rateColor = (rate) =>
  rate === null ? '#94a3b8' : rate >= 60 ? '#22c55e' : rate >= 40 ? '#f59e0b' : '#ef4444';

export default function HistoryPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [histories, setHistories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [accuracy, setAccuracy] = useState(null);
  const [editMode, setEditMode] = useState(false);
  const [checkedIds, setCheckedIds] = useState(new Set());
  const [deleting, setDeleting] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deleteAll, setDeleteAll] = useState(false);

  useEffect(() => {
    if (!user) { router.push('/login'); return; }
    loadHistories();
  }, [user]);

  const loadHistories = async () => {
    setLoading(true);
    try {
      const q = query(collection(db, 'analysisHistory'), where('userId', '==', user.uid));
      const snap = await getDocs(q);
      let data = snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => {
          const aTime = a.analyzedAt?.toDate?.() || new Date(0);
          const bTime = b.analyzedAt?.toDate?.() || new Date(0);
          return bTime - aTime;
        });

      const now = new Date();
      const pendingItems = data.filter(h =>
        ['daily', 'weekly', 'monthly'].some(key =>
          h[key]?.evalStatus === 'pending' &&
          h[key]?.evalDueAt &&
          new Date(h[key].evalDueAt) <= now
        )
      );

      if (pendingItems.length > 0) {
        const symbols = [...new Set(pendingItems.map(h => h.symbol))];
        const prices = {};
        await Promise.all(symbols.map(async (symbol) => {
          try {
            const res = await fetch(`/api/stock?symbol=${symbol}&timeframe=daily`);
            const stockData = await res.json();
            if (stockData.currentPrice) prices[symbol] = stockData.currentPrice;
          } catch { }
        }));

        await Promise.all(pendingItems.map(async (h) => {
          const evalPrice = prices[h.symbol];
          if (!evalPrice) return;
          const updates = {};
          ['daily', 'weekly', 'monthly'].forEach(key => {
            if (h[key]?.evalStatus === 'pending' && h[key]?.evalDueAt && new Date(h[key].evalDueAt) <= now) {
              const status = judgeResult(h[key].prediction, h.currentPrice, evalPrice);
              updates[`${key}.evalStatus`] = status;
              updates[`${key}.evalPrice`] = evalPrice;
              updates[`${key}.evalAt`] = new Date().toISOString();
            }
          });
          if (Object.keys(updates).length > 0) {
            try {
              await updateDoc(doc(db, 'analysisHistory', h.id), updates);
              Object.keys(updates).forEach(dotKey => {
                const [period, field] = dotKey.split('.');
                if (!h[period]) h[period] = {};
                h[period][field] = updates[dotKey];
              });
            } catch (e) { console.error(e); }
          }
        }));
      }

      setHistories(data);
      setAccuracy(calcAccuracy(data));
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const toggleCheck = (id) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (checkedIds.size === histories.length) setCheckedIds(new Set());
    else setCheckedIds(new Set(histories.map(h => h.id)));
  };

  const handleDelete = async () => {
    setDeleting(true);
    try {
      const idsToDelete = deleteAll ? histories.map(h => h.id) : [...checkedIds];
      await Promise.all(idsToDelete.map(id => deleteDoc(doc(db, 'analysisHistory', id))));
      const remaining = histories.filter(h => !idsToDelete.includes(h.id));
      setHistories(remaining);
      setAccuracy(calcAccuracy(remaining));
      setCheckedIds(new Set());
      setEditMode(false);
      setShowDeleteConfirm(false);
      setDeleteAll(false);
    } catch (e) {
      console.error(e);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <main style={{ minHeight: '100vh', background: '#f8fafc', paddingBottom: 88 }}>
      <style>{`
        @keyframes shimmerAnim { 0%{background-position:-200% 0} 100%{background-position:200% 0} }
        .sk { background: linear-gradient(90deg,#f0f4f8 25%,#e2e8f0 50%,#f0f4f8 75%); background-size:200% 100%; animation:shimmerAnim 1.4s infinite; border-radius:8px; }
      `}</style>
      <div style={{ maxWidth: 480, margin: '0 auto', padding: '0 16px' }}>

        {/* ── HEADER ── */}
        <div style={{ padding: '20px 0 14px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <h1 style={{ fontSize: 22, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.5px', margin: 0 }}>
              AI 분석 기록
            </h1>
            {!loading && (
              <p style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
                총 {histories.length}건
              </p>
            )}
          </div>
          {histories.length > 0 && !loading && (
            <div style={{ display: 'flex', gap: 6, paddingTop: 4, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
              {!editMode ? (
                <>
                  <button onClick={() => { setShowDeleteConfirm(true); setDeleteAll(true); }}
                    style={{ padding: '6px 13px', fontSize: 11, fontWeight: 700, color: '#ef4444',
                      background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 20, cursor: 'pointer' }}>
                    전체삭제
                  </button>
                  <button onClick={() => { setEditMode(true); setCheckedIds(new Set()); }}
                    style={{ padding: '6px 13px', fontSize: 11, fontWeight: 700, color: '#64748b',
                      background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 20, cursor: 'pointer' }}>
                    선택삭제
                  </button>
                </>
              ) : (
                <>
                  <button onClick={toggleAll}
                    style={{ padding: '6px 13px', fontSize: 11, fontWeight: 700, color: '#3b82f6',
                      background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 20, cursor: 'pointer' }}>
                    {checkedIds.size === histories.length ? '전체해제' : '전체선택'}
                  </button>
                  {checkedIds.size > 0 && (
                    <button onClick={() => { setShowDeleteConfirm(true); setDeleteAll(false); }}
                      style={{ padding: '6px 13px', fontSize: 11, fontWeight: 700, color: 'white',
                        background: '#ef4444', borderRadius: 20, border: 'none', cursor: 'pointer' }}>
                      삭제 ({checkedIds.size})
                    </button>
                  )}
                  <button onClick={() => { setEditMode(false); setCheckedIds(new Set()); }}
                    style={{ padding: '6px 13px', fontSize: 11, fontWeight: 700, color: '#64748b',
                      background: '#f1f5f9', border: '1px solid #e2e8f0', borderRadius: 20, cursor: 'pointer' }}>
                    취소
                  </button>
                </>
              )}
            </div>
          )}
        </div>

        {/* ── ACCURACY HERO ── */}
        {accuracy && histories.length > 0 && (
          <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}
            style={{ background: '#1e293b', borderRadius: 24, padding: '20px', marginBottom: 16,
              boxShadow: '0 8px 32px rgba(15,23,42,0.18)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
              <div>
                <p style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600, marginBottom: 6 }}>🎯 AI 예측 적중률</p>
                <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                  <span style={{ fontSize: 44, fontWeight: 900, letterSpacing: '-2px', lineHeight: 1,
                    color: rateColor(accuracy.total.rate) }}>
                    {accuracy.total.rate !== null ? `${accuracy.total.rate}%` : '-'}
                  </span>
                  <span style={{ fontSize: 12, color: '#94a3b8' }}>전체</span>
                </div>
              </div>
              <div style={{ textAlign: 'right' }}>
                <p style={{ fontSize: 12, color: '#22c55e', fontWeight: 700 }}>✅ {accuracy.total.hit}건 적중</p>
                <p style={{ fontSize: 12, color: '#ef4444', fontWeight: 700, marginTop: 3 }}>❌ {accuracy.total.miss}건 실패</p>
                <p style={{ fontSize: 12, color: '#475569', marginTop: 3 }}>⏳ {accuracy.total.pending}건 대기</p>
              </div>
            </div>

            {accuracy.total.rate !== null && (
              <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 99, height: 6, marginBottom: 16, overflow: 'hidden' }}>
                <div style={{ height: '100%', borderRadius: 99, width: `${accuracy.total.rate}%`,
                  background: rateColor(accuracy.total.rate),
                  boxShadow: `2px 0 10px ${rateColor(accuracy.total.rate)}`,
                  transition: 'width 0.6s ease' }} />
              </div>
            )}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: '단기 (1일)', data: accuracy.daily },
                { label: '주간 (5일)', data: accuracy.weekly },
                { label: '월간 (20일)', data: accuracy.monthly },
              ].map(({ label, data }) => (
                <div key={label} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 14, padding: '10px 8px', textAlign: 'center' }}>
                  <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 4 }}>{label}</p>
                  <p style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px', color: rateColor(data.rate) }}>
                    {data.rate !== null ? `${data.rate}%` : '-'}
                  </p>
                  <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 4 }}>
                    {data.hit}✅ {data.miss}❌ {data.pending}⏳
                  </p>
                </div>
              ))}
            </div>
          </motion.div>
        )}

        {/* ── LIST ── */}
        {loading ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {[...Array(4)].map((_, i) => (
              <div key={i} style={{ background: 'white', borderRadius: 20, padding: 16,
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                <div className="sk" style={{ height: 11, width: '30%', borderRadius: 6, marginBottom: 10 }} />
                <div className="sk" style={{ height: 20, width: '50%', borderRadius: 6, marginBottom: 14 }} />
                <div style={{ display: 'flex', gap: 8 }}>
                  {[...Array(3)].map((_, j) => (
                    <div key={j} className="sk" style={{ flex: 1, height: 68, borderRadius: 14 }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
        ) : histories.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '64px 20px' }}>
            <div style={{ fontSize: 52, marginBottom: 14 }}>🤖</div>
            <p style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>분석 기록이 없어요</p>
            <p style={{ fontSize: 13, color: '#94a3b8', marginBottom: 28, lineHeight: 1.6 }}>
              홈에서 종목을 분석하면<br />여기에 기록됩니다
            </p>
            <button onClick={() => router.push('/')}
              style={{ padding: '12px 28px', background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                color: 'white', borderRadius: 22, fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer',
                boxShadow: '0 4px 16px rgba(99,102,241,0.4)' }}>
              분석하러 가기
            </button>
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {histories.map((h, idx) => {
              const r = getRatingInfo(h.probability?.bullish ?? 50);
              const displayName = (h.nameKr && h.nameKr !== h.name) ? h.nameKr : h.name;
              const isExpanded = selectedHistory?.id === h.id;

              return (
                <motion.div key={h.id}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: Math.min(idx * 0.05, 0.3), duration: 0.22, ease: 'easeOut' }}
                  style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>

                  {/* 체크박스 */}
                  {editMode && (
                    <button onClick={() => toggleCheck(h.id)}
                      style={{ marginTop: 18, width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        background: checkedIds.has(h.id) ? '#ef4444' : 'transparent',
                        border: `2px solid ${checkedIds.has(h.id) ? '#ef4444' : '#cbd5e1'}`,
                        cursor: 'pointer', transition: 'all 0.15s' }}>
                      {checkedIds.has(h.id) && <span style={{ color: 'white', fontSize: 12, fontWeight: 700 }}>✓</span>}
                    </button>
                  )}

                  <div style={{ flex: 1, minWidth: 0 }}>
                    {/* ── CARD ── */}
                    <motion.div
                      whileTap={!editMode ? { scale: 0.99 } : {}}
                      onClick={() => !editMode && setSelectedHistory(isExpanded ? null : h)}
                      style={{ background: 'white', borderRadius: 20, padding: '14px 16px',
                        boxShadow: isExpanded ? '0 6px 24px rgba(0,0,0,0.10)' : '0 2px 8px rgba(0,0,0,0.06)',
                        border: isExpanded ? `1.5px solid ${r.color}35` : '1.5px solid #f1f5f9',
                        cursor: editMode ? 'default' : 'pointer',
                        transition: 'box-shadow 0.2s, border-color 0.2s' }}>

                      {/* Row 1: 날짜 + 의견배지 */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 500 }}>{h.analyzedAtStr}</span>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          {h.confidence && (
                            <span style={{ fontSize: 10, color: '#94a3b8' }}>신뢰도 {h.confidence}%</span>
                          )}
                          <span style={{ padding: '3px 10px', borderRadius: 20, fontSize: 11, fontWeight: 800,
                            background: r.bg, color: r.color, border: `1px solid ${r.border}` }}>
                            {r.label}
                          </span>
                        </div>
                      </div>

                      {/* Row 2: 종목명 + 분석가 */}
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12 }}>
                        <div style={{ minWidth: 0, flex: 1, marginRight: 12 }}>
                          <p style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', letterSpacing: '-0.3px',
                            whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {displayName}
                          </p>
                          {h.nameKr && h.nameKr !== h.name && (
                            <p style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{h.name}</p>
                          )}
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0 }}>
                          <p style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                            {h.currentPrice?.toLocaleString()}원
                          </p>
                          {h.probability && (
                            <p style={{ fontSize: 11, color: r.color, fontWeight: 700, marginTop: 1 }}>
                              상승 {h.probability.bullish}%
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Row 3: 단기/주간/월간 */}
                      <div style={{ display: 'flex', gap: 7 }}>
                        {[
                          { key: 'daily', label: '단기' },
                          { key: 'weekly', label: '주간' },
                          { key: 'monthly', label: '월간' },
                        ].map(({ key, label }) => {
                          const pred = h[key];
                          const status = pred?.evalStatus || 'pending';
                          const s = STATUS_STYLE[status] ?? STATUS_STYLE.pending;
                          const dDay = status === 'pending' && pred?.evalDueAt
                            ? Math.max(0, Math.ceil((new Date(pred.evalDueAt) - new Date()) / 86400000))
                            : null;
                          return (
                            <div key={key} style={{ flex: 1, borderRadius: 14, padding: '8px 6px', textAlign: 'center',
                              background: s.bg, border: `1px solid ${s.border}` }}>
                              <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>{label}</p>
                              <p style={{ fontSize: 12, fontWeight: 800, marginBottom: 2,
                                color: pred?.prediction === '상승' ? '#ef4444' : pred?.prediction === '하락' ? '#3b82f6' : '#64748b' }}>
                                {pred?.prediction || '-'}
                              </p>
                              <p style={{ fontSize: 13 }}>{s.icon}</p>
                              {status === 'pending' && dDay !== null && (
                                <p style={{ fontSize: 10, color: s.color, fontWeight: 700, marginTop: 1 }}>D-{dDay}</p>
                              )}
                              {status !== 'pending' && pred?.evalPrice && (
                                <p style={{ fontSize: 10, color: '#94a3b8', marginTop: 1 }}>
                                  {pred.evalPrice.toLocaleString()}원
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {/* 상세보기 힌트 */}
                      {!editMode && (
                        <p style={{ fontSize: 10, color: '#cbd5e1', textAlign: 'center', marginTop: 10 }}>
                          {isExpanded ? '▲ 닫기' : '▼ 상세보기'}
                        </p>
                      )}
                    </motion.div>

                    {/* ── 상세 확장 ── */}
                    <AnimatePresence>
                      {!editMode && isExpanded && (
                        <motion.div
                          initial={{ height: 0, opacity: 0 }}
                          animate={{ height: 'auto', opacity: 1 }}
                          exit={{ height: 0, opacity: 0 }}
                          transition={{ duration: 0.22, ease: 'easeInOut' }}
                          style={{ overflow: 'hidden' }}>
                          <div style={{ marginTop: 8, background: 'white', borderRadius: 20, padding: '16px',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>

                            {/* 퀀트 분석 */}
                            {h.probability && (
                              <div style={{ background: '#1e293b', borderRadius: 16, padding: '14px 16px', marginBottom: 12 }}>
                                <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 10 }}>📊 퀀트 분석</p>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                                  <span style={{ fontSize: 12, color: '#ef4444', fontWeight: 700 }}>상승 {h.probability.bullish}%</span>
                                  <span style={{ fontSize: 12, color: '#3b82f6', fontWeight: 700 }}>하락 {h.probability.bearish}%</span>
                                </div>
                                <div style={{ background: 'rgba(255,255,255,0.08)', borderRadius: 99, height: 5, marginBottom: 12, overflow: 'hidden' }}>
                                  <div style={{ height: '100%', width: `${h.probability.bullish}%`, borderRadius: 99,
                                    background: 'linear-gradient(90deg,#ef4444,#f87171)' }} />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
                                  {[
                                    { label: '신뢰도', value: h.confidence != null ? `${h.confidence}%` : '-', positive: (h.confidence ?? 0) >= 50 },
                                    { label: '기술지표', value: h.indicatorScore != null ? `${h.indicatorScore >= 0 ? '+' : ''}${h.indicatorScore}` : '-', positive: (h.indicatorScore ?? 0) >= 0 },
                                    { label: '뉴스감성', value: h.newsScore != null ? `${h.newsScore >= 0 ? '+' : ''}${h.newsScore}` : '-', positive: (h.newsScore ?? 0) >= 0 },
                                  ].map(({ label, value, positive }) => (
                                    <div key={label} style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 10, padding: '8px 6px', textAlign: 'center' }}>
                                      <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 3 }}>{label}</p>
                                      <p style={{ fontSize: 15, fontWeight: 800, color: positive ? '#22c55e' : '#ef4444' }}>{value}</p>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 핵심 신호 */}
                            {h.keySignals?.length > 0 && (
                              <div style={{ marginBottom: 12 }}>
                                <p style={{ fontSize: 11, fontWeight: 800, color: '#374151', marginBottom: 8 }}>핵심 신호</p>
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                                  {h.keySignals.slice(0, 5).map((signal, i) => (
                                    <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                                      <div style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                                        background: signal.type === 'bullish' ? '#ef4444' : '#3b82f6' }} />
                                      <span style={{ fontSize: 12, color: '#475569', lineHeight: 1.4 }}>{signal.label}</span>
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}

                            {/* 종합 분석 요약 */}
                            {h.summary && (
                              <div style={{ marginBottom: 12, padding: '10px 12px', background: '#f8fafc', borderRadius: 12,
                                border: '1px solid #e2e8f0' }}>
                                <p style={{ fontSize: 11, fontWeight: 700, color: '#374151', marginBottom: 5 }}>📋 종합 분석</p>
                                <p style={{ fontSize: 12, color: '#64748b', lineHeight: 1.6, margin: 0 }}>{h.summary}</p>
                              </div>
                            )}

                            {/* 기간별 상세 */}
                            {[
                              { key: 'daily', label: '단기 예측 (1 영업일)' },
                              { key: 'weekly', label: '주간 예측 (5 영업일)' },
                              { key: 'monthly', label: '월간 예측 (20 영업일)' },
                            ].map(({ key, label }) => {
                              const pred = h[key];
                              const status = pred?.evalStatus;
                              const s = STATUS_STYLE[status] ?? STATUS_STYLE.pending;
                              const pct = pred?.evalPrice
                                ? ((pred.evalPrice - h.currentPrice) / h.currentPrice * 100)
                                : null;
                              return (
                                <div key={key} style={{ marginBottom: 8, padding: '12px', borderRadius: 14,
                                  background: s.bg, border: `1px solid ${s.border}` }}>
                                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                    <p style={{ fontSize: 11, fontWeight: 700, color: '#374151' }}>{label}</p>
                                    <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20,
                                      background: 'white', color: s.color, border: `1px solid ${s.border}` }}>
                                      {s.icon} {s.label ?? '대기중'}
                                    </span>
                                  </div>
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 4 }}>
                                    <span style={{ fontSize: 14, fontWeight: 800,
                                      color: pred?.prediction === '상승' ? '#ef4444' : pred?.prediction === '하락' ? '#3b82f6' : '#64748b' }}>
                                      {pred?.prediction || '-'}
                                    </span>
                                    {pred?.targetPrice && (
                                      <span style={{ fontSize: 11, color: '#94a3b8' }}>
                                        목표가 {pred.targetPrice.toLocaleString()}원
                                      </span>
                                    )}
                                    {pred?.confidence && (
                                      <span style={{ fontSize: 11, color: '#94a3b8' }}>신뢰도 {pred.confidence}%</span>
                                    )}
                                  </div>
                                  {pct !== null && (
                                    <p style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>
                                      평가가: {pred.evalPrice.toLocaleString()}원
                                      <span style={{ marginLeft: 4, fontWeight: 700, color: pct >= 0 ? '#ef4444' : '#3b82f6' }}>
                                        ({pct >= 0 ? '+' : ''}{pct.toFixed(2)}%)
                                      </span>
                                    </p>
                                  )}
                                  {pred?.evalDueAt && !pred?.evalPrice && (
                                    <p style={{ fontSize: 11, color: '#94a3b8', marginBottom: 4 }}>
                                      평가 예정: {new Date(pred.evalDueAt).toLocaleDateString('ko-KR')}
                                    </p>
                                  )}
                                  {pred?.reason && (
                                    <p style={{ fontSize: 11, color: '#64748b', lineHeight: 1.5, marginTop: 2 }}>{pred.reason}</p>
                                  )}
                                </div>
                              );
                            })}

                            {/* 차트 이동 */}
                            <button onClick={() => router.push(`/?symbol=${h.symbol}`)}
                              style={{ width: '100%', padding: '11px', marginTop: 4,
                                background: 'linear-gradient(135deg,#6366f1,#8b5cf6)',
                                color: 'white', borderRadius: 14, fontWeight: 700, fontSize: 13,
                                border: 'none', cursor: 'pointer',
                                boxShadow: '0 4px 12px rgba(99,102,241,0.3)' }}>
                              📈 차트 보러가기
                            </button>
                          </div>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── 삭제 확인 모달 ── */}
      <AnimatePresence>
        {showDeleteConfirm && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.5)', backdropFilter: 'blur(4px)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50, padding: 16 }}
            onClick={() => setShowDeleteConfirm(false)}>
            <motion.div initial={{ scale: 0.92, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }} transition={{ duration: 0.18 }}
              style={{ background: 'white', borderRadius: 24, padding: '28px 24px', width: '100%', maxWidth: 320, textAlign: 'center' }}
              onClick={e => e.stopPropagation()}>
              <p style={{ fontSize: 40, marginBottom: 12 }}>🗑️</p>
              <p style={{ fontSize: 16, fontWeight: 800, color: '#0f172a', marginBottom: 6 }}>
                {deleteAll ? '전체 삭제' : `${checkedIds.size}건 삭제`}
              </p>
              <p style={{ fontSize: 13, color: '#64748b', marginBottom: 4 }}>
                {deleteAll
                  ? `분석 기록 ${histories.length}건을 모두 삭제할까요?`
                  : `선택한 ${checkedIds.size}건을 삭제할까요?`}
              </p>
              <p style={{ fontSize: 11, color: '#ef4444', marginBottom: 24 }}>삭제 후 복구가 불가능합니다</p>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => { setShowDeleteConfirm(false); setDeleteAll(false); }}
                  style={{ flex: 1, padding: '12px', background: '#f1f5f9', color: '#374151',
                    borderRadius: 14, fontSize: 14, fontWeight: 600, border: 'none', cursor: 'pointer' }}>
                  취소
                </button>
                <button onClick={handleDelete} disabled={deleting}
                  style={{ flex: 1, padding: '12px', background: '#ef4444', color: 'white',
                    borderRadius: 14, fontSize: 14, fontWeight: 800, border: 'none', cursor: 'pointer',
                    opacity: deleting ? 0.6 : 1 }}>
                  {deleting ? '삭제 중...' : '삭제'}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </main>
  );
}
