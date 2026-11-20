import { getAdminFirestore } from '@/lib/firebase-admin';
import { getKRXDailyStocks } from '@/lib/krx-cache';
import { fetchIndices } from '@/lib/indices';
import { askAI } from '@/lib/openrouter';
import { kstDay } from '@/lib/evalUtils';

const NAVER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://m.stock.naver.com',
  'Accept': 'application/json',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

async function fetchIndexFromNaver(code) {
  const res = await fetch(`https://m.stock.naver.com/api/index/${code}/basic`, { headers: NAVER_HEADERS });
  if (!res.ok) throw new Error(`Naver ${code} HTTP ${res.status}`);
  const d = await res.json();
  const price = parseFloat((d.closePrice || '0').replace(/,/g, ''));
  if (!price) throw new Error(`Naver ${code} price=0`);
  return {
    price,
    change: parseFloat((d.compareToPreviousClosePrice || '0').replace(/,/g, '')).toFixed(2),
    changePercent: parseFloat(d.fluctuationsRatio || '0').toFixed(2),
  };
}

async function fetchIndexFromYahoo(symbol) {
  const res = await fetch(
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=2d`,
    { headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' } }
  );
  if (!res.ok) throw new Error(`Yahoo ${symbol} HTTP ${res.status}`);
  const data = await res.json();
  const meta = data.chart?.result?.[0]?.meta;
  if (!meta?.regularMarketPrice) throw new Error(`Yahoo ${symbol} no price`);
  const price = meta.regularMarketPrice;
  const prevClose = meta.previousClose || meta.chartPreviousClose || price;
  const change = price - prevClose;
  return {
    price,
    change: change.toFixed(2),
    changePercent: ((change / prevClose) * 100).toFixed(2),
  };
}

async function fetchMarketIndices() {
  // 야후(차트와 같은 출처)를 먼저 시도: 미국 지수 포함. 기존에 쓰던 네이버는 등락이 0으로 저장되는 문제가 있어 보조로만 쓴다
  try {
    const list = await fetchIndices();
    const m = Object.fromEntries(list.map((i) => [i.key, i]));
    const pick = (i) => ({ price: i.price, change: i.change.toFixed(2), changePercent: i.changePercent.toFixed(2) });
    if (m.KOSPI && m.KOSDAQ) {
      return {
        kospi: pick(m.KOSPI), kosdaq: pick(m.KOSDAQ),
        us: ['SPX', 'IXIC', 'DJI'].filter((k) => m[k]).map((k) => ({ key: k, label: m[k].label, ...pick(m[k]) })),
      };
    }
  } catch (e) {
    console.error('Yahoo indices failed:', e.message);
  }

  // Naver mobile API
  try {
    const [kospi, kosdaq] = await Promise.all([
      fetchIndexFromNaver('KOSPI'),
      fetchIndexFromNaver('KOSDAQ'),
    ]);
    return { kospi, kosdaq };
  } catch (e) {
    console.error('Naver index API failed:', e.message);
  }

  // Yahoo Finance fallback
  try {
    const [kospi, kosdaq] = await Promise.all([
      fetchIndexFromYahoo('^KS11'),
      fetchIndexFromYahoo('^KQ11'),
    ]);
    return { kospi, kosdaq };
  } catch (e) {
    console.error('Yahoo Finance index failed:', e.message);
    return { kospi: null, kosdaq: null };
  }
}

const KRX_EXCLUDE = ['ETF','KODEX','TIGER','KINDEX','KOSEF','ARIRANG','HANARO','KBSTAR','SOL','ACE','레버리지','인버스','2X','3X','선물','채권'];

async function fetchTopStocks() {
  try {
    const { stocks: all, basDd } = await getKRXDailyStocks();
    const filtered = all.filter(s => s.ISU_NM && !KRX_EXCLUDE.some(kw => s.ISU_NM.toUpperCase().includes(kw.toUpperCase())));
    const fmt = s => ({ name: s.ISU_NM, code: s.ISU_CD, changeRate: `${s.FLUC_RT}%`, volume: s.ACC_TRDVOL });

    const topRise = filtered
      .filter(s => Number(s.FLUC_RT) > 0)
      .sort((a, b) => Number(b.FLUC_RT) - Number(a.FLUC_RT))
      .slice(0, 5).map(fmt);
    const topVolume = [...filtered]
      .sort((a, b) => Number(b.ACC_TRDVOL) - Number(a.ACC_TRDVOL))
      .slice(0, 5).map(fmt);

    return { topRise, topVolume, basDd };
  } catch (e) {
    console.error('KRX fetchTopStocks failed:', e.message);
    return { topRise: [], topVolume: [] };
  }
}

async function fetchNews() {
  try {
    const query = encodeURIComponent('코스피 코스닥 증시 시황');
    const res = await fetch(
      `https://openapi.naver.com/v1/search/news.json?query=${query}&display=5&sort=date`, // 최신순 (관련도순은 며칠 지난 기사가 섞였다)
      {
        headers: {
          'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
          'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
        },
        signal: AbortSignal.timeout(8000),
      }
    );
    const data = await res.json();
    return (data.items || []).map(item => ({
      title: item.title.replace(/<[^>]*>/g, ''),
      link: item.originallink || item.link,
      press: (() => { try { return new URL(item.originallink || item.link).hostname.replace('www.', ''); } catch { return ''; } })(),
      time: new Date(item.pubDate).toLocaleString('ko-KR', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }),
    }));
  } catch (e) {
    console.error('News fetch failed:', e.message);
    return [];
  }
}

// 지금이 장 전/장중/장 마감 후 중 어디인지 (브리핑 문구를 시간대에 맞추기 위해)
function sessionLabel() {
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  const m = d.getUTCHours() * 60 + d.getUTCMinutes(), wd = d.getUTCDay();
  if (wd === 0 || wd === 6) return '주말';
  return m < 540 ? '장 시작 전' : m <= 930 ? '장중' : '장 마감 후';
}

async function generateAIComment({ kospi, kosdaq, us = [], topRise, news, riseIsToday }) {
  const dir = (pct) => Number(pct) >= 0 ? '상승' : '하락';
  const fmtPct = (pct) => `${Number(pct) >= 0 ? '+' : ''}${pct}%`;
  const session = sessionLabel();

  const prompt = `지금은 한국 증시 ${session}이야. 다음 데이터를 바탕으로 지금 시점의 시황 브리핑을 작성해줘.

[시장 데이터]
- 코스피: ${kospi?.price?.toLocaleString() ?? 'N/A'} (${fmtPct(kospi?.changePercent ?? 0)} ${dir(kospi?.changePercent)})
- 코스닥: ${kosdaq?.price?.toLocaleString() ?? 'N/A'} (${fmtPct(kosdaq?.changePercent ?? 0)} ${dir(kosdaq?.changePercent)})${us.length ? '\n- 미국 지수: ' + us.map((x) => `${x.label} ${x.price.toLocaleString()} (${fmtPct(x.changePercent)})`).join(', ') : ''}
- ${riseIsToday ? '오늘' : '전 거래일'} 상승률 상위 종목: ${topRise.slice(0, 3).map(s => `${s.name}(${s.changeRate})`).join(', ') || '없음'}
- 주요 뉴스 헤드라인: ${news.slice(0, 3).map(n => n.title).join(' / ') || '없음'}

[작성 조건]
- 3~4문장으로 핵심만 간결하게
- 실제 투자자 입장에서 지금 시장 분위기와 주목 포인트 (${session} 기준으로, 지수 수치는 위 데이터 그대로)
- 친근하면서 전문적인 톤, 한국어`;

  return askAI({ tag: 'morning-brief', json: false, messages: [{ role: 'user', content: prompt }], maxTokens: 500, perCallMs: 20000, deadline: Date.now() + 25000 });
}

export async function generateAndSave(dateKey) {
  const [indices, stocks, news] = await Promise.all([
    fetchMarketIndices(),
    fetchTopStocks(),
    fetchNews(),
  ]);

  const aiComment = await generateAIComment({
    kospi: indices.kospi,
    kosdaq: indices.kosdaq,
    us: indices.us,
    topRise: stocks.topRise,
    news,
    riseIsToday: stocks.basDd === dateKey.replace(/-/g, ''),
  });

  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const briefing = {
    date: dateKey,
    generatedAt: kstNow.toISOString(),
    kospi: indices.kospi,
    kosdaq: indices.kosdaq,
    us: indices.us || [],
    topRise: stocks.topRise,
    topVolume: stocks.topVolume,
    topBasDd: stocks.basDd || null, // 상승률·거래량 순위의 기준일 (KRX, 장 마감 후에 갱신)
    session: sessionLabel(),
    news,
    aiComment: aiComment || null,
  };

  const db = getAdminFirestore();
  await db.collection('briefings').doc(dateKey).set(briefing);
  return briefing;
}

const MAX_AGE = 60 * 60 * 1000; // 1시간 지나면 오래된 것으로 본다
// generatedAt 은 한국시간을 UTC 표기로 저장해 왔으므로 9시간을 빼서 비교
const isStale = (b) => Date.now() - (Date.parse(b.generatedAt) - 9 * 3600 * 1000) > MAX_AGE;

function isCacheValid(cached) {
  if (!cached) return false;
  if (!cached.kospi?.price) return false;
  if (!cached.aiComment) return false;
  if (cached.aiComment.includes('준비 중')) return false;
  if (!cached.topRise?.length) return false;
  return true;
}

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === '1';
    const home = searchParams.get('home') === '1';

    const db = getAdminFirestore();
    const dateKey = kstDay(Date.now());

    // ?home=1: 캐시만 즉시 반환 (홈 위젯용, 재생성 없음)
    if (home) {
      const snap = await db.collection('briefings').doc(dateKey).get();
      if (snap.exists) return Response.json({ briefing: snap.data() });
      return Response.json({ briefing: null });
    }

    if (!force) {
      const snap = await db.collection('briefings').doc(dateKey).get();
      // 저장된 게 있으면 바로 보여주고, 1시간이 지났으면 stale 로 알려 화면이 뒤에서 새로 만들게 한다
      if (snap.exists && isCacheValid(snap.data())) {
        return Response.json({ briefing: snap.data(), stale: isStale(snap.data()) });
      }
    }

    const briefing = await generateAndSave(dateKey);
    return Response.json({ briefing });
  } catch (error) {
    console.error('Morning brief error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
