const POPULAR_STOCKS = [
  { symbol: '005930', name: '삼성전자', exchange: 'KOSPI' },
  { symbol: '000660', name: 'SK하이닉스', exchange: 'KOSPI' },
  { symbol: '035420', name: 'NAVER', exchange: 'KOSPI' },
  { symbol: '035720', name: '카카오', exchange: 'KOSPI' },
  { symbol: '005380', name: '현대차', exchange: 'KOSPI' },
  { symbol: '000270', name: '기아', exchange: 'KOSPI' },
  { symbol: '068270', name: '셀트리온', exchange: 'KOSPI' },
  { symbol: '051910', name: 'LG화학', exchange: 'KOSPI' },
  { symbol: '006400', name: '삼성SDI', exchange: 'KOSPI' },
  { symbol: '105560', name: 'KB금융', exchange: 'KOSPI' },
  { symbol: '055550', name: '신한지주', exchange: 'KOSPI' },
  { symbol: '003550', name: 'LG', exchange: 'KOSPI' },
  { symbol: '017670', name: 'SK텔레콤', exchange: 'KOSPI' },
  { symbol: '030200', name: 'KT', exchange: 'KOSPI' },
  { symbol: '032830', name: '삼성생명', exchange: 'KOSPI' },
  { symbol: '028260', name: '삼성물산', exchange: 'KOSPI' },
  { symbol: '012330', name: '현대모비스', exchange: 'KOSPI' },
  { symbol: '066570', name: 'LG전자', exchange: 'KOSPI' },
  { symbol: '009150', name: '삼성전기', exchange: 'KOSPI' },
  { symbol: '034730', name: 'SK', exchange: 'KOSPI' },
  { symbol: '015760', name: '한국전력', exchange: 'KOSPI' },
  { symbol: '086790', name: '하나금융지주', exchange: 'KOSPI' },
  { symbol: '018260', name: '삼성에스디에스', exchange: 'KOSPI' },
  { symbol: '011070', name: 'LG이노텍', exchange: 'KOSPI' },
  { symbol: '207940', name: '삼성바이오로직스', exchange: 'KOSPI' },
  { symbol: '003490', name: '대한항공', exchange: 'KOSPI' },
  { symbol: '036570', name: 'NCsoft', exchange: 'KOSPI' },
  { symbol: '042700', name: '한미반도체', exchange: 'KOSPI' },
  { symbol: '373220', name: 'LG에너지솔루션', exchange: 'KOSPI' },
  { symbol: '000810', name: '삼성화재', exchange: 'KOSPI' },
  { symbol: '032640', name: 'LG유플러스', exchange: 'KOSPI' },
  { symbol: '259960', name: '크래프톤', exchange: 'KOSPI' },
  { symbol: '352820', name: '하이브', exchange: 'KOSPI' },
  { symbol: '247540', name: '에코프로비엠', exchange: 'KOSDAQ' },
  { symbol: '086520', name: '에코프로', exchange: 'KOSDAQ' },
  { symbol: '196170', name: '알테오젠', exchange: 'KOSDAQ' },
  { symbol: '293490', name: '카카오게임즈', exchange: 'KOSDAQ' },
  { symbol: '263750', name: '펄어비스', exchange: 'KOSDAQ' },
  { symbol: '041510', name: 'SM엔터테인먼트', exchange: 'KOSDAQ' },
  { symbol: '035900', name: 'JYP엔터테인먼트', exchange: 'KOSDAQ' },
  { symbol: '122870', name: '와이지엔터테인먼트', exchange: 'KOSDAQ' },
  { symbol: '091990', name: '셀트리온헬스케어', exchange: 'KOSDAQ' },
  { symbol: '145020', name: '휴젤', exchange: 'KOSDAQ' },
  { symbol: '214150', name: '클래시스', exchange: 'KOSDAQ' },
  { symbol: '096770', name: 'SK이노베이션', exchange: 'KOSPI' },
  { symbol: '011200', name: 'HMM', exchange: 'KOSPI' },
  { symbol: '316140', name: '우리금융지주', exchange: 'KOSPI' },
  { symbol: '138040', name: '메리츠금융지주', exchange: 'KOSPI' },
  { symbol: '024110', name: '기업은행', exchange: 'KOSPI' },
  { symbol: '251270', name: '넷마블', exchange: 'KOSPI' },
  { symbol: '112040', name: '위메이드', exchange: 'KOSDAQ' },
  { symbol: '067160', name: '아프리카TV', exchange: 'KOSDAQ' },
  { symbol: '053800', name: '안랩', exchange: 'KOSDAQ' },
];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim().toLowerCase();

  if (!query) return Response.json({ results: [] });

  // 1. 인기 종목에서 먼저 검색
  const localResults = POPULAR_STOCKS.filter(
    (stock) =>
      stock.name.toLowerCase().includes(query) ||
      stock.symbol.includes(query)
  );

  // 2. KRX API로 추가 검색
  try {
    const res = await fetch(
      'https://kind.krx.co.kr/common/searchcorpname.do?method=searchCorpNameJson&searchCodeType=&searchCorpName=' +
      encodeURIComponent(query),
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://kind.krx.co.kr',
          'Accept': 'application/json',
        },
      }
    );

    const data = await res.json();
    const list = Array.isArray(data) ? data : (data.result || []);
    const krxResults = list.map((item) => ({
      symbol: item.repisusrtcd?.replace('A', '') || item.kiscomcd,
      name: item.repisusrtkornm || item.comabbrv,
      exchange: item.spotisutrdmkttpcd === '2' ? 'KOSDAQ' : 'KOSPI',
    })).filter((item) => item.symbol && item.name);

    // 3. 로컬 + KRX 합치되 중복 제거
    const combined = [...localResults];
    krxResults.forEach((krx) => {
      if (!combined.find((l) => l.symbol === krx.symbol)) {
        combined.push(krx);
      }
    });

    return Response.json({ results: combined.slice(0, 8) });
  } catch {
    return Response.json({ results: localResults.slice(0, 8) });
  }
}