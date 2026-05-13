/**
 * POST /api/financial/seed-cache
 *
 * 로컬에서 딱 한 번 실행하면 됨.
 * DART corpCode.xml을 다운로드 → 파싱 → 전체 상장사 기업코드를
 * Firestore dartCorpCache 컬렉션에 저장한다.
 * 이후 /api/financial 은 ZIP 다운로드 없이 Firestore만 사용함.
 *
 * 실행 방법:
 *   curl -X POST http://localhost:3000/api/financial/seed-cache \
 *     -H "x-seed-secret: YOUR_SEED_SECRET"
 */
import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const maxDuration = 300; // 로컬 전용이라 길게 설정

export async function POST(request) {
  // 간단한 시크릿 검증 (아무나 호출 못하게)
  const secret = request.headers.get('x-seed-secret');
  if (!secret || secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const API_KEY = process.env.DART_API_KEY;
  if (!API_KEY) return NextResponse.json({ error: 'DART_API_KEY 미설정' }, { status: 500 });

  try {
    console.log('🌱 Firestore 기업코드 캐시 시딩 시작...');

    // 1. DART ZIP 다운로드
    console.log('⏳ DART corpCode.xml 다운로드 중...');
    const zipRes = await fetch(`https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${API_KEY}`);
    if (!zipRes.ok) throw new Error(`DART HTTP ${zipRes.status}`);

    const buffer = await zipRes.arrayBuffer();
    const uint8 = new Uint8Array(buffer);
    console.log(`✅ 다운로드 완료: ${(buffer.byteLength / 1024 / 1024).toFixed(1)}MB`);

    // 2. ZIP → XML 파싱
    const JSZip = (await import('jszip')).default;
    const zip = await JSZip.loadAsync(uint8, { checkCRC32: false });
    const xmlContent = await zip.file('CORPCODE.xml').async('string');

    const xml2js = await import('xml2js');
    const parsed = await new xml2js.Parser().parseStringPromise(xmlContent);
    const corpList = parsed.result.list;
    console.log(`✅ XML 파싱 완료: ${corpList.length}개 기업`);

    // 3. 상장사만 필터 (stock_code 있는 것)
    const listed = corpList.filter(c => {
      const sc = c.stock_code?.[0]?.trim();
      return sc && sc.length > 0 && sc !== ' ';
    });
    console.log(`📊 상장사: ${listed.length}개`);

    // 4. Firestore 배치 저장 (500개씩)
    const db = getAdminFirestore();
    const now = Date.now();
    let savedCount = 0;

    for (let i = 0; i < listed.length; i += 400) {
      const chunk = listed.slice(i, i + 400);
      const batch = db.batch();

      chunk.forEach(corp => {
        const stockCode = corp.stock_code[0].trim();
        const corpCode  = corp.corp_code[0];
        const corpName  = corp.corp_name[0];

        const data = { corpCode, corpName, stockCode, cachedAt: now };

        // 종목코드로 조회
        batch.set(db.collection('dartCorpCache').doc(stockCode), data);
        // 회사명으로도 조회 (정확 일치)
        batch.set(db.collection('dartCorpCache').doc(corpName), data);
      });

      await batch.commit();
      savedCount += chunk.length;
      console.log(`  저장 중... ${savedCount}/${listed.length}`);
    }

    console.log(`✅ 시딩 완료! ${listed.length}개 상장사 × 2 (코드+이름) = ${listed.length * 2}개 문서`);

    return NextResponse.json({
      success: true,
      listedCompanies: listed.length,
      documentsCreated: listed.length * 2,
      message: '이제 Vercel에서 ZIP 다운로드 없이 Firestore 캐시만 사용합니다.',
    });

  } catch (error) {
    console.error('❌ 시딩 실패:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
