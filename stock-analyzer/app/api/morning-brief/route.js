import { getAdminFirestore } from '@/lib/firebase-admin';
import yahooFinance from 'yahoo-finance2';

function getKSTDateKey() {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

async function fetchMarketIndices() {
  try {
    const [kospi, kosdaq] = await Promise.all([
      yahooFinance.quote('^KS11'),
      yahooFinance.quote('^KQ11'),
    ]);
    return {
      kospi: {
        price: Math.round(kospi.regularMarketPrice),
        change: kospi.regularMarketChange?.toFixed(2),
        changePercent: kospi.regularMarketChangePercent?.toFixed(2),
      },
      kosdaq: {
        price: Math.round(kosdaq.regularMarketPrice),
        change: kosdaq.regularMarketChange?.toFixed(2),
        changePercent: kosdaq.regularMarketChangePercent?.toFixed(2),
      },
    };
  } catch (e) {
    console.error('Index fetch failed:', e.message);
    return { kospi: null, kosdaq: null };
  }
}

async function fetchTopStocks(base) {
  try {
    const [riseRes, volRes] = await Promise.all([
      fetch(`${base}/api/top?type=rise`).then(r => r.json()),
      fetch(`${base}/api/top?type=volume`).then(r => r.json()),
    ]);
    return {
      topRise: (riseRes.stocks || []).slice(0, 3),
      topVolume: (volRes.stocks || []).slice(0, 3),
    };
  } catch (e) {
    return { topRise: [], topVolume: [] };
  }
}

async function fetchNews(base) {
  try {
    const res = await fetch(`${base}/api/news?q=오늘 코스피 코스닥 증시 주식`);
    const data = await res.json();
    return (data.articles || []).slice(0, 4);
  } catch (e) {
    return [];
  }
}

async function generateAIComment({ kospi, kosdaq, topRise, news }) {
  const kospiDir = kospi ? (Number(kospi.changePercent) >= 0 ? '상승' : '하락') : '보합';
  const kosdaqDir = kosdaq ? (Number(kosdaq.changePercent) >= 0 ? '상승' : '하락') : '보합';

  const prompt = `다음 데이터를 바탕으로 오늘의 한국 주식시장 아침 브리핑을 작성해줘.

[시장 데이터]
- 코스피: ${kospi?.price?.toLocaleString() || 'N/A'} (${Number(kospi?.changePercent || 0) >= 0 ? '+' : ''}${kospi?.changePercent || '0'}% ${kospiDir})
- 코스닥: ${kosdaq?.price?.toLocaleString() || 'N/A'} (${Number(kosdaq?.changePercent || 0) >= 0 ? '+' : ''}${kosdaq?.changePercent || '0'}% ${kosdaqDir})
- 상승률 상위: ${topRise.map(s => `${s.name}(${s.changeRate})`).join(', ') || '데이터 없음'}
- 주요 뉴스: ${news.map(n => n.title).slice(0, 3).join(' / ') || '뉴스 없음'}

[조건]
- 3~4문장으로 짧고 핵심만
- 실제 투자자 관점에서 오늘 시장 분위기와 주목 포인트
- 친근하면서 전문적인 톤
- 한국어로 작성`;

  const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'google/gemini-flash-1.5',
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 400,
    }),
  });
  const data = await res.json();
  return data.choices?.[0]?.message?.content?.trim() || null;
}

export async function generateAndSave(dateKey) {
  const base = process.env.NEXT_PUBLIC_BASE_URL;

  const [indices, stocks, news] = await Promise.all([
    fetchMarketIndices(),
    fetchTopStocks(base),
    fetchNews(base),
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
    aiComment: aiComment || '오늘의 시황 분석을 준비 중입니다. 잠시 후 다시 확인해주세요.',
  };

  const db = getAdminFirestore();
  await db.collection('briefings').doc(dateKey).set(briefing);
  return briefing;
}

export async function GET() {
  try {
    const db = getAdminFirestore();
    const dateKey = getKSTDateKey();

    const snap = await db.collection('briefings').doc(dateKey).get();
    if (snap.exists) {
      return Response.json({ briefing: snap.data() });
    }

    const briefing = await generateAndSave(dateKey);
    return Response.json({ briefing });
  } catch (error) {
    console.error('Morning brief GET error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
