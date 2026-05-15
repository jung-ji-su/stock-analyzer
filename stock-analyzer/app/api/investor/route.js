import YahooFinance from 'yahoo-finance2';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export async function GET(request) {
    const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    if (!symbol) return Response.json({ error: '종목 코드 없음' }, { status: 400 });

    try {
        // 순매수 데이터: Naver는 JS 렌더링 페이지라 서버에서 조회 불가, KRX도 미제공
        // Yahoo Finance 기관 보유 현황만 조회
        let topInstitutions = [];
        let foreignHoldingPct = null;
        try {
            let holders = null;
            try {
                holders = await yf.quoteSummary(`${symbol}.KS`, {
                    modules: ['institutionOwnership', 'majorHoldersBreakdown'],
                });
            } catch {
                holders = await yf.quoteSummary(`${symbol}.KQ`, {
                    modules: ['institutionOwnership', 'majorHoldersBreakdown'],
                });
            }

            const breakdown = holders?.majorHoldersBreakdown || {};
            foreignHoldingPct = breakdown.institutionsPercentHeld
                ? (breakdown.institutionsPercentHeld * 100).toFixed(1)
                : null;

            topInstitutions = (holders?.institutionOwnership?.ownershipList || [])
                .slice(0, 5)
                .map(inst => ({
                    name: inst.organization || '',
                    pctHeld: inst.pctHeld ? (inst.pctHeld * 100).toFixed(2) + '%' : '',
                    value: inst.value ? Math.round(inst.value / 100000000).toLocaleString() + '억' : '',
                    change: inst.pctChange ? (inst.pctChange * 100).toFixed(2) + '%' : '0%',
                    isIncrease: (inst.pctChange || 0) >= 0,
                }));
        } catch (e) {
            console.error('yahoo holders failed:', e.message);
        }

        return Response.json({
            dataUnavailable: true,
            individual: 0,
            foreign: 0,
            institution: 0,
            individualPct: 0,
            foreignPct: 0,
            institutionPct: 0,
            foreignHoldingPct,
            topInstitutions,
        });

    } catch (error) {
        console.error('investor error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
}
