import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 60;
export const preferredRegion = 'icn1'; // 서울 리전 — DART 서버(한국)와 가까워서 다운로드 빠름

const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7일

/* ── Firestore에서 기업코드 캐시 조회 ── */
async function getCorpCodeFromCache(db, query) {
  try {
    const doc = await db.collection('dartCorpCache').doc(query).get();
    if (!doc.exists) return null;
    const data = doc.data();
    if (Date.now() - (data.cachedAt ?? 0) > CACHE_TTL_MS) return null;
    return { corpCode: data.corpCode, corpName: data.corpName, stockCode: data.stockCode };
  } catch { return null; }
}

/* ── DART ZIP에서 기업코드 검색 후 Firestore에 저장 ── */
async function resolveCorpCodeFromDart(db, query, apiKey) {
  console.log('⏳ DART corpCode.xml 다운로드 중...');
  const zipRes = await fetch(
    `https://opendart.fss.or.kr/api/corpCode.xml?crtfc_key=${apiKey}`,
    { next: { revalidate: 86400 } }  // Next.js CDN 레벨 캐시 (24h)
  );
  if (!zipRes.ok) throw new Error(`DART API HTTP ${zipRes.status}`);

  console.log('✅ 다운로드 완료, ZIP 파싱 중...');
  const buffer = await zipRes.arrayBuffer();
  const uint8 = new Uint8Array(buffer);

  if (uint8[0] !== 0x50 || uint8[1] !== 0x4b) {
    const text = new TextDecoder().decode(uint8);
    throw new Error(`ZIP 아님: ${text.substring(0, 200)}`);
  }

  const JSZip = (await import('jszip')).default;
  const zip = await JSZip.loadAsync(uint8, { checkCRC32: false });
  const xmlContent = await zip.file('CORPCODE.xml').async('string');

  const xml2js = await import('xml2js');
  const parsed = await new xml2js.Parser().parseStringPromise(xmlContent);
  const corpList = parsed.result.list;
  console.log(`✅ XML 파싱 완료 (${corpList.length}개 기업)`);

  // 종목코드 우선, 없으면 이름 매칭
  let found =
    corpList.find(c => c.stock_code?.[0] === query) ||
    corpList.find(c => c.corp_name?.[0] === query && c.stock_code?.[0]?.trim()) ||
    corpList.filter(c => c.corp_name?.[0]?.includes(query) && c.stock_code?.[0]?.trim())
            .sort((a, b) => a.corp_name[0].length - b.corp_name[0].length)[0];

  if (!found) return null;

  const result = {
    corpCode:  found.corp_code[0],
    corpName:  found.corp_name[0],
    stockCode: found.stock_code[0],
  };

  // Firestore에 저장 (비동기, 실패해도 무시)
  db.collection('dartCorpCache').doc(query).set({ ...result, cachedAt: Date.now() }).catch(() => {});
  console.log(`✅ 기업 코드 해결: ${result.corpName} (${result.corpCode})`);
  return result;
}

/* ── 재무데이터 단건 fetch ── */
async function fetchFinancial(apiKey, corpCode, year, reprtCode) {
  const url = `https://opendart.fss.or.kr/api/fnlttSinglAcnt.json?crtfc_key=${apiKey}&corp_code=${corpCode}&bsns_year=${year}&reprt_code=${reprtCode}`;
  try {
    const res = await fetch(url);
    const data = await res.json();
    return data.status === '000' && data.list?.length > 0 ? data.list : null;
  } catch { return null; }
}

function getValue(accounts, names) {
  for (const name of names) {
    const acc = accounts.find(a => {
      const n = a.account_nm;
      return n === name || n.includes(name) || name.includes(n);
    });
    if (acc?.thstrm_amount) {
      return parseInt(acc.thstrm_amount.toString().replace(/,/g, '')) || 0;
    }
  }
  return 0;
}

function summarize(accounts) {
  return {
    revenue:          getValue(accounts, ['매출액', '수익(매출액)', '영업수익']),
    operatingIncome:  getValue(accounts, ['영업이익', '영업이익(손실)']),
    netIncome:        getValue(accounts, ['당기순이익', '당기순이익(손실)']),
    totalAssets:      getValue(accounts, ['자산총계']),
    totalLiabilities: getValue(accounts, ['부채총계']),
    totalEquity:      getValue(accounts, ['자본총계']),
    operatingCF:      getValue(accounts, ['영업활동현금흐름', '영업활동으로인한현금흐름', '영업활동으로 인한 현금흐름', '영업활동 현금흐름']),
  };
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('query');
  if (!query) return NextResponse.json({ error: '검색어가 필요합니다' }, { status: 400 });

  const API_KEY = process.env.DART_API_KEY;
  if (!API_KEY) return NextResponse.json({ error: 'DART_API_KEY 미설정' }, { status: 500 });

  try {
    const db = getAdminFirestore();

    // STEP 1: 기업코드 조회 (Firestore 캐시 우선)
    console.log(`🔍 기업코드 조회: "${query}"`);
    let corp = await getCorpCodeFromCache(db, query);

    if (corp) {
      console.log(`✅ 캐시 히트: ${corp.corpName}`);
    } else {
      console.log('⚠️ 캐시 미스 → DART ZIP 다운로드');
      corp = await resolveCorpCodeFromDart(db, query, API_KEY);
      if (!corp) return NextResponse.json({ error: '상장된 기업을 찾을 수 없습니다' }, { status: 404 });
    }

    const { corpCode, corpName, stockCode } = corp;

    // STEP 2: 연간 + 분기 재무 데이터 병렬 fetch
    console.log('⏳ 재무데이터 병렬 조회 시작...');
    const currentYear = new Date().getFullYear();
    const years = [currentYear - 1, currentYear - 2, currentYear - 3]; // 최근 3년

    const quarterDefs = [
      { code: '11013', name: 'Q1' },
      { code: '11012', name: 'Q2(반기)' },
      { code: '11014', name: 'Q3' },
    ];
    const quarterYears = [currentYear, currentYear - 1];

    // 연간 3건 + 분기 6건 = 9건 병렬 실행
    const [annualResults, quarterResults] = await Promise.all([
      Promise.all(years.map(async year => {
        const list = await fetchFinancial(API_KEY, corpCode, year, '11011');
        return list ? { year, data: list } : null;
      })),
      Promise.all(quarterYears.flatMap(year =>
        quarterDefs.map(async ({ code, name }) => {
          const list = await fetchFinancial(API_KEY, corpCode, year, code);
          return list ? { year, quarter: name, reportDate: `${year}년 ${name}`, data: list } : null;
        })
      )),
    ]);

    const annualData   = annualResults.filter(Boolean);
    const quarterData  = quarterResults.filter(Boolean);
    console.log(`✅ 연간 ${annualData.length}건, 분기 ${quarterData.length}건 조회 완료`);

    if (annualData.length === 0) {
      return NextResponse.json({ error: '재무제표 데이터가 없습니다' }, { status: 404 });
    }

    const summary       = annualData.map(d => ({ year: d.year, type: 'annual',   ...summarize(d.data) }));
    const quarterSummary = quarterData.map(d => ({ year: d.year, quarter: d.quarter, reportDate: d.reportDate, type: 'quarter', ...summarize(d.data) }));

    console.log('✅ 완료!');
    return NextResponse.json({
      corpName, stockCode, corpCode,
      summary,
      quarterData: quarterSummary,
      latestAnnual:  summary[0] ?? null,
      latestQuarter: quarterSummary[0] ?? null,
    });

  } catch (error) {
    console.error('❌ DART API 에러:', error);
    return NextResponse.json({ error: error.message || '데이터 조회 실패' }, { status: 500 });
  }
}
