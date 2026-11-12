export const dynamic = 'force-dynamic';
export const preferredRegion = 'icn1';
export async function GET() {
  const out = [];
  for (const url of [
    'https://navercomp.wisereport.co.kr/v2/company/c1010001.aspx?cmp_cd=009150',
    'https://finance.naver.com/item/coinfo.naver?code=009150',
  ]) {
    try {
      const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0', Referer: 'https://finance.naver.com' } });
      const buf = new Uint8Array(await r.arrayBuffer());
      const t = new TextDecoder('utf-8').decode(buf);
      const i = t.indexOf('기업개요'), j = t.indexOf('매출구성'), k = t.indexOf('주요제품');
      out.push({ url, status: r.status, len: t.length, i, j, k,
        around: i >= 0 ? t.slice(i, i + 900) : null, around2: (j >= 0 ? t.slice(j - 200, j + 1200) : (k >= 0 ? t.slice(k - 100, k + 1200) : null)) });
    } catch (e) { out.push({ url, err: e.message }); }
  }
  return Response.json(out);
}
