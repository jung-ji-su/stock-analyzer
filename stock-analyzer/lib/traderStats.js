// AI 트레이더 성적표: 매매 기록(aiTransactions)과 일별 스냅샷(aiPortfolioHistory)으로 계산한다.
const act = (t) => t.action || t.type;
const num = (v) => { const n = parseFloat(v); return Number.isFinite(n) ? n : null; };
const avg = (a) => (a.length ? a.reduce((s, x) => s + x, 0) / a.length : null);
const r1 = (v) => (v == null ? null : Math.round(v * 10) / 10);

const summarize = (rates) => ({
  n: rates.length,
  winRate: rates.length ? Math.round((rates.filter((r) => r > 0).length / rates.length) * 100) : null,
  avg: r1(avg(rates)),
});

export function calcTraderReport(transactions = [], history = []) {
  const byTime = [...transactions].sort((a, b) => new Date(a.date) - new Date(b.date));
  const buys = byTime.filter((t) => act(t) === 'buy');
  const sells = byTime
    .filter((t) => act(t) === 'sell' && num(t.profitRate) != null)
    .map((t) => {
      // 매수 점수: 이 매도 직전에 같은 종목을 산 기록
      const buy = buys.filter((b) => (b.code ?? b.symbol) === (t.code ?? t.symbol) && new Date(b.date) <= new Date(t.date)).pop();
      return { ...t, rate: num(t.profitRate), buyScore: num(buy?.aiScore) };
    });

  const rates = sells.map((s) => s.rate);
  const wins = rates.filter((r) => r > 0), losses = rates.filter((r) => r <= 0);
  const avgWin = avg(wins), avgLoss = avg(losses);

  const reasons = [
    ['AI 판단 매도', (s) => !String(s.triggerType).startsWith('auto_')],
    ['익절선 도달', (s) => s.triggerType === 'auto_take_profit'],
    ['손절선 도달', (s) => s.triggerType === 'auto_stop_loss'],
  ].map(([label, f]) => ({ label, ...summarize(sells.filter(f).map((s) => s.rate)) }));

  const scores = [['75~84점', 75, 85], ['85점 이상', 85, 101]]
    .map(([label, lo, hi]) => ({ label, ...summarize(sells.filter((s) => s.buyScore != null && s.buyScore >= lo && s.buyScore < hi).map((s) => s.rate)) }));

  // 최대 낙폭: 일별 평가자산이 직전 최고점 대비 가장 많이 떨어진 비율
  let peak = null, mdd = 0;
  for (const h of history) {
    const r = num(h.returnRate);
    if (r == null) continue;
    const eq = 1 + r / 100;
    peak = peak == null ? eq : Math.max(peak, eq);
    mdd = Math.min(mdd, (eq / peak - 1) * 100);
  }

  const sorted = [...sells].sort((a, b) => b.rate - a.rate);
  return {
    sells: sells.length,
    days: history.length,
    mdd: history.length >= 2 ? r1(mdd) : null,
    payoff: avgWin != null && avgLoss ? r1(avgWin / Math.abs(avgLoss)) : null, // 손익비 = 평균 이익 ÷ 평균 손실
    avgWin: r1(avgWin), avgLoss: r1(avgLoss),
    reasons, scores,
    best: sorted[0] || null,
    worst: sorted.length > 1 ? sorted[sorted.length - 1] : null,
  };
}
