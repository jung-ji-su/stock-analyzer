// 모의투자 체결 엔진 (국내 주식). 비용 기준은 한 곳에서 바꿀 수 있게 상수로 둔다.
import { runTransaction, doc, collection, serverTimestamp } from 'firebase/firestore';
import { db } from '@/lib/firebase';
import { fetchMarketCalendar, fetchPriceLimits, fetchLastPrice, fetchPrices, fetchBarsBetween } from '@/lib/toss';
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

// 가격을 호가단위에 맞춰 반올림 (버튼으로 % 입력할 때 사용)
export function snapTick(price, name = '') {
  const t = tickSize(price, name);
  const p = Math.round(price / t) * t;
  const t2 = tickSize(p, name);
  return t2 === t ? p : Math.round(price / t2) * t2;
}

// 주문 전 검사 + 체결 방식 결정. 문제가 있으면 한국어 메시지로 throw.
// 반환: { mode: 'fill', price }  지금 체결 (시장가, 또는 바로 체결되는 지정가는 현재가로)
//       { mode: 'rest', price }  미체결 대기 (지정가가 아직 닿지 않음)
export async function prepareOrder({ symbol, name, type, priceType, limitPrice, fallbackPrice }) {
  let cur = null;
  try { cur = await fetchLastPrice(symbol); } catch {}
  if (!cur) cur = fallbackPrice;
  if (!(cur > 0)) throw new Error('현재가를 확인하지 못했습니다');

  try {
    const st = statusOf(await fetchMarketCalendar('KR'), false, Date.now());
    if (st.tone === 'closed') throw Object.assign(new Error(`장 운영시간이 아닙니다 (${st.text}${st.sub ? ' · ' + st.sub : ''})`), { fatal: true });
  } catch (e) { if (e.fatal) throw e; }

  if (priceType === 'market') return { mode: 'fill', price: cur };

  const p = Number(limitPrice);
  const tick = tickSize(p, name);
  if (!(p > 0) || p % tick !== 0) throw new Error(`호가단위(${tick}원)에 맞게 입력해주세요`);
  try {
    const lim = await fetchPriceLimits(symbol);
    const up = parseFloat(lim?.upperLimitPrice), lo = parseFloat(lim?.lowerLimitPrice);
    if (up > 0 && p > up) throw Object.assign(new Error(`상한가(${up.toLocaleString()}원)를 넘을 수 없습니다`), { fatal: true });
    if (lo > 0 && p < lo) throw Object.assign(new Error(`하한가(${lo.toLocaleString()}원) 아래로 낼 수 없습니다`), { fatal: true });
  } catch (e) { if (e.fatal) throw e; }
  const marketable = type === 'buy' ? p >= cur : p <= cur;
  return marketable ? { mode: 'fill', price: cur } : { mode: 'rest', price: p };
}

// ── 한 트랜잭션 안에서 체결을 반영한다 (현금·보유·거래 기록). release: 대기 주문이 잡아둔 예약분
const availCash = (p) => (p.cash || 0) - (p.reservedCash || 0);

function settle(tx, c, { price, qty, orderType, extra = {}, release = {} }) {
  const { uid, symbol, name, type, profileRef, holdingRef, tradeRef, p, h } = c;
  const amount = price * qty;
  const { fee, tax } = calcCosts(type, amount);
  const base = { userId: uid, symbol, name, type, price, quantity: qty, amount, fee, tax, orderType, createdAt: serverTimestamp(), ...extra };
  const reservedCash = Math.max(0, (p.reservedCash || 0) - (release.cash || 0));

  if (type === 'buy') {
    const cost = amount + fee;
    if (cost > availCash(p) + (release.cash || 0)) throw new Error('주문가능금액이 부족합니다 (수수료 포함)');
    const newQty = (h?.quantity || 0) + qty;
    tx.set(holdingRef, {
      userId: uid, symbol, name, quantity: newQty,
      avgPrice: h ? Math.round((h.avgPrice * h.quantity + amount) / newQty) : price,
      totalInvested: (h?.totalInvested || 0) + cost,
      reservedQty: h?.reservedQty || 0,
    });
    tx.update(profileRef, { cash: p.cash - cost, reservedCash });
    tx.set(tradeRef, { ...base, cashDelta: -cost });
    return { fee, tax, cashDelta: -cost };
  }

  if (!h || qty > h.quantity - (h.reservedQty || 0) + (release.qty || 0)) throw new Error('매도 가능 수량이 부족합니다');
  const net = amount - fee - tax;
  const costBasis = h.totalInvested ? (h.totalInvested * qty) / h.quantity : h.avgPrice * qty;
  const profit = Math.round(net - costBasis);
  const newQty = h.quantity - qty;
  if (newQty <= 0) tx.delete(holdingRef);
  else tx.update(holdingRef, {
    quantity: newQty, totalInvested: Math.round((h.totalInvested || h.avgPrice * h.quantity) - costBasis),
    reservedQty: Math.max(0, (h.reservedQty || 0) - (release.qty || 0)),
  });
  tx.update(profileRef, { cash: p.cash + net, reservedCash });
  tx.set(tradeRef, { ...base, cashDelta: net, profit, profitRate: ((profit / costBasis) * 100).toFixed(2) });
  return { fee, tax, cashDelta: net, profit };
}

const refsOf = (uid, symbol) => ({
  profileRef: doc(db, 'profiles', uid),
  holdingRef: doc(db, 'holdings', `${uid}_${symbol}`),
  tradeRef: doc(collection(db, 'trades')),
});

// 즉시 체결 (시장가 등)
export async function executeFill({ uid, symbol, name, type, price, qty, orderType = 'market' }) {
  const refs = refsOf(uid, symbol);
  return runTransaction(db, async (tx) => {
    const [pSnap, hSnap] = await Promise.all([tx.get(refs.profileRef), tx.get(refs.holdingRef)]);
    if (!pSnap.exists()) throw new Error('사용자 정보를 찾을 수 없습니다');
    return settle(tx, { uid, symbol, name, type, ...refs, p: pSnap.data(), h: hSnap.exists() ? hSnap.data() : null }, { price, qty, orderType });
  });
}

// ── 지정가 대기 주문 ─────────────────────────────────────────────────────────
// 당일 주문: 생성일 20:00(KST, 대체거래소 종료) 에 만료
export function expiryOf(createdMs) {
  const d = new Date(createdMs + 9 * 3600e3);
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 20) - 9 * 3600e3;
}

export async function placeLimitOrder({ uid, symbol, name, type, price, qty }) {
  const profileRef = doc(db, 'profiles', uid);
  const holdingRef = doc(db, 'holdings', `${uid}_${symbol}`);
  const orderRef = doc(collection(db, 'orders'));
  const createdMs = Date.now();
  return runTransaction(db, async (tx) => {
    const [pSnap, hSnap] = await Promise.all([tx.get(profileRef), tx.get(holdingRef)]);
    if (!pSnap.exists()) throw new Error('사용자 정보를 찾을 수 없습니다');
    const p = pSnap.data(), h = hSnap.exists() ? hSnap.data() : null;
    let reserved;
    if (type === 'buy') {
      const amount = price * qty;
      reserved = amount + calcCosts('buy', amount).fee; // 매수 대금 + 수수료를 묶어둔다
      if (reserved > availCash(p)) throw new Error('주문가능금액이 부족합니다 (수수료 포함)');
      tx.update(profileRef, { reservedCash: (p.reservedCash || 0) + reserved });
    } else {
      reserved = qty; // 매도 수량을 묶어둔다
      if (!h || qty > h.quantity - (h.reservedQty || 0)) throw new Error('매도 가능 수량이 부족합니다');
      tx.update(holdingRef, { reservedQty: (h.reservedQty || 0) + qty });
    }
    tx.set(orderRef, {
      userId: uid, symbol, name, type, price, quantity: qty, reserved, status: 'open',
      createdMs, expiresAt: expiryOf(createdMs), createdAt: serverTimestamp(),
    });
    return { id: orderRef.id };
  });
}

// 대기 주문을 끝낸다: 'cancelled'(사용자 취소) | 'expired'(만료). 예약분 반환. 이미 끝났으면 null
export async function closeOrder(orderId, status = 'cancelled') {
  const orderRef = doc(db, 'orders', orderId);
  return runTransaction(db, async (tx) => {
    const oSnap = await tx.get(orderRef);
    if (!oSnap.exists() || oSnap.data().status !== 'open') return null;
    const o = oSnap.data();
    const profileRef = doc(db, 'profiles', o.userId);
    const holdingRef = doc(db, 'holdings', `${o.userId}_${o.symbol}`);
    if (o.type === 'buy') {
      const pSnap = await tx.get(profileRef);
      tx.update(profileRef, { reservedCash: Math.max(0, (pSnap.data()?.reservedCash || 0) - o.reserved) });
    } else {
      const hSnap = await tx.get(holdingRef);
      if (hSnap.exists()) tx.update(holdingRef, { reservedQty: Math.max(0, (hSnap.data().reservedQty || 0) - o.reserved) });
    }
    tx.update(orderRef, { status, closedAt: serverTimestamp() });
    return { status };
  });
}

// 대기 주문 체결. price 를 주지 않으면 지정가, OCO 는 발동 가격(price)과 이유(why: 'target'|'stop')를 준다.
// 이미 처리됐으면 null (여러 기기에서 동시에 돌아도 한 번만 체결)
export async function fillOrder(orderId, price, why) {
  const orderRef = doc(db, 'orders', orderId);
  return runTransaction(db, async (tx) => {
    const oSnap = await tx.get(orderRef);
    if (!oSnap.exists() || oSnap.data().status !== 'open') return null;
    const o = oSnap.data();
    const refs = refsOf(o.userId, o.symbol);
    const [pSnap, hSnap] = await Promise.all([tx.get(refs.profileRef), tx.get(refs.holdingRef)]);
    const release = o.type === 'buy' ? { cash: o.reserved } : { qty: o.reserved };
    const fillPrice = price ?? o.price;
    const r = settle(tx, { uid: o.userId, symbol: o.symbol, name: o.name, type: o.type, ...refs, p: pSnap.data(), h: hSnap.exists() ? hSnap.data() : null },
      { price: fillPrice, qty: o.quantity, orderType: why || 'limit', extra: { orderId }, release });
    tx.update(orderRef, { status: 'filled', closedAt: serverTimestamp(), fillPrice, ...(why ? { trigger: why } : {}) });
    return r;
  });
}

// ── 손절·익절 예약 (OCO) ──────────────────────────────────────────────────────
// 보유 종목의 수량을 묶어두고, 현재가가 익절가 이상이면 익절가로, 손절가 이하이면 발동 시점 가격으로 매도한다.
// 둘 중 하나가 체결되면 주문이 끝나므로 다른 쪽은 자동으로 취소된다. 취소하거나 체결될 때까지 유지(만료 없음).
export async function prepareOco({ symbol, name, targetPrice, stopPrice, fallbackPrice }) {
  const t = targetPrice ? Number(targetPrice) : null, st = stopPrice ? Number(stopPrice) : null;
  if (!t && !st) throw new Error('익절가나 손절가 중 하나는 입력해주세요');
  let cur = null;
  try { cur = await fetchLastPrice(symbol); } catch {}
  if (!cur) cur = fallbackPrice;
  if (!(cur > 0)) throw new Error('현재가를 확인하지 못했습니다');
  if (t && t <= cur) throw new Error(`익절가는 현재가(${cur.toLocaleString()}원)보다 높아야 합니다`);
  if (st && st >= cur) throw new Error(`손절가는 현재가(${cur.toLocaleString()}원)보다 낮아야 합니다`);
  for (const [label, p] of [['익절가', t], ['손절가', st]]) {
    if (!p) continue;
    const tick = tickSize(p, name);
    if (p % tick !== 0) throw new Error(`${label}를 호가단위(${tick}원)에 맞게 입력해주세요`);
  }
  try {
    const lim = await fetchPriceLimits(symbol);
    const up = parseFloat(lim?.upperLimitPrice), lo = parseFloat(lim?.lowerLimitPrice);
    if (t && up > 0 && t > up) throw Object.assign(new Error(`익절가가 오늘 상한가(${up.toLocaleString()}원)를 넘습니다`), { fatal: true });
    if (st && lo > 0 && st < lo) throw Object.assign(new Error(`손절가가 오늘 하한가(${lo.toLocaleString()}원) 아래입니다`), { fatal: true });
  } catch (e) { if (e.fatal) throw e; }
  return { targetPrice: t, stopPrice: st };
}

export async function placeOco({ uid, symbol, name, qty, targetPrice, stopPrice }) {
  const holdingRef = doc(db, 'holdings', `${uid}_${symbol}`);
  const orderRef = doc(collection(db, 'orders'));
  return runTransaction(db, async (tx) => {
    const hSnap = await tx.get(holdingRef);
    const h = hSnap.exists() ? hSnap.data() : null;
    if (!h || qty > h.quantity - (h.reservedQty || 0)) throw new Error('매도 가능 수량이 부족합니다');
    tx.update(holdingRef, { reservedQty: (h.reservedQty || 0) + qty });
    tx.set(orderRef, {
      userId: uid, symbol, name, type: 'sell', kind: 'oco', quantity: qty, reserved: qty,
      targetPrice: targetPrice || null, stopPrice: stopPrice || null,
      status: 'open', createdMs: Date.now(), expiresAt: null, createdAt: serverTimestamp(),
    });
    return { id: orderRef.id };
  });
}

// OCO 가 봉에서 발동했는지 (시간순으로 살피고, 같은 봉에서 둘 다 닿으면 손절 우선 — 보수적).
// 반환 { why, price } 또는 null(안 닿음) / undefined(조회 실패)
async function ocoHitByBars(o, nowMs) {
  try {
    let { bars, reached } = await fetchBarsBetween(o.symbol, '1m', o.createdMs, nowMs);
    if (!reached) bars = (await fetchBarsBetween(o.symbol, '1d', o.createdMs, nowMs, 3)).bars; // 분봉으로 못 닿는 오래된 주문은 일봉으로
    for (const b of [...bars].reverse()) {
      if (o.stopPrice && b.low <= o.stopPrice) return { why: 'stop', price: Math.min(o.stopPrice, b.open) };
      if (o.targetPrice && b.high >= o.targetPrice) return { why: 'target', price: o.targetPrice };
    }
    return null;
  } catch { return undefined; }
}

// 봉으로 확인: 주문 이후(만료 전까지) 가격이 지정가에 닿았는지. 조회 실패 시 null(다음에 다시)
async function touchedByBars(o, nowMs) {
  const end = Math.min(nowMs, o.expiresAt);
  const hit = (b) => (o.type === 'buy' ? b.low <= o.price : b.high >= o.price);
  try {
    const { bars } = await fetchBarsBetween(o.symbol, '1m', o.createdMs, end);
    return bars.some(hit);
  } catch { return null; }
}

// 열려 있는 대기 주문들을 확인해 체결/만료 처리한다. 반환: [{ order, result: 'filled'|'expired', info, why }]
export async function matchOrders(orders, { withBars = false } = {}) {
  const now = Date.now();
  const events = [];
  const alive = (o) => !o.expiresAt || now <= o.expiresAt;
  let prices = new Map();
  try { prices = await fetchPrices([...new Set(orders.filter(alive).map((o) => o.symbol))]); } catch {}

  for (const o of orders) {
    try {
      // 손절·익절 (OCO): 현재가 → 필요하면 봉으로 놓친 구간 확인
      if (o.kind === 'oco') {
        let trig = null;
        const p = prices.get(o.symbol);
        if (p) {
          if (o.stopPrice && p <= o.stopPrice) trig = { why: 'stop', price: p };
          else if (o.targetPrice && p >= o.targetPrice) trig = { why: 'target', price: o.targetPrice };
        }
        if (!trig && withBars) trig = (await ocoHitByBars(o, now)) || null;
        if (trig) { const info = await fillOrder(o.id, trig.price, trig.why); if (info) events.push({ order: o, result: 'filled', info, why: trig.why }); }
        continue;
      }

      let hit = false;
      if (!alive(o)) {
        const t = await touchedByBars(o, now);
        if (t === null) continue; // 조회 실패 → 다음 기회에
        hit = t;
        if (!hit) { if (await closeOrder(o.id, 'expired')) events.push({ order: o, result: 'expired' }); continue; }
      } else {
        const p = prices.get(o.symbol);
        hit = p ? (o.type === 'buy' ? p <= o.price : p >= o.price) : false;
        if (!hit && withBars) hit = (await touchedByBars(o, now)) === true;
      }
      if (hit) { const info = await fillOrder(o.id); if (info) events.push({ order: o, result: 'filled', info }); }
    } catch (e) { console.warn('대기 주문 처리 실패:', o.id, e.message); }
  }
  return events;
}
