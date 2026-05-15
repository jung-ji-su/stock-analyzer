import { getAdminFirestore } from '@/lib/firebase-admin';
import { getKRXDailyStocks } from '@/lib/krx-cache';

const NAVER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://m.stock.naver.com',
  'Accept': 'application/json',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

function getKSTDateKey() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

function getBaseUrl() {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
}

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
  // Naver mobile API 먼저 시도
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
    const { stocks: all } = await getKRXDailyStocks();
    const filtered = all.filter(s => s.ISU_NM && !KRX_EXCLUDE.some(kw => s.ISU_NM.toUpperCase().includes(kw.toUpperCase())));
    const fmt = s => ({ name: s.ISU_NM, code: s.ISU_CD, changeRate: `${s.FLUC_RT}%`, volume: s.ACC_TRDVOL });

    const topRise = filtered
      .filter(s => Number(s.FLUC_RT) > 0)
      .sort((a, b) => Number(b.FLUC_RT) - Number(a.FLUC_RT))
      .slice(0, 5).map(fmt);
    const topVolume = [...filtered]
      .sort((a, b) => Number(b.ACC_TRDVOL) - Number(a.ACC_TRDVOL))
      .slice(0, 5).map(fmt);

    return { topRise, topVolume };
  } catch (e) {
    console.error('KRX fetchTopStocks failed:', e.message);
    return { topRise: [], topVolume: [] };
  }
}

async function fetchNews() {
  try {
    const query = encodeURIComponent('코스피 코스닥 증시 시황');
    const res = await fetch(
      `https://openapi.naver.com/v1/search/news.json?query=${query}&display=5&sort=sim`,
      {
        headers: {
          'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
          'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
        },
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

async function generateAIComment({ kospi, kosdaq, topRise, news }) {
  const dir = (pct) => Number(pct) >= 0 ? '상승' : '하락';
  const fmtPct = (pct) => `${Number(pct) >= 0 ? '+' : ''}${pct}%`;

  const prompt = `다음 한국 주식시장 데이터를 바탕으로 오늘의 아침 시황 브리핑을 작성해줘.

[시장 데이터]
- 코스피: ${kospi?.price?.toLocaleString() ?? 'N/A'} (${fmtPct(kospi?.changePercent ?? 0)} ${dir(kospi?.changePercent)})
- 코스닥: ${kosdaq?.price?.toLocaleString() ?? 'N/A'} (${fmtPct(kosdaq?.changePercent ?? 0)} ${dir(kosdaq?.changePercent)})
- 상승률 상위 종목: ${topRise.slice(0, 3).map(s => `${s.name}(${s.changeRate})`).join(', ') || '없음'}
- 주요 뉴스 헤드라인: ${news.slice(0, 3).map(n => n.title).join(' / ') || '없음'}

[작성 조건]
- 3~4문장으로 핵심만 간결하게
- 실제 투자자 입장에서 오늘 시장 분위기와 주목 포인트
- 친근하면서 전문적인 톤, 한국어`;

  try {
    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.0-flash-001',
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
      }),
    });
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content?.trim();
    return text || null;
  } catch (e) {
    console.error('AI comment failed:', e.message);
    return null;
  }
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
    topRise: stocks.topRise,
    news,
  });

  const kstNow = new Date(Date.now() + 9 * 3600 * 1000);
  const briefing = {
    date: dateKey,
    generatedAt: kstNow.toISOString(),
    kospi: indices.kospi,
    kosdaq: indices.kosdaq,
    topRise: stocks.topRise,
    topVolume: stocks.topVolume,
    news,
    aiComment: aiComment || null,
  };

  const db = getAdminFirestore();
  await db.collection('briefings').doc(dateKey).set(briefing);
  return briefing;
}

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
    const dateKey = getKSTDateKey();

    // ?home=1: 캐시만 즉시 반환 (홈 위젯용, 재생성 없음)
    if (home) {
      const snap = await db.collection('briefings').doc(dateKey).get();
      if (snap.exists) return Response.json({ briefing: snap.data() });
      return Response.json({ briefing: null });
    }

    if (!force) {
      const snap = await db.collection('briefings').doc(dateKey).get();
      if (snap.exists && isCacheValid(snap.data())) {
        return Response.json({ briefing: snap.data() });
      }
    }

    const briefing = await generateAndSave(dateKey);
    return Response.json({ briefing });
  } catch (error) {
    console.error('Morning brief error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
