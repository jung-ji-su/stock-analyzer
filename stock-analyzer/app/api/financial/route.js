import { NextResponse } from 'next/server';

// ✅ Node.js 런타임 강제
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

    console.log('🔍 DART API 호출 시작...');
    
    const corpListRes = await fetch(`https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${API_KEY}`, {
      headers: {
        'Accept': 'application/zip, application/octet-stream',
      }
    });
    
    if (!corpListRes.ok) {
      throw new Error(`DART API HTTP ${corpListRes.status}`);
    }
    
    console.log('✅ ZIP 파일 다운로드 완료');
    
    // ✅ Blob → ArrayBuffer → Buffer 변환
    const blob = await corpListRes.blob();
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    
    console.log('✅ Buffer 변환 완료:', buffer.length, 'bytes');
    
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);
    const xmlContent = await zip.file('CORPCODE.xml').async('string');
    
    console.log('✅ XML 추출 완료');
    
    const xml2js = await import('xml2js');
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlContent);
    const corpList = result.result.list;

    let found = corpList.find(corp => corp.stock_code[0] === query);

    if (!found) {
      found = corpList.find(corp => {
        const name = corp.corp_name[0];
        const code = corp.stock_code[0];
        return name === query && code && code.trim().length > 0;
      });
    }

    if (!found) {
      const candidates = corpList.filter(corp => {
        const name = corp.corp_name[0];
        const code = corp.stock_code[0];
        return name.includes(query) && code && code.trim().length > 0;
      });

      if (candidates.length > 0) {
        found = candidates.sort((a, b) => a.corp_name[0].length - b.corp_name[0].length)[0];
      }
    }

    if (!found) {
      return NextResponse.json({ error: '상장된 기업을 찾을 수 없습니다' }, { status: 404 });
    }

    const corpCode = found.corp_code[0];
    const corpName = found.corp_name[0];
    const stockCode = found.stock_code[0];

    console.log('🔍 검색된 기업:', { corpName, stockCode, corpCode });

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
          '영업활동으로 인한 현금흐름',
          '영업활동 현금흐름',
          '영업활동으로인한현금의증가',
          '영업활동현금',
          '영업에서창출된현금흐름',
          '영업활동순현금흐름',
          '영업활동으로부터의현금흐름'
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
    console.error('❌ DART API 에러:', error);
    return NextResponse.json({ 
      error: '데이터 조회 실패', 
      details: error.message 
    }, { status: 500 });
  }
}