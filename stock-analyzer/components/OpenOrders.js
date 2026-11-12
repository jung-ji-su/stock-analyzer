'use client';

import { useEffect, useState } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { closeOrder } from '@/lib/paperTrade';

// 미체결(대기) 지정가 주문 목록. symbol 이 있으면 그 종목만. 취소하면 묶어둔 금액·수량이 돌아온다.
export default function OpenOrders({ uid, symbol }) {
  const [orders, setOrders] = useState([]);
  const [busyId, setBusyId] = useState(null);

  useEffect(() => {
    if (!uid) return;
    const q = query(collection(db, 'orders'), where('userId', '==', uid), where('status', '==', 'open'));
    return onSnapshot(q, (snap) => {
      setOrders(snap.docs.map((d) => ({ id: d.id, ...d.data() })).sort((a, b) => b.createdMs - a.createdMs));
    }, (e) => console.warn('미체결 주문 조회 실패:', e.message));
  }, [uid]);

  const list = symbol ? orders.filter((o) => o.symbol === symbol) : orders;
  if (!list.length) return null;

  const cancel = async (id) => {
    setBusyId(id);
    try { await closeOrder(id, 'cancelled'); window.dispatchEvent(new Event('paper-orders-changed')); }
    catch (e) { console.warn(e.message); }
    finally { setBusyId(null); }
  };

  return (
    <div style={{ background: 'white', borderRadius: 20, border: '1px solid #e2e8f0', padding: '12px 16px', marginTop: 12, boxShadow: '0 2px 12px rgba(15,23,42,0.06)' }}>
      <p style={{ fontSize: 12, fontWeight: 800, color: '#0f172a', margin: '0 0 8px' }}>⏳ 대기 주문 <span style={{ color: '#94a3b8', fontWeight: 600 }}>· 지정가는 당일, 손절·익절은 취소 전까지</span></p>
      {list.map((o) => (
        <div key={o.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '7px 0', borderTop: '1px solid #f1f5f9', gap: 8 }}>
          <div style={{ minWidth: 0 }}>
            <span style={{ fontSize: 12, fontWeight: 800, color: o.type === 'buy' ? '#dc2626' : '#2563eb' }}>{o.kind === 'oco' ? '손절·익절' : o.type === 'buy' ? '매수' : '매도'}</span>
            <span style={{ fontSize: 12, fontWeight: 700, color: '#0f172a', marginLeft: 6 }}>{o.name}</span>
            {o.kind === 'oco' ? (
              <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>
                {o.targetPrice ? <span style={{ color: '#dc2626' }}>익절 {o.targetPrice.toLocaleString()}</span> : null}
                {o.targetPrice && o.stopPrice ? ' · ' : ''}
                {o.stopPrice ? <span style={{ color: '#2563eb' }}>손절 {o.stopPrice.toLocaleString()}</span> : null}
                {' '}· {o.quantity}주
              </p>
            ) : (
              <p style={{ fontSize: 11, color: '#64748b', margin: '2px 0 0' }}>{o.price.toLocaleString()}원 × {o.quantity}주</p>
            )}
          </div>
          <button onClick={() => cancel(o.id)} disabled={busyId === o.id}
            style={{ padding: '6px 12px', borderRadius: 10, border: '1px solid #e2e8f0', background: '#f8fafc', color: '#64748b', fontSize: 12, fontWeight: 700, cursor: 'pointer', flexShrink: 0 }}>
            {busyId === o.id ? '취소 중…' : '취소'}
          </button>
        </div>
      ))}
    </div>
  );
}
