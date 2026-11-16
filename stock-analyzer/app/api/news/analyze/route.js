import { askAI } from '@/lib/openrouter';
import { requireUser, unauthorized } from '@/lib/verifyAuth';

export const maxDuration = 60;

export async function POST(request) {
  if (!(await requireUser(request))) return unauthorized();
  try {
    const { news, stockName } = await request.json();
    if (!process.env.OPENROUTER_API_KEY) {
      return Response.json({ error: 'API 키가 설정되지 않았습니다' }, { status: 500 });
    }

    // 뉴스 데이터 전처리: 너무 많은 뉴스가 들어올 경우 토큰 제한을 고려해 슬라이싱
    const limitedNews = (news || []).slice(0, 10);

    const messages = [
      {
        role: 'system',
        content: `당신은 노련한 주식 투자 전략가입니다. 제공된 뉴스가 ${stockName}의 주가에 미칠 영향을 분석합니다.
            단기 변동성보다는 기업 가치와 시장 심리에 미치는 실질적인 영향을 중심으로 판단하세요. 모든 문장은 반드시 한국어로만 작성하세요.`
      },
      {
        role: 'user',
        content: `다음 뉴스들을 분석하여 투자 관점의 보고서를 작성하세요.

            ${limitedNews.map((n, i) => `[뉴스 ${i+1}]\n제목: ${n.title}\n내용: ${n.desc || ''}`).join('\n\n')}

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
    ];

    const parsed = await askAI({
      tag: 'news-analyze', messages, deadline: Date.now() + 50000, // 함수 한도(60s) 안에서 쓸 수 있는 AI 호출 예산
      validate: (p) => {
        const sentiment = ['긍정', '부정', '중립'].find((k) => String(p?.sentiment ?? '').includes(k));
        return sentiment ? { ...p, sentiment, score: Number(p.score) || 50 } : null;
      },
    });
    if (parsed) return Response.json(parsed);

    return Response.json({ error: '분석 중 오류가 발생했습니다.' }, { status: 500 });
  } catch (e) {
    console.error('Sentiment Analysis Error:', e);
    return Response.json({ error: '분석 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
