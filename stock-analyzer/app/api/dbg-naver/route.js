export const dynamic = 'force-dynamic';
export const preferredRegion = 'icn1';
const H = { 'User-Agent': 'Mozilla/5.0', Referer: 'https://m.stock.naver.com', Accept: 'application/json' };
export async function GET() {
  const code = '009150';
  const urls = [
    `https://m.stock.naver.com/api/stock/${code}/integration`,
    `https://m.stock.naver.com/api/stock/${code}/disclosure?page=1&pageSize=5`,
    `https://m.stock.naver.com/api/disclosure/${code}?page=1&pageSize=5`,
    `https://m.stock.naver.com/api/stock/${code}/notice?page=1&pageSize=5`,
    `https://m.stock.naver.com/api/stock/${code}/overview`,
  ];
  const out = [];
  for (const url of urls) {
    try {
      const r = await fetch(url, { headers: H });
      const t = await r.text();
      let keys = null; try { const j = JSON.parse(t); keys = Array.isArray(j) ? ['[array]', j.length, Object.keys(j[0] || {})] : Object.keys(j); } catch {}
      out.push({ url, status: r.status, keys, head: t.slice(0, 300) });
    } catch (e) { out.push({ url, err: e.message }); }
  }
  // integration 상세
  try {
    const j = await (await fetch(urls[0], { headers: H })).json();
    out.push({ totalInfos: j.totalInfos, consensusInfo: j.consensusInfo, industryCompareInfo: j.industryCompareInfo, overview: j.corporateOverview ?? null, researchesLen: j.researches?.length, newsLen: j.newsList?.length, dealTrend0: j.dealTrendInfos?.[0] });
  } catch (e) { out.push({ integrationErr: e.message }); }
  return Response.json(out);
}
