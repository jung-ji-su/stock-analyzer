import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

const INITIAL_CASH = 10_000_000;

export async function POST(request) {
  try {
    const { userId } = await request.json();
    if (!userId) return NextResponse.json({ success: false, error: 'userId 필수' }, { status: 400 });

    const db = getAdminFirestore();

    // aiTrader 포트폴리오 초기화
    await db.collection('aiTrader').doc(userId).set({
      userId,
      cash: INITIAL_CASH,
      totalAsset: INITIAL_CASH,
      holdings: [],
      status: { active: false, lastRun: null, nextRun: null, pauseReason: null },
      statistics: { totalTrades: 0, winRate: 0, avgProfit: 0, maxDrawdown: 0 },
      updatedAt: FieldValue.serverTimestamp(),
    }, { merge: false });

    // aiTransactions 삭제
    const txSnap = await db.collection('aiTransactions').where('userId', '==', userId).get();
    const batch = db.batch();
    txSnap.docs.forEach(d => batch.delete(d.ref));
    await batch.commit();

    console.log(`✅ AI 포트폴리오 초기화: ${userId} (${txSnap.size}개 거래내역 삭제)`);

    return NextResponse.json({ success: true, message: 'AI 포트폴리오가 초기화되었습니다.' });
  } catch (error) {
    console.error('❌ AI 포트폴리오 초기화 실패:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
