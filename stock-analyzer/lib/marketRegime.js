// 오늘 시장 국면 (VM 수집기 /stats/regime, 로그인 없이 받는 공개 통계). 서버·브라우저 어디서나 쓴다.
// regime: 0 보통 / 1 약세(시장 지수가 20일 평균 아래) / 2 급락(5거래일 −3% 넘게). 시장 = 시총 상위 100종목 평균.
// 시장 분위기 검증(collector /stats/market, 2024-10~2026-11 4.9만 건):
//   매수 점수 85+ 전체 ↑47.9% ↓34.6% → 약세 국면만 빼면 ↑50.8% ↓32.2% (앞·뒤 기간 모두 개선)
//   약세 국면의 85+ 는 23건뿐이지만 ↑17.4% ↓56.5%, 70~84 도 약세에선 ↑32.8% ↓43.5% (1,643건)
//   급락 국면은 오히려 반등이 많아서(↑46%) 막지 않는다
const GATEWAY = process.env.NEXT_PUBLIC_TOSS_GATEWAY_URL || 'https://jisu-willberich.duckdns.org';

export const WEAK = 1;

// 실패하면 null (못 받았다고 매매를 막지는 않는다)
export async function fetchMarketRegime() {
  try {
    const r = await fetch(`${GATEWAY}/stats/regime`, { signal: AbortSignal.timeout(8000), cache: 'no-store' });
    if (!r.ok) return null;
    return (await r.json()).result || null;
  } catch { return null; }
}
