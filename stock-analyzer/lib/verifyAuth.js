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
