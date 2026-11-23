// 관심종목 (계정에 저장: profiles/{uid}.wishlist). 홈·스캐너·재무분석·증시일정이 같이 쓴다.
// 항목 형식: { symbol, name, registeredPrice, registeredAt, group }. 아주 예전 기록은 종목코드 문자열이라 읽을 때 맞춘다.
import { doc, getDoc, updateDoc } from 'firebase/firestore';
import { db } from '@/lib/db';

export const normalizeWishlist = (list) => (Array.isArray(list) ? list : [])
  .map((w) => (typeof w === 'string' ? { symbol: w, name: w, registeredPrice: 0 } : w))
  .filter((w) => w?.symbol);

export const hasWish = (list, symbol) => list.some((w) => w.symbol === symbol);

export async function loadWishlist(uid) {
  const snap = await getDoc(doc(db, 'profiles', uid));
  return normalizeWishlist(snap.data()?.wishlist);
}

export async function saveWishlist(uid, list) {
  await updateDoc(doc(db, 'profiles', uid), { wishlist: list });
  return list;
}

// 있으면 빼고 없으면 끝에 추가한 새 목록을 저장하고 돌려준다
export function toggleWish(uid, list, { symbol, name, price = 0 }) {
  const next = hasWish(list, symbol)
    ? list.filter((w) => w.symbol !== symbol)
    : [...list, { symbol, name: name || symbol, registeredPrice: price || 0, registeredAt: new Date().toISOString() }];
  return saveWishlist(uid, next);
}
