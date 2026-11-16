// 기술적 지표 공통 계산 (순수 함수). 분석 엔진·딥분석·스캐너가 같이 쓴다.
// 배열을 돌려주는 함수는 입력과 길이가 같고, 계산할 수 없는 앞부분은 null.

export const last = (arr) => (arr?.length ? arr[arr.length - 1] : null);

// 단순이동평균
export function sma(data, period) {
  return data.map((_, i) => (i < period - 1 ? null : data.slice(i - period + 1, i + 1).reduce((a, b) => a + b, 0) / period));
}

// 지수이동평균 (첫 값에서 시작). null 은 그대로 null
export function ema(data, period) {
  const k = 2 / (period + 1);
  let prev = null;
  return data.map((v) => {
    if (v === null) return null;
    prev = prev === null ? v : v * k + prev * (1 - k);
    return prev;
  });
}

// RSI (Wilder 방식: 첫 period 개 변화량의 단순 평균에서 시작해 1/period 로 평활)
export function rsi(closes, period = 14) {
  const n = closes.length;
  const out = new Array(n).fill(null);
  if (n <= period) return out;
  const changes = closes.slice(1).map((c, i) => c - closes[i]);
  let avgGain = 0, avgLoss = 0;
  for (let i = 0; i < period; i++) {
    if (changes[i] > 0) avgGain += changes[i];
    else avgLoss -= changes[i];
  }
  avgGain /= period;
  avgLoss /= period;
  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  for (let i = period; i < changes.length; i++) {
    const gain = changes[i] > 0 ? changes[i] : 0;
    const loss = changes[i] < 0 ? -changes[i] : 0;
    avgGain = (avgGain * (period - 1) + gain) / period;
    avgLoss = (avgLoss * (period - 1) + loss) / period;
    out[i + 1] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }
  return out;
}

// MACD(12, 26, 9): { macdLine, signal } 배열
export function macd(closes) {
  const e12 = ema(closes, 12), e26 = ema(closes, 26);
  const macdLine = e12.map((v, i) => (v !== null && e26[i] !== null ? v - e26[i] : null));
  const sig = ema(macdLine.filter((v) => v !== null), 9);
  let j = 0;
  return { macdLine, signal: macdLine.map((v) => (v === null ? null : sig[j++] ?? null)) };
}

// 최근 period 일 볼린저밴드(±2σ, 모표준편차). 데이터가 모자라면 null
export function bollinger(closes, period = 20, k = 2) {
  if (closes.length < period) return null;
  const slice = closes.slice(-period);
  const avg = slice.reduce((a, b) => a + b, 0) / period;
  const std = Math.sqrt(slice.reduce((a, b) => a + (b - avg) ** 2, 0) / period);
  return { upper: avg + k * std, middle: avg, lower: avg - k * std, std, z: std ? (last(closes) - avg) / std : 0 };
}

// 평균 진폭(ATR): 최근 period 일 True Range 의 단순 평균. 데이터가 모자라면 0
export function atr(bars, period = 14) {
  if (bars.length < period + 1) return 0;
  const tr = bars.slice(1).map((d, i) => Math.max(d.high - d.low, Math.abs(d.high - bars[i].close), Math.abs(d.low - bars[i].close)));
  return tr.slice(-period).reduce((a, b) => a + b, 0) / period;
}

// OBV(누적 거래량) 배열
export function obv(bars) {
  let acc = 0;
  return bars.map((d, i) => {
    if (i === 0) return 0;
    if (d.close > bars[i - 1].close) acc += d.volume;
    else if (d.close < bars[i - 1].close) acc -= d.volume;
    return acc;
  });
}

// 매물대: 가격 구간(bins 개)별 거래량 상위 5 구간과 비중(%). 가격 폭이 없으면 빈 배열. us 면 센트 단위로 반올림
export function volumeProfile(bars, bins = 10, us = false) {
  const rp = (v) => (us ? Math.round(v * 100) / 100 : Math.round(v));
  const prices = bars.map((d) => d.close);
  const minP = Math.min(...prices), maxP = Math.max(...prices);
  const binSize = (maxP - minP) / bins;
  if (!(binSize > 0)) return [];
  const profile = Array.from({ length: bins }, (_, i) => ({ priceFrom: rp(minP + i * binSize), priceTo: rp(minP + (i + 1) * binSize), volume: 0 }));
  bars.forEach((d) => { profile[Math.min(Math.floor((d.close - minP) / binSize), bins - 1)].volume += d.volume || 0; });
  const top = profile.sort((a, b) => b.volume - a.volume).slice(0, 5);
  const total = top.reduce((a, p) => a + p.volume, 0) || 1;
  return top.map((p) => ({ ...p, strength: Math.round((p.volume / total) * 100) }));
}
