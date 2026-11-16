// 네이버 모바일 증권 시세 (서버 전용)
export const NAVER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// 종목 기본 정보 원본 JSON (현재가·등락률·종목명 등). 실패하면 예외
export async function naverBasicRaw(code) {
  const res = await fetch(`https://m.stock.naver.com/api/stock/${encodeURIComponent(code)}/basic`, {
    signal: AbortSignal.timeout(8000),
    headers: { 'User-Agent': NAVER_UA, Referer: 'https://m.stock.naver.com', Accept: 'application/json' },
  });
  if (!res.ok) throw new Error(`네이버 시세 ${res.status}`);
  return res.json();
}

const num = (v) => (v == null ? null : Number(String(v).replace(/,/g, '')));

// 현재가·전일대비·등락률·한글 종목명. 실패하면 null
export async function fetchNaverBasic(code) {
  try {
    const d = await naverBasicRaw(code);
    const price = num(d.closePrice ?? d.stockEndPrice);
    return {
      price: price > 0 ? price : null,
      change: num(d.compareToPreviousClosePrice) ?? 0,
      changePercent: num(d.fluctuationsRatio) ?? 0,
      name: d.stockName || d.stockNameEng || '',
    };
  } catch (e) {
    console.error(`네이버 시세 실패 [${code}]:`, e.message);
    return null;
  }
}
