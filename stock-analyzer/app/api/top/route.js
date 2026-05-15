import { getKRXDailyStocks } from '@/lib/krx-cache';

const EXCLUDE = [
  'ETF','KODEX','TIGER','KINDEX','KOSEF','ARIRANG','HANARO','KBSTAR',
  'SMART','SOL','ACE','BNK','IBK','NH','레버리지','인버스',
  '2X','3X','SHORT','BEAR','BULL','선물','채권','리츠','REIT','머니마켓','MMF',
];

function isExcluded(name) {
  const u = name.toUpperCase();
  return EXCLUDE.some(kw => u.includes(kw.toUpperCase()));
}

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const type = searchParams.get('type') || 'volume';
  const validTypes = ['rise', 'fall', 'volume', 'amount', 'marcap'];
  if (!validTypes.includes(type)) {
    return Response.json({ error: '잘못된 타입' }, { status: 400 });
  }

  try {
    const { stocks: all, basDd: date } = await getKRXDailyStocks();
    const filtered = all.filter(s => s.ISU_NM && !isExcluded(s.ISU_NM));

    let sorted;
    if (type === 'rise') {
      sorted = filtered
        .filter(s => Number(s.FLUC_RT) > 0)
        .sort((a, b) => Number(b.FLUC_RT) - Number(a.FLUC_RT));
    } else if (type === 'fall') {
      sorted = filtered
        .filter(s => Number(s.FLUC_RT) < 0)
        .sort((a, b) => Number(a.FLUC_RT) - Number(b.FLUC_RT));
    } else if (type === 'volume') {
      sorted = [...filtered].sort((a, b) => Number(b.ACC_TRDVOL) - Number(a.ACC_TRDVOL));
    } else if (type === 'amount') {
      sorted = [...filtered].sort((a, b) => Number(b.ACC_TRDVAL) - Number(a.ACC_TRDVAL));
    } else {
      sorted = [...filtered].sort((a, b) => Number(b.MKTCAP) - Number(a.MKTCAP));
    }

    const stocks = sorted.slice(0, 100).map(s => ({
      name: s.ISU_NM,
      code: s.ISU_CD,
      market: s.MKT_NM,
      price: s.TDD_CLSPRC,
      change: s.CMPPREVDD_PRC,
      changeRate: `${Number(s.FLUC_RT) >= 0 ? '+' : ''}${s.FLUC_RT}%`,
      volume: s.ACC_TRDVOL,
      amount: s.ACC_TRDVAL,
      marcap: s.MKTCAP,
    }));

    return Response.json({ stocks, date });
  } catch (error) {
    console.error('[/api/top] error:', error.message);
    return Response.json({ error: '데이터 조회 실패: ' + error.message }, { status: 500 });
  }
}
