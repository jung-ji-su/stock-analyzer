import YahooFinance from 'yahoo-finance2';
import { getMarketSuffix } from '@/lib/krx-cache';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const yf = new YahooFinance({ suppressNotices: ['yahooSurvey'] });

const NAVER_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  'Referer': 'https://finance.naver.com',
  'Accept-Language': 'ko-KR,ko;q=0.9',
};

// ─── INDICATOR FUNCTIONS ─────────────────────────────────────────────────────

function calcSMA(data, period) {
  return data.map((_, i) => {
    if (i < period - 1) return null;
    return data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period;
  });
}

function calcEMA(data, period) {
  const k = 2 / (period + 1);
  const ema = [];
  let prev = null;
  for (const v of data) {
    if (v === null) { ema.push(null); continue; }
    prev = prev === null ? v : v * k + prev * (1 - k);
    ema.push(prev);
  }
  return ema;
}

function calcRSI(closes, period = 14) {
  const n = closes.length;
  const result = new Array(n).fill(null);
  if (n <= period) return result;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  // 첫 RSI: 첫 period개 변화량의 단순 평균 (Wilder 초기값)
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss -= changes[i];
  }
  avgGain /= period;
  avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  // 이후: Wilder's Smoothing (alpha = 1/period)
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? -changes[i] : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i + 1] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function calcMACD(closes) {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = ema12.map((v, i) => (v !== null && ema26[i] !== null) ? v - ema26[i] : null);
  const validMacd = macdLine.filter(v => v !== null);
  const signalRaw = calcEMA(validMacd, 9);
  let sigIdx = 0;
  const signal = macdLine.map(v => v === null ? null : (signalRaw[sigIdx++] ?? null));
  return { macdLine, signal };
}

function calcBB(closes, period = 20) {
  const sma = calcSMA(closes, period);
  return sma.map((avg, i) => {
    if (avg === null) return null;
    const slice = closes.slice(i - period + 1, i + 1);
    const std = Math.sqrt(slice.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / period);
    return { upper: avg + 2 * std, middle: avg, lower: avg - 2 * std };
  });
}

function calcATR(data, period = 14) {
  if (data.length < period + 1) return 0;
  const trs = data.slice(1).map((d, i) => Math.max(
    d.high - d.low,
    Math.abs(d.high - data[i].close),
    Math.abs(d.low - data[i].close)
  ));
  return trs.slice(-period).reduce((a, b) => a + b, 0) / period;
}

function calcOBV(data) {
  let obv = 0;
  return data.map((d, i) => {
    if (i === 0) return 0;
    if (d.close > data[i - 1].close) obv += d.volume;
    else if (d.close < data[i - 1].close) obv -= d.volume;
    return obv;
  });
}

function calcStochRSI(closes, period = 14) {
  const rsi = calcRSI(closes, period).filter(v => v !== null);
  return rsi.map((r, i) => {
    if (i < period - 1) return null;
    const slice = rsi.slice(i - period + 1, i + 1);
    const min = Math.min(...slice);
    const max = Math.max(...slice);
    return max === min ? 50 : Math.round(((r - min) / (max - min)) * 1000) / 10;
  });
}

function calcIchimoku(data) {
  const n = data.length;
  if (n < 78) return null; // 선행스팬 shift 포함: 52 + 26 = 78 최소
  const hi = (arr) => Math.max(...arr.map(d => d.high));
  const lo = (arr) => Math.min(...arr.map(d => d.low));
  // 전환선 / 기준선: 현재 기준
  const tenkan = (hi(data.slice(n - 9, n)) + lo(data.slice(n - 9, n))) / 2;
  const kijun  = (hi(data.slice(n - 26, n)) + lo(data.slice(n - 26, n))) / 2;
  // 선행스팬 A, B: 오늘 보이는 구름대는 26거래일 전에 계산된 값 (Shift 반영)
  const ref = n - 26;
  const refTenkan = (hi(data.slice(ref - 9, ref)) + lo(data.slice(ref - 9, ref))) / 2;
  const refKijun  = (hi(data.slice(ref - 26, ref)) + lo(data.slice(ref - 26, ref))) / 2;
  const spanA = (refTenkan + refKijun) / 2;
  const spanB = (hi(data.slice(ref - 52, ref)) + lo(data.slice(ref - 52, ref))) / 2;
  return { tenkan, kijun, spanA, spanB };
}

function calcMDD(closes) {
  let peak = closes[0], mdd = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    const dd = (peak - c) / peak;
    if (dd > mdd) mdd = dd;
  }
  return Math.round(mdd * 1000) / 10;
}

function calcBeta(stockReturns, marketReturns) {
  const n = Math.min(stockReturns.length, marketReturns.length);
  if (n < 20) return null;
  const r = stockReturns.slice(-n), m = marketReturns.slice(-n);
  const rMean = r.reduce((a, b) => a + b, 0) / n;
  const mMean = m.reduce((a, b) => a + b, 0) / n;
  const cov = r.reduce((a, v, i) => a + (v - rMean) * (m[i] - mMean), 0) / n;
  const mVar = m.reduce((a, v) => a + Math.pow(v - mMean, 2), 0) / n;
  return mVar === 0 ? null : Math.round((cov / mVar) * 100) / 100;
}

function calcFibonacci(high52, low52, currentPrice) {
  const range = high52 - low52;
  const ratios = [0, 0.236, 0.382, 0.5, 0.618, 0.786, 1.0];
  const levels = ratios.map(r => ({ ratio: r, label: `${(r * 100).toFixed(1)}%`, price: Math.round(high52 - range * r) }));
  const nearest = levels.reduce((prev, curr) =>
    Math.abs(curr.price - currentPrice) < Math.abs(prev.price - currentPrice) ? curr : prev
  );
  return { levels, nearest };
}

function calcPivot(data) {
  const recent20 = data.slice(-20);
  const high = Math.max(...recent20.map(d => d.high));
  const low = Math.min(...recent20.map(d => d.low));
  const close = data[data.length - 1].close;
  const pivot = (high + low + close) / 3;
  return {
    r2: Math.round(pivot + (high - low)),
    r1: Math.round(2 * pivot - low),
    pivot: Math.round(pivot),
    s1: Math.round(2 * pivot - high),
    s2: Math.round(pivot - (high - low)),
  };
}

// ─── DATA FETCHING ───────────────────────────────────────────────────────────

async function fetchYearChart(code) {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);

  const suffix = await getMarketSuffix(code);
  const formatData = (quotes) => (quotes || [])
    .filter(d => d.open && d.high && d.low && d.close && d.volume)
    .map(d => ({ date: d.date.toISOString().slice(0, 10), open: d.open, high: d.high, low: d.low, close: d.close, volume: d.volume }));

  if (suffix) {
    try {
      const result = await yf.chart(`${code}.${suffix}`, { period1: start, period2: end, interval: '1d' });
      if (result?.quotes?.length) return formatData(result.quotes);
    } catch (e) {
      console.error(`fetchYearChart ${code}.${suffix} failed:`, e.message);
    }
  }

  // fallback: trial-and-error
  let result;
  try {
    result = await yf.chart(`${code}.KS`, { period1: start, period2: end, interval: '1d' });
    if (!result?.quotes?.length) throw new Error('empty KS');
  } catch {
    result = await yf.chart(`${code}.KQ`, { period1: start, period2: end, interval: '1d' });
  }
  return formatData(result?.quotes);
}

async function fetchMarketYear(code) {
  const end = new Date();
  const start = new Date();
  start.setFullYear(start.getFullYear() - 1);
  // KOSDAQ 종목이면 KOSDAQ 지수(^KQ11)로 베타 계산 → 시장 민감도 정확도 향상
  const suffix = await getMarketSuffix(code);
  const indexSymbol = suffix === 'KQ' ? '^KQ11' : '^KS11';
  const result = await yf.chart(indexSymbol, { period1: start, period2: end, interval: '1d' });
  return (result?.quotes || []).filter(d => d.close).map(d => d.close);
}

async function fetchBasicInfo(code) {
  const res = await fetch(`https://m.stock.naver.com/api/stock/${code}/basic`, {
    headers: { 'User-Agent': 'Mozilla/5.0', 'Referer': 'https://m.stock.naver.com', 'Accept': 'application/json' },
  });
  return await res.json();
}

async function fetchInvestorFlow20d(code) {
  // sise_investor.naver: Naver Finance AJAX 엔드포인트 (서버사이드 렌더링)
  // investor.naver는 JS 동적 로딩이라 fetch()로 데이터 못 가져옴
  try {
    const res = await fetch(
      `https://finance.naver.com/item/sise_investor.naver?code=${code}&page=1`,
      { headers: NAVER_HEADERS }
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buffer = await res.arrayBuffer();
    const { default: iconv } = await import('iconv-lite');
    const html = iconv.decode(Buffer.from(buffer), 'EUC-KR');
    const { load } = await import('cheerio');
    const $ = load(html);

    const parseVal = (el) => {
      const raw = $(el).text().trim().replace(/,/g, '').replace(/\s/g, '');
      if (!raw || raw === '-' || raw === '') return 0;
      const n = parseInt(raw, 10);
      return isNaN(n) ? 0 : n;
    };

    const rows = [];
    $('tr').each((_, tr) => {
      const tds = $(tr).find('td');
      if (tds.length < 4) return;
      const date = $(tds[0]).text().trim();
      if (!date.match(/\d{4}\.\d{2}\.\d{2}/)) return;
      rows.push({
        date,
        individual: parseVal(tds[1]),
        foreign: parseVal(tds[2]),
        institution: parseVal(tds[3]),
      });
    });

    if (rows.length === 0) throw new Error('0 rows — endpoint may not carry this data');

    const last20 = rows.slice(0, 20);
    const sum = (key) => last20.reduce((a, r) => a + r[key], 0);
    const foreignTotal = sum('foreign');
    const institutionTotal = sum('institution');
    const individualTotal = sum('individual');
    const consecForeignBuy = (() => { let c = 0; for (const r of last20) { if (r.foreign > 0) c++; else break; } return c; })();
    const consecForeignSell = (() => { let c = 0; for (const r of last20) { if (r.foreign < 0) c++; else break; } return c; })();
    return {
      days: last20.slice(0, 10),
      foreignTotal, institutionTotal, individualTotal,
      foreignTrend: foreignTotal > 0 ? '순매수' : '순매도',
      institutionTrend: institutionTotal > 0 ? '순매수' : '순매도',
      consecForeignBuy, consecForeignSell,
    };
  } catch (e) {
    console.error('[investor-flow] failed:', e.message);
    return {
      dataUnavailable: true,
      days: [], foreignTotal: 0, institutionTotal: 0, individualTotal: 0,
      foreignTrend: '조회 불가', institutionTrend: '조회 불가',
      consecForeignBuy: 0, consecForeignSell: 0,
    };
  }
}

async function fetchNews(name) {
  try {
    const query = encodeURIComponent(`${name} 주가`);
    const res = await fetch(
      `https://openapi.naver.com/v1/search/news.json?query=${query}&display=10&sort=date`,
      { headers: { 'X-Naver-Client-Id': process.env.NAVER_CLIENT_ID, 'X-Naver-Client-Secret': process.env.NAVER_CLIENT_SECRET } }
    );
    const data = await res.json();
    const cutoff = Date.now() - 7 * 24 * 3600 * 1000;
    return (data.items || [])
      .filter(item => new Date(item.pubDate).getTime() > cutoff)
      .map(item => ({
        title: item.title.replace(/<[^>]*>/g, ''),
        link: item.originallink || item.link,
        date: new Date(item.pubDate).toLocaleDateString('ko-KR', { month: 'numeric', day: 'numeric' }),
      }));
  } catch (e) {
    console.error('news failed:', e.message);
    return [];
  }
}

async function fetchFundamentals(code) {
  try {
    let summary;
    try {
      summary = await yf.quoteSummary(`${code}.KS`, { modules: ['defaultKeyStatistics', 'financialData', 'summaryDetail'] });
    } catch {
      summary = await yf.quoteSummary(`${code}.KQ`, { modules: ['defaultKeyStatistics', 'financialData', 'summaryDetail'] });
    }
    const ks = summary.defaultKeyStatistics || {};
    const fd = summary.financialData || {};
    const sd = summary.summaryDetail || {};
    return {
      per: sd.trailingPE ? sd.trailingPE.toFixed(1) : null,
      forwardPer: sd.forwardPE ? sd.forwardPE.toFixed(1) : null,
      pbr: ks.priceToBook ? ks.priceToBook.toFixed(2) : null,
      roe: fd.returnOnEquity ? (fd.returnOnEquity * 100).toFixed(1) + '%' : null,
      debtRatio: fd.debtToEquity ? fd.debtToEquity.toFixed(0) + '%' : null,
      revenueGrowth: fd.revenueGrowth ? (fd.revenueGrowth * 100).toFixed(1) + '%' : null,
      operatingMargin: fd.operatingMargins ? (fd.operatingMargins * 100).toFixed(1) + '%' : null,
    };
  } catch (e) {
    console.error('fundamentals failed:', e.message);
    return {};
  }
}

// ─── PROMPT BUILDER ──────────────────────────────────────────────────────────

function buildPrompt({ name, code, basicInfo, ind, investorFlow, news, fundamentals, beta }) {
  const price = basicInfo.closePrice || ind.currentPrice;
  const changeStr = basicInfo.compareToPreviousClosePrice
    ? `${basicInfo.compareToPreviousClosePrice > 0 ? '+' : ''}${basicInfo.compareToPreviousClosePrice}원 (${basicInfo.fluctuationsRatio}%)`
    : '';

  const fib = ind.fibonacci;
  const ich = ind.ichimoku;
  const ichStr = ich
    ? `전환선 ${ich.tenkan.toLocaleString()}원 / 기준선 ${ich.kijun.toLocaleString()}원 / 선행스팬A ${ich.spanA.toLocaleString()}원 / 선행스팬B ${ich.spanB.toLocaleString()}원\n  구름대 성격: ${ich.spanA > ich.spanB ? '양운(강세)' : '음운(약세)'} | 가격 위치: ${ind.priceVsCloud}`
    : '데이터 부족 (1년 미만)';

  return `당신은 수석 퀀트 투자 분석가이자 기술적 분석 전문가입니다.
아래 데이터를 바탕으로 ${name}(${code})에 대한 통합 투자 전략 리포트를 작성하세요.
투자 판단 책임은 사용자에게 있으므로 최대한 확신 있는 어조로 논리적 결론을 제시하세요.

== 현재 시장 데이터 ==
현재가: ${Number(price).toLocaleString()}원 ${changeStr}
52주 최고가: ${ind.high52.toLocaleString()}원 | 52주 최저가: ${ind.low52.toLocaleString()}원
52주 고점 대비: ${ind.fromHigh52}% | 52주 저점 대비: +${ind.fromLow52}%

== Step1: 기술적 지표 (1년 일봉 기준) ==
[이동평균]
MA5: ${ind.ma5?.toLocaleString()}원 | MA20: ${ind.ma20?.toLocaleString()}원 | MA60: ${ind.ma60?.toLocaleString()}원
MA120: ${ind.ma120?.toLocaleString() ?? 'N/A'}원 | MA200: ${ind.ma200?.toLocaleString() ?? 'N/A'}원
배열 상태: ${ind.maAlignment}

[모멘텀 지표]
RSI(14): ${ind.rsi} ${ind.rsi < 30 ? '← 과매도 구간' : ind.rsi > 70 ? '← 과매수 구간' : ''}
Stochastic RSI: ${ind.stochRsi}
MACD: ${ind.macd} | Signal: ${ind.macdSignal} | Histogram: ${ind.macdHistogram > 0 ? '+' : ''}${ind.macdHistogram}

[볼린저밴드 (20일, 2σ)]
상단: ${ind.bbUpper?.toLocaleString()}원 | 중간: ${ind.bbMiddle?.toLocaleString()}원 | 하단: ${ind.bbLower?.toLocaleString()}원
현재가 위치: ${ind.bbPosition}% (0%=하단이탈, 100%=상단이탈)

[일목균형표]
${ichStr}

[거래량 & 기타]
OBV 추이 (20일): ${ind.obvTrend}
ATR(14): ${ind.atr?.toLocaleString()}원 (${ind.atrPct}%) - 일일 변동성
1년 최대낙폭(MDD): -${ind.mdd}%
베타 vs KOSPI: ${beta ?? 'N/A'}

[수익률]
1개월: ${ind.return1m}% | 3개월: ${ind.return3m}% | 6개월: ${ind.return6m}% | 12개월: ${ind.return12m}%

[피보나치 되돌림 (52주 고/저 기준)]
23.6%: ${fib?.levels[1]?.price?.toLocaleString()}원 | 38.2%: ${fib?.levels[2]?.price?.toLocaleString()}원
50.0%: ${fib?.levels[3]?.price?.toLocaleString()}원 | 61.8%: ${fib?.levels[4]?.price?.toLocaleString()}원
현재가 근접 구간: ${fib?.nearest?.label} (${fib?.nearest?.price?.toLocaleString()}원)

[피벗 지지/저항 (최근 20일 기준)]
R2: ${ind.pivot.r2?.toLocaleString()}원 | R1: ${ind.pivot.r1?.toLocaleString()}원 | Pivot: ${ind.pivot.pivot?.toLocaleString()}원
S1: ${ind.pivot.s1?.toLocaleString()}원 | S2: ${ind.pivot.s2?.toLocaleString()}원

== Step1.5: 수급 분석 (최근 20거래일) ==
외국인 순매수: ${investorFlow.foreignTotal?.toLocaleString()}주 (${investorFlow.foreignTrend})
  - 연속 순매수: ${investorFlow.consecForeignBuy}일 | 연속 순매도: ${investorFlow.consecForeignSell}일
기관 순매수: ${investorFlow.institutionTotal?.toLocaleString()}주 (${investorFlow.institutionTrend})
개인 순매수: ${investorFlow.individualTotal?.toLocaleString()}주

== Step2: 뉴스 & 공시 (최근 7일, ${news.length}건) ==
${news.slice(0, 8).map((n, i) => `${i + 1}. [${n.date}] ${n.title}`).join('\n') || '최근 뉴스 없음'}

== 재무 데이터 ==
PER: ${fundamentals.per ?? 'N/A'} | Forward PER: ${fundamentals.forwardPer ?? 'N/A'} | PBR: ${fundamentals.pbr ?? 'N/A'}
ROE: ${fundamentals.roe ?? 'N/A'} | 부채비율: ${fundamentals.debtRatio ?? 'N/A'} | 영업이익률: ${fundamentals.operatingMargin ?? 'N/A'}
매출성장률: ${fundamentals.revenueGrowth ?? 'N/A'}

== 작성 지침 ==
1. [목표가 / 손절가 규칙 — 반드시 준수]
- 매수/강한매수 의견: targetPrice는 현재가(${Number(price).toLocaleString()}원)보다 반드시 높아야 하며, 피벗 저항선(R1·R2)이나 피보나치 되돌림 레벨을 근거로 설정하세요. stopLoss는 반드시 현재가보다 낮아야 하며, 볼린저밴드 하단·S1 지지선을 참고하세요.
- 매도/강한매도 의견: targetPrice는 현재가보다 반드시 낮아야 하며, 피벗 지지선(S1·S2)이나 피보나치 되돌림 레벨을 근거로 설정하세요. stopLoss는 반드시 현재가보다 높아야 하며, R1·볼린저밴드 상단을 참고하세요.
- 중립 의견: targetPrice와 stopLoss 모두 피벗 포인트 기반으로 설정하세요.

2. 각 분석 섹션(technicalAnalysis, supplyDemandAnalysis, newsSentiment)은 지표를 단순 나열하지 말고, 지표 간 상관관계와 시사점 중심으로 서술하세요.

3. proprietaryAnalysis 필드는 독자적 연계 인사이트를 요구합니다. 베타 지수를 통한 시장 민감도 대비 수급 유입, RSI 와일더 평활화 기반 과매도 이탈과 OBV 매집의 다이버전스, 피보나치 레벨과 볼린저밴드 수렴 등 데이터 간의 복합적인 연계 인사이트를 3-4문장으로 서술하세요. 단순 지표 나열은 금지합니다.

다음 JSON 형식으로 정확하게만 응답하세요 (JSON 외 텍스트 없이):

{
  "overallRating": "강한매수 또는 매수 또는 중립 또는 매도 또는 강한매도",
  "confidenceScore": 숫자(0-100),
  "technicalAnalysis": {
    "rating": "bullish 또는 bearish 또는 neutral",
    "summary": "3-4문장 핵심 기술적 분석",
    "keySignals": ["신호1", "신호2", "신호3", "신호4"]
  },
  "supplyDemandAnalysis": {
    "rating": "bullish 또는 bearish 또는 neutral",
    "summary": "2-3문장 수급 분석",
    "keySignals": ["신호1", "신호2", "신호3"]
  },
  "newsSentiment": {
    "rating": "bullish 또는 bearish 또는 neutral",
    "score": 숫자(1-10),
    "summary": "2-3문장 뉴스/공시 분석",
    "keyHeadlines": ["핵심헤드라인1", "핵심헤드라인2"]
  },
  "proprietaryAnalysis": {
    "title": "분석 제목 (예: 'VWAP 기반 기관 매집 패턴 감지')",
    "summary": "AI 독자적 인사이트 3-4문장. 베타, OBV, 피보나치, 수급-기술적 복합 신호 등 독자적 관점 제시",
    "keySignals": ["인사이트1", "인사이트2", "인사이트3"]
  },
  "finalVerdict": {
    "direction": "상승 또는 하락 또는 횡보",
    "reasoning": "4-5문장. 위 4가지 분석을 통합한 최종 판단 근거",
    "week1": {
      "scenario": "향후 1주일 예상 시나리오 2-3문장",
      "targetHigh": 숫자(원),
      "targetLow": 숫자(원)
    },
    "month1": {
      "scenario": "향후 1개월 예상 시나리오 2-3문장",
      "targetHigh": 숫자(원),
      "targetLow": 숫자(원)
    },
    "targetPrice": 숫자(원, 상승 시 목표가),
    "stopLoss": 숫자(원, 손절가),
    "riskLevel": "낮음 또는 중간 또는 높음 또는 매우높음"
  }
}`;
}

// ─── AI CALL ─────────────────────────────────────────────────────────────────

async function callAI(prompt) {
  const MODELS = [
    'google/gemini-2.0-flash-001',
    'google/gemini-1.5-flash',
    'google/gemini-1.5-flash-8b',
  ];

  for (const model of MODELS) {
    try {
      const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENROUTER_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model,
          messages: [
            { role: 'system', content: '당신은 세계 최고 수준의 수석 퀀트 투자 분석가이자 기술적 분석 전문가입니다. 제공된 시장 데이터를 종합적, 유기적으로 분석하여 정교한 전략을 도출해야 합니다. 반드시 제시된 구조의 순수 JSON 포맷으로만 응답해야 하며, 그 외의 주석이나 설명 텍스트를 JSON 앞뒤에 절대 포함하지 마세요.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 2500,
          response_format: { type: 'json_object' },
        }),
      });
      const data = await res.json();
      if (data.error) {
        console.error(`[deep-analysis] model ${model} error:`, JSON.stringify(data.error));
        continue;
      }
      let text = data.choices?.[0]?.message?.content?.trim();
      if (!text) {
        console.error(`[deep-analysis] model ${model} empty response:`, JSON.stringify(data));
        continue;
      }
      text = text.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/, '').trim();
      return JSON.parse(text);
    } catch (e) {
      console.error(`[deep-analysis] model ${model} threw:`, e.message);
    }
  }
  throw new Error('모든 AI 모델 응답 실패');
}

// ─── MAIN HANDLER ─────────────────────────────────────────────────────────────

export async function GET(request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get('code');
  const name = searchParams.get('name') || code;

  if (!code) return Response.json({ error: '종목 코드 없음' }, { status: 400 });

  try {
    const [chartData, basicInfo, investorFlow, news, fundamentals, marketCloses] = await Promise.all([
      fetchYearChart(code),
      fetchBasicInfo(code).catch(() => ({})),
      fetchInvestorFlow20d(code),
      fetchNews(name),
      fetchFundamentals(code),
      fetchMarketYear(code).catch(() => []),
    ]);

    if (!chartData.length) throw new Error('차트 데이터를 가져올 수 없습니다');

    const closes = chartData.map(d => d.close);
    const n = closes.length;
    const currentPrice = closes[n - 1];

    // Calculate all indicators
    const sma5arr = calcSMA(closes, 5);
    const sma20arr = calcSMA(closes, 20);
    const sma60arr = calcSMA(closes, 60);
    const sma120arr = calcSMA(closes, 120);
    const sma200arr = calcSMA(closes, 200);
    const rsiArr = calcRSI(closes);
    const stochArr = calcStochRSI(closes);
    const { macdLine, signal: macdSig } = calcMACD(closes);
    const bbArr = calcBB(closes);
    const obvArr = calcOBV(chartData);
    const ichimoku = calcIchimoku(chartData);

    const ma5 = Math.round(sma5arr[n - 1] ?? currentPrice);
    const ma20 = Math.round(sma20arr[n - 1] ?? currentPrice);
    const ma60 = Math.round(sma60arr[n - 1] ?? currentPrice);
    const ma120 = sma120arr[n - 1] ? Math.round(sma120arr[n - 1]) : null;
    const ma200 = sma200arr[n - 1] ? Math.round(sma200arr[n - 1]) : null;
    const rsi = Math.round((rsiArr[n - 1] ?? 50) * 10) / 10;
    const stochRsiArr = stochArr.filter(v => v !== null);
    const stochRsi = stochRsiArr[stochRsiArr.length - 1] ?? 50;
    const macd = Math.round((macdLine[n - 1] ?? 0) * 100) / 100;
    const macdSignal = Math.round((macdSig[n - 1] ?? 0) * 100) / 100;
    const macdHistogram = Math.round((macd - macdSignal) * 100) / 100;
    const bb = bbArr[n - 1];
    const bbUpper = bb ? Math.round(bb.upper) : 0;
    const bbMiddle = bb ? Math.round(bb.middle) : 0;
    const bbLower = bb ? Math.round(bb.lower) : 0;
    const bbPosition = bbUpper > bbLower ? Math.round(((currentPrice - bbLower) / (bbUpper - bbLower)) * 100) : 50;

    const obvMid = Math.floor(obvArr.length / 2);
    const obvTrend = obvArr[obvArr.length - 1] > obvArr[obvMid] ? '상승 (매집 우세)' : '하락 (분산 우세)';

    let maAlignment;
    if (currentPrice > ma5 && ma5 > ma20 && ma20 > ma60) maAlignment = '완전 정배열 (강한 상승추세)';
    else if (currentPrice < ma5 && ma5 < ma20 && ma20 < ma60) maAlignment = '완전 역배열 (강한 하락추세)';
    else if (currentPrice > ma20 && currentPrice > ma60) maAlignment = '단기 정배열 (상승추세)';
    else if (currentPrice < ma20 && currentPrice < ma60) maAlignment = '단기 역배열 (하락추세)';
    else maAlignment = '혼조 (방향 불분명)';

    let priceVsCloud = '데이터 부족';
    if (ichimoku) {
      const cloudTop = Math.max(ichimoku.spanA, ichimoku.spanB);
      const cloudBot = Math.min(ichimoku.spanA, ichimoku.spanB);
      if (currentPrice > cloudTop) priceVsCloud = '구름대 위 (강세)';
      else if (currentPrice < cloudBot) priceVsCloud = '구름대 아래 (약세)';
      else priceVsCloud = '구름대 안 (횡보/전환)';
    }

    const high52 = Math.max(...chartData.map(d => d.high));
    const low52 = Math.min(...chartData.map(d => d.low));
    const fromHigh52 = Math.round(((currentPrice - high52) / high52) * 1000) / 10;
    const fromLow52 = Math.round(((currentPrice - low52) / low52) * 1000) / 10;

    const ret = (days) => {
      const idx = Math.max(0, n - 1 - days);
      return Math.round(((currentPrice - closes[idx]) / closes[idx]) * 1000) / 10;
    };

    const atr = Math.round(calcATR(chartData));
    const atrPct = Math.round((atr / currentPrice) * 1000) / 10;
    const mdd = calcMDD(closes);
    const pivot = calcPivot(chartData);
    const fibonacci = calcFibonacci(high52, low52, currentPrice);

    const stockReturns = closes.slice(1).map((c, i) => (c - closes[i]) / closes[i]);
    const marketReturns = marketCloses.slice(1).map((c, i) => (c - marketCloses[i]) / marketCloses[i]);
    const beta = calcBeta(stockReturns, marketReturns);

    const ind = {
      currentPrice, high52, low52, fromHigh52, fromLow52,
      ma5, ma20, ma60, ma120, ma200, maAlignment,
      rsi, stochRsi, macd, macdSignal, macdHistogram,
      bbUpper, bbMiddle, bbLower, bbPosition,
      obvTrend, ichimoku: ichimoku ? {
        tenkan: Math.round(ichimoku.tenkan), kijun: Math.round(ichimoku.kijun),
        spanA: Math.round(ichimoku.spanA), spanB: Math.round(ichimoku.spanB),
      } : null,
      priceVsCloud, atr, atrPct, mdd, pivot, fibonacci,
      return1m: ret(20), return3m: ret(60), return6m: ret(120), return12m: ret(245),
    };

    const prompt = buildPrompt({ name, code, basicInfo, ind, investorFlow, news, fundamentals, beta });
    const report = await callAI(prompt);

    // 목표가/손절가 논리적 일관성 검증
    if (report.finalVerdict && ind.currentPrice) {
      const v = report.finalVerdict;
      const curr = ind.currentPrice;
      const isBull = ['강한매수', '매수'].includes(report.overallRating);
      const isBear = ['강한매도', '매도'].includes(report.overallRating);
      if (isBull) {
        if (v.targetPrice && v.targetPrice <= curr) v.targetPrice = Math.round(curr * 1.10);
        if (v.stopLoss && v.stopLoss >= curr) v.stopLoss = Math.round(curr * 0.93);
      }
      if (isBear) {
        if (v.targetPrice && v.targetPrice >= curr) v.targetPrice = Math.round(curr * 0.90);
        if (v.stopLoss && v.stopLoss <= curr) v.stopLoss = Math.round(curr * 1.07);
      }
    }

    return Response.json({ report, indicators: ind, investorFlow, news, fundamentals, beta, basicInfo });
  } catch (error) {
    console.error('deep-analysis error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
}
