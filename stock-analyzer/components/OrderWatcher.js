'use client';

import { useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { useAuth } from '@/lib/AuthContext';
import { useToast } from '@/components/Toast';
import { matchOrders } from '@/lib/paperTrade';

// 앱이 열려 있는 동안 미체결 주문을 확인한다: 15초마다 현재가, 1분마다(그리고 열 때) 1분봉으로 놓친 구간까지 확인.
export default function OrderWatcher() {
  const { user } = useAuth();
  const { addToast } = useToast();
  const toast = useRef(addToast); // addToast 는 렌더마다 새로 만들어져서 ref 로 최신본만 들고 있는다
  useEffect(() => { toast.current = addToast; });

  useEffect(() => {
    if (!user) return;
    let orders = [], busy = false, lastBars = 0;

    const tick = async (force) => {
      if (busy || !orders.length || document.hidden) return;
      busy = true;
      try {
        const withBars = force || Date.now() - lastBars > 60000;
        if (withBars) lastBars = Date.now();
        const events = await matchOrders(orders, { withBars });
        for (const { order: o, result } of events) {
          const side = o.type === 'buy' ? '매수' : '매도';
          if (result === 'filled') toast.current(`${o.name} ${side} ${o.price.toLocaleString()}원 ${o.quantity}주 체결`, 'success');
          else toast.current(`${o.name} ${side} 주문이 만료되어 취소됐습니다`, 'info');
        }
        if (events.length) window.dispatchEvent(new Event('paper-orders-changed'));
      } finally { busy = false; }
    };

    const q = query(collection(db, 'orders'), where('userId', '==', user.uid), where('status', '==', 'open'));
    const unsub = onSnapshot(q, (snap) => {
      orders = snap.docs.map((d) => ({ id: d.id, ...d.data() }));
      tick(true);
    }, (e) => console.warn('미체결 주문 감시 실패:', e.message));
    const id = setInterval(() => tick(false), 15000);
    const onVisible = () => { if (!document.hidden) tick(true); };
    document.addEventListener('visibilitychange', onVisible);
    return () => { unsub(); clearInterval(id); document.removeEventListener('visibilitychange', onVisible); };
  }, [user]);

  return null;
}
