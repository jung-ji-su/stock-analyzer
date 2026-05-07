'use client';

import { Treemap, ResponsiveContainer, Tooltip } from 'recharts';

// 등락률에 따른 색상 계산
function getColor(changePercent) {
  if (changePercent > 3) return '#dc2626'; // 강한 상승 (빨강)
  if (changePercent > 1) return '#ef4444';
  if (changePercent > 0) return '#f87171';
  if (changePercent === 0) return '#6b7280'; // 보합 (회색)
  if (changePercent > -1) return '#60a5fa';
  if (changePercent > -3) return '#3b82f6';
  return '#2563eb'; // 강한 하락 (파랑)
}

// 시가총액 포맷팅
function formatMarketCap(value) {
  if (value >= 1_000_000_000_000) {
    return `${(value / 1_000_000_000_000).toFixed(1)}조`;
  }
  if (value >= 100_000_000_000) {
    return `${(value / 100_000_000_000).toFixed(0)}천억`;
  }
  return `${(value / 100_000_000).toFixed(0)}억`;
}

// 커스텀 트리맵 셀
function CustomizedContent({ 
  x, 
  y, 
  width, 
  height, 
  name, 
  changePercent, 
  totalMarketCap,
  depth,
  onClick 
}) {
  if (width < 10 || height < 10) return null;
  
  const color = getColor(changePercent);
  const fontSize = Math.max(width / 10, 12);
  const showDetails = width > 80 && height > 40;
  
  return (
    <g onClick={onClick} style={{ cursor: 'pointer' }}>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={color}
        stroke="#fff"
        strokeWidth={2}
        opacity={0.9}
        rx={4}
      />
      <text
        x={x + width / 2}
        y={y + height / 2 - (showDetails ? 10 : 0)}
        textAnchor="middle"
        fill="#fff"
        fontSize={fontSize}
        fontWeight="bold"
      >
        {name}
      </text>
      {showDetails && (
        <>
          <text
            x={x + width / 2}
            y={y + height / 2 + 10}
            textAnchor="middle"
            fill="#fff"
            fontSize={fontSize * 0.7}
          >
            {changePercent >= 0 ? '+' : ''}{changePercent.toFixed(2)}%
          </text>
          <text
            x={x + width / 2}
            y={y + height / 2 + 25}
            textAnchor="middle"
            fill="#fff"
            fontSize={fontSize * 0.6}
            opacity={0.8}
          >
            {formatMarketCap(totalMarketCap)}
          </text>
        </>
      )}
    </g>
  );
}

// 커스텀 툴팁
function CustomTooltip({ active, payload }) {
  if (!active || !payload || !payload.length) return null;
  
  const data = payload[0].payload;
  
  return (
    <div className="bg-gray-900 border border-gray-700 rounded-lg p-3 shadow-xl">
      <div className="text-white font-bold mb-2">{data.name}</div>
      <div className="text-sm space-y-1">
        <div className={data.changePercent >= 0 ? 'text-red-400' : 'text-blue-400'}>
          등락률: {data.changePercent >= 0 ? '+' : ''}{data.changePercent.toFixed(2)}%
        </div>
        <div className="text-gray-300">
          시가총액: {formatMarketCap(data.totalMarketCap)}
        </div>
        <div className="text-gray-400 text-xs">
          종목 수: {data.stocks?.length || 0}개
        </div>
      </div>
    </div>
  );
}

export default function MarketTreemap({ data, onSectorClick }) {
  // Recharts 트리맵 데이터 형식으로 변환
  const treeData = data.map(sector => ({
    name: sector.name,
    size: sector.totalMarketCap,
    changePercent: sector.avgChangePercent,
    totalMarketCap: sector.totalMarketCap,
    stocks: sector.stocks,
  }));
  
  return (
    <ResponsiveContainer width="100%" height="100%">
      <Treemap
        data={treeData}
        dataKey="size"
        stroke="#fff"
        fill="#8884d8"
        content={
          <CustomizedContent 
            onClick={(data) => {
              if (onSectorClick && data.payload) {
                onSectorClick(data.payload);
              }
            }}
          />
        }
      >
        <Tooltip content={<CustomTooltip />} />
      </Treemap>
    </ResponsiveContainer>
  );
}