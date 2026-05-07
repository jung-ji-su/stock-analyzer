'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MarketTreemap from '@/components/MarketTreemap';

export default function MarketMapPage() {
    const router = useRouter();
    const [loading, setLoading] = useState(true);
    const [sectors, setSectors] = useState([]);
    const [selectedSector, setSelectedSector] = useState(null);
    const [filter, setFilter] = useState('all');
    const [sortBy, setSortBy] = useState('marketCap');
    const [searchQuery, setSearchQuery] = useState('');
    const [error, setError] = useState(null);
    const [tipIndex, setTipIndex] = useState(0);
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        async function fetchData(useCache = true) {
            try {
                // 캐시 확인 (5분 이내면 재사용)
                if (useCache) {
                    const cached = sessionStorage.getItem('market-map-data');
                    if (cached) {
                        const { data, timestamp } = JSON.parse(cached);
                        const age = Date.now() - timestamp;
                        if (age < 5 * 60 * 1000) { // 5분 이내
                            setSectors(data);
                            setLoading(false);
                            return;
                        }
                    }
                }

                setLoading(true);
                setError(null);
                const response = await fetch('/api/market-overview');
                const result = await response.json();

                if (result.success && result.data) {
                    setSectors(result.data);
                    // 캐시 저장
                    sessionStorage.setItem('market-map-data', JSON.stringify({
                        data: result.data,
                        timestamp: Date.now(),
                    }));
                }
            } catch (error) {
                console.error('❌ 데이터 로드 실패:', error);
                setError(error.message);
            } finally {
                setLoading(false);
            }
        }

        fetchData(); // 첫 로드 (캐시 우선)

        const interval = setInterval(() => fetchData(false), 5 * 60 * 1000);
        return () => clearInterval(interval);
    }, []);

    // 로딩 팁 순환
    useEffect(() => {
        if (!loading) return;
        const timer = setInterval(() => {
            setTipIndex(prev => prev + 1);
        }, 4000);
        return () => clearInterval(timer);
    }, [loading]);

    useEffect(() => {
        if (!loading) { setProgress(0); return; }
        const timer = setInterval(() => {
            setProgress(prev => {
                if (prev >= 92) return prev; // 92%에서 대기 (완료 전까지)
                return prev + (95 - prev) * 0.05; // 점점 느려짐
            });
        }, 200);
        return () => clearInterval(timer);
    }, [loading]);

    const filteredSectors = sectors.filter(sector => {
        if (searchQuery) {
            const query = searchQuery.toLowerCase();
            const matchSector = sector.name.toLowerCase().includes(query);
            const matchStock = sector.stocks?.some(s =>
                s.name.toLowerCase().includes(query) ||
                s.ticker.toLowerCase().includes(query)
            );
            if (!matchSector && !matchStock) return false;
        }

        if (filter === 'up' && sector.avgChangePercent <= 0) return false;
        if (filter === 'down' && sector.avgChangePercent >= 0) return false;

        return true;
    });

    const sortedSectors = [...filteredSectors].sort((a, b) => {
        if (sortBy === 'marketCap') {
            return b.totalMarketCap - a.totalMarketCap;
        } else if (sortBy === 'change') {
            return b.avgChangePercent - a.avgChangePercent;
        }
        return 0;
    });

    const handleSectorClick = (sector) => {
        setSelectedSector(sector);
    };

    const handleBack = () => {
        setSelectedSector(null);
    };

    const handleStockClick = (stockName) => {
        const clean = stockName.replace(/\(.*?\)/g, '').trim();
        router.push(`/?q=${encodeURIComponent(clean)}`);
    };

    if (loading) {
        const tips = [
            { emoji: '📈', text: '"매수는 기술, 매도는 예술"' },
            { emoji: '🧊', text: '"공포에 사서 환희에 팔아라" — 워렌 버핏' },
            { emoji: '⏳', text: '"시장은 인내심 없는 자의 돈을 인내심 있는 자에게 옮긴다"' },
            { emoji: '🎯', text: '"분산투자는 무지에 대한 보호장치다" — 워렌 버핏' },
            { emoji: '🌊', text: '"썰물이 빠지면 누가 발가벗고 수영했는지 알 수 있다 — 워렌 버핏 "' },
            { emoji: '🧠', text: '"투자에서 가장 중요한 건 IQ가 아니라 감정 조절이다"' },
            { emoji: '🏃', text: '"시장 타이밍을 맞추는 것보다 시장에 머무는 것이 중요하다"' },
            { emoji: '💎', text: '"좋은 기업을 적정 가격에 사라" — 워렌 버핏' },
            { emoji: '🔍', text: '"남들이 탐욕적일 때 두려워하라"' },
            { emoji: '📊', text: '"과거 수익률이 미래 수익률을 보장하지 않는다"' },

            // --- 전설들의 팩트 폭격 ---
            { emoji: '🃏', text: '"기업 분석 없는 투자는 카드를 보지 않고 치는 포커와 같다" — 피터 린치' },
            { emoji: '🧘', text: '"주식 시장의 90%는 심리학이 지배한다" — 앙드레 코스톨라니' },
            { emoji: '💤', text: '"투자가 즐겁다면 아마 돈을 못 벌고 있을 것이다. 좋은 투자는 지루하다" — 조지 소로스' },
            { emoji: '📉', text: '"떨어지는 칼날을 잡지 마라" — 피터 린치' },
            { emoji: '🏠', text: '"사람들은 집을 고를 땐 몇 달을 쓰면서, 주식은 몇 분 만에 결정한다" — 피터 린치' },

            // --- 뼈 때리는 조언 ---
            { emoji: '💸', text: '"시장은 당신이 파산할 때까지 비이성적일 수 있다" — 존 메이너드 케인즈' },
            { emoji: '🪑', text: '"큰돈은 매매가 아니라 기다림에서 나온다" — 찰리 멍거' },
            { emoji: '🩸', text: '"거리에 피가 낭자할 때가 바로 살 때다"' },
            { emoji: '✋', text: '"아무것도 하지 않는 것도 투자다"' },
            { emoji: '🎢', text: '"50% 하락을 견디지 못하는 자는 주식 투자를 할 자격이 없다" — 찰리 멍거' },

            // --- 현실적인 위트 ---
            { emoji: '🍗', text: '"수익은 언제나 옳다 (익절은 항상 옳다)"' },
            { emoji: '🚲', text: '"자전거는 탈 줄 알면서 주식은 왜 배울 생각을 안 하는가?"' },
            { emoji: '👵', text: '"내 할머니보다 주식을 더 자주 매매한다면 당신은 도박꾼이다"' },
            { emoji: '🌓', text: '"상승장에서는 모두가 천재다"' },
            { emoji: '🧼', text: '"거품은 그것이 터지기 전까지는 거품인지 알 수 없다"' },
        ];

        const startIdx = (tipIndex * 3) % tips.length;
        const visibleTips = [0, 1, 2].map(i => tips[(startIdx + i) % tips.length]);

        return (
            <div className="min-h-screen bg-white flex items-center justify-center p-6">
                <div className="text-center max-w-sm">
                    <div className="w-48 h-1.5 bg-gray-200 rounded-full mx-auto mb-6 overflow-hidden">
                        <div className="h-full bg-blue-500 rounded-full transition-all duration-300 ease-out"
                            style={{ width: `${progress}%` }} />
                    </div>
                    <div className="space-y-3">
                        {visibleTips.map((tip, i) => (
                            <div key={`${tipIndex}-${i}`} className="text-sm leading-relaxed animate-fade-in">
                                <span className="mr-2">{tip.emoji}</span>
                                <span className="text-gray-700">{tip.text}</span>
                            </div>
                        ))}
                    </div>
                    <div className="text-gray-400 text-xs mt-4">시장 데이터 불러오는 중...</div>
                </div>
            </div>
        );
    }

    if (error) {
        return (
            <div className="min-h-screen bg-white flex items-center justify-center p-4">
                <div className="text-center max-w-md">
                    <div className="text-6xl mb-4">⚠️</div>
                    <h2 className="text-xl font-bold text-gray-800 mb-2">데이터 로드 실패</h2>
                    <p className="text-gray-600 mb-4">{error}</p>
                    <button
                        onClick={() => window.location.reload()}
                        className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600"
                    >
                        다시 시도
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-white pb-20">
            {/* 헤더 */}
            <div className="sticky top-0 bg-white border-b border-gray-200 z-10">
                <div className="px-4 py-3">
                    <div className="flex items-center justify-between mb-3">
                        {selectedSector ? (
                            <>
                                <button
                                    onClick={handleBack}
                                    className="flex items-center gap-2 text-blue-500 hover:text-blue-600"
                                >
                                    <span>←</span>
                                    <span>뒤로</span>
                                </button>
                                <h1 className="text-lg font-bold text-gray-800">{selectedSector.name}</h1>
                                <div className="w-16"></div>
                            </>
                        ) : (
                            <>
                                <h1 className="text-xl font-bold text-gray-800">🗺️ 시장 지도</h1>
                                <div className="text-sm text-gray-500">
                                    {sectors.length}개 섹터
                                </div>
                            </>
                        )}
                    </div>

                    {!selectedSector && (
                        <>
                            <input
                                type="text"
                                placeholder="섹터 또는 종목 검색..."
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                className="w-full px-4 py-2 bg-gray-50 border border-gray-300 rounded-lg text-gray-800 placeholder-gray-400 focus:outline-none focus:border-blue-500 mb-3"
                            />

                            <div className="flex gap-2">
                                <select
                                    value={filter}
                                    onChange={(e) => setFilter(e.target.value)}
                                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:border-blue-500"
                                >
                                    <option value="all">전체</option>
                                    <option value="up">상승만</option>
                                    <option value="down">하락만</option>
                                </select>

                                <select
                                    value={sortBy}
                                    onChange={(e) => setSortBy(e.target.value)}
                                    className="flex-1 px-3 py-2 bg-gray-50 border border-gray-300 rounded-lg text-sm text-gray-800 focus:outline-none focus:border-blue-500"
                                >
                                    <option value="marketCap">시가총액순</option>
                                    <option value="change">등락률순</option>
                                </select>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* 메인 컨텐츠 */}
            {selectedSector ? (
                <div className="p-4">
                    <div className="mb-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex items-center justify-between mb-2">
                            <div className="text-lg font-bold text-gray-800">{selectedSector.name}</div>
                            <div className={`text-lg font-bold ${selectedSector.avgChangePercent >= 0 ? 'text-red-500' : 'text-blue-500'
                                }`}>
                                {selectedSector.avgChangePercent >= 0 ? '+' : ''}
                                {selectedSector.avgChangePercent.toFixed(2)}%
                            </div>
                        </div>
                        <div className="text-sm text-gray-500">
                            종목 수: {selectedSector.stocks.length}개
                        </div>
                    </div>

                    <div className="space-y-2">
                        {selectedSector.stocks.map((stock) => (
                            <div
                                key={stock.ticker}
                                onClick={() => handleStockClick(stock.name)}
                                className="p-4 bg-white border border-gray-200 rounded-lg hover:bg-gray-50 cursor-pointer transition-colors"
                            >
                                <div className="flex items-center justify-between mb-2">
                                    <div>
                                        <div className="font-bold text-gray-800">{stock.name}</div>
                                        <div className="text-sm text-gray-500">{stock.ticker}</div>
                                    </div>
                                    <div className="text-right">
                                        <div className="font-bold text-gray-800">
                                            {stock.price.toLocaleString()}원
                                        </div>
                                        <div className={`text-sm font-medium ${stock.changePercent >= 0 ? 'text-red-500' : 'text-blue-500'
                                            }`}>
                                            {stock.changePercent >= 0 ? '+' : ''}
                                            {stock.changePercent.toFixed(2)}%
                                        </div>
                                    </div>
                                </div>
                                <div className="flex items-center justify-between text-xs text-gray-400">
                                    <div>
                                        거래량: {(stock.volume / 1000000).toFixed(1)}M
                                    </div>
                                    <div>
                                        시총: {(stock.marketCap / 1_000_000_000_000).toFixed(1)}조
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            ) : (
                <>
                    {sortedSectors.length === 0 ? (
                        <div className="flex flex-col items-center justify-center h-96 text-gray-400">
                            <div className="text-6xl mb-4">🔍</div>
                            <div className="text-lg">검색 결과가 없습니다</div>
                        </div>
                    ) : (
                        <div style={{ width: '100%', height: 'calc(100vh - 200px)' }} className="p-4">
                            <MarketTreemap
                                data={sortedSectors}
                                sortBy={sortBy}
                                onSectorClick={handleSectorClick}
                            />
                        </div>
                    )}

                    <div className="px-4 pb-4">
                        <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
                            <div className="text-sm font-bold text-gray-800 mb-3">색상 범례</div>
                            <div className="flex items-center justify-between text-xs">
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 bg-blue-600 rounded"></div>
                                    <span className="text-gray-600">강한 하락</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 bg-gray-400 rounded"></div>
                                    <span className="text-gray-600">보합</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-4 h-4 bg-red-600 rounded"></div>
                                    <span className="text-gray-600">강한 상승</span>
                                </div>
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}