import { initAdmin, admin } from '@/lib/firebase-admin';

// 요청의 Authorization: Bearer <Firebase ID 토큰>을 검증한다. 유효하면 토큰 정보, 아니면 null.
export async function requireUser(request) {
  const m = (request.headers.get('authorization') || '').match(/^Bearer (.+)$/);
  if (!m) return null;
  try {
    initAdmin();
    return await admin.auth().verifyIdToken(m[1]);
  } catch {
    return null;
  }
}

export const unauthorized = () => Response.json({ error: '로그인이 필요합니다' }, { status: 401 });

// ai-trader용: 서버 간 호출(CRON_SECRET) 또는 로그인한 본인(userId 일치)만 허용. userId를 생략하면 로그인한 아무 사용자나 허용.
export async function authorizeTrader(request, userId) {
  const m = (request.headers.get('authorization') || '').match(/^Bearer (.+)$/);
  if (m && process.env.CRON_SECRET && m[1] === process.env.CRON_SECRET) return true;
  const user = await requireUser(request);
  return !!user && (userId === undefined || user.uid === userId);
}
