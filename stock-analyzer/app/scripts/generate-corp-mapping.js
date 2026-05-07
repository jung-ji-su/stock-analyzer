const fs = require('fs');
const JSZip = require('jszip');
const xml2js = require('xml2js');

async function generateMapping() {
  const API_KEY = process.env.DART_API_KEY;
  
  if (!API_KEY) {
    console.error('❌ DART_API_KEY 환경변수를 설정해주세요');
    process.exit(1);
  }
  
  console.log('🔍 DART API에서 기업 목록 다운로드 중...');
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
  
  const jsContent = `// Auto-generated - 모든 상장사 종목코드-기업코드 매핑
// 마지막 업데이트: ${new Date().toISOString()}
// 총 ${count}개 상장사

const corpMapping = ${JSON.stringify(mapping, null, 2)};

export default corpMapping;
`;
  
  if (!fs.existsSync('./lib')) {
    fs.mkdirSync('./lib');
  }
  
  fs.writeFileSync('./lib/corp-mapping.js', jsContent);
  
  console.log('✅ /lib/corp-mapping.js 생성 완료!');
  console.log(`📊 총 ${count}개 상장사 매핑 완료`);
  console.log('');
  console.log('다음 단계:');
  console.log('  git add lib/corp-mapping.js');
  console.log('  git commit -m "Add full corp code mapping"');
  console.log('  git push');
}

generateMapping().catch(err => {
  console.error('❌ 에러:', err);
  process.exit(1);
});