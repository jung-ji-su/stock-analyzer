import admin from 'firebase-admin';

let app;

export function initAdmin() {
  if (app) return app;
  // 이미 초기화된 앱 재사용
  if (admin.apps.length > 0) { app = admin.apps[0]; return app; }

  const key = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (!key) throw new Error('FIREBASE_SERVICE_ACCOUNT_KEY 환경변수가 없습니다. .env.local 또는 Vercel 환경변수를 확인하세요.');

  try {
    const serviceAccount = JSON.parse(key);
    app = admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
    console.log('✅ Firebase Admin SDK 초기화 완료');
    return app;
  } catch (error) {
    console.error('❌ Firebase Admin SDK 초기화 실패:', error);
    throw error;
  }
}

// Firestore Admin 인스턴스
export function getAdminFirestore() {
  if (!app) initAdmin();
  return admin.firestore();
}

// Admin SDK export
export { admin };