import { NextResponse } from 'next/server';
import { db, auth } from '@/lib/firebase';
import { collection, query, where, getDocs, doc, setDoc } from 'firebase/firestore';

export async function POST(request) {
  try {
    // Cron secret 검증
    const authHeader = request.headers.get('authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const token = authHeader.substring(7);
    if (token !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Invalid token' }, { status: 401 });
    }

    console.log('📸 일별 스냅샷 저장 시작...');

    // 모든 AI 포트폴리오 가져오기
    const aiPortfoliosRef = collection(db, 'aiTrader');
    const snapshot = await getDocs(aiPortfoliosRef);

    if (snapshot.empty) {
      console.log('  ℹ️ 저장할 포트폴리오 없음');
      return NextResponse.json({
        success: true,
        message: '저장할 포트폴리오 없음',
      });
    }

    const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const results = [];
    const errors = [];

    for (const docSnap of snapshot.docs) {
      const portfolio = docSnap.data();
      const userId = portfolio.userId;

      try {
        // 스냅샷 데이터 구성
        const snapshotData = {
          date: today,
          totalAsset: portfolio.totalAsset || 10000000,
          cash: portfolio.cash || 10000000,
          holdingsCount: portfolio.holdings?.length || 0,
          holdings: portfolio.holdings || [],
          returnRate: ((portfolio.totalAsset - 10000000) / 10000000 * 100).toFixed(2),
          timestamp: new Date().toISOString(),
        };

        // Firestore에 저장
        const snapshotRef = doc(db, 'aiPortfolioHistory', `${userId}_${today}`);
        await setDoc(snapshotRef, {
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
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
      },
      { status: 500 }
    );
  }
}