'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import MarketTreemap from '@/components/MarketTreemap';

export default function MarketMapPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [sectors, setSectors] = useState([]);
  const [selectedSector, setSelectedSector] = useState(null);
  const [filter, setFilter] = useState('all'); // all, up, down
  const [sortBy, setSortBy] = useState('marketCap'); // marketCap, change
  const [searchQuery, setSearchQuery] = useState('');
  
  // 데이터 로드
  useEffect(() => {
    async function fetchData() {
      try {
        setLoading(true);
        const response = await fetch('/api/market-overview?limit=30');
        const result = await response.json();
        
        if (result.success) {
          setSectors(result.data);
        }
      } catch (error) {
        console.error('Failed to load market data:', error);
      } finally {
        setLoading(false);
      }
    }
    
    fetchData();
    
    // 5분마다 자동 갱신
    const interval = setInterval(fetchData, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);
  
  // 필터링된 섹터 데이터
  const filteredSectors = sectors.filter(sector => {
    // 검색어 필터
    if (searchQuery) {
      const query = searchQuery.toLowerCase();
      const matchSector = sector.name.toLowerCase().includes(query);
      const matchStock = sector.stocks.some(s => 
        s.name.toLowerCase().includes(query) || 
        s.ticker.toLowerCase().includes(query)
      );
      if (!matchSector && !matchStock) return false;
    }
    
    // 등락 필터
    if (filter === 'up' && sector.avgChangePercent <= 0) return false;
    if (filter === 'down' && sector.avgChangePercent >= 0) return false;
    
    return true;
  });
  
  // 정렬
  const sortedSectors = [...filteredSectors].sort((a, b) => {
    if (sortBy === 'marketCap') {
      return b.totalMarketCap - a.totalMarketCap;
    } else if (sortBy === 'change') {
      return b.avgChangePercent - a.avgChangePercent;
    }
    return 0;
  });
  
  // 섹터 클릭 시 드릴다운
  const handleSectorClick = (sector) => {
    setSelectedSector(sector);
  };
  
  // 뒤로가기
  const handleBack = () => {
    setSelectedSector(null);
  };
  
  // 종목 클릭 시 메인 페이지로 이동
  const handleStockClick = (ticker) => {
    router.push(`/?ticker=${ticker}`);
  };
  
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-950 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <div className="text-gray-400">시장 데이터 로딩 중...</div>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-950 text-white pb-20">
      {/* 헤더 */}
      <div className="sticky top-0 bg-gray-900 border-b border-gray-800 z-10">
        <div className="px-4 py-3">
          <div className="flex items-center justify-between mb-3">
            {selectedSector ? (
              <>
                <button
                  onClick={handleBack}
                  className="flex items-center gap-2 text-blue-400 hover:text-blue-300"
                >
                  <span>←</span>
                  <span>뒤로</span>
                </button>
                <h1 className="text-lg font-bold">{selectedSector.name}</h1>
                <div className="w-16"></div>
              </>
            ) : (
              <>
                <h1 className="text-xl font-bold">🗺️ 시장 지도</h1>
                <div className="text-sm text-gray-400">
                  {sectors.length}개 섹터
                </div>
              </>
            )}
          </div>
          
          {!selectedSector && (
            <>
              {/* 검색 */}
              <input
                type="text"
                placeholder="섹터 또는 종목 검색..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full px-4 py-2 bg-gray-800 border border-gray-700 rounded-lg text-white placeholder-gray-500 focus:outline-none focus:border-blue-500 mb-3"
              />
              
              {/* 필터 & 정렬 */}
              <div className="flex gap-2">
                <select
                  value={filter}
                  onChange={(e) => setFilter(e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
                >
                  <option value="all">전체</option>
                  <option value="up">상승만</option>
                  <option value="down">하락만</option>
                </select>
                
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value)}
                  className="flex-1 px-3 py-2 bg-gray-800 border border-gray-700 rounded-lg text-sm focus:outline-none focus:border-blue-500"
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
        // 드릴다운 뷰: 종목 리스트
        <div className="p-4">
          <div className="mb-4 p-4 bg-gray-800 rounded-lg">
            <div className="flex items-center justify-between mb-2">
              <div className="text-lg font-bold">{selectedSector.name}</div>
              <div className={`text-lg font-bold ${
                selectedSector.avgChangePercent >= 0 ? 'text-red-400' : 'text-blue-400'
              }`}>
                {selectedSector.avgChangePercent >= 0 ? '+' : ''}
                {selectedSector.avgChangePercent.toFixed(2)}%
              </div>
            </div>
            <div className="text-sm text-gray-400">
              종목 수: {selectedSector.stocks.length}개
            </div>
          </div>
          
          <div className="space-y-2">
            {selectedSector.stocks.map((stock) => (
              <div
                key={stock.ticker}
                onClick={() => handleStockClick(stock.ticker)}
                className="p-4 bg-gray-800 rounded-lg hover:bg-gray-750 cursor-pointer transition-colors"
              >
                <div className="flex items-center justify-between mb-2">
                  <div>
                    <div className="font-bold">{stock.name}</div>
                    <div className="text-sm text-gray-400">{stock.ticker}</div>
                  </div>
                  <div className="text-right">
                    <div className="font-bold">
                      {stock.price.toLocaleString()}원
                    </div>
                    <div className={`text-sm font-medium ${
                      stock.changePercent >= 0 ? 'text-red-400' : 'text-blue-400'
                    }`}>
                      {stock.changePercent >= 0 ? '+' : ''}
                      {stock.changePercent.toFixed(2)}%
                    </div>
                  </div>
                </div>
                <div className="flex items-center justify-between text-xs text-gray-500">
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
        // 트리맵 뷰
        <>
          {sortedSectors.length === 0 ? (
            <div className="flex items-center justify-center h-96 text-gray-500">
              검색 결과가 없습니다
            </div>
          ) : (
            <div className="h-[calc(100vh-180px)] p-4">
              <MarketTreemap 
                data={sortedSectors} 
                onSectorClick={handleSectorClick}
              />
            </div>
          )}
          
          {/* 범례 */}
          <div className="px-4 pb-4">
            <div className="bg-gray-800 rounded-lg p-4">
              <div className="text-sm font-bold mb-3">색상 범례</div>
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-blue-600 rounded"></div>
                  <span className="text-gray-400">강한 하락</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-gray-600 rounded"></div>
                  <span className="text-gray-400">보합</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-4 h-4 bg-red-600 rounded"></div>
                  <span className="text-gray-400">강한 상승</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}