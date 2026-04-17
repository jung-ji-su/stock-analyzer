export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get('q');

  if (!query) return Response.json({ articles: [] });

  try {
    const res = await fetch(
      `https://openapi.naver.com/v1/search/news.json?query=${encodeURIComponent(query)}&display=5&sort=sim`,
      {
        headers: {
          'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID,
          'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET,
        },
      }
    );

    const data = await res.json();
    const articles = (data.items || []).map(item => ({
      title: item.title.replace(/<[^>]*>/g, ''),
      link: item.originallink || item.link,
      press: item.link.includes('news.naver.com') ? '네이버뉴스' : new URL(item.originallink || item.link).hostname,
      time: new Date(item.pubDate).toLocaleDateString('ko-KR'),
      desc: item.description.replace(/<[^>]*>/g, ''),
    }));

    return Response.json({ articles });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}