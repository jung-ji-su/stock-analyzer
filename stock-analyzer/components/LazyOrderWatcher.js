'use client';

// 미체결 주문 감시는 로그인했을 때만 필요해서, Firestore 를 쓰는 OrderWatcher 를 그때 따로 받는다
import dynamic from 'next/dynamic';
import { useAuth } from '@/lib/AuthContext';

const OrderWatcher = dynamic(() => import('@/components/OrderWatcher'), { ssr: false });

export default function LazyOrderWatcher() {
  const { user } = useAuth();
  return user ? <OrderWatcher /> : null;
}
