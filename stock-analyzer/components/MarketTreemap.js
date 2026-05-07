'use client';

import { useState, useEffect } from 'react';

// 등락률에 따른 색상 (11단계)
function getColor(changePercent) {
  if (changePercent > 5)  return '#991b1b';
  if (changePercent > 3)  return '#b91c1c';
  if (changePercent > 2)  return '#dc2626';
  if (changePercent > 1)  return '#ef4444';
  if (changePercent > 0)  return '#f87171';
  if (changePercent === 0) return '#6b7280';
  if (changePercent > -1) return '#93c5fd';
  if (changePercent > -2) return '#60a5fa';
  if (changePercent > -3) return '#3b82f6';
  if (changePercent > -5) return '#2563eb';
  return '#1d4ed8';
}

// 시가총액 포맷
function formatMarketCap(value) {
  if (value >= 1_000_000_000_000) return `${(value / 1_000_000_000_000).toFixed(1)}조`;
  if (value >= 100_000_000_000)   return `${(value / 100_000_000_000).toFixed(0)}천억`;
  return `${(value / 100_000_000).toFixed(0)}억`;
}

// ============================================================
// 재귀 분할 트리맵 — 빈 공간 없이 100% 채움
// ============================================================
function treemapLayout(items, x, y, w, h) {
  if (items.length === 0) return [];
  if (items.length === 1) {
    return [{ ...items[0], x, y, width: w, height: h }];
  }

  const total = items.reduce((s, i) => s + i.value, 0);

  // 전체 값의 ~절반 지점에서 분할
  let acc = 0;
  let splitIdx = 1;
  for (let i = 0; i < items.length - 1; i++) {
    acc += items[i].value;
    if (acc >= total * 0.45) {
      splitIdx = i + 1;
      break;
    }
  }

  const left  = items.slice(0, splitIdx);
  const right = items.slice(splitIdx);
  const leftTotal  = left.reduce((s, i) => s + i.value, 0);
  const leftRatio  = leftTotal / total;

  if (w >= h) {
    return [
      ...treemapLayout(left,  x,                y, w * leftRatio,       h),
      ...treemapLayout(right, x + w * leftRatio, y, w * (1 - leftRatio), h),
    ];
  } else {
    return [
      ...treemapLayout(left,  x, y,                w, h * leftRatio),
      ...treemapLayout(right, x, y + h * leftRatio, w, h * (1 - leftRatio)),
    ];
  }
}

export default function MarketTreemap({ data, sortBy = 'marketCap', onSectorClick }) {
  const [hoveredSector, setHoveredSector] = useState(null);
  const [layout, setLayout] = useState([]);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // 컨테이너 크기 감지
  useEffect(() => {
    const update = () => {
      const el = document.getElementById('treemap-container');
      if (el) {
        const { width, height } = el.getBoundingClientRect();
        if (width > 0 && height > 0) setContainerSize({ width, height });
      }
    };
    update();
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);

  // 레이아웃 계산
  useEffect(() => {
    if (data.length === 0 || containerSize.width === 0) return;

    const totalMarketCap = data.reduce((s, d) => s + d.totalMarketCap, 0);

    const processed = data.map(sector => {
      const ratio = sector.totalMarketCap / totalMarketCap;
      let value;

      if (sortBy === 'change') {
        // 등락률순: 등락률 절대값 기준 크기 (최소값 보장)
        value = Math.max(Math.abs(sector.avgChangePercent), 0.3);
      } else {
        // 시가총액순: 제곱근 적용
        value = Math.pow(ratio, 0.4);
      }

      return { ...sector, originalRatio: ratio, value };
    }).sort((a, b) => b.value - a.value);

    const result = treemapLayout(processed, 0, 0, containerSize.width, containerSize.height);
    setLayout(result);
  }, [data, containerSize, sortBy]);

  return (
    <div
      id="treemap-container"
      className="w-full h-full rounded-lg overflow-hidden relative"
      style={{ background: '#e5e7eb' }}
    >
      {layout.map((sector, i) => {
        const bgColor = getColor(sector.avgChangePercent);
        const area = sector.width * sector.height;

        // 면적에 비례한 폰트 크기
        const nameSize  = Math.max(9,  Math.min(18, Math.sqrt(area) / 7));
        const statSize  = Math.max(8,  Math.min(14, Math.sqrt(area) / 9));
        const showStats = sector.height > 36 && sector.width > 50;

        return (
          <div
            key={i}
            onClick={() => onSectorClick?.(sector)}
            onMouseEnter={() => setHoveredSector(sector)}
            onMouseLeave={() => setHoveredSector(null)}
            className="absolute cursor-pointer hover:brightness-110 transition-all flex flex-col justify-center items-center text-white overflow-hidden"
            style={{
              left:   `${sector.x}px`,
              top:    `${sector.y}px`,
              width:  `${sector.width}px`,
              height: `${sector.height}px`,
              backgroundColor: bgColor,
              border: '1px solid rgba(255,255,255,0.3)',
            }}
          >
            <div className="text-center px-1 leading-tight">
              <div className="font-bold" style={{ fontSize: `${nameSize}px` }}>
                {sector.name}
              </div>
              {showStats && (
                <>
                  <div className="font-semibold" style={{ fontSize: `${statSize}px`, marginTop: 2 }}>
                    {sector.avgChangePercent >= 0 ? '+' : ''}
                    {sector.avgChangePercent.toFixed(2)}%
                  </div>
                  <div style={{ fontSize: `${statSize - 1}px`, opacity: 0.9, marginTop: 1 }}>
                    {formatMarketCap(sector.totalMarketCap)}
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })}

      {/* 호버 툴팁 */}
      {hoveredSector && (
        <div className="absolute bottom-3 right-3 bg-gray-900 rounded-lg p-3 shadow-xl pointer-events-none z-10 max-w-xs border border-gray-700">
          <div className="text-white font-bold mb-1">{hoveredSector.name}</div>
          <div className="text-sm space-y-0.5">
            <div className={hoveredSector.avgChangePercent >= 0 ? 'text-red-400' : 'text-blue-400'}>
              {hoveredSector.avgChangePercent >= 0 ? '+' : ''}
              {hoveredSector.avgChangePercent.toFixed(2)}%
            </div>
            <div className="text-gray-300">
              시가총액: {formatMarketCap(hoveredSector.totalMarketCap)}
            </div>
            <div className="text-gray-500 text-xs">
              비율: {(hoveredSector.originalRatio * 100).toFixed(1)}%
              · {hoveredSector.stocks?.length || 0}종목
            </div>
          </div>
        </div>
      )}
    </div>
  );
}