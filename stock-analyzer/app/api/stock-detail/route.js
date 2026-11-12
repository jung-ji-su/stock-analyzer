export const dynamic = 'force-dynamic';
export const preferredRegion = 'icn1'; // 서울 — 네이버와 가까움

const H = { 'User-Agent': 'Mozilla/5.0', Referer: 'https://m.stock.naver.com', Accept: 'application/json' };
const getJson = async (url) => {
  const r = await fetch(url, { headers: H });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
};
const WISE = 'https://navercomp.wisereport.co.kr/v2/company';
const getHtml = async (url) => {
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.naver.com' } });
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.text();
};
const clean = (h) => h.replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/\s+/g, ' ').trim();
// 기업현황 페이지의 회사 소개 문구 (FnGuide 데이터, 토스와 같은 출처)
const parseIntro = (html) => [...html.matchAll(/<li class="dot_cmp"[^>]*>([\s\S]*?)<\/li>/g)].map((m) => clean(m[1])).filter(Boolean);
// 기업개요 페이지의 '주요제품 매출구성' 표(cTB203): 제품명 / 구성비(%)
const parseSales = (html) => {
  const tb = html.match(/<table[^>]*id="cTB203"[\s\S]*?<\/table>/)?.[0];
  if (!tb) return null;
  const body = tb.split(/<tbody[^>]*>/)[1] || '';
  const rows = [...body.matchAll(/<tr[^>]*>([\s\S]*?)<\/tr>/g)]
    .map((m) => [...m[1].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/g)].map((c) => clean(c[1])))
    .filter((r) => r.length >= 2 && r[0] && Number.isFinite(parseFloat(r[1])))
    .map((r) => ({ name: r[0], pct: parseFloat(r[1].replace(/[^\d.-]/g, '')) }))
    .filter((r) => r.pct > 0);
  return rows.length ? rows : null;
};
const int = (v) => { const n = parseInt(String(v ?? '').replace(/[^\d-]/g, ''), 10); return Number.isFinite(n) ? n : null; };

// 종목정보 탭용 (국내 종목). 네이버 모바일 종합정보 + 공시.
export async function GET(request) {
  const code = new URL(request.url).searchParams.get('symbol');
  if (!/^\d{6}$/.test(code || '')) return Response.json({ error: '국내 종목만 지원합니다' }, { status: 400 });
  try {
    const [integ, disc, intro, sales] = await Promise.all([
      getJson(`https://m.stock.naver.com/api/stock/${code}/integration`),
      getJson(`https://m.stock.naver.com/api/stock/${code}/disclosure?page=1&pageSize=10`).catch(() => []),
      getHtml(`${WISE}/c1010001.aspx?cmp_cd=${code}`).then(parseIntro).catch(() => []), // 실패해도 나머지는 보여준다
      getHtml(`${WISE}/c1020001.aspx?cmp_cd=${code}`).then(parseSales).catch(() => null),
    ]);

    const info = Object.fromEntries((integ.totalInfos || []).map((t) => [t.code, t]));
    const val = (k) => info[k]?.value ?? null;
    const eps = int(val('eps')), bps = int(val('bps'));
    const today = integ.dealTrendInfos?.[0];

    return Response.json({
      name: integ.stockName,
      intro,
      sales,
      price: int(today?.closePrice),
      indicators: {
        marketValue: val('marketValue'),
        dividendYield: val('dividendYieldRatio'), per: val('per'), cnsPer: val('cnsPer'), pbr: val('pbr'),
        eps: val('eps'), bps: val('bps'), foreignRate: val('foreignRate'),
        roe: eps && bps ? `${((eps / bps) * 100).toFixed(1)}%` : null, // EPS/BPS로 계산한 근사치
        asOf: info.per?.valueDesc || null,
        high52: int(val('highPriceOf52Weeks')), low52: int(val('lowPriceOf52Weeks')),
      },
      investorToday: today ? {
        date: today.bizdate,
        individual: int(today.individualPureBuyQuant), foreigner: int(today.foreignerPureBuyQuant), institution: int(today.organPureBuyQuant),
      } : null,
      consensus: integ.consensusInfo?.priceTargetMean
        ? { target: int(integ.consensusInfo.priceTargetMean), recomm: parseFloat(integ.consensusInfo.recommMean) || null, date: integ.consensusInfo.createDate }
        : null,
      peers: (integ.industryCompareInfo || []).slice(0, 5).map((p) => ({
        code: p.itemCode, name: p.stockName, price: int(p.closePrice), rate: parseFloat(p.fluctuationsRatio) || 0, marketValue: int(p.marketValue), // 시총: 억원
      })),
      disclosures: (Array.isArray(disc) ? disc : []).map((d) => ({ title: d.title, datetime: d.datetime, author: d.author })),
    });
  } catch (e) {
    console.error('[stock-detail]', e.message);
    return Response.json({ error: '종목정보를 불러오지 못했습니다' }, { status: 502 });
  }
}
