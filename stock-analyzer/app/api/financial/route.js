import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60; // ✅ 타임아웃 60초로 설정

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

    console.log('🔍 DART API 호출 시작...');
    
    const corpListRes = await fetch(
      `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${API_KEY}`,
      {
        method: 'GET',
      }
    );
    
    if (!corpListRes.ok) {
      throw new Error(`DART API HTTP ${corpListRes.status}`);
    }
    
    console.log('✅ ZIP 파일 다운로드 완료');
    console.log('Content-Type:', corpListRes.headers.get('content-type'));
    console.log('Content-Length:', corpListRes.headers.get('content-length'));
    
    console.log('⏳ ArrayBuffer 변환 시작...');
    const arrayBuffer = await corpListRes.arrayBuffer();
    console.log('✅ ArrayBuffer 변환 완료:', arrayBuffer.byteLength, 'bytes');
    
    console.log('⏳ Uint8Array 변환 시작...');
    const uint8Array = new Uint8Array(arrayBuffer);
    console.log('✅ Uint8Array 변환 완료:', uint8Array.length);
    
    const isZip = uint8Array[0] === 0x50 && uint8Array[1] === 0x4b;
    console.log('🔍 ZIP 시그니처 확인:', isZip);
    
    if (!isZip) {
      const textDecoder = new TextDecoder('utf-8');
      const xmlText = textDecoder.decode(uint8Array);
      throw new Error(`DART API가 ZIP이 아닌 응답 반환: ${xmlText.substring(0, 200)}`);
    }
    
    console.log('⏳ JSZip 로딩 시작...');
    const JSZip = (await import('jszip')).default;
    console.log('✅ JSZip import 완료');
    
    console.log('⏳ ZIP 파싱 시작...');
    const zip = await JSZip.loadAsync(uint8Array, {
      base64: false,
      checkCRC32: false,
    });
    console.log('✅ ZIP 파싱 완료');
    
    console.log('⏳ XML 추출 시작...');
    const xmlContent = await zip.file('CORPCODE.xml').async('string');
    console.log('✅ XML 추출 완료, 크기:', xmlContent.length);
    
    console.log('⏳ XML 파싱 시작...');
    const xml2js = await import('xml2js');
    const parser = new xml2js.Parser();
    const result = await parser.parseStringPromise(xmlContent);
    console.log('✅ XML 파싱 완료');
    
    const corpList = result.result.list;
    console.log('✅ 기업 목록 개수:', corpList.length);

    console.log('⏳ 기업 검색 시작:', query);
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
    
    console.log('✅ 기업 찾음:', { corpName, stockCode, corpCode });

    console.log('⏳ 재무제표 데이터 조회 시작...');
    const currentYear = new Date().getFullYear();
    const years = Array.from({ length: 5 }, (_, i) => currentYear - 1 - i);

    const annualData = [];

    for (const year of years) {
      console.log(`⏳ ${year}년 연간 데이터 조회 중...`);
      const url = `https://opendart.fss.or.kr/api/fnlttSinglAcnt.json?crtfc_key=${API_KEY}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=11011`;
      
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.status === '000' && data.list && data.list.length > 0) {
        console.log(`✅ ${year}년 데이터 있음`);
        annualData.push({ year, data: data.list, type: 'annual' });
      } else {
        console.log(`⚠️ ${year}년 데이터 없음`);
      }
    }

    console.log('⏳ 분기 데이터 조회 시작...');
    const quarterData = [];
    const reprtCodes = [
      { code: '11013', name: 'Q1' },
      { code: '11014', name: 'Q3' },
      { code: '11012', name: 'Q2(반기)' },
    ];

    for (const year of [currentYear, currentYear - 1]) {
      for (const { code, name } of reprtCodes) {
        console.log(`⏳ ${year}년 ${name} 조회 중...`);
        const url = `https://opendart.fss.or.kr/api/fnlttSinglAcnt.json?crtfc_key=${API_KEY}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=${code}`;
        
        const res = await fetch(url);
        const data = await res.json();
        
        if (data.status === '000' && data.list && data.list.length > 0) {
          console.log(`✅ ${year}년 ${name} 데이터 있음`);
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

    console.log('⏳ 데이터 요약 시작...');
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

    console.log('✅ 모든 처리 완료!');
    
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
      error: error.message || '데이터 조회 실패',
    }, { status: 500 });
  }
}