'use client';

import { motion } from 'framer-motion';
import { calcCosts, tickSize, COSTS, US_COSTS } from '@/lib/paperTrade';
import { fmtPx } from '@/lib/currency';
import OcoModal from '@/components/OcoModal';

export default function StockModals({ addToast, chartData, fx, groupSheet, handleTrade, live, newGroupName, ocoModal, orderableCash, priceType, selectedStock, sellableQty, setGroupSheet, setNewGroupName, setOcoModal, setPriceType, setStockGroup, setTradeModal, setTradePrice, setTradeQty, setTradeType, tradeError, tradeModal, tradePrice, tradeProcessing, tradeQty, tradeType, us, user, userHolding, wishGroups, wishMeta }) {
  return (
    <>
{groupSheet && (
        <div onClick={() => setGroupSheet(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.45)', zIndex: 100, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
          <div onClick={(e) => e.stopPropagation()} style={{ width: '100%', maxWidth: 480, background: 'white', borderRadius: '22px 22px 0 0', padding: '18px 18px calc(18px + env(safe-area-inset-bottom, 0px))' }}>
            <p style={{ fontSize: 15, fontWeight: 800, color: '#111827', margin: '0 0 4px' }}>📁 그룹 지정</p>
            <p style={{ fontSize: 12, color: '#94A3B8', margin: '0 0 14px' }}>{groupSheet.name}</p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 14 }}>
              {wishGroups.map((g) => {
                const on = wishMeta.get(groupSheet.symbol)?.group === g;
                return (
                  <button key={g} onClick={() => setStockGroup(groupSheet.symbol, g)}
                    style={{ padding: '8px 14px', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: on ? '1.5px solid #6366f1' : '1.5px solid #E2E8F0', background: on ? '#EEF2FF' : 'white', color: on ? '#4F46E5' : '#334155' }}>
                    {on ? '✓ ' : ''}{g}
                  </button>
                );
              })}
              {wishMeta.get(groupSheet.symbol)?.group && (
                <button onClick={() => setStockGroup(groupSheet.symbol, '')}
                  style={{ padding: '8px 14px', borderRadius: 12, fontSize: 13, fontWeight: 700, cursor: 'pointer', border: '1.5px dashed #CBD5E1', background: 'white', color: '#94A3B8' }}>그룹에서 빼기</button>
              )}
            </div>
            <div style={{ display: 'flex', gap: 8 }}>
              <input value={newGroupName} onChange={(e) => setNewGroupName(e.target.value.slice(0, 12))} placeholder="새 그룹 이름 (예: 반도체, 배당주)"
                onKeyDown={(e) => { if (e.key === 'Enter' && newGroupName.trim()) setStockGroup(groupSheet.symbol, newGroupName.trim()); }}
                style={{ flex: 1, minWidth: 0, padding: '10px 12px', borderRadius: 12, border: '1.5px solid #E2E8F0', fontSize: 14 }} />
              <button disabled={!newGroupName.trim()} onClick={() => setStockGroup(groupSheet.symbol, newGroupName.trim())}
                style={{ padding: '0 16px', borderRadius: 12, border: 'none', fontSize: 13, fontWeight: 800, cursor: 'pointer', background: newGroupName.trim() ? '#6366f1' : '#E2E8F0', color: newGroupName.trim() ? 'white' : '#94A3B8' }}>추가</button>
            </div>
          </div>
        </div>
      )}

      {ocoModal && chartData && userHolding && (
        <OcoModal uid={user.uid} symbol={selectedStock.symbol} name={chartData.name}
          currentPrice={live?.price || chartData.currentPrice} holding={userHolding} sellable={sellableQty}
          onClose={() => setOcoModal(false)} us={us} fx={fx || 1}
          onDone={(msg) => { setOcoModal(false); addToast(msg, 'success'); }} />
      )}

      {tradeModal && chartData && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)', backdropFilter: 'blur(6px)', display: 'flex', alignItems: 'flex-end', justifyContent: 'center', zIndex: 55 }}>
          <motion.div initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }} transition={{ type: 'spring', damping: 28, stiffness: 300 }}
            style={{ background: 'white', borderRadius: '28px 28px 0 0', width: '100%', maxWidth: 480, padding: '0 0 40px', boxShadow: '0 -20px 60px rgba(0,0,0,0.18)', border: '1px solid #e2e8f0', borderBottom: 'none' }}>
            <div style={{ display: 'flex', justifyContent: 'center', padding: '14px 0 0' }}>
              <div style={{ width: 40, height: 4, background: '#e2e8f0', borderRadius: 4 }} />
            </div>
            <div style={{ height: 1, background: 'linear-gradient(90deg,transparent,#bfdbfe,transparent)', margin: '12px 0 0' }} />
            <div style={{ padding: '18px 22px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 18 }}>
                <div>
                  <p style={{ fontSize: 10, color: '#94a3b8', letterSpacing: '0.07em', textTransform: 'uppercase', marginBottom: 4, fontWeight: 700 }}>주문</p>
                  <h3 style={{ fontSize: 18, fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>{chartData.nameKr || chartData.name}</h3>
                  <p style={{ fontSize: 11, color: '#94a3b8' }}>{chartData.name} · {selectedStock?.symbol}</p>
                </div>
                <div style={{ textAlign: 'right', background: '#f8fafc', borderRadius: 16, padding: '10px 14px', border: '1px solid #e2e8f0' }}>
                  <p style={{ fontSize: 17, fontWeight: 800, color: '#0f172a', marginBottom: 2 }}>{fmtPx(chartData.currentPrice, us)}</p>
                  <p style={{ fontSize: 12, fontWeight: 700, color: chartData.change >= 0 ? '#dc2626' : '#2563eb' }}>{chartData.change >= 0 ? '+' : ''}{chartData.changePercent?.toFixed(2)}%</p>
                </div>
              </div>
              <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 16, padding: 4, marginBottom: 14, gap: 4 }}>
                <button onClick={() => setTradeType('buy')} style={{ flex: 1, padding: '11px', borderRadius: 12, fontSize: 14, fontWeight: 800, background: tradeType === 'buy' ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'transparent', color: tradeType === 'buy' ? 'white' : '#94a3b8', border: 'none', cursor: 'pointer', boxShadow: tradeType === 'buy' ? '0 4px 14px rgba(239,68,68,0.35)' : 'none', transition: 'all 0.2s' }}>매수</button>
                <button onClick={() => setTradeType('sell')} style={{ flex: 1, padding: '11px', borderRadius: 12, fontSize: 14, fontWeight: 800, background: tradeType === 'sell' ? 'linear-gradient(135deg,#3b82f6,#2563eb)' : 'transparent', color: tradeType === 'sell' ? 'white' : '#94a3b8', border: 'none', cursor: 'pointer', boxShadow: tradeType === 'sell' ? '0 4px 14px rgba(59,130,246,0.35)' : 'none', transition: 'all 0.2s' }}>매도</button>
              </div>
              <div style={{ display: 'flex', background: '#f1f5f9', borderRadius: 14, padding: 4, marginBottom: 14, gap: 4 }}>
                <button onClick={() => setPriceType('market')} style={{ flex: 1, padding: '9px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: priceType === 'market' ? 'white' : 'transparent', color: priceType === 'market' ? '#0f172a' : '#94a3b8', border: 'none', cursor: 'pointer', boxShadow: priceType === 'market' ? '0 1px 6px rgba(0,0,0,0.09)' : 'none', transition: 'all 0.18s' }}>시장가</button>
                <button onClick={() => setPriceType('limit')} style={{ flex: 1, padding: '9px', borderRadius: 10, fontSize: 13, fontWeight: 700, background: priceType === 'limit' ? 'white' : 'transparent', color: priceType === 'limit' ? '#0f172a' : '#94a3b8', border: 'none', cursor: 'pointer', boxShadow: priceType === 'limit' ? '0 1px 6px rgba(0,0,0,0.09)' : 'none', transition: 'all 0.18s' }}>지정가</button>
              </div>
              {priceType === 'limit' && (
                <div style={{ marginBottom: 14 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', display: 'block', marginBottom: 7, letterSpacing: '0.04em' }}>가격 ({us ? '달러' : '원'})</label>
                  <input type="number" step={tickSize(Number(tradePrice) || chartData.currentPrice, chartData.name, us)} value={tradePrice} onChange={e => setTradePrice(e.target.value)} placeholder={`${chartData.currentPrice?.toLocaleString()}`}
                    style={{ width: '100%', padding: '13px 16px', borderRadius: 16, border: '1.5px solid #e2e8f0', fontSize: 15, fontWeight: 700, color: '#0f172a', outline: 'none', boxSizing: 'border-box', background: '#f8fafc' }} />
                </div>
              )}
              <div style={{ marginBottom: 14 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 }}>
                  <label style={{ fontSize: 11, fontWeight: 700, color: '#64748b', letterSpacing: '0.04em' }}>수량 (주)</label>
                  {tradeType === 'sell' && userHolding && <span style={{ fontSize: 11, color: '#94a3b8' }}>매도가능 {sellableQty}주</span>}
                </div>
                <input type="number" value={tradeQty} onChange={e => setTradeQty(e.target.value)} placeholder="0"
                  style={{ width: '100%', padding: '13px 16px', borderRadius: 16, border: '1.5px solid #e2e8f0', fontSize: 16, fontWeight: 700, color: '#0f172a', outline: 'none', marginBottom: 9, boxSizing: 'border-box', background: '#f8fafc' }} />
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 7 }}>
                  {[{ label: '10%', pct: 10 }, { label: '25%', pct: 25 }, { label: '50%', pct: 50 }, { label: tradeType === 'buy' ? '최대' : '전량', pct: 100 }].map(({ label, pct }) => {
                    const price = priceType === 'market' ? chartData.currentPrice : (Number(tradePrice) || chartData.currentPrice);
                    const qty = tradeType === 'buy' ? (us ? (fx ? Math.floor(orderableCash * pct / 100 / fx / (price * (1 + US_COSTS.feeRate))) : 0) : Math.floor(orderableCash * pct / 100 / (price * (1 + COSTS.feeRate)))) : Math.floor(sellableQty * pct / 100) || (pct === 100 ? sellableQty : 0);
                    return (<button key={pct} onClick={() => setTradeQty(String(qty || 0))} style={{ padding: '9px 4px', background: '#f1f5f9', color: '#64748b', borderRadius: 12, fontSize: 12, fontWeight: 700, border: 'none', cursor: 'pointer' }}>{label}</button>);
                  })}
                </div>
              </div>
              {tradeQty && Number(tradeQty) > 0 && (
                <div style={{ background: '#f8fafc', borderRadius: 18, padding: '16px', marginBottom: 14, border: '1px solid #f1f5f9' }}>
                  {(() => {
                    const price = priceType === 'market' ? chartData.currentPrice : Number(tradePrice);
                    const total = price * Number(tradeQty);
                    const { fee, tax } = calcCosts(tradeType, total, us);
                    const k = us ? (fx || 0) : 1; // 달러 → 원 (국내는 1)
                    const afterCash = tradeType === 'buy' ? orderableCash - (total + fee) * k : orderableCash + (total - fee - tax) * k;
                    const won = (v) => `${Math.round(v * k).toLocaleString()}원`;
                    return (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12, color: '#64748b' }}>주문가격</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{fmtPx(price, us)}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12, color: '#64748b' }}>총 주문금액</span>
                          <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>{us ? `${fmtPx(total, true)}${fx ? ` (≈ ${won(total)})` : ''}` : `${total?.toLocaleString()}원`}</span>
                        </div>
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12, color: '#64748b' }}>수수료{tradeType === 'sell' ? ' · 세금' : ''}</span>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a' }}>{us ? `${fmtPx(fee, true)}${fx ? ` (≈ ${won(fee)})` : ''}` : `${(fee + tax).toLocaleString()}원`}</span>
                        </div>
                        {us && <p style={{ fontSize: 10, color: '#94a3b8', margin: 0 }}>{fx ? `원화 지갑에서 환율 ${fx.toLocaleString()}원/$ 기준으로 자동 환전 (토스 기준환율, 체결 시점 환율로 정산)` : '환율 확인 중…'}</p>}
                        <div style={{ height: 1, background: '#e2e8f0' }} />
                        <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                          <span style={{ fontSize: 12, color: '#64748b' }}>주문 후 잔액</span>
                          <span style={{ fontSize: 13, fontWeight: 800, color: afterCash < 0 ? '#dc2626' : '#0f172a' }}>{us && !fx ? '환율 확인 중' : `${Math.round(afterCash).toLocaleString()}원`}</span>
                        </div>
                        {tradeType === 'sell' && userHolding && (() => {
                          if (us && !fx) return null;
                          const costBasis = userHolding.totalInvested ? userHolding.totalInvested * Number(tradeQty) / userHolding.quantity : userHolding.avgPrice * Number(tradeQty) * k;
                          const profit = Math.round((total - fee - tax) * k - costBasis);
                          const rate = (profit / costBasis * 100).toFixed(2);
                          return (
                            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                              <span style={{ fontSize: 12, color: '#64748b' }}>예상 손익</span>
                              <span style={{ fontSize: 13, fontWeight: 800, color: profit >= 0 ? '#dc2626' : '#2563eb' }}>{profit >= 0 ? '+' : ''}{profit.toLocaleString()}원 ({profit >= 0 ? '+' : ''}{rate}%)</span>
                            </div>
                          );
                        })()}
                      </div>
                    );
                  })()}
                </div>
              )}
              {tradeError && <p style={{ fontSize: 12, color: '#dc2626', textAlign: 'center', marginBottom: 12, fontWeight: 600 }}>⚠️ {tradeError}</p>}
              <div style={{ display: 'flex', gap: 10 }}>
                <button onClick={() => setTradeModal(false)} style={{ padding: '15px 22px', background: '#f1f5f9', color: '#64748b', borderRadius: 18, fontWeight: 700, fontSize: 14, border: 'none', cursor: 'pointer' }}>취소</button>
                <button onClick={handleTrade} disabled={tradeProcessing}
                  style={{ flex: 1, padding: '15px', color: 'white', borderRadius: 18, fontWeight: 800, fontSize: 15, border: 'none', cursor: tradeProcessing ? 'not-allowed' : 'pointer', transition: 'all 0.2s',
                    background: tradeProcessing ? '#cbd5e1' : tradeType === 'buy' ? 'linear-gradient(135deg,#ef4444,#dc2626)' : 'linear-gradient(135deg,#3b82f6,#2563eb)',
                    boxShadow: tradeProcessing ? 'none' : tradeType === 'buy' ? '0 6px 20px rgba(239,68,68,0.35)' : '0 6px 20px rgba(59,130,246,0.35)' }}>
                  {tradeProcessing ? '처리 중...' : tradeType === 'buy' ? '매수 확정' : '매도 확정'}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
    </>
  );
}
