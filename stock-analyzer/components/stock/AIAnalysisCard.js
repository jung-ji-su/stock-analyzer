'use client';

import { motion } from 'framer-motion';

export default function AIAnalysisCard({ analysis, analysisCache, analyzing, chartData, fadeUp, handleAnalyze, loading, selectedStock, us }) {
  return (
    <>
{/* AI Analysis Section — 원본 유지 */}
              {!loading && chartData && (
                <motion.div custom={3} variants={fadeUp} initial="hidden" animate="visible"
                  style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(15,23,42,0.06)', padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: analysis ? 14 : 0 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 }}>🤖 AI 분석</h3>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {analysisCache[selectedStock?.symbol] && (
                        <span style={{ fontSize: 10, color: '#94a3b8' }}>🕐 {analysisCache[selectedStock?.symbol]?.analyzedAt}</span>
                      )}
                      <button onClick={handleAnalyze} disabled={analyzing}
                        style={{ height: 34, padding: '0 16px', background: analyzing ? '#94a3b8' : 'linear-gradient(135deg,#6366f1,#8b5cf6)', color: 'white', borderRadius: 14, fontWeight: 700, fontSize: 12, border: 'none', cursor: analyzing ? 'not-allowed' : 'pointer', boxShadow: analyzing ? 'none' : '0 4px 14px rgba(99,102,241,0.35)', transition: 'all 0.2s', whiteSpace: 'nowrap' }}>
                        {analyzing ? '분석중...' : analysis ? '🔄 재분석' : '🤖 분석 시작'}
                      </button>
                    </div>
                  </div>

                  {analysis && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                      {/* ... (원본 analysis 렌더 코드 그대로) ... */}
                      <div style={{ background: 'linear-gradient(145deg,#0f172a,#1e293b)', borderRadius: 16, padding: '18px 16px' }}>
                        <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 14, fontWeight: 700 }}>📊 퀀트 분석 결과</p>
                        {analysis.probability && (
                          <div style={{ marginBottom: 18 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 8 }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#f87171' }} />
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#fca5a5' }}>상승 {analysis.probability.bullish}%</span>
                              </div>
                              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                <span style={{ fontSize: 12, fontWeight: 700, color: '#93c5fd' }}>하락 {analysis.probability.bearish}%</span>
                                <div style={{ width: 8, height: 8, borderRadius: '50%', background: '#60a5fa' }} />
                              </div>
                            </div>
                            <div style={{ width: '100%', background: 'rgba(255,255,255,0.08)', borderRadius: 8, height: 10, overflow: 'hidden' }}>
                              <motion.div initial={{ width: 0 }} animate={{ width: `${analysis.probability.bullish}%` }}
                                transition={{ duration: 0.9, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                                style={{ height: 10, background: 'linear-gradient(90deg,#ef4444,#f97316)', borderRadius: 8 }} />
                            </div>
                          </div>
                        )}
                        <div style={{ background: 'rgba(255,255,255,0.06)', borderRadius: 16, padding: '14px', textAlign: 'center', marginBottom: 16, border: '1px solid rgba(255,255,255,0.06)' }}>
                          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', marginBottom: 6, letterSpacing: '0.06em' }}>AI 신뢰도</p>
                          <motion.p key={analysis.confidence} initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} transition={{ duration: 0.5, delay: 0.2 }}
                            style={{ fontSize: 36, fontWeight: 800, color: '#34d399', lineHeight: 1 }}>
                            {analysis.confidence}<span style={{ fontSize: 18 }}>%</span>
                          </motion.p>
                          {analysis.scoreBreakdown?.atrRatio > 3 && (
                            <p style={{ fontSize: 11, color: '#fbbf24', marginTop: 6 }}>⚡ 변동성 높음 ({analysis.scoreBreakdown.atrRatio}%)</p>
                          )}
                        </div>
                        {analysis.scoreBreakdown && (
                          <div style={{ marginBottom: 16 }}>
                            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 10, letterSpacing: '0.06em' }}>레이어별 점수</p>
                            {[
                              { label: '퀀트팩터', score: analysis.scoreBreakdown.quant?.score, weight: analysis.scoreBreakdown.quant?.weight, color: '#a78bfa' },
                              { label: '기술지표', score: analysis.scoreBreakdown.tech?.score, weight: analysis.scoreBreakdown.tech?.weight, color: '#60a5fa' },
                              { label: '뉴스감성', score: analysis.scoreBreakdown.news?.score, weight: analysis.scoreBreakdown.news?.weight, color: '#34d399' },
                              ...(analysis.scoreBreakdown.supply ? [{ label: analysis.scoreBreakdown.supply.label || '수급', score: analysis.scoreBreakdown.supply.score, weight: analysis.scoreBreakdown.supply.weight, color: '#fbbf24' }] : []),
                            ].map(({ label, score, weight, color }) => {
                              const barWidth = Math.min(Math.abs(score || 0) / 10 * 100, 100);
                              const isPositive = (score || 0) >= 0;
                              return (
                                <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                                  <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', width: 58, flexShrink: 0 }}>{label}</span>
                                  <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.2)', width: 26, flexShrink: 0 }}>{weight}</span>
                                  <div style={{ flex: 1, background: 'rgba(255,255,255,0.08)', borderRadius: 4, height: 5, overflow: 'hidden' }}>
                                    <motion.div initial={{ width: 0 }} animate={{ width: `${barWidth}%` }} transition={{ duration: 0.7, delay: 0.4 }}
                                      style={{ height: 5, borderRadius: 4, background: isPositive ? color : 'rgba(255,255,255,0.12)' }} />
                                  </div>
                                  <span style={{ fontSize: 11, fontWeight: 700, width: 28, textAlign: 'right', flexShrink: 0, color: isPositive ? '#fca5a5' : '#93c5fd' }}>
                                    {(score || 0) >= 0 ? '+' : ''}{score || 0}
                                  </span>
                                </div>
                              );
                            })}
                          </div>
                        )}
                        {analysis.keySignals?.length > 0 && (
                          <div>
                            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)', marginBottom: 10, letterSpacing: '0.06em' }}>핵심 신호</p>
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                              {analysis.keySignals.map((signal, i) => (
                                <div key={i} style={{ background: 'rgba(255,255,255,0.04)', borderRadius: 12, padding: '10px 12px', border: '1px solid rgba(255,255,255,0.05)' }}>
                                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: signal.easy ? 6 : 0 }}>
                                    <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: signal.type === 'bullish' ? '#f87171' : '#60a5fa' }} />
                                    <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.8)', flex: 1, fontWeight: 500 }}>{signal.label}</span>
                                    <span style={{ fontSize: 12, fontWeight: 800, color: signal.type === 'bullish' ? '#fca5a5' : '#93c5fd' }}>{signal.score >= 0 ? '+' : ''}{signal.score}</span>
                                  </div>
                                  {signal.easy && <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', lineHeight: 1.45, paddingLeft: 16 }}>💡 {signal.easy}</p>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                        {analysis.quantInsight && (
                          <div style={{ marginTop: 14, background: 'rgba(99,102,241,0.18)', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(99,102,241,0.2)' }}>
                            <p style={{ fontSize: 10, fontWeight: 700, color: '#a5b4fc', marginBottom: 5, letterSpacing: '0.04em' }}>📐 퀀트 한줄 요약</p>
                            <p style={{ fontSize: 12, color: 'rgba(165,180,252,0.9)', lineHeight: 1.55 }}>{analysis.quantInsight}</p>
                          </div>
                        )}
                        {analysis.riskWarning && (
                          <div style={{ marginTop: 10, background: 'rgba(245,158,11,0.12)', borderRadius: 14, padding: '12px 14px', border: '1px solid rgba(245,158,11,0.2)' }}>
                            <p style={{ fontSize: 10, fontWeight: 700, color: '#fcd34d', marginBottom: 5, letterSpacing: '0.04em' }}>⚠️ 주의사항</p>
                            <p style={{ fontSize: 12, color: 'rgba(253,211,77,0.85)', lineHeight: 1.55 }}>{analysis.riskWarning}</p>
                          </div>
                        )}
                      </div>
                      {/* 기간별 전망 + 요약 */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                        {[['daily', '내일', 1], ['weekly', '1주', 2], ['monthly', '1개월', 4]].map(([k, label, band]) => {
                          const p = analysis[k];
                          if (!p?.prediction) return null;
                          const c = p.prediction === '상승' ? '#ef4444' : p.prediction === '하락' ? '#3b82f6' : '#64748b';
                          return (
                            <div key={k} style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16, padding: '12px 14px' }}>
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6 }}>
                                <span style={{ fontSize: 12, fontWeight: 800, color: '#0f172a' }}>{label} <span style={{ fontWeight: 500, color: '#94a3b8' }}>(기준 ±{band}%)</span></span>
                                <span style={{ fontSize: 13, fontWeight: 800, color: c }}>{p.prediction} <span style={{ fontSize: 11, fontWeight: 600, color: '#64748b' }}>{p.confidence}%</span></span>
                              </div>
                              {p.probs && (
                                <div style={{ display: 'flex', height: 5, borderRadius: 3, overflow: 'hidden', marginBottom: 6 }}>
                                  <div style={{ width: `${p.probs.up}%`, background: '#ef4444' }} />
                                  <div style={{ width: `${p.probs.side}%`, background: '#cbd5e1' }} />
                                  <div style={{ width: `${p.probs.down}%`, background: '#3b82f6' }} />
                                </div>
                              )}
                              <p style={{ fontSize: 11, color: '#64748b', margin: '0 0 6px' }}>
                                목표 {us ? `$${Number(p.targetPrice).toFixed(2)}` : `${Math.round(p.targetPrice).toLocaleString()}원`}
                                {p.probs && ` · 상승 ${p.probs.up}% / 횡보 ${p.probs.side}% / 하락 ${p.probs.down}%`}
                              </p>
                              {p.reason && <p style={{ fontSize: 12, color: '#334155', lineHeight: 1.55, margin: 0 }}>{p.reason}</p>}
                              {p.easyReason && <p style={{ fontSize: 12, color: '#92400e', lineHeight: 1.55, margin: '6px 0 0' }}>💡 {p.easyReason}</p>}
                            </div>
                          );
                        })}
                        {(analysis.summary || analysis.easySummary) && (
                          <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 16, padding: '12px 14px' }}>
                            <p style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', margin: '0 0 6px' }}>📝 종합</p>
                            {analysis.summary && <p style={{ fontSize: 12, color: '#334155', lineHeight: 1.6, margin: 0 }}>{analysis.summary}</p>}
                            {analysis.easySummary && <p style={{ fontSize: 12, color: '#92400e', lineHeight: 1.6, margin: '6px 0 0' }}>💡 {analysis.easySummary}</p>}
                          </div>
                        )}
                      </div>
                      <div style={{ background: '#fffbeb', border: '1.5px solid #fde68a', borderRadius: 16, padding: '12px 16px', fontSize: 12, color: '#92400e', lineHeight: 1.55 }}>
                        ⚠️ 본 분석은 AI 기반 기술적 분석으로 투자 권유가 아닙니다. 투자 판단은 본인 책임입니다.
                      </div>
                    </div>
                  )}
                </motion.div>
              )}

    </>
  );
}
