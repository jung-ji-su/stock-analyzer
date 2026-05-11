import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, getDocs, query, where } from 'firebase/firestore';

// Vercel Cron으로 호출될 엔드포인트
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const action = searchParams.get('action') || 'buy';
    
    // Vercel Cron 인증 체크
    const authHeader = request.headers.get('authorization');
    if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
      console.error('❌ 인증 실패');
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`🤖 AI 트레이더 자동 실행 시작`);
    console.log(`⏰ 시간: ${new Date().toLocaleString('ko-KR')}`);
    console.log(`📌 작업: ${action === 'buy' ? '매수 스크리닝' : '매도 점검'}`);
    console.log('='.repeat(60));

    // 활성화된 AI 트레이더 계정 가져오기
    const aiTraderRef = collection(db, 'aiTrader');
    const q = query(aiTraderRef, where('status.active', '==', true));
    const snapshot = await getDocs(q);

    if (snapshot.empty) {
      console.log('⚠️ 활성화된 AI 트레이더 없음');
      return NextResponse.json({ 
        success: true, 
        message: 'No active traders',
        processed: 0
      });
    }

    console.log(`\n👥 활성 계정: ${snapshot.size}개`);

    const results = [];
    let successCount = 0;
    let failCount = 0;

    for (const docSnap of snapshot.docs) {
      const userId = docSnap.id;
      const portfolio = docSnap.data();

      console.log(`\n${'─'.repeat(60)}`);
      console.log(`👤 처리 중: ${userId}`);
      console.log(`💰 현금: ${portfolio.cash?.toLocaleString()}원`);
      console.log(`📊 보유: ${portfolio.holdings?.length || 0}종목`);

      try {
        if (action === 'buy') {
          const buyResult = await executeBuyWorkflow(userId, portfolio);
          results.push({ userId, action: 'buy', ...buyResult });
          successCount++;
        } else if (action === 'sell') {
          const sellResult = await executeSellWorkflow(userId, portfolio);
          results.push({ userId, action: 'sell', ...sellResult });
          successCount++;
        }
      } catch (error) {
        console.error(`❌ ${userId} 실행 실패:`, error.message);
        results.push({ 
          userId, 
          error: error.message,
          stack: error.stack?.split('\n')[0]
        });
        failCount++;
      }
    }

    console.log(`\n${'='.repeat(60)}`);
    console.log(`✅ AI 트레이더 자동 실행 완료`);
    console.log(`📊 결과: 성공 ${successCount}개, 실패 ${failCount}개`);
    console.log('='.repeat(60));

    return NextResponse.json({
      success: true,
      action,
      results,
      summary: {
        total: snapshot.size,
        success: successCount,
        failed: failCount,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ Cron 실행 오류:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        stack: error.stack?.split('\n').slice(0, 3),
      },
      { status: 500 }
    );
  }
}

// 매수 워크플로우
async function executeBuyWorkflow(userId, portfolio) {
  try {
    console.log(`\n  🔍 STEP 1: 종목 풀 조회`);
    
    // 1. 종목 풀 가져오기
    const poolResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/ai-trader/stock-pool`);
    
    if (!poolResponse.ok) {
      throw new Error(`종목 풀 조회 실패: ${poolResponse.status}`);
    }
    
    const { pool } = await poolResponse.json();
    console.log(`  ✅ 종목 풀: ${pool.totalCount}개`);

    // 2. 스크리닝 (Quant Score 70+ 종목만)
    console.log(`\n  🔍 STEP 2: 후보 선정 (Quant 70+)`);
    const candidates = pool.stocks
      .filter(stock => (stock.quantScore || 0) >= 70)
      .slice(0, 10);

    console.log(`  ✅ 후보: ${candidates.length}개`);

    if (candidates.length === 0) {
      return { 
        message: '매수 후보 없음 (Quant 70+ 종목 없음)',
        candidates: 0
      };
    }

    // 3. AI 분석 요청
    console.log(`\n  🤖 STEP 3: AI 분석`);
    const analyzeResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/ai-trader/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'analyze_buy',
        candidates,
        holdings: portfolio.holdings || [],
      }),
    });

    if (!analyzeResponse.ok) {
      throw new Error(`AI 분석 실패: ${analyzeResponse.status}`);
    }

    const { results: analyzed } = await analyzeResponse.json();
    console.log(`  ✅ AI 분석 완료: ${analyzed.length}개`);

    // 4. AI 점수 75+ 종목만 선택
    console.log(`\n  🎯 STEP 4: 매수 종목 선택 (AI 75+)`);
    const toBuy = analyzed
      .filter(stock => (stock.aiAnalysis?.score || 0) >= 75)
      .slice(0, 2); // 최대 2개

    console.log(`  ✅ 매수 대상: ${toBuy.length}개`);

    if (toBuy.length === 0) {
      return { 
        message: '매수 종목 없음 (AI 75+ 통과 없음)',
        candidates: candidates.length,
        analyzed: analyzed.length,
        passed: 0
      };
    }

    // 종목 정보 출력
    toBuy.forEach((stock, idx) => {
      console.log(`    ${idx + 1}. ${stock.name} (AI ${stock.aiAnalysis.score}점)`);
    });

    // 5. 매수 주문 생성
    console.log(`\n  💰 STEP 5: 매수 주문 생성`);
    const orders = toBuy.map(stock => {
      const availableCash = portfolio.cash * 0.15; // 현금의 15%씩
      const estimatedPrice = 100000; // 임시 가격
      const quantity = Math.floor(availableCash / estimatedPrice);
      
      console.log(`    ${stock.name}: ${quantity}주 예상`);
      
      return {
        code: stock.code,
        name: stock.name,
        quantity,
        quantScore: stock.quantScore,
        aiScore: stock.aiAnalysis.score,
        aiReasons: stock.aiAnalysis.reasons,
        aiRisk: stock.aiAnalysis.risk,
        expectedHold: stock.aiAnalysis.holdPeriod,
      };
    });

    // 6. 매수 실행
    console.log(`\n  🚀 STEP 6: 매수 실행`);
    const executeResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/ai-trader/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        action: 'buy',
        orders,
      }),
    });

    if (!executeResponse.ok) {
      throw new Error(`매수 실행 실패: ${executeResponse.status}`);
    }

    const executeResult = await executeResponse.json();
    
    const executedCount = executeResult.results?.filter(r => r.success).length || 0;
    console.log(`  ✅ 매수 완료: ${executedCount}/${orders.length}개`);

    return {
      success: true,
      candidates: candidates.length,
      analyzed: analyzed.length,
      selected: toBuy.length,
      executed: executedCount,
      orders: executeResult.results,
    };

  } catch (error) {
    console.error(`  ❌ 매수 워크플로우 실패:`, error.message);
    throw error;
  }
}

// 매도 워크플로우
async function executeSellWorkflow(userId, portfolio) {
  try {
    console.log(`\n  🔍 STEP 1: 보유 종목 확인`);
    
    if (!portfolio.holdings || portfolio.holdings.length === 0) {
      console.log(`  ⚠️ 보유 종목 없음`);
      return { message: '보유 종목 없음', holdings: 0 };
    }

    console.log(`  ✅ 보유: ${portfolio.holdings.length}개`);
    portfolio.holdings.forEach((h, idx) => {
      console.log(`    ${idx + 1}. ${h.name} ${h.quantity}주`);
    });

    // 1. AI 매도 분석 요청
    console.log(`\n  🤖 STEP 2: AI 매도 분석`);
    const analyzeResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/ai-trader/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'analyze_sell',
        holdings: portfolio.holdings,
      }),
    });

    if (!analyzeResponse.ok) {
      throw new Error(`AI 분석 실패: ${analyzeResponse.status}`);
    }

    const { results: analyzed } = await analyzeResponse.json();
    console.log(`  ✅ AI 분석 완료: ${analyzed.length}개`);

    // 2. 매도할 종목 선택
    console.log(`\n  🎯 STEP 3: 매도 종목 선택`);
    const toSell = analyzed.filter(stock => {
      // 자동 트리거 또는 AI가 매도 판단한 경우
      const isAutoTrigger = stock.triggerType !== 'AI';
      const isAISell = stock.aiAnalysis?.action === 'sell';
      
      if (isAutoTrigger || isAISell) {
        const reason = isAutoTrigger 
          ? stock.aiAnalysis.reason 
          : `AI 매도 판단 (점수 ${stock.aiAnalysis.score})`;
        console.log(`    ✓ ${stock.name}: ${reason}`);
        return true;
      }
      return false;
    });

    console.log(`  ✅ 매도 대상: ${toSell.length}개`);

    if (toSell.length === 0) {
      return { 
        message: '매도 종목 없음',
        holdings: portfolio.holdings.length,
        analyzed: analyzed.length,
        toSell: 0
      };
    }

    // 3. 매도 주문 생성
    console.log(`\n  💰 STEP 4: 매도 주문 생성`);
    const orders = toSell.map(stock => ({
      code: stock.code,
      name: stock.name,
      quantity: stock.quantity,
      aiScore: stock.aiAnalysis.score,
      reason: stock.aiAnalysis.reason,
      triggerType: stock.triggerType,
    }));

    // 4. 매도 실행
    console.log(`\n  🚀 STEP 5: 매도 실행`);
    const executeResponse = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/ai-trader/execute`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        userId,
        action: 'sell',
        orders,
      }),
    });

    if (!executeResponse.ok) {
      throw new Error(`매도 실행 실패: ${executeResponse.status}`);
    }

    const executeResult = await executeResponse.json();
    
    const executedCount = executeResult.results?.filter(r => r.success).length || 0;
    console.log(`  ✅ 매도 완료: ${executedCount}/${orders.length}개`);

    return {
      success: true,
      holdings: portfolio.holdings.length,
      analyzed: analyzed.length,
      selected: toSell.length,
      executed: executedCount,
      orders: executeResult.results,
    };

  } catch (error) {
    console.error(`  ❌ 매도 워크플로우 실패:`, error.message);
    throw error;
  }
}
