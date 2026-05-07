const fs = require('fs');
const JSZip = require('jszip');
const xml2js = require('xml2js');

async function generateMapping() {
  const API_KEY = process.env.DART_API_KEY;
  
  console.log('🔍 DART API에서 기업 목록 다운로드...');
  const res = await fetch(`https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${API_KEY}`);
  const buffer = await res.arrayBuffer();
  
  console.log('📦 ZIP 파싱 중...');
  const zip = await JSZip.loadAsync(buffer);
  const xmlContent = await zip.file('CORPCODE.xml').async('string');
  
  console.log('📄 XML 파싱 중...');
  const parser = new xml2js.Parser();
  const result = await parser.parseStringPromise(xmlContent);
  const corpList = result.result.list;
  
  console.log(`✅ 총 ${corpList.length}개 기업 발견`);
  
  // 종목코드가 있는 상장사만 필터링
  const mapping = {};
  let count = 0;
  
  for (const corp of corpList) {
    const stockCode = corp.stock_code[0];
    const corpCode = corp.corp_code[0];
    const corpName = corp.corp_name[0];
    
    if (stockCode && stockCode.trim().length > 0) {
      mapping[stockCode] = {
        corpCode,
        corpName,
      };
      count++;
    }
  }
  
  console.log(`✅ 상장사 ${count}개 매핑 생성`);
  
  // public 폴더에 저장
  fs.writeFileSync(
    './public/corp-code-mapping.json',
    JSON.stringify(mapping, null, 2)
  );
  
  console.log('✅ /public/corp-code-mapping.json 생성 완료!');
}

generateMapping().catch(console.error);