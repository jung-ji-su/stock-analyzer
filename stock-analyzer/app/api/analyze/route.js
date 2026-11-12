import { jsonrepair } from 'jsonrepair';
import { requireUser, unauthorized } from '@/lib/verifyAuth';
import { runAnalysis, generateScenarios, buildFallbackTexts, fmtPx, HORIZONS } from '@/lib/analysisEngine';

export const maxDuration = 60;

// 무료 모델은 응답 시간·형식이 들쭉날쭉해서 같은 모델 재시도 + 대체 모델을 둔다 (news/analyze 와 동일)
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

const isText = (v) => typeof v === 'string' && v.trim().length > 0;

// AI 가 쓴 설명만 받아들이고, 빠졌거나 형식이 틀린 항목은 점수 기반 기본 문구로 채운다
function mergeTexts(ai, fallback) {
  const out = { ...fallback };
  if (!ai || typeof ai !== 'object') return out;
  for (const key of Object.keys(HORIZONS)) {
    out[key] = {
      reason: isText(ai[key]?.reason) ? ai[key].reason.trim() : fallback[key].reason,
      easyReason: isText(ai[key]?.easyReason) ? ai[key].easyReason.trim() : fallback[key].easyReason,
    };
  }
  for (const key of ['summary', 'easySummary', 'quantInsight', 'riskWarning']) if (isText(ai[key])) out[key] = ai[key].trim();
  if (Array.isArray(ai.keyPoints) && ai.keyPoints.filter(isText).length) out.keyPoints = ai.keyPoints.filter(isText).slice(0, 4);
  if (ai.indicatorComments && typeof ai.indicatorComments === 'object') {
    out.indicatorComments = Object.fromEntries(Object.entries(ai.indicatorComments).filter(([, v]) => isText(v)));
  }
  return out;
}

// 설명 생성. 실패하면 null (호출부에서 기본 문구 사용)
async function callAI(systemPrompt, userPrompt) {
  const deadline = Date.now() + 45000;
  for (const model of MODELS) {
    const remaining = deadline - Date.now();
    if (remaining < 5000) break;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), Math.min(25000, remaining));
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: userPrompt }],
          temperature: 0.3,
          max_tokens: 2048,
          response_format: { type: 'json_object' },
        }),
        signal: controller.signal,
      });
      const data = await res.json();
      clearTimeout(timer);
      if (data.error) { console.error(`[analyze] model ${model} error:`, JSON.stringify(data.error)); continue; }
      const parsed = parseJSON(data.choices?.[0]?.message?.content || '');
      if (parsed && (isText(parsed.summary) || isText(parsed.daily?.reason))) return parsed;
      console.error(`[analyze] model ${model} invalid format, finish_reason=${data.choices?.[0]?.finish_reason}`);
    } catch (e) {
      clearTimeout(timer);
      console.error(`[analyze] model ${model} threw:`, e.message);
    }
  }
  return null;
}

const PERIOD_KO = { daily: '1거래일 뒤', weekly: '5거래일 뒤', monthly: '20거래일 뒤' };

// ============================
// ★ POST 핸들러
// ============================
export async function POST(request) {
  if (!(await requireUser(request))) return unauthorized();
  try {
    const { chartData, stockName, symbol, newsData, market, supply, supplyNet, newsSentiment } = await request.json();
    const us = market === 'US'; // 미국 종목: 달러 가격, 미국 시장 기준 프롬프트

    if (!process.env.OPENROUTER_API_KEY) {
      return Response.json({ error: 'API 키가 설정되지 않았습니다' }, { status: 500 });
    }
    if (!Array.isArray(chartData) || chartData.length < 10) {
      return Response.json({ error: '데이터가 부족합니다' }, { status: 400 });
    }

    // ── 점수·확률·기간별 전망은 전부 코드로 계산 (lib/analysisEngine.js) ──
    const result = runAnalysis({ chartData, newsData, stockName, us, supplyNet: us ? null : supplyNet, newsSentiment });
    const { indicators, scoreBreakdown, probability, confidence, keySignals, allSignals, horizons, news, extras } = result;
    const currentPrice = indicators.currentPrice;
    const scenarios = generateScenarios(indicators, probability, allSignals, us);
    const fallback = buildFallbackTexts(result, us);

    // ── AI 는 "확정된 결론"의 근거를 설명하는 역할만 한다 ──
    const systemPrompt = `당신은 ${us ? '미국 주식 시장(NYSE·NASDAQ)' : '한국 주식 시장'} 데이터를 주식 초보자에게 풀어 설명하는 애널리스트입니다. 답변은 한국어로 작성합니다.${us ? `
가격 단위는 달러(USD)입니다. 본문에서 가격을 말할 때는 "$185.70"처럼 달러로 표기하세요.` : ''}

방향·목표가·신뢰도는 이미 계산되어 "확정 결론"으로 주어집니다. 당신의 일은 그 결론의 근거를 데이터로 설명하는 것입니다.

## 규칙
1. 확정 결론(상승/하락/횡보, 목표가)을 바꾸거나 다른 숫자를 지어내지 마세요. 가격·수치는 제공된 값만 인용하세요.
2. 제공된 데이터에만 근거하세요. 실적, 업황, 뉴스에 없는 사건 등 주어지지 않은 정보를 추측해 쓰지 마세요.
3. 각 reason 에는 결론을 뒷받침하는 수치 2개 이상과, 결론과 반대되는 신호가 있으면 그중 1개를 함께 쓰세요. (예: "정배열과 모멘텀 +18%가 상승을 지지하지만 RSI 72로 단기 과열 부담이 있음")
4. 기간마다 다른 근거를 쓰세요. 1거래일은 과열·과매도와 거래량, 5거래일은 둘의 균형, 20거래일은 추세·모멘텀이 더 중요합니다.
5. "횡보"는 "방향을 모른다"가 아니라 "적중 기준 폭 안에서 움직일 확률이 가장 높다"는 뜻입니다. 변동성이 낮거나 신호가 엇갈린다는 점으로 설명하세요.
6. "반드시", "확실히", "무조건" 같은 단정 표현을 쓰지 마세요. 확률이 50% 안팎이면 그만큼 불확실하다고 쓰세요.
7. easyReason·easySummary 는 전문용어 없이 초등학생도 이해할 일상 비유로 쓰세요. (예: "고무줄처럼 너무 늘어나서 되돌아올 수 있어요")
8. 수급·뉴스 데이터가 주어지면 summary 에 한 문장으로 반영하고, 없으면 언급하지 마세요.
9. riskWarning 에는 이 종목의 일간 변동성과 가장 큰 반대 신호를 근거로 한 구체적 주의점을 쓰세요.
10. JSON 만 출력하세요. 다른 텍스트를 절대 포함하지 마세요.`;

    const sig = (s) => `[${s.type === 'bullish' ? '상승' : '하락'} ${s.score >= 0 ? '+' : ''}${s.score}] ${s.label}`;
    const userPrompt = `# ${stockName}(${symbol}) 분석 데이터 (일봉 기준)

현재가: ${fmtPx(currentPrice, us)}${us ? ' (USD)' : ''} | 일간 변동성: ±${extras.sigmaD}% | 추세: ${extras.upTrend ? '상승 추세(정배열)' : extras.downTrend ? '하락 추세(역배열)' : '뚜렷한 추세 없음'}

## 확정 결론 (변경 금지)
${Object.keys(HORIZONS).map((k) => { const h = horizons[k]; return `- ${k} (${PERIOD_KO[k]}, 적중 기준 ±${HORIZONS[k].band}%): ${h.prediction} | 신뢰도 ${h.confidence}% | 목표가 ${fmtPx(h.targetPrice, us)} | 확률 상승 ${h.probs.up}%·횡보 ${h.probs.side}%·하락 ${h.probs.down}% | 신호 방향 ${h.lean} | 예상 범위 ${fmtPx(h.rangeLow, us)}~${fmtPx(h.rangeHigh, us)}`; }).join('\n')}

## 종합 ${scoreBreakdown.total}점 (-10~+10) | 상승 ${probability.bullish}% 하락 ${probability.bearish}% | 신뢰도 ${confidence}%
- 기술지표(${scoreBreakdown.tech.weight}): ${scoreBreakdown.tech.score}점
- 퀀트팩터(${scoreBreakdown.quant.weight}): ${scoreBreakdown.quant.score}점
- 뉴스감성(${scoreBreakdown.news.weight}): ${scoreBreakdown.news.score}점${scoreBreakdown.supply ? `\n- 수급(${scoreBreakdown.supply.weight}): ${scoreBreakdown.supply.score}점` : ''}

## 신호 (영향 큰 순)
${keySignals.map(sig).join('\n') || '뚜렷한 신호 없음'}

## 지표
RSI ${indicators.rsi} | MACD ${indicators.macd} (시그널 ${indicators.macdSignal}, 히스토그램 ${indicators.macdHistogram}) | 20일선 ${indicators.ma20?.toLocaleString()} · 60일선 ${indicators.ma60?.toLocaleString()} | 볼린저 ${indicators.bbLower?.toLocaleString()}~${indicators.bbUpper?.toLocaleString()} (밴드 내 위치 ${extras.bbPos}%) | 거래량 평소의 ${indicators.volumeRatio}배 | 5일 수익률 ${extras.ret5}% | 모멘텀(1·3개월) ${extras.momentum}% | 20일 평균단가 대비 ${extras.vwapDiff}% | ATR ${scoreBreakdown.atrRatio}%

## 뉴스 제목 (긍정 ${news.positiveCount} / 부정 ${news.negativeCount})
${(newsData || []).slice(0, 6).map((n, i) => `${i + 1}. ${String(n.title || '').slice(0, 80)}`).join('\n') || '없음'}
${typeof supply === 'string' && supply.trim() ? `\n## 수급 (최근 거래일)\n${supply.trim().slice(0, 600)}\n` : ''}
---
아래 JSON 으로만 응답:
{"daily":{"reason":"근거 2~3문장","easyReason":"비유 포함 1~2문장"},"weekly":{"reason":"근거 2~3문장","easyReason":"비유 포함 1~2문장"},"monthly":{"reason":"근거 2~3문장","easyReason":"비유 포함 1~2문장"},"summary":"종합 3~4문장","easySummary":"쉽게 2~3문장","keyPoints":["핵심1","핵심2","핵심3"],"quantInsight":"점수·확률 해석 1~2문장","riskWarning":"구체적 주의사항 1~2문장","indicatorComments":{"rsi":"한 줄","macd":"한 줄","bb":"한 줄","ma":"한 줄","volume":"한 줄"}}`;

    const texts = mergeTexts(await callAI(systemPrompt, userPrompt), fallback);

    // 방향·신뢰도·목표가는 항상 엔진 값 (AI 가 바꿔 써도 무시)
    const periods = Object.fromEntries(Object.keys(HORIZONS).map((k) => {
      const h = horizons[k];
      return [k, { prediction: h.prediction, confidence: h.confidence, targetPrice: h.targetPrice, probs: h.probs, lean: h.lean, rangeLow: h.rangeLow, rangeHigh: h.rangeHigh, ...texts[k] }];
    }));

    return Response.json({
      analysis: {
        ...texts,
        ...periods,
        probability,
        confidence,
        keySignals,
        scenarios,
        scoreBreakdown,
        indicatorScore: scoreBreakdown.tech.score,
        totalScore: scoreBreakdown.total,
      },
      indicators,
    });

  } catch (error) {
    return Response.json({ error: '분석 실패: ' + error.message }, { status: 500 });
  }
}
