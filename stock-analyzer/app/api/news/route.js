export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) return Response.json({ articles: [] });
  if (!process.env.NAVER_CLIENT_ID || !process.env.NAVER_CLIENT_SECRET) {
    return Response.json({ articles: [], allArticles: [] });
  }

  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=50&sort=sim`,
      {
        headers: {
          'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
          'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
        },
      }
    );

    const data = await res.json();
    const allArticles = (data.items || []).map(item => ({
      title: item.title.replace(/<[^>]*>/g, ''),
      link: item.originallink || item.link,
      press: item.link.includes('news.naver.com') ? '네이버뉴스' : (() => { try { return new URL(item.originallink || item.link).hostname; } catch { return '기타'; } })(),
      time: new Date(item.pubDate).toLocaleDateString('ko-KR'),
      desc: item.description.replace(/<[^>]*>/g, ''),
    }));

    // 화면에는 5개만, AI 분석용으로는 50개 전달
    return Response.json({
      articles: allArticles.slice(0, 5),
      allArticles: allArticles,
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}