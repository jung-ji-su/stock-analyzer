import YahooFinance from 'yahoo-finance2';

export const revalidate = 0;
export const dynamic = 'force-dynamic';

export async function GET(request) {
    const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });
    const { searchParams } = new URL(request.url);
    const symbol = searchParams.get('symbol');
    if (!symbol) return Response.json({ error: '종목 코드 없음' }, { status: 400 });

    try {
        let individual = 0, foreign = 0, institution = 0;

        // 네이버 금융 투자자별 순매수 크롤링
        try {
            const headers = {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
                'Referer': 'https://finance.naver.com',
                'Accept-Language': 'ko-KR,ko;q=0.9',
            };

            const res = await fetch(
                `https://finance.naver.com/item/frgn.naver?code=${symbol}`,
                { headers }
            );
            const buffer = await res.arrayBuffer();
            const { default: iconv } = await import('iconv-lite');
            const html = iconv.decode(Buffer.from(buffer), 'EUC-KR');
            const { load } = await import('cheerio');
            const $ = load(html);

            console.log('naver html sample:', html.slice(0, 300));

            // 테이블 전체 구조 출력
            $('table tr').each((i, tr) => {
                const tds = $(tr).find('td');
                if (tds.length >= 3) {
                    const vals = [];
                    tds.each((j, td) => vals.push($(td).text().trim().replace(/,/g, '').replace(/\+/g, '')));
                    console.log(`tr[${i}]:`, vals.slice(0, 6));
                    if (i === 1) {
                        individual = parseInt(vals[0]) || 0;
                        foreign = parseInt(vals[1]) || 0;
                        institution = parseInt(vals[2]) || 0;
                    }
                }
            });

            console.log('individual:', individual, 'foreign:', foreign, 'institution:', institution);
        } catch (e) {
            console.log('naver investor crawl failed:', e.message);
        }

        // Yahoo Finance 기관 보유 현황
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
            console.log('yahoo holders failed:', e.message);
        }

        const absMax = Math.max(Math.abs(individual), Math.abs(foreign), Math.abs(institution), 1);

        return Response.json({
            individual,
            foreign,
            institution,
            individualPct: Math.round((Math.abs(individual) / absMax) * 100),
            foreignPct: Math.round((Math.abs(foreign) / absMax) * 100),
            institutionPct: Math.round((Math.abs(institution) / absMax) * 100),
            foreignHoldingPct,
            topInstitutions,
        });

    } catch (error) {
        console.error('investor error:', error.message);
        return Response.json({ error: error.message }, { status: 500 });
    }
}