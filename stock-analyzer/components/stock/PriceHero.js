'use client';

import StockStatus from '@/components/StockStatus';
import { canUseToss, isUsStock } from '@/lib/toss';
import { motion } from 'framer-motion';

export default function PriceHero({ chartData, fadeUp, getPrevDateText, getStockColor, isWished, loading, priceUp, selectedStock, shownChange, shownPct, shownPrice, toggleWishlist }) {
  return (
    <>
{/* Hero Price Card */}
              <motion.div custom={0} variants={fadeUp} initial="hidden" animate="visible"
                style={{ borderRadius: 20, overflow: 'hidden', position: 'relative',
                  background: 'linear-gradient(145deg, #0f172a 0%, #1e3a5f 55%, #1e40af 100%)',
                  boxShadow: '0 8px 24px rgba(15,23,42,0.18)' }}>
                <div style={{ position: 'absolute', top: -50, right: -50, width: 200, height: 200, borderRadius: '50%', background: 'rgba(99,102,241,0.15)', filter: 'blur(60px)', pointerEvents: 'none' }} />
                <div style={{ position: 'absolute', bottom: -30, left: -20, width: 140, height: 140, borderRadius: '50%', background: 'rgba(59,130,246,0.12)', filter: 'blur(40px)', pointerEvents: 'none' }} />
                <div style={{ padding: '18px 20px 16px', position: 'relative' }}>
                  {loading ? (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                      <div className="sk" style={{ height: 16, width: '40%', opacity: 0.3 }} />
                      <div className="sk" style={{ height: 36, width: '60%', opacity: 0.3 }} />
                      <div className="sk" style={{ height: 14, width: '35%', opacity: 0.3 }} />
                    </div>
                  ) : chartData && (
                    <>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          {(() => { const [c1, c2] = getStockColor(selectedStock.name, selectedStock.symbol); return (
                            <div style={{ width: 44, height: 44, borderRadius: 15, background: `linear-gradient(135deg,${c1},${c2})`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 800, color: 'white', flexShrink: 0, boxShadow: `0 6px 20px ${c1}55` }}>
                              {(chartData.nameKr || selectedStock.name || chartData.name)?.charAt(0)}
                            </div>
                          ); })()}
                          <div>
                            <p style={{ fontSize: 17, fontWeight: 800, color: '#fff', lineHeight: 1.2, marginBottom: 2 }}>{chartData.nameKr || selectedStock.name || chartData.name}</p>
                            <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.04em' }}>{chartData.name} · {selectedStock.symbol}</p>
                          </div>
                        </div>
                        <button onClick={() => toggleWishlist(selectedStock.symbol, chartData.nameKr || chartData.name)}
                          style={{ fontSize: 22, background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: 12, width: 40, height: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
                            filter: isWished ? 'drop-shadow(0 0 6px #fbbf24)' : 'grayscale(1) opacity(0.4)',
                            animation: isWished ? 'starPulse 2s ease-in-out infinite' : 'none' }}>⭐</button>
                      </div>
                      <div>
                        <p style={{ fontSize: 34, fontWeight: 800, color: '#fff', letterSpacing: '-0.03em', lineHeight: 1, marginBottom: 8, fontVariantNumeric: 'tabular-nums' }}>
                          {shownPrice?.toLocaleString()}<span style={{ fontSize: 15, fontWeight: 500, color: 'rgba(255,255,255,0.5)', marginLeft: 4 }}>{isUsStock(selectedStock) ? '달러' : '원'}</span>
                        </p>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 4, background: priceUp ? 'rgba(239,68,68,0.18)' : 'rgba(59,130,246,0.18)', borderRadius: 20, padding: '4px 12px', border: `1px solid ${priceUp ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)'}` }}>
                            <span style={{ fontSize: 12, fontWeight: 700, color: priceUp ? '#fca5a5' : '#93c5fd' }}>
                              {priceUp ? '▲' : '▼'} {Math.abs(shownChange)?.toLocaleString(undefined, { maximumFractionDigits: 2 })}{isUsStock(selectedStock) ? '달러' : '원'} ({priceUp ? '+' : ''}{shownPct?.toFixed(2)}%)
                            </span>
                          </div>
                          <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.3)' }}>{getPrevDateText()}</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>
                {/* 시장 상태 · 경고 · 상하한가 (토스) */}
                {!loading && chartData && canUseToss(selectedStock) && (
                  <StockStatus key={`st-${selectedStock.symbol}`} symbol={selectedStock.symbol} us={isUsStock(selectedStock)} />
                )}
              </motion.div>

    </>
  );
}
