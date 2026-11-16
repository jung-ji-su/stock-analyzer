'use client';

import MarketIndicators from '@/components/MarketIndicators';
import { isUsStock } from '@/lib/toss';
import { motion } from 'framer-motion';

export default function HomeScreen({ activeWishGroup, briefMini, getStockColor, handleSelectStock, homeTab, liveIdx, pickHomeTab, pickWishSort, router, selectedStock, setGroupSheet, setNewGroupName, setQuery, setSelectedStock, setTopCountry, setTopType, setWishGroup, shownWishStocks, toggleWishlist, topCountry, topLoading, topStocks, topType, topUpdatedAt, wishGroups, wishMeta, wishSort, wishlistLoading, wishlistStocks }) {
  return (
    <>
{/* ══════════════════ HOME SCREEN ══════════════════ */}
          {!selectedStock && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, animation: 'fadeSlideUp 0.4s ease-out' }}>
              {/* 시황 브리핑 카드 (누르면 브리핑 화면) */}
              {(() => {
                const idx = [
                  ['KOSPI', liveIdx.KOSPI || briefMini?.kospi],
                  ['KOSDAQ', liveIdx.KOSDAQ || briefMini?.kosdaq],
                  ['NASDAQ', liveIdx.IXIC],
                ].filter(([, d]) => d);
                const kospiPct = Number(idx[0]?.[1]?.changePercent || 0);
                const kosdaqPct = Number(idx[1]?.[1]?.changePercent || 0);
                const hasData = !!(liveIdx.KOSPI || briefMini?.kospi)?.price;
                const mood = !hasData ? { label: '시황 불러오는 중', color: 'rgba(255,255,255,0.45)' }
                  : kospiPct >= 0 && kosdaqPct >= 0 ? { label: '강세장 · 시장이 오르는 흐름이에요', color: '#fca5a5' }
                  : kospiPct < 0 && kosdaqPct < 0 ? { label: '약세장 · 시장이 내리는 흐름이에요', color: '#93c5fd' }
                  : { label: '혼조세 · 지수별 방향이 엇갈려요', color: '#fcd34d' };
                return (
                  <motion.div onClick={() => router.push('/briefing')} whileTap={{ scale: 0.98 }}
                    initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                    style={{ borderRadius: 20, overflow: 'hidden', cursor: 'pointer', position: 'relative', background: 'linear-gradient(135deg, #0F172A 0%, #1E2D6B 60%, #1E3A8A 100%)', boxShadow: '0 8px 24px rgba(15,23,42,0.18)' }}>
                    <div style={{ position: 'absolute', top: -30, right: -30, width: 120, height: 120, borderRadius: '50%', background: 'rgba(99,102,241,0.25)', filter: 'blur(36px)', pointerEvents: 'none' }} />
                    <div style={{ position: 'relative', padding: '16px 18px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                        <span style={{ fontSize: 17, fontWeight: 800, color: '#fff', letterSpacing: '-0.3px' }}>📊 오늘의 시황 브리핑</span>
                        <span style={{ fontSize: 18, color: 'rgba(255,255,255,0.35)' }}>›</span>
                      </div>
                      <p style={{ fontSize: 12, fontWeight: 600, color: mood.color, margin: '0 0 12px' }}>{mood.label}</p>
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.max(idx.length, 1)}, 1fr)`, gap: 8 }}>
                        {idx.length ? idx.map(([label, d]) => {
                          const pct = Number(d.changePercent || 0);
                          return (
                            <div key={label} style={{ background: 'rgba(255,255,255,0.07)', borderRadius: 12, padding: '8px 10px' }}>
                              <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.45)', marginBottom: 2 }}>{label}</p>
                              <p style={{ fontSize: 13, fontWeight: 800, color: pct >= 0 ? '#fca5a5' : '#93c5fd', fontVariantNumeric: 'tabular-nums' }}>{pct >= 0 ? '▲' : '▼'} {Math.abs(pct).toFixed(2)}%</p>
                            </div>
                          );
                        }) : <div className="sk" style={{ height: 44, opacity: 0.15 }} />}
                      </div>
                    </div>
                  </motion.div>
                );
              })()}

              {/* 지수 투자자 수급 (토스) */}
              <MarketIndicators />

              {/* 관심종목 | 실시간 TOP 100 */}
              {(wishlistLoading || wishlistStocks.length > 0) && (
                <div style={{ display: 'flex', background: '#e2e8f0', borderRadius: 14, padding: 3 }}>
                  {[['wish', `⭐ 관심종목${wishlistStocks.length ? ` ${wishlistStocks.length}` : ''}`], ['top', '🔥 실시간 TOP']].map(([k, label]) => (
                    <button key={k} onClick={() => pickHomeTab(k)}
                      style={{ flex: 1, padding: '9px 0', borderRadius: 11, fontSize: 13, fontWeight: 800, cursor: 'pointer', border: 'none', transition: 'background 0.2s ease, color 0.2s ease',
                        background: homeTab === k ? 'white' : 'transparent', color: homeTab === k ? '#0f172a' : '#64748b', boxShadow: homeTab === k ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}

              {(wishlistLoading || wishlistStocks.length > 0) && homeTab === 'wish' && (
                <motion.div key="home-wish" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}
                  style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(15,23,42,0.06)', padding: '12px 16px 4px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
                    <div style={{ flex: 1, minWidth: 0, display: 'flex', gap: 6, overflowX: 'auto', scrollbarWidth: 'none' }}>
                      {wishGroups.length > 0 && ['all', ...wishGroups].map((g) => (
                        <button key={g} onClick={() => setWishGroup(g)}
                          style={{ flexShrink: 0, padding: '5px 11px', borderRadius: 999, fontSize: 12, fontWeight: 700, cursor: 'pointer', border: 'none', background: activeWishGroup === g ? '#0f172a' : '#f1f5f9', color: activeWishGroup === g ? '#fff' : '#64748b' }}>
                          {g === 'all' ? `전체 ${wishlistStocks.length}` : `${g} ${wishlistStocks.filter(s => wishMeta.get(s.symbol)?.group === g).length}`}
                        </button>
                      ))}
                    </div>
                    <select value={wishSort} onChange={(e) => pickWishSort(e.target.value)} aria-label="관심종목 정렬"
                      style={{ flexShrink: 0, fontSize: 12, fontWeight: 600, color: '#475569', background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 10, padding: '5px 8px' }}>
                      <option value="added">최근 등록순</option>
                      <option value="up">상승률 높은 순</option>
                      <option value="down">하락률 높은 순</option>
                      <option value="return">등록 후 수익률 순</option>
                      <option value="name">이름순</option>
                    </select>
                  </div>
                  {wishlistLoading && wishlistStocks.length === 0 ? (
                    [0, 1, 2].map(i => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 0', borderTop: i ? '1px solid #f1f5f9' : 'none' }}>
                        <div className="sk" style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0 }} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 6 }}>
                          <div className="sk" style={{ height: 13, width: '50%' }} />
                          <div className="sk" style={{ height: 11, width: '30%' }} />
                        </div>
                        <div className="sk" style={{ height: 13, width: 52 }} />
                      </div>
                    ))
                  ) : shownWishStocks.map((stock, i) => {
                    const usS = isUsStock({ symbol: stock.symbol });
                    const up = (stock.change ?? 0) >= 0;
                    const grp = wishMeta.get(stock.symbol)?.group;
                    return (
                      <div key={stock.symbol} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 0', borderTop: i ? '1px solid #f1f5f9' : 'none' }}>
                        <button onClick={() => handleSelectStock({ symbol: stock.symbol, name: stock.name, exchange: '' })}
                          style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 12, textAlign: 'left', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                          {(() => { const [c1, c2] = getStockColor(stock.name, stock.symbol); return (<div style={{ width: 38, height: 38, borderRadius: '50%', flexShrink: 0, background: `linear-gradient(135deg,${c1},${c2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 15, fontWeight: 800, color: 'white' }}>{stock.name?.charAt(0)}</div>); })()}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stock.name}</p>
                            <p style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {grp ? `${grp} · ` : ''}{stock.registeredReturn != null ? `등록 후 ${Number(stock.registeredReturn) >= 0 ? '+' : ''}${stock.registeredReturn}%` : stock.symbol}
                            </p>
                          </div>
                          <div style={{ textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                            <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{usS ? `$${Number(stock.currentPrice || 0).toFixed(2)}` : `${stock.currentPrice?.toLocaleString()}원`}</p>
                            <p style={{ fontSize: 12, fontWeight: 700, color: up ? '#ef4444' : '#3b82f6' }}>{up ? '+' : ''}{stock.changePercent?.toFixed(2)}%</p>
                          </div>
                        </button>
                        <button onClick={() => { setGroupSheet({ symbol: stock.symbol, name: stock.name }); setNewGroupName(''); }} aria-label="그룹 지정"
                          style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 10, background: '#f8fafc', border: 'none', cursor: 'pointer', fontSize: 13 }}>📁</button>
                        <button onClick={() => toggleWishlist(stock.symbol, stock.name)} aria-label="관심종목 해제"
                          style={{ flexShrink: 0, width: 30, height: 30, borderRadius: 10, background: '#fffbeb', border: 'none', cursor: 'pointer', fontSize: 13 }}>⭐</button>
                      </div>
                    );
                  })}
                </motion.div>
              )}

              {!((wishlistLoading || wishlistStocks.length > 0) && homeTab === 'wish') && (
                <motion.div key="home-top" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.25 }}
                  style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(15,23,42,0.06)', padding: '14px 16px 4px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
                    <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 10, padding: 2 }}>
                      {[{ key: 'KR', label: '🇰🇷 국내' }, { key: 'US', label: '🇺🇸 미국' }].map(c => (
                        <button key={c.key} onClick={() => { setTopCountry(c.key); if (c.key === 'US' && topType === 'marcap') setTopType('amount'); }}
                          style={{ padding: '5px 12px', borderRadius: 8, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer', background: topCountry === c.key ? 'white' : 'transparent', color: topCountry === c.key ? '#0f172a' : '#94a3b8', boxShadow: topCountry === c.key ? '0 1px 3px rgba(0,0,0,0.08)' : 'none' }}>{c.label}</button>
                      ))}
                    </div>
                    {topUpdatedAt && <span style={{ fontSize: 11, color: '#94a3b8' }}>{topUpdatedAt}</span>}
                  </div>
                  <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, scrollbarWidth: 'none' }}>
                    {[{ key: 'volume', label: '거래량' }, { key: 'amount', label: '거래대금' }, ...(topCountry === 'KR' ? [{ key: 'marcap', label: '시가총액' }] : []), { key: 'rise', label: '상승률' }, { key: 'fall', label: '하락률' }].map(t => (
                      <button key={t.key} onClick={() => setTopType(t.key)}
                        style={{ flexShrink: 0, padding: '6px 13px', borderRadius: 999, fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap', border: 'none', cursor: 'pointer', background: topType === t.key ? '#0f172a' : '#f1f5f9', color: topType === t.key ? '#fff' : '#64748b' }}>{t.label}</button>
                    ))}
                  </div>
                  {topLoading ? (
                    [...Array(6)].map((_, i) => (
                      <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', borderTop: i ? '1px solid #f1f5f9' : 'none' }}>
                        <div className="sk" style={{ width: 22, height: 14, flexShrink: 0 }} />
                        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 5 }}>
                          <div className="sk" style={{ height: 13, width: '50%' }} />
                          <div className="sk" style={{ height: 11, width: '30%' }} />
                        </div>
                        <div className="sk" style={{ height: 13, width: 48 }} />
                      </div>
                    ))
                  ) : topStocks.map((stock, i) => {
                    const rate = stock.changeRate?.includes('%') ? stock.changeRate : `${stock.changeRate}%`;
                    const col = stock.changeRate?.includes('+') ? '#ef4444' : stock.changeRate?.includes('-') ? '#3b82f6' : '#64748b';
                    return (
                      <button key={stock.code} onClick={() => { setSelectedStock({ symbol: stock.code, name: stock.name, exchange: stock.market || 'KOSPI' }); setQuery(stock.name); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 0', background: 'none', border: 'none', borderTop: i ? '1px solid #f1f5f9' : 'none', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
                        <span style={{ width: 22, flexShrink: 0, textAlign: 'center', fontSize: 13, fontWeight: 800, color: i < 3 ? '#6366f1' : '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>{i + 1}</span>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{stock.name}</p>
                          <p style={{ fontSize: 11, color: '#94a3b8' }}>{topType === 'volume' ? `거래량 ${Number(stock.volume).toLocaleString()}주` : topType === 'amount' || !stock.marcap ? `거래대금 ${Number(stock.amount).toLocaleString()}백만` : `시총 ${Number(stock.marcap).toLocaleString()}억`}</p>
                        </div>
                        <div style={{ textAlign: 'right', flexShrink: 0, fontVariantNumeric: 'tabular-nums' }}>
                          <p style={{ fontSize: 14, fontWeight: 700, color: '#0f172a', marginBottom: 2 }}>{stock.currency === 'USD' ? `$${Number(stock.price).toFixed(2)}` : `${Number(stock.price).toLocaleString()}원`}</p>
                          <p style={{ fontSize: 12, fontWeight: 700, color: col }}>{rate}</p>
                        </div>
                      </button>
                    );
                  })}
                </motion.div>
              )}
            </div>
          )}
    </>
  );
}
