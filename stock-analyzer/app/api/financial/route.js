import { NextResponse } from 'next/server';

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');

  if (!query) {
    return NextResponse.json({ error: '검색어가 필요합니다' }, { status: 400 });
  }

  try {
    const API_KEY = process.env.DART_API_KEY;

    const corpListRes = await fetch(`https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${API_KEY}`);
    const buffer = await corpListRes.arrayBuffer();
    
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(buffer);
    const xmlContent = await zip.file('CORPCODE.xml').async('string');
    
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

    // ✅ 2024년부터 5년
    const currentYear = new Date().getFullYear();
    const startYear = currentYear - 1; // 2024
    const years = Array.from({ length: 5 }, (_, i) => startYear - i);

    const financialData = [];

    for (const year of years) {
      const url = `https://opendart.fss.or.kr/api/fnlttSinglAcnt.json?crtfc_key=${API_KEY}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=11011`;
      
      const res = await fetch(url);
      const data = await res.json();
      
      if (data.status === '000' && data.list && data.list.length > 0) {
        financialData.push({ year, data: data.list });
      }
    }

    if (financialData.length === 0) {
      return NextResponse.json({ error: '재무제표 데이터가 없습니다' }, { status: 404 });
    }

    const summary = financialData.map(yearData => {
      const accounts = yearData.data;
      
      const getValue = (names) => {
        for (const name of names) {
          const found = accounts.find(acc => {
            const accName = acc.account_nm;
            return accName === name || accName.includes(name);
          });
          if (found && found.thstrm_amount) {
            const cleanValue = found.thstrm_amount.toString().replace(/,/g, '');
            return parseInt(cleanValue);
          }
        }
        return 0;
      };

      return {
        year: yearData.year,
        revenue: getValue(['매출액', '수익(매출액)', '영업수익']),
        operatingIncome: getValue(['영업이익', '영업이익(손실)']),
        netIncome: getValue(['당기순이익', '당기순이익(손실)']),
        totalAssets: getValue(['자산총계']),
        totalLiabilities: getValue(['부채총계']),
        totalEquity: getValue(['자본총계']),
        operatingCF: getValue(['영업활동현금흐름', '영업활동으로인한현금흐름']),
      };
    });

    return NextResponse.json({
      corpName,
      stockCode,
      corpCode,
      summary,
    });

  } catch (error) {
    console.error('❌ DART API 에러:', error);
    return NextResponse.json({ error: '데이터 조회 실패: ' + error.message }, { status: 500 });
  }
}