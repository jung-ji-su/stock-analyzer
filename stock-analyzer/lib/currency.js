// 원화 지갑 + 미국 주식(달러) 표시/환산 공통 도우미.
// 미국 보유 종목: market:'US', avgPrice=달러 평균단가, totalInvested=원화 투자원금(수수료 포함)
export const isUsHolding = (h) => h?.market === 'US';

export const fmtUsd = (v) => `$${Number(v).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`;
// us=true 면 달러, 아니면 원 (원화는 반올림)
export const fmtPx = (v, us) => (us ? fmtUsd(v) : `${Math.round(v).toLocaleString('ko-KR')}원`);

// 화면 계산을 원화 기준으로 통일하기 위한 변환.
// prices: { symbol → 현지통화 현재가 }, fx: 원/달러. 반환: { prices(원화), holdings(원화 평균단가, usdAvg 보존) }
export function toKrwView(holdings, prices, fx) {
  const pk = {};
  for (const [s, p] of Object.entries(prices || {})) pk[s] = p;
  const hs = holdings.map((h) => {
    if (!isUsHolding(h)) return h;
    const avgKrw = h.quantity ? h.totalInvested / h.quantity : 0;
    if (prices?.[h.symbol] > 0 && fx > 0) pk[h.symbol] = prices[h.symbol] * fx;
    else delete pk[h.symbol]; // 시세·환율을 못 구하면 투자원금 기준으로 평가
    return { ...h, usdAvg: h.avgPrice, avgPrice: avgKrw };
  });
  return { prices: pk, holdings: hs };
}
