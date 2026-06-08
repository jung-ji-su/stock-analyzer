import { NextResponse } from 'next/server';

// OpenRouter AI 호출 (재시도 로직 포함)
async function callAI(prompt, maxRetries = 3) {
  if (!process.env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY가 설정되지 않았습니다');

  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);
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
          temperature: 0.2,
        }),
        signal: controller.signal,
      });
      clearTimeout(timeout);

      if (!response.ok) throw new Error(`API 응답 에러: ${response.status}`);

      const data = await response.json();

      if (!data.choices || data.choices.length === 0) throw new Error('AI 응답 형식 오류');

      console.log(`✅ AI 호출 성공 (시도 ${attempt})`);
      return data.choices[0].message.content;

    } catch (error) {
      clearTimeout(timeout);
      console.error(`❌ AI 호출 실패 (시도 ${attempt}):`, error.message);
      lastError = error;

      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, attempt * 1000));
      }
    }
  }

  throw lastError;
}

function safeParseJSON(text) {
  const cleaned = text.replace(/```json|```/g, '').trim();
  try { return JSON.parse(cleaned); } catch {}
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start !== -1 && end > start) {
    try { return JSON.parse(cleaned.slice(start, end + 1)); } catch {}
  }
  return null;
}

// 강화된 매수 분석 프롬프트
function getBuyAnalysisPrompt(stockData, indicators) {
  return `당신은 10년 경력의 전문 퀀트 트레이더입니다.
철저한 기술적 분석으로 매수 여부를 판단하세요.

[종목 정보]
- 종목명: ${stockData.name}
- 현재가: ${indicators.currentPrice}원
- Quant Score: ${stockData.quantScore}/100
- 섹터: ${stockData.sector}

[기술적 지표]
1. RSI(14): ${indicators.rsi?.value} (${indicators.rsi?.signal})
2. MACD: ${indicators.macd?.value} (${indicators.macd?.signal})
3. 볼린저밴드: 현재 ${indicators.bollingerBands?.position}
   - 상단: ${indicators.bollingerBands?.upper}원
   - 중심: ${indicators.bollingerBands?.middle}원
   - 하단: ${indicators.bollingerBands?.lower}원
4. 이동평균선: ${indicators.movingAverages?.alignment}
   - 5일: ${indicators.movingAverages?.ma5}원
   - 20일: ${indicators.movingAverages?.ma20}원
   - 60일: ${indicators.movingAverages?.ma60}원
5. 거래량: ${indicators.volume?.signal}
   - 20일 평균 대비: ${indicators.volume?.change}

[가격 수준]
- 지지선: ${indicators.supportResistance?.support}원 (${indicators.supportResistance?.distance.toSupport}% 위)
- 저항선: ${indicators.supportResistance?.resistance}원 (${indicators.supportResistance?.distance.toResistance}% 아래)

[변동성]
- ATR(14): ${indicators.atr?.value}원
- 변동성: ${indicators.atr?.volatility}

[분석 요구사항]
1. 위 모든 지표를 종합적으로 분석하세요
2. 단순히 점수만 보지 말고, 기술적 근거를 명확히 제시하세요
3. 매수 시점으로 적절한지 판단하세요
4. 리스크를 냉철하게 평가하세요

다음 JSON 형식으로만 답변하세요:
{
  "score": 0-100 (75+ 강력매수, 60-75 보통, 60미만 제외),
  "reasons": [
    "구체적인 기술적 근거 1",
    "구체적인 기술적 근거 2",
    "구체적인 기술적 근거 3"
  ],
  "stopLoss": 손절가격 (숫자),
  "takeProfit": 익절가격 (숫자),
  "holdPeriod": "예상 보유 기간",
  "risk": "핵심 리스크 1가지"
}

JSON 외에는 아무것도 출력하지 마세요.`;
}

// 매도 판단 프롬프트
function getSellAnalysisPrompt(holdingData, indicators) {
  return `현재 보유 중인 종목의 매도 시점을 판단하세요.

[보유 정보]
- 종목명: ${holdingData.name}
- 매수가: ${holdingData.buyPrice}원
- 현재가: ${indicators.currentPrice}원
- 수익률: ${holdingData.profitRate.toFixed(2)}%
- 보유 기간: ${holdingData.holdDays}일
- 설정된 손절가: ${holdingData.stopLoss}원
- 설정된 익절가: ${holdingData.takeProfit}원

[현재 기술적 지표]
- RSI: ${indicators.rsi?.value} (${indicators.rsi?.signal})
- MACD: ${indicators.macd?.value} (${indicators.macd?.signal})
- 볼린저밴드: ${indicators.bollingerBands?.position}
- 거래량: ${indicators.volume?.signal}

다음 JSON 형식으로만 답변하세요:
{
  "action": "hold" or "sell",
  "score": 0-100 (매도 필요성),
  "reason": "핵심 이유 1줄"
}

- 손절가(-7%) 도달 시: 무조건 매도
- 익절가(+20%) 도달 시: 무조건 매도
- 그 외: 기술적 지표 종합 판단

JSON 외에는 아무것도 출력하지 마세요.`;
}

export async function POST(request) {
  try {
    const body = await request.json();
    const { action, candidates, holdings } = body;

    console.log(`🤖 강화된 AI 분석 시작: ${action}`);
    console.log(`📋 입력: ${candidates?.length || holdings?.length}개`);

    // ✅ 이 로그 추가!
    console.log('📋 DEBUG candidates:', candidates ? `${candidates.length}개` : 'undefined');
    console.log('📋 DEBUG first candidate:', candidates?.[0]);

    if (action === 'analyze_buy') {
      const results = [];
      const errors = [];

      // ✅ 이 로그 추가!
      console.log('🔄 for 루프 시작, candidates.length:', candidates.length);

      for (const candidate of candidates) {
        console.log(`\n분석 중: ${candidate.name}`);

        try {
          // 1. 기술적 지표 가져오기
          console.log(`  📊 기술적 지표 조회...`);
          const indicatorsRes = await fetch(
            `${process.env.NEXT_PUBLIC_BASE_URL}/api/technical-indicators?symbol=${candidate.code}`
          );

          if (!indicatorsRes.ok) {
            throw new Error('기술적 지표 조회 실패');
          }

          const { indicators } = await indicatorsRes.json();
          console.log(`  ✅ 지표 로드 완료`);

          // 2. AI 분석
          const stockData = {
            name: candidate.name,
            code: candidate.code,
            quantScore: candidate.quantScore || 75,
            sector: candidate.sector || '일반',
          };

          console.log(`  🤖 AI 분석 요청...`);
          const prompt = getBuyAnalysisPrompt(stockData, indicators);
          const aiResponse = await callAI(prompt);
          const analysis = safeParseJSON(aiResponse);
          if (!analysis) throw new Error('AI 응답 JSON 파싱 실패');

          console.log(`  💯 AI 점수: ${analysis.score}/100`);
          console.log(`  🎯 손절: ${analysis.stopLoss}원, 익절: ${analysis.takeProfit}원`);

          results.push({
            ...candidate,
            ...stockData,
            indicators,
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
          // 기술적 지표 조회
          const indicatorsRes = await fetch(
            `${process.env.NEXT_PUBLIC_BASE_URL}/api/technical-indicators?symbol=${holding.code}`
          );

          if (!indicatorsRes.ok) {
            throw new Error('기술적 지표 조회 실패');
          }

          const { indicators } = await indicatorsRes.json();

          // 현재 수익률 계산
          const currentPrice = parseFloat(indicators.currentPrice);
          const profitRate = ((currentPrice - holding.buyPrice) / holding.buyPrice * 100);
          const holdDays = Math.floor((new Date() - new Date(holding.buyDate)) / (1000 * 60 * 60 * 24));

          const holdingData = {
            name: holding.name,
            code: holding.code,
            buyPrice: holding.buyPrice,
            profitRate,
            holdDays,
            stopLoss: holding.stopLoss,
            takeProfit: holding.takeProfit,
          };

          // 자동 트리거 체크
          let triggerType = null;
          let analysis;

          if (currentPrice <= holding.stopLoss) {
            triggerType = 'auto_stop_loss';
            analysis = { action: 'sell', score: 100, reason: `손절선 도달 (${holding.stopLoss}원)` };
          } else if (currentPrice >= holding.takeProfit) {
            triggerType = 'auto_take_profit';
            analysis = { action: 'sell', score: 100, reason: `익절선 도달 (${holding.takeProfit}원)` };
          } else {
            // AI 분석
            try {
              const prompt = getSellAnalysisPrompt(holdingData, indicators);
              const aiResponse = await callAI(prompt);
              analysis = safeParseJSON(aiResponse);
              if (!analysis) throw new Error('AI 응답 JSON 파싱 실패');
              triggerType = 'AI';
            } catch (aiError) {
              console.warn(`  ⚠️ AI 분석 실패, 보유 유지`);
              analysis = { action: 'hold', score: 0, reason: 'AI 분석 실패, 보유 유지' };
              triggerType = 'AI';
            }
          }

          results.push({
            ...holding,
            currentPrice,
            profitRate,
            holdDays,
            indicators,
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
      },
      { status: 500 }
    );
  }
}