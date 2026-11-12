export const dynamic = 'force-dynamic';
export const preferredRegion = 'icn1';
const H = { 'User-Agent': 'Mozilla/5.0', Referer: 'https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd=009150' };
export async function GET() {
  const base = 'https://navercomp.wisereport.co.kr';
  const t = await (await fetch(`${base}/v2/company/c1010001.aspx?cmp_cd=009150`, { headers: H })).text();
  const enc = (t.match(/encparam:\s*'([^']+)'/) || [])[1];
  const intro = [...t.matchAll(/<li class="dot_cmp"[^>]*>([^<]+)<\/li>/g)].map((m) => m[1].trim());
  const out = { enc, intro, calls: [] };
  for (const q of ['flag=4&grp_cd=01', 'flag=4&grp_cd=03', 'flag=4']) {
    try {
      const r = await fetch(`${base}/company/ajax/cF1001.aspx?${q}&cmp_cd=009150&encparam=${enc}`, { headers: H });
      const x = await r.text();
      out.calls.push({ q, status: r.status, len: x.length, head: x.slice(0, 1800) });
    } catch (e) { out.calls.push({ q, err: e.message }); }
  }
  return Response.json(out);
}
