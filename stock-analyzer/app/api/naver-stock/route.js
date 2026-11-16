import { NextResponse } from 'next/server';
import { fetchNaverBasic } from '@/lib/naver';

// 국내 종목 현재가·한글 종목명
export async function GET(request) {
  const symbol = new URL(request.url).searchParams.get('symbol');
  if (!symbol) return NextResponse.json({ error: 'Symbol required' }, { status: 400 });
  if (!/^[A-Za-z0-9.\-]{1,15}$/.test(symbol)) return NextResponse.json({ error: '잘못된 종목 코드' }, { status: 400 });

  const d = await fetchNaverBasic(symbol);
  if (!d) return NextResponse.json({ error: '시세 조회 실패', koreanName: '', currentPrice: null }, { status: 500 });
  return NextResponse.json({ koreanName: d.name, currentPrice: d.price, symbol });
}
