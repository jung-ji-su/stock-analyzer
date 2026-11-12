// 모의투자 체결 엔진 (국내 주식). 비용 기준은 한 곳에서 바꿀 수 있게 상수로 둔다.
import { runTransaction, doc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { fetchMarketCalendar, fetchPriceLimits, fetchLastPrice } from '@/lib/toss';
import { statusOf } from '@/components/StockStatus';

// 수수료: 토스 안내 KRX 0.015%. 매도세: 2026년 코스피 0.05%+농특세 0.15%, 코스닥 0.20% 자료 기준 0.20%
export const COSTS = { feeRate: 0.00015, sellTaxRate: 0.002 };

// 호가단위. 주식: 가격대별, ETF: 2천원 미만 1원 / 이상 5원 (ETF 는 이름으로 판별)
const ETF_RE = /^(KODEX|TIGER|ACE|RISE|SOL|HANARO|KBSTAR|ARIRANG|PLUS|KOSEF|TIMEFOLIO|1Q|WON|BNK|히어로즈|TREX|마이티|KIWOOM)/i;
export function tickSize(price, name = '') {
  if (ETF_RE.test(name)) return price < 2000 ? 1 : 5;
  if (price < 2000) return 1;
  if (price < 5000) return 5;
  if (price < 20000) return 10;
  if (price < 50000) return 50;
  if (price < 200000) return 100;
  if (price < 500000) return 500;
  return 1000;
}

export function calcCosts(type, amount) {
  const fee = Math.floor(amount * COSTS.feeRate);
  const tax = type === 'sell' ? Math.floor(amount * COSTS.sellTaxRate) : 0;
  return { fee, tax };
}

// 주문 전 검사 + 체결가 결정. 문제가 있으면 한국어 메시지로 throw.
export async function prepareOrder({ symbol, name, type, priceType, limitPrice, fallbackPrice }) {
  let cur = null;
  try { cur = await fetchLastPrice(symbol); } catch {}
  if (!cur) cur = fallbackPrice;
  if (!(cur > 0)) throw new Error('현재가를 확인하지 못했습니다');

  try {
    const st = statusOf(await fetchMarketCalendar('KR'), false, Date.now());
    if (st.tone === 'closed') throw Object.assign(new Error(`장 운영시간이 아닙니다 (${st.text}${st.sub ? ' · ' + st.sub : ''})`), { fatal: true });
  } catch (e) { if (e.fatal) throw e; }

  if (priceType === 'market') return { price: cur };

  const p = Number(limitPrice);
  const tick = tickSize(p, name);
  if (!(p > 0) || p % tick !== 0) throw new Error(`호가단위(${tick}원)에 맞게 입력해주세요`);
  try {
    const lim = await fetchPriceLimits(symbol);
    const up = parseFloat(lim?.upperLimitPrice), lo = parseFloat(lim?.lowerLimitPrice);
    if (up > 0 && p > up) throw Object.assign(new Error(`상한가(${up.toLocaleString()}원)를 넘을 수 없습니다`), { fatal: true });
    if (lo > 0 && p < lo) throw Object.assign(new Error(`하한가(${lo.toLocaleString()}원) 아래로 낼 수 없습니다`), { fatal: true });
  } catch (e) { if (e.fatal) throw e; }
  // 즉시 체결 가능한 지정가만 체결(유리한 쪽 현재가로). 나머지는 미체결 대기 주문이 필요 — 다음 단계에서 지원
  if (type === 'buy' && p < cur) throw new Error(`현재가(${cur.toLocaleString()}원)보다 낮은 매수 지정가는 미체결 대기 주문 기능(준비 중)이 필요합니다`);
  if (type === 'sell' && p > cur) throw new Error(`현재가(${cur.toLocaleString()}원)보다 높은 매도 지정가는 미체결 대기 주문 기능(준비 중)이 필요합니다`);
  return { price: cur };
}

// 현금·보유·거래 기록을 한 트랜잭션으로 처리한다 (중간 실패 시 전부 취소).
export async function executeFill({ uid, symbol, name, type, price, qty, orderType = 'market' }) {
  const amount = price * qty;
  const { fee, tax } = calcCosts(type, amount);
  const profileRef = doc(db, 'profiles', uid);
  const holdingRef = doc(db, 'holdings', `${uid}_${symbol}`);
  const tradeRef = doc(collection(db, 'trades'));

  return runTransaction(db, async (tx) => {
    const [pSnap, hSnap] = await Promise.all([tx.get(profileRef), tx.get(holdingRef)]);
    if (!pSnap.exists()) throw new Error('사용자 정보를 찾을 수 없습니다');
    const cash = pSnap.data().cash || 0;
    const h = hSnap.exists() ? hSnap.data() : null;
    const base = { userId: uid, symbol, name, type, price, quantity: qty, amount, fee, tax, orderType, createdAt: serverTimestamp() };

    if (type === 'buy') {
      const cost = amount + fee;
      if (cost > cash) throw new Error('보유 현금이 부족합니다 (수수료 포함)');
      const newQty = (h?.quantity || 0) + qty;
      tx.set(holdingRef, {
        userId: uid, symbol, name, quantity: newQty,
        avgPrice: h ? Math.round((h.avgPrice * h.quantity + amount) / newQty) : price,
        totalInvested: (h?.totalInvested || 0) + cost,
      });
      tx.update(profileRef, { cash: cash - cost });
      tx.set(tradeRef, { ...base, cashDelta: -cost });
      return { fee, tax, cashDelta: -cost };
    }

    if (!h || qty > h.quantity) throw new Error('보유 수량이 부족합니다');
    const net = amount - fee - tax;
    const costBasis = h.totalInvested ? (h.totalInvested * qty) / h.quantity : h.avgPrice * qty;
    const profit = Math.round(net - costBasis);
    const newQty = h.quantity - qty;
    if (newQty <= 0) tx.delete(holdingRef);
    else tx.update(holdingRef, { quantity: newQty, totalInvested: Math.round((h.totalInvested || h.avgPrice * h.quantity) - costBasis) });
    tx.update(profileRef, { cash: cash + net });
    tx.set(tradeRef, { ...base, cashDelta: net, profit, profitRate: ((profit / costBasis) * 100).toFixed(2) });
    return { fee, tax, cashDelta: net, profit };
  });
}
