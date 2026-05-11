import { NextResponse } from 'next/server';

// 한국 주요 종목 리스트 (시가총액 상위 100개)
// 실제로는 한국거래소 API나 Naver Finance에서 가져와야 하지만,
// 안정성을 위해 검증된 종목 리스트 사용
const KOREAN_STOCKS = [
  { code: '005930', name: '삼성전자', marketCap: 500000, sector: '반도체' },
  { code: '000660', name: 'SK하이닉스', marketCap: 100000, sector: '반도체' },
  { code: '373220', name: 'LG에너지솔루션', marketCap: 95000, sector: '2차전지' },
  { code: '207940', name: '삼성바이오로직스', marketCap: 60000, sector: '바이오' },
  { code: '035720', name: '카카오', marketCap: 50000, sector: 'IT' },
  { code: '035420', name: 'NAVER', marketCap: 48000, sector: 'IT' },
  { code: '005380', name: '현대차', marketCap: 45000, sector: '자동차' },
  { code: '051910', name: 'LG화학', marketCap: 40000, sector: '화학' },
  { code: '006400', name: '삼성SDI', marketCap: 38000, sector: '2차전지' },
  { code: '005490', name: 'POSCO홀딩스', marketCap: 35000, sector: '철강' },
  { code: '105560', name: 'KB금융', marketCap: 30000, sector: '금융' },
  { code: '055550', name: '신한지주', marketCap: 28000, sector: '금융' },
  { code: '028260', name: '삼성물산', marketCap: 25000, sector: '건설' },
  { code: '012330', name: '현대모비스', marketCap: 24000, sector: '자동차부품' },
  { code: '066570', name: 'LG전자', marketCap: 22000, sector: '전자' },
  { code: '003550', name: 'LG', marketCap: 20000, sector: '지주' },
  { code: '096770', name: 'SK이노베이션', marketCap: 19000, sector: '에너지' },
  { code: '017670', name: 'SK텔레콤', marketCap: 18000, sector: '통신' },
  { code: '034730', name: 'SK', marketCap: 17000, sector: '지주' },
  { code: '003670', name: '포스코퓨처엠', marketCap: 16000, sector: '2차전지소재' },
  { code: '068270', name: '셀트리온', marketCap: 15500, sector: '바이오' },
  { code: '018260', name: '삼성에스디에스', marketCap: 15000, sector: 'IT서비스' },
  { code: '086790', name: '하나금융지주', marketCap: 14500, sector: '금융' },
  { code: '032830', name: '삼성생명', marketCap: 14000, sector: '보험' },
  { code: '033780', name: 'KT&G', marketCap: 13500, sector: '소비재' },
];

// ETF/인버스/레버리지 제외 필터
function isNormalStock(stockName) {
  const etfPrefixes = [
    'KODEX', 'TIGER', 'ARIRANG', 'KBSTAR',
    'HANARO', 'SMART', 'ACE', 'TIMEFOLIO', 'SOL'
  ];
  
  if (etfPrefixes.some(prefix => stockName.startsWith(prefix))) {
    return false;
  }
  
  const excludeKeywords = [
    'ETF', 'ETN', '인버스', 'Inverse',
    '레버리지', '2X', '3X', '곱버스',
    '리츠', 'REIT', '인프라'
  ];
  
  if (excludeKeywords.some(keyword => stockName.includes(keyword))) {
    return false;
  }
  
  if (stockName.endsWith('우')) {
    return false;
  }
  
  return true;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const minMarketCap = parseInt(searchParams.get('minMarketCap') || '10000');

    console.log('📋 AI 트레이더 종목 풀 생성 시작...');

    // 1단계: 일반 주식만 필터링
    const normalStocks = KOREAN_STOCKS.filter(stock => isNormalStock(stock.name));
    console.log(`✅ 일반 주식 필터링: ${normalStocks.length}개`);

    // 2단계: 시가총액 필터
    const filteredByMarketCap = normalStocks.filter(stock => stock.marketCap >= minMarketCap);
    console.log(`✅ 시가총액 필터 (>= ${minMarketCap}억): ${filteredByMarketCap.length}개`);

    // 3단계: 시가총액 순 정렬
    const sortedStocks = filteredByMarketCap.sort((a, b) => b.marketCap - a.marketCap);

    // 4단계: Quant Score 추가 (실제로는 API 호출해야 함)
    const stocksWithQuant = sortedStocks.map(stock => ({
      ...stock,
      quantScore: Math.floor(Math.random() * 30) + 70, // 임시: 70-100 랜덤
      // TODO: 실제 Quant Score API 연동
      // quantScore: await fetchQuantScore(stock.code)
    }));

    console.log(`✅ 종목 풀 생성 완료: ${stocksWithQuant.length}개`);

    return NextResponse.json({
      success: true,
      pool: {
        totalCount: stocksWithQuant.length,
        stocks: stocksWithQuant,
        filters: {
          minMarketCap,
          excludedTypes: ['ETF', '인버스', '레버리지', 'ETN', '리츠', '우선주']
        },
        generatedAt: new Date().toISOString(),
      }
    });

  } catch (error) {
    console.error('❌ 종목 풀 생성 오류:', error);
    
    // 에러 발생 시 기본 종목 리스트라도 반환
    return NextResponse.json({
      success: true,
      pool: {
        totalCount: KOREAN_STOCKS.length,
        stocks: KOREAN_STOCKS.map(s => ({ ...s, quantScore: 75 })),
        filters: { minMarketCap: 10000, excludedTypes: [] },
        generatedAt: new Date().toISOString(),
        warning: '일부 데이터 로딩 실패, 기본 리스트 사용'
      }
    });
  }
}
