import YahooFinance from 'yahoo-finance2';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export async function GET(request) {
    const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    if (!symbol) return Response.json({ error: '종목 코드 없음' }, { status: 400 });

    try {
        let result = null;

        try {
            result = await yf.quoteSummary(`${symbol}.KS`, {
                modules: ['price', 'summaryDetail', 'defaultKeyStatistics', 'assetProfile', 'financialData'],
            });
        } catch (e1) {
            try {
                result = await yf.quoteSummary(`${symbol}.KQ`, {
                    modules: ['price', 'summaryDetail', 'defaultKeyStatistics', 'assetProfile', 'financialData'],
                });
            } catch (e2) {
                console.error('quoteSummary 실패 KS:', e1.message);
                console.error('quoteSummary 실패 KQ:', e2.message);
                return Response.json({ error: '종목 데이터를 찾을 수 없습니다' }, { status: 404 });
            }
        }

        const price = result.price || {};
        const detail = result.summaryDetail || {};
        const stats = result.defaultKeyStatistics || {};
        const profile = result.assetProfile || {};
        const financial = result.financialData || {};

        const currentPrice = price.regularMarketPrice || 0;
        const trailingEps = stats.trailingEps || 0;
        const per = detail.trailingPE || (currentPrice && trailingEps ? currentPrice / trailingEps : null);

        // 기업 개요 한글 번역
        let summaryKr = '';
        if (profile.longBusinessSummary && profile.longBusinessSummary.length > 10) {
            try {
                const translateRes = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                    method: 'POST',
                    headers: {
                        'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({
                        model: 'openrouter/auto',
                        max_tokens: 500,
                        messages: [{
                            role: 'user',
                            content: `다음 기업 소개를 한국어로 자연스럽게 번역해줘. 번역문만 출력해:\n\n${profile.longBusinessSummary}`,
                        }],
                    }),
                });
                const translated = await translateRes.json();
                summaryKr = translated.choices?.[0]?.message?.content?.trim() || '';
            } catch (e) {
                console.error('번역 실패:', e.message);
                summaryKr = profile.longBusinessSummary;
            }
        }

        // 섹터/업종 한글 매핑
        const sectorMap = {
            'Technology': '기술',
            'Healthcare': '헬스케어',
            'Financial Services': '금융',
            'Consumer Cyclical': '경기소비재',
            'Consumer Defensive': '필수소비재',
            'Industrials': '산업재',
            'Energy': '에너지',
            'Basic Materials': '소재',
            'Real Estate': '부동산',
            'Utilities': '유틸리티',
            'Communication Services': '커뮤니케이션',
        };

        const recommendMap = {
            'strong_buy': '강력 매수',
            'buy': '매수',
            'hold': '보유',
            'underperform': '시장하회',
            'sell': '매도',
        };

        return Response.json({
            name: price.longName || price.shortName || '',
            sector: sectorMap[profile.sector] || profile.sector || '',
            industry: profile.industry || '',
            summary: summaryKr || `${price.longName || price.shortName || ''}는 ${sectorMap[profile.sector] || profile.sector || ''} 섹터 기업입니다.`,
            employees: profile.fullTimeEmployees?.toLocaleString() || '',
            website: profile.website || '',
            marketCapFmt: price.marketCap ? Math.round(price.marketCap / 100000000).toLocaleString() + '억원' : '',
            per: per ? Number(per).toFixed(1) : '',
            forwardPer: detail.forwardPE ? Number(detail.forwardPE).toFixed(1) : '',
            pbr: stats.priceToBook ? Number(stats.priceToBook).toFixed(2) : '',
            eps: trailingEps ? Number(trailingEps).toLocaleString() + '원' : '',
            roe: financial.returnOnEquity ? (financial.returnOnEquity * 100).toFixed(1) + '%' : '',
            roa: financial.returnOnAssets ? (financial.returnOnAssets * 100).toFixed(1) + '%' : '',
            dividendYield: detail.dividendYield ? (detail.dividendYield * 100).toFixed(2) + '%' : '',
            high52: detail.fiftyTwoWeekHigh ? Number(detail.fiftyTwoWeekHigh).toLocaleString() + '원' : '',
            low52: detail.fiftyTwoWeekLow ? Number(detail.fiftyTwoWeekLow).toLocaleString() + '원' : '',
            high52Raw: detail.fiftyTwoWeekHigh || 0,
            low52Raw: detail.fiftyTwoWeekLow || 0,
            currentPrice: currentPrice || 0,
            beta: detail.beta ? Number(detail.beta).toFixed(2) : '',
            operatingMargin: financial.operatingMargins ? (financial.operatingMargins * 100).toFixed(1) + '%' : '',
            profitMargin: financial.profitMargins ? (financial.profitMargins * 100).toFixed(1) + '%' : '',
            debtToEquity: financial.debtToEquity ? Number(financial.debtToEquity).toFixed(1) : '',
            revenue: financial.totalRevenue ? Math.round(financial.totalRevenue / 100000000).toLocaleString() + '억원' : '',
            revenueGrowth: financial.revenueGrowth ? (financial.revenueGrowth * 100).toFixed(1) + '%' : '',
            earningsGrowth: financial.earningsGrowth ? (financial.earningsGrowth * 100).toFixed(1) + '%' : '',
            targetMeanPrice: financial.targetMeanPrice ? Math.round(financial.targetMeanPrice).toLocaleString() + '원' : '',
            numberOfAnalystOpinions: financial.numberOfAnalystOpinions || '',
            recommendationKey: recommendMap[financial.recommendationKey] || financial.recommendationKey || '',
        });

    } catch (error) {
        console.error('stock-info error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
}