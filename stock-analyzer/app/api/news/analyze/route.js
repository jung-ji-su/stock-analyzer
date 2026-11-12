import { jsonrepair } from 'jsonrepair';
import { requireUser, unauthorized } from '@/lib/verifyAuth';

export const maxDuration = 60;

// 무료 모델은 응답 시간·형식이 들쭉날쭉해서 같은 모델 재시도 + 대체 모델을 둔다
const MODELS = [
  'cohere/north-mini-code:free',
  'cohere/north-mini-code:free',
  'dots-studio/dots-3-note-preview:free',
];

function parseJSON(text) {
  const start = text.indexOf('{');
  if (start === -1) return null;
  const body = text.slice(start);
  try { return JSON.parse(body.slice(0, body.lastIndexOf('}') + 1)); } catch {}
  try { return JSON.parse(jsonrepair(body)); } catch {}
  return null;
}

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

    const deadline = Date.now() + 50000; // 함수 한도(60s) 안에서 쓸 수 있는 AI 호출 예산
    for (const model of MODELS) {
      const remaining = deadline - Date.now();
      if (remaining < 5000) break;
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), Math.min(30000, remaining));
      try {
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model,
            messages,
            temperature: 0.3, // 분석의 일관성을 위해 낮은 온도를 권장합니다.
            max_tokens: 2048,
            response_format: { type: 'json_object' },
          }),
          signal: controller.signal,
        });
        const data = await res.json(); // 본문 수신까지 타임아웃 유지
        clearTimeout(timer);

        if (data.error) {
          console.error(`[news-analyze] model ${model} error:`, JSON.stringify(data.error));
          continue;
        }
        const choice = data.choices?.[0];
        const text = choice?.message?.content?.trim();
        if (!text) {
          console.error(`[news-analyze] model ${model} empty response, finish_reason=${choice?.finish_reason}`);
          continue;
        }
        const parsed = parseJSON(text);
        const sentiment = ['긍정', '부정', '중립'].find(k => String(parsed?.sentiment ?? '').includes(k));
        if (!parsed || !sentiment) {
          console.error(`[news-analyze] model ${model} invalid format:`, text.slice(0, 200));
          continue;
        }
        parsed.sentiment = sentiment;
        parsed.score = Number(parsed.score) || 50;
        return Response.json(parsed);
      } catch (e) {
        clearTimeout(timer);
        console.error(`[news-analyze] model ${model} threw:`, e.message);
      }
    }

    return Response.json({ error: '분석 중 오류가 발생했습니다.' }, { status: 500 });
  } catch (e) {
    console.error('Sentiment Analysis Error:', e);
    return Response.json({ error: '분석 중 오류가 발생했습니다.' }, { status: 500 });
  }
}
