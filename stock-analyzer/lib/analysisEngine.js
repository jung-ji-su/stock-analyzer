// AI 분석 점수 엔진 (순수 함수). 일봉 데이터를 받아 레이어 점수·확률·기간별 전망을 계산한다.
// 방향·목표가·신뢰도는 여기서 결정하고, LLM 은 근거 설명만 쓴다 (무료 모델의 숫자 환각 방지).

// 가격 반올림·표기: 국내는 원 단위, 미국은 센트(소수 둘째 자리)
export const roundPx = (v, us) => (us ? Math.round(v * 100) / 100 : Math.round(v));
export const fmtPx = (v, us) => (us ? `$${Number(v).toFixed(2)}` : `${Math.round(v).toLocaleString()}원`);

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const r1 = (v) => Math.round(v * 10) / 10;
const lastOf = (arr) => arr.filter((v) => v != null).slice(-1)[0];

// 적중 판정 기준(%)과 거래일 수. lib/evalUtils.js 의 EVAL_BAND 와 같아야 한다.
export const HORIZONS = { daily: { days: 1, band: 1 }, weekly: { days: 5, band: 2 }, monthly: { days: 20, band: 4 } };
// 신호 성격별 기간 가중치: 과열·과매도(되돌림)는 짧게, 추세는 길게 작용한다고 본다
const KIND_WEIGHT = {
  daily: { reversion: 1, trend: 0.5, flow: 1, news: 1 },
  weekly: { reversion: 0.7, trend: 0.8, flow: 0.8, news: 0.7 },
  monthly: { reversion: 0.3, trend: 1, flow: 0.5, news: 0.3 },
};

// ─── 지표 계산 ───────────────────────────────────────────────────────────────
function calcSMA(data, period) {
  return data.map((_, i) => (i < period - 1 ? null : data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period));
}

function calcRSI(closes, period = 14) {
  const n = closes.length;
  const result = new Array(n).fill(null);
  if (n <= period) return result;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss -= changes[i];
  }
  avgGain /= period;
  avgLoss /= period;
  result[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? -changes[i] : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    result[i + 1] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return result;
}

function calcEMA(data, period) {
  const k = 2 / (period + 1);
  let prev = null;
  return data.map((val) => { prev = prev === null ? val : val * k + prev * (1 - k); return prev; });
}

function calcMACD(closes) {
  const ema12 = calcEMA(closes, 12);
  const ema26 = calcEMA(closes, 26);
  const macdLine = ema12.map((v, i) => v - ema26[i]);
  return { macdLine, signal: calcEMA(macdLine, 9) };
}

function calcBollinger(closes, period = 20) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const avg = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + (b - avg) ** 2, 0) / period);
  return { upper: avg + 2 * std, middle: avg, lower: avg - 2 * std, z: std ? (closes[closes.length - 1] - avg) / std : 0 };
}

// 최근 구간의 가격대별 거래량 상위 구간 (매물대)
function calcVolumeProfile(bars, bins = 10, us = false) {
  const prices = bars.map((d) => d.close);
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const binSize = (maxP - minP) / bins;
  if (!(binSize > 0)) return [];
  const profile = Array.from({ length: bins }, (_, i) => ({ priceFrom: roundPx(minP + i * binSize, us), priceTo: roundPx(minP + (i + 1) * binSize, us), volume: 0 }));
  bars.forEach((d) => { profile[Math.min(Math.floor((d.close - minP) / binSize), bins - 1)].volume += d.volume || 0; });
  const top = profile.sort((a, b) => b.volume - a.volume).slice(0, 5);
  const total = top.reduce((a, p) => a + p.volume, 0) || 1;
  return top.map((p) => ({ ...p, strength: Math.round((p.volume / total) * 100) }));
}

function calcATR(bars, period = 14) {
  if (bars.length < period + 1) return 0;
  const tr = bars.slice(1).map((d, i) => Math.max(d.high - d.low, Math.abs(d.high - bars[i].close), Math.abs(d.low - bars[i].close)));
  return tr.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// 장중이면 오늘 봉의 거래량이 아직 덜 찼으므로 하루치로 환산할 비율을 낸다.
// 거래는 장 초반에 몰리므로 시간 진행률을 그대로 쓰지 않고 0.6 제곱한다 (10시 ≈ 하루 거래의 30%)
function sessionFraction(lastTime, us, now) {
  if (typeof lastTime !== 'string') return 1;
  const tz = us ? 'America/New_York' : 'Asia/Seoul';
  const d = new Date(now);
  if (lastTime !== d.toLocaleDateString('sv-SE', { timeZone: tz })) return 1;
  const [h, m] = d.toLocaleTimeString('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: false }).split(':').map(Number);
  const [open, close] = us ? [570, 960] : [540, 930];
  return Math.pow(clamp((h * 60 + m - open) / (close - open), 0.1, 1), 0.6);
}

// 표준정규 누적분포 (Abramowitz–Stegun 근사)
function normCdf(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp((-x * x) / 2);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x > 0 ? 1 - p : p;
}

// ─── 뉴스 감성 (키워드) ──────────────────────────────────────────────────────
// 구문을 먼저 판정하고 지운 뒤 단어를 센다 ("적자 축소", "우려 해소"가 부정으로 잡히지 않게)
const POS_PHRASES = ['흑자 전환', '흑자전환', '적자 축소', '우려 해소', '낙폭 축소', '목표가 상향', '목표주가 상향', '사상 최고', '사상최고', '어닝 서프라이즈', '상승 전환'];
const NEG_PHRASES = ['적자 전환', '적자전환', '적자 확대', '흑자 축소', '목표가 하향', '목표주가 하향', '상승폭 반납', '어닝 쇼크', '하락 전환', '상승 제한', '기대 이하', '기대에 못'];
const POS_WORDS = ['급등', '상승', '호실적', '신고가', '수주', '흑자', '호재', '강세', '돌파', '반등', '개선', '상향'];
const NEG_WORDS = ['급락', '하락', '적자', '신저가', '손실', '부진', '우려', '악재', '약세', '이탈', '악화', '위기', '폭락', '하향', '리콜', '소송', '횡령'];

function scoreNews(newsData, stockName, newsSentiment) {
  const seen = new Set();
  let items = (newsData || []).filter((n) => {
    const key = String(n?.title || '').replace(/\s+/g, '').slice(0, 20);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  // 종목명이 들어간 기사가 3건 이상이면 그 기사만 본다 (시황·타 종목 기사 제외)
  const name = String(stockName || '').trim();
  const related = name ? items.filter((n) => `${n.title} ${n.desc || ''}`.includes(name)) : [];
  if (related.length >= 3) items = related;

  let pos = 0, neg = 0;
  for (const n of items) {
    let text = `${n.title} ${n.desc || ''}`, s = 0;
    for (const p of POS_PHRASES) if (text.includes(p)) { s += 2; text = text.split(p).join(' '); }
    for (const p of NEG_PHRASES) if (text.includes(p)) { s -= 2; text = text.split(p).join(' '); }
    for (const w of POS_WORDS) if (text.includes(w)) s += 1;
    for (const w of NEG_WORDS) if (text.includes(w)) s -= 1;
    if (s > 0) pos++; else if (s < 0) neg++;
  }
  // 긍정·부정 기사 수의 차이 비율. 기사가 적으면(3건 미만) 그만큼 약하게 반영
  let norm = items.length ? ((pos - neg) / Math.max(items.length, 3)) * 10 : 0;
  // 사용자가 뉴스 감성분석(LLM)을 돌렸다면 그 점수(0~100)와 반반 섞는다
  const llm = Number(newsSentiment?.score);
  const hasLlm = Number.isFinite(llm) && llm >= 0 && llm <= 100;
  if (hasLlm) norm = (norm + clamp((llm - 50) / 5, -10, 10)) / 2;
  norm = clamp(norm, -10, 10);

  const signals = [];
  if (items.length) {
    const pts = r1(norm * 0.3);
    const src = hasLlm ? ', AI 감성분석 반영' : '';
    if (norm >= 2) signals.push({ label: `긍정 뉴스 우세 (긍정 ${pos} / 부정 ${neg}${src})`, score: pts, type: 'bullish', kind: 'news', easy: '최근 뉴스 분위기가 좋아요' });
    else if (norm <= -2) signals.push({ label: `부정 뉴스 우세 (부정 ${neg} / 긍정 ${pos}${src})`, score: pts, type: 'bearish', kind: 'news', easy: '최근 뉴스 분위기가 좋지 않아요' });
    else signals.push({ label: `뉴스 혼조 (긍정 ${pos} / 부정 ${neg})`, score: 0, type: 'neutral', kind: 'news', easy: '긍정·부정 뉴스가 섞여 있어요' });
  }
  return { norm, signals, positiveCount: pos, negativeCount: neg, count: items.length };
}

// ─── 메인 ────────────────────────────────────────────────────────────────────
// chartData: 일봉 [{ time:'YYYY-MM-DD', open, high, low, close, volume }] 오름차순
// supplyNet: { dates:['YYYY-MM-DD'], foreigner, institution } 외국인·기관 순매수 수량 합(주) — 국내 종목만
// newsSentiment: { score: 0~100 } 뉴스 감성분석 결과 (있을 때만)
export function runAnalysis({ chartData, newsData, stockName, us = false, supplyNet = null, newsSentiment = null, now = Date.now() }) {
  const bars = chartData.filter((d) => d && d.close > 0);
  const closes = bars.map((d) => d.close);
  const n = closes.length;
  const price = closes[n - 1];
  const prevClose = closes[n - 2];

  // 지표
  const rsi = lastOf(calcRSI(closes));
  const { macdLine, signal } = calcMACD(closes);
  const macd = macdLine[n - 1], macdSig = signal[n - 1], macdHist = macd - macdSig;
  const bb = calcBollinger(closes);
  const ma20 = lastOf(calcSMA(closes, 20));
  const ma60 = lastOf(calcSMA(closes, 60));
  const profileBars = bars.slice(-120);
  const volumeProfile = calcVolumeProfile(profileBars, 10, us);
  const atr = calcATR(bars);
  const atrRatio = price > 0 ? Math.round((atr / price) * 10000) / 100 : 0;

  // 거래량: 직전 20거래일(오늘 제외) 평균 대비, 장중이면 하루치로 환산
  const prevVols = bars.slice(-21, -1).map((d) => d.volume || 0);
  const avgVol = prevVols.length ? prevVols.reduce((a, b) => a + b, 0) / prevVols.length : 0;
  const frac = sessionFraction(bars[n - 1].time, us, now);
  const volumeRatio = avgVol > 0 ? (bars[n - 1].volume || 0) / frac / avgVol : 1;

  // 일간 변동성(%): 최근 20일 수익률 표준편차. 기간별 예상 변동폭의 기준
  const rets = closes.slice(-21).slice(1).map((c, i) => c / closes.slice(-21)[i] - 1);
  const meanRet = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const sigmaD = clamp(Math.sqrt(rets.reduce((a, b) => a + (b - meanRet) ** 2, 0) / (rets.length || 1)) * 100 || atrRatio * 0.8, 0.4, 12);

  const upTrend = ma20 != null && ma60 != null && price > ma20 && ma20 > ma60;
  const downTrend = ma20 != null && ma60 != null && price < ma20 && ma20 < ma60;

  // ── Layer 1: 기술지표 ──
  const tech = [];
  const add = (list, label, score, kind, easy) => list.push({ label, score, type: score > 0 ? 'bullish' : score < 0 ? 'bearish' : 'neutral', kind, easy });

  if (rsi != null) {
    const v = Math.round(rsi);
    if (rsi < 30) downTrend ? add(tech, `RSI ${v} 과매도 (하락 추세 중)`, 2, 'reversion', '많이 떨어졌지만 내려가는 흐름이라 반등을 확인하고 움직이는 게 좋아요')
      : add(tech, `RSI ${v} 과매도`, 4, 'reversion', '주가가 단기간에 많이 떨어져서 반등 가능성이 있어요');
    else if (rsi < 40) downTrend ? add(tech, `RSI ${v} 약세권`, 0, 'reversion', '힘이 약한 구간이에요')
      : add(tech, `RSI ${v} 저점 근접`, 2, 'reversion', '주가가 많이 내려온 편이라 반등 가능성이 있어요');
    else if (rsi > 70) upTrend ? add(tech, `RSI ${v} 과매수 (상승 추세 중)`, -2, 'reversion', '오르는 흐름이지만 단기적으로 뜨거워서 잠깐 쉬어갈 수 있어요')
      : add(tech, `RSI ${v} 과매수`, -4, 'reversion', '주가가 단기간에 많이 올라 과열된 상태예요');
    else if (rsi > 60) upTrend ? add(tech, `RSI ${v} 강세권 (추세 유지)`, 0, 'reversion', '오르는 힘이 유지되고 있어요')
      : add(tech, `RSI ${v} 고점 근접`, -2, 'reversion', '주가가 많이 오른 편이라 쉬어갈 수 있어요');
    else add(tech, `RSI ${v} 중립`, 0, 'reversion', '과열도 침체도 아닌 구간이에요');
  }

  if (n >= 35) {
    if (macdHist > 0 && macd > 0) add(tech, 'MACD 상승 (0선 위 + 시그널 상회)', 4, 'trend', '오르는 힘이 강한 상태예요');
    else if (macdHist > 0) add(tech, 'MACD 시그널 상향 돌파', 2, 'trend', '내리던 힘이 약해지고 오름세로 바뀌려 해요');
    else if (macdHist < 0 && macd < 0) add(tech, 'MACD 하락 (0선 아래 + 시그널 하회)', -4, 'trend', '내리는 힘이 강한 상태예요');
    else if (macdHist < 0) add(tech, 'MACD 시그널 하향 이탈', -2, 'trend', '오르던 힘이 약해지고 있어요');
  }

  if (ma20 != null && ma60 != null) {
    if (upTrend) add(tech, '이평선 정배열 (상승 추세)', 4, 'trend', '최근 평균 가격들이 차례로 올라가는 상승 흐름이에요');
    else if (price > ma20 && price > ma60) add(tech, '주가가 20·60일선 위', 2, 'trend', '평균 가격보다 위에 있어 흐름이 나쁘지 않아요');
    else if (downTrend) add(tech, '이평선 역배열 (하락 추세)', -4, 'trend', '최근 평균 가격들이 차례로 내려가는 하락 흐름이에요');
    else if (price < ma20 && price < ma60) add(tech, '주가가 20·60일선 아래', -2, 'trend', '평균 가격보다 아래에 있어 흐름이 약해요');
    else add(tech, '이평선 혼조', 0, 'trend', '방향이 애매한 구간이에요');
  }

  const bbRange = bb ? bb.upper - bb.lower : 0;
  const bbPos = bbRange > 0 ? ((price - bb.lower) / bbRange) * 100 : 50;
  if (bb) {
    if (bbPos < 10) add(tech, '볼린저밴드 하단', downTrend ? 1 : 3, 'reversion', '평소 움직이는 범위의 아래쪽 끝이라 반등 가능성이 있어요');
    else if (bbPos < 25) add(tech, '볼린저밴드 하단 근접', downTrend ? 0 : 1, 'reversion', '평소 범위의 아래쪽에 있어요');
    else if (bbPos > 90) add(tech, '볼린저밴드 상단', upTrend ? -1 : -3, 'reversion', '평소 움직이는 범위의 위쪽 끝이라 쉬어갈 수 있어요');
    else if (bbPos > 75) add(tech, '볼린저밴드 상단 근접', upTrend ? 0 : -1, 'reversion', '평소 범위의 위쪽에 있어요');
    else add(tech, '볼린저밴드 중간', 0, 'reversion', '평소 범위 안에서 움직이고 있어요');
  }

  if (avgVol > 0 && prevClose) {
    const up = price > prevClose, vr = volumeRatio.toFixed(1);
    const intraday = frac < 1 ? ', 장중 환산' : '';
    if (volumeRatio > 2) add(tech, `거래량 ${vr}배${intraday} + ${up ? '상승' : '하락'}`, up ? 3 : -3, 'flow', up ? '평소보다 훨씬 많은 거래와 함께 오르고 있어요' : '평소보다 훨씬 많은 거래와 함께 내리고 있어요');
    else if (volumeRatio > 1.5) add(tech, `거래량 ${vr}배${intraday} + ${up ? '상승' : '하락'}`, up ? 1 : -1, 'flow', up ? '거래가 늘면서 오르고 있어요' : '거래가 늘면서 내리고 있어요');
    else if (volumeRatio < 0.5) add(tech, `거래량 ${vr}배 (한산)`, 0, 'flow', '거래가 적어서 지금 움직임은 믿기 어려워요');
    else add(tech, '거래량 평소 수준', 0, 'flow', '거래량이 평소와 비슷해요');
  }

  // 매물대: 거래가 가장 많았던 가격대가 바로 아래면 지지, 바로 위면 저항
  const heavy = volumeProfile.slice(0, 3);
  if (heavy.some((p) => p.priceTo <= price && (price - p.priceTo) / price < 0.03)) add(tech, '바로 아래 매물대 지지', 2, 'reversion', '거래가 많았던 가격대가 바로 아래에 있어 버텨 줄 수 있어요');
  if (heavy.some((p) => p.priceFrom >= price && (p.priceFrom - price) / price < 0.03)) add(tech, '바로 위 매물대 저항', -2, 'reversion', '거래가 많았던 가격대가 바로 위에 있어 막힐 수 있어요');

  // ── Layer 2: 퀀트 팩터 ──
  const quant = [];
  // 단기 과열도: 최근 5일 수익률이 평소 변동성의 몇 배인가 (단기 되돌림)
  let heat = 0, ret5 = 0;
  if (n >= 6) {
    ret5 = (price / closes[n - 6] - 1) * 100;
    heat = ret5 / (sigmaD * Math.sqrt(5));
    const lbl = `5일 ${ret5 >= 0 ? '+' : ''}${r1(ret5)}% (평소 변동폭의 ${Math.abs(heat).toFixed(1)}배)`;
    if (heat > 2) add(quant, `${lbl} 단기 급등`, -3, 'reversion', '며칠 사이 평소보다 훨씬 많이 올라 숨 고르기가 나올 수 있어요');
    else if (heat > 1.2) add(quant, `${lbl} 단기 상승 부담`, -1, 'reversion', '며칠 사이 꽤 올라 잠깐 쉬어갈 수 있어요');
    else if (heat < -2) add(quant, `${lbl} 단기 급락`, 3, 'reversion', '며칠 사이 평소보다 훨씬 많이 떨어져 되돌림이 나올 수 있어요');
    else if (heat < -1.2) add(quant, `${lbl} 단기 하락 과다`, 1, 'reversion', '며칠 사이 꽤 떨어져 반등이 나올 수 있어요');
  }

  // 20일 거래량가중 평균가(VWAP) 대비: 최근 매수자들의 평균 단가보다 위인가
  const recent = bars.slice(-20);
  const volSum = recent.reduce((a, d) => a + (d.volume || 0), 0);
  const vwap = volSum > 0 ? recent.reduce((a, d) => a + ((d.high + d.low + d.close) / 3) * (d.volume || 0), 0) / volSum : price;
  const vwapDiff = r1(((price - vwap) / vwap) * 100);
  if (vwapDiff > 1) add(quant, `20일 평균 매수단가 위 (+${vwapDiff}%)`, 1, 'trend', '최근 한 달 산 사람들이 평균적으로 수익 중이라 매도 압력이 적어요');
  else if (vwapDiff < -1) add(quant, `20일 평균 매수단가 아래 (${vwapDiff}%)`, -1, 'trend', '최근 한 달 산 사람들이 평균적으로 손실 중이라 오르면 팔려는 물량이 나올 수 있어요');

  // 모멘텀: 1개월·3개월 수익률
  let momentum = 0;
  if (n >= 21) {
    const m1 = price / closes[n - 21] - 1;
    const m3 = n >= 61 ? price / closes[n - 61] - 1 : m1;
    momentum = r1((m1 * 0.4 + m3 * 0.6) * 100);
    if (momentum > 15) add(quant, `모멘텀 +${momentum}% (강한 상승)`, 3, 'trend', '최근 몇 달간 꾸준히 올라왔어요');
    else if (momentum > 5) add(quant, `모멘텀 +${momentum}%`, 1, 'trend', '최근 상승 흐름이 있어요');
    else if (momentum < -15) add(quant, `모멘텀 ${momentum}% (강한 하락)`, -3, 'trend', '최근 몇 달간 꾸준히 내려왔어요');
    else if (momentum < -5) add(quant, `모멘텀 ${momentum}%`, -1, 'trend', '최근 하락 흐름이 있어요');
    else add(quant, `모멘텀 ${momentum}% (중립)`, 0, 'trend', '뚜렷한 방향 없이 움직이고 있어요');
  }

  // 52주 고점·저점 위치 (약 1년치 일봉이 있을 때만)
  if (n >= 200) {
    const yr = bars.slice(-250);
    const hi = Math.max(...yr.map((d) => d.high || d.close)), lo = Math.min(...yr.map((d) => d.low || d.close));
    if (price >= hi * 0.97) add(quant, '52주 신고가 근접', 2, 'trend', '1년 중 가장 높은 가격 근처예요. 힘이 강한 종목에서 자주 보여요');
    else if (price <= lo * 1.05) add(quant, '52주 신저가 근접', -2, 'trend', '1년 중 가장 낮은 가격 근처예요. 약한 흐름이 이어질 수 있어요');
  }

  // ── Layer 3: 뉴스 ──
  const news = scoreNews(newsData, stockName, newsSentiment);

  // ── Layer 4: 수급 (국내, 데이터가 있을 때만) ──
  let supplyNorm = null;
  const supply = [];
  if (supplyNet && Array.isArray(supplyNet.dates) && supplyNet.dates.length) {
    const dates = new Set(supplyNet.dates);
    const vol = bars.filter((d) => dates.has(d.time)).reduce((a, d) => a + (d.volume || 0), 0);
    const net = (Number(supplyNet.foreigner) || 0) + (Number(supplyNet.institution) || 0);
    if (vol > 0) {
      const ratio = (net / vol) * 100; // 그 기간 거래량 대비 외국인+기관 순매수 비중(%)
      supplyNorm = clamp((ratio / 15) * 10, -10, 10);
      const lbl = `외국인·기관 ${supplyNet.dates.length}일 ${net >= 0 ? '순매수' : '순매도'} (거래량의 ${Math.abs(ratio).toFixed(1)}%)`;
      const pts = r1(supplyNorm * 0.4);
      if (Math.abs(supplyNorm) >= 2) add(supply, lbl, pts, 'flow', net >= 0 ? '큰손(외국인·기관)이 사 모으고 있어요' : '큰손(외국인·기관)이 팔고 있어요');
      else add(supply, `외국인·기관 수급 중립 (거래량의 ${ratio >= 0 ? '+' : ''}${ratio.toFixed(1)}%)`, 0, 'flow', '큰손의 뚜렷한 매수·매도가 없어요');
    }
  }

  // ── 레이어 점수(-10~+10)와 종합 ──
  const sum = (list) => list.reduce((a, s) => a + s.score, 0);
  const techNorm = clamp((sum(tech) / 14) * 10, -10, 10);
  const quantNorm = clamp((sum(quant) / 8) * 10, -10, 10);
  const W = supplyNorm == null ? { tech: 0.35, quant: 0.4, news: 0.25, supply: 0 } : { tech: 0.3, quant: 0.35, news: 0.15, supply: 0.2 };
  const total = techNorm * W.tech + quantNorm * W.quant + news.norm * W.news + (supplyNorm || 0) * W.supply;

  const pBull = 1 / (1 + Math.exp(-0.12 * total));
  const probability = { bullish: Math.round(pBull * 100), bearish: 100 - Math.round(pBull * 100) };

  const allSignals = [...tech, ...quant, ...news.signals, ...supply];
  const bull = allSignals.filter((s) => s.type === 'bullish').length;
  const bear = allSignals.filter((s) => s.type === 'bearish').length;
  const active = bull + bear;
  // 신뢰도: 신호가 한쪽으로 모일수록, 신호 수가 충분할수록, 종합 점수가 클수록 높다
  const agreement = active ? Math.abs(bull - bear) / active : 0;
  const confidence = clamp(Math.round(35 + 25 * agreement * Math.min(1, active / 6) + 30 * Math.min(1, Math.abs(total) / 6) - (sigmaD > 4 ? 10 : sigmaD > 3 ? 5 : 0)), 25, 85);

  const keySignals = allSignals.filter((s) => s.type !== 'neutral').sort((a, b) => Math.abs(b.score) - Math.abs(a.score)).slice(0, 6);

  // ── 기간별 전망: 적중 판정 기준(±band%)에서 상승/횡보/하락 중 확률이 가장 높은 쪽 ──
  const horizons = {};
  for (const [key, { days, band }] of Object.entries(HORIZONS)) {
    const w = KIND_WEIGHT[key];
    const h = clamp(allSignals.reduce((a, s) => a + s.score * (w[s.kind] ?? 1), 0), -10, 10);
    const sigma = sigmaD * Math.sqrt(days);
    const drift = (h / 10) * 0.5 * sigma; // 신호가 최대일 때 기대 수익률을 0.5σ 로 본다
    const pUp = 1 - normCdf((band - drift) / sigma);
    const pDown = normCdf((-band - drift) / sigma);
    const pSide = 1 - pUp - pDown;
    const best = Math.max(pUp, pDown, pSide);
    const prediction = best === pSide ? '횡보' : best === pUp ? '상승' : '하락';
    const move = prediction === '상승' ? Math.max(band * 1.2, drift + 0.5 * sigma)
      : prediction === '하락' ? Math.min(-band * 1.2, drift - 0.5 * sigma)
      : clamp(drift, -band * 0.8, band * 0.8);
    horizons[key] = {
      prediction,
      confidence: clamp(Math.round(best * 100), 34, 85),
      targetPrice: roundPx(price * (1 + move / 100), us),
      lean: h > 1.5 ? '상승 우세' : h < -1.5 ? '하락 우세' : '중립',
      score: r1(h),
      probs: { up: Math.round(pUp * 100), side: Math.round(pSide * 100), down: Math.round(pDown * 100) },
      rangePct: r1(sigma),
      rangeLow: roundPx(price * (1 - sigma / 100), us),
      rangeHigh: roundPx(price * (1 + sigma / 100), us),
    };
  }

  const rd = (v, d = 1) => (v != null && isFinite(v) ? Math.round(v * 10 ** d) / 10 ** d : null);
  const indicators = {
    currentPrice: price,
    rsi: rd(rsi),
    macd: rd(macd, us ? 2 : 1), macdSignal: rd(macdSig, us ? 2 : 1), macdHistogram: rd(macdHist, us ? 2 : 1),
    bbUpper: bb ? roundPx(bb.upper, us) : null, bbMiddle: bb ? roundPx(bb.middle, us) : null, bbLower: bb ? roundPx(bb.lower, us) : null,
    ma20: rd(ma20, us ? 2 : 0), ma60: rd(ma60, us ? 2 : 0),
    volumeRatio: rd(volumeRatio, 2),
    volumeProfile,
    recentPrices: closes.slice(-10),
  };

  const pct = (w) => `${Math.round(w * 100)}%`;
  const scoreBreakdown = {
    tech: { score: r1(techNorm), weight: pct(W.tech), label: '기술지표' },
    quant: { score: r1(quantNorm), weight: pct(W.quant), label: '퀀트팩터' },
    news: { score: r1(news.norm), weight: pct(W.news), label: '뉴스감성' },
    ...(supplyNorm == null ? {} : { supply: { score: r1(supplyNorm), weight: pct(W.supply), label: '수급' } }),
    total: r1(total),
    atr: roundPx(atr, us),
    atrRatio,
  };

  return {
    indicators, scoreBreakdown, probability, confidence, keySignals, allSignals, horizons, news,
    extras: { zScore: bb ? rd(bb.z, 2) : null, bbPos: Math.round(bbPos), vwapDiff, momentum, ret5: r1(ret5), heat: rd(heat, 1), sigmaD: rd(sigmaD, 2), upTrend, downTrend },
  };
}

// ─── 시나리오 (지지·저항 가격) ───────────────────────────────────────────────
export function generateScenarios(indicators, probability, allSignals, us = false) {
  const price = indicators.currentPrice;
  const bbUpper = indicators.bbUpper ?? price * 1.03, bbLower = indicators.bbLower ?? price * 0.97;
  const target1 = roundPx(Math.max(bbUpper, price * 1.03), us);
  const support1 = roundPx(indicators.ma20 != null && indicators.ma20 < price ? Math.max(bbLower, indicators.ma20) : bbLower, us);
  const support2 = roundPx(indicators.ma60 != null && indicators.ma60 < price ? indicators.ma60 : price * 0.94, us);
  return {
    scenarioA: {
      name: '상승 시나리오', probability: probability.bullish,
      conditions: allSignals.filter((s) => s.type === 'bullish').slice(0, 3).map((s) => s.label),
      flow: `${fmtPx(price, us)} → ${fmtPx(target1, us)}`,
      targetRange: { low: roundPx(price * 1.02, us), high: roundPx(price * 1.05, us) },
    },
    scenarioB: {
      name: '하락 시나리오', probability: probability.bearish,
      conditions: allSignals.filter((s) => s.type === 'bearish').slice(0, 3).map((s) => s.label),
      flow: `${fmtPx(support1, us)} 이탈 시 → ${fmtPx(support2, us)}`,
      targetRange: { high: roundPx(price * 0.98, us), low: support2 },
    },
  };
}

// ─── 설명 문구 (AI 응답이 없거나 일부가 빠졌을 때 채우는 기본값) ─────────────
const PERIOD_LABEL = { daily: '내일(1거래일)', weekly: '1주(5거래일)', monthly: '1개월(20거래일)' };
export function buildFallbackTexts(result, us = false) {
  const { horizons, keySignals, scoreBreakdown, probability, confidence, extras } = result;
  const bulls = keySignals.filter((s) => s.type === 'bullish'), bears = keySignals.filter((s) => s.type === 'bearish');
  const out = {};
  for (const key of Object.keys(HORIZONS)) {
    const h = horizons[key];
    const same = h.prediction === '하락' ? bears : h.prediction === '상승' ? bulls : keySignals;
    const opp = h.prediction === '하락' ? bulls : h.prediction === '상승' ? bears : [];
    out[key] = {
      reason: `${PERIOD_LABEL[key]} 기준 상승 ${h.probs.up}% · 횡보 ${h.probs.side}% · 하락 ${h.probs.down}%로 '${h.prediction}' 가능성이 가장 높습니다. ${same.slice(0, 2).map((s) => s.label).join(', ') || '뚜렷한 신호가 없어 평소 변동폭 기준으로 판단'}${opp[0] ? `. 반대 신호: ${opp[0].label}` : ''}. 예상 변동폭 ±${h.rangePct}%.`,
      easyReason: (same[0]?.easy || '뚜렷한 신호가 없어 평소처럼 움직일 가능성이 높아요') + (h.prediction === '횡보' ? `. 이 기간에는 ±${HORIZONS[key].band}% 안에서 움직일 가능성이 가장 높아요.` : ''),
    };
  }
  const lean = probability.bullish >= 55 ? '상승 쪽이 조금 우세' : probability.bullish <= 45 ? '하락 쪽이 조금 우세' : '방향이 뚜렷하지 않은 상태';
  return {
    ...out,
    summary: `종합 ${scoreBreakdown.total}점(−10~+10)으로 ${lean}입니다. 긍정 신호 ${bulls.length}개, 부정 신호 ${bears.length}개이며 일간 변동성은 약 ${extras.sigmaD}%입니다.`,
    easySummary: `여러 신호를 모아 보면 ${lean}예요. ${keySignals[0]?.easy || ''}`.trim(),
    keyPoints: keySignals.slice(0, 3).map((s) => s.label),
    quantInsight: `종합 ${scoreBreakdown.total}점, 상승 확률 ${probability.bullish}%, 신뢰도 ${confidence}%. ${keySignals[0] ? `가장 큰 신호는 "${keySignals[0].label}"입니다.` : '뚜렷한 신호가 없습니다.'}`,
    riskWarning: `하루 평균 ±${extras.sigmaD}% 정도 움직이는 종목입니다. ${bears[0] ? `"${bears[0].label}" 신호에 유의하세요.` : '예상과 반대로 움직일 수 있으니 분할 매매를 고려하세요.'}`,
    indicatorComments: {},
  };
}
