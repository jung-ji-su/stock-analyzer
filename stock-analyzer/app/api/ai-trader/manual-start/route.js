import { NextResponse } from 'next/server';

export async function POST(request) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId 필수' },
        { status: 400 }
      );
    }

    console.log(`🚀 수동 실행 시작: userId=${userId}`);

    // STEP 1: 종목 풀 조회
    console.log('  📊 STEP 1: 종목 풀 조회');
    const poolResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/ai-trader/stock-pool`);

    if (!poolResponse.ok) {
      throw new Error(`종목 풀 조회 실패: ${poolResponse.status}`);
    }

    const { pool } = await poolResponse.json();
    console.log(`  ✅ 종목 풀: ${pool.totalCount}개`);

    // STEP 2: Quant 70+ 종목 필터링
    console.log('  🎯 STEP 2: 후보 선정 (Quant 70+)');
    const candidates = pool.stocks
      .filter(stock => (stock.quantScore || 0) >= 70)
      .slice(0, 10);

    console.log(`  ✅ 후보: ${candidates.length}개`);

    if (candidates.length === 0) {
      return NextResponse.json({
        success: true,
        message: '매수 후보 없음 (Quant 70+ 종목 없음)',
        candidates: 0
      });
    }

    // STEP 3: AI 분석
    console.log('  🤖 STEP 3: AI 분석');
    const analyzeResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/ai-trader/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'analyze_buy',
        candidates,
        holdings: [],
      }),
    });

    console.log('  📋 DEBUG analyze status:', analyzeResponse.status);
    console.log('  📋 DEBUG analyze ok:', analyzeResponse.ok);

    if (!analyzeResponse.ok) {
      const errorText = await analyzeResponse.text();
      console.log('  ❌ DEBUG analyze error:', errorText);
      throw new Error(`AI 분석 실패: ${analyzeResponse.status}`);
    }

    const analyzeData = await analyzeResponse.json();
    console.log('  📋 DEBUG analyze response:', JSON.stringify(analyzeData));
    const { results: analyzed } = analyzeData;
    console.log(`  ✅ AI 분석 완료: ${analyzed.length}개`);

    // STEP 4: AI 점수 75+ 종목 선택
    console.log('  🎯 STEP 4: 매수 종목 선택 (AI 75+)');
    const toBuy = analyzed
      .filter(stock => (stock.aiAnalysis?.score || 0) >= 75)
      .slice(0, 2); // 최대 2개

    console.log(`  ✅ 매수 대상: ${toBuy.length}개`);

    if (toBuy.length === 0) {
      return NextResponse.json({
        success: true,
        message: '매수 종목 없음 (AI 75+ 통과 없음)',
        candidates: candidates.length,
        analyzed: analyzed.length,
        passed: 0
      });
    }

    toBuy.forEach((stock, idx) => {
      console.log(`    ${idx + 1}. ${stock.name} (AI ${stock.aiAnalysis.score}점)`);
    });

    // STEP 5: 매수 주문 생성
    console.log('  💰 STEP 5: 매수 주문 생성');
    const orders = toBuy.map(stock => {
      const quantity = 1; // 임시로 1주씩

      return {
        code: stock.code,
        name: stock.name,
        quantity,
        quantScore: stock.quantScore,
        aiScore: stock.aiAnalysis.score,
        aiReasons: stock.aiAnalysis.reasons,
      };
    });

    console.log(`    주문 생성: ${orders.length}개`);

    // STEP 6: Execute API 호출 (action: 'buy', orders 배열)
    console.log('  🚀 STEP 6: 매수 실행');
    const executeResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/ai-trader/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        action: 'buy',  // ← 중요! 'buy' 또는 'sell'만 가능
        orders,
      }),
    });

    if (!executeResponse.ok) {
      const errorText = await executeResponse.text();
      console.error(`  ❌ Execute API 응답 (${executeResponse.status}):`, errorText);
      throw new Error(`매수 실행 실패 (${executeResponse.status}): ${errorText}`);
    }

    const result = await executeResponse.json();

    const successCount = result.results?.filter(r => r.success).length || 0;
    console.log(`  ✅ 매수 완료: ${successCount}/${orders.length}개`);

    return NextResponse.json({
      success: true,
      message: `수동 실행 완료: ${successCount}개 매수`,
      summary: {
        candidates: candidates.length,
        analyzed: analyzed.length,
        selected: toBuy.length,
        executed: successCount,
      },
      results: result.results,
    });

  } catch (error) {
    console.error('❌ 수동 실행 오류:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}