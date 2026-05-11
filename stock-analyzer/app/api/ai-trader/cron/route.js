import { NextResponse } from 'next/server';

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

    console.log('⏰ AI Trader Cron 실행 시작...');

    // Execute API 호출 (전체 사용자)
    const executeUrl = `${process.env.NEXT_PUBLIC_BASE_URL}/api/ai-trader/execute`;
    const executeResponse = await fetch(executeUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'auto',
        trigger: 'cron'
      }),
    });

    if (!executeResponse.ok) {
      const errorText = await executeResponse.text();
      throw new Error(`Execute 실패 (${executeResponse.status}): ${errorText}`);
    }

    const result = await executeResponse.json();
    console.log('✅ Cron 실행 완료:', result);

    return NextResponse.json({
      success: true,
      message: 'Cron executed successfully',
      result,
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Cron 실행 오류:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
      },
      { status: 500 }
    );
  }
}