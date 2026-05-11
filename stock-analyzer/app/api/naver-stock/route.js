import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const symbol = searchParams.get('symbol');

  if (!symbol) {
    return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  }

  try {
    const response = await fetch(
      `https://m.stock.naver.com/api/stock/${symbol}/basic`,
      {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          'Referer': 'https://m.stock.naver.com'
        }
      }
    );

    if (!response.ok) {
      throw new Error(`Naver API error: ${response.status}`);
    }

    const data = await response.json();
    
    // 가격을 숫자로 변환 (쉼표 제거)
    let currentPrice = null;
    if (data.closePrice) {
      currentPrice = typeof data.closePrice === 'string' 
        ? Number(data.closePrice.replace(/,/g, ''))
        : Number(data.closePrice);
    } else if (data.stockEndPrice) {
      currentPrice = typeof data.stockEndPrice === 'string'
        ? Number(data.stockEndPrice.replace(/,/g, ''))
        : Number(data.stockEndPrice);
    }

    return NextResponse.json({
      koreanName: data.stockName || data.name || '',
      currentPrice: currentPrice,
      symbol: symbol
    });
  } catch (error) {
    console.error('Naver API error:', error);
    return NextResponse.json({ 
      error: error.message,
      koreanName: '',
      currentPrice: null 
    }, { status: 500 });
  }
}