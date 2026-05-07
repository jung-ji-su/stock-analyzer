import { NextResponse } from 'next/server';
import YahooFinance from 'yahoo-finance2';

// KOSPI 주요 종목 리스트 (시가총액 상위 100개)
const KOSPI_TICKERS = [
  // 반도체
  '005930.KS', // 삼성전자
  '000660.KS', // SK하이닉스
  
  // IT/전자
  '035420.KS', // NAVER
  '035720.KS', // 카카오
  '096770.KS', // SK이노베이션
  '051910.KS', // LG화학
  '006400.KS', // 삼성SDI
  
  // 자동차
  '005380.KS', // 현대차
  '000270.KS', // 기아
  
  // 금융
  '055550.KS', // 신한지주
  '086790.KS', // 하나금융지주
  '105560.KS', // KB금융
  
  // 화학
  '051900.KS', // LG생활건강
  '009830.KS', // 한화솔루션
  
  // 바이오
  '068270.KS', // 셀트리온
  '207940.KS', // 삼성바이오로직스
  '326030.KS', // SK바이오팜
  
  // 유통
  '000120.KS', // CJ대한통운
  '139480.KS', // 이마트
  
  // 건설
  '000720.KS', // 현대건설
  '028260.KS', // 삼성물산
  
  // 에너지
  '034730.KS', // SK
  '010950.KS', // S-Oil
  
  // 통신
  '030200.KS', // KT
  '017670.KS', // SK텔레콤
  
  // 기타
  '009150.KS', // 삼성전기
  '012330.KS', // 현대모비스
  '003550.KS', // LG
  '066570.KS', // LG전자
];

// 섹터 매핑 (간단한 룰 기반)
const SECTOR_MAP = {
  '005930.KS': '반도체',
  '000660.KS': '반도체',
  
  '035420.KS': 'IT/인터넷',
  '035720.KS': 'IT/인터넷',
  '096770.KS': 'IT/인터넷',
  
  '051910.KS': '화학',
  '006400.KS': '화학',
  '051900.KS': '화학',
  '009830.KS': '화학',
  
  '005380.KS': '자동차',
  '000270.KS': '자동차',
  '012330.KS': '자동차',
  
  '055550.KS': '금융',
  '086790.KS': '금융',
  '105560.KS': '금융',
  
  '068270.KS': '바이오',
  '207940.KS': '바이오',
  '326030.KS': '바이오',
  
  '000120.KS': '유통',
  '139480.KS': '유통',
  
  '000720.KS': '건설',
  '028260.KS': '건설',
  
  '034730.KS': '에너지',
  '010950.KS': '에너지',
  
  '030200.KS': '통신',
  '017670.KS': '통신',
  
  '009150.KS': '전자',
  '066570.KS': '전자',
  '003550.KS': '전자',
};

// 한글 종목명 가져오기 (Naver API)
async function getKoreanName(ticker) {
  try {
    const code = ticker.replace('.KS', '');
    const url = `https://m.stock.naver.com/api/stock/${code}/basic`;
    const response = await fetch(url);
    const data = await response.json();
    return data.stockName || ticker;
  } catch (error) {
    return ticker;
  }
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit')) || 30;
    
    // Yahoo Finance에서 데이터 가져오기
    const quotes = await Promise.all(
      KOSPI_TICKERS.slice(0, limit).map(async (ticker) => {
        try {
          const quote = await YahooFinance.quote(ticker);
          const koreanName = await getKoreanName(ticker);
          
          const price = quote.regularMarketPrice || 0;
          const previousClose = quote.regularMarketPreviousClose || price;
          const change = price - previousClose;
          const changePercent = previousClose !== 0 ? (change / previousClose) * 100 : 0;
          const marketCap = quote.marketCap || 0;
          const volume = quote.regularMarketVolume || 0;
          
          return {
            ticker: ticker.replace('.KS', ''),
            name: koreanName,
            sector: SECTOR_MAP[ticker] || '기타',
            price,
            change,
            changePercent,
            marketCap,
            volume,
          };
        } catch (error) {
          console.error(`Error fetching ${ticker}:`, error);
          return null;
        }
      })
    );
    
    // null 제거
    const validQuotes = quotes.filter(q => q !== null);
    
    // 섹터별 그룹화
    const sectors = {};
    validQuotes.forEach(stock => {
      const sector = stock.sector;
      if (!sectors[sector]) {
        sectors[sector] = {
          name: sector,
          stocks: [],
          totalMarketCap: 0,
          avgChangePercent: 0,
        };
      }
      sectors[sector].stocks.push(stock);
      sectors[sector].totalMarketCap += stock.marketCap;
    });
    
    // 섹터별 평균 등락률 계산
    Object.values(sectors).forEach(sector => {
      const totalChange = sector.stocks.reduce((sum, s) => sum + s.changePercent, 0);
      sector.avgChangePercent = totalChange / sector.stocks.length;
      
      // 시가총액 기준 정렬
      sector.stocks.sort((a, b) => b.marketCap - a.marketCap);
    });
    
    // 배열로 변환 및 시가총액 기준 정렬
    const sectorsArray = Object.values(sectors).sort(
      (a, b) => b.totalMarketCap - a.totalMarketCap
    );
    
    return NextResponse.json({
      success: true,
      data: sectorsArray,
      timestamp: new Date().toISOString(),
    });
    
  } catch (error) {
    console.error('Market overview API error:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}