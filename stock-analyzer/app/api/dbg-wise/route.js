export const dynamic = 'force-dynamic';
export const preferredRegion = 'icn1';
export async function GET() {
  const url = 'https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd=009150';
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.naver.com' } });
  const t = await r.text();
  const uniq = (a) => [...new Set(a)];
  const ctx = (re, n = 160) => uniq([...t.matchAll(re)].map((m) => t.slice(Math.max(0, m.index - 80), m.index + n))).slice(0, 12);
  return Response.json({
    status: r.status,
    scripts: uniq([...t.matchAll(/<script[^>]+src="([^"]+)"/g)].map((m) => m[1])).slice(0, 30),
    ajax: ctx(/ajax\/[A-Za-z0-9_]+\.aspx/g, 200),
    encparam: ctx(/encparam/gi, 200),
    cmpcd: ctx(/cmp_cd\s*[=:]/g, 200),
    corpInfo: ctx(/dot_cmp|cmp_comment|corp_ov|기업개요|사업/g, 200),
    sampleBody: t.slice(t.indexOf('<body'), t.indexOf('<body') + 1500),
  });
}
