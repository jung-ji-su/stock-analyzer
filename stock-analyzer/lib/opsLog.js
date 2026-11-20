// 운영 기록 (관리자 운영 콘솔용, 서버 전용). 기록이 실패해도 원래 작업에는 영향을 주지 않는다.
import { getAdminFirestore, admin } from '@/lib/firebase-admin';
import { kstDay } from '@/lib/evalUtils';

// 정기 작업의 마지막 실행 결과: opsRuns/{job}
export async function recordRun(job, ok, summary = '') {
  try {
    await getAdminFirestore().collection('opsRuns').doc(job)
      .set({ job, ok, summary: String(summary).slice(0, 300), at: new Date().toISOString() });
  } catch (e) { console.error('[opsRuns]', e.message); }
}

// AI 호출 1회: aiStats/{한국날짜} 에 모델·용도별 성공/실패/응답시간 합계
export async function recordAiCall({ tag, model, ok, ms, error }) {
  try {
    const inc = admin.firestore.FieldValue.increment;
    const m = { [ok ? 'ok' : 'fail']: inc(1), ms: inc(ms) };
    if (!ok) Object.assign(m, { lastError: String(error).slice(0, 200), lastErrorAt: new Date().toISOString() });
    await getAdminFirestore().collection('aiStats').doc(kstDay(Date.now()))
      .set({ models: { [model]: m }, tags: { [tag]: { [ok ? 'ok' : 'fail']: inc(1) } } }, { merge: true });
  } catch (e) { console.error('[aiStats]', e.message); }
}
