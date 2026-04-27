'use client';

import { useState, useEffect } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { useRouter } from 'next/navigation';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where, doc, updateDoc, deleteDoc } from 'firebase/firestore';

function addBusinessDays(date, days) {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return result;
}

function judgeResult(prediction, analyzedPrice, evalPrice) {
  if (!evalPrice || !analyzedPrice) return 'pending';
  const changeRate = (evalPrice - analyzedPrice) / analyzedPrice * 100;
  if (prediction === '상승') return changeRate > 1 ? 'hit' : 'miss';
  if (prediction === '하락') return changeRate < -1 ? 'hit' : 'miss';
  if (prediction === '횡보') return Math.abs(changeRate) <= 2 ? 'hit' : 'miss';
  return 'miss';
}

function calcAccuracy(histories) {
  const result = {
    total: { hit: 0, miss: 0, pending: 0 },
    daily: { hit: 0, miss: 0, pending: 0 },
    weekly: { hit: 0, miss: 0, pending: 0 },
    monthly: { hit: 0, miss: 0, pending: 0 },
  };
  histories.forEach(h => {
    ['daily', 'weekly', 'monthly'].forEach(key => {
      const status = h[key]?.evalStatus;
      if (!status || status === 'pending') { result[key].pending++; result.total.pending++; }
      else if (status === 'hit') { result[key].hit++; result.total.hit++; }
      else if (status === 'miss') { result[key].miss++; result.total.miss++; }
    });
  });
  const calcRate = (hit, miss) => {
    const total = hit + miss;
    return total > 0 ? Math.round((hit / total) * 100) : null;
  };
  return {
    total: { ...result.total, rate: calcRate(result.total.hit, result.total.miss) },
    daily: { ...result.daily, rate: calcRate(result.daily.hit, result.daily.miss) },
    weekly: { ...result.weekly, rate: calcRate(result.weekly.hit, result.weekly.miss) },
    monthly: { ...result.monthly, rate: calcRate(result.monthly.hit, result.monthly.miss) },
  };
}

export default function HistoryPage() {
  const { user, logout } = useAuth();
  const router = useRouter();
  const [histories, setHistories] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedHistory, setSelectedHistory] = useState(null);
  const [accuracy, setAccuracy] = useState(null);

  // 삭제 관련 state
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

  // 체크박스 토글
  const toggleCheck = (id) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // 전체 선택/해제
  const toggleAll = () => {
    if (checkedIds.size === histories.length) {
      setCheckedIds(new Set());
    } else {
      setCheckedIds(new Set(histories.map(h => h.id)));
    }
  };

  // 삭제 실행
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
    <main className="min-h-screen bg-gray-50 p-4 md:p-8 pb-24">
      <div className="max-w-3xl mx-auto">

        {/* 헤더 */}
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-xl font-bold text-gray-900">🤖 AI 분석 히스토리</h1>
          <span className="text-xs text-gray-500">👤 {user?.displayName}</span>
        </div>

        {/* 적중률 */}
        {accuracy && histories.length > 0 && (
          <div className="bg-gray-900 rounded-2xl p-5 mb-4 text-white">
            <div className="flex justify-between items-center mb-4">
              <p className="text-sm font-bold">🎯 AI 예측 적중률</p>
              <p className="text-xs text-gray-400">
                총 {accuracy.total.hit + accuracy.total.miss}건 평가완료 · {accuracy.total.pending}건 대기중
              </p>
            </div>
            <div className="flex items-center gap-4 mb-4">
              <div className="text-center">
                <p className={`text-4xl font-bold ${accuracy.total.rate === null ? 'text-gray-400' :
                  accuracy.total.rate >= 60 ? 'text-green-400' :
                  accuracy.total.rate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                  {accuracy.total.rate !== null ? `${accuracy.total.rate}%` : '-'}
                </p>
                <p className="text-xs text-gray-400 mt-1">전체 적중률</p>
              </div>
              <div className="flex-1">
                <div className="w-full bg-gray-700 rounded-full h-3 overflow-hidden">
                  <div className={`h-3 rounded-full transition-all ${accuracy.total.rate >= 60 ? 'bg-green-400' :
                    accuracy.total.rate >= 40 ? 'bg-yellow-400' : 'bg-red-400'}`}
                    style={{ width: `${accuracy.total.rate || 0}%` }} />
                </div>
                <div className="flex justify-between mt-1.5">
                  <span className="text-xs text-green-400">✅ 적중 {accuracy.total.hit}건</span>
                  <span className="text-xs text-red-400">❌ 실패 {accuracy.total.miss}건</span>
                </div>
              </div>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {[
                { label: '단기 (1일)', data: accuracy.daily },
                { label: '주간 (5일)', data: accuracy.weekly },
                { label: '월간 (20일)', data: accuracy.monthly },
              ].map(({ label, data }) => (
                <div key={label} className="bg-white bg-opacity-10 rounded-xl p-3">
                  <p className="text-xs text-gray-400 mb-1">{label}</p>
                  <p className={`text-lg font-bold ${data.rate === null ? 'text-gray-400' :
                    data.rate >= 60 ? 'text-green-400' :
                    data.rate >= 40 ? 'text-yellow-400' : 'text-red-400'}`}>
                    {data.rate !== null ? `${data.rate}%` : '대기중'}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">{data.hit}✅ {data.miss}❌ {data.pending}⏳</p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* 분석 기록 */}
        <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-5">
          {/* 헤더 + 편집/삭제 버튼 */}
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-bold text-gray-900">
              분석 기록 {histories.length > 0 && <span className="text-sm font-normal text-gray-400">({histories.length}건)</span>}
            </h3>
            {histories.length > 0 && (
              <div className="flex gap-2">
                {!editMode ? (
                  <>
                    <button
                      onClick={() => { setShowDeleteConfirm(true); setDeleteAll(true); }}
                      className="px-3 py-1.5 text-xs font-medium text-red-500 bg-red-50 rounded-lg border border-red-200">
                      전체삭제
                    </button>
                    <button
                      onClick={() => { setEditMode(true); setCheckedIds(new Set()); }}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg">
                      선택삭제
                    </button>
                  </>
                ) : (
                  <>
                    <button onClick={toggleAll}
                      className="px-3 py-1.5 text-xs font-medium text-blue-600 bg-blue-50 rounded-lg border border-blue-200">
                      {checkedIds.size === histories.length ? '전체해제' : '전체선택'}
                    </button>
                    {checkedIds.size > 0 && (
                      <button
                        onClick={() => { setShowDeleteConfirm(true); setDeleteAll(false); }}
                        className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 rounded-lg">
                        삭제 ({checkedIds.size})
                      </button>
                    )}
                    <button onClick={() => { setEditMode(false); setCheckedIds(new Set()); }}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-100 rounded-lg">
                      취소
                    </button>
                  </>
                )}
              </div>
            )}
          </div>

          {loading ? (
            <p className="text-center text-gray-400 py-8">불러오는 중...</p>
          ) : histories.length === 0 ? (
            <div className="text-center py-10">
              <p className="text-gray-400 text-sm">AI 분석 기록이 없습니다</p>
              <p className="text-xs text-gray-300 mt-1">홈에서 종목 분석을 시작해보세요</p>
            </div>
          ) : (
            <div className="space-y-3">
              {histories.map((h) => (
                <div key={h.id} className="flex items-start gap-2">
                  {/* 체크박스 */}
                  {editMode && (
                    <button
                      onClick={() => toggleCheck(h.id)}
                      className={`mt-4 w-5 h-5 rounded-full border-2 shrink-0 flex items-center justify-center transition-colors ${
                        checkedIds.has(h.id)
                          ? 'bg-red-500 border-red-500'
                          : 'border-gray-300'
                      }`}>
                      {checkedIds.has(h.id) && <span className="text-white text-xs">✓</span>}
                    </button>
                  )}

                  <div className="flex-1 min-w-0">
                    <button
                      onClick={() => !editMode && setSelectedHistory(selectedHistory?.id === h.id ? null : h)}
                      className="w-full p-4 bg-gray-50 rounded-2xl text-left hover:bg-gray-100 transition-colors">
                      <div className="flex justify-between items-center mb-3">
                        <div className="min-w-0 flex-1 mr-3">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-bold text-gray-900 text-sm truncate">
                              {h.nameKr && h.nameKr !== h.name ? h.nameKr : h.name}
                            </p>
                            {h.nameKr && h.nameKr !== h.name && (
                              <span className="text-xs text-gray-400 truncate">{h.name}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 mt-0.5">
                            <p className="text-xs text-gray-400">{h.analyzedAtStr}</p>
                            {h.probability && (
                              <span className={`text-xs px-1.5 py-0.5 rounded-full shrink-0 ${
                                h.probability.bullish >= 60 ? 'bg-red-50 text-red-500' :
                                h.probability.bullish <= 40 ? 'bg-blue-50 text-blue-500' :
                                'bg-gray-100 text-gray-500'}`}>
                                {h.probability.bullish >= 60 ? '📈' : h.probability.bullish <= 40 ? '📉' : '➡️'} {h.probability.bullish}%
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-sm font-bold text-gray-800">{h.currentPrice?.toLocaleString()}원</p>
                          {h.confidence && <p className="text-xs text-gray-400">신뢰도 {h.confidence}%</p>}
                        </div>
                      </div>

                      <div className="flex gap-2">
                        {[{ key: 'daily', label: '단기' }, { key: 'weekly', label: '주간' }, { key: 'monthly', label: '월간' }].map(({ key, label }) => {
                          const pred = h[key];
                          const status = pred?.evalStatus;
                          return (
                            <div key={key} className={`flex-1 rounded-xl p-2 text-center ${
                              status === 'hit' ? 'bg-green-50 border border-green-200' :
                              status === 'miss' ? 'bg-red-50 border border-red-200' :
                              'bg-white border border-gray-100'}`}>
                              <p className="text-xs text-gray-400">{label}</p>
                              <p className={`text-xs font-bold ${
                                pred?.prediction === '상승' ? 'text-red-500' :
                                pred?.prediction === '하락' ? 'text-blue-500' : 'text-gray-500'}`}>
                                {pred?.prediction || '-'}
                              </p>
                              <p className="text-sm font-bold mt-0.5">
                                {status === 'hit' ? '✅' : status === 'miss' ? '❌' : '⏳'}
                              </p>
                              {pred?.evalPrice && (
                                <p className="text-xs text-gray-400 mt-0.5">→ {pred.evalPrice.toLocaleString()}원</p>
                              )}
                              {status === 'pending' && pred?.evalDueAt && (
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {new Date(pred.evalDueAt) > new Date()
                                    ? `D-${Math.ceil((new Date(pred.evalDueAt) - new Date()) / (1000 * 60 * 60 * 24))}`
                                    : '평가중'}
                                </p>
                              )}
                            </div>
                          );
                        })}
                      </div>

                      {!editMode && (
                        <p className="text-xs text-gray-400 mt-2 text-right">
                          {selectedHistory?.id === h.id ? '▲ 닫기' : '▼ 상세보기'}
                        </p>
                      )}
                    </button>

                    {/* 상세 */}
                    {!editMode && selectedHistory?.id === h.id && (
                      <div className="mt-2 p-4 border border-gray-200 rounded-2xl bg-white space-y-3">
                        {h.probability && (
                          <div className="bg-gray-900 rounded-xl p-3 text-white">
                            <p className="text-xs text-gray-400 mb-2">📊 퀀트 분석 결과</p>
                            <div className="flex justify-between items-center mb-2">
                              <span className="text-sm text-red-400">상승 {h.probability.bullish}%</span>
                              <span className="text-sm text-blue-400">하락 {h.probability.bearish}%</span>
                            </div>
                            <div className="w-full bg-gray-700 rounded-full h-2 mb-2 overflow-hidden">
                              <div className="h-2 bg-gradient-to-r from-red-500 to-red-400 rounded-full"
                                style={{ width: `${h.probability.bullish}%` }} />
                            </div>
                            <div className="grid grid-cols-3 gap-2">
                              <div className="bg-white bg-opacity-10 rounded-lg p-2 text-center">
                                <p className="text-xs text-gray-400">신뢰도</p>
                                <p className="text-sm font-bold text-green-400">{h.confidence}%</p>
                              </div>
                              <div className="bg-white bg-opacity-10 rounded-lg p-2 text-center">
                                <p className="text-xs text-gray-400">기술지표</p>
                                <p className={`text-sm font-bold ${(h.indicatorScore || 0) >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
                                  {(h.indicatorScore || 0) >= 0 ? '+' : ''}{h.indicatorScore || 0}
                                </p>
                              </div>
                              <div className="bg-white bg-opacity-10 rounded-lg p-2 text-center">
                                <p className="text-xs text-gray-400">뉴스감성</p>
                                <p className={`text-sm font-bold ${(h.newsScore || 0) >= 0 ? 'text-red-400' : 'text-blue-400'}`}>
                                  {(h.newsScore || 0) >= 0 ? '+' : ''}{h.newsScore || 0}
                                </p>
                              </div>
                            </div>
                          </div>
                        )}

                        {h.keySignals && h.keySignals.length > 0 && (
                          <div>
                            <p className="text-xs font-bold text-gray-700 mb-2">핵심 신호</p>
                            <div className="space-y-1">
                              {h.keySignals.map((signal, i) => (
                                <div key={i} className="flex items-center gap-2">
                                  <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${signal.type === 'bullish' ? 'bg-red-400' : 'bg-blue-400'}`} />
                                  <span className="text-xs text-gray-600">{signal.label}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )}

                        <div>
                          <p className="text-xs font-bold text-gray-700 mb-1">📋 종합 분석</p>
                          <p className="text-xs text-gray-600 leading-relaxed">{h.summary}</p>
                        </div>

                        {[
                          { key: 'daily', label: '단기 예측 (1 영업일)' },
                          { key: 'weekly', label: '주간 예측 (5 영업일)' },
                          { key: 'monthly', label: '월간 예측 (20 영업일)' },
                        ].map(({ key, label }) => {
                          const pred = h[key];
                          const status = pred?.evalStatus;
                          return (
                            <div key={key} className={`rounded-xl p-3 ${
                              status === 'hit' ? 'bg-green-50 border border-green-200' :
                              status === 'miss' ? 'bg-red-50 border border-red-200' : 'bg-gray-50'}`}>
                              <div className="flex justify-between items-center mb-1">
                                <p className="text-xs font-bold text-gray-700">{label}</p>
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-full bg-white ${
                                  status === 'hit' ? 'text-green-600' :
                                  status === 'miss' ? 'text-red-600' : 'text-gray-400'}`}>
                                  {status === 'hit' ? '✅ 적중' : status === 'miss' ? '❌ 빗나감' : '⏳ 대기중'}
                                </span>
                              </div>
                              <div className="flex gap-2 items-center mb-1">
                                <span className={`text-sm font-bold ${
                                  pred?.prediction === '상승' ? 'text-red-500' :
                                  pred?.prediction === '하락' ? 'text-blue-500' : 'text-gray-500'}`}>
                                  {pred?.prediction}
                                </span>
                                <span className="text-xs text-gray-400">목표가: {pred?.targetPrice?.toLocaleString()}원</span>
                                <span className="text-xs text-gray-400">신뢰도: {pred?.confidence}%</span>
                              </div>
                              {pred?.evalPrice && (
                                <p className="text-xs text-gray-500 mb-1">
                                  평가 시 실제가: {pred.evalPrice.toLocaleString()}원
                                  ({((pred.evalPrice - h.currentPrice) / h.currentPrice * 100).toFixed(2)}%)
                                </p>
                              )}
                              {pred?.evalDueAt && status === 'pending' && (
                                <p className="text-xs text-gray-400 mb-1">
                                  평가 예정: {new Date(pred.evalDueAt).toLocaleDateString('ko-KR')}
                                </p>
                              )}
                              <p className="text-xs text-gray-500 leading-relaxed">{pred?.reason}</p>
                            </div>
                          );
                        })}

                        <button
                          onClick={() => router.push(`/?stock=${h.symbol}&name=${encodeURIComponent(h.name)}`)}
                          className="w-full py-2 bg-blue-500 text-white rounded-xl text-xs font-medium">
                          차트 보러가기
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* 삭제 확인 모달 */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4"
          onClick={() => setShowDeleteConfirm(false)}>
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm text-center shadow-xl"
            onClick={e => e.stopPropagation()}>
            <p className="text-3xl mb-3">🗑️</p>
            <p className="font-bold text-gray-900 mb-2">
              {deleteAll ? '전체 삭제' : `${checkedIds.size}건 삭제`}
            </p>
            <p className="text-sm text-gray-500 mb-6">
              {deleteAll
                ? `분석 기록 ${histories.length}건을 모두 삭제할까요?`
                : `선택한 ${checkedIds.size}건을 삭제할까요?`}
              <br />
              <span className="text-xs text-red-400">삭제 후 복구가 불가능합니다</span>
            </p>
            <div className="flex gap-2">
              <button onClick={() => { setShowDeleteConfirm(false); setDeleteAll(false); }}
                className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-xl text-sm font-medium">
                취소
              </button>
              <button onClick={handleDelete} disabled={deleting}
                className="flex-1 py-3 bg-red-500 text-white rounded-xl text-sm font-bold disabled:opacity-60">
                {deleting ? '삭제 중...' : '삭제'}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}