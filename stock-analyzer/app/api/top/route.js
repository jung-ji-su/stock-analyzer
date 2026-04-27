export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'volume';

  try {
    const urlMap = {
      volume: 'https://finance.naver.com/sise/sise_quant.naver?sosok=0',
      amount: 'https://finance.naver.com/sise/sise_quant.naver?sosok=0',
      marcap: 'https://finance.naver.com/sise/sise_market_sum.naver?sosok=0',
      rise: 'https://finance.naver.com/sise/sise_rise.naver?sosok=0',
      fall: 'https://finance.naver.com/sise/sise_fall.naver?sosok=0',
    };

    const url = urlMap[type];
    if (!url) return Response.json({ error: '잘못된 타입' }, { status: 400 });

    const res = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Referer': 'https://finance.naver.com',
        'Accept-Language': 'ko-KR,ko;q=0.9',
      },
    });

    const buffer = await res.arrayBuffer();
    const decoder = new TextDecoder('euc-kr');
    const html = decoder.decode(buffer);

    const { load } = await import('cheerio');
    const $ = load(html);

    const excludeKeywords = [
      'ETF', 'KODEX', 'TIGER', 'KINDEX', 'KOSEF', 'ARIRANG', 'HANARO',
      'KBSTAR', 'SMART', 'SOL', 'ACE', 'BNK', 'IBK', 'NH',
      '레버리지', '인버스', '2X', '3X', 'SHORT', 'BEAR', 'BULL',
      '선물', '채권', '리츠', 'REIT', '머니마켓', 'MMF', 'TOP'
    ];

    const stocks = [];

    $('table.type_2 tr').each((i, el) => {
      const tds = $(el).find('td');
      if (tds.length < 5) return;

      const nameEl = $(tds[1]).find('a');
      const name = nameEl.text().trim();
      const href = nameEl.attr('href') || '';
      const codeMatch = href.match(/code=(\d+)/);
      const code = codeMatch ? codeMatch[1] : '';
      
      const price = $(tds[2]).text().trim().replace(/,/g, '') || '0';
      const change = $(tds[3]).text().trim().replace(/,/g, '') || '0';
      const changeRate = $(tds[4]).text().trim() || '0%';
      const volume = $(tds[5]) ? $(tds[5]).text().trim().replace(/,/g, '') : '0';
      const amount = $(tds[6]) ? $(tds[6]).text().trim().replace(/,/g, '') : '0';
      const marcap = $(tds[9]) ? $(tds[9]).text().trim().replace(/,/g, '') : '0';

      const isExcluded = excludeKeywords.some(kw =>
        name.toUpperCase().includes(kw.toUpperCase())
      );

      if (name && code && price && !isExcluded) {
        stocks.push({ 
          name, 
          code, 
          price,
          change,
          changeRate,
          volume,
          amount,
          marcap,
        });
      }
    });

    if (type === 'amount') {
      stocks.sort((a, b) => Number(b.amount) - Number(a.amount));
    }

    return Response.json({ stocks: stocks.slice(0, 50) });

  } catch (error) {
    console.error('API 에러:', error);
    return Response.json({ error: '데이터 조회 실패: ' + error.message }, { status: 500 });
  }
}