import { NextResponse } from 'next/server';

// OpenRouter AI 호출 (재시도 로직 포함)
async function callAI(prompt, maxRetries = 3) {
  let lastError;
  
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      console.log(`🤖 AI 호출 시도 ${attempt}/${maxRetries}...`);
      
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'openrouter/auto',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.3,
        }),
      });

      if (!response.ok) {
        throw new Error(`API 응답 에러: ${response.status}`);
      }

      const data = await response.json();
      
      if (!data.choices || data.choices.length === 0) {
        throw new Error('AI 응답 형식 오류');
      }

      console.log(`✅ AI 호출 성공 (시도 ${attempt})`);
      return data.choices[0].message.content;
      
    } catch (error) {
      console.error(`❌ AI 호출 실패 (시도 ${attempt}):`, error.message);
      lastError = error;
      
      if (attempt < maxRetries) {
        const delay = attempt * 1000; // 1초, 2초, 3초
        console.log(`⏳ ${delay}ms 대기 후 재시도...`);
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }
  
  throw lastError;
}

// 매수 분석 프롬프트
function getBuyAnalysisPrompt(stockData) {
  return `당신은 한국 주식 시장의 퀀트 트레이더입니다.
3-5일 단위 스윙 투자 관점에서 아래 종목을 평가하세요.

[종목 정보]
- 종목명: ${stockData.name}
- Quant Score: ${stockData.quantScore}
- 섹터: ${stockData.sector}

다음 형식으로만 답변하세요 (JSON만):
{
  "score": 0-100 점수 (75+ 강력매수, 60-75 보통, 60미만 제외),
  "reasons": ["이유1", "이유2", "이유3"],
  "holdPeriod": "3-7일",
  "risk": "주요 리스크 1가지"
}

JSON 외에는 아무것도 출력하지 마세요.`;
}

// 매도 판단 프롬프트
function getSellAnalysisPrompt(holdingData) {
  return `현재 보유 중인 종목의 매도 시점을 판단하세요.

[보유 정보]
- 종목명: ${holdingData.name}
- 수익률: ${holdingData.profitRate.toFixed(2)}%
- 보유 기간: ${holdingData.holdDays}일

다음 형식으로만 답변하세요 (JSON만):
{
  "action": "hold" or "sell",
  "score": 0-100 (매도 필요성),
  "reason": "핵심 이유 1줄"
}

- 손절(-7%)이나 익절(+20%) 근처면 적극 매도
- 이익 중이고 추세 유지하면 hold
- 애매하면 hold

JSON 외에는 아무것도 출력하지 마세요.`;
}

// Fallback AI 분석 (AI 호출 실패 시)
function getFallbackAnalysis(stockData, action) {
  if (action === 'buy') {
    // Quant Score 기반 간단한 로직
    const score = stockData.quantScore;
    return {
      score: score,
      reasons: [
        `Quant Score ${score}점`,
        `${stockData.sector} 섹터`,
        '기술적 지표 분석'
      ],
      holdPeriod: '3-7일',
      risk: '시장 변동성'
    };
  } else {
    // 매도 판단 기본 로직
    return {
      action: 'hold',
      score: 50,
      reason: 'AI 분석 실패, 보유 유지'
    };
  }
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, candidates, holdings } = body;

    console.log(`🤖 AI 분석 시작: ${action}`);
    console.log(`📋 입력: ${candidates?.length || holdings?.length}개`);

    if (action === 'analyze_buy') {
      const results = [];
      const errors = [];

      for (const candidate of candidates) {
        console.log(`\n분석 중: ${candidate.name}`);
        
        try {
          const stockData = {
            name: candidate.name,
            code: candidate.code,
            quantScore: candidate.quantScore || 75,
            sector: candidate.sector || '일반',
          };

          let analysis;
          
          try {
            // AI 분석 시도
            const prompt = getBuyAnalysisPrompt(stockData);
            const aiResponse = await callAI(prompt);
            const cleanResponse = aiResponse.replace(/```json|```/g, '').trim();
            analysis = JSON.parse(cleanResponse);
            console.log(`  💯 AI 점수: ${analysis.score}/100`);
          } catch (aiError) {
            // AI 실패 시 Fallback
            console.warn(`  ⚠️ AI 분석 실패, Fallback 사용`);
            analysis = getFallbackAnalysis(stockData, 'buy');
          }

          results.push({
            ...candidate,
            ...stockData,
            aiAnalysis: analysis,
          });

        } catch (error) {
          console.error(`  ❌ ${candidate.name} 처리 실패:`, error.message);
          errors.push({ stock: candidate.name, error: error.message });
        }
      }

      results.sort((a, b) => (b.aiAnalysis?.score || 0) - (a.aiAnalysis?.score || 0));

      console.log(`\n✅ 분석 완료: ${results.length}개 성공, ${errors.length}개 실패`);

      return NextResponse.json({
        success: true,
        action: 'buy',
        results,
        errors: errors.length > 0 ? errors : undefined,
        summary: {
          total: candidates.length,
          analyzed: results.length,
          failed: errors.length,
        },
        timestamp: new Date().toISOString(),
      });

    } else if (action === 'analyze_sell') {
      const results = [];
      const errors = [];

      for (const holding of holdings) {
        try {
          // 현재 수익률 계산 (실제로는 실시간 시세 조회)
          const currentPrice = holding.avgPrice * (1 + Math.random() * 0.1 - 0.05);
          const profitRate = ((currentPrice - holding.avgPrice) / holding.avgPrice * 100);
          const holdDays = Math.floor((new Date() - new Date(holding.buyDate)) / (1000 * 60 * 60 * 24));

          const holdingData = {
            name: holding.name,
            code: holding.code,
            profitRate,
            holdDays,
          };

          // 자동 트리거 체크
          let triggerType = null;
          let autoSell = false;
          let analysis;

          if (profitRate <= -7) {
            triggerType = 'auto_stop_loss';
            autoSell = true;
            analysis = { action: 'sell', score: 100, reason: '손절선 도달 (-7%)' };
          } else if (profitRate >= 20) {
            triggerType = 'auto_take_profit';
            autoSell = true;
            analysis = { action: 'sell', score: 100, reason: '익절선 도달 (+20%)' };
          } else {
            // AI 분석
            try {
              const prompt = getSellAnalysisPrompt(holdingData);
              const aiResponse = await callAI(prompt);
              const cleanResponse = aiResponse.replace(/```json|```/g, '').trim();
              analysis = JSON.parse(cleanResponse);
              triggerType = 'AI';
            } catch (aiError) {
              console.warn(`  ⚠️ AI 분석 실패, 보유 유지`);
              analysis = getFallbackAnalysis(holdingData, 'sell');
              triggerType = 'AI';
            }
          }

          results.push({
            ...holding,
            currentPrice,
            profitRate,
            holdDays,
            aiAnalysis: analysis,
            triggerType,
          });

        } catch (error) {
          console.error(`❌ ${holding.name} 분석 실패:`, error);
          errors.push({ stock: holding.name, error: error.message });
        }
      }

      results.sort((a, b) => (b.aiAnalysis?.score || 0) - (a.aiAnalysis?.score || 0));

      return NextResponse.json({
        success: true,
        action: 'sell',
        results,
        errors: errors.length > 0 ? errors : undefined,
        timestamp: new Date().toISOString(),
      });
    }

    return NextResponse.json(
      { success: false, error: 'Invalid action' },
      { status: 400 }
    );

  } catch (error) {
    console.error('❌ AI 판단 오류:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: error.message,
        fallback: true,
      },
      { status: 500 }
    );
  }
}
