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

// 예측 적중 판정
export function judgeResult(prediction, analyzedPrice, evalPrice) {
  if (!evalPrice || !analyzedPrice) return 'pending';
  const changeRate = (evalPrice - analyzedPrice) / analyzedPrice * 100;

  if (prediction === '상승') return changeRate > 1 ? 'hit' : 'miss';
  if (prediction === '하락') return changeRate < -1 ? 'hit' : 'miss';
  if (prediction === '횡보') return Math.abs(changeRate) <= 2 ? 'hit' : 'miss';
  return 'miss';
}

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
      const status = h[key]?.evalStatus;
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