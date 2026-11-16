// 화면에서 쓰는 현재가·종목명 조회 공통 (브라우저 전용)
import { isUsHolding } from '@/lib/currency';
import { fetchPrices as fetchTossPrices, fetchFxRate } from '@/lib/toss';

// 국내 종목 현재가·한글 종목명 (네이버). 실패한 종목은 빠진다
export async function fetchKrQuotes(symbols) {
  const prices = {}, names = {};
  await Promise.all([...new Set(symbols)].map(async (s) => {
    try {
      const d = await (await fetch(`/api/naver-stock?symbol=${encodeURIComponent(s)}`)).json();
      if (d.currentPrice > 0) prices[s] = d.currentPrice;
      if (d.koreanName) names[s] = d.koreanName;
    } catch { /* 이 종목만 빠짐 */ }
  }));
  return { prices, names };
}

// 모의투자 보유 종목 평가용 시세. 국내는 네이버(원), 미국은 토스 시세(달러) + 원/달러 환율.
// 토스는 본인 로그인 전용이라 실패할 수 있고, 그러면 미국 종목은 빠진다 (toKrwView 가 투자원금 기준으로 평가)
export async function fetchHoldingQuotes(holdings) {
  const us = [...new Set(holdings.filter(isUsHolding).map((h) => h.symbol))];
  const { prices, names } = await fetchKrQuotes(holdings.filter((h) => !isUsHolding(h)).map((h) => h.symbol));
  let fx = null;
  if (us.length) {
    try {
      for (const [s, p] of await fetchTossPrices(us)) prices[s] = p;
      fx = await fetchFxRate();
    } catch { /* 투자원금 기준 */ }
  }
  return { prices, names, fx };
}
