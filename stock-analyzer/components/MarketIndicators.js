'use client';

import { useEffect, useState } from 'react';
import { fetchIndexInvestorTrading } from '@/lib/toss';

const WHO = [['foreigner', '외국인'], ['institution', '기관'], ['individual', '개인']];
const num = (v) => parseFloat(v) || 0;
const fmtEok = (n) => `${n > 0 ? '+' : ''}${Math.round(n / 1e8).toLocaleString('ko-KR')}억`;

// KOSPI/KOSDAQ 투자자별 순매수 최근 거래일 (토스 market-indicators)
export default function MarketIndicators() {
  const [idx, setIdx] = useState('KOSPI');
  const [flow, setFlow] = useState({}); // { KOSPI: record, KOSDAQ: record }

  useEffect(() => {
    if (flow[idx]) return;
    let alive = true;
    fetchIndexInvestorTrading(idx, 1)
      .then((r) => { if (alive) setFlow((f) => ({ ...f, [idx]: r?.records?.[0] || null })); })
      .catch(() => { if (alive) setFlow((f) => ({ ...f, [idx]: null })); });
    return () => { alive = false; };
  }, [idx, flow]);

  const rec = flow[idx];
  const loadedFlow = idx in flow;
  const pill = (on) => ({ padding: '3px 10px', borderRadius: 999, fontSize: 11, fontWeight: 700, border: 'none', cursor: 'pointer', background: on ? '#6366f1' : '#F1F5F9', color: on ? '#fff' : '#64748b' });

  return (
    <div style={{ background: 'white', borderRadius: 20, border: '1.5px solid #E2E8F0', boxShadow: '0 2px 12px rgba(0,0,0,0.06)', padding: 16, marginBottom: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 8px' }}>
        <h2 style={{ fontSize: 14, fontWeight: 800, color: '#111827', margin: 0 }}>🏦 지수 투자자 수급</h2>
        <div style={{ display: 'flex', gap: 6 }}>
          {['KOSPI', 'KOSDAQ'].map((k) => <button key={k} style={pill(idx === k)} onClick={() => setIdx(k)}>{k}</button>)}
        </div>
      </div>
      {!loadedFlow ? <div className="sk" style={{ height: 40 }} /> : !rec ? (
        <p style={{ fontSize: 12, color: '#94A3B8', margin: 0 }}>수급 데이터를 불러오지 못했어요</p>
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 8 }}>
            {WHO.map(([k, label]) => {
              const net = rec[k] ? num(rec[k].buyAmount) - num(rec[k].sellAmount) : null;
              return (
                <div key={k} style={{ background: '#F8FAFC', borderRadius: 12, padding: '8px 10px', textAlign: 'center' }}>
                  <div style={{ fontSize: 10, color: '#94A3B8' }}>{label}</div>
                  <div style={{ fontSize: 13, fontWeight: 800, color: net == null ? '#94A3B8' : net >= 0 ? '#EF4444' : '#3B82F6' }}>{net == null ? '-' : fmtEok(net)}</div>
                </div>
              );
            })}
          </div>
          <p style={{ fontSize: 10, color: '#94A3B8', margin: '6px 0 0' }}>{rec.date} 순매수 금액 · 빨강 순매수, 파랑 순매도 · 당일은 잠정치일 수 있어요</p>
        </>
      )}
    </div>
  );
}
