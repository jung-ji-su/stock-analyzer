'use client';

import { motion } from 'framer-motion';

export default function NewsCard({ analyzeNews, chartData, fadeUp, loading, news, newsAll, newsAnalysis, newsAnalyzing, newsError, newsLoading, setNewsAll }) {
  return (
    <>
{/* News Section — 원본 유지 */}
              {!loading && chartData && (
                <motion.div custom={4} variants={fadeUp} initial="hidden" animate="visible"
                  style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(15,23,42,0.06)', padding: 16 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                    <h3 style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', margin: 0 }}>📰 관련 뉴스</h3>
                    {news.length > 0 && !newsAnalysis && (
                      <button onClick={analyzeNews} disabled={newsAnalyzing}
                        style={{ height: 34, padding: '0 16px', background: newsAnalyzing ? '#94a3b8' : 'linear-gradient(135deg,#7c3aed,#9333ea)', color: 'white', borderRadius: 14, fontWeight: 700, fontSize: 12, border: 'none', cursor: newsAnalyzing ? 'not-allowed' : 'pointer', transition: 'all 0.2s', whiteSpace: 'nowrap' }}>
                        {newsAnalyzing ? '분석중...' : '🤖 감성분석'}
                      </button>
                    )}
                  </div>
                  {newsError && !newsAnalysis && (
                    <p style={{ fontSize: 12, color: '#dc2626', background: '#fef2f2', border: '1px solid #fecaca', borderRadius: 12, padding: '10px 12px', marginBottom: 14 }}>{newsError}</p>
                  )}
                  {newsAnalysis && (
                    <div style={{ borderRadius: 16, padding: 16, marginBottom: 12, position: 'relative', overflow: 'hidden',
                      background: newsAnalysis.sentiment === '긍정' ? 'linear-gradient(145deg,#fff1f2,#fef2f2)' : newsAnalysis.sentiment === '부정' ? 'linear-gradient(145deg,#eff6ff,#f0f9ff)' : '#f8fafc',
                      border: `1.5px solid ${newsAnalysis.sentiment === '긍정' ? '#fecaca' : newsAnalysis.sentiment === '부정' ? '#bfdbfe' : '#e2e8f0'}`,
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
                        <div>
                          <p style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.06em', textTransform: 'uppercase', fontWeight: 700, marginBottom: 4 }}>AI 뉴스 감성</p>
                          <p style={{ fontSize: 22, fontWeight: 800, color: newsAnalysis.sentiment === '긍정' ? '#dc2626' : newsAnalysis.sentiment === '부정' ? '#2563eb' : '#6b7280' }}>
                            {newsAnalysis.sentiment === '긍정' ? '😊' : newsAnalysis.sentiment === '부정' ? '😟' : '😐'} {newsAnalysis.sentiment}
                          </p>
                        </div>
                        <div style={{ textAlign: 'right', background: 'white', borderRadius: 16, padding: '10px 14px', border: '1px solid rgba(0,0,0,0.06)', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
                          <p style={{ fontSize: 10, color: '#94a3b8', marginBottom: 2 }}>감성 점수</p>
                          <p style={{ fontSize: 28, fontWeight: 800, color: '#0f172a', lineHeight: 1 }}>{newsAnalysis.score}</p>
                        </div>
                      </div>
                      <div style={{ width: '100%', background: 'rgba(255,255,255,0.6)', borderRadius: 6, height: 7, marginBottom: 12, overflow: 'hidden' }}>
                        <motion.div initial={{ width: 0 }} animate={{ width: `${newsAnalysis.score}%` }} transition={{ duration: 0.9, ease: [0.22, 1, 0.36, 1] }}
                          style={{ height: 7, borderRadius: 6, background: newsAnalysis.score >= 60 ? 'linear-gradient(90deg,#f87171,#ef4444)' : newsAnalysis.score <= 40 ? 'linear-gradient(90deg,#60a5fa,#3b82f6)' : 'linear-gradient(90deg,#9ca3af,#6b7280)' }} />
                      </div>
                      <p style={{ fontSize: 13, color: '#374151', lineHeight: 1.65, marginBottom: 10 }}>{newsAnalysis.summary}</p>
                      <p style={{ fontSize: 12, color: '#4b5563', marginBottom: 10, fontWeight: 500 }}>📊 {newsAnalysis.impact}</p>
                      <div style={{ background: '#fffbeb', border: '1px solid #fde68a', borderRadius: 12, padding: '10px 12px' }}>
                        <p style={{ fontSize: 11, fontWeight: 800, color: '#92400e', marginBottom: 4 }}>🐣 쉬운 설명</p>
                        <p style={{ fontSize: 12, color: '#78350f', lineHeight: 1.55 }}>{newsAnalysis.easyExplain}</p>
                      </div>
                    </div>
                  )}
                  {newsLoading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      {[...Array(4)].map((_, i) => (
                        <div key={i} style={{ background: 'white', borderRadius: 18, padding: '14px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
                          <div className="sk" style={{ height: 14, width: '80%' }} />
                          <div className="sk" style={{ height: 11, width: '55%' }} />
                        </div>
                      ))}
                    </div>
                  ) : news.length === 0 ? (
                    <p style={{ fontSize: 13, color: '#94a3b8', textAlign: 'center', padding: '20px 0', margin: 0 }}>📭 관련 뉴스가 없습니다</p>
                  ) : (
                    <div>
                      {(newsAll ? news : news.slice(0, 5)).map((article, i) => (
                        <a key={i} href={article.link} target="_blank" rel="noopener noreferrer"
                          style={{ display: 'block', padding: '12px 0', textDecoration: 'none', borderTop: i === 0 ? 'none' : '1px solid #f1f5f9' }}>
                          <p style={{ fontWeight: 700, color: '#0f172a', fontSize: 13, lineHeight: 1.5, marginBottom: 4 }}>{article.title}</p>
                          {article.desc && <p style={{ fontSize: 11, color: '#64748b', marginBottom: 6, lineHeight: 1.5, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{article.desc}</p>}
                          <div style={{ display: 'flex', gap: 8, fontSize: 10, color: '#94a3b8', alignItems: 'center' }}>
                            {article.press && <span style={{ background: '#f1f5f9', padding: '2px 7px', borderRadius: 20, fontWeight: 600 }}>{article.press}</span>}
                            {article.time && <span>{article.time}</span>}
                          </div>
                        </a>
                      ))}
                      {news.length > 5 && (
                        <button onClick={() => setNewsAll(v => !v)}
                          style={{ width: '100%', marginTop: 4, padding: '10px 0', borderRadius: 12, border: 'none', background: '#f8fafc', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                          {newsAll ? '접기' : `뉴스 ${news.length - 5}개 더보기`}
                        </button>
                      )}
                    </div>
                  )}
                </motion.div>
              )}
    </>
  );
}
