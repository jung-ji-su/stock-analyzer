import { NextResponse } from 'next/server';
import corpMapping from '@/lib/corp-mapping';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');

  if (!query) {
    return NextResponse.json({ error: '검색어가 필요합니다' }, { status: 400 });
  }

  try {
    const API_KEY = process.env.DART_API_KEY;
    
    if (!API_KEY) {
      throw new Error('DART_API_KEY 환경변수가 설정되지 않았습니다');
    }

    // ✅ import한 매핑 사용 (즉시 접근!)
    let found = null;
    let stockCode = query;

    if (corpMapping[query]) {
      found = corpMapping[query];
      stockCode = query;
    } else {
      const entries = Object.entries(corpMapping);
      const match = entries.find(([code, info]) => info.corpName === query);
      
      if (match) {
        stockCode = match[0];
        found = match[1];
      } else {
        const candidates = entries.filter(([code, info]) => 
          info.corpName.includes(query)
        );
        
        if (candidates.length > 0) {
          candidates.sort((a, b) => a[1].corpName.length - b[1].corpName.length);
          stockCode = candidates[0][0];
          found = candidates[0][1];
        }
      }
    }

    if (!found) {
      return NextResponse.json({ error: '상장된 기업을 찾을 수 없습니다' }, { status: 404 });
    }

    const corpCode = found.corpCode;
    const corpName = found.corpName;

    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 5 }, (_, i) => currentYear - 1 - i);

    const annualData = [];

    for (const year of years) {
      const url = `https://opendart.fss.or.kr/api/fnlttSinglAcnt.json?crtfc_key=${API_KEY}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=11011`;
      
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.status === '000' && data.list && data.list.length > 0) {
        annualData.push({ year, data: data.list, type: 'annual' });
      }
    }

    const quarterData = [];
    const reprtCodes = [
      { code: '11013', name: 'Q1' },
      { code: '11014', name: 'Q3' },
      { code: '11012', name: 'Q2(반기)' },
    ];

    for (const year of [currentYear, currentYear - 1]) {
      for (const { code, name } of reprtCodes) {
        const url = `https://opendart.fss.or.kr/api/fnlttSinglAcnt.json?crtfc_key=${API_KEY}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=${code}`;
        
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.status === '000' && data.list && data.list.length > 0) {
          quarterData.push({ 
            year, 
            quarter: name,
            data: data.list, 
            type: 'quarter',
            reportDate: `${year}년 ${name}`,
          });
        }
      }
    }

    if (annualData.length === 0) {
      return NextResponse.json({ error: '재무제표 데이터가 없습니다' }, { status: 404 });
    }

    const getValue = (accounts, names) => {
      for (const name of names) {
        const found = accounts.find(acc => {
          const accName = acc.account_nm;
          return accName === name || accName.includes(name) || name.includes(accName);
        });
        if (found && found.thstrm_amount) {
          const cleanValue = found.thstrm_amount.toString().replace(/,/g, '');
          return parseInt(cleanValue);
        }
      }
      return 0;
    };

    const summary = annualData.map(yearData => {
      const accounts = yearData.data;
      
      return {
        year: yearData.year,
        type: 'annual',
        revenue: getValue(accounts, ['매출액', '수익(매출액)', '영업수익']),
        operatingIncome: getValue(accounts, ['영업이익', '영업이익(손실)']),
        netIncome: getValue(accounts, ['당기순이익', '당기순이익(손실)']),
        totalAssets: getValue(accounts, ['자산총계']),
        totalLiabilities: getValue(accounts, ['부채총계']),
        totalEquity: getValue(accounts, ['자본총계']),
        operatingCF: getValue(accounts, [
          '영업활동현금흐름',
          '영업활동으로인한현금흐름',
        ]),
      };
    });

    const quarterSummary = quarterData.map(qData => {
      const accounts = qData.data;
      
      return {
        year: qData.year,
        quarter: qData.quarter,
        reportDate: qData.reportDate,
        type: 'quarter',
        revenue: getValue(accounts, ['매출액', '수익(매출액)', '영업수익']),
        operatingIncome: getValue(accounts, ['영업이익', '영업이익(손실)']),
        netIncome: getValue(accounts, ['당기순이익', '당기순이익(손실)']),
        totalAssets: getValue(accounts, ['자산총계']),
        totalLiabilities: getValue(accounts, ['부채총계']),
        totalEquity: getValue(accounts, ['자본총계']),
      };
    });

    return NextResponse.json({
      corpName,
      stockCode,
      corpCode,
      summary,
      quarterData: quarterSummary,
      latestAnnual: summary[0],
      latestQuarter: quarterSummary[0] || null,
    });

  } catch (error) {
    console.error('❌ 에러:', error);
    return NextResponse.json({ 
      error: error.message || '데이터 조회 실패',
    }, { status: 500 });
  }
}