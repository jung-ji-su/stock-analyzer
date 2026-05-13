import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';

async function checkStopsForUser(db, userId) {
  const portfolioDoc = await db.collection('aiTrader').doc(userId).get();
  if (!portfolioDoc.exists) return { triggered: 0 };

  const { holdings = [] } = portfolioDoc.data();
  const sellOrders = [];

  await Promise.all(holdings.map(async (h) => {
    if (!h.takeProfit && !h.stopLoss) return;

    let currentPrice = 0;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/naver-stock?symbol=${h.code}`);
      const data = await res.json();
      if (data.currentPrice && data.currentPrice > 0) currentPrice = data.currentPrice;
    } catch { return; }

    if (!currentPrice) return;

    const hitTakeProfit = h.takeProfit && currentPrice >= h.takeProfit;
    const hitStopLoss   = h.stopLoss   && currentPrice <= h.stopLoss;

    if (hitTakeProfit || hitStopLoss) {
      const triggerType = hitTakeProfit ? 'auto_take_profit' : 'auto_stop_loss';
      const reason = hitTakeProfit
        ? `목표가 도달 (${currentPrice.toLocaleString()}원 ≥ ${h.takeProfit.toLocaleString()}원)`
        : `손절가 도달 (${currentPrice.toLocaleString()}원 ≤ ${h.stopLoss.toLocaleString()}원)`;

      console.log(`🎯 [${userId}] ${triggerType}: ${h.name} — ${reason}`);
      sellOrders.push({ code: h.code, name: h.name, quantity: h.quantity, reason, triggerType });
    }
  }));

  if (sellOrders.length === 0) return { triggered: 0 };

  const executeRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/ai-trader/execute`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ userId, action: 'sell', orders: sellOrders }),
  });

  const result = await executeRes.json();
  const successCount = result.results?.filter(r => r.success).length || 0;
  return { triggered: successCount, orders: sellOrders };
}

/* ── POST: 특정 userId의 손절/익절 체크 (수동 버튼용) ── */
export async function POST(request) {
  try {
    const { userId } = await request.json();
    if (!userId) return NextResponse.json({ success: false, error: 'userId 필수' }, { status: 400 });

    const db = getAdminFirestore();
    const result = await checkStopsForUser(db, userId);

    return NextResponse.json({
      success: true,
      ...result,
      message: result.triggered > 0 ? `${result.triggered}개 자동 매도 실행` : '조건 미충족',
    });
  } catch (error) {
    console.error('❌ check-stops(POST) 오류:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/* ── GET: 전체 활성 사용자 스캔 (Vercel Cron 전용) ── */
export async function GET(request) {
  try {
    // Cron secret 검증
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
    if (!token || token !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('⏰ check-stops Cron 시작...');
    const db = getAdminFirestore();

    // 보유 종목이 있는 활성 사용자만 조회
    const snap = await db.collection('aiTrader').where('holdings', '!=', []).get();
    if (snap.empty) {
      console.log('✅ 보유 종목 있는 사용자 없음');
      return NextResponse.json({ success: true, usersChecked: 0, totalTriggered: 0 });
    }

    let totalTriggered = 0;
    const results = [];

    for (const docSnap of snap.docs) {
      const uid = docSnap.id;
      try {
        const r = await checkStopsForUser(db, uid);
        totalTriggered += r.triggered;
        if (r.triggered > 0) results.push({ userId: uid, triggered: r.triggered });
      } catch (e) {
        console.error(`❌ [${uid}] check-stops 실패:`, e.message);
      }
    }

    console.log(`✅ check-stops Cron 완료: ${snap.size}명 스캔, ${totalTriggered}건 자동 매도`);
    return NextResponse.json({
      success: true,
      usersChecked: snap.size,
      totalTriggered,
      results,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('❌ check-stops(GET/Cron) 오류:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
