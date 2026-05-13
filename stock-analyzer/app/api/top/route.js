const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://finance.naver.com',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

const EXCLUDE = [
  'ETF', 'KODEX', 'TIGER', 'KINDEX', 'KOSEF', 'ARIRANG', 'HANARO',
  'KBSTAR', 'SMART', 'SOL', 'ACE', 'BNK', 'IBK', 'NH',
  '레버리지', '인버스', '2X', '3X', 'SHORT', 'BEAR', 'BULL',
  '선물', '채권', '리츠', 'REIT', '머니마켓', 'MMF', 'TOP',
];

async function fetchPage(url) {
  const res = await fetch(url, { headers: HEADERS });
  const buffer = await res.arrayBuffer();
  const html = new TextDecoder('euc-kr').decode(buffer);
  const { load } = await import('cheerio');
  const $ = load(html);
  const stocks = [];
  $('table.type_2 tr').each((i, el) => {
    const tds = $(el).find('td');
    if (tds.length < 5) return;
    const nameEl = $(tds[1]).find('a');
    const name = nameEl.text().trim();
    const href = nameEl.attr('href') || '';
    const codeMatch = href.match(/code=(\d+)/);
    const code = codeMatch ? codeMatch[1] : '';
    if (!name || !code) return;
    if (EXCLUDE.some(kw => name.toUpperCase().includes(kw.toUpperCase()))) return;
    stocks.push({
      name, code,
      price:      $(tds[2]).text().trim().replace(/,/g, '') || '0',
      change:     $(tds[3]).text().trim().replace(/,/g, '') || '0',
      changeRate: $(tds[4]).text().trim() || '0%',
      volume:     $(tds[5])?.text().trim().replace(/,/g, '') || '0',
      amount:     $(tds[6])?.text().trim().replace(/,/g, '') || '0',
      marcap:     $(tds[9])?.text().trim().replace(/,/g, '') || '0',
    });
  });
  return stocks;
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'volume';

  const baseMap = {
    volume: 'https://finance.naver.com/sise/sise_quant.naver?sosok=0',
    amount: 'https://finance.naver.com/sise/sise_quant.naver?sosok=0',
    marcap: 'https://finance.naver.com/sise/sise_market_sum.naver?sosok=0',
    rise:   'https://finance.naver.com/sise/sise_rise.naver?sosok=0',
    fall:   'https://finance.naver.com/sise/sise_fall.naver?sosok=0',
  };
  const base = baseMap[type];
  if (!base) return Response.json({ error: '잘못된 타입' }, { status: 400 });

  try {
    // 거래량/거래대금은 KOSDAQ(sosok=1)까지 같이 가져와야 75개 확보 가능
    const isQuantType = type === 'volume' || type === 'amount';
    const pages = isQuantType
      ? [
          fetchPage(`${base}&page=1`),
          fetchPage(`${base}&page=2`),
          fetchPage(base.replace('sosok=0', 'sosok=1') + '&page=1'),
        ]
      : [
          fetchPage(`${base}&page=1`),
          fetchPage(`${base}&page=2`),
        ];

    const results = await Promise.all(pages);

    const seen = new Set();
    const stocks = results.flat().filter(s => {
      if (seen.has(s.code)) return false;
      seen.add(s.code);
      return true;
    });

    if (type === 'amount') stocks.sort((a, b) => Number(b.amount) - Number(a.amount));
    if (type === 'volume') stocks.sort((a, b) => Number(b.volume) - Number(a.volume));

    return Response.json({ stocks: stocks.slice(0, 75) });
  } catch (error) {
    console.error('API 에러:', error);
    return Response.json({ error: '데이터 조회 실패: ' + error.message }, { status: 500 });
  }
}