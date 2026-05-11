import { NextResponse } from 'next/server';
import { db } from '@/lib/firebase';
import { collection, doc, getDoc, setDoc, updateDoc, addDoc, serverTimestamp } from 'firebase/firestore';

// 초기 포트폴리오 생성
async function initializePortfolio(userId) {
  try {
    const portfolioRef = doc(db, 'aiTrader', userId);
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
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    await setDoc(portfolioRef, initialData);
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
    const portfolioRef = doc(db, 'aiTrader', userId);
    const portfolioSnap = await getDoc(portfolioRef);
    
    if (!portfolioSnap.exists()) {
      return await initializePortfolio(userId);
    }
    
    return portfolioSnap.data();
  } catch (error) {
    console.error('❌ 포트폴리오 조회 실패:', error);
    throw error;
  }
}

// 매수 실행
async function executeBuy(userId, order) {
  try {
    const portfolio = await getPortfolio(userId);
    
    const { code, name, quantity, aiScore, aiReasons } = order;
    
    // 검증: 필수 필드
    if (!code || !name || !quantity) {
      throw new Error('필수 필드 누락: code, name, quantity');
    }

    // 검증: 수량
    if (quantity <= 0) {
      throw new Error('수량은 양수여야 합니다');
    }

    // 현재가 조회 (임시로 고정값 사용, 실제로는 API 호출)
    const currentPrice = {
      '005930': 268500,
      '000660': 1686000,
      '373220': 476500,
      '035720': 46000,
      '035420': 215000,
    }[code] || 100000; // fallback 가격

    // 매수 금액 계산
    const totalCost = currentPrice * quantity;
    
    console.log(`💰 매수 시도: ${name} ${quantity}주 = ${totalCost.toLocaleString()}원`);
    
    // 검증: 현금 부족
    if (portfolio.cash < totalCost) {
      throw new Error(`현금 부족 (필요: ${totalCost.toLocaleString()}원, 보유: ${portfolio.cash.toLocaleString()}원)`);
    }

    // 검증: 보유 종목 수 제한 (최대 5개)
    if (portfolio.holdings.length >= 5) {
      throw new Error('보유 종목 수 초과 (최대 5개)');
    }

    // 검증: 이미 보유 중인 종목
    if (portfolio.holdings.some(h => h.code === code)) {
      throw new Error('이미 보유 중인 종목입니다');
    }

    // 포트폴리오 업데이트
    const newHolding = {
      code,
      name,
      quantity,
      avgPrice: currentPrice,
      buyPrice: currentPrice,
      buyDate: new Date().toISOString(),
      buyQuantScore: order.quantScore || 75,
      currentPrice,
      profitRate: 0,
      weight: Math.floor((totalCost / portfolio.totalAsset) * 100),
      aiScore,
      aiReasons: aiReasons || ['AI 분석'],
    };
    
    const updatedPortfolio = {
      ...portfolio,
      cash: portfolio.cash - totalCost,
      holdings: [...portfolio.holdings, newHolding],
      updatedAt: serverTimestamp(),
    };
    
    // Firebase 저장
    const portfolioRef = doc(db, 'aiTrader', userId);
    await updateDoc(portfolioRef, updatedPortfolio);
    
    // 거래 기록 저장
    await addDoc(collection(db, 'aiTransactions'), {
      userId,
      date: new Date().toISOString(),
      action: 'buy',
      code,
      name,
      price: currentPrice,
      quantity,
      aiScore: aiScore || 0,
      aiReasons: aiReasons || [],
      triggerType: 'AI',
      createdAt: serverTimestamp(),
    });
    
    console.log(`✅ 매수 완료: ${name} ${quantity}주`);
    
    return { 
      success: true, 
      holding: newHolding, 
      portfolio: updatedPortfolio,
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
    
    // 현재가 (임시로 평단가 기준 랜덤 등락)
    const currentPrice = holding.avgPrice * (1 + (Math.random() * 0.1 - 0.05));
    
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
      updatedAt: serverTimestamp(),
    };
    
    // Firebase 저장
    const portfolioRef = doc(db, 'aiTrader', userId);
    await updateDoc(portfolioRef, updatedPortfolio);
    
    // 거래 기록 저장
    await addDoc(collection(db, 'aiTransactions'), {
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
      createdAt: serverTimestamp(),
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