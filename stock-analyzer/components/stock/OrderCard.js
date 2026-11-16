'use client';

import { fmtPx } from '@/lib/currency';
import OpenOrders from '@/components/OpenOrders';

export default function OrderCard({ chartData, fx, loading, orderableCash, selectedStock, sellableQty, setOcoModal, setPriceType, setTradeError, setTradeModal, setTradePrice, setTradeQty, setTradeType, showTradeBar, us, user, userHolding, userProfile }) {
  return (
    <>
{/* 보유 현황 + 모의 주문 (화면에 고정하지 않고 본문 안에 둠) */}
              {showTradeBar && (
                <div>
                  <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', boxShadow: '0 2px 12px rgba(15,23,42,0.06)', padding: '14px 16px' }}>
                    {userHolding && (() => {
                      // 미국: 평가금액·손익은 원화(환율 반영), 투자원금(원화) 기준이라 환차손익도 포함된다
                      const evalKrw = us ? (fx ? chartData.currentPrice * userHolding.quantity * fx : null) : chartData.currentPrice * userHolding.quantity;
                      const profit = us ? (evalKrw == null ? 0 : evalKrw - userHolding.totalInvested) : (chartData.currentPrice - userHolding.avgPrice) * userHolding.quantity;
                      const profitRate = us ? (evalKrw == null ? '0.00' : (profit / userHolding.totalInvested * 100).toFixed(2)) : ((chartData.currentPrice - userHolding.avgPrice) / userHolding.avgPrice * 100).toFixed(2);
                      const isPos = profit >= 0;
                      return (
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, paddingBottom: 12, borderBottom: '1px solid #f1f5f9' }}>
                          <div>
                            <p style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600, marginBottom: 3 }}>💼 내 보유</p>
                            <p style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 1 }}>{userHolding.quantity}주</p>
                            <p style={{ fontSize: 11, color: '#94a3b8' }}>평균 {fmtPx(userHolding.avgPrice, us)}</p>
                          </div>
                          <div style={{ textAlign: 'right' }}>
                            <p style={{ fontSize: 15, fontWeight: 800, color: '#0f172a', marginBottom: 4 }}>{evalKrw == null ? '환율 확인 중' : `${Math.round(evalKrw).toLocaleString()}원`}</p>
                            <span style={{ fontSize: 12, fontWeight: 800, color: isPos ? '#dc2626' : '#2563eb', background: isPos ? 'rgba(239,68,68,0.08)' : 'rgba(59,130,246,0.08)', borderRadius: 20, padding: '3px 10px' }}>
                              {isPos ? '+' : ''}{Math.round(profit).toLocaleString()}원 ({isPos ? '+' : ''}{profitRate}%)
                            </span>
                          </div>
                        </div>
                      );
                    })()}
                    {userProfile && (
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
                        <span style={{ fontSize: 11, color: '#94a3b8', fontWeight: 600 }}>💵 주문가능금액</span>
                        <span style={{ fontSize: 15, fontWeight: 800, color: '#0f172a' }}>
                          {Math.round(orderableCash).toLocaleString()}원{us && fx ? <span style={{ fontSize: 11, fontWeight: 600, color: '#94a3b8', marginLeft: 6 }}>≈ {fmtPx(orderableCash / fx, true)}</span> : null}
                        </span>
                      </div>
                    )}

                    {/* 매수 / 매도 버튼 */}
                    <div style={{ display: 'flex', gap: 10 }}>
                      <button
                        className="trade-btn"
                        onClick={() => { setTradeType('buy'); setTradeModal(true); setTradeError(''); setTradeQty(''); setTradePrice(''); setPriceType('market'); }}
                        style={{
                          flex: 1, padding: '12px 0',
                          background: 'linear-gradient(135deg,#ef4444,#dc2626)',
                          color: 'white', borderRadius: 16,
                          fontWeight: 800, fontSize: 15,
                          boxShadow: '0 4px 12px rgba(239,68,68,0.22)',
                          border: 'none', cursor: 'pointer',
                        }}
                      >
                        매수
                      </button>

                      <button
                        className="trade-btn"
                        onClick={() => {
                          if (!userHolding) return;
                          setTradeType('sell'); setTradeModal(true);
                          setTradeError(''); setTradeQty(''); setTradePrice(''); setPriceType('market');
                        }}
                        style={{
                          flex: 1, padding: '12px 0',
                          /* ✅ [UI개선] 보유 없을 때 시각적 피드백 강화 */
                          background: userHolding
                            ? 'linear-gradient(135deg,#3b82f6,#2563eb)'
                            : '#f1f5f9',
                          color: userHolding ? 'white' : '#94a3b8',
                          borderRadius: 16,
                          fontWeight: 800, fontSize: 15,
                          boxShadow: userHolding ? '0 4px 12px rgba(59,130,246,0.22)' : 'none',
                          border: userHolding ? 'none' : '1.5px dashed #cbd5e1',
                          cursor: userHolding ? 'pointer' : 'not-allowed',
                          position: 'relative', overflow: 'hidden',
                        }}
                      >
                        매도
                        {/* ✅ [UI개선] 보유 없을 때 잠금 아이콘 */}
                        {!userHolding && (
                          <span style={{
                            position: 'absolute', top: 4, right: 8,
                            fontSize: 10, color: '#cbd5e1',
                          }}>🔒</span>
                        )}
                      </button>
                    </div>
                    {sellableQty > 0 && (!us || fx) && (
                      <button onClick={() => setOcoModal(true)}
                        style={{ width: '100%', marginTop: 8, padding: '10px 0', borderRadius: 14, border: '1.5px solid #e0e7ff', background: '#eef2ff', color: '#4f46e5', fontWeight: 800, fontSize: 13, cursor: 'pointer' }}>
                        🎯 손절·익절 예약
                      </button>
                    )}
                  </div>
                </div>
              )}

              {user && !loading && chartData && <OpenOrders uid={user.uid} symbol={selectedStock.symbol} />}

    </>
  );
}
