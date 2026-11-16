'use client';

import Orderbook from '@/components/Orderbook';
import TradeTape from '@/components/TradeTape';
import InvestorFlow from '@/components/InvestorFlow';
import { canUseToss, isUsStock } from '@/lib/toss';
import { motion } from 'framer-motion';

export default function MarketCard({ chartData, loading, marketTab, pickMarketTab, selectedStock, setQuery, setSelectedStock }) {
  return (
    <>
{/* 실시간 시세: 호가 | 체결 | 수급(국내) — 한 카드 안에서 탭 전환, 보이는 탭만 구독 */}
              {!loading && chartData && canUseToss(selectedStock) && (() => {
                const tabs = [['book', '호가'], ['tape', '체결'], ...(isUsStock(selectedStock) ? [] : [['flow', '수급']])];
                const cur = tabs.some(([k]) => k === marketTab) ? marketTab : 'book';
                return (
                  <div style={{ background: '#0F172A', borderRadius: 20, padding: '12px 6px 12px', boxShadow: '0 8px 24px rgba(15,23,42,0.18)' }}>
                    <div style={{ display: 'flex', gap: 4, margin: '0 8px 12px', padding: 3, borderRadius: 12, background: 'rgba(255,255,255,0.06)' }}>
                      {tabs.map(([k, label]) => (
                        <button key={k} onClick={() => pickMarketTab(k)}
                          style={{ flex: 1, padding: '7px 0', borderRadius: 9, fontSize: 12, fontWeight: 800, border: 'none', cursor: 'pointer', transition: 'background 0.2s ease, color 0.2s ease',
                            background: cur === k ? 'rgba(255,255,255,0.14)' : 'transparent', color: cur === k ? '#fff' : 'rgba(255,255,255,0.45)' }}>{label}</button>
                      ))}
                    </div>
                    <motion.div key={cur} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.2 }}>
                      {cur === 'book' && <Orderbook key={`ob-${selectedStock.symbol}`} symbol={selectedStock.symbol} us={isUsStock(selectedStock)} />}
                      {cur === 'tape' && <TradeTape key={`tt-${selectedStock.symbol}`} symbol={selectedStock.symbol} us={isUsStock(selectedStock)} />}
                      {cur === 'flow' && <InvestorFlow key={`inv-${selectedStock.symbol}`} symbol={selectedStock.symbol}
                        onPick={(st) => { setSelectedStock({ ...st, exchange: '' }); setQuery(st.name); }} />}
                    </motion.div>
                  </div>
                );
              })()}

    </>
  );
}
