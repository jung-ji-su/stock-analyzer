export async function POST(request) {
  try {
    const { news, stockName } = await request.json();
    if (!process.env.OPENROUTER_API_KEY) {
      return Response.json({ error: 'API 키가 설정되지 않았습니다' }, { status: 500 });
    }

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openrouter/auto',
        messages: [{
          role: 'user',
          content: `다음 ${stockName} 관련 뉴스들을 분석해서 주식 투자 관점에서 감성 분석해줘.

${news.map((n, i) => `${i+1}. ${n.title}\n${n.desc}`).join('\n\n')}

아래 JSON 형식으로만 응답해줘:
{
  "sentiment": "긍정" 또는 "부정" 또는 "중립",
  "score": 0~100 (100이 가장 긍정적),
  "summary": "뉴스 전체 요약 2~3줄",
  "impact": "주가 영향 분석 1~2줄",
  "easyExplain": "주린이도 이해할 수 있는 쉬운 설명 1~2줄"
}`
        }],
      }),
    });

    const data = await res.json();
    const text = data.choices?.[0]?.message?.content;
    if (!text) return Response.json({ error: 'AI 응답이 없습니다' }, { status: 500 });
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (!jsonMatch) return Response.json({ error: '파싱 실패' }, { status: 500 });
    let parsed;
    try {
      parsed = JSON.parse(jsonMatch[0]);
    } catch {
      return Response.json({ error: 'JSON 파싱 실패' }, { status: 500 });
    }
    return Response.json(parsed);
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}