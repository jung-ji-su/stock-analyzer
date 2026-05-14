import { getAdminFirestore } from '@/lib/firebase-admin';

const HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
};

function getKSTDateKey() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// Vercel 환경에서 VERCEL_URL, 로컬은 NEXT_PUBLIC_BASE_URL
function getBaseUrl() {
  if (process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000';
}

async function fetchMarketIndices() {
  try {
    const [kospiRes, kosdaqRes] = await Promise.all([
      fetch('https://m.stock.naver.com/api/index/KOSPI/basic', { headers: HEADERS }),
      fetch('https://m.stock.naver.com/api/index/KOSDAQ/basic', { headers: HEADERS }),
    ]);
    const [k, q] = await Promise.all([kospiRes.json(), kosdaqRes.json()]);

    const parse = (d) => ({
      price: parseFloat((d.closePrice || '0').replace(/,/g, '')),
      change: parseFloat((d.compareToPreviousClosePrice || '0').replace(/,/g, '')).toFixed(2),
      changePercent: parseFloat(d.fluctuationsRatio || '0').toFixed(2),
    });

    return { kospi: parse(k), kosdaq: parse(q) };
  } catch (e) {
    console.error('Index fetch failed:', e.message);
    return { kospi: null, kosdaq: null };
  }
}

async function fetchTopStocks() {
  try {
    const base = getBaseUrl();
    const [riseRes, volRes] = await Promise.all([
      fetch(`${base}/api/top?type=rise`).then(r => r.json()),
      fetch(`${base}/api/top?type=volume`).then(r => r.json()),
    ]);
    return {
      topRise: (riseRes.stocks || []).slice(0, 5),
      topVolume: (volRes.stocks || []).slice(0, 5),
    };
  } catch (e) {
    console.error('Top stocks fetch failed:', e.message);
    return { topRise: [], topVolume: [] };
  }
}

// Naver News API 직접 호출 (오늘 날짜순)
async function fetchNews() {
  try {
    const query = encodeURIComponent('코스피 코스닥 증시 시황');
    const res = await fetch(
      `https://openapi.naver.com/v1/search/news.json?query=${query}&display=5&sort=date`,
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
        model: 'google/gemini-flash-1.5',
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

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const force = searchParams.get('force') === '1';

    const db = getAdminFirestore();
    const dateKey = getKSTDateKey();

    if (!force) {
      const snap = await db.collection('briefings').doc(dateKey).get();
      if (snap.exists) {
        const cached = snap.data();
        // aiComment가 있으면 캐시 사용, 없으면 재생성
        if (cached.aiComment) {
          return Response.json({ briefing: cached });
        }
      }
    }

    const briefing = await generateAndSave(dateKey);
    return Response.json({ briefing });
  } catch (error) {
    console.error('Morning brief error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
