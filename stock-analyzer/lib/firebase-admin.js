import admin from 'firebase-admin';

// Singleton pattern
let app;

export function initAdmin() {
  if (app) return app;

  try {
    // Vercel/Production 환경
    if (process.env.FIREBASE_SERVICE_ACCOUNT_KEY) {
      const serviceAccount = JSON.parse(process.env.FIREBASE_SERVICE_ACCOUNT_KEY);
      
      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    } 
    // Local 환경
    else {
      const serviceAccount = require('../serviceAccountKey.json');
      
      app = admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
      });
    }

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