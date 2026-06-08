export async function POST(request) {
  try {
    const { news, stockName } = await request.json();
    if (!process.env.OPENROUTER_API_KEY) {
      return Response.json({ error: 'API 키가 설정되지 않았습니다' }, { status: 500 });
    }

    // 1. 뉴스 데이터 전처리: 너무 많은 뉴스가 들어올 경우 토큰 제한을 고려해 슬라이싱
    const limitedNews = news.slice(0, 10); 

    const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'openrouter/auto',
        // JSON 모드를 지원하는 모델 사용 시 명시 (OpenRouter 설정 확인 필요)
        messages: [
          {
            role: 'system',
            content: `당신은 노련한 주식 투자 전략가입니다. 제공된 뉴스가 ${stockName}의 주가에 미칠 영향을 분석합니다. 
            단기 변동성보다는 기업 가치와 시장 심리에 미치는 실질적인 영향을 중심으로 판단하세요.`
          },
          {
            role: 'user',
            content: `다음 뉴스들을 분석하여 투자 관점의 보고서를 작성하세요.
            
            ${limitedNews.map((n, i) => `[뉴스 ${i+1}]\n제목: ${n.title}\n내용: ${n.desc}`).join('\n\n')}

            반드시 아래 JSON 형식으로만 답변하세요:
            {
              "sentiment": "긍정" | "부정" | "중립",
              "score": 0~100,
              "summary": "주요 뉴스 요약 (3줄 이내)",
              "impact": "향후 주가 예상 및 투자 심리 분석",
              "key_factors": ["핵심 키워드1", "핵심 키워드2"],
              "easyExplain": "초보자를 위한 비유 섞인 설명"
            }`
          }
        ],
        temperature: 0.3, // 분석의 일관성을 위해 낮은 온도를 권장합니다.
      }),
    });

    const data = await res.json();
    
    // 에러 핸들링 강화
    if (!data.choices || data.choices.length === 0) {
      throw new Error('LLM 응답이 비어있습니다.');
    }

    const text = data.choices[0].message.content;
    
    try {
      const start = text.indexOf('{');
      const end = text.lastIndexOf('}');
      if (start === -1 || end === -1 || end < start) {
        return Response.json({ error: '데이터 형식 변환 중 오류가 발생했습니다.' }, { status: 500 });
      }
      const cleanedJson = text.substring(start, end + 1);
      return Response.json(JSON.parse(cleanedJson));
    } catch (parseError) {
      return Response.json({ error: '데이터 형식 변환 중 오류가 발생했습니다.' }, { status: 500 });
    }

  } catch (e) {
    console.error('Sentiment Analysis Error:', e);
    return Response.json({ error: '분석 중 오류가 발생했습니다.' }, { status: 500 });
  }
}