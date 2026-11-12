// 허용 목록(GET 전용). 위에서부터 먼저 맞는 규칙이 적용된다.
// ttl: 캐시 초, account: X-Tossinvest-Account 자동 첨부 여부.
// group 이름/TPS 는 토스 문서의 그룹별 제한(요청 TPS)을 따른다.
export const TPS = {
  ACCOUNT: 1, ASSET: 5, TRANSACTION: 5, STOCK: 5, STOCK_ALL: 1,
  STOCK_TRADING_TREND: 10, ORDER_HISTORY: 5, MARKET_INFO: 3, MARKET_DATA: 15, MARKET_DATA_CHART: 20,
  RANKING: 5, MARKET_INDICATOR_PRICE: 10, MARKET_INDICATOR: 10,
  MARKET_INDICATOR_CHART: 5, SECTOR: 5, SECTOR_RANKING: 5,
};

const V = '^/api/v1';
export const RULES = [
  { re: `${V}/accounts$`, group: 'ACCOUNT', ttl: 300 },
  { re: `${V}/holdings$`, group: 'ASSET', ttl: 3, account: true },
  { re: `${V}/transactions$`, group: 'TRANSACTION', ttl: 10, account: true },
  { re: `${V}/prices$`, group: 'MARKET_DATA', ttl: 1 },
  { re: `${V}/candles$`, group: 'MARKET_DATA_CHART', ttl: 5 },
  { re: `${V}/stocks/all$`, group: 'STOCK_ALL', ttl: 3600 },
  { re: `${V}/stocks/[^/]+/(investor-trading|program-trades|short-selling|credit-trades|securities-lending)$`, group: 'STOCK_TRADING_TREND', ttl: 60 },
  { re: `${V}/(orderbook|trades|price-limits)$`, group: 'MARKET_DATA', ttl: 1 },
  // 주문 내역 조회(읽기 전용). 주문 생성/정정/취소(POST)는 server.js 에서 항상 차단
  { re: `${V}/orders(/[^/]+)?$`, group: 'ORDER_HISTORY', ttl: 2, account: true },
  { re: `${V}/stocks(/[^/]+/warnings)?$`, group: 'STOCK', ttl: 300 },
  { re: `${V}/(exchange-rate|market-calendar/(KR|US))$`, group: 'MARKET_INFO', ttl: 60 },
  { re: `${V}/rankings(/investor-trading)?$`, group: 'RANKING', ttl: 5 },
  { re: `${V}/market-indicators/prices$`, group: 'MARKET_INDICATOR_PRICE', ttl: 2 },
  { re: `${V}/market-indicators/[^/]+/candles$`, group: 'MARKET_INDICATOR_CHART', ttl: 10 },
  { re: `${V}/market-indicators/[^/]+/investor-trading$`, group: 'MARKET_INDICATOR', ttl: 60 },
  { re: `${V}/sectors/rankings$`, group: 'SECTOR_RANKING', ttl: 10 },
  { re: `${V}/sectors(/[^/]+(/(stocks|etfs))?)?$`, group: 'SECTOR', ttl: 60 },
].map((r) => ({ ...r, re: new RegExp(r.re) }));

export const match = (path) => RULES.find((r) => r.re.test(path)) || null;
