// OpenRouter 무료 모델 호출 공통 모듈 (서버 전용).
// 무료 모델은 응답 시간·형식이 들쭉날쭉해서, 목록 순서대로 시도한다 (앞 모델이 실패하면 다음 모델).
import { jsonrepair } from 'jsonrepair';
import { recordAiCall } from '@/lib/opsLog';

// cohere/north-mini-code:free 는 2026-11 OpenRouter 에서 내려감 (404). 실패율은 관리자 > 운영 > AI 호출에서 확인
export const FREE_MODELS = [
  'dots-studio/dots-3-note-preview:free',
  'nvidia/nemotron-3.5-lightning:free',
  'nvidia/nemotron-3.5-super-vl:free', // 생각하는 데 토큰을 다 써서 빈 응답(length)이 잦음 → 마지막
];

// 모델이 돌려준 글에서 JSON 객체를 꺼낸다 (코드블록·앞뒤 설명·깨진 따옴표까지 복구 시도). 실패하면 null
export function parseJSON(text) {
  const s = String(text || '').replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const start = s.indexOf('{');
  if (start === -1) return null;
  const body = s.slice(start);
  try { return JSON.parse(body.slice(0, body.lastIndexOf('}') + 1)); } catch {}
  try { return JSON.parse(jsonrepair(body)); } catch {}
  return null;
}

/**
 * 모델 목록을 순서대로 시도해 첫 번째로 쓸 만한 결과를 돌려준다. 모두 실패하면 null.
 * - json: true 면 JSON 객체를 파싱해서 validate(parsed) 를 통과한 값을 돌려준다 (validate 가 고친 값을 돌려주면 그 값).
 * - json: false 면 글 그대로(빈 글이면 실패)
 * - deadline: 전체 마감 시각(ms). 남은 시간이 5초 미만이면 다음 모델을 시도하지 않는다.
 */
export async function askAI({ messages, models = FREE_MODELS, json = true, validate = (v) => v, maxTokens = 2048, temperature = 0.3, perCallMs = 30000, deadline = Date.now() + 45000, tag = 'ai' }) {
  if (!process.env.OPENROUTER_API_KEY) { console.error(`[${tag}] OPENROUTER_API_KEY 없음`); return null; }
  for (const model of models) {
    const remaining = deadline - Date.now();
    if (remaining < 5000) break;
    const t0 = Date.now();
    const log = (ok, error) => recordAiCall({ tag, model, ok, ms: Date.now() - t0, error });
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, messages, temperature, max_tokens: maxTokens,
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.timeout(Math.min(perCallMs, remaining)), // 본문 수신까지 포함
      });
      const data = await res.json();
      if (data.error) { console.error(`[${tag}] ${model} error:`, JSON.stringify(data.error)); await log(false, `${data.error.code ?? ''} ${data.error.message ?? ''}`.trim()); continue; }
      const choice = data.choices?.[0];
      const text = choice?.message?.content?.trim();
      if (!text) { console.error(`[${tag}] ${model} 빈 응답, finish_reason=${choice?.finish_reason}`); await log(false, `빈 응답 (${choice?.finish_reason})`); continue; }
      if (!json) { await log(true); return text; }
      const out = validate(parseJSON(text));
      if (out) { await log(true); return out; }
      console.error(`[${tag}] ${model} 형식 오류, finish_reason=${choice?.finish_reason}:`, text.slice(0, 200));
      await log(false, '형식 오류');
    } catch (e) {
      console.error(`[${tag}] ${model} 실패:`, e.message);
      await log(false, e.name === 'TimeoutError' ? '시간 초과' : e.message);
    }
  }
  return null;
}
