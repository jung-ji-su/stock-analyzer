export const dynamic = 'force-dynamic';
export const preferredRegion = 'icn1';
const base = 'https://navercomp.wisereport.co.kr';
export async function GET() {
  const H = { 'User-Agent': 'Mozilla/5.0', Referer: `${base}/v2/company/c1010001.aspx?cmp_cd=009150` };
  const out = {};
  const p1 = await (await fetch(`${base}/v2/company/c1010001.aspx?cmp_cd=009150`, { headers: H })).text();
  const enc = (p1.match(/encparam:\s*'([^']+)'/) || [])[1];
  out.flags = [];
  for (let f = 0; f <= 9; f++) {
    try {
      const x = await (await fetch(`${base}/company/ajax/cF1001.aspx?flag=${f}&cmp_cd=009150&encparam=${enc}`, { headers: H })).text();
      out.flags.push({ f, len: x.length, head: x.slice(0, 160) });
    } catch (e) { out.flags.push({ f, err: e.message }); }
  }
  const p2 = await (await fetch(`${base}/v2/company/c1020001.aspx?cmp_cd=009150`, { headers: H })).text();
  const uniq = (a) => [...new Set(a)];
  out.p2len = p2.length;
  out.p2ajax = uniq([...p2.matchAll(/ajax\/[A-Za-z0-9_]+\.aspx|company\/c?[A-Za-z0-9_]+\.aspx/g)].map((m) => m[0]));
  out.p2ctx = uniq([...p2.matchAll(/매출구성|주요제품|매출비중|제품별/g)].map((m) => p2.slice(Math.max(0, m.index - 150), m.index + 500))).slice(0, 4);
  out.p1ctx = uniq([...p1.matchAll(/매출구성|주요제품|매출비중|제품별/g)].map((m) => p1.slice(Math.max(0, m.index - 150), m.index + 500))).slice(0, 3);
  return Response.json(out);
}
