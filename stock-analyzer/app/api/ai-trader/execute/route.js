import { NextResponse } from 'next/server';
import { getAdminFirestore } from '@/lib/firebase-admin';
import { FieldValue } from 'firebase-admin/firestore';

let _db = null;
function getDb() {
  if (!_db) _db = getAdminFirestore();
  return _db;
}

// 초기 포트폴리오 생성
async function initializePortfolio(userId) {
  try {
    const db = getDb();
    const portfolioRef = db.collection('aiTrader').doc(userId);
    const initialData = {
      userId,
      cash: 10000000, // 1000만원
      totalAsset: 10000000,
      holdings: [],
      status: {
        active: true,
        lastRun: null,
        nextRun: null,
        pauseReason: null,
      },
      statistics: {
        totalTrades: 0,
        winRate: 0,
        avgProfit: 0,
        maxDrawdown: 0,
      },
      createdAt: FieldValue.serverTimestamp(),
      updatedAt: FieldValue.serverTimestamp(),
    };

    await portfolioRef.set(initialData);
    console.log(`✅ 초기 포트폴리오 생성 (userId: ${userId})`);
    return initialData;
  } catch (error) {
    console.error('❌ 초기 포트폴리오 생성 실패:', error);
    throw error;
  }
}

// 포트폴리오 가져오기
async function getPortfolio(userId) {
  try {
    const db = getDb();
    const portfolioRef = db.collection('aiTrader').doc(userId);
    const portfolioDoc = await portfolioRef.get();
    
    if (!portfolioDoc.exists) {
      return await initializePortfolio(userId);
    }
    
    return portfolioDoc.data();
  } catch (error) {
    console.error('❌ 포트폴리오 조회 실패:', error);
    throw error;
  }
}

// 매수 실행
async function executeBuy(userId, order) {
  try {
    const { code, name, quantity: orderQty, cashBudget, aiScore, aiReasons, takeProfit, stopLoss } = order;

    // 검증: 필수 필드
    if (!code || !name) {
      throw new Error('필수 필드 누락: code, name');
    }

    // 현재가 실시간 조회 (트랜잭션 밖에서 수행)
    let currentPrice = 0;
    try {
      const priceRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/naver-stock?symbol=${code}`);
      const priceData = await priceRes.json();
      if (priceData.currentPrice && priceData.currentPrice > 0) {
        currentPrice = priceData.currentPrice;
      }
    } catch {}
    if (!currentPrice) {
      throw new Error(`${name}(${code}) 현재가 조회 실패`);
    }

    // 포지션 사이징: cashBudget 우선, 없으면 orderQty, 기본 1주
    let quantity;
    if (cashBudget && cashBudget > 0) {
      quantity = Math.max(1, Math.floor(cashBudget / currentPrice));
      console.log(`  📐 포지션 사이징: 예산 ${cashBudget.toLocaleString()}원 ÷ ${currentPrice.toLocaleString()}원 = ${quantity}주`);
    } else {
      quantity = orderQty || 1;
    }

    // 매수 금액 계산
    const totalCost = currentPrice * quantity;

    console.log(`💰 매수 시도: ${name} ${quantity}주 @ ${currentPrice.toLocaleString()}원 = ${totalCost.toLocaleString()}원`);

    // 트랜잭션으로 read-modify-write 원자화 (race condition 방지)
    const db = getDb();
    const portfolioRef = db.collection('aiTrader').doc(userId);
    let newHolding;

    await db.runTransaction(async (tx) => {
      const snap = await tx.get(portfolioRef);
      const current = snap.exists ? snap.data() : await initializePortfolio(userId);

      if (current.cash < totalCost) throw new Error(`현금 부족 (필요: ${totalCost.toLocaleString()}원, 보유: ${current.cash.toLocaleString()}원)`);
      if ((current.holdings || []).length >= 5) throw new Error('보유 종목 수 초과 (최대 5개)');
      if ((current.holdings || []).some(h => h.code === code)) throw new Error('이미 보유 중인 종목입니다');

      newHolding = {
        code,
        name,
        quantity,
        avgPrice: currentPrice,
        buyPrice: currentPrice,
        buyDate: new Date().toISOString(),
        buyQuantScore: order.quantScore || 75,
        currentPrice,
        profitRate: 0,
        weight: Math.floor((totalCost / (current.totalAsset || 10000000)) * 100),
        aiScore,
        aiReasons: aiReasons || ['AI 분석'],
        takeProfit: takeProfit ?? null,
        stopLoss: stopLoss ?? null,
      };

      tx.update(portfolioRef, {
        cash: current.cash - totalCost,
        holdings: [...(current.holdings || []), newHolding],
        updatedAt: FieldValue.serverTimestamp(),
      });
    });

    // 거래 기록 저장
    await getDb().collection('aiTransactions').add({
      userId,
      date: new Date().toISOString(),
      action: 'buy',
      code,
      name,
      price: currentPrice,
      quantity,
      aiScore: aiScore || 0,
      aiReasons: aiReasons || [],
      takeProfit: takeProfit ?? null,
      stopLoss: stopLoss ?? null,
      triggerType: 'AI',
      createdAt: FieldValue.serverTimestamp(),
    });
    
    console.log(`✅ 매수 완료: ${name} ${quantity}주`);
    
    return {
      success: true,
      holding: newHolding,
      message: `${name} ${quantity}주 매수 완료`
    };

  } catch (error) {
    console.error(`❌ 매수 실행 실패:`, error);
    throw error;
  }
}

// 매도 실행
async function executeSell(userId, order) {
  try {
    const portfolio = await getPortfolio(userId);
    
    const { code, name, quantity, aiScore, reason, triggerType } = order;
    
    // 검증: 필수 필드
    if (!code || !name) {
      throw new Error('필수 필드 누락: code, name');
    }

    // 보유 종목 찾기
    const holdingIndex = portfolio.holdings.findIndex(h => h.code === code);
    if (holdingIndex === -1) {
      throw new Error(`보유하지 않은 종목: ${name}`);
    }
    
    const holding = portfolio.holdings[holdingIndex];

    // 현재가 실시간 조회
    let currentPrice = 0;
    try {
      const priceRes = await fetch(`${process.env.NEXT_PUBLIC_BASE_URL}/api/naver-stock?symbol=${code}`);
      const priceData = await priceRes.json();
      if (priceData.currentPrice && priceData.currentPrice > 0) currentPrice = priceData.currentPrice;
    } catch {}
    if (!currentPrice) currentPrice = holding.avgPrice;
    
    // 매도 수량
    const sellQuantity = quantity || holding.quantity;
    
    // 검증: 수량
    if (sellQuantity > holding.quantity) {
      throw new Error(`매도 수량 초과 (보유: ${holding.quantity}주)`);
    }

    const totalRevenue = currentPrice * sellQuantity;
    const profitRate = ((currentPrice - holding.avgPrice) / holding.avgPrice * 100);
    const holdDays = Math.floor((new Date() - new Date(holding.buyDate)) / (1000 * 60 * 60 * 24));
    
    console.log(`💰 매도 시도: ${name} ${sellQuantity}주 = ${totalRevenue.toLocaleString()}원 (${profitRate.toFixed(2)}%)`);

    // 포트폴리오 업데이트
    const updatedHoldings = [...portfolio.holdings];
    
    if (sellQuantity >= holding.quantity) {
      // 전량 매도
      updatedHoldings.splice(holdingIndex, 1);
      console.log(`  전량 매도 (${holding.quantity}주)`);
    } else {
      // 일부 매도
      updatedHoldings[holdingIndex] = {
        ...holding,
        quantity: holding.quantity - sellQuantity,
      };
      console.log(`  일부 매도 (${sellQuantity}/${holding.quantity}주)`);
    }
    
    const updatedPortfolio = {
      ...portfolio,
      cash: portfolio.cash + totalRevenue,
      holdings: updatedHoldings,
      statistics: {
        ...portfolio.statistics,
        totalTrades: portfolio.statistics.totalTrades + 1,
      },
      updatedAt: FieldValue.serverTimestamp(),
    };
    
    // Firebase Admin SDK로 저장
    const portfolioRef = getDb().collection('aiTrader').doc(userId);
    await portfolioRef.update({
      cash: updatedPortfolio.cash,
      holdings: updatedPortfolio.holdings,
      statistics: updatedPortfolio.statistics,
      updatedAt: FieldValue.serverTimestamp(),
    });
    
    // 거래 기록 저장
    await getDb().collection('aiTransactions').add({
      userId,
      date: new Date().toISOString(),
      action: 'sell',
      code,
      name,
      price: currentPrice,
      quantity: sellQuantity,
      buyPrice: holding.avgPrice,
      buyDate: holding.buyDate,
      profitRate: profitRate.toFixed(2),
      holdDays,
      aiScore: aiScore || 0,
      aiReason: reason || 'AI 판단',
      triggerType: triggerType || 'AI',
      createdAt: FieldValue.serverTimestamp(),
    });
    
    console.log(`✅ 매도 완료: ${name} ${sellQuantity}주 (${profitRate.toFixed(2)}%)`);
    
    return { 
      success: true, 
      profitRate, 
      portfolio: updatedPortfolio,
      message: `${name} ${sellQuantity}주 매도 완료 (${profitRate > 0 ? '+' : ''}${profitRate.toFixed(2)}%)`
    };

  } catch (error) {
    console.error(`❌ 매도 실행 실패:`, error);
    throw error;
  }
}

// POST: 매수/매도 주문 실행
export async function POST(request) {
  try {
    const body = await request.json();
    const { userId, action, orders } = body;

    // 검증: userId
    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId 필수' },
        { status: 400 }
      );
    }

    // 검증: action
    if (!action || !['buy', 'sell'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'action은 buy 또는 sell이어야 함' },
        { status: 400 }
      );
    }

    // 검증: orders
    if (!orders || !Array.isArray(orders) || orders.length === 0) {
      return NextResponse.json(
        { success: false, error: 'orders 배열 필수' },
        { status: 400 }
      );
    }

    console.log(`\n🚀 ${action} 주문 실행 시작 (${orders.length}개)`);

    const results = [];

    if (action === 'buy') {
      for (const order of orders) {
        try {
          const result = await executeBuy(userId, order);
          results.push(result);
        } catch (error) {
          console.error(`❌ 매수 실패:`, error.message);
          results.push({ 
            success: false, 
            error: error.message, 
            order: { name: order.name, code: order.code }
          });
        }
      }
    } else if (action === 'sell') {
      for (const order of orders) {
        try {
          const result = await executeSell(userId, order);
          results.push(result);
        } catch (error) {
          console.error(`❌ 매도 실패:`, error.message);
          results.push({ 
            success: false, 
            error: error.message, 
            order: { name: order.name, code: order.code }
          });
        }
      }
    }

    const successCount = results.filter(r => r.success).length;
    const failCount = results.filter(r => !r.success).length;

    console.log(`\n✅ 주문 처리 완료: 성공 ${successCount}개, 실패 ${failCount}개`);

    return NextResponse.json({
      success: true,
      results,
      summary: {
        total: orders.length,
        success: successCount,
        failed: failCount,
      },
      timestamp: new Date().toISOString(),
    });

  } catch (error) {
    console.error('❌ 주문 실행 오류:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
      },
      { status: 500 }
    );
  }
}

// GET: 포트폴리오 조회
export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const userId = searchParams.get('userId');

    if (!userId) {
      return NextResponse.json(
        { success: false, error: 'userId 필수' },
        { status: 400 }
      );
    }

    const portfolio = await getPortfolio(userId);

    // 총 자산 계산
    const totalAsset = portfolio.cash + portfolio.holdings.reduce((sum, h) => {
      return sum + (h.currentPrice || h.avgPrice) * h.quantity;
    }, 0);

    const cashRate = totalAsset > 0 ? (portfolio.cash / totalAsset * 100).toFixed(1) : 100;
    const returnRate = ((totalAsset - 10000000) / 10000000 * 100).toFixed(2);

    return NextResponse.json({
      success: true,
      portfolio: {
        ...portfolio,
        totalAsset,
        cashRate,
        returnRate,
      },
    });

  } catch (error) {
    console.error('❌ 포트폴리오 조회 오류:', error);
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    );
  }
}