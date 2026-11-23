// OpenRouter 무료 모델 호출 공통 모듈 (서버 전용).
// 무료 모델은 응답 시간·형식이 들쭉날쭉해서, 앞쪽 몇 개에 동시에 물어 먼저 온 쓸 만한 답을 쓴다.
import { jsonrepair } from 'jsonrepair';
import { recordAiCall } from '@/lib/opsLog';

// 무료 모델 목록 (2026-11-23 OpenRouter 무료 목록에서 다시 고름).
// 예전 1~3순위(dots-3-note, nemotron-3.5-lightning/super-vl)는 생각(reasoning)에 토큰을 다 써서 빈 응답이거나 시간 초과가 잦았다.
// Gemma 4 는 지시형(instruct) 모델이라 짧게 바로 답하고, 제공사가 많아 잘 안 끊긴다.
// 실패율은 관리자 > 운영 > AI 호출에서 확인
export const FREE_MODELS = [
  'google/gemma-4-31b-it:free',
  'google/gemma-4-26b-a4b-it:free',
  'inclusionai/ling-3.2-flash:free',
  'nvidia/nemotron-3-ultra-550b-a55b:free',
];
// 앞에서부터 이만큼은 동시에 보내고 가장 먼저 온 쓸 만한 답을 쓴다 (무료 모델은 한 곳이 느려도 다른 곳은 빠른 경우가 많다)
const PARALLEL = 3;

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
 * 무료 모델에 물어 첫 번째로 쓸 만한 결과를 돌려준다. 모두 실패하면 null.
 * 앞 PARALLEL 개는 동시에 보내 가장 먼저 온 쓸 만한 답을 쓰고(나머지는 취소), 전부 실패하면 남은 모델을 차례로 시도한다.
 * - json: true 면 JSON 객체를 파싱해서 validate(parsed) 를 통과한 값을 돌려준다 (validate 가 고친 값을 돌려주면 그 값).
 * - json: false 면 글 그대로(빈 글이면 실패)
 * - deadline: 전체 마감 시각(ms). 남은 시간이 5초 미만이면 새 모델을 시도하지 않는다.
 */
export async function askAI({ messages, models = FREE_MODELS, json = true, validate = (v) => v, maxTokens = 2048, temperature = 0.3, perCallMs = 30000, deadline = Date.now() + 45000, tag = 'ai' }) {
  if (!process.env.OPENROUTER_API_KEY) { console.error(`[${tag}] OPENROUTER_API_KEY 없음`); return null; }
  const list = [...new Set(models)];

  // 모델 하나에 물어본다. 쓸 만한 답이면 값, 아니면 throw. stop 이 abort 되면(다른 모델이 먼저 답함) 기록 없이 끝낸다
  async function one(model, stop) {
    const remaining = deadline - Date.now();
    if (remaining < 5000) throw new Error('시간 부족');
    const t0 = Date.now();
    const log = (ok, error) => (stop.aborted ? null : recordAiCall({ tag, model, ok, ms: Date.now() - t0, error }));
    const fail = async (msg, logMsg) => { if (!stop.aborted) console.error(`[${tag}] ${model} ${msg}`); await log(false, logMsg); throw new Error(msg); };
    let data, res;
    try {
      res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENROUTER_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model, messages, temperature, max_tokens: maxTokens,
          // 생각하는 모델이 토큰을 다 써서 빈 응답(finish_reason=length)으로 끝나지 않게 생각은 짧게.
          // 'none' 은 생각이 필수인 모델이 거절하므로 쓰지 않는다 (OpenRouter reasoning-tokens 문서)
          reasoning: { effort: 'low' },
          ...(json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.any([stop, AbortSignal.timeout(Math.min(perCallMs, remaining))]), // 본문 수신까지 포함
      });
      data = await res.json();
    } catch (e) {
      if (stop.aborted) throw e;
      return fail(`실패: ${e.message}`, e.name === 'TimeoutError' ? '시간 초과' : e.message);
    }
    if (data.error) return fail(`error: ${JSON.stringify(data.error)}`, `${data.error.code ?? ''} ${data.error.message ?? ''}`.trim());
    const choice = data.choices?.[0];
    const text = choice?.message?.content?.trim();
    if (!text) return fail(`빈 응답, finish_reason=${choice?.finish_reason}`, `빈 응답 (${choice?.finish_reason})`);
    const out = json ? validate(parseJSON(text)) : text;
    if (!out) return fail(`형식 오류, finish_reason=${choice?.finish_reason}: ${text.slice(0, 200)}`, '형식 오류');
    await log(true);
    return out;
  }

  // 1) 앞쪽 모델 동시에
  const ctl = new AbortController();
  try {
    return await Promise.any(list.slice(0, PARALLEL).map((m) => one(m, ctl.signal)));
  } catch { /* 모두 실패 */ } finally { ctl.abort(); }
  // 2) 남은 모델 차례로
  for (const m of list.slice(PARALLEL)) {
    try { return await one(m, new AbortController().signal); } catch { /* 다음 모델 */ }
  }
  return null;
}
