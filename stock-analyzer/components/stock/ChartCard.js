'use client';

import ChartShell from './ChartShell';
import { fmtPx } from '@/lib/currency';
import { isMinuteTf } from '@/lib/toss';
import { motion, AnimatePresence } from 'framer-motion';

export default function ChartCard({ CHART_H, MINUTE_TFS, OVERLAY_INFO, activeTooltip, chartContainerRef, chartData, chartFs, handleChipToggle, lastMinute, loading, minutePicker, ohlcRef, portrait, setActiveTooltip, setChartFs, setLastMinute, setMinutePicker, setShowBB, setShowHL, setShowMA, setShowMACD, setShowRSI, setShowVWAP, setShowVolumeProfile, setTimeframe, showBB, showHL, showMA, showMACD, showRSI, showVWAP, showVolumeProfile, shownChange, shownPct, shownPrice, timeframe, tooltipTimer, us }) {
  return (
    <>
{/* Dark Chart Card */}
              <ChartShell fs={chartFs}>
                {chartFs && chartData && (
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 14px 0' }}>
                    <div style={{ minWidth: 0 }}>
                      <span style={{ fontSize: 14, fontWeight: 800, color: '#fff' }}>{chartData.nameKr || chartData.name}</span>
                      <span style={{ fontSize: 13, fontWeight: 800, marginLeft: 8, color: (shownChange ?? 0) >= 0 ? '#f87171' : '#60a5fa' }}>
                        {fmtPx(shownPrice || 0, us)} {(shownPct ?? 0) >= 0 ? '+' : ''}{Number(shownPct || 0).toFixed(2)}%
                      </span>
                    </div>
                    <button onClick={() => setChartFs(false)} aria-label="전체화면 닫기"
                      style={{ width: 32, height: 32, borderRadius: 10, border: 'none', background: 'rgba(255,255,255,0.1)', color: '#fff', fontSize: 15, cursor: 'pointer', flexShrink: 0 }}>✕</button>
                  </div>
                )}
                {chartFs && portrait && (
                  <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.45)', textAlign: 'center', margin: '6px 0 0' }}>📱 휴대폰을 가로로 돌리면 더 넓게 볼 수 있어요 (화면 회전 잠금 해제 필요)</p>
                )}
                {!loading && chartData?.chartData?.length > 0 && (
                  <div style={{ padding: '12px 14px 8px' }}>
                    {/* 기간: [n분 ▾] 일 주 월 년 — 분봉은 눌러서 1·3·5·10·15·30·60분 중 선택 */}
                    <div style={{ display: 'flex', gap: 4, marginBottom: minutePicker ? 6 : 8 }}>
                      {(() => {
                        const isMin = isMinuteTf(timeframe);
                        const label = MINUTE_TFS.find(m => m.key === (isMin ? timeframe : lastMinute))?.label || '분';
                        return (
                          <button onClick={() => setMinutePicker(v => !v)}
                            style={{ padding: '6px 12px', borderRadius: 10, fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer', flexShrink: 0,
                              background: isMin ? 'rgba(255,255,255,0.15)' : 'rgba(255,255,255,0.06)', color: isMin ? '#fff' : 'rgba(255,255,255,0.45)' }}>
                            {label} {minutePicker ? '▴' : '▾'}
                          </button>
                        );
                      })()}
                      {[{ key: 'daily', label: '일' }, { key: 'weekly', label: '주' }, { key: 'monthly', label: '월' }, { key: 'yearly', label: '년' }].map(t => (
                        <button key={`tf-${t.key}`} onClick={() => { setTimeframe(t.key); setMinutePicker(false); }}
                          style={{ flex: 1, padding: '6px 0', borderRadius: 10, fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer',
                            background: timeframe === t.key ? 'rgba(255,255,255,0.15)' : 'transparent',
                            color: timeframe === t.key ? '#fff' : 'rgba(255,255,255,0.45)' }}>
                          {t.label}
                        </button>
                      ))}
                      <button onClick={() => { setMinutePicker(false); setChartFs(v => !v); }} aria-label={chartFs ? '전체화면 닫기' : '전체화면'}
                        style={{ padding: '6px 10px', borderRadius: 10, fontSize: 13, fontWeight: 800, border: 'none', cursor: 'pointer', flexShrink: 0, background: 'rgba(255,255,255,0.06)', color: 'rgba(255,255,255,0.7)' }}>
                        {chartFs ? '⤡' : '⛶'}
                      </button>
                    </div>
                    {minutePicker && (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 4, marginBottom: 8, padding: 4, borderRadius: 12, background: 'rgba(255,255,255,0.05)' }}>
                        {MINUTE_TFS.map(m => (
                          <button key={`mtf-${m.key}`} onClick={() => { setTimeframe(m.key); setLastMinute(m.key); setMinutePicker(false); }}
                            style={{ padding: '6px 0', borderRadius: 8, fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer',
                              background: timeframe === m.key ? '#6366f1' : 'transparent', color: timeframe === m.key ? '#fff' : 'rgba(255,255,255,0.6)' }}>
                            {m.label}
                          </button>
                        ))}
                      </div>
                    )}
                    <div ref={ohlcRef} style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5, minHeight: 32, marginBottom: 6, fontVariantNumeric: 'tabular-nums' }} />
                    <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 2, scrollbarWidth: 'none' }}>
                      {[
                        { key: 'vp',   label: '매물대', active: showVolumeProfile, color: '#8b5cf6', setter: setShowVolumeProfile },
                        { key: 'ma',   label: '이평선', active: showMA,            color: '#f59e0b', setter: setShowMA },
                        { key: 'bb',   label: '볼린저',  active: showBB,            color: '#3b82f6', setter: setShowBB },
                        { key: 'vwap', label: 'VWAP',    active: showVWAP,          color: '#06b6d4', setter: setShowVWAP },
                        { key: 'hl',   label: '고저점',  active: showHL,            color: '#22c55e', setter: setShowHL },
                        { key: 'rsi',  label: 'RSI',     active: showRSI,           color: '#eab308', setter: setShowRSI },
                        { key: 'macd', label: 'MACD',    active: showMACD,          color: '#ec4899', setter: setShowMACD },
                      ].map(({ key, label, active, color, setter }) => (
                        <button key={key} onClick={() => handleChipToggle(key, active, setter)} style={{
                          display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                          padding: '5px 11px', borderRadius: 20, fontSize: 11, fontWeight: 700,
                          border: `1px solid ${active ? `${color}88` : 'rgba(255,255,255,0.1)'}`,
                          background: active ? `${color}22` : 'transparent',
                          color: active ? '#fff' : 'rgba(255,255,255,0.45)',
                          cursor: 'pointer', transition: 'all 0.18s ease', whiteSpace: 'nowrap',
                        }}>
                          <span style={{ width: 6, height: 6, borderRadius: 3, background: active ? color : `${color}66` }} />{label}
                        </button>
                      ))}
                    </div>
                    <AnimatePresence>
                      {activeTooltip && OVERLAY_INFO[activeTooltip] && (
                        <motion.div key={activeTooltip}
                          initial={{ opacity: 0, y: -8, scale: 0.97 }}
                          animate={{ opacity: 1, y: 0, scale: 1 }}
                          exit={{ opacity: 0, y: -8, scale: 0.97 }}
                          transition={{ duration: 0.16 }}
                          style={{ marginTop: 8, padding: '10px 12px', borderRadius: 12,
                            background: `${OVERLAY_INFO[activeTooltip].color}14`,
                            border: `1px solid ${OVERLAY_INFO[activeTooltip].color}38` }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 5 }}>
                            <p style={{ fontSize: 11, fontWeight: 800, color: OVERLAY_INFO[activeTooltip].color, margin: 0 }}>{OVERLAY_INFO[activeTooltip].title}</p>
                            <button onClick={() => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current); setActiveTooltip(null); }}
                              style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.3)', cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>✕</button>
                          </div>
                          <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.55, margin: 0 }}>{OVERLAY_INFO[activeTooltip].desc}</p>
                        </motion.div>
                      )}
                    </AnimatePresence>
                  </div>
                )}
                <div style={{ position: 'relative', ...(chartFs ? { flex: 1, minHeight: 0 } : {}) }}>
                  {loading ? (
                    <div style={{ height: CHART_H, background: 'rgba(255,255,255,0.04)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      <div style={{ fontSize: 28, opacity: 0.2 }}>📈</div>
                    </div>
                  ) : (
                    <div ref={chartContainerRef} style={{ width: '100%', ...(chartFs ? { height: '100%' } : {}) }} />
                  )}
                </div>
              </ChartShell>

    </>
  );
}
