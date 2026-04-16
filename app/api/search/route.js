const KOREAN_STOCKS = [
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
  { symbol: '096770', name: 'SK이노베이션', exchange: 'KOSPI' },
  { symbol: '017670', name: 'SK텔레콤', exchange: 'KOSPI' },
  { symbol: '030200', name: 'KT', exchange: 'KOSPI' },
  { symbol: '032830', name: '삼성생명', exchange: 'KOSPI' },
  { symbol: '028260', name: '삼성물산', exchange: 'KOSPI' },
  { symbol: '012330', name: '현대모비스', exchange: 'KOSPI' },
  { symbol: '066570', name: 'LG전자', exchange: 'KOSPI' },
  { symbol: '009150', name: '삼성전기', exchange: 'KOSPI' },
  { symbol: '034730', name: 'SK', exchange: 'KOSPI' },
  { symbol: '015760', name: '한국전력', exchange: 'KOSPI' },
  { symbol: '011200', name: 'HMM', exchange: 'KOSPI' },
  { symbol: '086790', name: '하나금융지주', exchange: 'KOSPI' },
  { symbol: '018260', name: '삼성에스디에스', exchange: 'KOSPI' },
  { symbol: '011070', name: 'LG이노텍', exchange: 'KOSPI' },
  { symbol: '000100', name: '유한양행', exchange: 'KOSPI' },
  { symbol: '207940', name: '삼성바이오로직스', exchange: 'KOSPI' },
  { symbol: '006035', name: '고려아연', exchange: 'KOSPI' },
  { symbol: '003490', name: '대한항공', exchange: 'KOSPI' },
  { symbol: '036570', name: 'NCsoft', exchange: 'KOSPI' },
  { symbol: '251270', name: '넷마블', exchange: 'KOSPI' },
  { symbol: '042700', name: '한미반도체', exchange: 'KOSPI' },
  { symbol: '373220', name: 'LG에너지솔루션', exchange: 'KOSPI' },
  { symbol: '000810', name: '삼성화재', exchange: 'KOSPI' },
  { symbol: '032640', name: 'LG유플러스', exchange: 'KOSPI' },
  { symbol: '010130', name: '고려아연', exchange: 'KOSPI' },
  { symbol: '024110', name: '기업은행', exchange: 'KOSPI' },
  { symbol: '138040', name: '메리츠금융지주', exchange: 'KOSPI' },
  { symbol: '316140', name: '우리금융지주', exchange: 'KOSPI' },
  { symbol: '259960', name: '크래프톤', exchange: 'KOSPI' },
  { symbol: '352820', name: '하이브', exchange: 'KOSPI' },
  { symbol: '041510', name: 'SM엔터테인먼트', exchange: 'KOSDAQ' },
  { symbol: '035900', name: 'JYP엔터테인먼트', exchange: 'KOSDAQ' },
  { symbol: '122870', name: '와이지엔터테인먼트', exchange: 'KOSDAQ' },
  { symbol: '247540', name: '에코프로비엠', exchange: 'KOSDAQ' },
  { symbol: '086520', name: '에코프로', exchange: 'KOSDAQ' },
  { symbol: '196170', name: '알테오젠', exchange: 'KOSDAQ' },
  { symbol: '091990', name: '셀트리온헬스케어', exchange: 'KOSDAQ' },
  { symbol: '293490', name: '카카오게임즈', exchange: 'KOSDAQ' },
  { symbol: '263750', name: '펄어비스', exchange: 'KOSDAQ' },
  { symbol: '112040', name: '위메이드', exchange: 'KOSDAQ' },
  { symbol: '067160', name: '아프리카TV', exchange: 'KOSDAQ' },
  { symbol: '357780', name: '솔브레인', exchange: 'KOSDAQ' },
  { symbol: '145020', name: '휴젤', exchange: 'KOSDAQ' },
  { symbol: '214150', name: '클래시스', exchange: 'KOSDAQ' },
  { symbol: '054540', name: '삼아알미늄', exchange: 'KOSDAQ' },
  { symbol: '039030', name: '이오테크닉스', exchange: 'KOSDAQ' },
  { symbol: '053800', name: '안랩', exchange: 'KOSDAQ' },
  { symbol: '041020', name: '폴라리스오피스', exchange: 'KOSDAQ' },
  { symbol: '240810', name: '원익IPS', exchange: 'KOSDAQ' },
  { symbol: '095340', name: 'ISC', exchange: 'KOSDAQ' },
];

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q')?.trim().toLowerCase();

  if (!query) return Response.json({ results: [] });

  const results = KOREAN_STOCKS.filter(
    (stock) =>
      stock.name.toLowerCase().includes(query) ||
      stock.symbol.includes(query)
  ).slice(0, 8);

  return Response.json({ results });
}