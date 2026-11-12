// lib/evalUtils.js

// 영업일 N일 후 날짜 계산 (주말 제외)
export function addBusinessDays(date, days) {
  const result = new Date(date);
  let added = 0;
  while (added < days) {
    result.setDate(result.getDate() + 1);
    const day = result.getDay();
    if (day !== 0 && day !== 6) added++; // 0=일요일, 6=토요일
  }
  return result;
}

// 적중 판정 기준(%): 기간이 길수록 가격이 더 움직이므로 기준도 키운다 (변동폭이 시간의 제곱근에 비례한다고 보고 1일 1% → 5일 2% → 20일 4%로 잡음).
// 한 기준으로 구분한다: 상승 = +기준 초과, 하락 = -기준 미만, 횡보 = ±기준 이내
export const EVAL_BAND = { daily: 1, weekly: 2, monthly: 4 };

export function judgeResult(prediction, analyzedPrice, evalPrice, period = 'daily') {
  if (!evalPrice || !analyzedPrice) return 'pending';
  const band = EVAL_BAND[period] ?? 1;
  const changeRate = (evalPrice - analyzedPrice) / analyzedPrice * 100;

  if (prediction === '상승') return changeRate > band ? 'hit' : 'miss';
  if (prediction === '하락') return changeRate < -band ? 'hit' : 'miss';
  if (prediction === '횡보') return Math.abs(changeRate) <= band ? 'hit' : 'miss';
  return 'miss';
}

const KST = { timeZone: 'Asia/Seoul' };
export const kstDay = (d) => new Date(d).toLocaleDateString('sv-SE', KST); // YYYY-MM-DD (한국 날짜)

// 평가 기준일(due) 이후 첫 거래일의 종가. 아직 마감 전이거나 해당 봉이 없으면 null (대기 유지).
// candles: [{ time:'YYYY-MM-DD', close }] 오름차순.
// 국내: 오늘 봉은 15:40(KST) 이후에만 종가로 인정.
// 미국(us): 봉 날짜는 미국 날짜라서, 그 다음 날 한국시간 07:00(애프터마켓까지 끝난 뒤) 이후에만 인정.
export function evalCloseFor(candles, dueIso, nowMs = Date.now(), us = false) {
  const due = kstDay(dueIso), today = kstDay(nowMs);
  const kstHM = new Date(nowMs).toLocaleTimeString('en-GB', { ...KST, hour: '2-digit', minute: '2-digit', hour12: false });
  const c = (candles || []).find((x) => typeof x.time === 'string' && x.time >= due && x.close > 0);
  if (!c || c.time > today) return null;
  if (us) {
    const next = kstDay(Date.parse(`${c.time}T00:00:00+09:00`) + 24 * 3600e3);
    if (today < next || (today === next && kstHM < '07:00')) return null;
    return c.close;
  }
  if (c.time === today && kstHM < '15:40') return null;
  return c.close;
}

// 미국 티커(영문 1~5자)인지
export const isUsSymbol = (s) => /^[A-Z]{1,5}([.-][A-Z])?$/.test(s || '');

// 적중률 계산
export function calcAccuracy(histories) {
  const result = {
    total: { hit: 0, miss: 0, pending: 0 },
    daily: { hit: 0, miss: 0, pending: 0 },
    weekly: { hit: 0, miss: 0, pending: 0 },
    monthly: { hit: 0, miss: 0, pending: 0 },
  };

  histories.forEach(h => {
    ['daily', 'weekly', 'monthly'].forEach(key => {
      // evalPrice 가 있으면 현재 기준으로 다시 판정한다 (과거 기록도 같은 기준으로 비교)
      const e = h[key];
      if (!e) return; // 해당 기간 예측이 없는 기록(딥분석 등)
      const status = e?.evalPrice ? judgeResult(e.prediction, h.currentPrice, e.evalPrice, key) : e?.evalStatus;
      if (!status || status === 'pending') {
        result[key].pending++;
        result.total.pending++;
      } else if (status === 'hit') {
        result[key].hit++;
        result.total.hit++;
      } else if (status === 'miss') {
        result[key].miss++;
        result.total.miss++;
      }
    });
  });

  const calcRate = (hit, miss) => {
    const total = hit + miss;
    return total > 0 ? Math.round((hit / total) * 100) : null;
  };

  return {
    total: { ...result.total, rate: calcRate(result.total.hit, result.total.miss) },
    daily: { ...result.daily, rate: calcRate(result.daily.hit, result.daily.miss) },
    weekly: { ...result.weekly, rate: calcRate(result.weekly.hit, result.weekly.miss) },
    monthly: { ...result.monthly, rate: calcRate(result.monthly.hit, result.monthly.miss) },
  };
}

// 신뢰도 보정 리포트: 평가가 끝난 예측만 모아, 신뢰도 구간별·방향별 적중률과 "항상 같은 방향으로 찍었다면"의 기준선을 낸다.
export function calcCalibration(histories) {
  const items = [];
  for (const h of histories) {
    for (const period of ['daily', 'weekly', 'monthly']) {
      const e = h[period];
      if (!e?.evalPrice || !h.currentPrice || !e.prediction) continue;
      const conf = Number(e.confidence);
      items.push({
        period, pred: e.prediction, conf: Number.isFinite(conf) ? conf : null,
        hit: judgeResult(e.prediction, h.currentPrice, e.evalPrice, period) === 'hit',
        chg: (e.evalPrice - h.currentPrice) / h.currentPrice * 100,
      });
    }
  }
  const rate = (arr) => (arr.length ? Math.round((arr.filter((x) => x.hit).length / arr.length) * 100) : null);
  const buckets = [['50% 미만', 0, 50], ['50~59%', 50, 60], ['60~69%', 60, 70], ['70% 이상', 70, 101]].map(([label, lo, hi]) => {
    const arr = items.filter((x) => x.conf != null && x.conf >= lo && x.conf < hi);
    return { label, n: arr.length, rate: rate(arr), avgConf: arr.length ? Math.round(arr.reduce((s, x) => s + x.conf, 0) / arr.length) : null };
  });
  const byPred = ['상승', '하락', '횡보'].map((p) => { const arr = items.filter((x) => x.pred === p); return { pred: p, n: arr.length, rate: rate(arr) }; });
  const baseline = ['daily', 'weekly', 'monthly'].map((period) => {
    const arr = items.filter((x) => x.period === period);
    const always = (pred) => rate(arr.map((x) => ({ hit: judgeResult(pred, 100, 100 * (1 + x.chg / 100), period) === 'hit' })));
    return { period, n: arr.length, ai: rate(arr), up: always('상승'), down: always('하락'), sideways: always('횡보') };
  });
  return { total: items.length, buckets, byPred, baseline };
}
