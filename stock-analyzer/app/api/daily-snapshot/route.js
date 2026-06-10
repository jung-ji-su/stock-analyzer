import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';

export async function POST(request) {
  try {
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    if (token !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    console.log('📸 일별 스냅샷 저장 시작...');
    const db = getAdminFirestore();

    const snapshot = await db.collection('aiTrader').get();

    if (snapshot.empty) {
      console.log('  ℹ️ 저장할 포트폴리오 없음');
      return NextResponse.json({ success: true, message: '저장할 포트폴리오 없음' });
    }

    const today = new Date().toISOString().split('T')[0];
    const results = [];
    const errors = [];

    for (const docSnap of snapshot.docs) {
      const portfolio = docSnap.data();
      const userId = portfolio.userId || docSnap.id;

      if (!userId) {
        console.warn(`  ⚠️ userId 없는 문서 스킵: ${docSnap.id}`);
        continue;
      }

      try {
        const snapshotData = {
          date: today,
          totalAsset: portfolio.totalAsset || 10000000,
          cash: portfolio.cash || 10000000,
          holdingsCount: portfolio.holdings?.length || 0,
          holdings: portfolio.holdings || [],
          returnRate: ((portfolio.totalAsset - 10000000) / 10000000 * 100).toFixed(2),
          timestamp: new Date().toISOString(),
        };

        await db.collection('aiPortfolioHistory').doc(`${userId}_${today}`).set({
          userId,
          ...snapshotData,
        });

        console.log(`  ✅ ${userId}: ${snapshotData.returnRate}%`);
        results.push({ userId, ...snapshotData });

      } catch (error) {
        console.error(`  ❌ ${userId} 스냅샷 실패:`, error);
        errors.push({ userId, error: error.message });
      }
    }

    console.log(`\n✅ 스냅샷 완료: ${results.length}개 성공, ${errors.length}개 실패`);

    return NextResponse.json({
      success: true,
      date: today,
      saved: results.length,
      failed: errors.length,
      results,
      errors: errors.length > 0 ? errors : undefined,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ 일별 스냅샷 오류:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
