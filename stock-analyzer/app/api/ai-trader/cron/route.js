import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';

function authGuard(request) {
  const authHeader = request.headers.get('authorization');
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;
  return token && token === process.env.CRON_SECRET;
}

async function runForAllUsers() {
  const db = getAdminFirestore();
  const snap = await db.collection('aiTrader').get();
  if (snap.empty) return { usersProcessed: 0, results: [] };

  const results = [];

  for (const docSnap of snap.docs) {
    const userId = docSnap.id;
    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/ai-trader/manual-start`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      const data = await res.json();
      console.log(`  [${userId}] manual-start: ${data.message || (data.success ? 'OK' : data.error)}`);
      results.push({ userId, success: data.success, message: data.message });
    } catch (e) {
      console.error(`  [${userId}] 오류: ${e.message}`);
      results.push({ userId, success: false, error: e.message });
    }
  }

  return { usersProcessed: snap.size, results };
}

/* ── GET: Vercel Cron 전용 ── */
export async function GET(request) {
  if (!authGuard(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('⏰ AI Trader Cron(GET) 시작...');
  try {
    const result = await runForAllUsers();
    console.log(`✅ Cron 완료: ${result.usersProcessed}명 처리`);
    return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('❌ Cron(GET) 오류:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}

/* ── POST: 수동 트리거 / 레거시 호환 ── */
export async function POST(request) {
  if (!authGuard(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  console.log('⏰ AI Trader Cron(POST) 시작...');
  try {
    const result = await runForAllUsers();
    console.log(`✅ Cron 완료: ${result.usersProcessed}명 처리`);
    return NextResponse.json({ success: true, ...result, timestamp: new Date().toISOString() });
  } catch (error) {
    console.error('❌ Cron(POST) 오류:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
