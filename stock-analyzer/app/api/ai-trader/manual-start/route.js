import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';

const MAX_HOLDINGS = 5;

export async function POST(request) {
  try {
    const body = await request.json();
    const { userId } = body;

    if (!userId) {
      return NextResponse.json({ success: false, error: 'userId 필수' }, { status: 400 });
    }

    console.log(`🚀 수동 실행 시작: userId=${userId}`);

    // STEP 0: 현재 포트폴리오 확인
    const db = getAdminFirestore();
    const portfolioDoc = await db.collection('aiTrader').doc(userId).get();
    const portfolioData = portfolioDoc.exists ? portfolioDoc.data() : {};
    const currentHoldings = portfolioData.holdings ?? [];
    const availableCash = portfolioData.cash ?? 10_000_000;
    const heldCodes = new Set(currentHoldings.map(h => h.code));
    const availableSlots = Math.max(0, MAX_HOLDINGS - currentHoldings.length);

    console.log(`  📦 현재 보유: ${currentHoldings.length}/${MAX_HOLDINGS}개, 여유: ${availableSlots}개, 현금: ${availableCash.toLocaleString()}원`);

    if (availableSlots === 0) {
      return NextResponse.json({
        success: true,
        message: `보유 종목이 최대(${MAX_HOLDINGS}개)입니다. 먼저 매도 후 재시도하세요.`,
        summary: { currentHoldings: currentHoldings.length, availableSlots: 0 },
      });
    }

    // STEP 1: 종목 풀 조회
    console.log('  📊 STEP 1: 종목 풀 조회');
    const poolResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/ai-trader/stock-pool`);
    if (!poolResponse.ok) throw new Error(`종목 풀 조회 실패: ${poolResponse.status}`);

    const { pool } = await poolResponse.json();
    console.log(`  ✅ 종목 풀: ${pool.totalCount}개`);

    // STEP 2: Quant 70+ 필터링 + 이미 보유 중인 종목 제외
    console.log('  🎯 STEP 2: 후보 선정 (Quant 70+, 미보유)');
    const candidates = pool.stocks
      .filter(stock => (stock.quantScore || 0) >= 70)
      .filter(stock => !heldCodes.has(stock.code))
      .slice(0, 10);

    console.log(`  ✅ 후보: ${candidates.length}개 (보유 중 ${heldCodes.size}개 제외됨)`);

    if (candidates.length === 0) {
      return NextResponse.json({
        success: true,
        message: '매수 후보 없음 (Quant 70+ 미보유 종목 없음)',
        summary: { currentHoldings: currentHoldings.length, candidates: 0 },
      });
    }

    // STEP 3: AI 분석
    console.log('  🤖 STEP 3: AI 분석');
    const analyzeResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/ai-trader/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'analyze_buy', candidates, holdings: [] }),
    });

    if (!analyzeResponse.ok) {
      const errorText = await analyzeResponse.text();
      throw new Error(`AI 분석 실패: ${analyzeResponse.status} - ${errorText}`);
    }

    const { results: analyzed } = await analyzeResponse.json();
    console.log(`  ✅ AI 분석 완료: ${analyzed.length}개`);

    // STEP 4: AI 점수 75+ 선택, 여유 슬롯만큼만
    console.log('  🎯 STEP 4: 매수 종목 선택 (AI 75+)');
    const toBuy = analyzed
      .filter(stock => (stock.aiAnalysis?.score || 0) >= 75)
      .slice(0, Math.min(2, availableSlots));

    console.log(`  ✅ 매수 대상: ${toBuy.length}개`);
    toBuy.forEach((s, i) => console.log(`    ${i + 1}. ${s.name} (AI ${s.aiAnalysis.score}점)`));

    if (toBuy.length === 0) {
      return NextResponse.json({
        success: true,
        message: '매수 종목 없음 (AI 75+ 통과 없음)',
        summary: { candidates: candidates.length, analyzed: analyzed.length, passed: 0 },
      });
    }

    // STEP 5: 매수 주문 생성 (포지션 사이징: AI 점수 기반 현금 배분)
    // 가용 현금을 종목 수로 균등 배분, 최대 슬롯 기준으로 나눠 과집중 방지
    const budgetPerStock = Math.floor(availableCash / Math.max(toBuy.length, availableSlots));
    console.log(`  💰 종목당 예산: ${budgetPerStock.toLocaleString()}원 (가용현금 ${availableCash.toLocaleString()}원 ÷ ${Math.max(toBuy.length, availableSlots)}슬롯)`);

    const orders = toBuy.map(stock => ({
      code: stock.code,
      name: stock.name,
      cashBudget: budgetPerStock,  // execute 라우트에서 현재가 기준 수량 계산
      quantScore: stock.quantScore,
      aiScore: stock.aiAnalysis.score,
      aiReasons: stock.aiAnalysis.reasons,
      takeProfit: stock.aiAnalysis.takeProfit ?? null,
      stopLoss: stock.aiAnalysis.stopLoss ?? null,
    }));

    // STEP 6: 매수 실행
    console.log('  🚀 STEP 6: 매수 실행');
    const executeResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/ai-trader/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId, action: 'buy', orders }),
    });

    if (!executeResponse.ok) {
      const errorText = await executeResponse.text();
      throw new Error(`매수 실행 실패 (${executeResponse.status}): ${errorText}`);
    }

    const result = await executeResponse.json();
    const successCount = result.results?.filter(r => r.success).length || 0;
    console.log(`  ✅ 매수 완료: ${successCount}/${orders.length}개`);

    return NextResponse.json({
      success: true,
      message: `분석 완료: ${successCount}개 매수`,
      summary: {
        currentHoldings: currentHoldings.length,
        availableSlots,
        candidates: candidates.length,
        analyzed: analyzed.length,
        selected: toBuy.length,
        executed: successCount,
      },
      results: result.results,
    });

  } catch (error) {
    console.error('❌ 수동 실행 오류:', error);
    return NextResponse.json({ success: false, error: error.message }, { status: 500 });
  }
}
